import { assertFullCoverage } from '../worker/worker.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const rubric = [
  { id: 'c1', label: 'Go infra',   weight: 3, requires: 'x' },
  { id: 'c2', label: 'RAG',        weight: 2, requires: 'x' },
  { id: 'c3', label: 'Leadership', weight: 1, requires: 'x' },
];

test('full coverage does not throw', () => {
  const scored = [{ id: 'c1', score: 40 }, { id: 'c2', score: 71 }, { id: 'c3', score: 10 }];
  assert.doesNotThrow(() => assertFullCoverage(rubric, scored, 'skeptic'));
});

// This is the shape a refusal or unparseable model reply collapses to —
// normalizeScores([]) — which is exactly what silently produced skeptic:0 on
// every criterion in production (id 200 in the visitor log: all five
// skepticNotes were "").
test('empty scores (refusal / unparseable reply) throws, naming all ids missing', () => {
  assert.throws(
    () => assertFullCoverage(rubric, [], 'skeptic'),
    /skeptic scorer missing 3\/3 criteria \(ids: c1,c2,c3\)/
  );
});

test('partial coverage throws, naming only the missing ids', () => {
  const scored = [{ id: 'c1', score: 40 }, { id: 'c3', score: 10 }];
  assert.throws(
    () => assertFullCoverage(rubric, scored, 'advocate'),
    /advocate scorer missing 1\/3 criteria \(ids: c2\)/
  );
});

test('extra ids beyond the rubric are ignored', () => {
  const scored = [{ id: 'c1', score: 40 }, { id: 'c2', score: 71 }, { id: 'c3', score: 10 }, { id: 'c4', score: 99 }];
  assert.doesNotThrow(() => assertFullCoverage(rubric, scored, 'skeptic'));
});
