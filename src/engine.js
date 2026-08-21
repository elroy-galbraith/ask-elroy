
/* =====================================================================
   ask-elroy — a small retrieval-augmented agent over a curated corpus.
   Pipeline:  chunk -> embed (MiniLM, in-browser) -> hybrid retrieve
              (BM25 + dense, RRF fused) -> scope gate -> grounded
              generation with citations -> groundedness check.
   Everything below the generation call runs client-side. The generator
   is a stateless proxy that holds the API key.
   ===================================================================== */

const CONFIG = {
  // Paste your deployed Cloudflare Worker URL here to switch generation on.
  // Leave empty and the agent runs in retrieval-only mode (still fully usable).
  generatorUrl: "https://ask-elroy.elroy-galbraith.workers.dev",
  embedModel: "Xenova/all-MiniLM-L6-v2",
  // Tier 2, not implemented. Set this to a Worker route and embedQuery() will POST
  // the query there instead of loading a ~25 MB model into the browser at all — the
  // passage vectors already ship precomputed, so the local model exists only to
  // embed the one query. Whatever model that route runs, src/vectors.js must be
  // regenerated with the same one: two embedding models do not share a vector
  // space, and mixing them produces cosines that look plausible and rank wrongly.
  queryEmbedUrl: "",
  topK: 5,
  // The scope gate reads two independent signals and needs only one of them to say yes.
  // They fail on different queries: "does he have any dealbreakers" has every one of its
  // content words in the passage (coverage 1.00) but sits at cosine 0.19, while an
  // injection like "ignore all previous instructions…" reaches cosine 0.39 with almost no
  // lexical support. A single threshold on either signal has to choose which of those two
  // mistakes to make; the union makes neither. Fitted in ADR-0002 against 102 in-scope
  // queries (GOLDEN + PARAPHRASE) and 39 negatives (OOS).
  scopeThreshold: 0.40,        // dense arm  — min cosine, hybrid mode only
  covThreshold: 0.48,          // lexical arm — min BM25 term coverage, hybrid mode
  lexThreshold: 0.44,          // BM25-only mode: coverage is the only signal there, so it
                               // carries the whole gate and is set to hold the same
                               // refusal rate the two-signal rule achieves (85%)
  maxGenPerSession: 40,        // client-side cost cap
  price: { in: 1.00, out: 5.00 }  // USD per 1M tokens (claude-haiku-4-5)
};

const state = {
  mode: "booting",            // booting | hybrid | lexical
  ready: false,
  embedder: null,
  passages: [],
  vecs: [],                   // Float32Array per passage
  bm25: null,
  backend: null,
  gens: 0, tokIn: 0, tokOut: 0, costUSD: 0,
  qcache: new Map(),
  sessionId: crypto.randomUUID()
};

/* ---------------- text utils ---------------- */
const STOP = new Set(("a an the and or but if is are was were be been being do does did doing have has had of in on at to for with about from by as into over under again further then once here there all any both each few more most other some such no nor not only own same so than too very can will just should now i you he she it we they me him her them my your his their our us what which who whom this that these those am tell give say please would could like want know").split(" "));
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function toks(s){
  return String(s).toLowerCase().replace(/[^a-z0-9+#\s]/g," ").split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(stem);
}
function stem(w){
  if(w.length > 4 && /ies$/.test(w)) return w.slice(0,-3) + "y";
  if(w.length > 3 && /[^s]s$/.test(w)) return w.slice(0,-1);
  if(w.length > 5 && /ing$/.test(w)) return w.slice(0,-3);
  if(w.length > 5 && /ed$/.test(w))  return w.slice(0,-2);
  return w;
}

/* ---------------- 1. chunk ---------------- */
// buildPassages() and strip() live in src/chunk.js, concatenated ahead of this
// file and shared verbatim with tools/embed.mjs, so the precomputed vectors
// cannot drift from the runtime chunking.

/* ---------------- 2. lexical index (BM25) ---------------- */
function buildBM25(passages){
  const docs = passages.map(p => toks(p.lex));
  const N = docs.length;
  const df = new Map();
  docs.forEach(d => new Set(d).forEach(t => df.set(t,(df.get(t)||0)+1)));
  const avgdl = docs.reduce((a,d) => a + d.length, 0) / N;
  const tfs = docs.map(d => { const m = new Map(); d.forEach(t => m.set(t,(m.get(t)||0)+1)); return m; });
  const k1 = 1.2, b = 0.75;
  const idfOf = t => Math.log(1 + (N - (df.get(t)||0) + 0.5) / ((df.get(t)||0) + 0.5));
  return {
    idfOf, tfs,
    // idf-weighted share of the query that the best passage actually contains.
    // Used as the scope gate when dense retrieval is unavailable: raw BM25 is an
    // unbounded relevance score, not a calibrated confidence, and treating it as
    // one lets "write me a python function" score as high as a real question.
    coverage(query, bestIdx){
      const q = [...new Set(toks(query))];
      if(!q.length) return 0;
      let tot = 0, got = 0;
      q.forEach(t => { const w = idfOf(t); tot += w; if(tfs[bestIdx].get(t)) got += w; });
      return tot ? got/tot : 0;
    },
    score(query){
      const q = toks(query);
      return tfs.map((tf,i) => {
        let s = 0;
        const dl = docs[i].length;
        q.forEach(t => {
          const f = tf.get(t); if(!f) return;
          const idf = Math.log(1 + (N - (df.get(t)||0) + 0.5) / ((df.get(t)||0) + 0.5));
          s += idf * (f * (k1+1)) / (f + k1 * (1 - b + b * dl/avgdl));
        });
        return s;
      });
    }
  };
}

/* ---------------- 3. dense index (in-browser embeddings) ---------------- */
const BACKENDS = [
  { url:"https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0", opts:{ device:"webgpu", dtype:"q8" }, label:"transformers.js 4 · WebGPU · q8" },
  { url:"https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0", opts:{ dtype:"q8" },                  label:"transformers.js 4 · WASM · q8" },
  { url:"https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",     opts:{ quantized:true },              label:"transformers.js 2 · WASM · quantized" }
];
function withTimeout(p, ms, what){
  return Promise.race([p, new Promise((_,rej) => setTimeout(() => rej(new Error(what+" timed out")), ms))]);
}

/* ---- boot instrumentation ----
   Four stages dominate cold start and they fail for different reasons, so they
   are timed apart rather than as one number: fetching the library off the CDN,
   fetching and compiling the ONNX weights, the first (uncached) forward pass,
   and the passage embed loop. performance.mark/measure so the numbers also show
   up in a browser profile next to everything else, not only in our own panel. */
const bootPerf = {
  stages: {},        // name -> ms, successful attempt only
  attempts: [],      // every backend tried, including the ones that failed
  backend: null,
  total: 0
};
function markStart(name){
  try { performance.mark("ask-elroy:" + name + ":start"); } catch(e){}
}
// timed() writes into perfSink. During a backend attempt that is a scratch
// object, promoted into bootPerf.stages only if the attempt succeeds — otherwise
// a blocked CDN would leave its fetch time on the panel looking like a success.
let perfSink = bootPerf.stages;
function markEnd(name){
  try {
    performance.mark("ask-elroy:" + name + ":end");
    const m = performance.measure("ask-elroy:" + name, "ask-elroy:" + name + ":start", "ask-elroy:" + name + ":end");
    const ms = m && typeof m.duration === "number" ? m.duration
             : performance.getEntriesByName("ask-elroy:" + name, "measure").pop().duration;
    perfSink[name] = ms;
    return ms;
  } catch(e){ return 0; }
}
async function timed(name, promise){
  markStart(name);
  try { return await promise; } finally { markEnd(name); }
}
// Try fastest backend first and walk down. Every step is a real failure mode
// (no WebGPU, blocked CDN, old browser) rather than a hypothetical one.
async function loadEmbedder(setStatus){
  let last;
  for(const b of BACKENDS){
    const t0 = performance.now();
    const attempt = {};
    perfSink = attempt;
    try{
      setStatus("loading embedding model — " + b.label + "…", "warn");
      const mod = await timed("cdn", withTimeout(import(b.url), 30000, "CDN fetch"));
      if(mod.env) mod.env.allowLocalModels = false;
      const pipe = await timed("model", withTimeout(mod.pipeline("feature-extraction", CONFIG.embedModel, b.opts), 90000, "model load"));
      await timed("warmup", withTimeout(pipe(["warm up"], { pooling:"mean", normalize:true }), 30000, "warm-up"));
      state.backend = b.label;
      bootPerf.backend = b.label;
      Object.assign(bootPerf.stages, attempt);
      perfSink = bootPerf.stages;
      bootPerf.attempts.push({ label: b.label, ok: true, ms: performance.now() - t0, stages: attempt });
      return pipe;
    } catch(e){
      last = e;
      perfSink = bootPerf.stages;
      bootPerf.attempts.push({ label: b.label, ok: false, ms: performance.now() - t0, err: e && e.message, stages: attempt });
    }
  }
  perfSink = bootPerf.stages;
  throw last || new Error("no embedding backend available");
}

/* ---------------- 3b. precomputed passage vectors ----------------
   The corpus is identical for every visitor, so embedding it in the browser was
   the same 15.5 s of arithmetic repeated per cold visit. src/vectors.js ships the
   result; this decodes it with no network and no model. */
function decodeVectors(passages){
  if(typeof VECTORS === "undefined" || !VECTORS) throw new Error("src/vectors.js not loaded");
  const { dim, count, scale, pids } = VECTORS;
  if(count !== passages.length) throw new Error("vectors cover " + count + " passages, chunker produced " + passages.length);
  // Cheap belt-and-braces against a stale bundle: build.sh already refuses to ship
  // a mismatch, but a wrong alignment here is invisible rather than loud.
  for(let i = 0; i < count; i++){
    if(pids[i] !== passages[i].pid) throw new Error("passage " + i + " is " + passages[i].pid + ", vectors say " + pids[i]);
  }
  const bin = atob(VECTORS.data);
  if(bin.length !== count * dim) throw new Error("payload is " + bin.length + " bytes, expected " + (count * dim));
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const q = new Int8Array(bytes.buffer);
  const out = new Array(count);
  for(let i = 0; i < count; i++){
    const v = new Float32Array(dim);
    let n = 0;
    for(let d = 0; d < dim; d++){ const x = q[i*dim + d] / scale; v[d] = x; n += x * x; }
    // int8 rounding moves the row off the unit sphere by ~0.1%. Re-normalise so a
    // dot product is still exactly a cosine and the 0.34 gate keeps its meaning.
    n = Math.sqrt(n) || 1;
    for(let d = 0; d < dim; d++) v[d] /= n;
    out[i] = v;
  }
  return out;
}

async function embed(texts){
  const out = await state.embedder(texts, { pooling: "mean", normalize: true });
  const list = out.tolist();
  return list.map(v => Float32Array.from(v));
}
/* The gate. Two signals, either one is enough to answer.

   `cos` is null in lexical mode — the model has not loaded yet, so there is no dense arm
   and coverage carries the decision on its own under its own threshold.

   What this deliberately does NOT try to do: decide whether the corpus can *answer* the
   question. Both signals measure topical similarity, and the two are structurally unable
   to tell "what does he do at Yoii" from "what is his manager's name at Yoii" — the latter
   scores cosine 0.77 and is not in the corpus at all. Questions of that shape reach the
   model, which refuses them on the grounds that the passages do not support an answer.
   That is the second line of defence and it is measured in ADR-0002, not assumed. */
function passesGate(cos, cov){
  if(cos !== null && cos >= CONFIG.scopeThreshold) return true;
  return cov >= (cos === null ? CONFIG.lexThreshold : CONFIG.covThreshold);
}
const dot = (a,b) => { let s = 0; for(let i=0;i<a.length;i++) s += a[i]*b[i]; return s; };

/* ---------------- 4. hybrid retrieval + RRF fusion ---------------- */
async function embedQuery(q){
  if(state.qcache.has(q)) return state.qcache.get(q);
  const v = (await embed([q]))[0];
  state.qcache.set(q, v);
  return v;
}
async function retrieve(query, k){
  k = k || CONFIG.topK;
  const t0 = performance.now();
  const lex = state.bm25.score(query);
  // Coverage is computed in both modes now — it is the gate's second signal in hybrid,
  // not just the fallback's only one.
  let bi = 0; lex.forEach((s,i) => { if(s > lex[bi]) bi = i; });
  const cov = state.bm25.coverage(query, bi);
  let dense = null, tEmbed = 0, cos = null;
  if(state.mode === "hybrid"){
    const te = performance.now();
    const qv = await embedQuery(query);
    tEmbed = performance.now() - te;
    dense = state.vecs.map(v => dot(qv, v));
    cos = Math.max(...dense);
  }
  const conf = cos === null ? cov : cos;
  const order = arr => arr.map((s,i) => [i,s]).sort((a,b) => b[1]-a[1]).map(x => x[0]);
  const rl = order(lex), rd = dense ? order(dense) : null;
  const RRF = 60, fused = new Map();
  rl.slice(0,40).forEach((idx,r) => fused.set(idx,(fused.get(idx)||0) + 1/(RRF+r+1)));
  if(rd) rd.slice(0,40).forEach((idx,r) => fused.set(idx,(fused.get(idx)||0) + 1/(RRF+r+1)));
  const ranked = [...fused.entries()].sort((a,b) => b[1]-a[1]).slice(0,k)
    .map(([idx,f]) => ({ p: state.passages[idx], idx, rrf: f,
                         bm25: lex[idx], cos: dense ? dense[idx] : null }));
  return { hits: ranked, conf, cos, cov, inScope: passesGate(cos, cov),
           terms: toks(query), msEmbed: tEmbed, msTotal: performance.now()-t0 };
}

/* ---------------- 5. generation (proxied) ---------------- */
const SYS_NOTE = "grounded generation, first person, citations required";

async function generate(question, hits, onToken, history, model){
  const passages = hits.map((h,i) => ({ n: i+1, title: h.p.title, text: h.p.text }));
  const body = { question, passages, history: history || [],
                 session_id: state.sessionId, visitor_name: null, visitor_co: null };
  if(model) body.model = model;
  const res = await fetch(CONFIG.generatorUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error("generator returned " + res.status);

  const ct = res.headers.get("content-type") || "";
  if(!ct.includes("event-stream")){
    const j = await res.json();
    const raw = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    onToken(text);
    return { text, usage: j.usage ? { input_tokens: j.usage.prompt_tokens || 0, output_tokens: j.usage.completion_tokens || 0 } : null };
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", usage = { input_tokens: 0, output_tokens: 0 };
  let inThink = false, thinkBuf = "";
  for(;;){
    const { done, value } = await reader.read();
    if(done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop();
    for(const block of parts){
      const line = block.split("\n").find(l => l.startsWith("data:"));
      if(!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
      if(delta && delta.content){
        let chunk = delta.content;
        if(!inThink){
          const s = chunk.indexOf("<think>");
          if(s === -1){
            text += chunk; onToken(chunk);
          } else {
            const before = chunk.slice(0, s);
            if(before){ text += before; onToken(before); }
            inThink = true; thinkBuf = chunk.slice(s + 7);
            const e = thinkBuf.indexOf("</think>");
            if(e !== -1){
              const after = thinkBuf.slice(e + 8);
              thinkBuf = ""; inThink = false;
              if(after){ text += after; onToken(after); }
            }
          }
        } else {
          thinkBuf += chunk;
          const e = thinkBuf.indexOf("</think>");
          if(e !== -1){
            const after = thinkBuf.slice(e + 8);
            thinkBuf = ""; inThink = false;
            if(after){ text += after; onToken(after); }
          }
        }
      }
      if(ev.usage){
        usage.input_tokens = ev.usage.prompt_tokens || 0;
        usage.output_tokens = ev.usage.completion_tokens || 0;
      }
    }
  }
  return { text, usage };
}

async function generateFit(jdText, onToken, visitorName, visitorCo, assessment){
  const passages = state.passages.map((p, i) => ({ n: i + 1, title: p.title, text: p.text }));
  const body = {
    jd_text: String(jdText).slice(0, 4000),
    passages,
    session_id: state.sessionId,
    visitor_name: visitorName || null,
    visitor_co: visitorCo || null,
    assessment: assessment || null
  };
  const res = await fetch(CONFIG.generatorUrl + "/fit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error("fit generator returned " + res.status);

  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", usage = null;
  let inThink = false, thinkBuf = "";
  for(;;){
    const { done, value } = await reader.read();
    if(done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop();
    for(const block of parts){
      const line = block.split("\n").find(l => l.startsWith("data:"));
      if(!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
      if(delta && delta.content){
        let chunk = delta.content;
        if(!inThink){
          const s = chunk.indexOf("<think>");
          if(s === -1){
            text += chunk; onToken(chunk);
          } else {
            const before = chunk.slice(0, s);
            if(before){ text += before; onToken(before); }
            inThink = true; thinkBuf = chunk.slice(s + 7);
            const e = thinkBuf.indexOf("</think>");
            if(e !== -1){
              const after = thinkBuf.slice(e + 8);
              thinkBuf = ""; inThink = false;
              if(after){ text += after; onToken(after); }
            }
          }
        } else {
          thinkBuf += chunk;
          const e = thinkBuf.indexOf("</think>");
          if(e !== -1){
            const after = thinkBuf.slice(e + 8);
            thinkBuf = ""; inThink = false;
            if(after){ text += after; onToken(after); }
          }
        }
      }
      if(ev.usage){
        usage = { input_tokens: ev.usage.prompt_tokens || 0, output_tokens: ev.usage.completion_tokens || 0 };
      }
    }
  }
  return { text, usage };
}

async function generateScore(jdText, visitorName, visitorCo){
  const passages = state.passages.map((p, i) => ({ n: i + 1, title: p.title, text: p.text }));
  const res = await fetch(CONFIG.generatorUrl + "/fit/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jd_text: String(jdText).slice(0, 4000),
      passages,
      session_id: state.sessionId,
      visitor_name: visitorName || null,
      visitor_co: visitorCo || null
    })
  });
  if(!res.ok) throw new Error("score generator returned " + res.status);
  return await res.json();
}

/* ---------------- 6. groundedness check ---------------- */
function checkGrounding(text, hits){
  const cited = new Set((text.match(/\[(\d+)\]/g) || []).map(m => parseInt(m.slice(1,-1),10)));
  const valid = [...cited].filter(n => n >= 1 && n <= hits.length);
  const invalid = [...cited].filter(n => n < 1 || n > hits.length);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 25);
  const withCite = sentences.filter(s => /\[\d+\]/.test(s)).length;
  return {
    cited: valid, invalid,
    coverage: sentences.length ? withCite / sentences.length : 1,
    ok: invalid.length === 0 && valid.length > 0
  };
}
