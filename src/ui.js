
/* =====================================================================
   UI layer: chat, trace panel, sidebar, evaluation harness
   ===================================================================== */
const $ = s => document.querySelector(s);

/* ---- tabs ---- */
function showTab(name){
  if(name === "trace"){ showTab("advanced"); showAdvancedTab("trace"); return; }
  if(name === "eval"){ showTab("advanced"); showAdvancedTab("eval"); return; }
  ["fit","cv","chat","advanced"].forEach(t => {
    const btn = $("#tab-"+t);
    if(btn) btn.setAttribute("aria-current", t === name ? "true" : "false");
    const panel = $("#pane-"+t);
    if(!panel) return;
    panel.style.display = (t === name) ? (t === "chat" ? "grid" : "block") : "none";
  });
  $("#input-tray").style.display = name === "chat" ? "" : "none";
  const hints = {fit:"paste a job description to check the fit", cv:"conventional CV view", chat:"grounded answers only", advanced:"retrieval internals · eval suite"};
  $("#tab-hint").textContent = hints[name] || "";
}

function showAdvancedTab(name){
  ["trace","eval"].forEach(t => {
    const btn = $("#advtab-"+t);
    if(btn) btn.setAttribute("aria-current", t === name ? "true" : "false");
    const panel = $("#pane-"+t);
    if(panel) panel.style.display = t === name ? "block" : "none";
  });
}
window.showAdvancedTab = showAdvancedTab;

/* ---- eval sub-tabs ---- */
function showEvalTab(name){
  ["retrieval","genqual"].forEach(t => {
    const btn = $("#evaltab-"+t);
    if(btn) btn.setAttribute("aria-current", t === name ? "true" : "false");
    const panel = $("#eval-sub-"+t);
    if(panel) panel.style.display = t === name ? "" : "none";
  });
}
window.showEvalTab = showEvalTab;

/* ---- status strip ---- */
function setStatus(text, state){
  const dot = $("#status-indicator");
  if(dot) dot.style.background = state === "ok" ? "var(--color-ok)" : state === "warn" ? "var(--color-warn)" : "var(--color-dim)";
  const el = $("#status-text");
  if(el) el.textContent = text;
}
function setStatusDetails(model, index){
  const m = $("#status-model"); if(m) m.textContent = model || "";
  const i = $("#status-index"); if(i) i.textContent = index || "";
}

/* ---- sidebar ---- */
function updateSessionSidebar(){
  const cost = (state.tokIn/1e6)*CONFIG.price.in + (state.tokOut/1e6)*CONFIG.price.out;
  $("#sb-gens").textContent = state.gens + " / " + CONFIG.maxGenPerSession;
  $("#sb-toks").textContent = state.tokIn + " / " + state.tokOut;
  $("#sb-spend").textContent = "$" + cost.toFixed(5);
  refreshCost();
}

/* ---- trace panel ---- */
function updateTracePanel(trace){
  $("#trace-query").textContent = trace.query;
  $("#trace-terms").textContent = trace.terms.length ? "tokens: " + trace.terms.join(" · ") : "tokens: —";

  const tbody = $("#trace-tbody");
  tbody.innerHTML = trace.rows.map((h, i) => {
    const bar = Math.max(2, Math.round(h.rrf / 0.033 * 100));
    const used = i < trace.k;
    return `<tr>
      <td class="mono" style="color:var(--color-dim);font-size:12px">${String(i+1).padStart(2,"0")}</td>
      <td>
        <div class="mono" style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--color-accent-700);margin-bottom:2px">${esc(h.p.pid)}</div>
        <div style="font-size:13.5px;line-height:1.45;max-width:56ch;text-wrap:pretty">${esc(h.p.text)}</div>
        ${h.hit && h.hit.length ? `<div style="font-size:11.5px;margin-top:3px;color:var(--color-dim)">matched ${h.hit.slice(0,5).map(esc).join(", ")}</div>` : `<div style="font-size:11.5px;margin-top:3px;color:var(--color-dim)">fused on rank, no direct term overlap</div>`}
      </td>
      <td class="mono" style="font-size:11.5px;color:var(--color-dim)">
        <div>${h.cos !== null ? "cos " + h.cos.toFixed(3) : "—"}</div>
        <div>bm25 ${h.bm25.toFixed(2)}</div>
      </td>
      <td>
        <div style="height:8px;background:color-mix(in srgb,var(--color-text) 9%,transparent);position:relative">
          <div style="position:absolute;inset:0 auto 0 0;background:var(--color-accent);width:${bar}%"></div>
        </div>
        <div class="mono" style="font-size:11.5px;margin-top:4px">${h.rrf.toFixed(4)}</div>
      </td>
      <td class="mono" style="font-size:11.5px">${used ? "yes" : "—"}</td>
    </tr>`;
  }).join("");

  // pipeline
  const passCount = state.passages.length;
  const gateRule = state.mode === "hybrid"
    ? "cosine ≥ " + CONFIG.scopeThreshold.toFixed(2) + " or coverage ≥ " + CONFIG.covThreshold.toFixed(2)
    : "coverage ≥ " + CONFIG.lexThreshold.toFixed(2) + " (no dense arm until the model loads)";
  const pipeline = [
    {n:"01", name:"Chunk", detail:"paragraph and list-item level, title travels with the chunk", ms:"cached"},
    {n:"02", name:"Embed query", detail:"all-MiniLM-L6-v2 · WASM · q8", ms: trace.msEmbed ? Math.round(trace.msEmbed) + " ms" : "—"},
    {n:"03", name:"BM25 + dense", detail:"scored independently over " + passCount + " passages", ms: Math.round(trace.msRetrieve) + " ms"},
    {n:"04", name:"RRF fusion", detail:"reciprocal rank, k=60, no tuned weight", ms:"<1 ms"},
    {n:"05", name:"Scope gate", detail: gateRule + ", before any model call", ms: trace.answered ? "pass" : "refuse"},
    {n:"06", name:"Generate + verify", detail:"worker holds the key; citations parsed and checked", ms: trace.answered ? (trace.msGen ? Math.round(trace.msGen) + " ms" : "ready") : "skipped"}
  ];
  $("#trace-pipeline").innerHTML = pipeline.map(p => `
    <div style="display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:10px;align-items:baseline">
      <span class="mono" style="font-size:11px;color:var(--color-accent)">${p.n}</span>
      <div>
        <div style="font-size:13.5px">${p.name}</div>
        <div style="font-size:11.5px;color:var(--color-dim);text-wrap:pretty">${p.detail}</div>
      </div>
      <span class="mono" style="font-size:11.5px">${p.ms}</span>
    </div>`).join("");

  // gate & grounding
  const cost = trace.usage
    ? ((trace.usage.input_tokens/1e6)*CONFIG.price.in + (trace.usage.output_tokens/1e6)*CONFIG.price.out) : 0;
  $("#tg-mode").textContent = state.mode + (state.backend ? " · " + state.backend.split(" · ")[1] : "");
  // Both arms are shown, and the one that carried the decision is marked, so the panel
  // cannot imply a single-threshold gate that is no longer what runs.
  const hybrid = state.mode === "hybrid";
  const byCos = hybrid && trace.conf >= CONFIG.scopeThreshold;
  const byCov = trace.cov >= (hybrid ? CONFIG.covThreshold : CONFIG.lexThreshold);
  $("#tg-conf").textContent = hybrid ? trace.conf.toFixed(3) + (byCos ? " ✓" : "") : "—";
  $("#tg-cov").textContent  = trace.cov.toFixed(3) + (byCov ? " ✓" : "");
  $("#tg-gate").textContent = hybrid
    ? "≥" + CONFIG.scopeThreshold.toFixed(2) + " or ≥" + CONFIG.covThreshold.toFixed(2)
    : "≥" + CONFIG.lexThreshold.toFixed(2) + " cov";
  $("#tg-decision").textContent = trace.answered ? "answer" : "refuse";
  $("#tg-retrieve").textContent = Math.round(trace.msRetrieve) + " ms";
  $("#tg-citations").textContent = trace.ground
    ? (trace.ground.ok ? "valid · " + Math.round(trace.ground.coverage*100) + "% cited" : "FLAG — check answer")
    : (trace.answered ? "n/a" : "n/a");
  $("#tg-tokens").textContent = trace.usage ? trace.usage.input_tokens + " in / " + trace.usage.output_tokens + " out" : "—";
  $("#tg-cost").textContent = trace.usage ? "$" + cost.toFixed(5) : "$0.00000";
}

/* ---- boot timing panel ----
   The cold-start budget, split by stage. These are the numbers the
   ship-to-client work is judged against, so they are on the page rather than
   in a console log — same rule as the eval suite. */
function fmtMs(ms){
  if(ms === null || ms === undefined) return "—";
  return ms >= 1000 ? (ms/1000).toFixed(2) + " s" : Math.round(ms) + " ms";
}
function updateBootPanel(){
  const el = $("#boot-timing");
  if(!el) return;
  const st = bootPerf.stages;
  const embedNote = state.vecs.length
    ? "precomputed at build time — " + state.vecs.length + " x " + (typeof VECTORS !== "undefined" ? VECTORS.dim : "?") + " int8"
    : state.passages.length + " passages, embedded in this tab";
  const rows = [
    ["CDN import()",  st.cdn,     "transformers.js off jsdelivr"],
    ["model load",    st.model,   "ONNX weights fetch + compile"],
    ["warm-up",       st.warmup,  "first forward pass"],
    ["passage embed", state.vecs.length ? null : st.embed, embedNote]
  ];
  const failed = bootPerf.attempts.filter(a => !a.ok);
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px">
      <span style="color:var(--color-dim)" title="base64 -> int8 -> Float32Array, no network">decode vectors</span>
      <span>${fmtMs(st.decode)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--color-divider);padding-bottom:6px">
      <span style="color:var(--color-dim)">answerable at</span><span>${fmtMs(bootPerf.total || null)}</span>
    </div>
    <div style="font-size:11px;color:var(--color-dim);letter-spacing:.04em;text-transform:uppercase">dense upgrade, off the critical path</div>` +
    rows.map(([k,v,note]) => `
    <div style="display:flex;justify-content:space-between;gap:10px">
      <span style="color:var(--color-dim)" title="${esc(note)}">${esc(k)}</span>
      <span>${state.vecs.length && k === "passage embed" ? "precomputed" : fmtMs(v)}</span>
    </div>`).join("") + `
    <div style="display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--color-divider);padding-top:6px">
      <span style="color:var(--color-dim)">hybrid at</span><span>${bootPerf.upgrade ? fmtMs(bootPerf.upgrade + bootPerf.total) : "—"}</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px">
      <span style="color:var(--color-dim)">backend</span><span style="text-align:right">${esc(bootPerf.backend || state.mode)}</span>
    </div>` +
    (failed.length ? `<div style="font-size:11px;color:var(--color-warn);text-wrap:pretty">${failed.length} backend${failed.length>1?"s":""} failed first: ${failed.map(a => esc(a.label.split(" \u00b7 ").slice(1).join(" \u00b7 ")) + " (" + fmtMs(a.ms) + ")").join(", ")}</div>` : "");
}

/* ---- chat messages ---- */
const logEl = $("#log");

function appendUserMsg(text){
  const d = document.createElement("div");
  d.innerHTML = `<div style="display:flex;justify-content:flex-end">
    <div style="background:var(--color-accent-900);color:var(--color-bg);padding:10px 15px;font-size:15px;max-width:72%">${esc(text)}</div>
  </div>`;
  logEl.appendChild(d);
  d.scrollIntoView({behavior:"smooth", block:"nearest"});
}

function appendBotMsg(label, meta){
  const d = document.createElement("div");
  d.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-weight:600;font-size:15px;letter-spacing:.05em;text-transform:uppercase">${esc(label)}</span>
      <span class="mono" style="font-size:11px;color:var(--color-dim)">${esc(meta)}</span>
    </div>
    <div style="border-left:2px solid var(--color-accent);padding-left:17px;max-width:86ch">
      <div class="msg-body"></div>
    </div>
    <div class="msg-cites" style="margin-top:16px"></div>
    <div class="msg-actions" style="margin-top:8px"></div>`;
  logEl.appendChild(d);
  d.scrollIntoView({behavior:"smooth", block:"nearest"});
  return d;
}

function renderAnswerIntoMsg(el, text, hits){
  const body = el.querySelector(".msg-body");
  const html = esc(text)
    .replace(/\[(\d+)\]/g, (m,n) => `<sup style="color:var(--color-accent);font-weight:600;cursor:help" title="${esc((hits[n-1]||{p:{text:""}}).p.text.slice(0,180))}">[${n}]</sup>`)
    .split(/\n{2,}/).map(p => `<p style="margin:0 0 11px;font-size:15.5px;line-height:1.62;text-wrap:pretty">${p.replace(/\n/g,"<br>")}</p>`).join("");
  body.innerHTML = html;
}

function renderFitPanel(panel){
  const panelEl = $("#chat-fit-panel");
  const aside = $("#chat-aside");
  const pane = $("#pane-chat");
  if(!panelEl || !aside || !pane) return;
  // the scorecard takes the rail from the visitor card and stays on screen as the thread scrolls
  fitShown = true;
  const slot = $("#chat-visitor");
  if(slot){ slot.innerHTML = ""; slot.style.display = "none"; }
  panelEl.style.display = "block";
  syncAside();
  const rows = (panel.criteria || []).map(c => {
    const lo = Math.min(c.skeptic, c.advocate), hi = Math.max(c.skeptic, c.advocate);
    const badges = [
      c.contested ? `<span class="fit-badge-contested" title="lenses disagree by ≥30, with at least one above the gap line">⚠ contested</span>` : "",
      c.gap ? `<span class="fit-badge-gap" title="likely gap">✕ gap</span>` : ""
    ].filter(Boolean).join(" &middot; ");
    return `<div class="fit-row">
      <div class="fit-row-top">
        <span class="fit-row-label">${esc(c.label)}</span>
        <span class="fit-row-weight">${"●".repeat(Math.max(0, Math.min(3, c.weight|0)))}</span>
        <span class="fit-row-badges">${badges}</span>
      </div>
      <div class="fit-track">
        <div class="fit-range" style="left:${lo}%;width:${Math.max(1, hi-lo)}%"></div>
        <div class="fit-mid" style="left:${c.midpoint}%"></div>
      </div>
      <div class="fit-scores">skeptic ${c.skeptic} &nbsp;·&nbsp; advocate ${c.advocate}</div>
    </div>`;
  }).join("");
  panelEl.innerHTML = `
    <div class="section-label" style="margin-bottom:11px">Fit check</div>
    <div class="fit-panel-head">
      <span class="fit-tier">${esc((panel.tier || "").toUpperCase())}</span>
      <span class="fit-overall">${esc(String(panel.overall))}/100 · weighted across ${(panel.criteria||[]).length} criteria</span>
    </div>
    ${rows}
    <div class="fit-legend">⚠ contested = lenses disagree by ≥30 above the gap line &nbsp;·&nbsp; ✕ = likely gap</div>`;
}

function setStreamingCaret(el, on){
  const body = el.querySelector(".msg-body");
  const existing = body.querySelector(".caret");
  if(on && !existing){ const c = document.createElement("span"); c.className = "caret"; body.appendChild(c); }
  if(!on && existing) existing.remove();
}

function renderCitesInMsg(el, hits, passCount){
  const cites = el.querySelector(".msg-cites");
  if(!hits || !hits.length){ cites.innerHTML = ""; return; }
  cites.innerHTML = `
    <details style="margin-top:4px">
      <summary style="cursor:pointer;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-dim);list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
        <span style="font-family:var(--font-mono)">▸</span> Retrieved passages · ${hits.length} of ${passCount}
      </summary>
      <div style="display:grid;gap:12px;margin-top:12px">
        ${hits.map((h,i) => `
          <div class="blueprint" style="display:grid;grid-template-columns:32px minmax(0,1fr) 92px;gap:14px;padding:11px 14px">
            <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
            <span class="mono" style="font-size:13px;color:var(--color-accent);font-weight:700">[${i+1}]</span>
            <div style="min-width:0">
              <div class="mono" style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--color-dim);margin-bottom:3px">${esc(h.p.pid)}</div>
              <div style="font-size:13.5px;line-height:1.5;text-wrap:pretty">${esc(h.p.text)}</div>
            </div>
            <div style="text-align:right">
              <div class="mono" style="font-size:12.5px">${h.cos !== null ? h.cos.toFixed(3) : "—"}</div>
              <div style="font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--color-dim)">cosine</div>
            </div>
          </div>`).join("")}
      </div>
    </details>`;
}

function addTraceLink(el){
  const actions = el.querySelector(".msg-actions");
  const btn = document.createElement("button");
  btn.className = "btn-ghost";
  btn.textContent = "Open the full trace →";
  btn.onclick = () => showTab("trace");
  actions.appendChild(btn);
}

/* ---- refusal message ---- */
function appendRefusal(meta){
  const d = appendBotMsg("Refused — below the scope gate", meta);
  const body = d.querySelector(".msg-body");
  body.innerHTML = `
    <p style="margin:0 0 11px;font-size:15.5px;line-height:1.62">That is outside the corpus Elroy wrote, so I will not answer it — the gate fires before any model call, which is why an out-of-scope question costs nothing here.</p>
    <p style="margin:0;font-size:15.5px;line-height:1.62">Email him at <a href="mailto:${esc(PROFILE.email)}" style="color:var(--color-accent)">${esc(PROFILE.email)}</a> and he will answer directly.</p>`;
  return d;
}

/* ---- suggestion chips ---- */
let activeCat = CATS[0];
let visitorDismissed = false;
let visitor = null;
const sugEl = $("#suggest");

/* The right rail holds one thing at a time: the visitor card while it is still
   worth asking who is here, then the fit scorecard once a check has run. */
let fitShown = false;

function syncAside(){
  const aside = $("#chat-aside"), pane = $("#pane-chat"), slot = $("#chat-visitor");
  if(!aside || !pane) return;
  const open = fitShown || (slot && slot.style.display !== "none");
  aside.style.display = open ? "block" : "none";
  pane.style.gridTemplateColumns = open ? "minmax(0,1fr) 320px" : "minmax(0,1fr)";
}

function mountVisitorCard(){
  const slot = $("#chat-visitor");
  if(!slot) return;
  slot.innerHTML = "";
  if(visitorDismissed || fitShown){ slot.style.display = "none"; syncAside(); return; }
  slot.appendChild(renderVisitorCard());
  slot.style.display = "block";
  syncAside();
}

function renderVisitorCard(){
  const card = document.createElement("div");
  card.style.cssText = "background:var(--color-panel);border:1px solid var(--color-divider);padding:13px 15px;cursor:pointer;display:flex;align-items:flex-start;gap:10px";
  card.innerHTML = `<span style="font-size:1.05rem;flex-shrink:0;line-height:1.35">👋</span><span style="min-width:0">
    <span style="font-size:.88rem;display:block;line-height:1.45">Before you start — who are you?</span>
    <span style="font-size:.78rem;color:var(--color-dim);display:block;margin-top:3px">Optional — skip and ask anything</span></span>`;
  function openForm(){ showVisitorForm(card); }
  card.onclick = openForm;
  return card;
}

function showVisitorForm(card){
  card.onclick = null;
  card.style.flexDirection = "column"; card.style.alignItems = "stretch"; card.style.cursor = "default";
  card.innerHTML = `
    <form id="vf" autocomplete="off">
      <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px">
        <input type="text" id="vf-name" placeholder="Name" style="flex:1 1 120px;background:var(--color-bg);border:1px solid var(--color-divider);color:var(--color-text);border-radius:0;padding:7px 10px;font-family:var(--font-body);font-size:.83rem;min-width:0">
        <input type="text" id="vf-co" placeholder="Company" style="flex:1 1 120px;background:var(--color-bg);border:1px solid var(--color-divider);color:var(--color-text);border-radius:0;padding:7px 10px;font-family:var(--font-body);font-size:.83rem;min-width:0">
        <input type="text" id="vf-role" placeholder="Role" style="flex:1 1 120px;background:var(--color-bg);border:1px solid var(--color-divider);color:var(--color-text);border-radius:0;padding:7px 10px;font-family:var(--font-body);font-size:.83rem;min-width:0">
      </div>
      <div style="display:flex;gap:7px">
        <button type="submit" class="chip">Done</button>
        <button type="button" class="chip" id="vf-skip">Skip</button>
      </div>
    </form>`;
  card.querySelector("#vf").onsubmit = e => {
    e.preventDefault();
    const name = card.querySelector("#vf-name").value.trim();
    visitor = { name, company: card.querySelector("#vf-co").value.trim(), role: card.querySelector("#vf-role").value.trim() };
    visitorDismissed = true;
    mountVisitorCard();
    renderSuggest(null);
    if(name){
      const d = appendBotMsg("Hey there", "");
      d.querySelector(".msg-body").innerHTML = `<p style="margin:0;font-size:15.5px;line-height:1.62">Thanks, ${esc(name)}! What would you like to know?</p>`;
    }
  };
  card.querySelector("#vf-skip").onclick = () => { visitorDismissed = true; mountVisitorCard(); renderSuggest(null); };
  setTimeout(() => card.querySelector("#vf-name").focus(), 0);
}

async function submitFit(jdText){
  const text = jdText.trim();
  if(!text || busy) return;
  busy = true;
  showTab("chat");
  visitorDismissed = true;
  mountVisitorCard();   // clear the rail; the scorecard claims it below
  appendUserMsg("How well does this role match Elroy's background?");
  const msgEl = appendBotMsg("Fit assessment", "assessing…");

  if(!CONFIG.generatorUrl){
    setStreamingCaret(msgEl, false);
    msgEl.querySelector(".msg-body").innerHTML = `<p style="color:var(--color-dim);font-size:.85rem">No generator configured — fit assessment requires the live worker.</p>`;
    busy = false; return;
  }

  const vName = visitor ? visitor.name : null;
  const vCo   = visitor ? visitor.company : null;

  // 1. Structured score panel — additive; its failure must never break the narrative.
  let panel = null;
  try {
    panel = await generateScore(text, vName, vCo);
    renderFitPanel(panel);
  } catch(err){
    console.warn("fit score failed", err);
    panel = null; // degrade to narrative-only
  }

  // 2. Narrative, streamed and kept consistent with the panel.
  setStreamingCaret(msgEl, true);
  let acc = "";
  const fakeHits = state.passages.map(p => ({ p }));
  try{
    const out = await generateFit(text, tok => {
      acc += tok;
      renderAnswerIntoMsg(msgEl, acc, fakeHits);
      setStreamingCaret(msgEl, true);
      msgEl.scrollIntoView({ behavior:"smooth", block:"nearest" });
    }, vName, vCo, panel);

    setStreamingCaret(msgEl, false);
    renderAnswerIntoMsg(msgEl, out.text, fakeHits);

    const ground = checkGrounding(out.text, fakeHits);
    if(!ground.ok){
      const flag = document.createElement("p");
      flag.style.cssText = "color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px;margin-top:8px";
      flag.textContent = "Groundedness flag: this assessment did not cite its sources cleanly. Treat it with suspicion.";
      msgEl.querySelector(".msg-body").appendChild(flag);
    }

    state.gens++;
    if(out.usage){
      state.tokIn += out.usage.input_tokens;
      state.tokOut += out.usage.output_tokens;
      state.costUSD += (out.usage.input_tokens/1e6)*CONFIG.price.in + (out.usage.output_tokens/1e6)*CONFIG.price.out;
      updateSessionSidebar();
    }
    const metaEl = msgEl.querySelector(".mono");
    if(metaEl && out.usage){
      const cost = (out.usage.input_tokens/1e6)*CONFIG.price.in + (out.usage.output_tokens/1e6)*CONFIG.price.out;
      metaEl.textContent = state.passages.length + " passages · $" + cost.toFixed(5);
    }
  } catch(err){
    setStreamingCaret(msgEl, false);
    msgEl.querySelector(".msg-body").innerHTML = `<p style="color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px">The fit check failed (${esc(err.message)}). Try again or email <a href="mailto:${esc(PROFILE.email)}" style="color:var(--color-accent)">${esc(PROFILE.email)}</a> directly.</p>`;
  }
  busy = false;
}

function renderSuggest(list, heading){
  sugEl.innerHTML = "";

  const h = document.createElement("div");
  h.style.cssText = "font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--color-dim);margin-bottom:11px";
  h.textContent = heading || "Suggested questions";
  sugEl.appendChild(h);

  if(!list){
    const cats = document.createElement("div");
    cats.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;margin-bottom:13px";
    CATS.forEach(c => {
      const b = document.createElement("button");
      b.className = "chip cat";
      b.setAttribute("data-on", c === activeCat ? "1" : "0");
      b.textContent = c;
      b.onclick = () => { activeCat = c; renderSuggest(null, heading); };
      cats.appendChild(b);
    });
    sugEl.appendChild(cats);
    list = BANK.filter(e => e.cat === activeCat).map(e => e.q);
  }

  const w = document.createElement("div");
  w.style.cssText = "display:flex;flex-wrap:wrap;gap:7px";
  list.forEach(q => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = q;
    b.onclick = () => ask(q);
    w.appendChild(b);
  });
  sugEl.appendChild(w);
}

/* ---- job-description detection ----
   Someone with a JD in the clipboard will paste it into whichever box is in
   front of them. Run through the ask loop it becomes one long retrieval query,
   which either trips the scope gate or returns a five-passage answer to a
   question nobody asked. Detect it and offer the fit check instead — offer,
   never auto-route: a false positive must cost one click, not the answer. */
const JD_STRONG = [
  /\bjob description\b/, /\bwe(?:'re| are)\s+(?:hiring|looking for|seeking)\b/,
  /\bwhat you(?:'ll| will)\s+do\b/, /\bwhat we(?:'re| are)\s+looking for\b/,
  /\b(?:minimum|preferred|basic)\s+qualifications\b/, /\babout the (?:role|job|position)\b/,
  /\bequal opportunity employer\b/, /\bideal candidate\b/
];
const JD_MARKERS = [
  /\bresponsibilit(?:y|ies)\b/, /\brequirements?\b/, /\bqualifications?\b/,
  /\byears? of (?:relevant\s+)?experience\b/, /\bnice[- ]to[- ]have\b/, /\bmust[- ]have\b/,
  /\bthe (?:role|position)\b/, /\byou(?:'ll| will) (?:be|work|own|lead|build|report)\b/,
  /\bour team\b/, /\bfull[- ]time\b/, /\bremote[- ](?:first|friendly)\b/,
  /\bsalary\b/, /\bcompensation\b/, /\bbenefits\b/, /\bapply\b/, /\bstack\b/
];

function looksLikeJobDescription(text){
  const t = String(text).toLowerCase();
  if(t.length < 220) return false;
  const strong  = JD_STRONG.filter(re => re.test(t)).length;
  const markers = JD_MARKERS.filter(re => re.test(t)).length;
  // A strong signal still needs corroboration; without one, demand bulk plus breadth.
  if(strong && strong + markers >= 2) return true;
  return t.length >= 400 && markers >= 3;
}

function offerFitCheck(jdText){
  const d = appendBotMsg("That looks like a job description", "no model call yet · $0.00000");
  d.querySelector(".msg-body").innerHTML = `
    <p style="margin:0 0 11px;font-size:15.5px;line-height:1.62">Pasted into the chat box it becomes one long retrieval query, which is not what you want from it.</p>
    <p style="margin:0;font-size:15.5px;line-height:1.62">The fit check reads the whole description instead: it scores the role against Elroy's background on weighted criteria, twice — once as a skeptic, once as an advocate — and flags where the two lenses disagree. Shall I run that?</p>`;
  const actions = d.querySelector(".msg-actions");
  actions.style.cssText = "margin-top:12px;display:flex;flex-wrap:wrap;gap:8px";

  const run = document.createElement("button");
  run.className = "chip";
  run.textContent = "Run the fit check →";
  const anyway = document.createElement("button");
  anyway.className = "chip";
  anyway.textContent = "No, ask it as a question";

  const spend = () => { run.disabled = true; anyway.disabled = true; };
  run.onclick = () => {
    if(busy) return;   // a turn is already streaming — leave the offer standing
    spend();
    const jd = $("#fit-jd");
    if(jd) jd.value = jdText;   // keep the Fit tab in sync with what was assessed
    submitFit(jdText);
  };
  anyway.onclick = () => { if(busy) return; spend(); ask(jdText, {skipFitOffer:true}); };
  actions.append(run, anyway);
  d.scrollIntoView({behavior:"smooth", block:"nearest"});
  return d;
}

/* ---- the ask loop ---- */
const history = [];
let busy = false;

async function ask(text, opts){
  const q = String(text).trim();
  if(!q || busy) return;
  visitorDismissed = true;

  // A pasted JD gets the fit check offered, not the ask loop run on it.
  if(!(opts && opts.skipFitOffer) && CONFIG.generatorUrl && looksLikeJobDescription(q)){
    appendUserMsg(q);
    $("#q").value = "";
    offerFitCheck(q);
    return;
  }

  busy = true;
  // First question also triggers the dense upgrade, without waiting on it: this
  // answer is served lexically, the next one is likely to be hybrid.
  ensureEmbedder().catch(() => {});
  appendUserMsg(q);
  $("#q").value = "";

  // short follow-up augmentation
  let retrievalQ = q;
  if(history.length > 0 && toks(q).length <= 5){
    const prev = [...history].reverse().find(m => m.role === "user");
    if(prev) retrievalQ = prev.content + " " + q;
  }

  const t0 = performance.now();
  const r = await retrieve(retrievalQ);
  const msRetrieve = performance.now() - t0 - r.msEmbed;

  // build trace object (partial — fill in more after generation)
  const trace = {
    query: q, terms: r.terms,
    rows: r.hits.slice(0, 8).map((h, i) => ({
      p: h.p, rrf: h.rrf, bm25: h.bm25, cos: h.cos,
      hit: toks(q).filter(t => h.p.text.toLowerCase().includes(t))
    })),
    k: r.hits.length, conf: r.conf, cov: r.cov,
    msEmbed: r.msEmbed, msRetrieve, msGen: null,
    answered: r.inScope, usage: null, ground: null
  };

  // Which arm admitted this question. Both meta lines below read from here so they cannot
  // drift apart, and so a visitor can see that coverage alone can let a question through
  // even when the cosine is unremarkable.
  const admitBy = state.mode === "hybrid"
    ? (r.conf >= CONFIG.scopeThreshold
        ? "cos " + r.conf.toFixed(3) + " ≥ " + CONFIG.scopeThreshold.toFixed(2)
        : "coverage " + r.cov.toFixed(3) + " ≥ " + CONFIG.covThreshold.toFixed(2))
    : "coverage " + r.cov.toFixed(3) + " ≥ " + CONFIG.lexThreshold.toFixed(2);

  if(!r.inScope){
    // Both arms are named in the refusal meta: a visitor who is told "below the gate"
    // should be able to see which signal was low, and they are low for different reasons.
    const meta = (state.mode === "hybrid"
        ? "cos " + r.conf.toFixed(3) + " < " + CONFIG.scopeThreshold.toFixed(2) +
          " and coverage " + r.cov.toFixed(3) + " < " + CONFIG.covThreshold.toFixed(2)
        : "coverage " + r.cov.toFixed(3) + " < " + CONFIG.lexThreshold.toFixed(2))
      + " · refused before the model call · $0.00000";
    appendRefusal(meta);
    updateTracePanel(trace);
    if(CONFIG.generatorUrl){
      fetch(CONFIG.generatorUrl + "/log", {
        method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({question:q, outcome:"refused", session_id:state.sessionId,
          ...(visitor && {visitor_name:visitor.name, visitor_co:visitor.company})})
      }).catch(()=>{});
    }
    renderSuggest(null, "Things I can answer");
    busy = false; return;
  }

  const passCount = state.passages.length;
  const meta = admitBy + " · " + r.hits.length + " passages";
  const msgEl = appendBotMsg("Answer", meta + " · retrieving…");

  if(CONFIG.generatorUrl && state.gens < CONFIG.maxGenPerSession){
    setStreamingCaret(msgEl, true);
    const g0 = performance.now();
    let acc = "";
    try{
      const out = await generate(q, r.hits, tok => {
        acc += tok;
        renderAnswerIntoMsg(msgEl, acc, r.hits);
        setStreamingCaret(msgEl, true);
        msgEl.scrollIntoView({behavior:"smooth", block:"nearest"});
      }, history);
      trace.msGen = performance.now() - g0;
      trace.usage = out.usage;
      trace.ground = checkGrounding(out.text, r.hits);
      setStreamingCaret(msgEl, false);
      renderAnswerIntoMsg(msgEl, out.text, r.hits);

      if(!trace.ground.ok){
        const flag = document.createElement("p");
        flag.style.cssText = "color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px;margin-top:8px";
        flag.textContent = "Groundedness flag: this answer did not cite its sources cleanly. Treat it with suspicion and check the passages below.";
        msgEl.querySelector(".msg-body").appendChild(flag);
      }

      renderCitesInMsg(msgEl, r.hits, passCount);
      addTraceLink(msgEl);

      // update meta line
      const metaEl = msgEl.querySelector(".mono");
      if(metaEl){
        const cost = out.usage ? ((out.usage.input_tokens/1e6)*CONFIG.price.in + (out.usage.output_tokens/1e6)*CONFIG.price.out) : 0;
        metaEl.textContent = admitBy + " · " + r.hits.length + " passages · $" + cost.toFixed(5);
      }

      state.gens++;
      if(out.usage){
        state.tokIn += out.usage.input_tokens; state.tokOut += out.usage.output_tokens;
        state.costUSD += (out.usage.input_tokens/1e6)*CONFIG.price.in + (out.usage.output_tokens/1e6)*CONFIG.price.out;
      }
      history.push({role:"user",content:q},{role:"assistant",content:out.text});
      if(history.length > 6) history.splice(0,2);

    } catch(err){
      setStreamingCaret(msgEl, false);
      const body = msgEl.querySelector(".msg-body");
      body.innerHTML = `<p style="color:var(--color-bad);font-size:.85rem;border-left:3px solid var(--color-bad);padding-left:9px">The generator failed (${esc(err.message)}). Falling back is safer than faking it — ask again and you will get the retrieved source passage instead.</p>`;
      if(CONFIG.generatorUrl){
        fetch(CONFIG.generatorUrl + "/log", {method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({question:q, outcome:"error", session_id:state.sessionId,
            ...(visitor && {visitor_name:visitor.name, visitor_co:visitor.company})})
        }).catch(()=>{});
      }
      CONFIG.generatorUrl = "";
    }
  } else {
    // retrieval-only mode
    setStreamingCaret(msgEl, false);
    const docIdx = IDS.indexOf(r.hits[0].p.docId);
    const body = msgEl.querySelector(".msg-body");
    body.innerHTML = BANK[docIdx].a + `<p style="color:var(--color-dim);font-size:.79rem;border-top:1px dashed var(--color-divider);padding-top:8px;margin-top:8px">Retrieval-only mode: that is the source passage verbatim, not generated prose. ${CONFIG.generatorUrl ? "The session cost cap was reached." : "No generator endpoint is configured."}</p>`;
    renderCitesInMsg(msgEl, r.hits, passCount);
    addTraceLink(msgEl);
  }

  updateTracePanel(trace);
  updateSessionSidebar();

  const rel = r.hits.map(h => h.p.title).filter((v,i,a) => a.indexOf(v) === i).slice(1,4);
  renderSuggest(rel.length ? rel : null, rel.length ? "Related" : "Suggested questions");
  busy = false;
}

/* =====================================================================
   EVALUATION HARNESS
   ===================================================================== */
async function batchEmbed(list){
  const out = [];
  for(let i=0;i<list.length;i+=16) out.push(...await embed(list.slice(i,i+16)));
  return out;
}

async function runEval(){
  const btn = $("#runeval");
  if(btn) btn.textContent = "Running…";

  // The suite is the one place worth blocking on the model: the visitor asked for
  // the hybrid numbers, and reporting lexical ones under the same headings would be
  // the same class of mistake as the hit@5 card. Falls through if it cannot load.
  if(state.mode !== "hybrid" && state.vecs.length){
    if(btn) btn.textContent = "Loading model…";
    await ensureEmbedder().catch(() => {});
    if(btn) btn.textContent = "Running…";
  }

  const lexMode = state.mode !== "hybrid";
  const k = CONFIG.topK;
  $("#eval-topk").textContent = k;

  if(!lexMode){
    const gq = GOLDEN.map(g => g[0]), oq = OOS.map(o => o[0]), pq = PARAPHRASE.map(p => p[0]);
    const gv = await batchEmbed(gq), ov = await batchEmbed(oq), pv = await batchEmbed(pq);
    gq.forEach((q,i) => state.qcache.set(q, gv[i]));
    oq.forEach((q,i) => state.qcache.set(q, ov[i]));
    pq.forEach((q,i) => state.qcache.set(q, pv[i]));
  }

  // retrieval suite
  let r1=0, r5=0, mrr=0;
  const confIn = [], evalRows = [];
  for(const [q, want] of GOLDEN){
    const r = await retrieve(q, k);
    const docs = []; r.hits.forEach(h => { if(!docs.includes(h.p.docId)) docs.push(h.p.docId); });
    const rank = docs.indexOf(want);
    const pass = rank > -1 && rank < k;      // the table's PASS rule — hit@k
    confIn.push([r.conf, r.cov, rank === 0]);
    if(rank === 0) r1++;
    if(pass) { r5++; mrr += 1/(rank+1); }
    evalRows.push({q, want, got: docs[0]||"—", rank, rr: rank > -1 ? 1/(rank+1) : 0, pass});
  }
  const n = GOLDEN.length;

  // held-out paraphrase suite — same docs, phrasings the corpus never uses. Its queries
  // join the gate-sweep population too: tuning the gate on GOLDEN alone is what produced
  // a gate that refused golden queries with total term coverage.
  let p1 = 0, p5 = 0;
  for(const [q, want] of PARAPHRASE){
    const r = await retrieve(q, k);
    const docs = []; r.hits.forEach(h => { if(!docs.includes(h.p.docId)) docs.push(h.p.docId); });
    const rank = docs.indexOf(want);
    confIn.push([r.conf, r.cov, rank === 0]);
    if(rank === 0) p1++;
    if(rank > -1 && rank < k) p5++;
  }

  // refusal suite
  let refused=0;
  const confOut = [], oosRows = [];
  for(const [q, kind] of OOS){
    const r = await retrieve(q, 3);
    confOut.push([r.conf, r.cov]);
    const pass = !r.inScope;
    if(pass) refused++;
    oosRows.push({q, kind, conf: r.conf, pass});
  }

  // render retrieval table
  const eTbody = $("#eval-tbody");
  eTbody.innerHTML = evalRows.map((row, i) => `<tr>
    <td class="mono" style="color:var(--color-dim)">${String(i+1).padStart(2,"0")}</td>
    <td style="font-size:13.5px">${esc(row.q)}</td>
    <td class="mono" style="font-size:11.5px">${esc(row.want)}</td>
    <td class="mono" style="font-size:11.5px;color:var(--color-dim)">${esc(row.got)}</td>
    <td class="mono" style="font-size:12px">${row.rank > -1 ? row.rank+1 : ">" + k}</td>
    <td class="mono" style="font-size:12px">${row.rr.toFixed(2)}</td>
    <td><span class="tag ${row.pass ? "tag-ok" : "tag-outline"}">${row.pass ? "pass" : "fail"}</span></td>
  </tr>`).join("");

  // render refusal table
  const oosTbody = $("#oos-tbody");
  oosTbody.innerHTML = oosRows.map((row, i) => `<tr>
    <td class="mono" style="color:var(--color-dim)">${String(i+1).padStart(2,"0")}</td>
    <td style="font-size:13.5px">${esc(row.q)}</td>
    <td style="font-size:12.5px;color:var(--color-dim)">${esc(row.kind)}</td>
    <td class="mono" style="font-size:12px">${row.conf.toFixed(3)}</td>
    <td><span class="tag ${row.pass ? "tag-ok" : "tag-bad"}">${row.pass ? "refused" : "answered"}</span></td>
  </tr>`).join("");

  // update stat cards
  // Two distinct metrics, two distinct cards. hit@5 is the suite's own pass rule
  // (expected doc anywhere in top-K); hit@1 is the stricter rank-1 count. Reporting
  // r1 on a card labelled hit@5 understated the system by the whole rank-2..5 tail.
  $("#ec-r5-val").textContent = n ? Math.round(r5/n*100) + "%" : "—";
  $("#ec-r5-note").textContent = n ? r5 + " of " + n + " golden queries in top-" + k : "not run yet";
  $("#ec-r1-val").textContent = n ? Math.round(r1/n*100) + "%" : "—";
  $("#ec-r1-note").textContent = n ? r1 + " of " + n + " golden queries at rank 1" : "not run yet";
  $("#ec-mrr-val").textContent = n ? (mrr/n).toFixed(2) : "—";
  const np = PARAPHRASE.length;
  $("#ec-para-val").textContent = np ? Math.round(p5/np*100) + "%" : "—";
  $("#ec-para-note").textContent = np ? p5 + " of " + np + " held-out phrasings, " + p1 + " at rank 1" : "held-out phrasings";
  $("#ec-ref-val").textContent = OOS.length ? Math.round(refused/OOS.length*100) + "%" : "—";
  $("#ec-ref-note").textContent = OOS.length ? refused + " of " + OOS.length + " probes refused" : "out-of-scope probes";

  // sweep — the swept axis is the dense arm; the lexical arm is held at its configured
  // value, because that is the gate that actually runs. In lexical mode there is only
  // one arm and the sweep is that arm.
  //   confIn  rows are [cos, cov, wasRank1]
  //   confOut rows are [cos, cov]
  const covArm = lexMode ? null : CONFIG.covThreshold;
  const nIn = confIn.length;                 // GOLDEN + PARAPHRASE, the population the gate must admit
  const passes = (c, t) => lexMode ? c[1] >= t : (c[0] >= t || c[1] >= covArm);
  const lo = lexMode ? 0.20 : 0.20, hi = lexMode ? 0.70 : 0.60;
  const sweepRows = [];
  for(let t=lo; t<=hi+1e-5; t+=0.02){
    const answered = confIn.filter(c => passes(c, t));
    const correct = answered.filter(c => c[2]).length;
    const ref = confOut.filter(c => !passes(c, t)).length;
    sweepRows.push({t, correct, ref, joint:(correct/nIn + ref/OOS.length)/2});
  }
  const bestJ = Math.max(...sweepRows.map(s => s.joint));

  // What the second arm is worth, stated in the same units as the table: hold the
  // refusal rate the live gate achieves, then ask how many in-scope questions a
  // cosine-only gate could answer at that same rate. This is the whole argument for
  // the two-signal rule, so it is measured on the page rather than asserted in a doc.
  const liveAns = confIn.filter(c => passes(c, lexMode ? CONFIG.lexThreshold : CONFIG.scopeThreshold)).length;
  const liveRef = confOut.filter(c => !passes(c, lexMode ? CONFIG.lexThreshold : CONFIG.scopeThreshold)).length;
  let cosOnlyAns = null;
  if(!lexMode){
    for(let t=0.20; t<=0.80; t+=0.005){
      const ref = confOut.filter(c => c[0] < t).length;
      if(ref >= liveRef){ cosOnlyAns = confIn.filter(c => c[0] >= t).length; break; }
    }
  }
  const note = $("#sweep-note");
  if(note){
    note.textContent = lexMode
      ? `Lexical mode: coverage is the only signal, so the sweep is that signal. Live gate ${CONFIG.lexThreshold.toFixed(2)} answers ${liveAns}/${nIn} and refuses ${liveRef}/${OOS.length}.`
      : `Live gate — cosine ≥ ${CONFIG.scopeThreshold.toFixed(2)} or coverage ≥ ${CONFIG.covThreshold.toFixed(2)} — answers ${liveAns}/${nIn} in-scope (golden + paraphrase), refuses ${liveRef}/${OOS.length}.` +
        (cosOnlyAns !== null ? ` A cosine-only gate holding that same refusal rate answers ${cosOnlyAns}/${nIn}.` : "");
  }
  $("#sweep-tbody").innerHTML = sweepRows.map(s => `<tr>
    <td class="mono" style="${s.joint===bestJ ? "color:var(--color-accent);font-weight:600" : "color:var(--color-dim)"}">${s.t.toFixed(2)}</td>
    <td class="mono">${s.correct}/${nIn}</td>
    <td class="mono">${s.ref}/${OOS.length}</td>
    <td class="mono" style="${s.joint===bestJ ? "color:var(--color-accent);font-weight:600" : ""}">${(s.joint*100).toFixed(0)}%</td>
  </tr>`).join("");

  if(btn) btn.textContent = "Run the suite again";
}

/* =====================================================================
   GENERATION QUALITY EVAL
   ===================================================================== */
function updateGenCostEst(){
  const el = $("#genestcost");
  if(!el) return;
  const modelB = $("#modelB");
  const models = modelB && modelB.value.trim() ? 2 : 1;
  const turns = GEN_SUITE.flatMap(s => s.turns).filter(t => !t.expect_refuse).length;
  el.textContent = `est. $${(turns * models * 0.003).toFixed(3)} (${turns * models} model calls)`;
}

async function runGenEval(){
  const genout = $("#genout");
  if(!CONFIG.generatorUrl){
    genout.innerHTML = '<p style="color:var(--color-bad)">No generator URL configured — generation quality eval requires the live worker.</p>';
    return;
  }
  const modelA = ($("#modelA").value || "").trim();
  const modelB = ($("#modelB").value || "").trim();
  const models = [modelA, modelB || null].filter(Boolean);
  genout.innerHTML = '<p style="color:var(--color-dim);font-style:italic">running generation quality suite…</p>';

  const results = {};
  for(const model of models){
    results[model] = [];
    for(const scenario of GEN_SUITE){
      const hist = [];
      for(const turn of scenario.turns){
        let retrievalQ = turn.q;
        if(hist.length > 0 && toks(turn.q).length <= 5){
          const prev = [...hist].reverse().find(m => m.role === "user");
          if(prev) retrievalQ = prev.content + " " + turn.q;
        }
        const r = await retrieve(retrievalQ);
        if(turn.expect_refuse){
          results[model].push({scenario:scenario.label, turn:turn.q,
            expect_refuse:true, refused_ok:!r.inScope, conf:r.conf});
          break;
        }
        if(!turn.expect_doc){
          let txt = "";
          try{ const o = await generate(turn.q, r.hits, t=>{txt+=t;}, hist, model||undefined); txt=o.text; }
          catch(e){ break; }
          hist.push({role:"user",content:turn.q},{role:"assistant",content:txt});
          if(hist.length > 6) hist.splice(0,2);
          continue;
        }
        if(!r.inScope){
          results[model].push({scenario:scenario.label, turn:turn.q,
            expect_doc:turn.expect_doc, gate_miss:true, conf:r.conf});
          break;
        }
        let genText = "", genErr = null;
        try{
          const o = await generate(turn.q, r.hits, tok=>{genText+=tok;}, hist, model||undefined);
          genText = o.text;
          if(o.usage){ state.tokIn+=o.usage.input_tokens; state.tokOut+=o.usage.output_tokens;
            state.costUSD+=(o.usage.input_tokens/1e6)*CONFIG.price.in+(o.usage.output_tokens/1e6)*CONFIG.price.out; }
        } catch(e){ genErr=e.message; }
        state.gens++;
        hist.push({role:"user",content:turn.q},{role:"assistant",content:genText});
        if(hist.length > 6) hist.splice(0,2);
        if(genErr){ results[model].push({scenario:scenario.label, turn:turn.q, expect_doc:turn.expect_doc, error:genErr}); break; }
        const ground = checkGrounding(genText, r.hits);
        let alignment = null;
        if(state.mode === "hybrid" && state.embedder){
          const pidx = state.passages.findIndex(p => p.docId === turn.expect_doc);
          if(pidx >= 0){
            try{
              const av = (await embed([genText.slice(0,500)]))[0];
              if(av && av.length) alignment = dot(av, state.vecs[pidx]);
            } catch(_){}
          }
        }
        results[model].push({scenario:scenario.label, turn:turn.q,
          expect_doc:turn.expect_doc, citation_ok:ground.ok,
          coverage:ground.coverage, alignment});
      }
    }
  }
  refreshCost();
  renderGenResults(results, models, genout);
}

function renderGenResults(results, models, genout){
  let html = "";
  for(const model of models){
    const scored = results[model].filter(r => r.expect_doc && !r.error && !r.gate_miss);
    const citOk = scored.filter(r => r.citation_ok).length;
    const avgCov = scored.length ? scored.reduce((a,r)=>a+r.coverage,0)/scored.length : 0;
    const aligned = scored.filter(r => r.alignment !== null && r.alignment !== undefined);
    const avgAlign = aligned.length ? aligned.reduce((a,r)=>a+r.alignment,0)/aligned.length : null;
    const refRows = results[model].filter(r => r.expect_refuse);
    const refOk = refRows.filter(r => r.refused_ok).length;
    html += `<p style="margin:14px 0 8px;font-size:12px;color:var(--color-dim)">Model: <span style="color:var(--color-text);font-weight:600">${esc(model)}</span></p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px">
      <div class="blueprint" style="padding:10px 12px"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="mono" style="font-size:22px">${citOk}/${scored.length}</div><div style="font-size:11px;color:var(--color-dim)">citation OK</div></div>
      <div class="blueprint" style="padding:10px 12px"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="mono" style="font-size:22px">${(avgCov*100).toFixed(0)}%</div><div style="font-size:11px;color:var(--color-dim)">avg coverage</div></div>
      ${avgAlign !== null ? `<div class="blueprint" style="padding:10px 12px"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="mono" style="font-size:22px">${avgAlign.toFixed(2)}</div><div style="font-size:11px;color:var(--color-dim)">topic alignment</div></div>` : ""}
      ${refRows.length ? `<div class="blueprint" style="padding:10px 12px"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="mono" style="font-size:22px">${refOk}/${refRows.length}</div><div style="font-size:11px;color:var(--color-dim)">injection refused</div></div>` : ""}
    </div>`;
  }

  const colHeader = models.length === 1
    ? `<th>citation</th><th>coverage</th><th>topic align</th>`
    : `<th>A cite</th><th>A cov</th><th>A align</th><th>B cite</th><th>B cov</th><th>B align</th>`;
  html += `<div style="margin-top:4px;margin-bottom:8px;font-size:12px;font-weight:600;color:var(--color-dim);letter-spacing:.08em;text-transform:uppercase">Per-scenario</div>
  <table class="table"><thead><tr><th>scenario</th><th>turn</th>${colHeader}</tr></thead><tbody>`;

  const allRows = results[models[0]];
  for(const rowA of allRows){
    const rowB = models[1] ? (results[models[1]]||[]).find(r=>r.scenario===rowA.scenario&&r.turn===rowA.turn) : null;
    const cell = (row, field, fmt) => {
      if(!row) return "<td>—</td>";
      if(row.error) return `<td style="color:var(--color-bad)" title="${esc(row.error)}">err</td>`;
      if(row.gate_miss) return `<td style="color:var(--color-warn)" colspan="${models.length===1?3:1}">gate</td>`;
      const v = row[field];
      if(v === null || v === undefined) return "<td>n/a</td>";
      return `<td>${fmt(v)}</td>`;
    };
    if(rowA.expect_refuse){
      const msg = r => r ? (r.refused_ok ? "✓ refused" : `✗ leaked (${r.conf?r.conf.toFixed(3):"?"})`) : "—";
      html += `<tr><td>${esc(rowA.scenario)}</td><td>${esc(rowA.turn)}</td>
        <td colspan="${models.length===1?3:6}" style="color:${rowA.refused_ok?"var(--color-ok)":"var(--color-bad)"}">${msg(rowA)}${rowB?" / "+msg(rowB):""}</td></tr>`;
    } else if(rowA.gate_miss){
      const cA = rowA.conf!==undefined?rowA.conf.toFixed(3):"?";
      const cB = rowB&&rowB.conf!==undefined?rowB.conf.toFixed(3):null;
      html += `<tr><td>${esc(rowA.scenario)}</td><td>${esc(rowA.turn)}</td>
        <td colspan="${models.length===1?3:6}" style="color:var(--color-warn)">below scope gate (conf ${cB?`A: ${cA} / B: ${cB}`:cA})</td></tr>`;
    } else {
      html += `<tr>
        <td>${esc(rowA.scenario)}</td><td>${esc(rowA.turn)}</td>
        ${cell(rowA,"citation_ok",v=>v?"✓":"✗")}
        ${cell(rowA,"coverage",v=>(v*100).toFixed(0)+"%")}
        ${cell(rowA,"alignment",v=>v.toFixed(2))}
        ${rowB?cell(rowB,"citation_ok",v=>v?"✓":"✗")+cell(rowB,"coverage",v=>(v*100).toFixed(0)+"%")+cell(rowB,"alignment",v=>v.toFixed(2)):""}
      </tr>`;
    }
  }
  html += `</tbody></table>
  <p style="margin-top:12px;font-size:12px;color:var(--color-dim)">Topic alignment is the cosine similarity between the embedded answer and the first passage of the expected document (0–1). Citation OK requires at least one valid [n] reference with no out-of-range indices.</p>`;
  genout.innerHTML = html;
}

function refreshCost(){
  const el = $("#costline");
  if(el) el.textContent = `${state.gens} generated answers · ${state.tokIn} in / ${state.tokOut} out tokens · $${state.costUSD.toFixed(4)} this session`;
}

/* ---- tabs & boot ---- */
$("#tab-chat").onclick     = () => showTab("chat");
$("#tab-fit").onclick      = () => showTab("fit");
$("#tab-cv").onclick       = () => showTab("cv");
$("#tab-advanced").onclick = () => showTab("advanced");

const heroChatBtn = $("#hero-chat");
if(heroChatBtn) heroChatBtn.onclick = () => showTab("chat");
const heroFitBtn = $("#hero-fit");
if(heroFitBtn) heroFitBtn.onclick = () => showTab("fit");

const fitBtn = $("#fit-btn");
if(fitBtn) fitBtn.onclick = () => submitFit($("#fit-jd").value);
const fitJd = $("#fit-jd");
if(fitJd) fitJd.onkeydown = e => { if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); submitFit(fitJd.value); } };
$("#runeval").onclick     = () => runEval();
$("#rungeneval").onclick  = () => runGenEval();
["modelA","modelB"].forEach(id => { const el = $("#"+id); if(el) el.oninput = updateGenCostEst; });

const submitBtn = $("#submit-btn");
if(submitBtn) submitBtn.onclick = () => ask($("#q").value);
const qInput = $("#q");
if(qInput) qInput.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); ask(qInput.value); } };

/* ---- lazy dense upgrade ----
   Everything below runs after the page is already answering questions. The model
   is ~25 MB and is now needed for exactly one thing — embedding the query — so it
   is never on the critical path. */
let upgradePromise = null;

function ensureEmbedder(){
  if(upgradePromise) return upgradePromise;
  if(!state.vecs.length) return Promise.reject(new Error("no passage vectors"));
  upgradePromise = (async () => {
    const t0 = performance.now();
    try{
      // Quietly: the headline stays "ready" the whole time, because it is. The
      // upgrade progress goes in the detail slot, where it reads as extra rather
      // than as the page still starting up.
      state.embedder = await loadEmbedder(txt => setStatusDetails(txt.replace(/…$/, ""), state.passages.length + " passages · vectors precomputed"));
      state.mode = "hybrid";
      bootPerf.upgrade = performance.now() - t0;
      setStatus("hybrid retrieval ready · generation " + (CONFIG.generatorUrl ? "on" : "off"), "ok");
      setStatusDetails(
        state.backend ? state.backend.split(" · ").slice(1).join(" · ") : "",
        state.passages.length + " passages · dense index precomputed"
      );
      updateBootPanel();
      return state.embedder;
    } catch(e){
      // Every backend fell over: no WebGPU, blocked CDN, old browser. Lexical for
      // the rest of the session — it is a working mode, not an error state.
      state.mode = "lexical";
      bootPerf.upgradeFailed = e && e.message;
      setStatus("lexical retrieval · dense unavailable (" + (e && e.message ? e.message : "no backend") + ")", "warn");
      updateBootPanel();
      throw e;
    }
  })();
  return upgradePromise;
}

function scheduleUpgrade(){
  const go = () => { ensureEmbedder().catch(() => {}); };
  if(typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1200);
}

function dismissOverlay(){
  const ov = $("#boot-overlay");
  if(!ov) return;
  ov.classList.add("fade-out");
  setTimeout(() => { if(ov.parentNode) ov.parentNode.removeChild(ov); }, 550);
}

async function boot(){
  $("#pname").innerHTML = PROFILE.name;
  $("#ptag").innerHTML = PROFILE.tagline;
  const fm = $("#fmail"); if(fm){ fm.href = "mailto:" + PROFILE.email; fm.textContent = PROFILE.email; }

  const qEl = $("#q"), sbEl = $("#submit-btn");
  showTab(null);

  const t0 = performance.now();
  state.passages = buildPassages();
  state.bm25 = buildBM25(state.passages);

  // Passage vectors ship with the page — decode, do not compute. If this throws the
  // bundle is broken (build.sh will not ship a mismatch), and the honest answer is
  // to run lexical for the whole session rather than to embed 180 passages on the
  // visitor's machine to paper over it.
  try{
    markStart("decode");
    state.vecs = decodeVectors(state.passages);
    markEnd("decode");
  } catch(e){
    state.vecs = [];
    console.error("precomputed vectors unusable —", e.message);
  }

  // the greeting lives in the hero now — the thread opens straight on the suggestions
  renderSuggest(null);
  mountVisitorCard();

  // Open in lexical mode. BM25 is not a holding pattern: it has its own calibrated
  // gate (CONFIG.lexThreshold) and answers most of the golden set on its own, so the
  // agent is genuinely usable here, not merely visible.
  state.mode = "lexical";
  state.ready = true;
  bootPerf.total = Math.round(performance.now() - t0);
  if(qEl){ qEl.disabled = false; qEl.placeholder = "Ask about his work, his stack, work authorization, what he wants next…"; }
  if(sbEl) sbEl.disabled = false;
  dismissOverlay();
  setStatus("lexical retrieval ready · generation " + (CONFIG.generatorUrl ? "on" : "off"), "ok");
  setStatusDetails("BM25", state.passages.length + " passages · vectors decoded in " + fmtMs(bootPerf.stages.decode));
  updateBootPanel();
  updateSessionSidebar();
  updateGenCostEst();

  // Then upgrade to hybrid in the background. The model is still needed to embed the
  // query — that is the only thing it is for now — so it loads on the first idle
  // callback or the first question, whichever comes first, and never blocks input.
  if(state.vecs.length) scheduleUpgrade();
}

window.askElroy = { state, CONFIG, BANK, IDS, GOLDEN, PARAPHRASE, OOS, CONV_GOLDEN, GEN_SUITE, retrieve, runEval, ask, generateFit, generateScore, looksLikeJobDescription, bootPerf,
  get busy(){ return busy; } };
boot();
