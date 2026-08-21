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
and 368,640 base64 — the fallback if int8 costs measurable retrieval quality.

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
  their own calibrated gate, so neither answers what it should refuse.
- If every embedding backend fails — no WebGPU, blocked CDN, old browser — the page stays
  in lexical mode for the session and keeps working. That path is now the default state
  rather than an error state, which makes it much harder to break unnoticed.

## Measurements

Recorded on the machine that runs `./build.sh`; see the Trace tab's "Cold start" panel,
which reports these from `performance.measure()` rather than from this document.

| | Before | After |
|---|---|---|
| Answerable at | 15,507 ms | see Trace tab |
| Passage embed | 146 passages, in-browser | precomputed |
| Retrieval | 2 ms | 2 ms |
