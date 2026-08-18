
/* =====================================================================
   UI layer: chat, trace inspector, evaluation harness
   ===================================================================== */
const $ = s => document.querySelector(s);
const logEl = $("#log"), sugEl = $("#suggest"), statusEl = $("#status");

function bubble(html, mine){
  const d = document.createElement("div");
  d.className = "msg" + (mine ? " me" : "");
  d.innerHTML = '<div class="bubble">' + html + "</div>";
  logEl.appendChild(d);
  d.scrollIntoView({ behavior:"smooth", block:"nearest" });
  return d.querySelector(".bubble");
}
function setStatus(t, cls){ statusEl.innerHTML = t; statusEl.className = "status " + (cls||""); }

/* ---- suggestion chips ---- */
let activeCat = CATS[0];
function renderSuggest(list, heading){
  sugEl.innerHTML = "";
  const h = document.createElement("p");
  h.className = "qhead"; h.innerHTML = heading || "Suggested questions";
  sugEl.appendChild(h);
  if(!list){
    const cats = document.createElement("div"); cats.className = "chips";
    CATS.forEach(c => {
      const b = document.createElement("button");
      b.className = "chip cat"; b.type = "button"; b.innerHTML = c;
      b.setAttribute("aria-pressed", c === activeCat);
      b.onclick = () => { activeCat = c; renderSuggest(null, heading); };
      cats.appendChild(b);
    });
    sugEl.appendChild(cats);
    list = BANK.filter(e => e.cat === activeCat).map(e => e.q);
  }
  const w = document.createElement("div"); w.className = "chips";
  list.forEach(q => {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.textContent = q;
    b.onclick = () => ask(q);
    w.appendChild(b);
  });
  sugEl.appendChild(w);
}

/* ---- trace inspector ---- */
function traceHTML(o){
  const rows = o.hits.map((h,i) =>
    `<tr><td>[${i+1}]</td><td>${esc(h.p.pid)}</td>
     <td>${h.cos === null ? "—" : h.cos.toFixed(3)}</td>
     <td>${h.bm25.toFixed(2)}</td><td>${h.rrf.toFixed(4)}</td></tr>`).join("");
  const cost = o.usage
    ? ((o.usage.input_tokens/1e6)*CONFIG.price.in + (o.usage.output_tokens/1e6)*CONFIG.price.out) : 0;
  return `<details class="trace"><summary>trace &middot; ${o.decision} &middot; ${Math.round(o.msTotal)} ms${
      o.usage ? " &middot; $" + cost.toFixed(5) : ""}</summary>
    <div class="tracebody">
      <div class="kv"><span>mode</span><b>${state.mode}${state.backend ? " · " + state.backend : ""}</b></div>
      <div class="kv"><span>embed query</span><b>${o.msEmbed ? Math.round(o.msEmbed)+" ms" : "n/a"}</b></div>
      <div class="kv"><span>retrieve</span><b>${Math.round(o.msRetrieve)} ms</b></div>
      <div class="kv"><span>confidence (${state.mode === "hybrid" ? "max cosine" : "idf coverage"})</span><b>${o.conf.toFixed(3)} vs gate ${gate().toFixed(2)} (${state.mode})</b></div>
      <div class="kv"><span>decision</span><b>${o.decision}</b></div>
      ${o.msGen ? `<div class="kv"><span>generate</span><b>${Math.round(o.msGen)} ms</b></div>` : ""}
      ${o.usage ? `<div class="kv"><span>tokens</span><b>${o.usage.input_tokens} in / ${o.usage.output_tokens} out</b></div>
                   <div class="kv"><span>cost</span><b>$${cost.toFixed(5)}</b></div>` : ""}
      ${o.ground ? `<div class="kv"><span>groundedness</span><b>${o.ground.ok ? "citations valid" : "FLAG"} &middot; ${Math.round(o.ground.coverage*100)}% of claims cited</b></div>` : ""}
      <table class="tt"><tr><th>#</th><th>passage</th><th>cos</th><th>bm25</th><th>rrf</th></tr>${rows}</table>
    </div></details>`;
}
function sourcesHTML(hits){
  return `<details class="src"><summary>${hits.length} retrieved passages</summary>` +
    hits.map((h,i) => `<p class="srcp"><b>[${i+1}]</b> <i>${esc(h.p.title)}</i><br>${esc(h.p.text)}</p>`).join("") +
    "</details>";
}
function renderAnswer(text, hits){
  const html = esc(text)
    .replace(/\[(\d+)\]/g, (m,n) => `<sup class="cite" title="${esc((hits[n-1]||{p:{text:""}}).p.text.slice(0,180))}">[${n}]</sup>`)
    .split(/\n{2,}/).map(p => "<p>" + p.replace(/\n/g,"<br>") + "</p>").join("");
  return html;
}

/* ---- the ask loop ---- */
let busy = false;
async function ask(text){
  const q = String(text).trim();
  if(!q || busy) return;
  busy = true;
  bubble(esc(q), true);
  $("#q").value = "";
  const holder = bubble('<span class="think">retrieving…</span>', false);

  try{
    const r = await retrieve(q);
    const t = { hits:r.hits, conf:r.conf, msEmbed:r.msEmbed, msRetrieve:r.msTotal - r.msEmbed,
                msTotal:r.msTotal, decision:"answer" };

    if(r.conf < gate()){
      t.decision = "refused (below scope gate)";
      holder.innerHTML =
        `<p>That is outside what I hold about Elroy, so I will not guess at it — this agent only answers from a fixed corpus he wrote.</p>
         <p>Email him and he will answer it himself: <a href="mailto:${PROFILE.email}">${PROFILE.email}</a></p>` + traceHTML(t);
      renderSuggest(null, "Things I can answer");
      busy = false; return;
    }

    if(CONFIG.generatorUrl && state.gens < CONFIG.maxGenPerSession){
      holder.innerHTML = '<span class="think">generating…</span>';
      const g0 = performance.now();
      let acc = "";
      const out = await generate(q, r.hits, tok => {
        acc += tok;
        holder.innerHTML = renderAnswer(acc, r.hits);
      });
      t.msGen = performance.now() - g0;
      t.usage = out.usage;
      t.ground = checkGrounding(out.text, r.hits);
      t.msTotal = r.msTotal + t.msGen;
      state.gens++;
      if(out.usage){
        state.tokIn += out.usage.input_tokens; state.tokOut += out.usage.output_tokens;
        state.costUSD += (out.usage.input_tokens/1e6)*CONFIG.price.in
                       + (out.usage.output_tokens/1e6)*CONFIG.price.out;
        refreshCost();
      }
      holder.innerHTML = renderAnswer(out.text, r.hits)
        + (t.ground.ok ? "" : '<p class="flag">Groundedness flag: this answer did not cite its sources cleanly. Treat it with suspicion and check the passages below.</p>')
        + sourcesHTML(r.hits) + traceHTML(t);
    } else {
      // retrieval-only mode: return the curated source answer verbatim, no paraphrase
      const docIdx = IDS.indexOf(r.hits[0].p.docId);
      t.decision = CONFIG.generatorUrl ? "retrieval-only (session cost cap reached)" : "retrieval-only (no generator configured)";
      holder.innerHTML = BANK[docIdx].a
        + `<p class="modeflag">Retrieval-only mode: that is the source passage verbatim, not generated prose. ${
            CONFIG.generatorUrl ? "The session cost cap was reached." : "No generator endpoint is configured."}</p>`
        + sourcesHTML(r.hits) + traceHTML(t);
    }
    const rel = r.hits.map(h => h.p.title).filter((v,i,a) => a.indexOf(v) === i).slice(1,4);
    renderSuggest(rel.length ? rel : null, rel.length ? "Related" : "Suggested questions");
  } catch(err){
    holder.innerHTML = `<p class="flag">The generator failed (${esc(err.message)}). Falling back is safer than faking it — ask again and you will get the retrieved source passage instead.</p>`;
    CONFIG.generatorUrl = "";
  }
  busy = false;
}

function refreshCost(){
  const el = $("#costline");
  if(el) el.innerHTML = `${state.gens} generated answers &middot; ${state.tokIn} in / ${state.tokOut} out tokens &middot; <b>$${state.costUSD.toFixed(4)}</b> this session`;
}

/* ---- tabs ---- */
function showTab(name){
  ["chat","how","eval"].forEach(t => {
    $("#tab-"+t).setAttribute("aria-selected", t === name);
    $("#pane-"+t).hidden = t !== name;
  });
  document.querySelector(".tray").hidden = name !== "chat";
}

/* =====================================================================
   EVALUATION HARNESS — runs live, in this browser, on this index
   ===================================================================== */
async function batchEmbed(list){
  const out = [];
  for(let i=0;i<list.length;i+=16) out.push(...await embed(list.slice(i,i+16)));
  return out;
}
async function runEval(){
  const box = $("#evalout");
  const lexMode = state.mode !== "hybrid";
  box.innerHTML = '<p class="think">running suites…</p>';
  const t0 = performance.now();

  // pre-embed every eval query once, then reuse
  if(!lexMode){
    const gq = GOLDEN.map(g => g[0]), oq = OOS.map(o => o[0]);
    const gv = await batchEmbed(gq), ov = await batchEmbed(oq);
    gq.forEach((q,i) => state.qcache.set(q, gv[i]));
    oq.forEach((q,i) => state.qcache.set(q, ov[i]));
  }

  // --- retrieval suite ---
  let r1 = 0, r3 = 0, r5 = 0, mrr = 0;
  const fails = [], confIn = [];
  for(const [q, want] of GOLDEN){
    const r = await retrieve(q, 5);
    const docs = []; r.hits.forEach(h => { if(!docs.includes(h.p.docId)) docs.push(h.p.docId); });
    const rank = docs.indexOf(want);
    confIn.push([r.conf, rank === 0]);
    if(rank === 0) r1++;
    if(rank > -1 && rank < 3) r3++;
    if(rank > -1) r5++;
    if(rank > -1) mrr += 1/(rank+1); else fails.push([q, want, docs[0]]);
  }
  const n = GOLDEN.length;

  // --- refusal suite ---
  let refused = 0; const leaked = []; const confOut = [];
  for(const [q, kind] of OOS){
    const r = await retrieve(q, 3);
    confOut.push(r.conf);
    if(r.conf < gate()) refused++; else leaked.push([q, kind, r.conf.toFixed(3), r.hits[0].p.docId]);
  }

  // --- threshold sweep (calibration) ---
  const sweep = [];
  const lo = lexMode ? 0.14 : 0.20, hi = lexMode ? 0.44 : 0.50;
  for(let t = lo; t <= hi + 1e-5; t += 0.02){
    const answered = confIn.filter(c => c[0] >= t);
    const correct = answered.filter(c => c[1]).length;
    const ref = confOut.filter(c => c < t).length;
    sweep.push([t, correct/n, ref/OOS.length]);
  }
  const best = sweep.reduce((a,b) => (b[1]+b[2] > a[1]+a[2] ? b : a));

  const ms = Math.round(performance.now()-t0);
  box.innerHTML = `
  ${lexMode ? '<p class="flag">The embedding model did not load, so this ran against BM25 lexical retrieval alone — the degraded path. Dense numbers would be better and the gate separates worse here. Reported as measured, not as intended.</p>' : ""}
  <div class="cards">
    <div class="card"><b>${(r1/n*100).toFixed(1)}%</b><span>Recall@1 &middot; ${r1}/${n}</span></div>
    <div class="card"><b>${(r3/n*100).toFixed(1)}%</b><span>Recall@3</span></div>
    <div class="card"><b>${(mrr/n).toFixed(3)}</b><span>MRR</span></div>
    <div class="card"><b>${(refused/OOS.length*100).toFixed(0)}%</b><span>Refusal on out-of-scope &middot; ${refused}/${OOS.length}</span></div>
  </div>
  <p class="small">Suite: ${n} paraphrased recruiter questions written to <i>not</i> match the corpus wording, plus ${OOS.length} out-of-scope probes including four prompt-injection attempts. Ran in ${ms} ms in this browser, against this index. Retrieval is deterministic, so run-to-run variance here is zero by construction — the noise floor in this system lives in the generation layer, not the retrieval layer.</p>

  <h3>Failures — retrieval</h3>
  ${fails.length ? `<table class="tt"><tr><th>query</th><th>expected</th><th>got</th></tr>${
    fails.map(f => `<tr><td>${esc(f[0])}</td><td>${esc(f[1])}</td><td>${esc(f[2]||"—")}</td></tr>`).join("")}</table>`
    : '<p class="small">None: every golden query retrieved its target document inside the top 5.</p>'}

  <h3>Failures — scope gate</h3>
  ${leaked.length ? `<table class="tt"><tr><th>probe</th><th>type</th><th>confidence</th><th>would have used</th></tr>${
    leaked.map(l => `<tr><td>${esc(l[0])}</td><td>${esc(l[1])}</td><td>${l[2]}</td><td>${esc(l[3])}</td></tr>`).join("")}</table>`
    : '<p class="small">None: every out-of-scope probe scored below the gate and was refused without a model call, at zero cost.</p>'}

  <h3>Threshold calibration</h3>
  <p class="small">The gate is a trade-off, not a constant. Sweeping it shows what each setting costs. Current gate: <b>${gate().toFixed(2)}</b> (${state.mode} mode). Joint optimum on this suite: <b>${best[0].toFixed(2)}</b>.</p>
  <table class="tt"><tr><th>gate</th><th>answered correctly (in-scope)</th><th>refused (out-of-scope)</th></tr>
  ${sweep.map(s => `<tr${Math.abs(s[0]-gate())<0.01?' class="hl"':""}><td>${s[0].toFixed(2)}</td><td>${(s[1]*100).toFixed(1)}%</td><td>${(s[2]*100).toFixed(0)}%</td></tr>`).join("")}</table>

  <p class="small">Retune the gate and re-run: <input id="thr" type="number" step="0.02" min="0.05" max="0.9" value="${gate().toFixed(2)}" style="width:5.5em"> <button class="go" id="setthr">apply &amp; re-run</button></p>

  <h3>What this does not measure</h3>
  <ul class="small">
    <li>Answer quality. This suite scores <i>retrieval</i> and <i>refusal</i>. Whether the generated prose is faithful is checked per answer by the citation validator in the trace, not here.</li>
    <li>Corpus coverage. A question can be legitimately about Elroy and simply not be in the corpus; the gate refuses it, which is correct behaviour but reads as a miss to a visitor.</li>
    <li>The golden set is small (${n}) and written by the same person who wrote the corpus. That is a real bias, and the honest fix is external labels.</li>
  </ul>`;
  const st = document.getElementById("setthr");
  if(st) st.onclick = () => {
    const v = parseFloat(document.getElementById("thr").value);
    if(!isNaN(v)){ if(state.mode === "hybrid") CONFIG.scopeThreshold = v; else CONFIG.lexThreshold = v; runEval(); }
  };
}

/* =====================================================================
   BOOT
   ===================================================================== */
async function boot(){
  $("#pname").innerHTML = PROFILE.name;
  $("#ptag").innerHTML = PROFILE.tagline;
  const fm = $("#fmail"); fm.href = "mailto:" + PROFILE.email; fm.textContent = PROFILE.email;

  state.passages = buildPassages();
  state.bm25 = buildBM25(state.passages);
  $("#idxsize").textContent = state.passages.length;

  bubble(`<p>Hello. I am a retrieval-augmented agent that answers questions about Elroy Galbraith, built by him as a working sample rather than a description of one.</p>
          <p>Every answer is grounded in a fixed corpus he wrote, with the retrieved passages and the full trace — scores, latency, tokens, cost — attached to each response. Ask me something he has not written about and I will refuse rather than improvise.</p>`, false);
  renderSuggest(null);

  try{
    setStatus("loading embedding model…", "warn");
    const t0 = performance.now();
    state.embedder = await loadEmbedder(setStatus);
    setStatus("building vector index…", "warn");
    state.vecs = await batchEmbed(state.passages.map(p => p.dense));
    state.mode = "hybrid";
    const ms = Math.round(performance.now()-t0);
    setStatus(`hybrid retrieval ready &middot; ${state.backend} &middot; ${state.passages.length} passages embedded in ${ms} ms &middot; ${CONFIG.generatorUrl ? "generation on" : "retrieval-only"}`, "ok");
  } catch(e){
    state.mode = "lexical";
    setStatus("embedding model unavailable — degraded to BM25 lexical retrieval. The agent still works; the dense suite cannot run.", "warn");
  }
  state.ready = true;
  refreshCost();
}

/* Debug handle — also what the smoke test drives. Everything the app does is
   reachable from here, so you can retune and re-measure from the console:
     askElroy.CONFIG.scopeThreshold = 0.40
     await askElroy.retrieve("does he need a visa")                          */
window.askElroy = { state, CONFIG, BANK, IDS, GOLDEN, OOS, retrieve, runEval, ask };

$("#f").onsubmit = e => { e.preventDefault(); ask($("#q").value); };
$("#tab-chat").onclick = () => showTab("chat");
$("#tab-how").onclick  = () => showTab("how");
$("#tab-eval").onclick = () => showTab("eval");
$("#runeval").onclick  = () => runEval();
boot();
