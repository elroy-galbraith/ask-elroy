import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jdTooThin } from '../worker/worker.js';

/* The floor from issue #25: a Fit submission costs two paid model passes, so
   /fit and /fit/score must reject what cannot be a job description before
   spending anything — and must not reject a terse but real posting. */

test('a single word is too thin', () => {
  assert.equal(jdTooThin('Engineer'), true);
});

test('a role title alone is too thin, with or without its trimmings', () => {
  assert.equal(jdTooThin('Senior Machine Learning Engineer'), true);
  assert.equal(jdTooThin('Data Scientist, Tokyo'), true);
  assert.equal(jdTooThin('Backend Engineer (Remote)'), true);
});

test('empty and whitespace-only input is too thin', () => {
  assert.equal(jdTooThin(''), true);
  assert.equal(jdTooThin('   \n\t  '), true);
  assert.equal(jdTooThin(null), true);
  assert.equal(jdTooThin(undefined), true);
});

test('the short-but-real posting from the smoke test still scores', () => {
  assert.equal(
    jdTooThin('Senior Go engineer building RAG systems; must lead a small team.'),
    false
  );
});

test('a full job description scores', () => {
  const jd = 'About the role: we are hiring a senior backend engineer to own our ' +
    'retrieval platform. What you will do: build and operate Go services on GCP. ' +
    'Requirements: 8+ years of experience, strong Go, production LLM work.';
  assert.equal(jdTooThin(jd), false);
});

/* Words OR characters: a CJK posting carries its substance without spaces, so a
   word count alone would refuse every Japanese job description outright. */
test('a Japanese role title is too thin', () => {
  assert.equal(jdTooThin('シニアバックエンドエンジニア'), true);
  assert.equal(jdTooThin('機械学習エンジニア（東京・フルタイム）'), true);
});

test('a Japanese job description scores', () => {
  const jd = '募集職種：シニアバックエンドエンジニア。業務内容：GCP上でGoによる検索基盤の設計' +
    '・開発・運用を担当していただきます。応募要件：バックエンド開発の実務経験8年以上、' +
    'Goでの本番運用経験、LLMを用いたシステムの開発経験。雇用形態：正社員（フルタイム）。';
  assert.equal(jdTooThin(jd), false);
});

/* The floor is a floor, not a classifier. Prose of real length is admitted and
   left to the model to answer honestly — refusing it would mean guessing at
   whether a posting written in unfamiliar vocabulary is genuine. */
test('long non-JD prose is admitted rather than second-guessed', () => {
  assert.equal(
    jdTooThin('I was reading about how you built this and wondered how the retrieval side holds up.'),
    false
  );
});
