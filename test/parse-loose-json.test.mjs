import { parseLooseJSON } from '../worker/worker.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('plain JSON array', () => {
  assert.deepEqual(parseLooseJSON('[{"id":"c1","score":90}]'), [{ id: 'c1', score: 90 }]);
});

test('fenced JSON', () => {
  assert.deepEqual(parseLooseJSON('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
});

test('leading prose then JSON', () => {
  assert.deepEqual(parseLooseJSON('Here is the result: [{"x":1},{"y":2}]'), [{ x: 1 }, { y: 2 }]);
});

// Reproduces the production 502: model emits valid JSON, then a prose sentence
// that itself contains a brace. The old lastIndexOf("}") slice swept the prose in.
test('JSON followed by trailing prose containing a brace', () => {
  const s = '[{"id":"c1","score":90}]\n\nNote: scored per the rubric {strict interpretation}.';
  assert.deepEqual(parseLooseJSON(s), [{ id: 'c1', score: 90 }]);
});

test('object whose string values contain brackets and braces', () => {
  assert.deepEqual(
    parseLooseJSON('prefix {"note":"cite [2] and literal }{ chars"} trailing text'),
    { note: 'cite [2] and literal }{ chars' }
  );
});

test('escaped quote inside a string value', () => {
  assert.deepEqual(parseLooseJSON('[{"note":"he said \\"hi\\" once"}] and more'), [
    { note: 'he said "hi" once' },
  ]);
});

test('no JSON present throws', () => {
  assert.throws(() => parseLooseJSON('there is no json here at all'));
});

test('unterminated JSON throws (no complete value)', () => {
  assert.throws(() => parseLooseJSON('[{"id":"c1", "score": 90'));
});
