import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Korean tarot title page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<title>타로밀크티 웹<\/title>/);
  assert.match(html, /AI TAROT READING/);
  assert.match(html, /타로를 볼 이름/);
  assert.match(html, /value="ㅇㅁ"/);
  assert.match(html, /타로 시작/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/);
});

test("production client includes the Turnstile site key without a local-mode label", async () => {
  const assetDirectory = new URL("../dist/client/assets/", import.meta.url);
  const filenames = (await readdir(assetDirectory)).filter((filename) => filename.endsWith(".js"));
  const clientSource = (await Promise.all(
    filenames.map((filename) => readFile(new URL(filename, assetDirectory), "utf8")),
  )).join("\n");

  assert.match(clientSource, /0x4AAAAAAD3E3F2jPclDupGH/);
  assert.doesNotMatch(clientSource, /로컬 보호 모드/);
  assert.doesNotMatch(clientSource, /LOCAL MODE/);
});

test("server-renders the privacy policy page", async () => {
  const response = await render("/privacy");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>개인정보 처리방침 \| 타로밀크티 웹<\/title>/);
  assert.match(html, /처리하는 정보/);
  assert.match(html, /Cloudflare Workers AI/);
  assert.match(html, /Workers AI의 사용 한도·일시 오류 또는 품질 보정 시에는 같은 정보와 현재 리딩 문맥이 Groq로 전송됩니다/);
  assert.match(html, /미국 소재 Google Cloud에 최대 30일간 임시 보관할 수 있습니다/);
  assert.match(html, /mailto:chaamu\.channel@gmail\.com/);
  assert.match(html, /href="\/"/);
});
