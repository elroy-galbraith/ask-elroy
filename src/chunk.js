/* =====================================================================
   SHARED CHUNKER — the single definition of corpus -> passages.

   This file is read twice: build.sh concatenates it into index.html, and
   tools/embed.mjs evaluates it to reconstruct the same passages in Node
   before embedding them. Do not fork it. If the browser and the build
   script chunk differently, the precomputed vectors line up with the wrong
   text and retrieval degrades silently — nothing throws, the answers just
   get worse. build.sh checks the resulting pid list against src/vectors.js
   on every build for exactly that reason.

   Depends on BANK (src/corpus.js) and IDS (src/eval.js), which are
   concatenated ahead of it.
   ===================================================================== */

const strip = h => String(h).replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&middot;/g,"-");

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
