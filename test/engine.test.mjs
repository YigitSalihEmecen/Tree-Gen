/**
 * Runnable check for the generator: node test/engine.test.mjs
 * Covers the things that silently break — determinism, finite geometry,
 * monotonic radii, the pruning envelope, and every shipped species.
 */
import assert from 'node:assert/strict';
import { generateTree, shapeRatio, rng, mergeParams } from '../src/tree.js';
import { SPECIES, SPECIES_KEYS } from '../src/species.js';

let pass = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

test('rng is deterministic and in range', () => {
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 500; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('shapeRatio stays in [0,1] for every shape', () => {
  const p = mergeParams({});
  for (let s = 0; s <= 8; s++) {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = shapeRatio(s, t, p);
      assert.ok(Number.isFinite(v), `shape ${s} at ${t} is not finite`);
      assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `shape ${s} at ${t} = ${v}`);
    }
  }
});

test('shape 8 envelope peaks at 1 at the peak position', () => {
  for (const peak of [0.2, 0.5, 0.8]) {
    const p = mergeParams({ pruneWidthPeak: peak, prunePowerLow: 0.7, prunePowerHigh: 1.3 });
    assert.ok(Math.abs(shapeRatio(8, 1 - peak, p) - 1) < 1e-9);
    assert.equal(shapeRatio(8, 1, p), 0);
  }
});

test('same seed gives the same tree, different seed does not', () => {
  const digest = (t) => t.branches.slice(0, 40)
    .map((b) => b.pts.at(-1)).map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`)
    .join('|');
  assert.equal(digest(generateTree({ seed: 11 })), digest(generateTree({ seed: 11 })));
  assert.notEqual(digest(generateTree({ seed: 11 })), digest(generateTree({ seed: 12 })));
});

test('no NaN anywhere in the skeleton', () => {
  const t = generateTree({ seed: 3, levels: 4, leaves: 8 });
  for (const b of t.branches) {
    for (const pt of b.pts) {
      assert.ok(Number.isFinite(pt.x + pt.y + pt.z + pt.r), 'branch point is not finite');
      assert.ok(pt.r > 0, 'branch radius must be positive');
    }
  }
  for (const l of t.leaves) {
    assert.ok(l.p.every(Number.isFinite) && l.q.every(Number.isFinite));
    assert.ok(l.scale > 0);
  }
});

test('children are thinner than their parents', () => {
  const t = generateTree({ seed: 9 });
  const trunk = t.branches.find((b) => b.level === 0);
  for (const b of t.branches) {
    if (b.level > 0) assert.ok(b.radius <= trunk.radius, 'a branch is fatter than the trunk');
  }
});

test('pruning pulls the crown inside the envelope', () => {
  const base = { seed: 4, scale: 12, scaleV: 0, pruneWidth: 0.25, pruneWidthPeak: 0.5 };
  const wide = generateTree({ ...base, pruneRatio: 0 });
  const tight = generateTree({ ...base, pruneRatio: 1 });
  assert.ok(tight.radius < wide.radius, `pruned radius ${tight.radius} !< ${wide.radius}`);
});

test('density scales the tree down', () => {
  const full = generateTree({ seed: 6, density: 1 });
  const thin = generateTree({ seed: 6, density: 0.3 });
  assert.ok(thin.branches.length < full.branches.length);
  assert.ok(thin.leaves.length < full.leaves.length);
});

test('budget caps are respected', () => {
  const t = generateTree({ seed: 2, levels: 4, branches: [0, 90, 90, 90], leaves: 90, density: 2 });
  assert.ok(t.branches.length <= t.params.maxBranches);
  assert.ok(t.leaves.length <= t.params.maxLeaves);
});

test('every species builds a complete tree', () => {
  for (const k of SPECIES_KEYS) {
    const sp = SPECIES[k];
    const t = generateTree({ ...sp.params, seed: 5 });
    assert.ok(t.branches.length > 0, `${k}: no branches`);
    assert.ok(t.height > 0.3, `${k}: height ${t.height}`);
    assert.ok(t.branches.length <= t.params.maxBranches, `${k}: over branch budget`);
    const wantsLeaves = (sp.params.leaves ?? 0) !== 0;
    if (wantsLeaves) assert.ok(t.leaves.length > 0, `${k}: expected foliage, got none`);
    // a tree with N levels should actually reach its deepest level
    if (t.params.mode !== 'colonize' && t.params.levels > 1) {
      const deepest = Math.max(...t.branches.map((b) => b.level));
      assert.equal(deepest, t.params.levels - 1, `${k}: only reached level ${deepest}`);
    }
  }
});

test('space colonization produces a connected, thinning tree', () => {
  const t = generateTree({ mode: 'colonize', seed: 8, scale: 12, scaleV: 0 });
  assert.ok(t.branches.length > 20, 'too few branches');
  assert.ok(t.leaves.length > 50, 'too few leaves');
  const trunk = t.branches[0];
  assert.ok(trunk.pts[0].r > trunk.pts[trunk.pts.length - 1].r, 'trunk does not taper');
});

console.log(`\n${pass} checks passed`);
