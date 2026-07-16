import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "타로밀크티 웹의 개인정보 처리방침입니다.",
};

const CONTACT_EMAIL = "chaamu.channel@gmail.com";
const EFFECTIVE_DATE = "2026년 7월 17일";

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="privacy-section">
      <h2>{title}</h2>
      <div className="privacy-section-body">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <nav className="privacy-topbar" aria-label="페이지 이동">
        <Link href="/">← 타로밀크티 웹</Link>
      </nav>

      <article className="privacy-document">
        <header className="privacy-document-header">
          <p className="privacy-effective">시행일 {EFFECTIVE_DATE}</p>
          <h1>개인정보 처리방침</h1>
          <p className="privacy-lead">
            타로밀크티 웹(이하 “서비스”)은 서비스 제공에 필요한 최소한의 정보만 처리합니다.
            회원가입, 결제, 광고 추적 기능은 제공하지 않습니다.
          </p>
        </header>

        <PolicySection title="처리하는 정보">
          <ul>
            <li>이용자가 입력한 타로 질문, 선택한 카드와 방향, 언어, 생성된 해석</li>
            <li>브라우저에 저장되는 닉네임, 언어 설정, 진행 중인 리딩과 이용자가 직접 저장한 기록</li>
            <li>서비스 이용 중 처리될 수 있는 접속 정보, 익명 세션 쿠키, 요청·오류 정보와 Turnstile 봇 확인 정보</li>
          </ul>
          <p>
            닉네임은 서버나 AI로 전송하지 않습니다. 질문에는 실명, 연락처, 금융·건강정보 등 민감한
            개인정보나 타인의 개인정보를 입력하지 마세요.
          </p>
        </PolicySection>

        <PolicySection title="이용 목적">
          <p>
            위 정보는 질문에 맞는 카드 구성과 AI 해석 제공, 진행 중인 리딩 복원, 이용자가 선택한 기록
            저장, 서비스 오류 확인, 봇과 과도한 요청 방지를 위해 사용합니다.
          </p>
        </PolicySection>

        <PolicySection title="보유 및 삭제">
          <ul>
            <li>닉네임과 언어 설정, 진행 중인 리딩, 저장한 기록은 이용자의 브라우저에 보관됩니다.</li>
            <li>질문과 AI 해석 결과는 서비스의 D1 데이터베이스에 저장하지 않습니다.</li>
            <li>필수 세션 쿠키는 최대 2시간 유효하며, 관련 익명 세션 기록은 만료 후 정리됩니다.</li>
            <li>운영 로그는 장애 확인과 보안을 위해 Cloudflare의 설정과 정책에 따라 단기간 보관될 수 있습니다.</li>
          </ul>
          <p>브라우저에 저장된 정보는 기록 메뉴 또는 브라우저의 사이트 데이터 삭제 기능으로 제거할 수 있습니다.</p>
        </PolicySection>

        <PolicySection title="외부 서비스 이용">
          <p>서비스 운영을 위해 다음 외부 서비스를 사용합니다.</p>
          <ul>
            <li>
              <strong>Cloudflare</strong>: 웹 호스팅, API, D1, Workers AI, Turnstile, 요청 제한과 운영 로그
            </li>
            <li><strong>jsDelivr</strong>: 웹폰트 파일 제공</li>
          </ul>
          <p>
            AI 해석을 위해 질문과 카드 정보가 Cloudflare Workers AI로 전송됩니다. 외부 서비스에서는
            접속 정보와 요청 정보가 국외에서 처리될 수 있으며, 각 서비스의 정책이 적용됩니다.
          </p>
          <p className="privacy-related-links">
            <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare 개인정보 처리방침</a>
            <a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/" target="_blank" rel="noreferrer">Workers AI 데이터 이용 안내</a>
          </p>
        </PolicySection>

        <PolicySection title="쿠키와 브라우저 저장소">
          <p>
            서비스는 익명 세션 유지와 요청 보호를 위해 필수 세션 쿠키를 사용합니다. 광고 또는 맞춤형
            분석 쿠키는 사용하지 않습니다. 브라우저 저장을 차단하거나 삭제하면 설정 유지, 진행 중인
            리딩 복원, 이전 기록 기능이 정상적으로 동작하지 않을 수 있습니다.
          </p>
        </PolicySection>

        <PolicySection title="이용자의 권리">
          <p>
            이용자는 앱의 기록 화면에서 저장한 리딩을 삭제할 수 있으며, 브라우저의 사이트 데이터 삭제
            기능으로 기기에 저장된 설정과 기록을 모두 제거할 수 있습니다. 개인정보 처리에 관한 열람,
            정정, 삭제 또는 처리정지 요청은 아래 이메일로 접수할 수 있습니다.
          </p>
        </PolicySection>

        <PolicySection title="보호 조치">
          <p>
            서비스는 HTTPS 통신, 서명된 HttpOnly 세션 쿠키, 식별값 해시 처리, 허용 출처와 입력값 검사,
            세션·네트워크별 요청 제한, Turnstile 검증을 적용합니다.
          </p>
        </PolicySection>

        <PolicySection title="문의 및 변경">
          <p>
            개인정보 처리에 관한 문의는 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>으로 보내 주세요.
            서비스 기능이나 정보 처리 방식이 변경되면 이 페이지의 내용과 시행일을 갱신합니다.
          </p>
        </PolicySection>
      </article>

      <footer className="privacy-footer">
        <span>© 타로밀크티 웹</span>
        <Link href="/">앱으로 돌아가기</Link>
      </footer>
    </main>
  );
}
