/**
 * Mesh-stage check: node test/geometry.test.mjs
 * Verifies the skeleton actually turns into valid, finite, watertight-ish
 * buffers for every species and every leaf shape.
 */
import assert from 'node:assert/strict';
import { generateTree, rng } from '../src/tree.js';
import { SPECIES, SPECIES_KEYS, randomSpecies } from '../src/species.js';
import { buildBranchGeometry, buildLeafGeometry, leafOutline, LEAF_SHAPES, leafVeins } from '../src/geometry.js';
import { buildGrowth, MOSS_TYPES, FUNGUS_TYPES } from '../src/growth.js';

let pass = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const finite = (attr, what) => {
  const a = attr.array;
  for (let i = 0; i < a.length; i++) {
    assert.ok(Number.isFinite(a[i]), `${what}: non-finite value at ${i}`);
  }
};

/** Same as checkGeo but for buffers that carry colour instead of uv. */
const checkGeo2 = (g, what) => {
  assert.ok(g, `${what}: no geometry`);
  finite(g.getAttribute('position'), `${what} position`);
  finite(g.getAttribute('normal'), `${what} normal`);
  finite(g.getAttribute('color'), `${what} colour`);
  const n = g.getAttribute('position').count;
  const idx = g.index.array;
  assert.equal(idx.length % 3, 0, `${what}: index count not a multiple of 3`);
  let max = 0;
  for (let i = 0; i < idx.length; i++) if (idx[i] > max) max = idx[i];
  assert.ok(max < n, `${what}: index ${max} out of range (${n} vertices)`);
};

const checkGeo = (g, what) => {
  finite(g.getAttribute('position'), `${what} position`);
  finite(g.getAttribute('normal'), `${what} normal`);
  finite(g.getAttribute('uv'), `${what} uv`);
  const n = g.getAttribute('position').count;
  const idx = g.index.array;
  assert.ok(idx.length % 3 === 0, `${what}: index count not a multiple of 3`);
  let max = 0;
  for (let i = 0; i < idx.length; i++) if (idx[i] > max) max = idx[i];
  assert.ok(max < n, `${what}: index ${max} out of range (${n} vertices)`);
};

test('every leaf outline is a simple, triangulable polygon', () => {
  for (const kind of LEAF_SHAPES) {
    const { pts, cup } = leafOutline(kind);
    assert.ok(pts.length >= 6, `${kind}: too few points`);
    assert.ok(Number.isFinite(cup));
    for (const v of pts) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y), `${kind}: NaN vertex`);
      assert.ok(Math.abs(v.x) <= 0.75 && v.y >= -0.02 && v.y <= 1.02,
        `${kind}: vertex out of the unit leaf box (${v.x}, ${v.y})`);
    }
  }
});

test('branch + leaf buffers are valid for every species', () => {
  for (const k of SPECIES_KEYS) {
    const sp = SPECIES[k];
    const tree = generateTree({ ...sp.params, seed: 5, density: 0.5 });
    const bg = buildBranchGeometry(tree, { detail: 0.7 });
    checkGeo(bg, `${k} bark`);
    assert.ok(bg.getAttribute('position').count > 0, `${k}: empty bark buffer`);
    if (tree.leaves.length) {
      const lg = buildLeafGeometry(tree, { shape: sp.params.leafShape, colors: sp.palette.leaf.summer });
      checkGeo(lg, `${k} foliage`);
      finite(lg.getAttribute('color'), `${k} foliage colour`);
      assert.equal(lg.index.array.length % 3, 0);
    }
  }
});

test('every leaf shape meshes', () => {
  const tree = generateTree({ seed: 3, density: 0.15 });
  for (const shape of LEAF_SHAPES) {
    const g = buildLeafGeometry(tree, { shape, colors: ['#6f9e3a', '#4f7f2c'] });
    checkGeo(g, `leaf ${shape}`);
    assert.ok(g.index.array.length > 0, `${shape}: produced no triangles`);
  }
});

test('branch meshes are closed solids wound outward', () => {
  // Signed volume is positive only when triangles wind counter-clockwise seen
  // from outside. If it ever goes negative the trunks render inside-out.
  for (const k of ['aspen', 'oak', 'palm', 'saguaro', 'organic']) {
    const tree = generateTree({ ...SPECIES[k].params, seed: 5, density: 0.4 });
    const g = buildBranchGeometry(tree, { detail: 0.6 });
    const pos = g.getAttribute('position').array;
    const idx = g.index.array;
    let vol = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
           + pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2])
           + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    assert.ok(vol / 6 > 0, `${k}: signed volume ${(vol / 6).toFixed(3)} — mesh is inside out`);
  }
});

test('every stem is capped at both ends', () => {
  // Vertices are duplicated along the UV seam, so weld by position first; then
  // a closed surface has every edge shared by exactly two triangles.
  const tree = generateTree({ seed: 5, levels: 2, branches: [0, 3, 0, 0], leaves: 0 });
  const g = buildBranchGeometry(tree, { detail: 0.6 });
  const pos = g.getAttribute('position').array;
  const idx = g.index.array;

  const weld = new Map();
  const id = (v) => {
    const key = `${Math.round(pos[v * 3] * 1e5)},${Math.round(pos[v * 3 + 1] * 1e5)},` +
                `${Math.round(pos[v * 3 + 2] * 1e5)}`;
    if (!weld.has(key)) weld.set(key, weld.size);
    return weld.get(key);
  };

  const edges = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const t = [id(idx[i]), id(idx[i + 1]), id(idx[i + 2])];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3];
      if (a === b) continue;                       // degenerate at a cap centre
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let boundary = 0;
  for (const n of edges.values()) if (n === 1) boundary++;
  assert.equal(boundary, 0, `${boundary} unshared edges — the stems are not closed`);
});

test('every tree meets the ground on a flat base', () => {
  // A split or immediately-leaning trunk used to stand on a tilted disc, so the
  // tree looked propped up rather than planted. Each stem that starts on the
  // ground is meshed on its own here, and its bottom ring must be level and at
  // or below y = 0. (Stems higher up may lean however they like, and branches
  // are allowed to droop below ground — they get clipped at the ground plane.)
  for (const k of ['oak', 'baobab', 'palm', 'bonsai', 'maple', 'willow', 'organic']) {
    const tree = generateTree({ ...SPECIES[k].params, seed: 8, density: 0.4 });
    const trunkR = tree.branches[0].radius;
    const rooted = tree.branches.filter((b) => b.level === 0 && b.pts[0].y <= trunkR * 0.4);
    assert.ok(rooted.length > 0, `${k}: nothing is rooted at the ground`);

    for (const b of rooted) {
      // Rings are emitted from the base up, so the first ring is the foot. A
      // tilted foot shows up immediately: vertex 1 leaves vertex 0's level.
      const g = buildBranchGeometry({ ...tree, branches: [b] }, { detail: 0.7 });
      const pos = g.getAttribute('position').array;
      const y0 = pos[1];
      assert.ok(y0 <= 0.0001, `${k}: a rooted stem starts at y=${y0.toFixed(4)} — it floats`);

      const eps = Math.max(1e-5, trunkR * 1e-3);
      let n = 0;
      while (n * 3 + 1 < pos.length && Math.abs(pos[n * 3 + 1] - y0) <= eps) n++;
      assert.ok(n >= 5, `${k}: base ring is tilted — only ${n} vertices sit at its foot`);
    }
  }
});

test('geometry sits inside the skeleton bounds', () => {
  const tree = generateTree({ seed: 12, density: 0.4 });
  const g = buildBranchGeometry(tree, { detail: 1 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(b.max.y <= tree.height * 1.25 + 1, `bark reaches ${b.max.y} vs tree ${tree.height}`);
  assert.ok(b.min.y > -1, 'bark dips below the ground');
});

test('no species blows the triangle budget', () => {
  // A pathological preset (or a bad LOD change) shows up here rather than as a
  // browser that locks up on one species.
  const CEILING = 900000;
  for (const k of SPECIES_KEYS) {
    const sp = SPECIES[k];
    const tree = generateTree({ ...sp.params, seed: 7 });
    let tris = buildBranchGeometry(tree, { detail: 1 }).index.count / 3;
    if (tree.leaves.length) {
      tris += buildLeafGeometry(tree, {
        shape: sp.params.leafShape, colors: sp.palette.leaf.summer, detail: 1,
      }).index.count / 3;
    }
    assert.ok(tris <= CEILING, `${k}: ${Math.round(tris)} triangles exceeds ${CEILING}`);
  }
});

test('the universal randomiser never produces a broken or runaway tree', () => {
  const rand = rng(31337);                    // deterministic sweep of the roller
  let worst = 0, worstNote = '';
  for (let i = 0; i < 120; i++) {
    const w = randomSpecies(rand);
    const tree = generateTree(w.params);
    assert.ok(tree.branches.length > 0, 'a wild type produced no branches');
    assert.ok(tree.height > 0.2 && Number.isFinite(tree.height),
      `wild height ${tree.height}: ${w.note}`);
    assert.ok(Number.isFinite(tree.bounds.sphere) && tree.bounds.sphere > 0);

    const g = buildBranchGeometry(tree, { detail: 1 });
    checkGeo(g, 'wild bark');
    let tris = g.index.count / 3;
    if (tree.leaves.length) {
      const lg = buildLeafGeometry(tree, {
        shape: w.params.leafShape, colors: w.palette.leaf.summer, detail: 1,
      });
      checkGeo(lg, 'wild foliage');
      tris += lg.index.count / 3;
    }
    if (tris > worst) { worst = tris; worstNote = w.note; }
  }
  assert.ok(worst <= 900000,
    `wild type hit ${Math.round(worst)} triangles (${worstNote})`);
});

test('every leaf shape names a venation pattern that exists', () => {
  const known = new Set(['pinnate', 'palmate', 'parallel', 'petal', 'plain']);
  for (const shape of LEAF_SHAPES) {
    assert.ok(known.has(leafVeins(shape)), `${shape}: unknown vein style ${leafVeins(shape)}`);
  }
});

test('moss and fungus build valid geometry for every form', () => {
  const tree = generateTree({ ...SPECIES.oak.params, seed: 5, density: 0.4 });
  for (const moss of MOSS_TYPES) {
    const g = buildGrowth(tree, {
      enabled: true, detail: 0.6,
      moss: { on: true, type: moss, amount: 0.5 },
      fungus: { on: false },
    });
    assert.ok(g.counts.moss > 0, `${moss}: nothing grew`);
    checkGeo2(g.moss, `moss ${moss}`);
  }
  for (const fungus of FUNGUS_TYPES) {
    const g = buildGrowth(tree, {
      enabled: true, detail: 0.6,
      moss: { on: false },
      fungus: { on: true, type: fungus, amount: 0.5 },
    });
    assert.ok(g.counts.fungus > 0, `${fungus}: nothing grew`);
    checkGeo2(g.fungus, `fungus ${fungus}`);
  }
});

test('epiphyte coverage follows the amount slider and respects its cap', () => {
  const tree = generateTree({ ...SPECIES.oak.params, seed: 5 });
  const at = (a) => buildGrowth(tree, {
    enabled: true, detail: 0.6, moss: { amount: a }, fungus: { amount: a },
  }).counts;
  const lo = at(0.15), hi = at(0.9);
  assert.ok(lo.moss < hi.moss, `moss did not scale: ${lo.moss} -> ${hi.moss}`);
  assert.ok(lo.fungus < hi.fungus, `fungus did not scale: ${lo.fungus} -> ${hi.fungus}`);
  assert.ok(hi.moss <= 2600 && hi.fungus <= 260, 'epiphyte caps exceeded');
  const off = buildGrowth(tree, { enabled: false });
  assert.equal(off.moss, null);
  assert.equal(off.counts.moss, 0);
});

test('detail level scales the vertex count', () => {
  const tree = generateTree({ seed: 2, density: 0.4 });
  const lo = buildBranchGeometry(tree, { detail: 0.4 }).getAttribute('position').count;
  const hi = buildBranchGeometry(tree, { detail: 1.4 }).getAttribute('position').count;
  assert.ok(hi > lo * 1.5, `detail did not scale: ${lo} -> ${hi}`);
});

console.log(`\n${pass} checks passed`);
