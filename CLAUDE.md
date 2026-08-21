# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key constraint

`index.html` and `src/vectors.js` are **build artifacts** — never edit them directly. Always edit the other files under `src/` and rebuild.

## Build and test

```bash
./build.sh                                        # embed (if stale) → verify → concatenate src/* → index.html + syntax-check
node test/smoke.mjs                               # headless Playwright smoke test (boot, answer, refusal, eval)

node tools/embed.mjs                              # force-regenerate src/vectors.js
node tools/embed.mjs --verify                     # check src/vectors.js against the corpus (no model needed)

# one-time setup (if not installed):
npm i -D playwright @huggingface/transformers && npx playwright install chromium
```

`./build.sh` needs network access to huggingface.co only when `src/vectors.js` is stale;
otherwise the embed step is a no-op. It **fails hard** rather than warning if the vectors
and the corpus disagree — see "Precomputed vectors" below.

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

The app is a single `index.html` assembled from eight source files by `build.sh`, in this order:

| File | Role |
|---|---|
| `src/head.html` | Markup, CSS, "How this works" prose |
| `src/corpus.js` | `PROFILE`, `CATS`, `BANK` — the only facts the agent can state |
| `src/eval.js` | `IDS`, `GOLDEN`, `OOS` — retrieval regression and refusal suites |
| `src/chunk.js` | `strip()`, `buildPassages()` — **shared verbatim with `tools/embed.mjs`** |
| `src/vectors.js` | Generated. int8 passage vectors + corpus SHA-256 + `pid` list |
| `src/engine.js` | `CONFIG`, BM25, vector decode, embedding-model cascade, hybrid retrieval, generation proxy call, groundedness check |
| `src/ui.js` | Chat UI, trace inspector, evaluation runner, boot sequence |
| `src/tail.html` | Closing tags |

**Boot (see `docs/adr/ADR-0001-ship-to-client-retrieval.md`):**
1. Chunk `BANK` into passages, build the BM25 index.
2. Decode `VECTORS` into `state.vecs` — synchronous, no network, no model.
3. Open in `state.mode = "lexical"` with `state.ready = true`. Answerable in well under 300 ms.
4. Load the embedding model in the background (`requestIdleCallback`, or the first question,
   whichever fires first). On success `state.mode` flips to `"hybrid"`. On failure the page
   stays lexical for the session — a working mode, not an error state.

**Pipeline per question:**
1. BM25 score + (in hybrid mode) dense cosine → RRF fusion → top-K passages.
2. Scope gate: refuse below `CONFIG.scopeThreshold` (hybrid) or `CONFIG.lexThreshold` (BM25-only), before any model call.
3. `POST { question, passages }` to the Cloudflare Worker, which calls Anthropic and streams SSE back.
4. Groundedness check: flag the answer if citations are missing or out of range.

## Precomputed vectors

`tools/embed.mjs` embeds the corpus at build time with the same model the browser uses
(`Xenova/all-MiniLM-L6-v2`, `{ pooling: "mean", normalize: true }`) and writes `src/vectors.js`.

The vectors are **positional** — vector *i* is passage *i*. If the build script and the browser
chunk differently, retrieval silently returns the wrong passages and nothing throws. Two
defences:

- `buildPassages()` is not duplicated. `tools/embed.mjs` evaluates `src/chunk.js` itself, so
  there is exactly one definition.
- `build.sh` runs `node tools/embed.mjs --verify` and **fails the build** if the recorded
  corpus SHA-256, `pid` list, model id, passage count or payload length disagree with the
  current sources. This is never a warning.

`tools/embed.mjs` is a build-time dev dependency. Nothing it uses reaches the browser bundle.

A message that looks like a pasted job description short-circuits step 3: `ask()` calls `looksLikeJobDescription()` (`src/ui.js`) and **offers** the fit check instead — two chips, run it or ask it as a question anyway. It never auto-routes, so a false positive costs one click. Tune the heuristic via `JD_STRONG` / `JD_MARKERS`; `askElroy.looksLikeJobDescription(text)` exposes it in the console.

The Worker does **no retrieval** — it only holds the API key and proxies the Anthropic stream. The browser supplies the passages; the Worker cannot invent sources.

Without `CONFIG.generatorUrl` set, the app runs in retrieval-only mode (shows verbatim passage text instead of generated prose) — fully functional for testing retrieval and refusal.

## Editing the corpus

Each `BANK` entry is `{cat, q, k, a}` — category, canonical question, extra keywords (BM25 hints), answer HTML.

When adding an entry:
1. Add the entry to `BANK` in `src/corpus.js`.
2. Add its stable doc ID to `IDS` in `src/eval.js` at the same index position.
3. Add a `GOLDEN` row so the new answer is covered by the retrieval suite.
4. Run `./build.sh` — it regenerates `src/vectors.js` (needs huggingface.co) and refuses to
   build if the vectors and the corpus disagree. Commit `src/vectors.js` with the change.
5. Open the Evaluation tab to verify.

## Tuning the scope gate

The Evaluation tab sweeps the gate thresholds and shows the precision/recall trade-off. Adjust `CONFIG.scopeThreshold` (hybrid) and `CONFIG.lexThreshold` (BM25-only) in `src/engine.js`, rebuild, and re-run the Evaluation tab. The `GOLDEN` set covers in-scope retrieval; `OOS` covers refusals.

## In-browser debugging

The global `askElroy` exposes the full runtime without a rebuild:

```js
askElroy.CONFIG.scopeThreshold = 0.40
await askElroy.retrieve("does he need a visa")
askElroy.runEval()
askElroy.bootPerf            // per-stage cold-start timings, also on the Trace tab
```
