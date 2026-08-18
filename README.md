# ask-elroy

A retrieval-augmented agent that answers recruiter questions about you, and shows its work.
One HTML file plus a 90-line proxy. No build step, no framework, no database.

## What it does

1. Chunks a curated corpus you wrote into 140 passages.
2. Embeds them in the visitor's browser (`all-MiniLM-L6-v2`, ONNX).
3. Retrieves with BM25 + dense cosine, fused by reciprocal rank.
4. Refuses below a scope gate, before any model call, at zero cost.
5. Generates a grounded answer with numbered citations through a key-holding proxy.
6. Checks the citations and flags the answer if they do not hold.

Every answer carries a trace: scores, latency, tokens, cost. The Evaluation tab runs a
retrieval and refusal suite live, in the browser, against the same index.

## Run it now

Open `index.html` in a browser. It works immediately in retrieval-only mode
(real embeddings, real retrieval, verbatim source answers instead of generated prose).

## Turn generation on — about 10 minutes

```bash
npm install -g wrangler
wrangler login
cd ask-elroy/worker
wrangler deploy
wrangler secret put ANTHROPIC_API_KEY     # paste your key when prompted
```

Wrangler prints a URL like `https://ask-elroy.<you>.workers.dev`.
Put it in `index.html`:

```js
const CONFIG = {
  generatorUrl: "https://ask-elroy.<you>.workers.dev",
```

Reload. The status bar reads `generation on`.

**Cost.** Claude Haiku 4.5 at $1 / $5 per million tokens. One answer sends about 900 input
tokens and returns about 250. That is roughly **$0.002 per answer** — 500 recruiter questions
for about one dollar. The page also caps generation at 40 answers per browser session.

## Publish it

Any static host. GitHub Pages is the shortest path:

```bash
git init && git add index.html && git commit -m "ask-elroy"
git branch -M main && git remote add origin git@github.com:<you>/ask-elroy.git
git push -u origin main
# Settings -> Pages -> Deploy from branch -> main -> / (root)
```

Put the link in your CV header, your LinkedIn About section, and your email signature.

## Edit the corpus

Everything the agent can say lives in the `BANK` array near the top of the `<script>` block.
Each entry is `{cat, q, k, a}` — category, canonical question, extra keywords, answer HTML.
Add an entry, add its id to the `IDS` array in the same order, and add a golden-set row in
`GOLDEN` so the new answer is covered by the suite. Then re-run the Evaluation tab.

The agent cannot say anything that is not in `BANK`. That is the design.

## Tuning the scope gate

The Evaluation tab sweeps the gate and prints what each setting costs you: in-scope questions
answered correctly against out-of-scope probes refused. It also prints a joint optimum.
Change the value in the box, press re-run, and set `CONFIG.scopeThreshold` to what you like.

Two gates exist, because the two retrieval modes separate differently:
`scopeThreshold` for hybrid (dense cosine) and `lexThreshold` for the BM25-only fallback.

## Develop it

`index.html` is a build artifact. Do not edit it — edit the sources and rebuild.

```
ask-elroy/
├── build.sh            concatenate src/* -> index.html, then syntax-check
├── index.html          the built app (this is what you deploy)
├── src/
│   ├── head.html       markup, CSS, the "How this works" copy
│   ├── corpus.js       PROFILE, CATS, BANK  <- everything the agent can say
│   ├── eval.js         IDS, GOLDEN, OOS     <- the evaluation suites
│   ├── engine.js       chunk, BM25, embeddings, hybrid retrieval, generation
│   ├── ui.js           chat, trace inspector, evaluation runner, boot
│   └── tail.html       closing tags
├── worker/
│   ├── worker.js       Cloudflare Worker: holds the key, streams generation
│   └── wrangler.toml
└── test/
    └── smoke.mjs       headless check: boot, answer, refusal, injection, eval
```

The loop:

```bash
./build.sh                                  # rebuild after any src/ change
open index.html                             # or: python3 -m http.server 8000

npm i -D playwright && npx playwright install chromium   # once
node test/smoke.mjs                         # headless check before you publish
```

From the browser console, `askElroy` exposes the whole app — retune and re-measure
without an edit-rebuild cycle:

```js
askElroy.CONFIG.scopeThreshold = 0.40
await askElroy.retrieve("does he need a visa")
askElroy.runEval()
```

Worker changes deploy from the `worker/` directory: `cd worker && wrangler deploy`.

## Known limits

- First load pulls about 25 MB of model weights. A production version would ship precomputed
  vectors; this one builds the index live because watching it build is part of the point.
- The golden set is small and self-authored. External labels would be the honest fix.
- The evaluation scores retrieval and refusal, not writing quality.
