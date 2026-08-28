import { systemFitFor } from '../worker/worker.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('hasStrongMatch true requires the Strong matches paragraph', () => {
  const sys = systemFitFor(true);
  assert.match(sys, /"Strong matches:"/);
  assert.doesNotMatch(sys, /does not clear a strong-fit bar/);
});

test('hasStrongMatch undefined preserves the old unconditional behaviour', () => {
  const sys = systemFitFor(undefined);
  assert.match(sys, /"Strong matches:"/);
});

test('hasStrongMatch false drops the Strong matches paragraph and forces an honest opening', () => {
  const sys = systemFitFor(false);
  assert.doesNotMatch(sys, /"Strong matches:"/);
  assert.match(sys, /"Areas to discuss:"/);
  assert.match(sys, /"Overall take:"/);
  assert.match(sys, /does not clear a strong-fit bar/);
});

test('rule 9 (consistency with the assessment block) is unchanged either way', () => {
  assert.match(systemFitFor(true), /MUST be consistent with its tier and per-criterion scores/);
  assert.match(systemFitFor(false), /MUST be consistent with its tier and per-criterion scores/);
});
