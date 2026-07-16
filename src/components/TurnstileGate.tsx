"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TurnstileStatus = "disabled" | "loading" | "ready" | "error";

interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string;
    theme: "light";
    appearance: "interaction-only";
    size: "flexible" | "compact";
    "refresh-expired": "auto";
    "refresh-timeout": "auto";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
  }): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileGateProps {
  onToken(token: string): void;
  onStatusChange?(status: TurnstileStatus): void;
  loadingLabel: string;
  errorLabel: string;
  ariaLabel: string;
}

export function TurnstileGate({
  onToken,
  onStatusChange,
  loadingLabel,
  errorLabel,
  ariaLabel,
}: TurnstileGateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const [status, setStatus] = useState<TurnstileStatus>(siteKey ? "loading" : "disabled");

  const reportStatus = useCallback((nextStatus: TurnstileStatus) => {
    setStatus(nextStatus);
    onStatusChange?.(nextStatus);
  }, [onStatusChange]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onToken("");
      reportStatus("disabled");
      return;
    }

    let widgetId = "";
    let scriptElement: HTMLScriptElement | null = null;
    const render = () => {
      if (!containerRef.current || !window.turnstile || widgetId) return;
      try {
        reportStatus("loading");
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          appearance: "interaction-only",
          size: containerRef.current.clientWidth < 300 ? "compact" : "flexible",
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (token) => {
            onToken(token);
            reportStatus("ready");
          },
          "expired-callback": () => {
            onToken("");
            reportStatus("loading");
          },
          "error-callback": () => {
            onToken("");
            reportStatus("error");
          },
        });
      } catch {
        onToken("");
        reportStatus("error");
      }
    };
    const fail = () => {
      onToken("");
      reportStatus("error");
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-tarot-turnstile="true"]');
    if (existing) {
      scriptElement = existing;
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
      existing.addEventListener("error", fail, { once: true });
    } else {
      const script = document.createElement("script");
      scriptElement = script;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.tarotTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", fail, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      scriptElement?.removeEventListener("load", render);
      scriptElement?.removeEventListener("error", fail);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, reportStatus, siteKey]);

  if (!siteKey) return null;
  return (
    <div className={`turnstile-gate is-${status}`} aria-live="polite">
      <div ref={containerRef} className="turnstile-slot" aria-label={ariaLabel} />
      {status === "loading" ? <p className="protection-note">{loadingLabel}</p> : null}
      {status === "error" ? <p className="protection-note protection-error">{errorLabel}</p> : null}
    </div>
  );
}
