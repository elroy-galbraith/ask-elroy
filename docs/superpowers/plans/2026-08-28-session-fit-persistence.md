# SessionId & Fit-Scorecard Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `state.sessionId` and the last completed fit check (job description + scorecard) to `sessionStorage`, so a same-tab reload keeps a visitor's session identity and their scorecard instead of silently discarding both, and disclose this in the page's data-handling prose.

**Architecture:** Two small storage helpers — one in `src/engine.js` (session identity, read once at `state` construction) and one in `src/ui.js` (fit-check result, written on every successful `submitFit()` and read once during `boot()`). Both wrap every `sessionStorage` call in `try`/`catch` and fall back to current behavior (fresh UUID, no restore) on any throw. No TTL, no `localStorage`.

**Tech Stack:** Vanilla JS (no framework), Web Storage API (`sessionStorage`), Playwright for the smoke test.

**Spec:** GitHub issue [#29](https://github.com/elroy-galbraith/ask-elroy/issues/29), full text below — there is no separate design doc, so the issue travels with this plan.

<details>
<summary>Issue #29 — full text</summary>

> ## Problem
>
> `state.sessionId` is `crypto.randomUUID()` (`src/engine.js:50`), held in memory only.
> Every page load mints a new one, and nothing survives a reload.
>
> Two consequences, both observed in the first week of logging:
>
> **1. Visitors lose completed work.** A fit score was recorded with no matching fit
> check, immediately followed by a brand-new session re-running the same job
> description end to end — i.e. someone reloaded mid-flow, lost their scorecard, and
> had to paste and pay for it again.
>
> **2. Analytics fragment.** One person working through three job descriptions in five
> minutes was recorded as three separate sessions. Every per-session metric —
> questions per session, bounce rate, session depth — is distorted by this, and the
> distortion is invisible.
>
> ## Proposed fix
>
> Persist to **`sessionStorage`**, not `localStorage`:
>
> - Store `sessionId` there and reuse it on load. Survives a reload in the same tab,
>   dies when the tab closes — which is the correct boundary for something called a
>   session.
> - Store the last submitted JD and its resulting panel alongside it, and restore the
>   scorecard on load.
> - No expiry timer. A TTL that fires while the tab is still open is surprising
>   behaviour; tab lifetime is the natural boundary.
> - Wrap every read and write in `try`/`catch`. Private mode and blocked site data
>   throw on *access*, not merely return null.
>
> ## Disclosure requirement — not optional
>
> A pasted job description can be an unposted or confidential role. The page's
> data-handling prose has already been corrected once for claiming nothing is stored
> (02d65c5). If JD text starts persisting browser-side, "How this works" must say so
> plainly, including where it lives and when it is discarded.
>
> `sessionStorage` is materially easier to defend here than `localStorage`, which is a
> second reason to prefer it.
>
> ## Related
>
> - #27 — this recovers most of that issue's value (distinguishing one visitor's
>   activity within a visit) without introducing a cross-visit identifier.

</details>

## Global Constraints

- Persist to `sessionStorage`, never `localStorage`.
- Reuse the stored `sessionId` on load; only mint a fresh one when none is stored.
- Persist the last submitted JD text and its resulting score panel; restore the scorecard on load.
- No expiry/TTL logic of any kind.
- Every `sessionStorage` read and write is wrapped in `try`/`catch` (private mode and blocked site data throw on access, not just return null).
- The "How this works" data-handling prose (`src/head.html`, the Session panel paragraph rewritten in commit `02d65c5`) must disclose the new client-side persistence: what is kept, where (`sessionStorage`, this tab), and when it's discarded (tab close).
- `index.html` and `src/vectors.js` are build artifacts — edit only the `src/*` sources and rebuild with `./build.sh`.
- `node test/smoke.mjs` must keep passing, including its "nothing reached the real worker" assertion — the stub in that file already intercepts every `workers.dev` request, so new assertions must not introduce a live network call.

---

## Task 1: Red test — assert sessionId and the fit scorecard survive a same-tab reload

**Files:**
- Modify: `test/smoke.mjs:185` (insert after the existing Fit-score-panel block, before the "Pasting a JD into the chat box" block)

**Interfaces:**
- Consumes: `window.askElroy.state.sessionId` (already exposed via the `askElroy` global at `src/ui.js:1159`), the stub counters `stubbed.fit` / `stubbed.fitScore` (already defined at `test/smoke.mjs:33`), and the DOM produced by `renderFitPanel()` (`.fit-tier`, `.fit-row`, already asserted on at `test/smoke.mjs:182-185`).
- Produces: nothing new for later tasks to consume — this is the acceptance test the rest of the plan makes pass.

- [ ] **Step 1: Insert the reload assertions**

Insert immediately after this existing line in `test/smoke.mjs` (currently line 185):

```js
if (!/fit/i.test(tierTxt) || rowCount < 1) { errs.push('FIT PANEL: tier or rows missing'); }
```

insert:

```js

// ---- sessionId and the fit scorecard survive a same-tab reload (issue #29) ----
// sessionId used to be crypto.randomUUID() held only in memory: a reload lost the
// scorecard and minted a fresh session, fragmenting analytics. It must now persist
// in sessionStorage and restore without hitting the network again.
const sessionIdBeforeReload = await p.evaluate(() => window.askElroy.state.sessionId);
const fitCallsBeforeReload = stubbed.fit, scoreCallsBeforeReload = stubbed.fitScore;
await p.reload();
await p.waitForFunction(() => window.askElroy && window.askElroy.state.ready, null, { timeout: 15000 })
       .catch(() => console.log('! reload did not report ready in 15s'));
const sessionIdAfterReload = await p.evaluate(() => window.askElroy.state.sessionId);
console.log('reload id :', sessionIdBeforeReload === sessionIdAfterReload
  ? 'sessionId persisted' : `CHANGED ${sessionIdBeforeReload} -> ${sessionIdAfterReload}`);
if (sessionIdBeforeReload !== sessionIdAfterReload) errs.push('SESSION ID: changed across a same-tab reload');

await p.click('#tab-chat');
const restoredTier = (await p.locator('.fit-tier').first().textContent().catch(() => '')) || '';
const restoredRows = await p.locator('.fit-row').count();
console.log('reload fit:', `tier "${restoredTier.trim()}" | ${restoredRows} criteria | ` +
  `+${stubbed.fit - fitCallsBeforeReload} fit calls, +${stubbed.fitScore - scoreCallsBeforeReload} score calls`);
if (!restoredTier || !/fit/i.test(restoredTier) || restoredRows < 1) {
  errs.push('FIT RESTORE: scorecard missing after reload');
}
if (stubbed.fit !== fitCallsBeforeReload || stubbed.fitScore !== scoreCallsBeforeReload) {
  errs.push('FIT RESTORE: reload re-hit the network instead of restoring from sessionStorage');
}
```

- [ ] **Step 2: Run the smoke test and confirm it fails for the right reason**

Run: `node test/smoke.mjs`
Expected: exits 1. The console line `reload id :` shows `CHANGED ...`, the `reload fit :` line shows an empty tier and `0 criteria`, and `errs` includes both `SESSION ID: changed across a same-tab reload` and `FIT RESTORE: scorecard missing after reload`. Every other assertion in the file still passes — this confirms the new checks are what's failing, not something unrelated.

- [ ] **Step 3: Commit**

```bash
git add test/smoke.mjs
git commit -m "test: assert sessionId and the fit scorecard survive a reload (issue #29)"
```

---

## Task 2: Persist `sessionId` to `sessionStorage`

**Files:**
- Modify: `src/engine.js:47-59` (the `state` object and the line above it)

**Interfaces:**
- Consumes: nothing new.
- Produces: `state.sessionId` — unchanged type (string UUID) and unchanged call sites (`src/engine.js:300,391,459`, `src/ui.js:630,697` already read `state.sessionId` and need no changes). New non-exported helper `loadSessionId()` is local to `engine.js` and not consumed elsewhere.

- [ ] **Step 1: Replace the `state` block**

In `src/engine.js`, replace:

```js
const state = {
  mode: "booting",            // booting | hybrid | lexical
  ready: false,
  embedder: null,
  passages: [],
  vecs: [],                   // Float32Array per passage
  bm25: null,
  backend: null,
  gens: 0, tokIn: 0, tokOut: 0, costUSD: 0,
  genFailStreak: 0,
  qcache: new Map(),
  sessionId: crypto.randomUUID()
};
```

with:

```js
/* ---------------- session identity ----------------
   sessionStorage, not localStorage (issue #29): survives a reload in the same
   tab, dies when the tab closes — the correct boundary for something called a
   session. No TTL — tab lifetime is the boundary. Private mode and blocked
   site data throw on *access*, not merely return null, so this is wrapped. */
function loadSessionId(){
  try {
    const existing = sessionStorage.getItem("askElroy.sessionId");
    if(existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem("askElroy.sessionId", fresh);
    return fresh;
  } catch(e){
    return crypto.randomUUID();
  }
}

const state = {
  mode: "booting",            // booting | hybrid | lexical
  ready: false,
  embedder: null,
  passages: [],
  vecs: [],                   // Float32Array per passage
  bm25: null,
  backend: null,
  gens: 0, tokIn: 0, tokOut: 0, costUSD: 0,
  genFailStreak: 0,
  qcache: new Map(),
  sessionId: loadSessionId()
};
```

- [ ] **Step 2: Rebuild**

Run: `./build.sh`
Expected: succeeds (no network needed — the corpus and vectors are untouched, so `tools/embed.mjs --verify` is checking source that hasn't changed).

- [ ] **Step 3: Run the smoke test and confirm the sessionId assertion now passes**

Run: `node test/smoke.mjs`
Expected: still exits 1, but the console `reload id :` line now reads `sessionId persisted` and `SESSION ID: changed across a same-tab reload` is gone from `errs`. `FIT RESTORE: scorecard missing after reload` is still present and expected — Task 3 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/engine.js index.html
git commit -m "Persist sessionId to sessionStorage so a reload keeps one session (issue #29)"
```

---

## Task 3: Persist and restore the last fit check

**Files:**
- Modify: `src/ui.js:397` (insert helpers immediately before `async function submitFit`)
- Modify: `src/ui.js:441-448` (inside `submitFit`, save on success)
- Modify: `src/ui.js:466` (insert `restoreFitState()` immediately after `submitFit` ends)
- Modify: `src/ui.js:1135-1136` (wire the restore into `boot()`)

**Interfaces:**
- Consumes: `renderFitPanel(panel)` (`src/ui.js:234`), `appendUserMsg(text)` (`src/ui.js:189`), `appendBotMsg(label, meta)` (`src/ui.js:215`), `renderAnswerIntoMsg(el, text, hits)` (`src/ui.js:215`), `mountVisitorCard()` (`src/ui.js:344`), `state.passages` (`src/engine.js`), the module-level `visitorDismissed` flag (`src/ui.js:328`).
- Produces: `saveFitState(jdText, panel, narrativeText, groundOk)` and `restoreFitState()` — both local to `ui.js`. `restoreFitState()` returns `true` if it restored a scorecard, `false` otherwise; `boot()` uses that return value to decide whether to fall back to `mountVisitorCard()`.

- [ ] **Step 1: Add the storage helpers before `submitFit`**

In `src/ui.js`, immediately before:

```js
async function submitFit(jdText){
```

insert:

```js
/* ---- fit-check persistence (issue #29) ----
   sessionStorage, wrapped: private mode and blocked site data throw on
   *access*, not merely return null. No TTL — tab lifetime is the boundary. */
const FIT_STATE_KEY = "askElroy.fitState";

function saveFitState(jdText, panel, narrativeText, groundOk){
  try {
    sessionStorage.setItem(FIT_STATE_KEY, JSON.stringify({ jdText, panel, narrativeText, groundOk }));
  } catch(e){ /* private mode, blocked storage, quota — the scorecard just won't survive a reload */ }
}

function loadFitState(){
  try {
    const raw = sessionStorage.getItem(FIT_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){
    return null;
  }
}

```

- [ ] **Step 2: Save on a successful fit check**

In `src/ui.js`, inside `submitFit`, replace:

```js
    const ground = checkGrounding(out.text, fakeHits);
    if(!ground.ok){
      const flag = document.createElement("p");
      flag.style.cssText = "color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px;margin-top:8px";
      flag.textContent = "Groundedness flag: this assessment did not cite its sources cleanly. Treat it with suspicion.";
      msgEl.querySelector(".msg-body").appendChild(flag);
    }

    state.gens++;
```

with:

```js
    const ground = checkGrounding(out.text, fakeHits);
    if(!ground.ok){
      const flag = document.createElement("p");
      flag.style.cssText = "color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px;margin-top:8px";
      flag.textContent = "Groundedness flag: this assessment did not cite its sources cleanly. Treat it with suspicion.";
      msgEl.querySelector(".msg-body").appendChild(flag);
    }
    saveFitState(text, panel, out.text, ground.ok);

    state.gens++;
```

(`panel` is `null` when the structured score failed — `JSON.stringify` handles that fine, and the restore step below skips rendering a null panel.)

- [ ] **Step 3: Add `restoreFitState()` after `submitFit`**

`submitFit` currently ends with:

```js
  } catch(err){
    setStreamingCaret(msgEl, false);
    msgEl.querySelector(".msg-body").innerHTML = `<p style="color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px">The fit check failed (${esc(err.message)}). Try again or email <a href="mailto:${esc(PROFILE.email)}" style="color:var(--color-accent)">${esc(PROFILE.email)}</a> directly.</p>`;
  }
  busy = false;
}
```

Immediately after that closing `}`, insert:

```js

function restoreFitState(){
  const saved = loadFitState();
  if(!saved || !saved.jdText || !saved.narrativeText) return false;

  visitorDismissed = true;
  mountVisitorCard();
  appendUserMsg("How well does this role match Elroy's background?");
  const msgEl = appendBotMsg("Fit assessment", "restored from this session");
  if(saved.panel) renderFitPanel(saved.panel);

  const fakeHits = state.passages.map(p => ({ p }));
  renderAnswerIntoMsg(msgEl, saved.narrativeText, fakeHits);
  if(saved.groundOk === false){
    const flag = document.createElement("p");
    flag.style.cssText = "color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px;margin-top:8px";
    flag.textContent = "Groundedness flag: this assessment did not cite its sources cleanly. Treat it with suspicion.";
    msgEl.querySelector(".msg-body").appendChild(flag);
  }

  const jd = $("#fit-jd");
  if(jd) jd.value = saved.jdText;
  return true;
}
```

- [ ] **Step 4: Wire it into `boot()`**

In `src/ui.js`, inside `boot()`, replace:

```js
  // the greeting lives in the hero now — the thread opens straight on the suggestions
  renderSuggest(null);
  mountVisitorCard();
```

with:

```js
  // the greeting lives in the hero now — the thread opens straight on the suggestions
  renderSuggest(null);
  if(!restoreFitState()) mountVisitorCard();
```

- [ ] **Step 5: Rebuild**

Run: `./build.sh`
Expected: succeeds.

- [ ] **Step 6: Run the smoke test and confirm it's fully green**

Run: `node test/smoke.mjs`
Expected: exits 0. `reload id :` reads `sessionId persisted`, `reload fit :` shows the restored tier and `2 criteria` (the stub's fixed two-criterion response) with `+0 fit calls, +0 score calls`, and `errs` is empty at the end (`js errors : none`).

- [ ] **Step 7: Commit**

```bash
git add src/ui.js index.html
git commit -m "Persist the last fit check to sessionStorage and restore it on load (issue #29)"
```

---

## Task 4: Disclose the new client-side persistence, and final verification

**Files:**
- Modify: `src/head.html:537`

**Interfaces:**
- Consumes: nothing (copy-only change).
- Produces: nothing (copy-only change).

- [ ] **Step 1: Rewrite the Session-panel disclosure paragraph**

In `src/head.html`, replace:

```html
          <p style="margin:12px 0 0;font-size:11.5px;line-height:1.5;color:var(--color-dim)">Your questions and the answers are logged to a private database, with country and browser string. No cookies, no third-party analytics, nothing that follows you across visits. A refresh clears the thread and starts a new session id.</p>
```

with:

```html
          <p style="margin:12px 0 0;font-size:11.5px;line-height:1.5;color:var(--color-dim)">Your questions and the answers are logged to a private database, with country and browser string. No cookies, no third-party analytics, nothing that follows you across visits. This tab keeps your session id and — if you've run one — your last fit check (the job description and its scorecard) in sessionStorage, so a reload won't lose them. Closing the tab discards both; the chat thread itself is never saved and a reload starts it over.</p>
```

- [ ] **Step 2: Rebuild**

Run: `./build.sh`
Expected: succeeds.

- [ ] **Step 3: Full verification**

Run, in order:
```bash
node --test test/*.test.mjs
node test/smoke.mjs
```
Expected: both exit 0. (`test/fit-score-stability.mjs` is intentionally excluded — per `CLAUDE.md` it costs real provider calls and is never run against this change.)

- [ ] **Step 4: Manually confirm the disclosure text renders**

Run: `grep -n "sessionStorage" index.html | head -5`
Expected: the new sentence appears in the built `index.html`, inside the Session panel markup.

- [ ] **Step 5: Commit**

```bash
git add src/head.html index.html
git commit -m "Disclose that sessionId and the last fit check now persist in sessionStorage (issue #29)"
```
