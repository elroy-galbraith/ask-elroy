import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSynthetic, logRow } from '../worker/worker.js';

test('isSynthetic recognizes the reserved session_id prefix', () => {
  assert.equal(isSynthetic('synthetic-deploy-check'), true);
  assert.equal(isSynthetic('synthetic-' + 'x'.repeat(40)), true);
});

test('isSynthetic rejects a normal session id', () => {
  assert.equal(isSynthetic('3f7b1c2e-9c1d-4a2b-9e2f-1234567890ab'), false);
});

test('isSynthetic rejects missing or non-string session ids', () => {
  assert.equal(isSynthetic(null), false);
  assert.equal(isSynthetic(undefined), false);
  assert.equal(isSynthetic(42), false);
});

function stubDB() {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind: (...args) => {
            calls.push({ sql, args });
            return { run: async () => {} };
          }
        };
      }
    }
  };
  return { env, calls };
}

const fakeRequest = { headers: { get: () => null } };

test('logRow persists is_synthetic=1 for a synthetic session', async () => {
  const { env, calls } = stubDB();
  await logRow(env, fakeRequest, 'q', 'answered', 'synthetic-smoke-test', null, null, null);
  const { sql, args } = calls[0];
  assert.match(sql, /is_synthetic/);
  assert.equal(args[args.length - 1], 1);
});

test('logRow persists is_synthetic=0 for a real visitor session', async () => {
  const { env, calls } = stubDB();
  await logRow(env, fakeRequest, 'q', 'answered', 'a-real-uuid', null, null, null);
  const { args } = calls[0];
  assert.equal(args[args.length - 1], 0);
});
