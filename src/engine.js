
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
  topK: 5,
  scopeThreshold: 0.34,        // min dense cosine to answer at all (hybrid mode)
  lexThreshold: 0.30,          // gate for the BM25-only fallback, which separates worse
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
const strip = h => String(h).replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&middot;/g,"-");
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
function buildPassages(){
  const out = [];
  BANK.forEach((e,i) => {
    const docId = IDS[i] || ("doc"+i);
    const parts = String(e.a).split(/<\/(?:p|li)>/i)
      .map(s => strip(s).replace(/\s+/g," ").trim())
      .filter(t => t.length > 30);
    parts.forEach((t,n) => out.push({
      pid: docId + "#" + n, docId, n, cat: e.cat,
      title: strip(e.q), text: t,
      dense: strip(e.q) + " — " + t,
      lex: strip(e.q) + " " + (n === 0 ? e.k + " " : "") + t
    }));
  });
  return out;
}

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
// Try fastest backend first and walk down. Every step is a real failure mode
// (no WebGPU, blocked CDN, old browser) rather than a hypothetical one.
async function loadEmbedder(setStatus){
  let last;
  for(const b of BACKENDS){
    try{
      setStatus("loading embedding model — " + b.label + "…", "warn");
      const mod = await withTimeout(import(b.url), 30000, "CDN fetch");
      if(mod.env) mod.env.allowLocalModels = false;
      const pipe = await withTimeout(mod.pipeline("feature-extraction", CONFIG.embedModel, b.opts), 90000, "model load");
      await withTimeout(pipe(["warm up"], { pooling:"mean", normalize:true }), 30000, "warm-up");
      state.backend = b.label;
      return pipe;
    } catch(e){ last = e; }
  }
  throw last || new Error("no embedding backend available");
}

async function embed(texts){
  const out = await state.embedder(texts, { pooling: "mean", normalize: true });
  const list = out.tolist();
  return list.map(v => Float32Array.from(v));
}
function gate(){ return state.mode === "hybrid" ? CONFIG.scopeThreshold : CONFIG.lexThreshold; }
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
  let dense = null, tEmbed = 0, conf = 0;
  if(state.mode === "hybrid"){
    const te = performance.now();
    const qv = await embedQuery(query);
    tEmbed = performance.now() - te;
    dense = state.vecs.map(v => dot(qv, v));
    conf = Math.max(...dense);
  } else {
    let bi = 0; lex.forEach((s,i) => { if(s > lex[bi]) bi = i; });
    conf = state.bm25.coverage(query, bi);
  }
  const order = arr => arr.map((s,i) => [i,s]).sort((a,b) => b[1]-a[1]).map(x => x[0]);
  const rl = order(lex), rd = dense ? order(dense) : null;
  const RRF = 60, fused = new Map();
  rl.slice(0,40).forEach((idx,r) => fused.set(idx,(fused.get(idx)||0) + 1/(RRF+r+1)));
  if(rd) rd.slice(0,40).forEach((idx,r) => fused.set(idx,(fused.get(idx)||0) + 1/(RRF+r+1)));
  const ranked = [...fused.entries()].sort((a,b) => b[1]-a[1]).slice(0,k)
    .map(([idx,f]) => ({ p: state.passages[idx], idx, rrf: f,
                         bm25: lex[idx], cos: dense ? dense[idx] : null }));
  return { hits: ranked, conf, terms: toks(query), msEmbed: tEmbed, msTotal: performance.now()-t0 };
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
