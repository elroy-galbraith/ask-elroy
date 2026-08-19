
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
const history = [];   // [{role:"user"|"assistant", content:string}], last 3 exchanges
let busy = false;
async function ask(text){
  const q = String(text).trim();
  if(!q || busy) return;
  busy = true;
  bubble(esc(q), true);
  $("#q").value = "";
  const holder = bubble('<span class="think">retrieving…</span>', false);

  try{
    // Short follow-ups ("tell me more", "elaborate") have no retrieval signal on their own.
    // Prepend the previous user question so the scope gate and retrieval see enough context.
    let retrievalQ = q;
    if(history.length > 0 && q.split(/\s+/).length <= 5){
      const prev = [...history].reverse().find(m => m.role === "user");
      if(prev) retrievalQ = prev.content + " " + q;
    }
    const r = await retrieve(retrievalQ);
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
      }, history);
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
      history.push({role:"user", content: q}, {role:"assistant", content: out.text});
      if(history.length > 6) history.splice(0, 2);
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

/* =====================================================================
   GENERATION QUALITY EVAL
   ===================================================================== */
function updateGenCostEst(){
  const el = document.getElementById("genestcost");
  if(!el) return;
  const modelB = document.getElementById("modelB");
  const models = modelB && modelB.value.trim() ? 2 : 1;
  const turns = GEN_SUITE.flatMap(s => s.turns).filter(t => !t.expect_refuse).length;
  el.textContent = `est. $${(turns * models * 0.003).toFixed(3)} (${turns * models} model calls)`;
}

async function runGenEval(){
  const genout = document.getElementById("genout");
  if(!CONFIG.generatorUrl){
    genout.innerHTML = '<p class="flag">No generator URL configured — generation quality eval requires the live worker.</p>';
    return;
  }
  const modelA = (document.getElementById("modelA").value || "").trim();
  const modelB = (document.getElementById("modelB").value || "").trim();
  const models = [modelA, modelB || null].filter(Boolean);

  genout.innerHTML = '<p class="think">running generation quality suite…</p>';

  const results = {};
  for(const model of models){
    results[model] = [];
    for(const scenario of GEN_SUITE){
      const hist = [];
      for(const turn of scenario.turns){
        // mirror the augmentation the chat does for short follow-ups
        let retrievalQ = turn.q;
        if(hist.length > 0 && turn.q.split(/\s+/).length <= 5){
          const prev = [...hist].reverse().find(m => m.role === "user");
          if(prev) retrievalQ = prev.content + " " + turn.q;
        }
        const r = await retrieve(retrievalQ);

        // Refusal turns: the whole point is to check the gate fires.
        if(turn.expect_refuse){
          results[model].push({ scenario: scenario.label, turn: turn.q,
            expect_refuse: true, refused_ok: r.conf < gate(), conf: r.conf });
          break;
        }

        // Intermediate turns (no expect_doc) build history only — do NOT gate-check
        // them, because a near-threshold query would abort the whole scenario before
        // the scored follow-up gets a chance to run.
        if(!turn.expect_doc){
          let txt = "";
          try{ const o = await generate(turn.q, r.hits, t => { txt += t; }, hist, model || undefined);
               txt = o.text; } catch(e){ break; }
          hist.push({role:"user",content:turn.q},{role:"assistant",content:txt});
          if(hist.length > 6) hist.splice(0,2);
          continue;
        }

        // Scored turns: gate fires → record as unexpected miss, stop scenario.
        if(r.conf < gate()){
          results[model].push({ scenario: scenario.label, turn: turn.q,
            expect_doc: turn.expect_doc, gate_miss: true, conf: r.conf });
          break;
        }

        let genText = "", genErr = null;
        try{
          const o = await generate(turn.q, r.hits, tok => { genText += tok; }, hist, model || undefined);
          genText = o.text;
          if(o.usage){ state.tokIn += o.usage.input_tokens; state.tokOut += o.usage.output_tokens;
            state.costUSD += (o.usage.input_tokens/1e6)*CONFIG.price.in + (o.usage.output_tokens/1e6)*CONFIG.price.out; }
        } catch(e){ genErr = e.message; }
        state.gens++;
        hist.push({role:"user",content:turn.q},{role:"assistant",content:genText});
        if(hist.length > 6) hist.splice(0,2);

        if(genErr){ results[model].push({ scenario: scenario.label, turn: turn.q,
            expect_doc: turn.expect_doc, error: genErr }); break; }

        const ground = checkGrounding(genText, r.hits);
        let alignment = null;
        if(state.mode === "hybrid" && state.embedder){
          const pidx = state.passages.findIndex(p => p.docId === turn.expect_doc);
          if(pidx >= 0){
            try{
              const av = (await embed([genText.slice(0, 500)]))[0];
              if(av && av.length) alignment = dot(av, state.vecs[pidx]);
            } catch(_){ /* embedder unavailable for alignment scoring */ }
          }
        }
        results[model].push({ scenario: scenario.label, turn: turn.q,
          expect_doc: turn.expect_doc, citation_ok: ground.ok,
          coverage: ground.coverage, alignment });
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
    const citOk  = scored.filter(r => r.citation_ok).length;
    const avgCov = scored.length ? scored.reduce((a,r) => a + r.coverage, 0) / scored.length : 0;
    const aligned = scored.filter(r => r.alignment !== null && r.alignment !== undefined);
    const avgAlign = aligned.length ? aligned.reduce((a,r) => a + r.alignment, 0) / aligned.length : null;
    const refRows = results[model].filter(r => r.expect_refuse);
    const refOk   = refRows.filter(r => r.refused_ok).length;
    html += `<p class="small" style="margin:14px 0 4px;color:var(--dim)">Model: <b style="color:var(--ink)">${esc(model)}</b></p>
    <div class="cards">
      <div class="card"><b>${citOk}/${scored.length}</b><span>citation OK</span></div>
      <div class="card"><b>${(avgCov*100).toFixed(0)}%</b><span>avg citation coverage</span></div>
      ${avgAlign !== null ? `<div class="card"><b>${avgAlign.toFixed(2)}</b><span>avg topic alignment</span></div>` : ""}
      ${refRows.length ? `<div class="card"><b>${refOk}/${refRows.length}</b><span>injection refused</span></div>` : ""}
    </div>`;
  }

  const colHeader = models.length === 1
    ? `<th>citation</th><th>coverage</th><th>topic align</th>`
    : `<th>A cite</th><th>A cov</th><th>A align</th><th>B cite</th><th>B cov</th><th>B align</th>`;

  html += `<h3>Per-scenario</h3>
  <table class="tt"><tr><th>scenario</th><th>turn</th>${colHeader}</tr>`;

  const allRows = results[models[0]];
  for(const rowA of allRows){
    const rowB = models[1] ? (results[models[1]] || []).find(r => r.scenario === rowA.scenario && r.turn === rowA.turn) : null;
    const cell = (row, field, fmt) => {
      if(!row) return "<td>—</td>";
      if(row.error) return `<td style="color:var(--bad)" title="${esc(row.error)}">err</td>`;
      if(row.gate_miss) return `<td style="color:var(--warn)" colspan="${models.length===1?3:1}">gate</td>`;
      const v = row[field];
      if(v === null || v === undefined) return "<td>n/a</td>";
      return `<td>${fmt(v)}</td>`;
    };
    if(rowA.expect_refuse){
      const msg = r => r ? (r.refused_ok ? "✓ refused" : `✗ leaked (${r.conf ? r.conf.toFixed(3) : "?"})`) : "—";
      html += `<tr><td>${esc(rowA.scenario)}</td><td>${esc(rowA.turn)}</td>
        <td colspan="${models.length===1?3:6}" style="color:${rowA.refused_ok?"var(--ok)":"var(--bad)"}">${msg(rowA)}${rowB ? " / " + msg(rowB) : ""}</td></tr>`;
    } else if(rowA.gate_miss){
      const confA = rowA.conf !== undefined ? rowA.conf.toFixed(3) : "?";
      const confB = rowB && rowB.conf !== undefined ? rowB.conf.toFixed(3) : null;
      const confStr = confB ? `A: ${confA} / B: ${confB}` : confA;
      html += `<tr><td>${esc(rowA.scenario)}</td><td>${esc(rowA.turn)}</td>
        <td colspan="${models.length===1?3:6}" style="color:var(--warn)" title="This question scored below the scope gate (${gate().toFixed(2)}) and would be refused in the live chat too">below scope gate (conf ${confStr}) — would refuse in chat</td></tr>`;
    } else {
      html += `<tr>
        <td>${esc(rowA.scenario)}</td><td>${esc(rowA.turn)}</td>
        ${cell(rowA,"citation_ok",v=>v?"✓":"✗")}
        ${cell(rowA,"coverage",v=>(v*100).toFixed(0)+"%")}
        ${cell(rowA,"alignment",v=>v.toFixed(2))}
        ${rowB ? cell(rowB,"citation_ok",v=>v?"✓":"✗") + cell(rowB,"coverage",v=>(v*100).toFixed(0)+"%") + cell(rowB,"alignment",v=>v.toFixed(2)) : ""}
      </tr>`;
    }
  }
  html += `</table>
  <p class="small" style="margin-top:12px">Topic alignment is the cosine similarity between the embedded answer and the first passage of the expected document (0–1; higher means the answer stayed on topic). Citation OK requires at least one valid [n] reference with no out-of-range indices.</p>`;
  genout.innerHTML = html;
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
    const cq = CONV_GOLDEN.map(c => c.follow.split(/\s+/).length <= 5 ? c.prior + " " + c.follow : c.follow);
    const gv = await batchEmbed(gq), ov = await batchEmbed(oq), cv = await batchEmbed(cq);
    gq.forEach((q,i) => state.qcache.set(q, gv[i]));
    oq.forEach((q,i) => state.qcache.set(q, ov[i]));
    cq.forEach((q,i) => state.qcache.set(q, cv[i]));
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

  // --- multi-turn retrieval suite ---
  let convR1 = 0, convR3 = 0;
  const convFails = [];
  for(const c of CONV_GOLDEN){
    const retrievalQ = c.follow.split(/\s+/).length <= 5 ? c.prior + " " + c.follow : c.follow;
    const r = await retrieve(retrievalQ, 5);
    const docs = []; r.hits.forEach(h => { if(!docs.includes(h.p.docId)) docs.push(h.p.docId); });
    const rank = docs.indexOf(c.expect);
    if(rank === 0) convR1++;
    if(rank > -1 && rank < 3) convR3++;
    if(rank !== 0) convFails.push([c.label, c.expect, docs[0] || "—"]);
  }
  const cn = CONV_GOLDEN.length;
  const convHTML = `
    <div class="cards">
      <div class="card"><b>${(convR1/cn*100).toFixed(0)}%</b><span>Recall@1 &middot; ${convR1}/${cn}</span></div>
      <div class="card"><b>${(convR3/cn*100).toFixed(0)}%</b><span>Recall@3</span></div>
    </div>
    ${convFails.length
      ? `<table class="tt"><tr><th>case</th><th>expected</th><th>got</th></tr>${
          convFails.map(f => `<tr><td>${esc(f[0])}</td><td>${esc(f[1])}</td><td>${esc(f[2])}</td></tr>`).join("")
        }</table>`
      : '<p class="small">None: every follow-up query still retrieved its target document in the top 3.</p>'}`;

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

  <h3>Multi-turn retrieval — follow-up coherence</h3>
  <p class="small">Each case simulates what the chat does: short follow-ups (≤5 words) are prefixed with the previous question before retrieval. The suite checks that the expected document still ranks first — directly testing the drift failure where "tell me more" retrieves general bio instead of staying on topic.</p>
  ${convHTML}

  <h3>What this does not measure</h3>
  <ul class="small">
    <li>Generation quality. Use the <b>Generation quality eval</b> below to score citation faithfulness and topic alignment on scripted conversations.</li>
    <li>Corpus coverage. A question can be legitimately about Elroy and simply not be in the corpus; the gate refuses it, which is correct behaviour but reads as a miss to a visitor.</li>
    <li>The golden sets are small and written by the same person who wrote the corpus. That is a real bias, and the honest fix is external labels.</li>
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

$("#f").onsubmit = e => { e.preventDefault(); ask($("#q").value); };
$("#tab-chat").onclick = () => showTab("chat");
$("#tab-how").onclick  = () => showTab("how");
$("#tab-eval").onclick = () => showTab("eval");
$("#runeval").onclick  = () => runEval();
$("#rungeneval").onclick = () => runGenEval();
["modelA","modelB"].forEach(id => { const el = document.getElementById(id); if(el) el.oninput = updateGenCostEst; });
window.askElroy = { state, CONFIG, BANK, IDS, GOLDEN, OOS, CONV_GOLDEN, GEN_SUITE, retrieve, runEval, runGenEval, ask };
updateGenCostEst();
boot();
