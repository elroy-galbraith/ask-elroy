import { reconcile } from '../worker/worker.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const rubric = [
  { id: 'c1', label: 'Go infra',   weight: 3, requires: 'x' },
  { id: 'c2', label: 'RAG',        weight: 2, requires: 'x' },
  { id: 'c3', label: 'Leadership', weight: 1, requires: 'x' },
];
const skeptic = [
  { id: 'c1', score: 40, gap: false, note: 'thin [2]' },
  { id: 'c2', score: 71, gap: false, note: 'ok [1]' },
  { id: 'c3', score: 10, gap: true,  note: 'none' },
];
const advocate = [
  { id: 'c1', score: 78, gap: false, note: 'adjacent [2][5]' },
  { id: 'c2', score: 89, gap: false, note: 'strong [1]' },
  { id: 'c3', score: 30, gap: false, note: 'some [3]' },
];

test('weighted overall, tier, and flags', () => {
  const r = reconcile(rubric, skeptic, advocate);
  // midpoints: c1=59, c2=80, c3=20 ; weighted (3*59+2*80+1*20)/6 = 357/6 = 59.5 -> 60
  assert.equal(r.overall, 60);
  assert.equal(r.tier, 'Moderate fit');
  assert.equal(r.criteria[0].midpoint, 59);
  assert.equal(r.criteria[0].contested, true);   // |78-40| = 38 >= 30
  assert.equal(r.criteria[1].contested, false);  // |89-71| = 18
  assert.equal(r.criteria[2].gap, true);         // midpoint 20 < 40, and skeptic gap
});

test('tiers at the boundaries and out-of-range scores clamp', () => {
  const one = [{ id: 'c1', label: 'x', weight: 1, requires: 'x' }];
  const strong = reconcile(one, [{ id: 'c1', score: 999 }], [{ id: 'c1', score: 60 }]);
  assert.equal(strong.criteria[0].skeptic, 100); // clamped
  assert.equal(strong.overall, 80);
  assert.equal(strong.tier, 'Strong fit');
  const partial = reconcile(one, [{ id: 'c1', score: 20 }], [{ id: 'c1', score: 40 }]);
  assert.equal(partial.tier, 'Partial fit'); // midpoint 30 < 50
});

test('a spread below the gap line is a gap, not a contest', () => {
  const one = [{ id: 'c1', label: 'Power BI', weight: 3, requires: 'x' }];
  // The CIBC case: skeptic 0 / advocate 35. |35-0| = 35 >= 30, but neither lens
  // is above gapBelow (40) — they agree there is no evidence.
  const floor = reconcile(one, [{ id: 'c1', score: 0 }], [{ id: 'c1', score: 35 }]);
  assert.equal(floor.criteria[0].contested, false);
  assert.equal(floor.criteria[0].gap, true);

  // One lens above the line is real disagreement and still reads as contested.
  const real = reconcile(one, [{ id: 'c1', score: 20 }], [{ id: 'c1', score: 70 }]);
  assert.equal(real.criteria[0].contested, true);

  // gap set by a lens, not by the midpoint, does not suppress contested either.
  const flagged = reconcile(one, [{ id: 'c1', score: 45, gap: true }], [{ id: 'c1', score: 90 }]);
  assert.equal(flagged.criteria[0].contested, true);
  assert.equal(flagged.criteria[0].gap, true);
});

test('floor tier: below 30 is "Not a fit", not another shade of partial', () => {
  const one = [{ id: 'c1', label: 'x', weight: 1, requires: 'x' }];
  const belowFloor = reconcile(one, [{ id: 'c1', score: 0 }], [{ id: 'c1', score: 14 }]);
  assert.equal(belowFloor.overall, 7);
  assert.equal(belowFloor.tier, 'Not a fit');

  const atFloor = reconcile(one, [{ id: 'c1', score: 20 }], [{ id: 'c1', score: 40 }]); // overall 30
  assert.equal(atFloor.overall, 30);
  assert.equal(atFloor.tier, 'Partial fit');

  const justBelowFloor = reconcile(one, [{ id: 'c1', score: 19 }], [{ id: 'c1', score: 39 }]); // overall 29
  assert.equal(justBelowFloor.overall, 29);
  assert.equal(justBelowFloor.tier, 'Not a fit');
});

test('a mid-40s score still reads as a genuine partial fit', () => {
  const one = [{ id: 'c1', label: 'x', weight: 1, requires: 'x' }];
  const midForties = reconcile(one, [{ id: 'c1', score: 40 }], [{ id: 'c1', score: 50 }]); // overall 45
  assert.equal(midForties.overall, 45);
  assert.equal(midForties.tier, 'Partial fit');
});

test('hasStrongMatch reflects per-criterion midpoints, not the weighted overall', () => {
  const rubric2 = [
    { id: 'c1', label: 'a', weight: 3, requires: 'x' },
    { id: 'c2', label: 'b', weight: 1, requires: 'x' },
  ];
  // one strong pillar (c1 midpoint 70) dragged down by a weak c2 (midpoint 10)
  const mixed = reconcile(
    rubric2,
    [{ id: 'c1', score: 60 }, { id: 'c2', score: 0 }],
    [{ id: 'c1', score: 80 }, { id: 'c2', score: 20 }]
  );
  assert.equal(mixed.criteria[0].midpoint, 70);
  assert.equal(mixed.hasStrongMatch, true);

  const noneStrong = reconcile(
    rubric2,
    [{ id: 'c1', score: 20 }, { id: 'c2', score: 10 }],
    [{ id: 'c1', score: 40 }, { id: 'c2', score: 20 }]
  );
  assert.ok(noneStrong.criteria.every(c => c.midpoint < 50));
  assert.equal(noneStrong.hasStrongMatch, false);
});
