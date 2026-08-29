# Synthetic Traffic Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `questions` an explicit `is_synthetic` flag so Elroy's own traffic (smoke
test, deploy probes, dev browser) never inflates the visitor log again, and every
future read of the table can default to excluding it.

**Architecture:** One reserved `session_id` prefix (`synthetic-`) is the single source of
truth. `worker/worker.js` sets `is_synthetic` from that prefix at write time in
`logRow()` — never inferred from `ua` or `country`. Two client-side callers opt into
the prefix: `src/engine.js` reads a `localStorage` flag when it builds `state.sessionId`
(covers the dev browser, via a new console helper), and `test/smoke.mjs` sets that same
`localStorage` flag via `page.addInitScript()` before the page loads (covers the smoke
test, as a second layer on top of the existing route-level worker stub — smoke traffic
already never reaches the real worker; this makes sure it stays tagged even if that stub
ever regresses). A manual curl probe after `wrangler deploy` opts in by hand, passing the
same prefix in the request body — documented, not scripted, since it's an ad hoc action.

**Tech Stack:** Cloudflare Worker (D1/SQLite), vanilla JS concatenated into one
`<script>` block (no bundler, no ES modules on the client side), `node --test`,
Playwright.

**Spec:** https://github.com/elroy-galbraith/ask-elroy/issues/22

## Global Constraints

- Never edit `index.html` or `src/vectors.js` directly — they are build artifacts.
  Edit `src/*` and run `./build.sh`.
- `./build.sh` runs `node tools/embed.mjs --verify` and fails the build if vectors and
  corpus disagree. This plan doesn't touch the corpus, so it should be a no-op check.
- `node --test test/*.test.mjs` must stay network-free (unit tests only).
- `test/smoke.mjs` must never let a real request reach the deployed worker — see its
  header comment. Nothing in this plan may weaken that guarantee.
- This repo documents durable invariants in `CLAUDE.md` when a fix introduces one (see
  the existing "Fit-score determinism" section, added for issue #28). This plan adds a
  matching section for `is_synthetic`.

---

## Why not a full backfill (explicit scope decision)

The issue's Notes say a UA-based backfill of historical rows is *possible* but "should
be marked as inferred rather than presented as recorded fact." `is_synthetic` is meant to
mean "this row declared itself synthetic when it was written." Retroactively flipping old
rows to `1` from a UA guess would make an inferred label look like recorded fact — exactly
what the issue warns against. So this plan does **not** backfill. Rows logged before this
column existed are `is_synthetic = 0` by the column's `DEFAULT 0`, which is not a claim
that they're real traffic — it only means no synthetic signal was recorded for them. The
acceptance criterion ("a number I can quote without caveats") is about rows logged from
here on, not a retroactive cleanup of the existing table.

## File Structure

| File | Change |
|---|---|
| `worker/schema.sql` | Add `is_synthetic INTEGER NOT NULL DEFAULT 0` column; document the one-time `ALTER TABLE` for the already-deployed table. |
| `worker/worker.js` | Add `isSynthetic()` (reserved-prefix check), have `logRow()` persist it, filter `GET /admin` by it, document deploy-time migration + curl probe. |
| `test/synthetic-flag.test.mjs` | New. Unit tests for `isSynthetic()` and for `logRow()`'s D1 bind order. |
| `src/engine.js` | Add the reserved prefix, a `localStorage`-backed `isSyntheticDevBrowser()` check, and `setSyntheticMode()`; build `state.sessionId` from them. |
| `src/ui.js` | Expose `setSyntheticMode` on `window.askElroy`. |
| `test/smoke.mjs` | Opt in via `localStorage` before the page loads; assert `state.sessionId` carries the prefix. |
| `CLAUDE.md` | New "Synthetic traffic" section; extend "In-browser debugging". |
| `index.html` | Rebuilt by `./build.sh` — not edited directly. |

**Interfaces:**
- `worker/worker.js` exports `isSynthetic(session_id: string|null): boolean` and
  `logRow(env, request, question, outcome, session_id, visitor_name, visitor_co, response = null): Promise<void>` (now exported; signature unchanged).
- `src/engine.js` defines `SYNTHETIC_SESSION_PREFIX = "synthetic-"` (must equal the
  same literal in `worker/worker.js` — there is no shared module between the two, so
  this is a comment-enforced invariant, not a code one) and a global function
  `setSyntheticMode(on: boolean): void`, referenced by bare identifier from
  `src/ui.js`'s `window.askElroy` object literal (all `src/*` files are concatenated
  into one script — no import/export on the client side).

---

### Task 1: Worker — `is_synthetic` column, detection, logging, admin filter

**Files:**
- Modify: `worker/schema.sql`
- Modify: `worker/worker.js:9-18` (deploy header comment), `worker/worker.js:141` area (new constants before `cors`), `worker/worker.js:177-191` (`handleAdmin`), `worker/worker.js:514-531` (`logRow`)
- Test: `test/synthetic-flag.test.mjs` (new)

**Interfaces:**
- Produces: `isSynthetic(session_id)`, exported `logRow(...)` — used by Task 3's smoke
  assertion indirectly (through the worker, not imported) and relied on by nothing else
  in this plan.

- [ ] **Step 1: Update the schema**

Edit `worker/schema.sql` to:

```sql
CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  question     TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  country      TEXT,
  ua           TEXT,
  session_id   TEXT,
  visitor_name TEXT,
  visitor_co   TEXT,
  response     TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0
);

-- Migration for the already-deployed database (a fresh install already has the
-- column from the CREATE TABLE above). Run this once, manually, against the
-- existing remote table:
--   wrangler d1 execute ask-elroy-log --command "ALTER TABLE questions ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0"
```

- [ ] **Step 2: Write the failing unit tests**

Create `test/synthetic-flag.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSynthetic, logRow } from '../worker/worker.js';

test('isSynthetic recognizes the reserved session_id prefix', () => {
  assert.equal(isSynthetic('synthetic-deploy-check'), true);
  assert.equal(isSynthetic('synthetic-' + 'x'.repeat(40)), true);
});

test('isSynthetic rejects a normal session id', () => {
  assert.equal(isSynthetic('3f7b1c2e-9c1d-4a2b-9e2f-1234567890ab'), false);
});

test('isSynthetic rejects missing or non-string session ids', () => {
  assert.equal(isSynthetic(null), false);
  assert.equal(isSynthetic(undefined), false);
  assert.equal(isSynthetic(42), false);
});

function stubDB() {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind: (...args) => {
            calls.push({ sql, args });
            return { run: async () => {} };
          }
        };
      }
    }
  };
  return { env, calls };
}

const fakeRequest = { headers: { get: () => null } };

test('logRow persists is_synthetic=1 for a synthetic session', async () => {
  const { env, calls } = stubDB();
  await logRow(env, fakeRequest, 'q', 'answered', 'synthetic-smoke-test', null, null, null);
  const { sql, args } = calls[0];
  assert.match(sql, /is_synthetic/);
  assert.equal(args[args.length - 1], 1);
});

test('logRow persists is_synthetic=0 for a real visitor session', async () => {
  const { env, calls } = stubDB();
  await logRow(env, fakeRequest, 'q', 'answered', 'a-real-uuid', null, null, null);
  const { args } = calls[0];
  assert.equal(args[args.length - 1], 0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/synthetic-flag.test.mjs`
Expected: FAIL — `isSynthetic` and the exported `logRow` are not defined yet.

- [ ] **Step 4: Add the detection constant and function**

In `worker/worker.js`, immediately before `const cors = {`, add:

```js
// The only signal that marks a row synthetic: an explicit, reserved session_id
// prefix — never a guess from user-agent or geolocation. Both are unreliable for
// Elroy's own traffic (his dev devices geolocate to the same country he's based
// in). test/smoke.mjs and the dev-browser opt-in (src/engine.js: setSyntheticMode())
// both set this prefix on state.sessionId; a manual curl probe after a deploy
// should pass it too. See CLAUDE.md > Synthetic traffic.
const SYNTHETIC_SESSION_PREFIX = "synthetic-";

export function isSynthetic(session_id) {
  return typeof session_id === "string" && session_id.startsWith(SYNTHETIC_SESSION_PREFIX);
}
```

- [ ] **Step 5: Persist it in `logRow` and export the function**

Replace the existing `logRow`:

```js
async function logRow(env, request, question, outcome, session_id, visitor_name, visitor_co, response = null) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO questions (ts, question, outcome, country, ua, session_id, visitor_name, visitor_co, response) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      new Date().toISOString(),
      question,
      outcome,
      request.headers.get("cf-ipcountry") || null,
      (request.headers.get("user-agent") || "").slice(0, 500) || null,
      session_id,
      visitor_name,
      visitor_co,
      response
    ).run();
  } catch (_) { /* fire-and-forget — DB errors must never reach the client */ }
}
```

with:

```js
export async function logRow(env, request, question, outcome, session_id, visitor_name, visitor_co, response = null) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO questions (ts, question, outcome, country, ua, session_id, visitor_name, visitor_co, response, is_synthetic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      new Date().toISOString(),
      question,
      outcome,
      request.headers.get("cf-ipcountry") || null,
      (request.headers.get("user-agent") || "").slice(0, 500) || null,
      session_id,
      visitor_name,
      visitor_co,
      response,
      isSynthetic(session_id) ? 1 : 0
    ).run();
  } catch (_) { /* fire-and-forget — DB errors must never reach the client */ }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/synthetic-flag.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 7: Default `/admin` to real traffic only**

Replace `handleAdmin`:

```js
async function handleAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.DB) return json({ error: "DB binding not configured" }, 503);
  try {
    const result = await env.DB.prepare(
      "SELECT id, ts, question, outcome, country, ua, session_id, visitor_name, visitor_co, response FROM questions ORDER BY ts DESC LIMIT 100"
    ).all();
    return json(result.results);
  } catch (e) {
    return json({ error: "db error", detail: String(e).slice(0, 200) }, 500);
  }
}
```

with:

```js
async function handleAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.DB) return json({ error: "DB binding not configured" }, 503);
  // Real traffic by default — pass ?synthetic=1 to see everything, including
  // the smoke test / dev-browser rows, e.g. to confirm they're tagged correctly.
  const includeSynthetic = new URL(request.url).searchParams.get("synthetic") === "1";
  const where = includeSynthetic ? "" : "WHERE is_synthetic = 0";
  try {
    const result = await env.DB.prepare(
      `SELECT id, ts, question, outcome, country, ua, session_id, visitor_name, visitor_co, response, is_synthetic FROM questions ${where} ORDER BY ts DESC LIMIT 100`
    ).all();
    return json(result.results);
  } catch (e) {
    return json({ error: "db error", detail: String(e).slice(0, 200) }, 500);
  }
}
```

- [ ] **Step 8: Document the migration and a synthetic curl probe in the deploy header**

In `worker/worker.js`, the top-of-file comment currently ends:

```js
 *   wrangler secret put ADMIN_TOKEN
 *   wrangler deploy
 * Then paste the worker URL into CONFIG.generatorUrl in src/engine.js and rebuild.
 */
```

Replace with:

```js
 *   wrangler secret put ADMIN_TOKEN
 *   wrangler deploy
 * Then paste the worker URL into CONFIG.generatorUrl in src/engine.js and rebuild.
 *
 * Migrating a database created before the is_synthetic column existed:
 *   wrangler d1 execute ask-elroy-log --command "ALTER TABLE questions ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0"
 *
 * Smoke-checking a fresh deploy without polluting the visitor log — prefix
 * session_id with "synthetic-":
 *   curl -s -X POST https://<worker>/log -H 'content-type: application/json' \
 *     -d '{"question":"probe","outcome":"error","session_id":"synthetic-deploy-check"}'
 */
```

- [ ] **Step 9: Commit**

```bash
git add worker/schema.sql worker/worker.js test/synthetic-flag.test.mjs
git commit -m "Worker: add is_synthetic flag so Elroy's own traffic stops inflating the log"
```

---

### Task 2: Client — reserved session_id prefix and dev-browser opt-in

**Files:**
- Modify: `src/engine.js:11` area (before `const state`)
- Modify: `src/ui.js:1151`

**Interfaces:**
- Consumes: nothing from Task 1 (client and worker share only the string literal
  `"synthetic-"`, by convention, not by import).
- Produces: `setSyntheticMode(on)`, referenced by `src/ui.js`; `state.sessionId` now
  carries the prefix when the dev-browser flag is set.

- [ ] **Step 1: Add the prefix, the storage check, and the console helper**

In `src/engine.js`, immediately before `const state = {`, add:

```js
// Reserved session_id prefix the worker (worker/worker.js: SYNTHETIC_SESSION_PREFIX)
// maps to is_synthetic=1. Set only by explicit opt-in below — never inferred.
const SYNTHETIC_SESSION_PREFIX = "synthetic-";
const SYNTHETIC_STORAGE_KEY = "askElroySynthetic";

function isSyntheticDevBrowser(){
  try { return localStorage.getItem(SYNTHETIC_STORAGE_KEY) === "1"; }
  catch { return false; }
}

// Console helper for Elroy's own machines: askElroy.setSyntheticMode(true), then
// reload. Persists in localStorage, so every future session on this browser is
// tagged without touching any of the call sites that already thread session_id
// through to the worker.
function setSyntheticMode(on){
  try {
    if(on) localStorage.setItem(SYNTHETIC_STORAGE_KEY, "1");
    else localStorage.removeItem(SYNTHETIC_STORAGE_KEY);
  } catch {}
}
```

- [ ] **Step 2: Build `state.sessionId` from it**

Change:

```js
  qcache: new Map(),
  sessionId: crypto.randomUUID()
};
```

to:

```js
  qcache: new Map(),
  sessionId: (isSyntheticDevBrowser() ? SYNTHETIC_SESSION_PREFIX : "") + crypto.randomUUID()
};
```

- [ ] **Step 3: Expose the helper on `window.askElroy`**

In `src/ui.js`, change:

```js
window.askElroy = { state, CONFIG, BANK, IDS, GOLDEN, PARAPHRASE, OOS, CONV_GOLDEN, GEN_SUITE, retrieve, runEval, ask, generateFit, generateScore, looksLikeJobDescription, bootPerf,
  get busy(){ return busy; } };
```

to:

```js
window.askElroy = { state, CONFIG, BANK, IDS, GOLDEN, PARAPHRASE, OOS, CONV_GOLDEN, GEN_SUITE, retrieve, runEval, ask, generateFit, generateScore, looksLikeJobDescription, bootPerf, setSyntheticMode,
  get busy(){ return busy; } };
```

- [ ] **Step 4: Rebuild and manually verify in the console**

Run: `./build.sh`
Then open `index.html` in a real browser and, in devtools:

```js
askElroy.setSyntheticMode(true)
```

Reload the page and check:

```js
askElroy.state.sessionId.startsWith("synthetic-")   // true
```

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/ui.js index.html
git commit -m "Client: opt a dev browser into the synthetic session_id prefix"
```

---

### Task 3: Smoke test — belt-and-suspenders tagging

**Files:**
- Modify: `test/smoke.mjs`

**Interfaces:**
- Consumes: `window.askElroy.state.sessionId` (Task 2) and the `askElroySynthetic`
  `localStorage` key (Task 2's `SYNTHETIC_STORAGE_KEY`).

- [ ] **Step 1: Opt in before the page loads**

In `test/smoke.mjs`, right before:

```js
const tBoot = Date.now();
await p.goto('file://' + root + '/index.html');
```

add:

```js
// Belt-and-suspenders on top of the route-level stub above: even if a request
// ever slipped past it, this tags it is_synthetic=1 in the worker instead of
// silently mixing into the real visitor log. See CLAUDE.md > Synthetic traffic.
await p.addInitScript(() => { try { localStorage.setItem('askElroySynthetic', '1'); } catch {} });

const tBoot = Date.now();
await p.goto('file://' + root + '/index.html');
```

- [ ] **Step 2: Assert the wiring actually took**

Right after the existing:

```js
if (boot.vecs !== boot.passages) errs.push(`VECTORS: ${boot.vecs} decoded for ${boot.passages} passages`);
if (bootMs > 3000) errs.push(`COLD START: ${bootMs} ms to answerable — precomputed vectors should make this near-instant`);
```

add:

```js
const sessionId = await p.evaluate(() => window.askElroy.state.sessionId);
console.log('session   :', sessionId);
if (!sessionId.startsWith('synthetic-')) {
  errs.push(`SYNTHETIC FLAG: session_id "${sessionId}" missing the reserved prefix — smoke traffic would log as a real visitor if it ever reached the worker`);
}
```

- [ ] **Step 3: Run the smoke test**

Run: `node test/smoke.mjs`
Expected: exit code 0; `session   : synthetic-...` printed; `js errors : none`.

(Requires `playwright` installed with chromium — `npm i -D playwright && npx playwright install chromium` per `CLAUDE.md`, if not already set up.)

- [ ] **Step 4: Commit**

```bash
git add test/smoke.mjs
git commit -m "Smoke test: tag its traffic synthetic even if the worker stub ever regresses"
```

---

### Task 4: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the "Synthetic traffic" section**

In `CLAUDE.md`, insert a new section after "## Fit-score determinism" and before
"## In-browser debugging":

```markdown
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

This column is set at write time from that one explicit signal — it is never backfilled.
Rows logged before 2026-08-28 are all `is_synthetic = 0` regardless of their real origin;
that default doesn't mean they were real traffic, only that no synthetic signal was
recorded for them. A `ua`-pattern classification of those old rows is possible but is an
inferred label, not this column's value, and must never be presented as recorded fact.
```

- [ ] **Step 2: Extend "In-browser debugging"**

Change:

```js
askElroy.CONFIG.scopeThreshold = 0.40
await askElroy.retrieve("does he need a visa")
askElroy.runEval()
askElroy.bootPerf            // per-stage cold-start timings, also on the Trace tab
```

to:

```js
askElroy.CONFIG.scopeThreshold = 0.40
await askElroy.retrieve("does he need a visa")
askElroy.runEval()
askElroy.bootPerf            // per-stage cold-start timings, also on the Trace tab
askElroy.setSyntheticMode(true)   // dev-browser opt-in — reload after calling; see "Synthetic traffic"
```

- [ ] **Step 3: Full verification pass**

Run, in order:

```bash
./build.sh
node --test test/*.test.mjs
node test/smoke.mjs
```

Expected: build succeeds; all unit tests pass, including the 5 new
`synthetic-flag.test.mjs` cases; smoke test exits 0 with `session   : synthetic-...`
and `js errors : none`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: record the is_synthetic convention (issue #22)"
```

## Self-Review Notes

- **Spec coverage:** issue #22's four proposed-fix items map to Task 1 (schema +
  `logRow`), Task 1 Step 7 (default analytics query), Task 2/3 (the two client
  signals), and the "Why not a full backfill" section (Notes). Acceptance criteria are
  covered by Task 3 Step 3 (smoke run tags synthetic) and Task 1 Step 7 (`/admin`
  defaults to `is_synthetic = 0`; the raw `COUNT(*)` quote itself is a manual wrangler
  query against the now-correct column, not new code).
- **Not in scope, deliberately:** a `ua`-based historical backfill (see rationale
  above); a dedicated `/admin`-style endpoint for the `COUNT(*)` query (the issue's
  acceptance criterion is a manual wrangler command Elroy runs himself, matching how
  the existing "Key query" in `docs/superpowers/specs/2026-08-19-analytics-d1-design.md`
  is also just a documented manual query, not a route).
