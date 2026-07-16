"use client";

import type { ReadingAxis, ReadingResult } from "@/src/lib/tarot";
import type { AppLanguage } from "@/src/lib/i18n";

function pointFor(index: number, count: number, value: number, radius: number, center: number): [number, number] {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  const scaled = radius * (value / 100);
  return [center + Math.cos(angle) * scaled, center + Math.sin(angle) * scaled];
}

function points(axes: ReadingAxis[], radius: number, center: number): string {
  return axes.map((axis, index) => pointFor(index, axes.length, axis.score, radius, center).join(",")).join(" ");
}

export function RadarChart({ axes, previous, language = "ko" }: { axes: ReadingAxis[]; previous?: ReadingAxis[]; language?: AppLanguage }) {
  const size = 320;
  const center = 160;
  const radius = 102;
  const comparablePrevious = previous?.length === axes.length && axes.every((axis) => previous.some((item) => item.label === axis.label))
    ? axes.map((axis) => previous.find((item) => item.label === axis.label)!)
    : undefined;

  return (
    <div className="radar-chart-wrap">
      <svg className="radar-chart" viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby="radar-title radar-desc">
        <title id="radar-title">{language === "ko" ? "질문별 AI 해석 지표" : "Question-specific AI interpretation metrics"}</title>
        <desc id="radar-desc">{axes.map((axis) => `${axis.label} ${axis.score}`).join(", ")}</desc>
        {[25, 50, 75, 100].map((level) => (
          <polygon
            key={level}
            className="radar-grid"
            points={axes.map((_, index) => pointFor(index, axes.length, level, radius, center).join(",")).join(" ")}
          />
        ))}
        {axes.map((axis, index) => {
          const [x, y] = pointFor(index, axes.length, 100, radius, center);
          const [labelX, labelY] = pointFor(index, axes.length, 128, radius, center);
          return (
            <g key={axis.label}>
              <line className="radar-axis" x1={center} y1={center} x2={x} y2={y} />
              <text className="radar-label" x={labelX} y={labelY - 4} textAnchor="middle">
                {axis.label}
              </text>
              <text className="radar-value" x={labelX} y={labelY + 13} textAnchor="middle">
                {axis.score}
              </text>
            </g>
          );
        })}
        {comparablePrevious ? <polygon className="radar-previous" points={points(comparablePrevious, radius, center)} /> : null}
        <polygon className="radar-current" points={points(axes, radius, center)} />
        {axes.map((axis, index) => {
          const [x, y] = pointFor(index, axes.length, axis.score, radius, center);
          return <circle key={axis.label} className="radar-dot" cx={x} cy={y} r="4" />;
        })}
      </svg>
      {comparablePrevious ? (
        <div className="chart-legend" aria-label="그래프 범례">
          <span><i className="legend-line previous" />{language === "ko" ? "이전" : "Previous"}</span>
          <span><i className="legend-line current" />{language === "ko" ? "현재" : "Current"}</span>
        </div>
      ) : null}
    </div>
  );
}

function SignalBar({ signals, label, language }: { signals: ReadingResult["signals"]; label?: string; language: AppLanguage }) {
  return (
    <div className={label ? "signal-row" : "signal-row no-label"}>
      {label ? <span className="signal-row-label">{label}</span> : null}
      <div className="signal-bar" role="img" aria-label={`${label ? `${label}: ` : ""}${language === "ko" ? `진행 ${signals.support}, 주의 ${signals.caution}, 불확실성 ${signals.uncertainty}` : `support ${signals.support}, caution ${signals.caution}, uncertainty ${signals.uncertainty}`}`}>
        <span className="signal-support" style={{ width: `${signals.support}%` }} />
        <span className="signal-caution" style={{ width: `${signals.caution}%` }} />
        <span className="signal-uncertainty" style={{ width: `${signals.uncertainty}%` }} />
      </div>
    </div>
  );
}

export function SignalDistribution({ signals, previous, language = "ko" }: { signals: ReadingResult["signals"]; previous?: ReadingResult["signals"]; language?: AppLanguage }) {
  return (
    <div className="signal-block" aria-label={language === "ko" ? "해석 신호 분포" : "Interpretation signal distribution"}>
      {previous ? <SignalBar signals={previous} label={language === "ko" ? "이전" : "Previous"} language={language} /> : null}
      <SignalBar signals={signals} label={previous ? (language === "ko" ? "현재" : "Current") : undefined} language={language} />
      <div className="signal-labels">
        <span><i className="signal-swatch support" />{language === "ko" ? "진행" : "Support"} {signals.support}</span>
        <span><i className="signal-swatch caution" />{language === "ko" ? "주의" : "Caution"} {signals.caution}</span>
        <span><i className="signal-swatch uncertainty" />{language === "ko" ? "불확실성" : "Uncertainty"} {signals.uncertainty}</span>
      </div>
    </div>
  );
}
