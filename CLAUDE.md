# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key constraint

`index.html` and `src/vectors.js` are **build artifacts** — never edit them directly. Always edit the other files under `src/` and rebuild.

## Build and test

```bash
./build.sh                                        # embed (if stale) → verify → concatenate src/* → index.html + syntax-check
node test/smoke.mjs                               # headless Playwright smoke test (boot, answer, refusal, eval)
node --test test/*.test.mjs                       # unit tests for worker/worker.js exports (no network)

node tools/embed.mjs                              # force-regenerate src/vectors.js
node tools/embed.mjs --verify                     # check src/vectors.js against the corpus (no model needed)

# one-time setup (if not installed):
npm i -D playwright @huggingface/transformers && npx playwright install chromium
```

`./build.sh` needs network access to huggingface.co only when `src/vectors.js` is stale;
otherwise the embed step is a no-op. It **fails hard** rather than warning if the vectors
and the corpus disagree — see "Precomputed vectors" below.

The smoke test opens `index.html` in a headless browser, waits up to 180 s for embeddings to load, then checks: boot readiness, an in-scope answer, a refusal, a prompt injection, and the evaluation suite. It stubs the Worker origin entirely, so it cannot catch provider-side regressions like sampling drift — see "Fit-score determinism" below.

## Deploy the generation proxy

The Cloudflare Worker lives in `worker/`. It holds the API key and streams answers back to the browser.

```bash
cd worker
wrangler deploy
wrangler secret put ANTHROPIC_API_KEY
```

Schema changes go through `worker/schema.sql`, which carries the migration for each column
or table added since the first deploy, and a note on whether it has to run before
`wrangler deploy` or can follow it.

After deploying, paste the worker URL into `CONFIG.generatorUrl` in `src/engine.js` (line 13), then rebuild.

## Architecture

The app is a single `index.html` assembled from nine source files by `build.sh`, in this order:

| File | Role |
|---|---|
| `src/head.html` | Markup, CSS, "How this works" prose |
| `src/corpus.js` | `PROFILE`, `CATS`, `BANK` — the only facts the agent can state |
| `src/eval.js` | `IDS`, `GOLDEN`, `PARAPHRASE`, `OOS` — retrieval regression, held-out phrasings, refusal suite |
| `src/chunk.js` | `strip()`, `buildPassages()` — **shared verbatim with `tools/embed.mjs`** |
| `src/vectors.js` | Generated. int8 passage vectors + corpus SHA-256 + `pid` list |
| `src/engine.js` | `CONFIG`, BM25, vector decode, embedding-model cascade, hybrid retrieval, generation proxy call, groundedness check |
| `src/ui.js` | Chat UI, trace inspector, evaluation runner, boot sequence |
| `src/voice.js` | Mic input (`SpeechRecognition`) and spoken answers (`speechSynthesis`) — see "Voice interaction" below |
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
2. Scope gate: answer if `cosine >= CONFIG.scopeThreshold` **or** `coverage >= CONFIG.covThreshold` (hybrid), or `coverage >= CONFIG.lexThreshold` (BM25-only) — before any model call. Two signals, either one suffices; see ADR-0002.
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

## Voice interaction

`src/voice.js` layers voice onto the existing `ask()` loop — it is an input/output adapter, not
a second pipeline. No new backend, no new secret, no new spend: both directions run entirely on
the browser's Web Speech API.

- **Input**: the mic button (`#mic-btn`) starts `SpeechRecognition`; on a final transcript it
  calls `ask(transcript)` directly, same as typing and pressing Ask.
- **Output**: the speaker toggle (`#voice-btn`, off by default, persisted in `localStorage` under
  `askElroyVoiceOut`) speaks the finished answer with `speechSynthesis` — the generated answer,
  the retrieval-only fallback passage, and the refusal message all go through the same `speak()`,
  which strips citation markers (`CITE_RE`) and HTML tags first. A new question calls
  `stopSpeaking()` before it does anything else, so it always interrupts a still-talking reply.
- **Feature detection, not a permissions probe**: both buttons render `display:none` in
  `src/head.html` and only `voice.js` un-hides the one whose API constructor actually exists
  (`window.SpeechRecognition || window.webkitSpeechRecognition` for STT, `"speechSynthesis" in
  window` for TTS). Chrome/Edge have both; Safari and Firefox mostly lack `SpeechRecognition`, so
  the mic button simply never appears there — the same "a working mode, not an error state"
  pattern as the hybrid → lexical retrieval fallback. Chrome's `SpeechRecognition` sends audio to
  Google's servers to do the recognition; there is no purely local STT path in the browser today,
  which is why this stays opt-in (a click) rather than on by default.
- `askElroy.voice` (`{ supported, listening, speakOn }`) and `askElroy.speak(text)` are exposed
  in the console for debugging, same as the rest of the runtime.

## Editing the corpus

Each `BANK` entry is `{cat, q, k, a}` — category, canonical question, extra keywords (BM25 hints), answer HTML.

When adding an entry:
1. Add the entry to `BANK` in `src/corpus.js`.
2. Add its stable doc ID to `IDS` in `src/eval.js` at the same index position.
3. Add a `GOLDEN` row so the new answer is covered by the retrieval suite.
   Also add a `PARAPHRASE` row — the same doc asked in words the passage does not use.
   `GOLDEN` alone is vocabulary-biased toward BM25 and will flatter the retriever.
4. Run `./build.sh` — it regenerates `src/vectors.js` (needs huggingface.co) and refuses to
   build if the vectors and the corpus disagree. Commit `src/vectors.js` with the change.
5. Open the Evaluation tab to verify.

The new `corpusSha256` retires every cached fit panel on its own — the key stops matching,
so no scorecard survives citing a passage that has moved. The orphaned rows linger until
pruned; see "The fit-panel cache" below.

## Tuning the scope gate

The gate reads **two** signals and needs either one: max dense cosine
(`CONFIG.scopeThreshold`, 0.40) or BM25 term coverage (`CONFIG.covThreshold`, 0.48). In
BM25-only boot mode there is no dense arm and `CONFIG.lexThreshold` (0.44) carries it alone.
`passesGate()` in `src/engine.js` is the only definition; `retrieve()` returns `inScope` so
no call site re-implements it. Rationale and measurements: ADR-0002.

The Evaluation tab sweeps the dense arm with the lexical arm held where the live gate has
it, and reports what a cosine-only gate would answer at the same refusal rate.

Tune against **all three** suites. `GOLDEN` (66) and `PARAPHRASE` (36) are both in-scope and
must both be answered; `OOS` (39) must be refused. Tuning on `GOLDEN` alone is what produced
a gate that refused golden queries whose every content word was in the passage.

`OOS` deliberately contains eight `not in corpus` queries — "what is his managers name at
yoii" scores cosine 0.77 — that **no** gate can catch, because both signals measure topical
similarity and neither measures answerability. They are expected to reach the model, which
refuses them for lack of supporting passages. Do not tune trying to catch them.

## The fit-input floor

The Fit tab spends two paid passes per submission — the rubric/skeptic/advocate panel and
the narrative. Before issue #25 it submitted whatever was in `#fit-jd`: a visitor sent a
**single word** and got the whole pipeline, then a courteous scorecard explaining that the
job description consisted of one word.

`fitInputTooThin()` (`src/ui.js`) now gates `submitFit()` before `busy` is set or any tab
switches, and `jdTooThin()` (`worker/worker.js`) applies the identical rule to `/fit` and
`/fit/score` so the endpoints can't be driven into paid calls regardless of client state.
Same two constants on both sides, deliberately: a server floor that disagreed with the
browser's would either reject what the page had just promised to score or admit what it had
just refused. Rejection is not silent — `#fit-hint` says what the field wants ("Paste the
full job description — a title alone isn't enough to score against") and clears on the next
keystroke.

The rule is **a floor on substance, not a classifier**: at least 8 words *or* 50 characters.

- It does **not** reuse `looksLikeJobDescription()`. That predicate is tuned for precision on
  the *chat* box, where a false positive costs one wrong offer; it demands 220 characters plus
  corroborating markers, which would refuse a terse but real posting — exactly what someone on
  this tab is asking to have scored. The smoke test's own short JD ("Senior Go engineer
  building RAG systems; must lead a small team.", 11 words) is the ceiling the floor has to
  stay under.
- JD vocabulary does **not** earn a shorter input a pass either. "Requirements: 5+ years of
  experience" is six words and three `JD_MARKERS` hits, and scoring a fragment produces exactly
  the artefact this floor exists to prevent.
- Words **or** characters, because a Japanese posting carries its substance without spaces. A
  word count alone would refuse every CJK job description outright; a CJK role title runs ~15
  characters, a CJK posting far more.

Anything above the floor is admitted and left to the model to answer honestly. Refusing
mid-length input would mean guessing at whether a posting written in unfamiliar vocabulary is
genuine, and that is the error this codebase pays for twice over.

`askElroy.fitInputTooThin(text)` exposes it in the console. `test/fit-jd-floor.test.mjs` covers
the worker half offline; `test/smoke.mjs` asserts the browser half by request count — a one-word
submission must reach the worker **zero** times — not by what the page renders.

## Fit-score determinism

The rubric/skeptic/advocate panel (`handleScore()` → `callJSON()` in `worker/worker.js`) is
a scoring task, not prose generation, so it must not sample at the provider's default
temperature. `callJSON()` sends `temperature: SCORE_TEMPERATURE` (0) and a fixed
`seed: SCORE_SEED` on every panel call. Neither is a determinism guarantee — batching and
MoE routing still introduce provider-side variance — they narrow the distribution, they
don't collapse it. Exact-input reproducibility comes from the panel cache on top of this —
see "The fit-panel cache" below.

`test/fit-score-stability.mjs` scores a fixed job description N times against a **local**
worker (`cd worker && npx wrangler dev`) and asserts the spread of `overall` stays inside a
documented tolerance. It is not part of `node --test` — it costs real OpenRouter calls and
its result depends on provider variance this repo doesn't control. Never point it at the
deployed worker: repeated runs would add self-traffic to the production visitor log on top
of the API spend.

Measured 2026-08-28 against `google/gemini-3.7-flash` (`MODEL_DEFAULT`): 15 live runs on a
fixed JD (two batches, 5 and 10) scored 42-53, spread 11 and 7 respectively, clustered at
42-43 with occasional outlier jumps. That confirms the fix narrows variance without
collapsing it, exactly as issue #28's "Honest limitation" predicted. The script's tolerance
(15) is set from this data plus a small margin; re-measure and adjust if the default model
changes.

## The fit-panel cache

`/fit/score` caches the reconciled panel on an **exact-input** key, in a `fit_cache`
table in the existing D1 database (`worker/schema.sql`). Before this, a byte-identical
job description ran the rubric call plus both scoring calls again and could come back
with a different number — it happened in real traffic, the same JD scored twice within
seconds. `SCORE_TEMPERATURE` (#28) narrows that spread; only the cache closes it.

The key is `sha256("v1" \0 normalize(jd_text) \0 model \0 corpus_sha \0 sha256(passage block))`,
built by `fitCacheKey()` in `worker/worker.js`. `normalize` is trim, collapse
whitespace, casefold — nothing cleverer, because anything that normalized away real
content would start serving one posting's scorecard for another's. Fields are
NUL-joined so adjacent ones cannot run together (`"gpt" + "4o"` must not equal
`"gpt4" + "o"`).

Each component earns its place:

- **model** — already per-request. A model change must not serve panels the old one produced.
- **corpus_sha** — the browser's `VECTORS.corpusSha256`, sent by `generateScore()` in
  `src/engine.js`. Without it, editing `BANK` would leave cached scorecards citing
  passages that have moved, and the citations would silently stop matching the corpus.
  A client that doesn't declare one is therefore **not cached at all**
  (`x-fit-cache: bypass`); it scores live every time.
- **passage digest** — of the block the worker actually assembled. `corpus_sha` is a
  claim the client makes about itself and `/fit/score` is an open POST route; on the
  sha alone a caller could store a panel scored against passages it invented, under a
  key real visitors then read. Hashing what was really scored keeps a lying caller
  inside its own key space.

**Only the panel is cached, not the narrative.** The panel is the number that has to be
reproducible, and it is three of the four paid calls; `/fit` stays a live stream so the
prose still reads as written for the reader in front of it.

Hits are countable, not assumed — a hit logs `outcome = 'fit_score_cached'` where a live
pass logs `'fit_score'`, and every response carries `x-fit-cache: hit|miss|bypass`
(CORS-exposed, so `curl -i` after a deploy can read it):

```bash
wrangler d1 execute ask-elroy-log --command "SELECT outcome, COUNT(*) AS n FROM questions WHERE outcome LIKE 'fit_score%' AND is_synthetic = 0 GROUP BY outcome"
```

The cache is an optimisation and never load-bearing: `readFitCache()`/`writeFitCache()`
swallow their errors, so a missing table or an unhappy D1 means the endpoint scores live
and returns a panel — never a 500. That is why the `fit_cache` migration, unlike
`questions.is_synthetic`, is safe to run before *or* after `wrangler deploy`. Entries are
never *served* after a model or corpus change — the key stops matching — but they do
linger; `worker/schema.sql` carries the `DELETE` for pruning orphans.

**Near-match caching was considered and rejected.** Two postings for the same title at
different employers sit at very high embedding similarity while differing on exactly the
requirements that drive the score, so a similarity hit would show someone a confident
scorecard for a role they did not submit, with citations that no longer correspond to
their requirements — silent and confidently wrong. Score proximity is not
substitutability either: two unrelated roles in observed traffic, one infrastructure and
one application development, both landed at 44 for entirely different reasons. If a
similarity feature is wanted later, the safe shape is a *suggestion* ("you scored a
similar role earlier — view it?") with a fresh run remaining the default. Full argument:
issue #30.

`test/fit-cache.test.mjs` covers the key and the storage helpers; `test/fit-cache-endpoint.test.mjs`
drives `handleScore()` against a stubbed upstream and asserts the acceptance directly —
a repeat submission returns the identical panel and reaches the model zero times.
`test/smoke.mjs` asserts the browser half: that the page sends its `corpus_sha`.

## Synthetic traffic

`questions.is_synthetic` (`INTEGER NOT NULL DEFAULT 0`) separates real visitors from
Elroy's own traffic — the smoke test, ad hoc curl probes after a deploy, and his own dev
browser. Before this column existed, roughly 76% of logged rows were synthetic, and
`country` couldn't tell the two apart either: Elroy's own devices geolocate to the same
country he's based in.

The signal is explicit, never inferred. `isSynthetic()` in `worker/worker.js` checks
whether `session_id` starts with the reserved prefix `synthetic-`; `logRow()` is the only
place that sets the column, from that one check.

- `test/smoke.mjs` sets `localStorage["askElroySynthetic"]` via `page.addInitScript()`
  before every run, so `state.sessionId` in `src/engine.js` picks up the prefix. This is
  belt-and-suspenders on top of the route-level worker stub in that same file — smoke
  traffic already never reaches the real worker; this keeps it tagged even if that stub
  ever regresses.
- On a dev machine, run `askElroy.setSyntheticMode(true)` once in the console and
  reload; it persists in `localStorage`, so every future session in that browser is
  tagged.
- A manual curl probe after `wrangler deploy` should pass `"session_id":
  "synthetic-deploy-check"` in the body, for the same reason — see the deploy comment
  at the top of `worker/worker.js`.

`GET /admin` filters `WHERE is_synthetic = 0` by default; pass `?synthetic=1` to see
everything, synthetic rows included.

The same filter applies to a manual query, e.g. the refused-question breakdown this fix exists
to make trustworthy:

```bash
wrangler d1 execute ask-elroy-log --command "SELECT question, COUNT(*) AS n FROM questions WHERE outcome = 'refused' AND is_synthetic = 0 GROUP BY question ORDER BY n DESC LIMIT 20"
```

This column is set at write time from that one explicit signal — it is never backfilled.
Rows logged before 2026-08-28 are all `is_synthetic = 0` regardless of their real origin;
that default doesn't mean they were real traffic, only that no synthetic signal was
recorded for them. A `ua`-pattern classification of those old rows is possible but is an
inferred label, not this column's value, and must never be presented as recorded fact.

## In-browser debugging

The global `askElroy` exposes the full runtime without a rebuild:

```js
askElroy.CONFIG.scopeThreshold = 0.40
await askElroy.retrieve("does he need a visa")
askElroy.runEval()
askElroy.bootPerf            // per-stage cold-start timings, also on the Trace tab
askElroy.setSyntheticMode(true)   // dev-browser opt-in — reload after calling; see "Synthetic traffic"
askElroy.fitInputTooThin("Engineer")   // the Fit tab's pre-spend floor — see "The fit-input floor"
```
