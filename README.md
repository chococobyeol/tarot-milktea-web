# 타로밀크티 웹

질문에 따라 1~5장의 카드와 자리 역할을 구성하고, 사용자가 직접 선택한 카드의 관계를 AI가 분석하는 웹 타로 앱입니다. 최초 질문 뒤에는 최대 2회의 추가 질문을 지원합니다.

## 로컬 실행

Node.js 22 LTS(22.13 이상) 또는 24 이상을 권장합니다. Node.js 23에서도 빌드는 되지만 일부 개발 도구가 엔진 경고를 표시합니다.

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. Wrangler에 Cloudflare 계정 로그인이 되어 있으면 로컬 개발에서도 `AI` 바인딩을 통해 실제 Workers AI를 호출합니다. 로그인이 없거나 AI 바인딩을 제거한 환경에서는 동일한 응답 스키마를 사용하는 규칙 기반 로컬 해석 모드로 동작합니다. 로컬 Workers AI 호출도 계정 사용량에 포함됩니다.

## 확인 명령

```bash
npm run lint
npm test
npm run db:generate
```

## Cloudflare 배포 시 필요한 설정

코드는 Cloudflare Pages/Sites의 Worker 런타임과 D1을 기준으로 구성되어 있습니다. 실제 배포 단계에서 다음 바인딩과 비밀값을 설정해야 합니다.

- Workers AI 바인딩: `AI`
- D1 바인딩: `DB`
- 비밀값 `SESSION_SECRET`: 충분히 긴 무작위 문자열
- 비밀값 `TURNSTILE_SECRET`: Turnstile secret key
- 공개 환경값 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Turnstile site key
- Rate Limiting 바인딩 `SESSION_RATE_LIMITER`: 세션 기준 분당 10회
- Rate Limiting 바인딩 `NETWORK_RATE_LIMITER`: 네트워크 기준 분당 30회

계정이나 비밀키는 저장소에 넣지 않습니다. 배포 전에는 `PROJECT_PLAN.md`의 배포 체크리스트도 확인합니다.

## 데이터와 저장 범위

- 78장 카드 의미: `src/data/tarot-cards.ko.json`
- 카드 이미지: `public/cards/`
- 해석 기록: 브라우저 IndexedDB에만 저장
- 닉네임: 브라우저 localStorage에만 저장하며 서버나 AI에 전달하지 않음
- 서버 D1: 익명 세션 해시, 만료 시각, AI 호출 수, 추가 질문 수만 저장

카드 이미지는 프로젝트 제작자가 직접 그린 이미지를 사용합니다.

운영 의존성은 `npm audit --omit=dev` 기준 취약점 0건입니다. 전체 감사에는 마이그레이션 생성 도구 `drizzle-kit`이 내부적으로 사용하는 개발 전용 esbuild 때문에 중간 등급 경고가 남으므로, 로컬 개발 서버는 외부 네트워크에 공개하지 않습니다.

## 공개 범위와 권리

이 저장소에는 배포용 비밀값이나 계정 식별자를 포함하지 않습니다. 로컬·배포 환경의 비밀값은 `.env`, `.dev.vars` 또는 Cloudflare의 비밀값 설정으로만 관리합니다.

저장소 공개는 현재 소스와 제작 과정을 열람할 수 있게 하는 목적입니다. 별도의 `LICENSE` 파일은 아직 추가하지 않았으며, 코드와 카드 이미지의 재사용 조건은 별도로 허락하거나 라이선스를 정하기 전까지 부여되지 않습니다.
