# 타로밀크티 웹 사이트 구조

- 문서 목적: 현재 운영 코드의 화면, 라우트, 데이터 흐름과 저장 경계를 빠르게 파악하기 위한 구현 문서
- 기준 버전: 2026-07-17
- 운영 주소: <https://tarot-milktea.cha-amu.workers.dev>
- 관련 문서: [README.md](./README.md), [PROJECT_PLAN.md](./PROJECT_PLAN.md), [개인정보 처리방침](https://tarot-milktea.cha-amu.workers.dev/privacy)

`PROJECT_PLAN.md`가 결정 과정과 기획 의도를 기록한다면, 이 문서는 실제 코드가 현재 어떻게 연결되어 있는지를 설명한다. 기능이나 데이터 처리가 바뀌면 배포와 함께 이 문서도 갱신한다.

## 1. 서비스 구성 요약

타로밀크티 웹은 Vinext 기반 React 앱과 같은 출처의 Worker API를 한 Cloudflare Worker에 배포한다.

- HTML: Vinext 서버 렌더링 후 React 클라이언트 앱으로 수화
- JS, CSS, 카드 이미지: Worker 정적 자산
- AI API: `/api/tarot`
- 익명 세션 API: `/api/session`
- AI 추론: Cloudflare Workers AI 우선, 일일 한도 소진 시 Groq
- 익명 세션 카운터: Cloudflare D1
- 봇 감지: Cloudflare Turnstile
- 과다 요청 방지: Cloudflare Rate Limiting + D1 세션 상한
- 이용자 리딩 기록: 서버가 아니라 브라우저 IndexedDB

따라서 화면 자산은 정적이지만 사이트 전체를 완전한 정적 사이트라고 부르지는 않는다. 첫 HTML과 API Route는 Worker 런타임을 사용한다.

```text
브라우저
  ├─ 화면 자산 ───────────────> Worker 정적 자산
  ├─ POST /api/session ───────> Turnstile 검증 ─> 익명 쿠키 + D1 카운터
  └─ POST /api/tarot ─────────> 요청 검증/사용량 제한 ─> Workers AI
                                ├─ 정상 ────────────────> 구조화 JSON 응답
                                └─ 일일 한도 소진 ─────> Groq ─> 구조화 JSON 응답
```

## 2. 라우트

| 경로 | 역할 | 주요 구현 |
|---|---|---|
| `/` | 홈부터 결과까지 이어지는 타로 앱 | `app/page.tsx`, `src/components/TarotApp.tsx` |
| `/privacy` | 개인정보 처리방침 | `app/privacy/page.tsx` |
| `/api/session` | Turnstile을 확인하고 2시간 익명 세션 발급 | `app/api/session/route.ts` |
| `/api/tarot` | 질문별 카드 구성 또는 선택 카드 해석 | `app/api/tarot/route.ts` |

`app/layout.tsx`는 공통 메타데이터, 아이콘과 전역 스타일을 제공한다. `/privacy`에서 `/`로 돌아오면 같은 탭의 `sessionStorage`가 남아 있는 경우 진행 중이던 리딩을 복원한다.

## 3. 사용자 화면 흐름

`TarotApp`은 URL을 단계별로 바꾸지 않고 명시적인 `Phase` 상태로 한 리딩을 진행한다.

```text
home
  → question
  → planning
  → plan
  → shuffling
  → selecting
  → interpreting
  → revealing
  → result
       └─ follow-up 0~2회 → planning부터 반복
```

| 단계 | 사용자에게 보이는 내용 | 처리 |
|---|---|---|
| `home` | 이름 입력, 이전 기록, 설정 | 닉네임과 언어를 브라우저에 저장 |
| `question` | 자연어 질문, 예시, Turnstile | 익명 세션 생성 후 질문 제출 |
| `planning` | 카드 구성을 정하는 대기 화면 | AI가 1~5장과 자리 역할을 설계 |
| `plan` | 카드 수, 자리, 해석 범위 확인 | 질문 수정 또는 셔플 시작 |
| `shuffling` | 리플 셔플 애니메이션과 건너뛰기 | 약 3.8초 뒤 선택 단계 이동 |
| `selecting` | 펼친 78장 덱과 선택 자리 | 사용자가 정해진 수만큼 직접 선택 |
| `interpreting` | 선택 카드 분석 대기 | AI가 카드별·종합·지표 JSON 생성 |
| `revealing` | 카드 자체를 눌러 순차 공개 | 정·역방향, 자리와 짧은 해석 표시 |
| `result` | 종합, 카드 근거, AI 지표 | 로컬 저장, 복사, 이미지 저장, 추가 질문 |

정방향과 역방향은 세션 덱 생성 시 카드마다 50% 확률로 정하고, 공개 전에는 사용자에게 노출하지 않는다. 같은 리딩의 추가 질문에서는 이미 선택한 카드를 덱에서 제외한다.

## 4. AI 요청 흐름

AI 요청은 설계와 해석으로 분리한다.

### 4.1 카드 구성

브라우저가 질문, 후속 질문 여부, 언어와 이전 답변 문맥을 `/api/tarot`에 보낸다. 서버는 질문 범위와 카드 수를 검증한 뒤 Workers AI에 1~5장의 자리 구성과 `answerContract`를 요청한다. Workers AI가 정확한 일일 무료 한도 초과 오류를 반환하고 `GROQ_API_KEY`가 설정된 경우에만 Groq의 `qwen/qwen3.6-27b`로 같은 요청을 전환한다. 이 모델은 추론 출력을 끈 JSON Object Mode 응답을 만들고 기존 Zod·품질 검사를 그대로 통과해야 한다. 일반 장애, 용량 부족, 품질 검사 실패에는 공급자를 바꾸지 않는다. 일반 질문의 의미 분류와 열린 추천 후보는 AI가 결정한다. 서버의 로컬 분류기는 AI를 사용할 수 없을 때 보조하고, 사용자가 “추천”, “왜”, “비교”처럼 요구 형태를 명시한 경우의 계약 오류만 제한적으로 검사한다. 원인·이유처럼 답의 형식이 명확한 질문 안에 후보처럼 보이는 구절이 있더라도 선택 질문으로 바꾸지 않는다. 사용자가 질문에 직접 적은 2~5개 선택지는 AI가 다른 후보로 바꾸지 못하도록 서버가 보존한다.

응답 주요 필드:

- `cardCount`
- `positions[].id`
- `positions[].title`
- `positions[].focus`
- `interpretationFrame`
- `selectionGuide`
- `answerContract.kind`: `choose_one`, `recommend_one`, `yes_no`, `compare`, `forecast`, `advice`, `explain`, `analysis`
- `answerContract.subject`, `answerContract.candidates`, `answerContract.decisive`

### 4.2 카드 해석

브라우저가 질문, 선택 카드 ID, 정·역방향, 자리, 설계 단계의 `answerContract`, 이전 결과와 구조화된 후속 질문 문맥을 전송한다. 서버는 선택된 카드의 로컬 의미 데이터만 프롬프트에 추가한다.

해석도 Workers AI를 우선 사용하고, 일일 한도 소진 시에만 Groq의 `openai/gpt-oss-120b`로 전환한다. Groq 응답에는 Strict JSON Schema를 적용하고 기존 Zod 스키마와 해석 품질 검사를 다시 통과시킨다. 첫 응답이 스키마 또는 품질 검사를 통과하지 못한 경우에만 별도 모델 한도를 쓰는 `openai/gpt-oss-20b`로 한 번 보정한다. Groq의 분당 토큰 한도를 고려해 각 해석 출력 상한은 2,600토큰으로 제한하며, 429·인증·요청 오류에는 반복 재시도하지 않는다.

응답 주요 필드:

- 종합 요약과 판단 기준
- `verdict.kind`, `verdict.value`, `verdict.statement`: 질문이 요구한 형태의 직접 답
- 카드별 원뜻, 질문 연결 근거와 판단 영향
- 확인할 점
- 신호 분포: 지지, 주의, 불확실성
- 질문별 3~5개 해석 축과 근거 카드
- 타로 해석의 한계 문구

`src/lib/schemas.ts`의 Zod 스키마가 요청과 응답 형태를 검증하고, `src/lib/reading-quality.ts`가 직접 답의 존재, 후보 보존, 첫 문장의 결론, 한국어 구체성, 카드 근거, 질문 범위 이탈과 내부 필드 노출을 검사한다. AI가 작성한 본문을 고정 문장으로 다시 만들지는 않는다. 카드 ID·방향·원뜻·원자료 표시는 서버 데이터로 고정하고, 품질 검사를 통과하지 못한 AI 응답만 오류 이유와 함께 제한된 횟수로 재시도한다.

후속 질문은 이전 질문을 문자열로 합치지 않고 `initialQuestion`, `previousQuestions`, `previousAnswer`, `previousContract`로 전달한다. “그래서 정확히 어느 쪽” 같은 질문은 이전 후보를 이어받고, 새로운 대상의 질문은 이전 후보나 그래프 축을 상속하지 않는다.

## 5. 데이터와 저장 경계

| 위치 | 저장 내용 | 유지 범위 |
|---|---|---|
| `localStorage` | 닉네임, 언어 | 값을 바꾸거나 사이트 데이터 삭제 시까지 |
| `sessionStorage` | 진행 단계, 질문, 덱, 선택 카드, 결과, 추가 질문 | 현재 브라우저 탭 세션과 앱 초기화 범위 |
| IndexedDB | 사용자가 저장한 리딩 전체 | 기록 메뉴 또는 사이트 데이터에서 삭제할 때까지 |
| 필수 쿠키 | 서명된 무작위 익명 세션 | 최대 2시간 |
| D1 | 세션 ID 해시, 생성·만료 시각, AI 호출 수, 추가 질문 수 | 유효기간 2시간, 만료 행은 이후 새 세션 생성 때 정리 |
| Workers AI | 질문과 카드 문맥을 요청 처리 중 사용 | 앱이 별도 AI 콘텐츠 저장소에 보관하지 않음 |
| Groq | Workers AI 일일 한도 소진 시 질문과 카드 문맥을 요청 처리 중 사용 | 기본 추론 요청은 미보관. 신뢰성·악용 조사 시 미국 GCP에 최대 30일 임시 보관 가능하며 계정에서 ZDR 설정 가능 |

닉네임은 서버와 AI 공급자에 보내지 않는다. 질문과 AI 결과는 현재 리딩 복구를 위해 `sessionStorage`에 들어가며, 사용자가 `저장`을 눌렀을 때만 별도 IndexedDB 기록이 생성된다. 앱의 D1에는 질문, 닉네임, 선택 카드 또는 AI 결과를 저장하지 않는다.

개인정보 처리의 전체 설명은 `/privacy` 페이지를 기준으로 한다. 저장 위치나 외부 서비스가 바뀌면 코드, 이 문서와 개인정보 처리방침을 같은 변경에서 함께 갱신한다.

## 6. 보안과 사용량 보호

- Cloudflare Turnstile Managed 검증
- 24바이트 무작위 세션 ID와 HMAC 서명
- HTTPS에서 `Secure`, 항상 `HttpOnly`, `SameSite=Strict` 쿠키
- D1에는 원본 세션 ID 대신 SHA-256 해시 저장
- IP와 User-Agent를 비밀값과 결합해 해시한 네트워크 제한 키
- 세션 기준 분당 10회, 네트워크 기준 분당 30회 제한
- 한 익명 세션에서 사용자 AI API 요청 최대 6회
- 추가 질문 최대 2회
- 동일 출처, JSON Content-Type, 32KB 본문 상한과 Zod 입력 검증
- 카드 ID, 중복 선택, 라운드별 최대 5장 서버 재검증
- API 응답과 오류에 `cache-control: no-store`

브라우저에 공개되는 Turnstile site key 외에 `SESSION_SECRET`, `TURNSTILE_SECRET`, `GROQ_API_KEY` 같은 비밀값은 Worker secret으로만 관리한다. 문서와 저장소에는 실제 비밀값, 계정 ID 또는 배포 자격증명을 기록하지 않는다.

## 7. 주요 파일 지도

```text
app/
  layout.tsx                 공통 메타데이터와 루트 레이아웃
  page.tsx                   타로 앱 진입점
  globals.css                전체 게임 UI와 정책 페이지 스타일
  privacy/page.tsx           개인정보 처리방침
  api/session/route.ts       익명 세션 발급
  api/tarot/route.ts         AI 카드 구성·해석

src/
  components/TarotApp.tsx    전체 화면 상태와 사용자 흐름
  components/TurnstileGate.tsx
  components/ReadingCharts.tsx
  data/tarot-cards.ko.json   78장 의미 데이터
  lib/api.ts                 브라우저 API 클라이언트
  lib/i18n.ts                한국어·영어 UI 문구
  lib/schemas.ts             API Zod 스키마
  lib/storage.ts             IndexedDB 읽기·쓰기·삭제
  lib/tarot.ts               덱, 카드 데이터와 로컬 해석
  lib/reading-quality.ts     AI 해석 품질 검사와 문장 보정
  server/ai-provider.ts      Workers AI 한도 감지와 Groq 조건부 전환
  server/ai-schemas.ts       Groq Strict JSON Schema
  server/security.ts         세션, Turnstile, Rate Limiting, D1

public/cards/                운영 카드 이미지
drizzle/                     D1 마이그레이션
tests/                       서버 렌더링·운영 빌드 검사
```

## 8. Cloudflare 바인딩

운영 Worker는 다음 논리 이름을 사용한다.

| 바인딩 | 용도 |
|---|---|
| `AI` | Workers AI 모델 실행 |
| `DB` | 익명 세션 카운터 D1 |
| `ASSETS` | 정적 클라이언트 자산 |
| `SESSION_RATE_LIMITER` | 서명 세션 기준 단기 제한 |
| `NETWORK_RATE_LIMITER` | 익명화한 네트워크 기준 단기 제한 |
| `GROQ_API_KEY` | Workers AI 일일 한도 소진 시 사용하는 암호화된 서버 비밀값 |

배포용 실제 리소스 식별자와 secret은 로컬 전용 설정 또는 Cloudflare에만 둔다.

## 9. 검증과 배포

```bash
npm run lint
npm test
```

`npm test`는 운영 빌드, 카드·해석·보안 단위 테스트와 주요 경로의 서버 렌더링 검사를 실행한다. 화면 구조를 바꿀 때는 데스크톱, 중간 폭, 390px 모바일과 320px 짧은 모바일에서 실제 사용자 흐름을 함께 확인한다.

현재 운영 배포는 빌드 결과를 기존 Cloudflare Worker에 올리는 방식이다. AI, D1, Rate Limiting, Turnstile secret이 연결된 기존 Worker 구성을 보존해야 하므로 새 배포 프로젝트를 임의로 만들지 않는다.

## 10. 변경 시 함께 확인할 항목

- 새 화면이나 URL을 추가하면 이 문서의 라우트와 파일 지도를 갱신한다.
- 저장 데이터가 달라지면 `src/lib/storage.ts`, 복원 상태, 개인정보 처리방침을 함께 확인한다.
- AI 입력이나 모델을 바꾸면 스키마, 품질 검사, 무료 사용량과 정책 문구를 확인한다.
- Cloudflare 서비스를 추가하면 바인딩, 외부 처리 범위와 개인정보 처리방침을 갱신한다.
- 설정 문구를 추가하면 한국어와 영어를 함께 작성한다.
- 모바일 하단 고정 UI에는 safe-area를 반영한다.
