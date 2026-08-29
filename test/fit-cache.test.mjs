import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeJd, fitCacheKey, readFitCache, writeFitCache } from '../worker/worker.js';

/* The exact-input panel cache from issue #30. A byte-identical job description
   must return the identical panel; a model change, a corpus edit or a different
   passage set must miss rather than serve a stale scorecard. */

const JD = 'Senior Go engineer building RAG systems; must lead a small team.';
const SHA = 'a'.repeat(64);
const PASS = 'passage-block-digest';
const MODEL = 'google/gemini-3.7-flash';

const key = (jd = JD, model = MODEL, sha = SHA, pass = PASS) => fitCacheKey(jd, model, sha, pass);

// ---- normalize: trim, collapse whitespace, casefold. Nothing cleverer. ----

test('normalizeJd trims, collapses whitespace and casefolds', () => {
  assert.equal(normalizeJd('  Senior   Go\n\tEngineer  '), 'senior go engineer');
});

test('normalizeJd survives missing input', () => {
  assert.equal(normalizeJd(null), '');
  assert.equal(normalizeJd(undefined), '');
});

test('normalizeJd keeps punctuation — it is not a classifier', () => {
  assert.equal(normalizeJd('Go, Kubernetes; 8+ years.'), 'go, kubernetes; 8+ years.');
});

// ---- the key ----

test('the same submission produces the same key', async () => {
  assert.equal(await key(), await key());
});

test('the key is a sha256 hex digest', async () => {
  assert.match(await key(), /^[0-9a-f]{64}$/);
});

test('whitespace and case differences still hit the same entry', async () => {
  const spaced = '  senior  go engineer building RAG systems;   must lead a small team.  ';
  assert.equal(await key(spaced), await key(JD.toLowerCase()));
});

test('a different job description misses', async () => {
  assert.notEqual(await key('Senior Rust engineer building RAG systems; must lead a small team.'), await key());
});

test('a model change invalidates prior entries', async () => {
  assert.notEqual(await key(JD, 'anthropic/claude-haiku-4-5'), await key());
});

test('a corpus edit invalidates prior entries', async () => {
  assert.notEqual(await key(JD, MODEL, 'b'.repeat(64)), await key());
});

/* corpus_sha is a claim the client makes about itself, and /fit/score is an open POST
   route. Hashing the passage block the worker actually scored keeps a caller that
   sends a truthful sha with invented passages inside its own key space. */
test('passages the worker actually scored are part of the key', async () => {
  assert.notEqual(await key(JD, MODEL, SHA, 'someone-elses-passages'), await key());
});

/* NUL-joined fields: "gpt" + "4o" and "gpt4" + "o" must not be the same key. */
test('adjacent fields cannot run together', async () => {
  assert.notEqual(await fitCacheKey(JD, 'gpt', '4o', PASS), await fitCacheKey(JD, 'gpt4', 'o', PASS));
});

// ---- storage ----

function stubDB(rows = new Map()) {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind: (...args) => {
            calls.push({ sql, args });
            return {
              run: async () => { rows.set(args[0], args[args.length - 1]); },
              first: async () => (rows.has(args[0]) ? { panel: rows.get(args[0]) } : null)
            };
          }
        };
      }
    }
  };
  return { env, calls, rows };
}

const PANEL = { overall: 63, tier: 'Moderate fit', hasStrongMatch: true, criteria: [{ id: 'c1', midpoint: 63 }] };

test('a written panel comes back identical', async () => {
  const { env } = stubDB();
  const k = await key();
  await writeFitCache(env, k, MODEL, SHA, PANEL);
  assert.deepEqual(await readFitCache(env, k), PANEL);
});

test('a key that was never written misses', async () => {
  const { env } = stubDB();
  await writeFitCache(env, await key(), MODEL, SHA, PANEL);
  assert.equal(await readFitCache(env, await key(JD, 'anthropic/claude-haiku-4-5')), null);
});

test('the write records model and corpus_sha so orphans can be pruned', async () => {
  const { env, calls } = stubDB();
  await writeFitCache(env, await key(), MODEL, SHA, PANEL);
  assert.match(calls[0].sql, /INSERT OR REPLACE INTO fit_cache/);
  assert.ok(calls[0].args.includes(MODEL));
  assert.ok(calls[0].args.includes(SHA));
});

/* A cache is an optimisation. If the table is missing or D1 is unhappy, /fit/score
   has to score live and return a panel — never a 500 — which is also why the schema
   change is safe to apply after the deploy. */
test('a read against a broken DB misses instead of throwing', async () => {
  const env = { DB: { prepare() { throw new Error('no such table: fit_cache'); } } };
  assert.equal(await readFitCache(env, await key()), null);
});

test('a write against a broken DB is swallowed', async () => {
  const env = { DB: { prepare() { throw new Error('no such table: fit_cache'); } } };
  await writeFitCache(env, await key(), MODEL, SHA, PANEL);
});

test('an unbound DB is not an error either', async () => {
  assert.equal(await readFitCache({}, await key()), null);
  await writeFitCache({}, await key(), MODEL, SHA, PANEL);
});

/* No corpus_sha, no key: handleScore passes null and the request must fall through
   to a live score rather than sharing an entry with every other undeclared build. */
test('a null key never reads or writes', async () => {
  const { env, calls } = stubDB();
  assert.equal(await readFitCache(env, null), null);
  await writeFitCache(env, null, MODEL, SHA, PANEL);
  assert.equal(calls.length, 0);
});
