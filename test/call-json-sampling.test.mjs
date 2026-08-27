import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callJSON } from '../worker/worker.js';

// Issue #28: the rubric/skeptic/advocate panel calls sent no `temperature` or
// `seed`, so identical job descriptions scored differently between runs —
// an 8-point swing traced to rubric wording/weight drift at the provider's
// default temperature (commonly 1.0).

function stubFetch(t, { body = '{"ok":1}' } = {}) {
  let captured;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: body } }], usage: null }) };
  };
  t.after(() => { globalThis.fetch = original; });
  return () => captured;
}

test('callJSON sends an explicit temperature instead of inheriting the provider default', async (t) => {
  const getCaptured = stubFetch(t);
  await callJSON({ OPENROUTER_API_KEY: 'k' }, 'some/model', 'system', 'user');
  assert.equal(getCaptured().temperature, 0);
});

test('callJSON sends a fixed seed as a best-effort determinism hint', async (t) => {
  const getCaptured = stubFetch(t);
  await callJSON({ OPENROUTER_API_KEY: 'k' }, 'some/model', 'system', 'user');
  assert.equal(typeof getCaptured().seed, 'number');
});
