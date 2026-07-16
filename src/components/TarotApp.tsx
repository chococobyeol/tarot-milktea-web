"use client";

import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Share2,
  Shuffle,
  X,
} from "lucide-react";
import { toBlob } from "html-to-image";
import Image from "next/image";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { RadarChart, SignalDistribution } from "@/src/components/ReadingCharts";
import { TurnstileGate, type TurnstileStatus } from "@/src/components/TurnstileGate";
import { QUESTION_EXAMPLES, UI_TEXT, type AppLanguage } from "@/src/lib/i18n";
import {
  ensureAnonymousSession,
  requestInterpretation,
  requestReadingPlan,
  TarotApiError,
  type ApiMode,
} from "@/src/lib/api";
import {
  clearReadings,
  deleteReading,
  listReadings,
  saveReading,
  type SavedReading,
} from "@/src/lib/storage";
import {
  createRecordId,
  createSessionDeck,
  getCard,
  MILK_TEA_IMAGE,
  orientationLabel,
  type DeckCard,
  type FollowupRecord,
  type ReadingPlan,
  type ReadingResult,
  type SelectedCard,
} from "@/src/lib/tarot";

type Phase =
  | "home"
  | "question"
  | "planning"
  | "plan"
  | "shuffling"
  | "selecting"
  | "interpreting"
  | "revealing"
  | "result";
type ResultView = "summary" | "cards" | "analysis";

interface RestorableState {
  phase: Phase;
  question: string;
  activeQuestion: string;
  initialPlan: ReadingPlan | null;
  activePlan: ReadingPlan | null;
  deck: DeckCard[];
  selectedOrders: number[];
  cards: SelectedCard[];
  latestCards: SelectedCard[];
  pendingResult: ReadingResult | null;
  revealCount: number;
  result: ReadingResult | null;
  comparisonResult: ReadingResult | null;
  followups: FollowupRecord[];
  round: number;
  recordId: string;
  apiMode: ApiMode;
}

interface AppNotice {
  id: number;
  message: string;
}

const SESSION_KEY = "tarot-milktea-current-reading";
const NICKNAME_KEY = "tarot-milktea-nickname";
const LANGUAGE_KEY = "tarot-milktea-language";

function localDateStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shuffledDeck(deck: DeckCard[]): DeckCard[] {
  const result = [...deck];
  const random = () => {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 0x1_0000_0000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result.map((card, order) => ({ ...card, order }));
}

function resultText(question: string, result: ReadingResult, language: AppLanguage): string {
  const t = UI_TEXT[language];
  return [
    `[${language === "ko" ? "타로밀크티 웹" : "Tarot Milktea Web"}] ${question}`,
    "",
    result.summary,
    "",
    result.cardInterpretations.map((item) => {
      const card = getCard(item.cardId);
      const direction = orientationLabel(item.orientation === "reversed", language);
      return [
        `${item.positionTitle} · ${language === "ko" ? card.nameKo : card.nameEn} ${direction}`,
        `${t.cardConclusion}: ${item.text}`,
        ...(item.reasoning ? [
          `${t.sourceMeaning}: ${item.reasoning.sourceMeaning}`,
          `${t.questionConnection}: ${item.reasoning.questionConnection}`,
          `${t.decisionImpact}: ${item.reasoning.decisionImpact}`,
        ] : []),
        ...(item.evidence.length > 0 ? [`${t.sourceBasis}: ${item.evidence.join(" · ")}`] : []),
      ].join("\n");
    }).join("\n\n"),
    "",
    `${language === "ko" ? "종합" : "Synthesis"}: ${result.synthesis}`,
    "",
    `${language === "ko" ? "확인할 점" : "Points to check"}\n${result.guidance.map((item) => `- ${item}`).join("\n")}`,
    "",
    result.limitation,
  ].join("\n");
}

function userError(error: unknown, language: AppLanguage = "ko"): string {
  const english = language === "en";
  if (error instanceof TarotApiError) {
    if (error.code === "RATE_LIMITED" || error.code === "NETWORK_RATE_LIMITED") {
      return english ? `Too many requests. Try again in ${error.retryAfter ?? 60} seconds.` : `요청이 많습니다. ${error.retryAfter ?? 60}초 후 다시 시도하세요.`;
    }
    if (error.code === "SESSION_EXPIRED" || error.status === 401) {
      return english ? "The session expired. Complete the bot check and retry." : "세션이 만료되었습니다. 봇 감지 확인 후 다시 시도하세요.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return english ? "The request could not be processed. Try again." : "요청을 처리하지 못했습니다. 다시 시도하세요.";
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some embedded browsers expose Clipboard API but deny it. Use the
      // selection-based fallback before reporting a failure.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

async function waitForExportImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Image load timed out")), 8000);
        const finish = (callback: () => void) => {
          window.clearTimeout(timer);
          image.removeEventListener("load", loaded);
          image.removeEventListener("error", failed);
          callback();
        };
        const loaded = () => finish(resolve);
        const failed = () => finish(() => reject(new Error("Image load failed")));
        image.addEventListener("load", loaded, { once: true });
        image.addEventListener("error", failed, { once: true });
      });
    }
    if (!image.naturalWidth) throw new Error("Image has no drawable content");
    if (image.decode) await image.decode();
  }));
}

function CardImage({ cardId, reversed, language = "ko", alt, eager = false }: { cardId: string; reversed: boolean; language?: AppLanguage; alt?: string; eager?: boolean }) {
  const card = getCard(cardId);
  return (
    <Image
      className={reversed ? "card-art reversed" : "card-art"}
      src={card.imageUrl}
      alt={alt ?? `${language === "ko" ? card.nameKo : card.nameEn} ${orientationLabel(reversed, language)}`}
      width={512}
      height={768}
      loading={eager ? "eager" : undefined}
      unoptimized
    />
  );
}

function CardBack({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "card-back compact" : "card-back"} aria-hidden="true">
      <Image className="card-back-art" src="/cards/card-back.png" alt="" width={512} height={512} unoptimized />
    </span>
  );
}

function GameDialog({
  label = "TAROT MILKTEA / SYSTEM",
  title,
  children,
  actions,
  compact = false,
}: {
  label?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const dialogClassName = [
    "game-dialog",
    compact ? "compact" : "",
    actions ? "has-actions" : "message-only",
  ].filter(Boolean).join(" ");

  return (
    <section className={dialogClassName} aria-live="polite">
      <div className="dialog-copy">
        <span className="dialog-system-mark">TM</span>
        <div>
          <p className="dialog-label">{label}</p>
          <h1>{title}</h1>
          {children}
        </div>
      </div>
      {actions ? <div className="dialog-actions">{actions}</div> : null}
    </section>
  );
}

function ReadingExport({
  nodeRef,
  nickname,
  question,
  result,
  cards,
  language,
}: {
  nodeRef: RefObject<HTMLElement | null>;
  nickname: string;
  question: string;
  result: ReadingResult;
  cards: SelectedCard[];
  language: AppLanguage;
}) {
  const t = UI_TEXT[language];
  const signalLabels = language === "ko"
    ? { support: "지지", caution: "주의", uncertainty: "불확실" }
    : { support: "Support", caution: "Caution", uncertainty: "Uncertainty" };

  return (
    <article className="reading-export" ref={nodeRef} aria-hidden="true">
      <header className="reading-export-header">
        <div>
          <p>TAROT MILKTEA WEB / AI READING</p>
          <h1>{question}</h1>
        </div>
        {nickname ? <span>{nickname}</span> : null}
      </header>

      <section className="reading-export-summary">
        <p className="reading-export-kicker">CORE RESULT</p>
        <h2>{result.summary}</h2>
        <p>{result.synthesis}</p>
      </section>

      <section className="reading-export-guidance">
        <h2>{t.checkPoints}</h2>
        <ol>{result.guidance.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>

      <section className="reading-export-cards">
        <h2>{t.cardReading}</h2>
        {result.cardInterpretations.map((interpretation, index) => {
          const card = getCard(interpretation.cardId);
          const selected = cards.find((candidate) => candidate.cardId === interpretation.cardId);
          const reversed = interpretation.orientation === "reversed";
          return (
            <article className="reading-export-card" key={`${interpretation.cardId}-${index}`}>
              <div className="reading-export-card-image">
                <CardImage cardId={card.id} reversed={reversed} language={language} eager />
              </div>
              <div className="reading-export-card-copy">
                <p className="reading-export-position">{index + 1}. {interpretation.positionTitle}</p>
                <h3>{language === "ko" ? card.nameKo : card.nameEn}<span>{orientationLabel(reversed, language)}</span></h3>
                {selected?.positionFocus ? <p className="reading-export-focus">{selected.positionFocus}</p> : null}
                <section>
                  <h4>{t.cardConclusion}</h4>
                  <p>{interpretation.text}</p>
                </section>
                {interpretation.reasoning ? (
                  <dl>
                    <div><dt>{t.sourceMeaning}</dt><dd>{interpretation.reasoning.sourceMeaning}</dd></div>
                    <div><dt>{t.questionConnection}</dt><dd>{interpretation.reasoning.questionConnection}</dd></div>
                    <div><dt>{t.decisionImpact}</dt><dd>{interpretation.reasoning.decisionImpact}</dd></div>
                  </dl>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="reading-export-metrics">
        <div>
          <h2>{t.signalDistribution}</h2>
          <dl className="reading-export-signals">
            {(Object.keys(signalLabels) as Array<keyof typeof signalLabels>).map((key) => (
              <div key={key}><dt>{signalLabels[key]}</dt><dd>{result.signals[key]}%</dd></div>
            ))}
          </dl>
        </div>
        <div>
          <h2>{t.questionMetrics}</h2>
          <dl className="reading-export-axes">
            {result.axes.map((axis) => (
              <div key={axis.label}>
                <dt>{axis.label}<b>{axis.score}</b></dt>
                <dd>{axis.evidence}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="reading-export-footer">{result.limitation}</footer>
    </article>
  );
}

function progressFor(phase: Phase): number {
  if (phase === "home" || phase === "question") return 0;
  if (phase === "planning" || phase === "plan") return 1;
  if (phase === "shuffling" || phase === "selecting") return 2;
  if (phase === "interpreting" || phase === "revealing") return 3;
  return 4;
}

function holdStage(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function fitTextarea(element: HTMLTextAreaElement | null): void {
  if (!element) return;
  element.style.height = "auto";
  const maxHeight = Number.parseFloat(window.getComputedStyle(element).maxHeight) || 160;
  const borderHeight = element.offsetHeight - element.clientHeight;
  const naturalHeight = element.scrollHeight + borderHeight;
  element.style.height = `${Math.min(naturalHeight, maxHeight)}px`;
  element.style.overflowY = naturalHeight > maxHeight ? "auto" : "hidden";
}

export function TarotApp() {
  const [phase, setPhase] = useState<Phase>("home");
  const [nickname, setNickname] = useState("ㅇㅁ");
  const [question, setQuestion] = useState("");
  const [activeQuestion, setActiveQuestion] = useState("");
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [initialPlan, setInitialPlan] = useState<ReadingPlan | null>(null);
  const [activePlan, setActivePlan] = useState<ReadingPlan | null>(null);
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [cards, setCards] = useState<SelectedCard[]>([]);
  const [latestCards, setLatestCards] = useState<SelectedCard[]>([]);
  const [pendingResult, setPendingResult] = useState<ReadingResult | null>(null);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ReadingResult | null>(null);
  const [followups, setFollowups] = useState<FollowupRecord[]>([]);
  const [round, setRound] = useState(0);
  const [revealCount, setRevealCount] = useState(0);
  const [recordId, setRecordId] = useState(createRecordId);
  const [apiMode, setApiMode] = useState<ApiMode>("local");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [imageExporting, setImageExporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("ko");
  const [history, setHistory] = useState<SavedReading[]>([]);
  const [sessionRefreshNeeded, setSessionRefreshNeeded] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("summary");
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [restored, setRestored] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const exportRef = useRef<HTMLElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const followupInputRef = useRef<HTMLTextAreaElement>(null);
  const noticeIdRef = useRef(0);
  const t = UI_TEXT[language];

  const showNotice = useCallback((message: string) => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, message });
  }, []);

  const handleTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileStatus = useCallback((status: TurnstileStatus) => setTurnstileStatus(status), []);
  const handleSessionRefreshToken = useCallback(async (token: string) => {
    if (!token) return;
    try {
      await ensureAnonymousSession(token);
      setSessionRefreshNeeded(false);
      setError("");
      showNotice(language === "ko" ? "세션을 다시 만들었습니다. 중단된 요청을 다시 실행하세요." : "The session was renewed. Retry the interrupted request.");
    } catch (refreshError) {
      setError(userError(refreshError, language));
    }
  }, [language, showNotice]);

  const usedCardIds = useMemo(() => new Set(cards.map((card) => card.cardId)), [cards]);
  const availableDeck = useMemo(() => deck.filter((item) => !usedCardIds.has(item.cardId)), [deck, usedCardIds]);
  const resultCards = useMemo(() => {
    if (!result) return [];
    return result.cardInterpretations.flatMap((interpretation) => {
      const selected = cards.find((candidate) => candidate.cardId === interpretation.cardId);
      return selected ? [{ interpretation, selected, card: getCard(interpretation.cardId) }] : [];
    });
  }, [cards, result]);
  const activeResultCard = resultCards[activeCardIndex] ?? resultCards[0];
  const currentProgress = progressFor(phase);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNickname(localStorage.getItem(NICKNAME_KEY)?.trim() || "ㅇㅁ");
      const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage === "ko" || savedLanguage === "en") setLanguage(savedLanguage);
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        try {
          const saved = JSON.parse(raw) as RestorableState;
          const restoredPhase = saved.phase === "question" && !saved.question && !saved.result
            ? "home"
            : saved.phase === "planning"
            ? (saved.result ? "result" : "question")
            : saved.phase === "interpreting" || saved.phase === "shuffling"
              ? (saved.activePlan ? "selecting" : "question")
              : saved.phase;
          setPhase(restoredPhase);
          setQuestion(saved.question);
          setActiveQuestion(saved.activeQuestion);
          setInitialPlan(saved.initialPlan);
          setActivePlan(saved.activePlan);
          setDeck(saved.deck);
          setSelectedOrders(saved.selectedOrders);
          setCards(saved.cards);
          setLatestCards(saved.latestCards);
          setPendingResult(saved.pendingResult ?? null);
          setRevealCount(saved.revealCount ?? 0);
          setResult(saved.result);
          setComparisonResult(saved.comparisonResult);
          setFollowups(saved.followups);
          setRound(saved.round);
          setRecordId(saved.recordId);
          setApiMode(saved.apiMode);
          if (saved.phase === "revealing" && !saved.pendingResult) {
            setPhase(saved.result ? "result" : "question");
          }
        } catch {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(NICKNAME_KEY, nickname);
    const saved: RestorableState = {
      phase,
      question,
      activeQuestion,
      initialPlan,
      activePlan,
      deck,
      selectedOrders,
      cards,
      latestCards,
      pendingResult,
      revealCount,
      result,
      comparisonResult,
      followups,
      round,
      recordId,
      apiMode,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  }, [activePlan, activeQuestion, apiMode, cards, comparisonResult, deck, followups, initialPlan, latestCards, nickname, pendingResult, phase, question, recordId, restored, result, revealCount, round, selectedOrders]);

  useEffect(() => {
    if (phase !== "shuffling") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPhase("selecting"), reducedMotion ? 150 : 3800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!historyOpen && !settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [historyOpen, settingsOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (phase === "question") fitTextarea(questionInputRef.current);
  }, [phase, question]);

  useEffect(() => {
    if (followupOpen) fitTextarea(followupInputRef.current);
  }, [followupOpen, followupQuestion]);

  useEffect(() => {
    if (!imageExporting || !result || !exportRef.current) return;
    let cancelled = false;
    let objectUrl = "";

    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          const exportNode = exportRef.current;
          if (!exportNode) throw new Error("Export layout is unavailable");
          await waitForExportImages(exportNode);
          if (cancelled) return;

          const width = Math.ceil(exportNode.scrollWidth);
          const height = Math.ceil(exportNode.scrollHeight);
          const pixelRatio = Math.min(2, window.devicePixelRatio || 1.5, 14000 / Math.max(width, height));
          const blob = await toBlob(exportNode, {
            width,
            height,
            backgroundColor: "#fdfdfc",
            cacheBust: false,
            pixelRatio,
            skipFonts: true,
          });
          if (!blob) throw new Error("PNG generation returned no data");
          if (cancelled) return;

          objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = `tarot-milktea-${localDateStamp()}.png`;
          link.href = objectUrl;
          document.body.appendChild(link);
          link.click();
          link.remove();
          showNotice(language === "ko" ? "결과 이미지를 저장했습니다." : "The result image was saved.");
        } catch {
          if (!cancelled) showNotice(language === "ko" ? "결과 이미지를 저장하지 못했습니다. 잠시 후 다시 시도하세요." : "The result image could not be saved. Try again shortly.");
        } finally {
          if (objectUrl) {
            const completedUrl = objectUrl;
            objectUrl = "";
            window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
          }
          if (!cancelled) setImageExporting(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageExporting, language, result, showNotice]);

  async function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (value.length < 5) {
      setError(language === "ko" ? "질문을 5자 이상 입력하세요." : "Enter at least 5 characters.");
      return;
    }
    if (turnstileStatus !== "disabled" && (!turnstileToken || turnstileStatus !== "ready")) {
      setError(turnstileStatus === "error" ? t.botCheckError : t.botCheckLoading);
      return;
    }
    setError("");
    setNotice(null);
    setPhase("planning");
    const minimumPlanningTime = holdStage(650);
    try {
      await ensureAnonymousSession(turnstileToken);
      const response = await requestReadingPlan(value, false, language);
      await minimumPlanningTime;
      setActiveQuestion(value);
      setInitialPlan(response.data);
      setActivePlan(response.data);
      setDeck(createSessionDeck());
      setApiMode(response.mode);
      setRound(0);
      setPhase("plan");
    } catch (requestError) {
      await minimumPlanningTime;
      setTurnstileToken("");
      setTurnstileStatus("loading");
      setError(userError(requestError, language));
      setPhase("question");
    }
  }

  function beginReading(event: FormEvent) {
    event.preventDefault();
    setNickname(nickname.trim().slice(0, 20) || "ㅇㅁ");
    setTurnstileToken("");
    setTurnstileStatus("loading");
    setPhase("question");
  }

  function startShuffle() {
    setSelectedOrders([]);
    setError("");
    setDeck((current) => shuffledDeck(current.length ? current : createSessionDeck()));
    setPhase("shuffling");
  }

  function cancelPlan() {
    if (round === 0) {
      setTurnstileToken("");
      setTurnstileStatus("loading");
      setPhase("question");
      return;
    }
    setActiveQuestion(followups.at(-1)?.question ?? question);
    setRound(followups.length);
    setActivePlan(initialPlan);
    setPhase("result");
  }

  function toggleCard(order: number) {
    if (!activePlan) return;
    setSelectedOrders((current) => {
      if (current.includes(order)) return current.filter((item) => item !== order);
      if (current.length >= activePlan.cardCount) return current;
      return [...current, order];
    });
  }

  async function interpretCards() {
    if (!activePlan || selectedOrders.length !== activePlan.cardCount) return;
    const newCards = selectedOrders.map((order, index): SelectedCard => {
      const deckCard = deck.find((item) => item.order === order);
      const position = activePlan.positions[index];
      if (!deckCard || !position) throw new Error(language === "ko" ? "선택한 카드의 자리를 확인할 수 없습니다." : "The selected card position could not be resolved.");
      return {
        cardId: deckCard.cardId,
        reversed: deckCard.reversed,
        positionId: position.id,
        positionTitle: position.title,
        positionFocus: position.focus,
        round,
      };
    });
    const allCards = [...cards, ...newCards];
    const promptQuestion = round === 0
      ? question
      : `처음 질문: ${question}\n추가 질문 ${round}: ${activeQuestion}`;

    setError("");
    setPhase("interpreting");
    const minimumInterpretationTime = holdStage(800);
    try {
      const response = await requestInterpretation(promptQuestion, allCards, round > 0 ? result ?? undefined : undefined, language);
      await minimumInterpretationTime;
      setApiMode(response.mode);
      setLatestCards(newCards);
      setPendingResult(response.data);
      setRevealCount(0);
      setPhase("revealing");
    } catch (requestError) {
      await minimumInterpretationTime;
      if (requestError instanceof TarotApiError && requestError.status === 401) {
        setSessionRefreshNeeded(true);
      }
      setError(userError(requestError, language));
      setPhase("selecting");
    }
  }

  function finishReveal() {
    if (!pendingResult) return;
    const previous = result;
    const allCards = [...cards, ...latestCards];
    if (round > 0 && previous) {
      setFollowups((items) => [
        ...items,
        {
          id: createRecordId(),
          question: activeQuestion,
          addedCards: latestCards,
          previousResult: previous,
          result: pendingResult,
          createdAt: new Date().toISOString(),
        },
      ]);
      setComparisonResult(previous);
    } else {
      setComparisonResult(null);
    }
    setCards(allCards);
    setResult(pendingResult);
    setPendingResult(null);
    setSelectedOrders([]);
    setResultView("summary");
    setActiveCardIndex(0);
    setPhase("result");
  }

  async function submitFollowup(event: FormEvent) {
    event.preventDefault();
    const value = followupQuestion.trim();
    if (value.length < 5) {
      setError(language === "ko" ? "추가 질문을 5자 이상 입력하세요." : "Enter at least 5 characters for the follow-up.");
      return;
    }
    if (followups.length >= 2) return;
    setError("");
    setPhase("planning");
    setFollowupOpen(false);
    const minimumPlanningTime = holdStage(650);
    try {
      const response = await requestReadingPlan(value, true, language);
      await minimumPlanningTime;
      setApiMode(response.mode);
      setActiveQuestion(value);
      setActivePlan(response.data);
      setRound(followups.length + 1);
      setFollowupQuestion("");
      setPhase("plan");
    } catch (requestError) {
      await minimumPlanningTime;
      if (requestError instanceof TarotApiError && requestError.status === 401) {
        setSessionRefreshNeeded(true);
      }
      setError(userError(requestError, language));
      setFollowupOpen(true);
      setPhase("result");
    }
  }

  function clearReading(nextPhase: "home" | "question") {
    setPhase(nextPhase);
    setQuestion("");
    setActiveQuestion("");
    setFollowupQuestion("");
    setInitialPlan(null);
    setActivePlan(null);
    setDeck([]);
    setSelectedOrders([]);
    setCards([]);
    setLatestCards([]);
    setPendingResult(null);
    setResult(null);
    setComparisonResult(null);
    setFollowups([]);
    setRound(0);
    setRevealCount(0);
    setRecordId(createRecordId());
    setError("");
    setNotice(null);
    setTurnstileToken("");
    setTurnstileStatus("loading");
    setExamplesOpen(false);
    setFollowupOpen(false);
    setResultView("summary");
    sessionStorage.removeItem(SESSION_KEY);
  }

  function resetReading() {
    clearReading("question");
  }

  function goHome() {
    clearReading("home");
  }

  async function openHistory() {
    try {
      setHistory(await listReadings());
      setHistoryOpen(true);
    } catch (historyError) {
      showNotice(userError(historyError, language));
    }
  }

  async function saveCurrentReading() {
    if (!result || !initialPlan) return;
    try {
      await saveReading({
        id: recordId,
        createdAt: new Date().toISOString(),
        nickname,
        question,
        plan: initialPlan,
        cards,
        result,
        followups,
      });
      showNotice(language === "ko" ? "이 브라우저의 기록에 저장했습니다." : "Saved to this browser.");
    } catch {
      showNotice(language === "ko" ? "로컬 기록을 저장하지 못했습니다. 텍스트 복사를 사용하세요." : "The reading could not be saved locally. Use text copy instead.");
    }
  }

  function restoreReading(saved: SavedReading) {
    setQuestion(saved.question);
    setActiveQuestion(saved.followups.at(-1)?.question ?? saved.question);
    setInitialPlan(saved.plan);
    setActivePlan(saved.plan);
    setDeck(createSessionDeck());
    setCards(saved.cards);
    setLatestCards(saved.followups.at(-1)?.addedCards ?? saved.cards);
    setResult(saved.result);
    setComparisonResult(saved.followups.at(-1)?.previousResult ?? null);
    setFollowups(saved.followups);
    setRound(saved.followups.length);
    setRecordId(saved.id);
    setNickname(saved.nickname);
    setResultView("summary");
    setActiveCardIndex(0);
    setHistoryOpen(false);
    setPhase("result");
  }

  async function removeHistory(id: string) {
    await deleteReading(id);
    setHistory((items) => items.filter((item) => item.id !== id));
  }

  async function removeAllHistory() {
    await clearReadings();
    setHistory([]);
  }

  async function copyResult() {
    if (!result) return;
    try {
      await writeClipboard(resultText(round === 0 ? question : activeQuestion, result, language));
      showNotice(language === "ko" ? "해석을 클립보드에 복사했습니다." : "The reading was copied to the clipboard.");
    } catch {
      showNotice(language === "ko" ? "복사 권한을 확인할 수 없습니다." : "Clipboard permission is unavailable.");
    }
  }

  async function shareResult() {
    try {
      await writeClipboard(new URL("/", window.location.origin).href);
      showNotice(language === "ko" ? "사이트 주소를 복사했습니다." : "The site address was copied.");
    } catch {
      showNotice(language === "ko" ? "사이트 주소를 복사하지 못했습니다." : "The site address could not be copied.");
    }
  }

  function saveResultImage() {
    if (!result || imageExporting) return;
    setImageExporting(true);
  }

  const revealedCard = revealCount > 0 ? latestCards[Math.min(revealCount, latestCards.length) - 1] : undefined;
  const revealedInterpretation = revealedCard
    ? pendingResult?.cardInterpretations.find((item) => item.cardId === revealedCard.cardId)
    : undefined;

  return (
    <div className={`tarot-game phase-${phase}`}>
      {phase !== "home" ? <header className="game-topbar">
        <button className="game-brand" type="button" onClick={goHome} aria-label={t.homeAria}>
          <Image src={MILK_TEA_IMAGE} alt="" width={512} height={512} priority unoptimized />
          <span>{language === "ko" ? "타로밀크티" : "TAROT MILKTEA"} <small>WEB</small></span>
        </button>
        <ol className="game-progress" aria-label={t.progressLabel}>
          {t.progress.map((label, index) => (
            <li key={label} className={index < currentProgress ? "done" : index === currentProgress ? "current" : ""}>
              <i>{index < currentProgress ? <Check size={11} /> : index + 1}</i><span>{label}</span>
            </li>
          ))}
        </ol>
        <div className="topbar-actions">
          <button type="button" onClick={openHistory} aria-label={t.history}><History size={17} /><span>{t.history}</span></button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label={t.settings}><Settings size={17} /><span>{t.settings}</span></button>
          {phase !== "question" ? <button type="button" onClick={resetReading} aria-label={t.newQuestion}><RotateCcw size={17} /><span>{t.newQuestion}</span></button> : null}
        </div>
      </header> : null}

      <main className="game-stage">
        {sessionRefreshNeeded ? (
          <aside className="session-refresh" role="alert">
            <p>{t.sessionExpired}</p>
            <TurnstileGate
              onToken={handleSessionRefreshToken}
              loadingLabel={t.botCheckLoading}
              errorLabel={t.botCheckError}
              ariaLabel={t.botCheckAria}
            />
          </aside>
        ) : null}

        {phase === "home" ? (
          <section className="game-scene home-scene">
            <button className="home-settings" type="button" onClick={() => setSettingsOpen(true)} aria-label={t.settings}><Settings size={20} /><span>{t.settings}</span></button>
            <div className="home-visual" aria-hidden="true">
              <span className="home-card home-card-left"><CardBack /></span>
              <span className="home-card home-card-main"><CardBack /></span>
              <span className="home-card home-card-right"><CardBack /></span>
            </div>
            <div className="home-copy">
              <p className="home-eyebrow">AI TAROT READING</p>
              <h1 className="home-title">
                <span className="home-title-main">{language === "ko" ? "타로" : "TAROT"}</span>
                <span className="home-title-addon">{language === "ko" ? "밀크티" : "MILKTEA"}</span>
              </h1>
              <p className="home-description">{t.homeDescription}</p>
              <form className="home-start-form" onSubmit={beginReading}>
                <label htmlFor="home-nickname">{t.nicknameLabel}</label>
                <div>
                  <input id="home-nickname" value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} maxLength={20} />
                  <button className="game-button primary" type="submit">{t.startTarot}<ChevronRight size={18} /></button>
                </div>
                <small>{t.nicknameNote}</small>
              </form>
              <button className="home-history" type="button" onClick={openHistory}><History size={16} />{t.previousHistory}</button>
            </div>
          </section>
        ) : null}

        {phase === "question" ? (
          <section className="game-scene question-scene">
            <div className="scene-center intro-center" aria-hidden="true">
              <div className="intro-halo" />
              <div className="intro-deck">
                <CardBack /><CardBack /><CardBack />
              </div>
              <p>TAROT MILKTEA</p>
            </div>
            <GameDialog title={t.questionTitle}>
              <form className="dialog-question-form" onSubmit={submitQuestion}>
                <textarea
                  id="tarot-question"
                  ref={questionInputRef}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value.slice(0, 500))}
                  placeholder={t.questionPlaceholder}
                  minLength={5}
                  maxLength={500}
                  aria-label={t.questionAria}
                  aria-describedby="question-character-count"
                  required
                />
                <div className="question-controls">
                  <button
                    className="text-control"
                    type="button"
                    aria-expanded={examplesOpen}
                    aria-controls="question-example-list"
                    onClick={() => setExamplesOpen((value) => !value)}
                  >
                    {t.examples} {examplesOpen ? t.close : t.open}
                  </button>
                  <span className="character-count" id="question-character-count">{question.length} / 500</span>
                </div>
                {examplesOpen ? (
                  <div className="question-examples" id="question-example-list">
                    {QUESTION_EXAMPLES[language].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setQuestion(example);
                          setExamplesOpen(false);
                          setError("");
                          questionInputRef.current?.focus();
                        }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                ) : null}
                {error ? <p className="game-error" role="alert">{error}</p> : null}
                <div className="question-submit-row">
                  <TurnstileGate
                    onToken={handleTurnstileToken}
                    onStatusChange={handleTurnstileStatus}
                    loadingLabel={t.botCheckLoading}
                    errorLabel={t.botCheckError}
                    ariaLabel={t.botCheckAria}
                  />
                  <button
                    className="game-button primary"
                    type="submit"
                    disabled={turnstileStatus === "loading" || turnstileStatus === "error"}
                    aria-busy={turnstileStatus === "loading"}
                  >
                    {t.begin}<ChevronRight size={18} />
                  </button>
                </div>
              </form>
            </GameDialog>
          </section>
        ) : null}

        {phase === "planning" ? (
          <section className="game-scene loading-scene">
            <div className="scene-center loading-center">
              <div className="loading-deck"><CardBack /><LoaderCircle size={34} /></div>
            </div>
            <GameDialog title={round === 0 ? t.planningInitial : t.planningFollowup}>
              <p>{t.wait}</p>
            </GameDialog>
          </section>
        ) : null}

        {phase === "plan" && activePlan ? (
          <section className="game-scene plan-scene">
            <div className="scene-center plan-center">
              <div className="plan-deck-stack"><CardBack /><CardBack /></div>
              <div className="position-orbit">
                {activePlan.positions.map((position, index) => (
                  <span key={position.id}><i>{index + 1}</i>{position.title}</span>
                ))}
              </div>
            </div>
            <GameDialog
              label={round === 0 ? t.readingReady : `FOLLOW-UP ${round} / 2`}
              title={t.useCards(activePlan.cardCount)}
              actions={(
                <>
                  <button className="game-button" type="button" onClick={cancelPlan}>{t.editQuestion}</button>
                  <button className="game-button primary" type="button" onClick={startShuffle}><Shuffle size={17} />{t.shuffleCards}</button>
                </>
              )}
            >
              <p className="dialog-question">“{activeQuestion}”</p>
              <p>{activePlan.interpretationFrame}</p>
            </GameDialog>
          </section>
        ) : null}

        {phase === "shuffling" ? (
          <section className="game-scene shuffle-scene">
            <div className="scene-center shuffle-center" aria-label={t.shufflingAria}>
              <div className="shuffle-mat" />
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  className="riffle-card"
                  style={{
                    "--riffle-side": index % 2 === 0 ? -1 : 1,
                    "--riffle-layer": Math.floor(index / 2),
                    "--riffle-order": index,
                  } as React.CSSProperties}
                  key={index}
                >
                  <CardBack />
                </span>
              ))}
              <span className="shuffle-squared" aria-hidden="true">
                <CardBack />
              </span>
            </div>
            <GameDialog
              title={t.shuffling}
              actions={(
                <button className="game-button" type="button" onClick={() => setPhase("selecting")}>
                  {t.skipShuffle}
                </button>
              )}
            >
              <p>{t.shuffleDescription}</p>
            </GameDialog>
          </section>
        ) : null}

        {phase === "selecting" && activePlan ? (
          <section className="game-scene selection-scene">
            <div className="selected-spread" aria-label={t.selectedSlots}>
              {activePlan.positions.map((position, index) => (
                <div className={selectedOrders[index] == null ? "spread-slot" : "spread-slot filled"} key={position.id}>
                  {selectedOrders[index] == null ? <span className="slot-number">{index + 1}</span> : <CardBack compact />}
                  <small>{position.title}</small>
                </div>
              ))}
            </div>
            <div className="deck-scroll" aria-label={t.spreadDeck}>
              <div className="deck-ribbon">
                <div className="deck-fan">
                  {availableDeck.map((deckCard, index) => {
                    const selectedIndex = selectedOrders.indexOf(deckCard.order);
                    const desktopCount = Math.max(availableDeck.length - 1, 1);
                    const desktopRatio = index / desktopCount;
                    const desktopAngle = -21 + desktopRatio * 42;
                    const desktopRadians = desktopAngle * (Math.PI / 180);
                    const desktopMaxRadians = 21 * (Math.PI / 180);
                    const desktopCurveX = Math.sin(desktopRadians) / Math.sin(desktopMaxRadians);
                    const desktopCurveY = (1 - Math.cos(desktopRadians)) / (1 - Math.cos(desktopMaxRadians));
                    const mobileCardsPerRow = Math.max(Math.ceil(availableDeck.length / 3), 1);
                    const mobileColumn = index % mobileCardsPerRow;
                    const mobileRow = Math.floor(index / mobileCardsPerRow);
                    const mobileRowLength = Math.min(mobileCardsPerRow, availableDeck.length - mobileRow * mobileCardsPerRow);
                    const mobileRatio = mobileRowLength > 1 ? mobileColumn / (mobileRowLength - 1) : 0.5;
                    const mobileNormalized = Math.abs(mobileRatio - 0.5) * 2;
                    return (
                      <button
                        key={deckCard.cardId}
                        className={selectedIndex >= 0 ? "ribbon-card selected" : "ribbon-card"}
                        style={{
                          "--fan-left": `${50 + desktopCurveX * 42}%`,
                          "--fan-angle": `${desktopAngle}deg`,
                          "--fan-arc": `min(${desktopCurveY * 78}px, ${desktopCurveY * 7.5}vw)`,
                          "--fan-top": "0px",
                          "--fan-mobile-left": `${13 + mobileRatio * 74}%`,
                          "--fan-mobile-angle": `${-12 + mobileRatio * 24}deg`,
                          "--fan-mobile-arc": `${mobileNormalized * mobileNormalized * 24}px`,
                          "--fan-mobile-top": `${mobileRow * 82}px`,
                        } as React.CSSProperties}
                        type="button"
                        onClick={() => toggleCard(deckCard.order)}
                        aria-pressed={selectedIndex >= 0}
                        aria-label={selectedIndex >= 0 ? t.deselectCard(selectedIndex + 1) : t.selectCard(index + 1)}
                      >
                        <CardBack />
                        {selectedIndex >= 0 ? <b>{selectedIndex + 1}</b> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <GameDialog
              compact
              title={t.chooseCards(activePlan.cardCount, selectedOrders.length)}
              actions={(
                <>
                  <button className="game-button" type="button" onClick={startShuffle}><RefreshCw size={16} />{t.reshuffle}</button>
                  <button className="game-button primary" type="button" disabled={selectedOrders.length !== activePlan.cardCount} onClick={interpretCards}>{t.completeSelection}<ChevronRight size={17} /></button>
                </>
              )}
            >
              <p>{t.selectionDescription}</p>
              {error ? <p className="game-error" role="alert">{error}</p> : null}
            </GameDialog>
          </section>
        ) : null}

        {phase === "interpreting" ? (
          <section className="game-scene loading-scene">
            <div className="scene-center interpreting-center">
              {selectedOrders.map((order, index) => (
                <span
                  key={order}
                  style={{ "--selected-angle": `${(index - (selectedOrders.length - 1) / 2) * 4}deg` } as React.CSSProperties}
                >
                  <CardBack />
                </span>
              ))}
              <LoaderCircle className="analysis-spinner" size={36} />
            </div>
            <GameDialog title={t.interpreting}>
              <p>{t.interpretingDescription}</p>
            </GameDialog>
          </section>
        ) : null}

        {phase === "revealing" && pendingResult ? (
          <section className="game-scene reveal-scene">
            <div className="reveal-spread">
              {latestCards.map((selected, index) => {
                const revealed = index < revealCount;
                const readyToReveal = index === revealCount;
                const card = getCard(selected.cardId);
                return (
                  <article className={`reveal-game-card${revealed ? " revealed" : ""}${readyToReveal ? " ready" : ""}`} key={selected.cardId}>
                    <button
                      className="reveal-card-trigger"
                      type="button"
                      disabled={!readyToReveal}
                      onClick={() => setRevealCount((count) => count + 1)}
                      aria-label={readyToReveal ? t.revealCard(selected.positionTitle) : revealed ? t.cardRevealed(selected.positionTitle) : t.cardWaiting(selected.positionTitle)}
                    >
                      <div className="game-flip-card">
                        <div className="game-flip-inner">
                          <div className="game-flip-face back"><CardBack /></div>
                          <div className="game-flip-face front" aria-hidden={!revealed}><CardImage cardId={selected.cardId} reversed={selected.reversed} language={language} /></div>
                        </div>
                      </div>
                    </button>
                    <p>{selected.positionTitle}</p>
                    <strong>{revealed ? (language === "ko" ? card.nameKo : card.nameEn) : `CARD ${index + 1}`}</strong>
                    {revealed ? <small>{orientationLabel(selected.reversed, language)}</small> : null}
                  </article>
                );
              })}
            </div>
            <GameDialog
              compact
              label={revealedCard ? revealedCard.positionTitle : "CARD REVEAL"}
              title={revealedCard ? `${language === "ko" ? getCard(revealedCard.cardId).nameKo : getCard(revealedCard.cardId).nameEn} · ${orientationLabel(revealedCard.reversed, language)}` : t.revealWaiting}
              actions={revealCount < latestCards.length ? (
                <button className="game-button" type="button" onClick={() => setRevealCount(latestCards.length)}>{t.revealAll}</button>
              ) : (
                <button className="game-button primary" type="button" onClick={finishReveal}>{t.viewReading}<ChevronRight size={17} /></button>
              )}
            >
              <p>{revealedInterpretation?.text ?? t.revealDescription}</p>
            </GameDialog>
          </section>
        ) : null}

        {phase === "result" && result ? (
          <section className="game-scene result-scene">
            <div className="result-card-dock" aria-label={t.resultCardsAria}>
              {resultCards.map((item, index) => (
                <button
                  className={resultView === "cards" && activeCardIndex === index ? "active" : ""}
                  type="button"
                  key={`${item.card.id}-${index}`}
                  onClick={() => { setActiveCardIndex(index); setResultView("cards"); }}
                  aria-label={t.viewCardReading(language === "ko" ? item.card.nameKo : item.card.nameEn)}
                >
                  <CardImage cardId={item.card.id} reversed={item.selected.reversed} language={language} />
                  <span>{item.interpretation.positionTitle}</span>
                </button>
              ))}
            </div>

            <section className="result-console" ref={resultRef} aria-label={t.resultAria}>
              <header className="console-header">
                <div>
                  <p>{nickname ? `${nickname} / ` : ""}{round === 0 ? "INITIAL READING" : `FOLLOW-UP ${round}`}</p>
                  <h1>{round === 0 ? question : activeQuestion}</h1>
                </div>
                <span>{apiMode === "ai" ? "WORKERS AI" : "LOCAL MODE"}</span>
              </header>
              <nav className="console-tabs" aria-label={t.tabsAria}>
                <button className={resultView === "summary" ? "active" : ""} type="button" onClick={() => setResultView("summary")}>{t.summary}</button>
                <button className={resultView === "cards" ? "active" : ""} type="button" onClick={() => setResultView("cards")}>{t.cardReading}</button>
                <button className={resultView === "analysis" ? "active" : ""} type="button" onClick={() => setResultView("analysis")}>{t.aiMetrics}</button>
              </nav>

              <div className="console-body">
                {resultView === "summary" ? (
                  <div className="summary-console">
                    <div className="summary-main">
                      <p className="console-kicker">CORE RESULT</p>
                      <h2>{result.summary}</h2>
                      <p>{result.synthesis}</p>
                    </div>
                    <aside>
                      <h3>{t.checkPoints}</h3>
                      <ol>{result.guidance.map((item) => <li key={item}>{item}</li>)}</ol>
                    </aside>
                  </div>
                ) : null}

                {resultView === "cards" && activeResultCard ? (
                  <div className="card-console">
                    <div className="card-console-visual">
                      <CardImage cardId={activeResultCard.card.id} reversed={activeResultCard.selected.reversed} language={language} />
                    </div>
                    <div className="card-console-copy">
                      <div className="position-focus">
                        <span>{t.positionFocus}</span>
                        <strong>{activeResultCard.interpretation.positionTitle}</strong>
                        <p>{activeResultCard.selected.positionFocus}</p>
                      </div>
                      <h2>{language === "ko" ? activeResultCard.card.nameKo : activeResultCard.card.nameEn}<small>{orientationLabel(activeResultCard.selected.reversed, language)}</small></h2>
                      <section className="card-conclusion">
                        <h3>{t.cardConclusion}</h3>
                        <p>{activeResultCard.interpretation.text}</p>
                      </section>
                      {activeResultCard.interpretation.reasoning ? (
                        <div className="card-reasoning">
                          <section>
                            <h3>{t.sourceMeaning}</h3>
                            <p>{activeResultCard.interpretation.reasoning.sourceMeaning}</p>
                          </section>
                          <section>
                            <h3>{t.questionConnection}</h3>
                            <p>{activeResultCard.interpretation.reasoning.questionConnection}</p>
                          </section>
                          <section>
                            <h3>{t.decisionImpact}</h3>
                            <p>{activeResultCard.interpretation.reasoning.decisionImpact}</p>
                          </section>
                        </div>
                      ) : null}
                      {activeResultCard.interpretation.evidence.length > 0 ? (
                        <div className="evidence-block">
                          <h3>{t.sourceBasis}</h3>
                          <div className="evidence-chips">{activeResultCard.interpretation.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}</div>
                        </div>
                      ) : null}
                      <div className="card-pager">
                        <button type="button" disabled={activeCardIndex === 0} onClick={() => setActiveCardIndex((index) => index - 1)}><ChevronLeft size={17} />{t.previous}</button>
                        <span>{activeCardIndex + 1} / {resultCards.length}</span>
                        <button type="button" disabled={activeCardIndex >= resultCards.length - 1} onClick={() => setActiveCardIndex((index) => index + 1)}>{t.next}<ChevronRight size={17} /></button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {resultView === "analysis" ? (
                  <div className="analysis-console">
                    <div className="console-signal">
                      <h2>{t.signalDistribution}</h2>
                      <SignalDistribution signals={result.signals} previous={comparisonResult?.signals} language={language} />
                    </div>
                    <div className="console-chart">
                      <h2>{t.questionMetrics}</h2>
                      <RadarChart axes={result.axes} previous={comparisonResult?.axes} language={language} />
                    </div>
                    <div className="console-metrics">
                      <h2>{t.metricEvidence}</h2>
                      <dl>
                        {result.axes.map((axis) => {
                          const previousAxis = comparisonResult?.axes.find((item) => item.label === axis.label);
                          return <div key={axis.label}><dt>{axis.label}<b>{previousAxis ? `${previousAxis.score} → ${axis.score}` : axis.score}</b></dt><dd>{axis.evidence}</dd></div>;
                        })}
                      </dl>
                    </div>
                  </div>
                ) : null}
              </div>
              <footer className="console-footer">
                <p>{result.limitation}</p>
              </footer>
            </section>

            <div className="result-command-bar">
              <div className="result-tools">
                <button type="button" onClick={saveCurrentReading}><Save size={15} />{t.save}</button>
                <button type="button" onClick={copyResult}><Clipboard size={15} />{t.copy}</button>
                <button type="button" onClick={shareResult}><Share2 size={15} />{t.share}</button>
                <button type="button" onClick={saveResultImage} disabled={imageExporting} aria-busy={imageExporting}><Download size={15} />{t.image}</button>
              </div>
              <div className="result-next-actions">
                {followups.length < 2 ? <button className="game-button" type="button" onClick={() => setFollowupOpen(true)}>{t.followup} {followups.length}/2</button> : <span>{t.followupDone}</span>}
                <button className="game-button primary" type="button" onClick={resetReading}>{t.newQuestion}<RotateCcw size={16} /></button>
              </div>
            </div>
            {notice ? <p className="game-toast" role="status" aria-atomic="true">{notice.message}<button type="button" onClick={() => setNotice(null)} aria-label={t.closeNotice}><X size={14} /></button></p> : null}

            {imageExporting ? (
              <div className="reading-export-shell">
                <ReadingExport
                  nodeRef={exportRef}
                  nickname={nickname}
                  question={round === 0 ? question : activeQuestion}
                  result={result}
                  cards={cards}
                  language={language}
                />
              </div>
            ) : null}

            {followupOpen ? (
              <div className="game-overlay" role="presentation">
                <form className="followup-console" onSubmit={submitFollowup} role="dialog" aria-modal="true" aria-labelledby="followup-title">
                  <button className="overlay-close" type="button" onClick={() => setFollowupOpen(false)} aria-label={t.closeFollowup}><X size={20} /></button>
                  <p className="console-kicker">FOLLOW-UP {followups.length + 1} / 2</p>
                  <h2 id="followup-title">{t.followupTitle}</h2>
                  <p>{t.followupDescription}</p>
                  <textarea ref={followupInputRef} value={followupQuestion} onChange={(event) => setFollowupQuestion(event.target.value.slice(0, 300))} placeholder={t.followupPlaceholder} minLength={5} maxLength={300} autoFocus />
                  {error ? <p className="game-error" role="alert">{error}</p> : null}
                  <div className="dialog-actions"><button className="game-button" type="button" onClick={() => setFollowupOpen(false)}>{t.cancel}</button><button className="game-button primary" type="submit">{t.addCardPlan}<ChevronRight size={17} /></button></div>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>

      {historyOpen ? (
        <div className="game-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
          <section className="history-console" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <header>
              <div><p className="console-kicker">LOCAL ARCHIVE</p><h2 id="history-title">{t.archiveTitle}</h2></div>
              <button className="overlay-close" type="button" onClick={() => setHistoryOpen(false)} aria-label={t.closeHistory}><X size={20} /></button>
            </header>
            <p>{t.archiveDescription}</p>
            {history.length ? (
              <ul>
                {history.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => restoreReading(item)}>
                      <small>{formatDate(item.createdAt, language)} · {t.archiveMeta(item.cards.length, item.followups.length)}</small>
                      <strong>{item.question}</strong>
                    </button>
                    <button className="archive-delete" type="button" onClick={() => removeHistory(item.id)} aria-label={t.deleteHistory(item.question)}><X size={16} /></button>
                  </li>
                ))}
              </ul>
            ) : <div className="empty-archive"><Archive size={28} /><p>{t.noHistory}</p></div>}
            {history.length ? <button className="archive-clear" type="button" onClick={removeAllHistory}>{t.clearHistory}</button> : null}
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header>
              <div><p>APP SETTINGS</p><h2 id="settings-title">{t.settings}</h2></div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label={t.closeSettings}><X size={20} /></button>
            </header>
            <section className="language-setting" aria-labelledby="language-title">
              <div>
                <p>01</p>
                <h3 id="language-title">{t.language}</h3>
                <span>{t.languageDescription}</span>
              </div>
              <div className="language-options" role="radiogroup" aria-label={t.language}>
                {(["ko", "en"] as AppLanguage[]).map((option) => (
                  <button
                    className={language === option ? "selected" : ""}
                    type="button"
                    role="radio"
                    aria-checked={language === option}
                    onClick={() => setLanguage(option)}
                    key={option}
                  >
                    <span>{option === "ko" ? t.korean : t.english}</span>
                    {language === option ? <small><Check size={14} />{t.current}</small> : null}
                  </button>
                ))}
              </div>
              <p className="settings-note">{t.savedLanguageNote}</p>
            </section>
            <nav className="settings-legal" aria-label={t.legalInformation}>
              <Link
                href="/privacy"
                onClick={() => setSettingsOpen(false)}
              >
                <span>{t.privacyPolicy}</span>
                <b aria-hidden="true">→</b>
              </Link>
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
