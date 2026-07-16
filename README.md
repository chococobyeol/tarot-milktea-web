# 타로밀크티 웹

질문에 따라 1~5장의 카드와 자리 역할을 구성하고, 사용자가 직접 선택한 카드의 관계를 AI가 분석하는 웹 타로 앱입니다. 최초 질문 뒤에는 최대 2회의 추가 질문을 지원합니다.

## 공개 사이트

- 앱: [https://tarot-milktea.cha-amu.workers.dev](https://tarot-milktea.cha-amu.workers.dev)
- 공개 소스: [https://github.com/chococobyeol/tarot-milktea-web](https://github.com/chococobyeol/tarot-milktea-web)

정적 화면과 같은 출처의 API를 하나의 Cloudflare Worker로 배포했습니다. 질문 구성과 카드 해석은 Workers AI, 익명 세션의 사용량 카운터는 D1을 사용합니다.

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

기본 주소는 `http://localhost:3000`입니다. Wrangler에 Cloudflare 계정 로그인이 되어 있으면 로컬 개발에서도 `AI` 바인딩을 통해 실제 Workers AI를 호출합니다. 선택 후보가 이미 확정된 질문은 AI가 일시적으로 실패해도 같은 답변 계약을 사용하는 로컬 해석으로 공개 흐름을 이어 갑니다. 반면 열린 추천·전망·조언·설명·분석처럼 AI의 의미 판단이 필요한 질문은 AI를 사용할 수 없을 때 판에 박힌 답을 만들지 않고 재시도를 안내합니다. 로컬 Workers AI 호출도 계정 사용량에 포함됩니다.

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
- 공개 빌드값 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: `vite.config.ts`의 운영 Turnstile site key (환경값으로 재정의 가능)
- Rate Limiting 바인딩 `SESSION_RATE_LIMITER`: 세션 기준 분당 10회
- Rate Limiting 바인딩 `NETWORK_RATE_LIMITER`: 네트워크 기준 분당 30회

Turnstile site key는 브라우저에 공개되는 식별자이므로 빌드 설정에 포함합니다. `SESSION_SECRET`과 `TURNSTILE_SECRET`은 Cloudflare의 암호화된 Worker secret으로만 저장합니다. 계정 식별자와 로컬 배포 설정도 저장소에 넣지 않으며 `.wrangler/` 전체를 Git에서 제외합니다. 운영 상태와 검증 기록은 `PROJECT_PLAN.md`에 정리합니다.

## 데이터와 저장 범위

- 78장 카드 의미: `src/data/tarot-cards.ko.json`
- 카드 이미지: `public/cards/`
- 해석 기록: 브라우저 IndexedDB에만 저장
- 닉네임: 브라우저 localStorage에만 저장하며 서버나 AI에 전달하지 않음
- 서버 D1: 익명 세션 해시, 만료 시각, AI 호출 수, 추가 질문 수만 저장

AI는 질문마다 `선택`, `추천`, `예/아니오`, `비교`, `전망`, `조언`, `설명`, `분석` 중 필요한 답변 형태를 정하고, 결과의 `verdict`에서 그 형태에 맞는 답을 첫 문장으로 반환합니다. 특정 메뉴나 질문별 답을 코드에 저장하지 않습니다. 사용자가 직접 적은 선택지만 서버가 보존하며, 열린 추천의 실제 후보와 해석은 AI가 질문 문맥에서 생성합니다.

카드 이미지는 프로젝트 제작자가 직접 그린 이미지를 사용합니다.

운영 의존성은 `npm audit --omit=dev` 기준 취약점 0건입니다. 전체 감사에는 마이그레이션 생성 도구 `drizzle-kit`이 내부적으로 사용하는 개발 전용 esbuild 때문에 중간 등급 경고가 남으므로, 로컬 개발 서버는 외부 네트워크에 공개하지 않습니다.

## 공개 범위와 권리

이 저장소에는 배포용 비밀값이나 계정 식별자를 포함하지 않습니다. 로컬·배포 환경의 비밀값은 `.env`, `.dev.vars` 또는 Cloudflare의 비밀값 설정으로만 관리합니다.

저장소 공개는 현재 소스와 제작 과정을 열람할 수 있게 하는 목적입니다. 별도의 `LICENSE` 파일은 아직 추가하지 않았으며, 코드와 카드 이미지의 재사용 조건은 별도로 허락하거나 라이선스를 정하기 전까지 부여되지 않습니다.
