#!/usr/bin/env node
/* =====================================================================
   test/fit-score-stability.mjs — issue #28 regression check.

   Scores a fixed job description N times against a real worker + OpenRouter
   and asserts the spread of `overall` stays inside a documented tolerance.

   This is NOT part of `node --test test/*.test.mjs`: it makes real network
   calls, costs API usage, and its result depends on provider-side variance
   this repo does not control (see the "Honest limitation" in issue #28 —
   temperature: 0 narrows the distribution, it does not collapse it). Run it
   by hand after touching callJSON's sampling params or the panel prompts.

   Point it at a LOCAL worker (`cd worker && npx wrangler dev`), never at the
   deployed one — repeated runs would add self-traffic to the production
   visitor log on top of spending real API calls.

   Usage:
     cd worker && npx wrangler dev &          # local worker, real OpenRouter
     node test/fit-score-stability.mjs http://localhost:8787 [runs]
   ===================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// TOLERANCE, measured 2026-08-28 against the local worker + real OpenRouter,
// model google/gemini-3.7-flash (MODEL_DEFAULT): two batches of 5 and 10 runs
// on this fixed JD scored 42-53 (spread 11) and 42-49 (spread 7) — mostly
// clustered at 42-43 with occasional jumps. temperature: 0 + a fixed seed
// narrow the distribution but do not collapse it (see issue #28's "Honest
// limitation") — an occasional outlier run is expected, not a bug. 15 is
// the observed max plus a small margin so re-running this doesn't flake on
// the same noise; re-measure and adjust if the default model changes.
const TOLERANCE = 15;
const FIXED_JD = "Senior Go engineer building RAG systems; must lead a small team.";
const PASSAGE_COUNT = 10;

function loadPassages() {
  const src = ["corpus.js", "eval.js", "chunk.js"]
    .map(f => readFileSync(join(ROOT, "src", f), "utf8"))
    .join("\n");
  const ctx = vm.createContext(Object.create(null));
  vm.runInContext(src + "\n;globalThis.__passages = buildPassages();", ctx, { filename: "ask-elroy-sources.js" });
  return ctx.__passages.slice(0, PASSAGE_COUNT).map(p => ({ title: p.title, text: p.text }));
}

async function main() {
  const url = process.argv[2];
  const runs = Number(process.argv[3] || 5);
  if (!url) {
    console.error("usage: node test/fit-score-stability.mjs <worker-url> [runs]");
    console.error("start a local worker first: cd worker && npx wrangler dev");
    process.exit(1);
  }

  const passages = loadPassages();
  const overalls = [];
  for (let i = 0; i < runs; i++) {
    const res = await fetch(url + "/fit/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jd_text: FIXED_JD, passages })
    });
    if (!res.ok) {
      console.error(`run ${i + 1}: HTTP ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const panel = await res.json();
    console.log(`run ${i + 1}: overall=${panel.overall} tier="${panel.tier}"`);
    overalls.push(panel.overall);
  }

  const spread = Math.max(...overalls) - Math.min(...overalls);
  console.log(`spread across ${runs} runs: ${spread} (tolerance ${TOLERANCE})`);
  if (spread > TOLERANCE) {
    console.error(`FAIL: spread ${spread} exceeds tolerance ${TOLERANCE}`);
    process.exit(1);
  }
  console.log("PASS");
}

main();
