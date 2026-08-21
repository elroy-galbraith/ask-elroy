# Landing Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent hero section above the tab bar, merge Trace + Eval into an Advanced tab, and hide the status strip after boot.

**Architecture:** All changes are in `src/head.html` (markup, CSS) and `src/ui.js` (tab routing, boot). No new files. `./build.sh` concatenates `src/*` → `index.html`; `node test/smoke.mjs` validates in a headless Playwright browser. The three tasks are independent in behaviour and can be reviewed separately, but must all be built before the smoke test fully passes.

**Tech Stack:** Vanilla HTML/CSS/JS. Playwright smoke test. Build: `./build.sh`.

**Spec:** `docs/superpowers/specs/2026-08-20-landing-hero-design.md`

## Global Constraints

- Never edit `index.html` directly — always edit `src/*` then run `./build.sh`
- Smoke test must pass after all tasks: `node test/smoke.mjs`
- No new dependencies
- No changes to corpus, retrieval, or generation logic
- Existing IDs used by JS (`#pane-trace`, `#pane-eval`, `#runeval`, `#trace-tbody`, etc.) must not be renamed

---

### Task 1: Advanced tab — HTML, CSS, JS, and smoke test

Merge the Trace and Eval tabs into a single Advanced tab. Trace is the default sub-tab. The "Open the full trace →" button in chat messages calls `showTab("trace")`, which must continue to work by routing through Advanced.

**Files:**
- Modify: `src/head.html` — tab bar, panels
- Modify: `src/ui.js` — `showTab()`, new `showAdvancedTab()`, tab click handlers
- Modify: `test/smoke.mjs` — update eval tab navigation

---

- [ ] **Step 1: Update the smoke test first**

In `test/smoke.mjs`, replace line 44:
```js
await p.click('#tab-eval');
```
with:
```js
await p.click('#tab-advanced');
await p.click('#advtab-eval');
```

- [ ] **Step 2: Run the smoke test — confirm it fails**

```bash
node test/smoke.mjs
```
Expected: fails because `#tab-advanced` does not exist yet.

- [ ] **Step 3: Replace the tab bar in `src/head.html`**

Find the tab bar `<div>` (the one with `border-bottom` containing the four `tabbtn` buttons). Replace the four buttons with three — Chat, Fit check, Advanced — and remove the Trace and Eval buttons. Keep the `#tab-hint` span.

**Old buttons (lines ~172–178 in head.html):**
```html
  <div style="display:flex;border-bottom:1px solid var(--color-divider);margin-bottom:28px">
    <button class="tabbtn" id="tab-fit" aria-current="false">Fit check</button>
    <button class="tabbtn" id="tab-chat" aria-current="false">Chat</button>
    <button class="tabbtn" id="tab-trace" aria-current="false">Trace</button>
    <button class="tabbtn" id="tab-eval" aria-current="false">Eval</button>
    <span style="margin-left:auto;align-self:center;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:color-mix(in srgb,var(--color-text) 45%,transparent)" id="tab-hint"></span>
  </div>
```

**New buttons:**
```html
  <div style="display:flex;border-bottom:1px solid var(--color-divider);margin-bottom:28px">
    <button class="tabbtn" id="tab-chat" aria-current="false">Chat</button>
    <button class="tabbtn" id="tab-fit" aria-current="false">Fit check</button>
    <button class="tabbtn" id="tab-advanced" aria-current="false">Advanced</button>
    <span style="margin-left:auto;align-self:center;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:color-mix(in srgb,var(--color-text) 45%,transparent)" id="tab-hint"></span>
  </div>
```

- [ ] **Step 4: Remove the stale CSS rule for pane-trace / pane-eval**

In `src/head.html`, find and remove these two CSS lines (they conflict with the inline `display:block` we will set on `pane-trace`):
```css
#pane-trace,#pane-eval{display:none}
#pane-trace.active,#pane-eval.active{display:block}
```

- [ ] **Step 5: Wrap pane-trace and pane-eval in pane-advanced**

In `src/head.html`, replace the two existing top-level panel comments and divs:

```html
  <!-- ===== TRACE PANEL ===== -->
  <div id="pane-trace" style="padding-bottom:80px">
```
...and...
```html
  <!-- ===== EVAL PANEL ===== -->
  <div id="pane-eval" style="padding-bottom:80px">
```

Wrap both inside a new `pane-advanced` div. The new structure, placed where the Trace panel comment currently is, should look like this (keep all existing inner content of pane-trace and pane-eval unchanged):

```html
  <!-- ===== ADVANCED PANEL ===== -->
  <div id="pane-advanced" style="display:none">

    <!-- Advanced sub-tab bar -->
    <div style="display:flex;border-bottom:1px solid var(--color-divider);margin-bottom:28px">
      <button class="tabbtn" id="advtab-trace" aria-current="true" onclick="showAdvancedTab('trace')">Trace</button>
      <button class="tabbtn" id="advtab-eval" aria-current="false" onclick="showAdvancedTab('eval')">Evaluation</button>
    </div>

    <div id="pane-trace" style="display:block;padding-bottom:80px">
      <!-- ...existing trace panel content unchanged... -->
    </div>

    <div id="pane-eval" style="display:none;padding-bottom:80px">
      <!-- ...existing eval panel content unchanged... -->
    </div>

  </div>
```

The Eval panel immediately follows the Trace panel (no blank comment section between them). The closing `</div><!-- /container -->` stays in place after pane-advanced.

- [ ] **Step 6: Replace `showTab()` in `src/ui.js`**

Find the existing `showTab` function (lines ~8–18) and replace it entirely:

```js
function showTab(name){
  if(name === "trace"){ showTab("advanced"); showAdvancedTab("trace"); return; }
  if(name === "eval"){ showTab("advanced"); showAdvancedTab("eval"); return; }
  ["fit","chat","advanced"].forEach(t => {
    const btn = $("#tab-"+t);
    if(btn) btn.setAttribute("aria-current", t === name ? "true" : "false");
    const panel = $("#pane-"+t);
    if(!panel) return;
    panel.style.display = (t === name) ? (t === "chat" ? "grid" : "block") : "none";
  });
  $("#input-tray").style.display = name === "chat" ? "" : "none";
  const hints = {fit:"paste a job description to check the fit", chat:"grounded answers only", advanced:"retrieval internals · eval suite"};
  $("#tab-hint").textContent = hints[name] || "";
}
```

Key behaviours:
- `showTab(null)` — no panel visible, no tab highlighted, input tray hidden
- `showTab("trace")` — activates Advanced, then selects Trace sub-tab
- `showTab("eval")` — activates Advanced, then selects Evaluation sub-tab
- `showTab("advanced")` — shows pane-advanced with whichever sub-tab is currently active

- [ ] **Step 7: Add `showAdvancedTab()` to `src/ui.js`**

Insert this function immediately after the new `showTab`:

```js
function showAdvancedTab(name){
  ["trace","eval"].forEach(t => {
    const btn = $("#advtab-"+t);
    if(btn) btn.setAttribute("aria-current", t === name ? "true" : "false");
    const panel = $("#pane-"+t);
    if(panel) panel.style.display = t === name ? "block" : "none";
  });
}
window.showAdvancedTab = showAdvancedTab;
```

- [ ] **Step 8: Update tab click handlers in `src/ui.js`**

Find the block starting with `$("#tab-fit").onclick` (near the bottom of ui.js, around line 736). Replace:

```js
$("#tab-fit").onclick     = () => showTab("fit");
$("#tab-chat").onclick    = () => showTab("chat");
$("#tab-trace").onclick   = () => showTab("trace");
$("#tab-eval").onclick    = () => showTab("eval");
```

with:

```js
$("#tab-chat").onclick     = () => showTab("chat");
$("#tab-fit").onclick      = () => showTab("fit");
$("#tab-advanced").onclick = () => showTab("advanced");
```

- [ ] **Step 9: Build and run the smoke test**

```bash
./build.sh && node test/smoke.mjs
```

Expected: smoke test passes (eval metrics appear, no JS errors).

- [ ] **Step 10: Commit**

```bash
git add src/head.html src/ui.js test/smoke.mjs
git commit -m "feat: merge Trace + Eval into Advanced tab"
```

---

### Task 2: Hero section

Expand the existing header into a persistent hero. Adds pitch text and two CTA buttons below the tagline. No tab behaviour changes.

**Files:**
- Modify: `src/head.html` — header-grid left column
- Modify: `src/ui.js` — CTA button wiring

---

- [ ] **Step 1: Add pitch text and CTA buttons to the header in `src/head.html`**

Find the left column of `#header-grid`. It currently ends with:

```html
      <div id="ptag" style="font-size:17px;color:color-mix(in srgb,var(--color-text) 68%,transparent)"></div>
    </div>
```

Insert the pitch paragraph and CTA buttons between `#ptag` and the closing `</div>`:

```html
      <div id="ptag" style="font-size:17px;color:color-mix(in srgb,var(--color-text) 68%,transparent)"></div>
      <p style="font-size:16px;line-height:1.65;color:var(--color-dim);margin:14px 0 22px;max-width:52ch;text-wrap:pretty">I answer questions about Elroy's experience, projects, and what he's looking for next — grounded in what he wrote about himself. Every answer shows exactly where it came from.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-primary blueprint" id="hero-chat" style="padding:12px 28px;font-size:15px">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          Chat with me →
        </button>
        <button class="btn btn-primary blueprint" id="hero-fit" style="padding:12px 28px;font-size:15px;background:transparent;border:1px solid var(--color-accent);color:var(--color-accent)">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          Check job fit →
        </button>
      </div>
    </div>
```

Note: "Chat with me →" uses the filled primary button. "Check job fit →" uses a ghost variant (transparent bg, accent border/colour) to create visual hierarchy.

- [ ] **Step 2: Wire CTA buttons in `src/ui.js`**

Find the block of tab click handlers (the section with `$("#tab-chat").onclick` from Task 1). Add the CTA wiring immediately after:

```js
const heroChatBtn = $("#hero-chat");
if(heroChatBtn) heroChatBtn.onclick = () => showTab("chat");
const heroFitBtn = $("#hero-fit");
if(heroFitBtn) heroFitBtn.onclick = () => showTab("fit");
```

- [ ] **Step 3: Build and visually verify**

```bash
./build.sh
```

Open `index.html` in a browser. Confirm:
- Hero pitch text appears below the tagline
- "Chat with me →" (filled blue) and "Check job fit →" (outline) appear side by side
- Clicking each CTA navigates to the correct panel
- On a narrow viewport (< 640 px), buttons stack vertically via `flex-wrap:wrap`

- [ ] **Step 4: Commit**

```bash
git add src/head.html src/ui.js
git commit -m "feat: add persistent hero section with pitch text and CTA buttons"
```

---

### Task 3: Boot state and status strip

On load, show no tab panel (hero is the entry point). After the embedding model loads and the overlay dismisses, hide the status strip entirely.

**Files:**
- Modify: `src/ui.js` — `boot()` function

---

- [ ] **Step 1: Change the initial tab in `boot()`**

In `src/ui.js`, find the `boot()` function. It contains:

```js
  showTab("fit");
```

Change it to:

```js
  showTab(null);
```

- [ ] **Step 2: Hide the status strip after boot**

In `boot()`, find the `dismissOverlay()` call. It looks like:

```js
  dismissOverlay();
  state.ready = true;
```

Add the strip hide between them:

```js
  dismissOverlay();
  const strip = $("#status-strip");
  if(strip) strip.style.display = "none";
  state.ready = true;
```

- [ ] **Step 3: Build and visually verify**

```bash
./build.sh
```

Open `index.html` in a browser. Confirm:
- On load the boot overlay appears, then dismisses
- After dismiss: hero is visible, no tab panel is shown below the tab bar, input tray is hidden, status strip is gone
- Clicking "Chat with me →" shows the chat panel and input tray
- Clicking "Check job fit →" shows the fit panel
- Clicking the Advanced tab shows the Trace sub-tab by default; clicking Evaluation switches to it

- [ ] **Step 4: Run the full smoke test**

```bash
node test/smoke.mjs
```

Expected output includes eval metrics (`hit@K`, `MRR`, `refusal`) and `js errors: none`.

- [ ] **Step 5: Commit**

```bash
git add src/ui.js
git commit -m "feat: show no panel on boot, hide status strip after ready"
```
