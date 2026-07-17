# 타로밀크티 웹

질문에 따라 1~5장의 카드와 자리 역할을 구성하고, 사용자가 직접 선택한 카드의 관계를 AI가 분석하는 웹 타로 앱입니다. 최초 질문 뒤에는 최대 2회의 추가 질문을 지원합니다.

## 공개 사이트

- 앱: [https://tarot-milktea.cha-amu.workers.dev](https://tarot-milktea.cha-amu.workers.dev)
- 공개 소스: [https://github.com/chococobyeol/tarot-milktea-web](https://github.com/chococobyeol/tarot-milktea-web)

정적 화면과 같은 출처의 API를 하나의 Cloudflare Worker로 배포했습니다. 질문 구성과 카드 해석은 Workers AI를 우선 사용하고, 일일 무료 한도 소진·일시적인 공급자 오류·해석 품질 보정이 필요할 때 Groq의 Qwen 3.6 27B 구성 모델과 GPT-OSS 120B 해석 모델로 전환합니다. 해석 보정도 더 작은 모델로 낮추지 않고 GPT-OSS 120B를 유지합니다. 익명 세션의 사용량 카운터는 D1을 사용합니다.

## 문서

- [사이트 구조와 데이터 흐름](./SITE_STRUCTURE.md)
- [기획 및 결정 기록](./PROJECT_PLAN.md)
- [개인정보 처리방침](https://tarot-milktea.cha-amu.workers.dev/privacy)

## 로컬 실행

Node.js 22 LTS(22.13 이상) 또는 24 이상을 권장합니다. Node.js 23에서도 빌드는 되지만 일부 개발 도구가 엔진 경고를 표시합니다.

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. Wrangler에 Cloudflare 계정 로그인이 되어 있으면 로컬 개발에서도 `AI` 바인딩을 통해 실제 Workers AI를 호출합니다. `GROQ_API_KEY`가 서버 비밀값으로 설정된 환경에서는 Workers AI 한도·일시 오류 또는 생성된 해석의 품질 보정 때 Groq를 사용합니다. 질문 의미를 규칙 기반 로컬 코드로 다시 판정하거나 임의 답변으로 대체하지 않습니다. 두 AI 공급자를 모두 사용할 수 없으면 현재 카드 상태를 유지하고 재시도 오류를 표시합니다. 구조가 정상인 AI 응답은 문체 같은 부가 검사만으로 502 처리하지 않습니다. 로컬 Workers AI 호출도 계정 사용량에 포함됩니다.

## 확인 명령

```bash
npm run lint
npm test
npm run db:generate
```

## Cloudflare 운영 구성

현재 운영 배포에는 다음 바인딩과 비밀값이 설정되어 있습니다.

- Workers AI 바인딩: `AI`
- D1 바인딩: `DB`
- 비밀값 `SESSION_SECRET`: 충분히 긴 무작위 문자열
- 비밀값 `TURNSTILE_SECRET`: Turnstile secret key
- 비밀값 `GROQ_API_KEY`: Workers AI 한도·일시 오류와 품질 보정 시 사용하는 Groq 서버 키
- 공개 빌드값 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: `vite.config.ts`의 운영 Turnstile site key (환경값으로 재정의 가능)
- Rate Limiting 바인딩 `SESSION_RATE_LIMITER`: 세션 기준 분당 10회
- Rate Limiting 바인딩 `NETWORK_RATE_LIMITER`: 네트워크 기준 분당 30회

Turnstile site key는 브라우저에 공개되는 식별자이므로 빌드 설정에 포함합니다. `SESSION_SECRET`, `TURNSTILE_SECRET`, `GROQ_API_KEY`는 Cloudflare의 암호화된 Worker secret으로만 저장합니다. 계정 식별자와 로컬 배포 설정도 저장소에 넣지 않으며 `.wrangler/` 전체를 Git에서 제외합니다. 운영 상태와 검증 기록은 `PROJECT_PLAN.md`에 정리합니다.

## 데이터와 저장 범위

- 78장 카드 의미: `src/data/tarot-cards.ko.json`
- 카드 이미지: `public/cards/`
- 해석 기록: 브라우저 IndexedDB에만 저장
- 닉네임: 브라우저 localStorage에만 저장하며 서버나 AI에 전달하지 않음
- 서버 D1: 익명 세션 해시, 만료 시각, AI 호출 수, 추가 질문 수만 저장

AI는 질문 전체와 앞선 대화 문맥을 읽고 `선택`, `추천`, `예/아니오`, `결과`, `비교`, `전망`, `조언`, `설명`, `분석` 중 답변 형태와 1~5장의 카드 수, 각 자리 역할을 한 번에 정합니다. 이 AI plan이 이후 해석의 단일 기준이며, 서버가 키워드 정규식으로 종류나 카드 수를 다시 판정하지 않습니다. 사용자가 직접 제시한 후보만 질문 또는 앞선 계약에 실제로 존재하는지 확인하고, 열린 추천은 카드 공개 뒤 AI가 구체적인 답 하나를 처음 생성합니다. 서버 검증은 카드 ID·정역방향·자리·후보 출처·배열 길이·점수 범위 같은 기계적 무결성만 담당합니다. 질문 분야에 따른 의미 연결과 자연스러운 문장은 AI가 카드 원뜻과 자리 역할을 근거로 작성합니다.

카드 이미지는 프로젝트 제작자가 직접 그린 이미지를 사용합니다.

운영 의존성은 `npm audit --omit=dev` 기준 취약점 0건입니다. 전체 감사에는 마이그레이션 생성 도구 `drizzle-kit`이 내부적으로 사용하는 개발 전용 esbuild 때문에 중간 등급 경고가 남으므로, 로컬 개발 서버는 외부 네트워크에 공개하지 않습니다.

## 공개 범위와 권리

이 저장소에는 배포용 비밀값이나 계정 식별자를 포함하지 않습니다. 로컬·배포 환경의 비밀값은 `.env`, `.dev.vars` 또는 Cloudflare의 비밀값 설정으로만 관리합니다.

저장소 공개는 현재 소스와 제작 과정을 열람할 수 있게 하는 목적입니다. 별도의 `LICENSE` 파일은 아직 추가하지 않았으며, 코드와 카드 이미지의 재사용 조건은 별도로 허락하거나 라이선스를 정하기 전까지 부여되지 않습니다.
