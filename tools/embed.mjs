#!/usr/bin/env node
/* =====================================================================
   tools/embed.mjs — precompute the passage vectors at build time.

   Build-time only. Nothing here reaches the browser bundle; the only thing
   that ships is the generated src/vectors.js.

   Why: embedding 146 passages in the visitor's browser cost 15.5 s of cold
   start, and the result is identical for every visitor. It is a build
   artifact, not a runtime computation.

   Modes:
     node tools/embed.mjs             regenerate src/vectors.js
     node tools/embed.mjs --ensure    regenerate only if stale (used by build.sh)
     node tools/embed.mjs --verify    check src/vectors.js against the corpus,
                                      exit 1 on any drift. No model needed.

   The chunking is not reimplemented here: src/chunk.js is evaluated as-is,
   with src/corpus.js and src/eval.js, so buildPassages() is byte-identical
   to the one running in the page.
   ===================================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = f => join(ROOT, "src", f);

const MODEL = "Xenova/all-MiniLM-L6-v2";   // must match CONFIG.embedModel
const SCALE = 127;                          // symmetric int8: vectors are L2-normalised

/* ---- reconstruct the runtime passages from the shipped sources ---- */
function corpusSha(){
  return createHash("sha256").update(readFileSync(SRC("corpus.js"))).digest("hex");
}
function loadPassages(){
  const src = ["corpus.js", "eval.js", "chunk.js"].map(f => readFileSync(SRC(f), "utf8")).join("\n");
  const ctx = vm.createContext(Object.create(null));
  vm.runInContext(src + "\n;globalThis.__passages = buildPassages();", ctx, { filename: "ask-elroy-sources.js" });
  return ctx.__passages;
}

/* ---- read the generated file back the same way ---- */
function loadVectors(){
  const f = SRC("vectors.js");
  if(!existsSync(f)) return null;
  const ctx = vm.createContext(Object.create(null));
  vm.runInContext(readFileSync(f, "utf8") + "\n;globalThis.__v = VECTORS;", ctx, { filename: "vectors.js" });
  return ctx.__v;
}

/* ---- validation: every way the vectors can silently stop matching ---- */
function problems(v, passages, sha){
  if(!v) return ["src/vectors.js is missing"];
  const out = [];
  if(v.model !== MODEL)            out.push(`model is "${v.model}", expected "${MODEL}"`);
  if(v.corpusSha256 !== sha)       out.push(`corpus sha256 is ${String(v.corpusSha256).slice(0,12)}…, src/corpus.js is now ${sha.slice(0,12)}…`);
  if(v.count !== passages.length)  out.push(`passage count is ${v.count}, buildPassages() now yields ${passages.length}`);
  const want = passages.map(p => p.pid);
  if(!v.pids || v.pids.length !== want.length || v.pids.some((p,i) => p !== want[i])){
    const first = (v.pids || []).findIndex((p,i) => p !== want[i]);
    out.push(`pid list does not match buildPassages()${first > -1 ? ` (first difference at index ${first}: "${v.pids[first]}" vs "${want[first]}")` : ""}`);
  }
  const bytes = v.data ? Buffer.from(v.data, "base64").length : 0;
  if(bytes !== v.count * v.dim)    out.push(`payload is ${bytes} bytes, expected ${v.count * v.dim} (${v.count} x ${v.dim} int8)`);
  return out;
}

/* ---- embed ---- */
async function embedAll(passages){
  let transformers;
  try {
    transformers = await import("@huggingface/transformers");
  } catch(e){
    fail([
      "@huggingface/transformers is not installed.",
      "It is a build-time dev dependency, not part of the browser bundle:",
      "  npm i -D @huggingface/transformers"
    ].join("\n"));
  }
  transformers.env.allowLocalModels = false;
  process.stderr.write(`embed: loading ${MODEL}…\n`);
  const pipe = await transformers.pipeline("feature-extraction", MODEL);

  const dim = 384;
  const q = new Int8Array(passages.length * dim);
  const B = 16;
  for(let i = 0; i < passages.length; i += B){
    const batch = passages.slice(i, i + B);
    // identical call to embed() in src/engine.js — same pooling, same normalisation
    const out = await pipe(batch.map(p => p.dense), { pooling: "mean", normalize: true });
    const rows = out.tolist();
    rows.forEach((v, j) => {
      if(v.length !== dim) fail(`model returned dim ${v.length}, expected ${dim}`);
      const base = (i + j) * dim;
      // symmetric int8. The vectors are L2-normalised, so |v| <= 1 and a fixed
      // scale of 127 needs no per-row scale factor. Round-half-away-from-zero,
      // clamped, so a component of exactly 1.0 lands on 127 and not on -128.
      for(let d = 0; d < dim; d++){
        const x = Math.round(v[d] * SCALE);
        q[base + d] = x > SCALE ? SCALE : x < -SCALE ? -SCALE : x;
      }
    });
    process.stderr.write(`embed: ${Math.min(i + B, passages.length)}/${passages.length}\r`);
  }
  process.stderr.write("\n");
  return { q, dim };
}

function emit(passages, sha, q, dim){
  const b64 = Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString("base64");
  const body = `/* =====================================================================
   GENERATED by tools/embed.mjs — do not edit, do not hand-patch.

   Passage vectors for the dense index, precomputed so the page does not
   have to embed the corpus in the visitor's browser. Regenerate with
   ./build.sh (or node tools/embed.mjs) after any change to src/corpus.js,
   src/eval.js (IDS) or src/chunk.js. build.sh fails hard if this file and
   the corpus disagree.

   int8, symmetric scale ${SCALE}: the source vectors are L2-normalised, so a
   component is recovered as q/${SCALE} and the row re-normalised at decode.
   ===================================================================== */
const VECTORS = {
  model: ${JSON.stringify(MODEL)},
  dtype: "int8",
  scale: ${SCALE},
  dim: ${dim},
  count: ${passages.length},
  corpusSha256: ${JSON.stringify(sha)},
  pids: ${JSON.stringify(passages.map(p => p.pid))},
  data: ${JSON.stringify(b64)}
};
`;
  writeFileSync(SRC("vectors.js"), body);
  return { bytes: q.byteLength, b64: b64.length, file: body.length };
}

function fail(msg){
  process.stderr.write("\nembed: " + msg + "\n");
  process.exit(1);
}

/* ---- main ---- */
const mode = process.argv[2] || "--write";
const sha = corpusSha();
const passages = loadPassages();

if(mode === "--verify"){
  const errs = problems(loadVectors(), passages, sha);
  if(errs.length){
    fail("src/vectors.js does not match the corpus:\n  - " + errs.join("\n  - ") +
         "\n\nThis corrupts retrieval silently — the vectors would line up with the wrong" +
         "\npassages and answers would just get quietly worse. Run: node tools/embed.mjs");
  }
  process.stderr.write(`embed: vectors verified — ${passages.length} passages, corpus ${sha.slice(0,12)}…\n`);
  process.exit(0);
}

if(mode === "--ensure" && !problems(loadVectors(), passages, sha).length){
  process.stderr.write(`embed: src/vectors.js is current — ${passages.length} passages, skipping\n`);
  process.exit(0);
}

const { q, dim } = await embedAll(passages);
const size = emit(passages, sha, q, dim);
process.stderr.write(`embed: wrote src/vectors.js — ${passages.length} x ${dim} int8 = ${size.bytes} B raw, ${size.b64} B base64\n`);

const errs = problems(loadVectors(), passages, sha);
if(errs.length) fail("wrote a file that does not verify:\n  - " + errs.join("\n  - "));
