# ADR-0001 — Ship the dense index to the client

Date: 2026-08-21
Status: Accepted
Supersedes nothing. Addresses defect 7 of
[`0001-ask-elroy-interactive-portfolio-agent.md`](./0001-ask-elroy-interactive-portfolio-agent.md).

## Context

Cold start was **15,507 ms** on Chrome / macOS / WebGPU. Retrieval itself was 2 ms.

All of that time went into getting a dense index that is *identical for every visitor*:
fetch transformers.js off jsdelivr, fetch and compile ~25 MB of ONNX weights, run one
warm-up pass, then embed every passage in the corpus. The output is a pure function of
three files in this repo. Recomputing it in each visitor's browser is a build step being
paid for at runtime, once per cold visit.

Fifteen seconds is a bounce. The audience is a recruiter who opened a link, and the page
spends that time showing a spinner over an agent that could already have answered.

## Decision

Three tiers, of which the first two ship here.

**Tier 0 — precompute the passage vectors.** `tools/embed.mjs` embeds the corpus at build
time and writes `src/vectors.js`: an int8 blob, base64'd, concatenated into `index.html`
like every other source file. The browser decodes it; it never computes it.

**Tier 1 — open in lexical mode, upgrade in the background.** The page boots into BM25,
which is a real retrieval mode with its own calibrated gate (`CONFIG.lexThreshold`, 0.30),
not a placeholder. `state.ready` is true immediately. The embedding model then loads on
`requestIdleCallback` or on the first question, whichever comes first, and flips
`state.mode` to `"hybrid"` when it resolves. Input is never blocked, and the status line
keeps saying "ready" throughout, because it is.

**Tier 2 — not implemented.** `CONFIG.queryEmbedUrl` is present and empty. Set it and
`embedQuery()` would POST the query to a Worker route instead of loading any local model
at all — the passage vectors already ship, so the ~25 MB model now exists for the sole
purpose of embedding one short string. The flag is a placeholder with a warning attached:
whatever model that route runs, `src/vectors.js` must be regenerated with the same one.
Two embedding models do not share a vector space, and mixing them yields cosines that look
entirely plausible and rank wrongly.

### Quantisation

int8, symmetric, scale 127. The vectors are L2-normalised, so every component is in
[-1, 1] and one fixed scale needs no per-row factor. Rows are re-normalised at decode:
int8 rounding moves a row about 0.1% off the unit sphere, and a dot product has to stay
exactly a cosine or the 0.34 scope gate quietly stops meaning what it was tuned to mean.

At 180 passages x 384 dims: 69,120 bytes raw, 92,160 base64. float32 would be 276,480 raw
and 368,640 base64 — the fallback if int8 cost measurable retrieval quality. It does not;
see below.

### Does int8 cost retrieval quality?

**Measured. No.** Same 66-query golden set, same browser, same backend
(`transformers.js 2 · WASM · quantized`, the third rung of the cascade — headless Chromium
has no WebGPU), `main` vs this branch, deterministic across repeated runs:

| | `main` — embedded in-browser | this branch — int8, precomputed | Δ |
|---|---|---|---|
| Hit@1 | 39 / 66 = 59.1% | 39 / 66 = 59.1% | 0 |
| Hit@5 | 59 / 66 = 89.4% | 59 / 66 = 89.4% | 0 |
| MRR | 0.724 | 0.719 | −0.005 |
| Refusal | 10 / 11 | 10 / 11 | 0 |

Not one query changed its verdict. MRR moves by one rank-swap deep in a top-5 list. The
float32 fallback is not needed and the 276 KB payload is not paid.

Measured directly rather than inferred: re-embedding all 180 passages in the page and
comparing each to its shipped row gives mean cosine **0.988**, min 0.978, and **0 rows out
of 180** where some other shipped vector is a closer match than the row's own — so the
positional alignment the whole design worries about is intact, and the residual is the
quantisation, which the table above prices at zero.

**The 94% stop condition was written against a stale number.** `Hit@1 60%, Hit@5 96%,
MRR 0.741` in the earlier ADR is `30/50, 48/50` — a 50-query golden set. The set is 66
queries now. The 16 added rows are harder, and `main` scores 89.4% on them *today*, before
this change touches anything. 89.4% is therefore the fp32 baseline, not a regression, and
the like-for-like comparison is the table above.

Left standing for the record, the simulation that bounded this while the measurement was
blocked. Passage vectors are quantised; the query is not. Over 400 trials in R^384:

| | |
|---|---|
| mean \|Δcos\| | 0.0018 |
| p95 | 0.0043 |
| max | 0.0067 |

So a rank swap needs two passages within ~0.004 cosine of each other. Two things make that
cheap when it happens:

- Retrieval fuses by **rank**, not by score. A one-place move is worth
  `1/61 - 1/62 = 0.00026` of fused score, and BM25 — which is not quantised at all — is the
  other half of the fusion.
- Simulating a realistic relevance spread (the expected doc at cos 0.45–0.70, a handful of
  near-misses at 0.28–0.48, the rest in a tail below 0.25), the fp32 and int8 rankers gave
  the identical Hit@5 verdict in 400 of 400 queries and the identical Hit@1 verdict in 399.

Caveat, and the reason it was never a substitute for the measurement: MiniLM embeddings are
anisotropic — real cosines cluster far higher and closer together than the simulation's do,
which compresses exactly the gaps that matter. It read as "int8 is unlikely to be the thing
that breaks Hit@5"; the measurement above is what settles it.

### What the measurement did surface: the golden set is not a neutral referee

On the golden set, hybrid retrieval looks **worse** than BM25 alone:

| golden set (66) | Hit@1 | Hit@5 | MRR |
|---|---|---|---|
| lexical (BM25 only) | 52 / 66 = 79% | 64 / 66 = 97% | 0.865 |
| hybrid (RRF fusion) | 39 / 66 = 59% | 59 / 66 = 89% | 0.719 |

Read at face value that says to delete the dense half and the 25 MB model with it. **It is a
measurement artifact, and acting on it would have been a mistake.**

The golden set was written alongside the corpus by the same author. Measuring how much of a
query literally reappears in the passage it expects — content words, stopwords dropped:

| | mean overlap | zero-overlap queries | fully-contained queries |
|---|---|---|---|
| golden set (66) | **0.50** | 7 | 11 |
| held-out set (38) | **0.28** | 13 | 0 |

Half of the average golden query is already sitting in its own answer, and 11 of them are
contained outright. That is BM25's best case by construction. The suite grades the retriever
on the phrasings the author happened to anticipate, which is the one distribution where
lexical matching cannot lose.

So: a held-out set, one query per doc, written from each doc's *intent* rather than its text,
in the register a recruiter actually types (appendix below). Same page, same backend:

| held-out set (38) | Hit@1 | Hit@5 | MRR |
|---|---|---|---|
| lexical (BM25 only) | 21 / 38 = 55% | 32 / 38 = 84% | 0.658 |
| hybrid (RRF fusion) | **26 / 38 = 68%** | **34 / 38 = 89%** | **0.77** |

The ordering reverses. Dense wins 10 queries to lexical's 5, and rescues three that BM25
misses entirely — *"give me the two minute version of who this guy is"* (intro), *"how does
he pull structured fields out of paperwork"* (extraction-pipeline), *"what stops an automated
decision from going badly wrong"* (risk-guardrails). Vocabulary the corpus never uses for
concepts the corpus covers. That is the entire job of the dense half, and the golden set
could not see it.

**Decision: the dense half stays.** Tier 2 (`CONFIG.queryEmbedUrl`) is now the interesting
lever rather than deletion — if dense earns its keep but the model exists solely to embed one
short query string, that string can be embedded server-side and the 25 MB download deleted
without giving up the retrieval quality.

Two caveats on the held-out set, both pointing the same way: the queries were written by the
author of this ADR, who knows the corpus exists even when writing from intent rather than
text; and 2 of the 38 turned out to duplicate existing golden rows. Excluding those two the
split is 30/36 lexical against 32/36 hybrid — unchanged conclusion. Neither is a substitute
for logged queries from real visitors, which is the measurement that would settle it.

**The gate, which is the worse finding.** At `CONFIG.scopeThreshold` 0.34, hybrid refuses
**10 of the 38** held-out queries outright — legitimate, in-corpus questions, turned away
before any model call because the confidence gate was tuned against the same vocabulary-rich
golden set. Lexical at 0.30 refuses 7 of 38. A visitor asking *"what stops an automated
decision from going badly wrong"* has that answer in the corpus and does not get it. That is
a bigger visitor-facing defect than any ranking delta in this document, and it gets its own
ADR.

#### Appendix: the held-out set

Query → expected doc. Recorded here so the numbers above are auditable; it should become a
committed suite alongside `GOLDEN` and `OOS`.

| query | expects |
|---|---|
| give me the two minute version of who this guy is | `intro` |
| why hire him instead of the other hundred applicants | `differentiator` |
| what sort of position is he chasing | `role-wanted` |
| what does he grill employers about before joining | `filter-question` |
| what is on his plate day to day right now | `yoii-current` |
| walk me through the credit approval engine | `odin` |
| how did he prove the lending decisions were sound | `odin-eval` |
| has he ever written up something that did not work | `negative-results` |
| tell me about the helpdesk bot | `support-agent` |
| how would he benchmark a dialogue system | `conv-eval` |
| how does he pull structured fields out of paperwork | `extraction-pipeline` |
| has he caught defects other engineers missed | `silent-bugs` |
| did he do anything before machine learning | `economist` |
| walk me through his job history | `career-timeline` |
| how big were the teams he sat in | `team-scale` |
| does he want to lead people or stay hands on | `ic-vs-manager` |
| how does he pick what to build next | `how-decide` |
| what stops an automated decision from going badly wrong | `risk-guardrails` |
| can he explain technical work to executives | `communication` |
| where does he struggle | `weaknesses` |
| does he write papers | `publications` |
| what is his newest research about | `streaming-rag` |
| does he sit on any committees | `jaia` |
| where can i see code he has written | `open-source` |
| which tools and frameworks does he use | `stack` |
| does he understand banking | `finance-domain` |
| which university did he attend | `education` |
| does he speak japanese † | `languages` |
| has he actually run models in front of real users | `production-llm` |
| which city is he in and would he move | `location` |
| does he need sponsorship to work here | `visa` |
| what compensation is he expecting | `salary` |
| what is pushing him to leave his current job | `why-move` |
| what are his long term ambitions | `five-years` |
| would he fit at a big corporate or a startup | `company-fit` |
| how quickly could he join | `start-date` |
| what is his email address | `contact` |
| am i talking to a bot † | `is-this-ai` |

† duplicates an existing `GOLDEN` row; excluded in the 30/36 vs 32/36 check above.

## The failure mode this design is built around

The precomputed vectors are positional. Vector *i* is the embedding of passage *i*. If the
build script and the browser disagree about what passage *i* is — because the corpus grew,
because a doc ID moved, because someone changed the chunker — nothing throws. Retrieval
just returns the wrong passages, confidently, and every answer gets slightly worse in a way
no test notices.

So the chunker is not duplicated. `buildPassages()` and `strip()` were moved out of
`src/engine.js` into `src/chunk.js`, which is concatenated into the bundle *and* evaluated
by `tools/embed.mjs`. One definition, read twice, never reimplemented.

And `build.sh` fails hard — never warns — if:

- the SHA-256 of `src/corpus.js` recorded in `src/vectors.js` no longer matches,
- the recorded `pid` list differs from what `buildPassages()` now produces,
- the model id, the passage count, or the payload length disagrees.

The browser repeats the pid check at decode time. That one is belt-and-braces: the build
should already have refused to ship the mismatch.

## Consequences

- `index.html` grows by ~92 KB of base64. That is a one-time transfer on the same request
  that already carries the page, against 15.5 s of compute that was paid on every cold
  visit.
- `src/vectors.js` is a build artifact, like `index.html`. It is committed, and it must be
  regenerated whenever `src/corpus.js`, `IDS` in `src/eval.js`, or `src/chunk.js` changes.
  `./build.sh` does that automatically and refuses to proceed if it cannot.
- `@huggingface/transformers` becomes a **dev** dependency. Nothing new reaches the
  browser bundle; the page still loads the library from the CDN at runtime, exactly as
  before, and only when it upgrades to hybrid.
- The first question a visitor asks is likely answered in lexical mode. That is the
  trade: an immediate BM25 answer beats a 15-second wait for a dense one. Both modes have
  their own calibrated gate, so neither answers what it should refuse — but see the held-out
  measurement above: both gates are calibrated against a vocabulary-rich suite and both
  refuse in-scope questions they should answer, lexical 7 of 38 and hybrid 10 of 38. The
  first-question trade is real; the gate that fronts it needs retuning.
- If every embedding backend fails — no WebGPU, blocked CDN, old browser — the page stays
  in lexical mode for the session and keeps working. That path is now the default state
  rather than an error state, which makes it much harder to break unnoticed.

## Measurements

Recorded headless (Chromium, no WebGPU, `node test/smoke.mjs`); see the Trace tab's "Cold
start" panel, which reports these from `performance.measure()` rather than from this
document.

| | Before | After |
|---|---|---|
| Answerable at | 15,507 ms | **14 ms** in-page, 117 ms wall-clock |
| Passage embed | 146 passages, in-browser | precomputed — 180 x 384 int8, decoded in 4 ms |
| Hybrid available at | 15,507 ms (blocking) | 6,248 ms, in the background, input never blocked |
| Retrieval | 2 ms | 1.2 ms |

The 6,248 ms upgrade is mostly a failure: WebGPU is unavailable headless, so the first
backend spends 5,147 ms discovering that before the cascade falls through to
`transformers.js 2 · WASM · quantized`, which needs 1,030 ms. That whole sequence used to
happen in front of the visitor. It now happens behind an already-answering page, and the
Trace panel names each attempt that failed.
