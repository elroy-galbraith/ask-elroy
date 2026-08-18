# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key constraint

`index.html` is a **build artifact** — never edit it directly. Always edit files under `src/` and rebuild.

## Build and test

```bash
./build.sh                                        # concatenate src/* → index.html + syntax-check
node test/smoke.mjs                               # headless Playwright smoke test (boot, answer, refusal, eval)

# Playwright one-time setup (if not installed):
npm i -D playwright && npx playwright install chromium
```

The smoke test opens `index.html` in a headless browser, waits up to 180 s for embeddings to load, then checks: boot readiness, an in-scope answer, a refusal, a prompt injection, and the evaluation suite.

## Deploy the generation proxy

The Cloudflare Worker lives in `worker/`. It holds the API key and streams answers back to the browser.

```bash
cd worker
wrangler deploy
wrangler secret put ANTHROPIC_API_KEY
```

After deploying, paste the worker URL into `CONFIG.generatorUrl` in `src/engine.js` (line 13), then rebuild.

## Architecture

The app is a single `index.html` assembled from six source files by `build.sh`:

| File | Role |
|---|---|
| `src/head.html` | Markup, CSS, "How this works" prose |
| `src/corpus.js` | `PROFILE`, `CATS`, `BANK` — the only facts the agent can state |
| `src/eval.js` | `IDS`, `GOLDEN`, `OOS` — retrieval regression and refusal suites |
| `src/engine.js` | `CONFIG`, chunking, BM25, in-browser embeddings (MiniLM via transformers.js), hybrid retrieval, generation proxy call, groundedness check |
| `src/ui.js` | Chat UI, trace inspector, evaluation runner, boot sequence |
| `src/tail.html` | Closing tags |

**Pipeline per question:**
1. Chunk `BANK` into passages on first load.
2. Embed passages in-browser (`all-MiniLM-L6-v2` via transformers.js, WebGPU → WASM fallback).
3. On a question: BM25 score + dense cosine → RRF fusion → top-K passages.
4. Scope gate: refuse below `CONFIG.scopeThreshold` (hybrid) or `CONFIG.lexThreshold` (BM25-only fallback), before any model call.
5. `POST { question, passages }` to the Cloudflare Worker, which calls Anthropic and streams SSE back.
6. Groundedness check: flag the answer if citations are missing or out of range.

The Worker does **no retrieval** — it only holds the API key and proxies the Anthropic stream. The browser supplies the passages; the Worker cannot invent sources.

Without `CONFIG.generatorUrl` set, the app runs in retrieval-only mode (shows verbatim passage text instead of generated prose) — fully functional for testing retrieval and refusal.

## Editing the corpus

Each `BANK` entry is `{cat, q, k, a}` — category, canonical question, extra keywords (BM25 hints), answer HTML.

When adding an entry:
1. Add the entry to `BANK` in `src/corpus.js`.
2. Add its stable doc ID to `IDS` in `src/eval.js` at the same index position.
3. Add a `GOLDEN` row so the new answer is covered by the retrieval suite.
4. Run `./build.sh` and open the Evaluation tab to verify.

## Tuning the scope gate

The Evaluation tab sweeps the gate thresholds and shows the precision/recall trade-off. Adjust `CONFIG.scopeThreshold` (hybrid) and `CONFIG.lexThreshold` (BM25-only) in `src/engine.js`, rebuild, and re-run the Evaluation tab. The `GOLDEN` set covers in-scope retrieval; `OOS` covers refusals.

## In-browser debugging

The global `askElroy` exposes the full runtime without a rebuild:

```js
askElroy.CONFIG.scopeThreshold = 0.40
await askElroy.retrieve("does he need a visa")
askElroy.runEval()
```
