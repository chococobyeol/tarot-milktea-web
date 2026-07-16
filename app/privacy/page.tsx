import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "타로밀크티 웹의 브라우저 저장, AI 처리, 익명 세션 및 외부 서비스 이용 범위를 안내합니다.",
};

const EFFECTIVE_DATE = "2026년 7월 17일";

function PolicySection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="privacy-section">
      <header>
        <span>{number}</span>
        <h2>{title}</h2>
      </header>
      <div className="privacy-section-body">{children}</div>
    </section>
  );
}

function DataItem({
  title,
  items,
}: {
  title: string;
  items: Array<[label: string, value: React.ReactNode]>;
}) {
  return (
    <article className="privacy-data-item">
      <h3>{title}</h3>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-topbar">
        <Link href="/" className="privacy-back-link">← 타로밀크티 웹</Link>
        <span>PRIVACY / 2026.07</span>
        <a href="#english-summary">EN SUMMARY ↓</a>
      </header>

      <div className="privacy-layout">
        <aside className="privacy-summary">
          <p className="privacy-kicker">TAROT MILKTEA / POLICY</p>
          <h1>개인정보<br />처리방침</h1>
          <p className="privacy-intro">
            타로밀크티 웹은 로그인 없이 이용하는 개인 프로젝트입니다. 서비스에 필요한 범위만 처리하고,
            기기 안에 저장되는 정보와 AI 처리에 전송되는 정보를 구분합니다.
          </p>
          <dl className="privacy-date">
            <div><dt>시행일</dt><dd>{EFFECTIVE_DATE}</dd></div>
            <div><dt>현재 버전</dt><dd>1.0</dd></div>
          </dl>
          <div className="privacy-quick-summary" aria-label="개인정보 처리 핵심 요약">
            <h2>핵심 요약</h2>
            <ul>
              <li>회원가입과 광고 추적 기능이 없습니다.</li>
              <li>닉네임은 서버나 AI에 전송하지 않습니다.</li>
              <li>질문과 카드 문맥은 AI 해석을 위해 전송됩니다.</li>
              <li>저장 버튼으로 남긴 기록은 해당 브라우저에만 저장됩니다.</li>
            </ul>
          </div>
        </aside>

        <article className="privacy-document">
          <PolicySection number="01" title="적용 범위와 기본 원칙">
            <p>
              이 방침은 타로밀크티 웹에서 이루어지는 정보 처리에 적용됩니다. 서비스는 계정, 실명, 이메일,
              전화번호 또는 결제정보를 필수로 요구하지 않습니다. 다만 자유 형식 질문에 이용자가 개인정보를
              직접 입력할 수 있으므로, 질문에는 실명·연락처·주민등록번호·금융정보·건강정보 또는 타인의
              사적인 정보를 적지 않는 것을 권장합니다.
            </p>
            <p>
              서비스 자체에는 광고 SDK나 이용자 행동 분석 SDK가 없습니다. 타로 해석은 참고 정보이며 의료,
              법률, 금융 또는 그 밖의 전문적인 판단을 대신하지 않습니다.
            </p>
          </PolicySection>

          <PolicySection number="02" title="처리하는 정보와 보유 기간">
            <div className="privacy-data-list">
              <DataItem
                title="화면 설정"
                items={[
                  ["항목", "닉네임, 언어"],
                  ["목적", "화면 표시와 해석 언어 설정"],
                  ["저장 위치", "브라우저 localStorage"],
                  ["기간", "이용자가 값을 바꾸거나 브라우저 사이트 데이터를 삭제할 때까지"],
                ]}
              />
              <DataItem
                title="진행 중인 리딩"
                items={[
                  ["항목", "질문, 카드 구성·선택·방향, AI 결과, 추가 질문, 진행 단계"],
                  ["목적", "새로고침 후에도 현재 리딩을 이어서 표시"],
                  ["저장 위치", "브라우저 sessionStorage"],
                  ["기간", "탭 세션이 끝나거나 새 질문·초기화·사이트 데이터 삭제를 할 때까지"],
                ]}
              />
              <DataItem
                title="이용자가 저장한 기록"
                items={[
                  ["항목", "저장 시각, 닉네임, 질문, 카드 구성·선택, AI 결과, 추가 질문"],
                  ["목적", "이 기기에서 이전 해석 다시 보기"],
                  ["저장 위치", "브라우저 IndexedDB"],
                  ["기간", "기록 메뉴에서 개별·전체 삭제하거나 브라우저 사이트 데이터를 삭제할 때까지"],
                ]}
              />
              <DataItem
                title="AI 요청"
                items={[
                  ["항목", "질문, 언어, 선택 카드와 방향·자리, 추가 질문 시 이전 해석"],
                  ["목적", "질문별 카드 구성과 해석 생성"],
                  ["처리 위치", "같은 출처의 Worker API와 Cloudflare Workers AI"],
                  ["기간", "요청 처리 중 사용하며 애플리케이션 D1에는 질문과 AI 결과를 저장하지 않음"],
                ]}
              />
              <DataItem
                title="익명 보안 세션"
                items={[
                  ["항목", "서명된 익명 세션 쿠키, 세션 ID 해시, 생성·만료 시각, AI 호출 수, 추가 질문 수"],
                  ["목적", "봇 방지, 세션별 사용량 제한, 요청 위조 방지"],
                  ["저장 위치", "HttpOnly 쿠키와 Cloudflare D1"],
                  ["기간", "쿠키는 최대 2시간, 만료된 D1 행은 이후 새 세션 생성 과정에서 정리"],
                ]}
              />
              <DataItem
                title="네트워크 남용 방지"
                items={[
                  ["항목", "IP 주소와 User-Agent를 조합한 비가역 해시, Turnstile 토큰과 브라우저 신호"],
                  ["목적", "네트워크별 요청 제한과 사람·봇 구분"],
                  ["처리 방식", "원문 IP와 User-Agent는 애플리케이션 D1 또는 자체 로그에 저장하지 않음"],
                  ["기간", "Cloudflare의 보안·Rate Limiting·Turnstile 운영 정책에 따름"],
                ]}
              />
              <DataItem
                title="운영 로그"
                items={[
                  ["항목", "요청 URL·메서드, 요청·응답 메타데이터와 헤더, 오류·실행 정보"],
                  ["목적", "장애 확인과 보안 운영"],
                  ["처리 위치", "Cloudflare Workers Logs"],
                  ["기간", "현재 Cloudflare Free 플랜 기준 최대 3일. 질문 본문과 AI 응답은 앱 코드가 로그 메시지로 직접 기록하지 않음"],
                ]}
              />
            </div>
          </PolicySection>

          <PolicySection number="03" title="AI 처리 방식">
            <p>
              질문을 제출하면 질문 내용과 선택한 카드의 문맥이 Cloudflare Workers AI로 전달됩니다. 추가 질문에는
              앞선 해석이 문맥으로 포함될 수 있습니다. 홈에서 입력한 닉네임은 AI 요청에 포함하지 않습니다.
            </p>
            <p>
              Cloudflare의 안내에 따르면 Workers AI의 입력·출력은 다른 고객에게 제공되지 않으며, 명시적 동의
              없이 AI 모델 학습이나 Cloudflare 또는 제3자 서비스 개선에 사용되지 않습니다. 자세한 사항은
              {" "}<a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/" target="_blank" rel="noreferrer">Workers AI 데이터 이용 안내</a>에서 확인할 수 있습니다.
            </p>
          </PolicySection>

          <PolicySection number="04" title="쿠키와 브라우저 저장소">
            <p>
              서비스가 직접 발급하는 쿠키는 익명 세션 유지에 필요한 <code>tarot_milktea_session</code>입니다.
              HTTPS 환경에서 Secure, HttpOnly, SameSite=Strict 속성을 사용하며 최대 2시간 유지됩니다. 광고 또는
              맞춤형 마케팅 쿠키는 사용하지 않습니다.
            </p>
            <p>
              localStorage, sessionStorage와 IndexedDB는 모두 현재 브라우저 안에 저장됩니다. 다른 기기와 자동으로
              동기화되지 않으며, 브라우저의 사이트 데이터 삭제 기능으로 함께 제거할 수 있습니다. Turnstile은
              봇 감지를 위해 필수 브라우저·네트워크 신호와 필요한 쿠키를 처리할 수 있습니다.
            </p>
          </PolicySection>

          <PolicySection number="05" title="외부 서비스와 국외 처리 가능성">
            <p>
              서비스 운영에는 아래 외부 서비스를 사용합니다. 데이터는 접속 또는 기능 실행 시 암호화된 통신으로
              전송되며, 제공자의 글로벌 인프라에서 처리되어 실제 처리 국가는 접속 위치와 서비스 운영 상황에 따라
              달라질 수 있습니다. 이용자 정보를 광고 목적으로 판매하지 않습니다.
            </p>
            <div className="privacy-provider-list">
              <article>
                <h3>Cloudflare, Inc.</h3>
                <p>웹 호스팅·API 실행, D1, Workers AI, Rate Limiting, Turnstile 봇 감지, 운영 로그</p>
                <p>처리 가능 정보: 요청 메타데이터, Turnstile 신호, 질문과 카드 문맥, 익명 세션 해시와 사용량 수치</p>
                <div>
                  <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare 개인정보 처리방침</a>
                  <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noreferrer">Turnstile 개인정보 안내</a>
                </div>
              </article>
              <article>
                <h3>jsDelivr</h3>
                <p>화면 글꼴 파일 전송을 위한 공개 CDN</p>
                <p>처리 가능 정보: 글꼴 요청 과정의 IP 주소, User-Agent 등 일반적인 HTTP 요청 메타데이터</p>
              </article>
            </div>
          </PolicySection>

          <PolicySection number="06" title="이용자의 권리와 삭제 방법">
            <ul>
              <li>저장한 리딩은 기록 메뉴에서 한 건씩 또는 전체 삭제할 수 있습니다.</li>
              <li>닉네임·언어·현재 리딩을 포함한 기기 내 정보는 브라우저의 사이트 데이터 삭제 기능으로 제거할 수 있습니다.</li>
              <li>익명 서버 세션은 개인을 직접 식별하는 계정과 연결되지 않으며, 최대 2시간 후 만료됩니다.</li>
              <li>정보주체 또는 법정대리인은 처리 여부 확인, 정정, 삭제 또는 처리 정지를 문의할 수 있습니다.</li>
              <li>내려받은 이미지와 클립보드에 복사한 텍스트는 서비스 밖에 있으므로 기기에서 직접 삭제해야 합니다.</li>
            </ul>
            <p>
              문의는 공개 저장소의 {" "}
              <a href="https://github.com/chococobyeol/tarot-milktea-web/issues" target="_blank" rel="noreferrer">GitHub Issues</a>를 이용할 수 있습니다.
              공개 문의에는 질문 원문이나 다른 개인정보를 적지 마세요.
            </p>
          </PolicySection>

          <PolicySection number="07" title="안전성 확보 조치">
            <p>
              서비스는 HTTPS, HttpOnly·SameSite 쿠키, HMAC 서명, 세션 ID와 네트워크 식별값의 해시화, 동일 출처
              검사, 입력 길이·형식 검증, 세션·네트워크별 요청 제한을 적용합니다. 배포 비밀값은 브라우저 코드나
              공개 저장소에 포함하지 않습니다.
            </p>
          </PolicySection>

          <PolicySection number="08" title="방침 변경과 문의">
            <p>
              처리 항목이나 외부 서비스가 달라지면 이 페이지의 버전과 시행일을 변경합니다. 중요한 변경이 있는
              경우 서비스 화면 또는 공개 저장소에서 알립니다.
            </p>
            <dl className="privacy-contact">
              <div><dt>개인정보 보호 담당</dt><dd>타로밀크티 웹 운영자</dd></div>
              <div><dt>문의 창구</dt><dd><a href="https://github.com/chococobyeol/tarot-milktea-web/issues" target="_blank" rel="noreferrer">GitHub Issues</a></dd></div>
              <div><dt>시행일</dt><dd>{EFFECTIVE_DATE}</dd></div>
            </dl>
          </PolicySection>

          <section className="privacy-english-summary" id="english-summary" lang="en">
            <p className="privacy-kicker">ENGLISH SUMMARY</p>
            <h2>Privacy summary</h2>
            <p>
              Tarot Milktea is a personal, account-free project. Your nickname and language preference stay in localStorage.
              The current reading stays in sessionStorage, and readings you explicitly save stay in IndexedDB on this browser.
            </p>
            <ul>
              <li>Your question, selected-card context and previous result for a follow-up are sent to Cloudflare Workers AI. Your nickname is not sent.</li>
              <li>An essential signed session cookie lasts up to two hours. D1 stores only its hash, timestamps and usage counters.</li>
              <li>Cloudflare Turnstile and Rate Limiting process network and browser signals to prevent abuse.</li>
              <li>The app includes no advertising or behavioral analytics SDK.</li>
              <li>Delete saved readings in History, or clear this site&apos;s browser data to remove all device-local data.</li>
              <li>Do not put real names, contact details, government IDs, financial, health, or another person&apos;s private information in a tarot question.</li>
            </ul>
            <p>Effective: July 17, 2026. The Korean text above is the primary policy.</p>
          </section>
        </article>
      </div>

      <footer className="privacy-footer">
        <span>TAROT MILKTEA WEB</span>
        <Link href="/">앱으로 돌아가기 →</Link>
      </footer>
    </main>
  );
}
