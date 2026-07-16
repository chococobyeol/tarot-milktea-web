import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "타로밀크티 웹",
    template: "%s | 타로밀크티 웹",
  },
  description: "자연어 질문을 바탕으로 카드 구성과 해석 지표를 제공하는 AI 타로 웹 앱.",
  applicationName: "타로밀크티 웹",
  icons: { icon: "/milk-tea.png", apple: "/milk-tea.png" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
