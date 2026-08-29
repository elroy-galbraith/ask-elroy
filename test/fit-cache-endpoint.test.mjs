import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleScore } from '../worker/worker.js';

/* Issue #30's acceptance, at the endpoint: a repeat submission of identical text
   returns the identical panel without paying for the rubric and two scoring calls
   again, and a model or corpus change invalidates the entry.

   The upstream is stubbed, so "paid calls" here is a count, not a bill. */

const JD = 'Senior Go engineer building RAG systems; must lead a small team.';
const SHA = 'a'.repeat(64);
const PASSAGES = [{ n: 1, title: 'Go', text: 'Eight years of Go in production.' }];

const RUBRIC = [{ id: 'c1', label: 'Go in production', weight: 3, requires: 'Ships Go services.' }];
const SCORES = [{ id: 'c1', score: 70, gap: false, note: 'Eight years [1]' }];

// One D1 stand-in behind both tables, so a panel written by one request is visible
// to the next — which is the behaviour under test.
function stubEnv() {
  const cache = new Map();
  const logged = [];
  return {
    logged,
    cacheSize: () => cache.size,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind: (...args) => ({
              run: async () => {
                if (/INSERT OR REPLACE INTO fit_cache/.test(sql)) cache.set(args[0], args[args.length - 1]);
                if (/INSERT INTO questions/.test(sql)) logged.push({ question: args[1], outcome: args[2] });
              },
              first: async () => (cache.has(args[0]) ? { panel: cache.get(args[0]) } : null)
            })
          };
        }
      },
      OPENROUTER_API_KEY: 'test'
    }
  };
}

function stubRequest(body) {
  return { headers: { get: () => null }, json: async () => body };
}

// ctx.waitUntil is where the cache write and the log row happen; collect them so a
// test can await the side effects before asserting on them.
function stubCtx() {
  const pending = [];
  return { ctx: { waitUntil: p => pending.push(p) }, settle: () => Promise.all(pending) };
}

function stubUpstream() {
  const state = { calls: 0 };
  globalThis.fetch = async (_url, init) => {
    state.calls++;
    const system = JSON.parse(init.body).messages[0].content;
    const payload = /rubric from a job description/.test(system) ? RUBRIC : SCORES;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }], usage: null })
    };
  };
  return state;
}

async function score(env, body) {
  const { ctx, settle } = stubCtx();
  const res = await handleScore(stubRequest(body), env, ctx);
  await settle();
  return { status: res.status, cache: res.headers.get('x-fit-cache'), panel: await res.json() };
}

const submission = (over = {}) => ({
  jd_text: JD, passages: PASSAGES, corpus_sha: SHA,
  model: 'google/gemini-3.7-flash', session_id: 'synthetic-cache-test', ...over
});

test('a repeat submission returns the identical panel and pays nothing', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const { env, logged } = stubEnv();

    const first = await score(env, submission());
    assert.equal(first.cache, 'miss');
    assert.equal(upstream.calls, 3, 'a miss costs the rubric call plus two scorers');

    const second = await score(env, submission());
    assert.equal(second.cache, 'hit');
    assert.equal(upstream.calls, 3, 'a hit must not reach the model at all');
    assert.deepEqual(second.panel, first.panel);

    // Distinct outcomes, so hit rate is countable rather than assumed.
    assert.deepEqual(logged.map(r => r.outcome), ['fit_score', 'fit_score_cached']);
  } finally { globalThis.fetch = realFetch; }
});

test('whitespace and case differences hit the same entry', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const { env } = stubEnv();

    const first = await score(env, submission());
    const again = await score(env, submission({ jd_text: '  ' + JD.toUpperCase() + '  \n ' }));
    assert.equal(again.cache, 'hit');
    assert.equal(upstream.calls, 3);
    assert.deepEqual(again.panel, first.panel);
  } finally { globalThis.fetch = realFetch; }
});

test('a model change invalidates prior entries', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const { env } = stubEnv();

    await score(env, submission());
    const other = await score(env, submission({ model: 'anthropic/claude-haiku-4-5' }));
    assert.equal(other.cache, 'miss');
    assert.equal(upstream.calls, 6);
  } finally { globalThis.fetch = realFetch; }
});

test('a corpus edit invalidates prior entries', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const { env } = stubEnv();

    await score(env, submission());
    const moved = await score(env, submission({ corpus_sha: 'b'.repeat(64) }));
    assert.equal(moved.cache, 'miss');
    assert.equal(upstream.calls, 6);
  } finally { globalThis.fetch = realFetch; }
});

/* corpus_sha is what makes an entry retirable. A client that does not declare one
   scores live every time rather than sharing a key with every other undeclared build. */
test('a submission with no corpus_sha is never cached', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const { env, cacheSize } = stubEnv();

    const first = await score(env, submission({ corpus_sha: undefined }));
    assert.equal(first.cache, 'bypass');
    assert.equal(cacheSize(), 0);

    const second = await score(env, submission({ corpus_sha: undefined }));
    assert.equal(second.cache, 'bypass');
    assert.equal(upstream.calls, 6, 'an undeclared build pays every time');
  } finally { globalThis.fetch = realFetch; }
});

/* The input gates run first, so nothing that was refused can ever be keyed. */
test('a submission below the input floor is rejected before the cache', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const { env, cacheSize } = stubEnv();

    const res = await score(env, submission({ jd_text: 'Engineer' }));
    assert.equal(res.status, 400);
    assert.equal(upstream.calls, 0);
    assert.equal(cacheSize(), 0);
  } finally { globalThis.fetch = realFetch; }
});

/* A cache is an optimisation: a D1 outage must degrade to a live score, not a 500. */
test('a broken cache still returns a panel', async () => {
  const realFetch = globalThis.fetch;
  try {
    const upstream = stubUpstream();
    const env = { OPENROUTER_API_KEY: 'test', DB: { prepare() { throw new Error('no such table: fit_cache'); } } };

    const res = await score(env, submission());
    assert.equal(res.status, 200);
    assert.equal(res.panel.tier, 'Moderate fit');
    assert.equal(upstream.calls, 3);
  } finally { globalThis.fetch = realFetch; }
});
