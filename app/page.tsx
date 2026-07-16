import type { Metadata } from "next";

import { TarotApp } from "@/src/components/TarotApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "질문에 맞춰 카드를 구성하고 AI가 카드 관계와 해석 지표를 분석하는 웹 타로.",
};

export default function Home() {
  return <TarotApp />;
}
