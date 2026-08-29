import { handleLog } from '../worker/worker.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// A fake D1 binding that records the params bound to the last INSERT, the
// same shape env.DB has in production (prepare().bind(...).run()).
function fakeDB() {
  const db = { lastBind: null };
  db.prepare = () => ({
    bind: (...args) => { db.lastBind = args; return { run: async () => {} }; }
  });
  return db;
}

function postLog(body) {
  return new Request('https://worker.test/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// logRow's bind order: ts, question, outcome, country, ua, session_id,
// visitor_name, visitor_co, response.
const RESPONSE_COL = 8;

test('an error row stores the failure reason in the response column', async () => {
  const env = { DB: fakeDB() };
  await handleLog(postLog({
    question: 'how do you evaluate a chatbot',
    outcome: 'error',
    session_id: 's1',
    response: 'generator returned 502'
  }), env);
  assert.equal(env.DB.lastBind[RESPONSE_COL], 'generator returned 502');
});

test('a refused row with no response logs null, not the string "undefined"', async () => {
  const env = { DB: fakeDB() };
  await handleLog(postLog({ question: 'what is the capital of france', outcome: 'refused', session_id: 's1' }), env);
  assert.equal(env.DB.lastBind[RESPONSE_COL], null);
});

test('an oversized response is truncated before it reaches the row', async () => {
  const env = { DB: fakeDB() };
  const huge = 'x'.repeat(2000);
  await handleLog(postLog({ question: 'q', outcome: 'error', session_id: 's1', response: huge }), env);
  assert.ok(env.DB.lastBind[RESPONSE_COL].length <= 500);
});
