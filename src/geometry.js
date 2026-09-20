/**
 * geometry.js — turns a tree skeleton into three.js meshes.
 *
 * Branches are generalized cylinders: the polyline is resampled with a
 * Catmull-Rom spline, swept with parallel-transport frames (no twisting), and
 * modulated by Weber & Penn's flare and lobe equations plus a little noise.
 * Leaves are real polygons (outline -> ShapeUtils.triangulateShape -> cupped in
 * 3D), merged into one buffer so the whole canopy is a single draw call.
 */

import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------- branches --- */

function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t +
    (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out;
}

/** Smooth a branch polyline and carry the radius along with it. */
function resample(pts, subdiv) {
  if (pts.length < 2) return pts.map((p) => ({ v: V(p.x, p.y, p.z), r: p.r }));
  const n = pts.length;
  const get = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const steps = i === n - 2 ? subdiv + 1 : subdiv;
    for (let s = 0; s < steps; s++) {
      const t = s / subdiv;
      const v = catmull(get(i - 1), get(i), get(i + 1), get(i + 2), t, V());
      const p0 = get(i - 1).r, p1 = get(i).r, p2 = get(i + 1).r, p3 = get(i + 2).r;
      const t2 = t * t, t3 = t2 * t;
      const r = 0.5 * (2 * p1 + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      out.push({ v, r: Math.max(1e-5, r) });
    }
  }
  return out;
}

const hash1 = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * @param {object} tree  output of generateTree()
 * @param {object} o     { detail, radialMin, radialMax, subdiv, barkNoise, tiling }
 */
export function buildBranchGeometry(tree, o = {}) {
  const detail = o.detail ?? 1;
  const subdiv = Math.max(1, Math.round((o.subdiv ?? 3) * detail));
  const barkNoise = o.barkNoise ?? 0.06;
  const tiling = o.tiling ?? 2.2;
  const p = tree.params;
  const trunkLength = tree.branches.length ? tree.branches[0].length : 1;
  const trunkRadius = tree.branches.length ? tree.branches[0].radius : 1;

  const pos = [], nrm = [], uv = [];
  const idx = [];
  let base = 0;

  // --- plan first -----------------------------------------------------------
  // Work out what every branch would cost, and if the total is runaway (a wild
  // parameter set can ask for millions of triangles) scale the whole tree's
  // tessellation down rather than letting one tree swamp the renderer.
  const plan = new Array(tree.branches.length);
  let estimate = 0;
  for (let bi = 0; bi < tree.branches.length; bi++) {
    const b = tree.branches[bi];
    const rel = Math.min(1, b.radius / (trunkRadius || 1));
    const sub = b.pts.length >= 24 ? 1
      : b.level === 0 ? subdiv + 1
      : b.pts.length >= 9 ? 1
      : rel > 0.08 ? subdiv : 1;
    let seg = Math.max(3, Math.min(24, Math.round(
      (3 + 14 * Math.pow(rel, 0.45)) * (o.radialScale ?? 1) * detail)));
    if (p.lobes && p.lobeDepth > 0.005 && b.level === 0) seg = Math.max(seg, p.lobes * 4);
    const rings = (b.pts.length - 1) * sub + 1 + (b.attachRadius > 0 ? 1 : 0);
    plan[bi] = { sub, seg, rel };
    estimate += rings * (seg + 1);
  }
  const budget = o.vertexBudget ?? 260000;
  const shrink = estimate > budget ? Math.sqrt(budget / estimate) : 1;

  for (let bi = 0; bi < tree.branches.length; bi++) {
    const b = tree.branches[bi];
    // Level of detail is driven by how thick the branch actually is, not by its
    // level: a fat level-2 limb deserves more sides than a hair-thin level-1 whip.
    // Spline smoothing only pays off on a branch thick enough to show a
    // silhouette, and only if it is not already finely segmented.
    const sub = Math.max(1, Math.round(plan[bi].sub * shrink));
    const line = resample(b.pts, sub);
    if (line.length < 2) continue;

    // Bury the base of a stem inside the wood it grows from. Without this the
    // first ring sits exactly on the parent's centreline and the joint shows as
    // a slot wherever the two tubes meet at an angle.
    // A stem that starts on the ground has to meet it flat, whatever direction
    // it then leans in. Base splits and an immediate trunk curve both tilt the
    // first ring, which leaves the tree balanced on the edge of a disc.
    const rooted = b.level === 0 && line[0].v.y <= Math.max(0.03, trunkRadius * 0.4);
    const attach = b.attachRadius || 0;
    // A clone is the same stem carrying on past a fork, not a new limb growing
    // out of one. Giving it a collar puts a bulge halfway up the trunk.
    const collar = b.isClone ? 0 : attach;

    if (rooted) {
      // Straight down, so the first ring lies level however the stem leans.
      // A stem standing in the ground is not buried in a parent, so this
      // replaces the burial below rather than stacking with it — doing both
      // shoved split trunks down their own tilted axis and left the tree
      // balanced on a ragged edge.
      line.unshift({
        v: new THREE.Vector3(line[0].v.x,
          -Math.min(0.06, Math.max(0.012, line[0].r * 0.15)), line[0].v.z),
        r: line[0].r,
      });
    } else if (attach > 0) {
      const back = line[0].v.clone().sub(line[1].v);
      const room = Math.max(0.12, Math.min(1, 1 - line[0].r / attach));
      if (back.lengthSq() > 1e-12) {
        line.unshift({ v: line[0].v.clone().addScaledVector(back.normalize(), attach * 0.8 * room),
                       r: line[0].r });
      }
    }

    // A lobed cross-section needs a few samples per lobe or the ribs alias into
    // a flat-sided polygon.
    let seg = Math.max(3, Math.round(plan[bi].seg * shrink));
    if (p.lobes && p.lobeDepth > 0.005 && b.level === 0) seg = Math.max(seg, p.lobes * 3);

    // --- parallel-transport frames (minimal rotation => no twist) ----------
    const dirs = [], rights = [], ups = [];
    for (let i = 0; i < line.length; i++) {
      const a = line[Math.max(0, i - 1)].v, c = line[Math.min(line.length - 1, i + 1)].v;
      const d = c.clone().sub(a);
      if (d.lengthSq() < 1e-12) d.set(0, 1, 0);
      dirs.push(d.normalize());
    }
    // the buried stub runs straight down, so its ring lies flat on the ground
    if (rooted) dirs[0].set(0, 1, 0);
    let right = Math.abs(dirs[0].y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0).cross(dirs[0]).normalize();
    for (let i = 0; i < line.length; i++) {
      if (i > 0) {
        const q = new THREE.Quaternion().setFromUnitVectors(dirs[i - 1], dirs[i]);
        right = right.applyQuaternion(q).normalize();
      }
      right = right.clone().sub(dirs[i].clone().multiplyScalar(right.dot(dirs[i]))).normalize();
      rights.push(right.clone());
      ups.push(dirs[i].clone().cross(right).normalize());
    }

    // --- rings --------------------------------------------------------------
    let run = 0;
    for (let i = 0; i < line.length; i++) {
      if (i > 0) run += line[i].v.distanceTo(line[i - 1].v);
      let r = line[i].r;

      // Branch collar: real wood swells where a limb leaves its parent, and the
      // swelling is what visually welds the two tubes together. Sized in metres
      // off the parent's radius, not in normalised t, so it works at any scale.
      if (collar > 0) {
        const reach = collar * 1.9;
        if (run < reach) {
          const k = 1 - run / reach;
          // Never thicker than the wood it comes out of — a collar that beats
          // the parent's own radius reads as a tumour, not a joint.
          const target = Math.min(collar * 0.95, Math.max(r * 1.15, r + collar * 0.22));
          if (target > r) r += (target - r) * k * k;
        }
      }

      // Weber & Penn flare: exponential expansion at the FOOT OF THE TREE.
      // Keyed to world height, not to distance along this stem — a trunk that
      // forks and carries on is not a second tree, and measuring along the stem
      // gave every fork its own root flare partway up the trunk.
      let flare = 1;
      if (b.level === 0 && p.flare) {
        // clamped at 1: the buried stub sits below y = 0 and would otherwise
        // run the exponential away
        const y = Math.min(1, Math.max(0, 1 - 8 * (line[i].v.y / trunkLength)));
        flare = p.flare * (Math.pow(100, y) - 1) / 100 + 1;
      }

      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        // lobes: sinusoidal cross-section, the cypress-knee / cactus-rib effect
        const lobe = p.lobes ? 1 + p.lobeDepth * Math.sin(p.lobes * a) : 1;
        // j % seg, not j: the last vertex of a ring is the first one again, and
        // if the noise disagrees between them the tube splits along the UV seam.
        const n = 1 + barkNoise * (hash1(bi * 31.7 + i * 7.3 + (j % seg) * 2.1) - 0.5) *
          (b.level === 0 ? 1 : 0.5);
        const rr = r * flare * lobe * n;
        const dx = rights[i].x * Math.cos(a) + ups[i].x * Math.sin(a);
        const dy = rights[i].y * Math.cos(a) + ups[i].y * Math.sin(a);
        const dz = rights[i].z * Math.cos(a) + ups[i].z * Math.sin(a);
        pos.push(line[i].v.x + dx * rr, line[i].v.y + dy * rr, line[i].v.z + dz * rr);
        nrm.push(dx, dy, dz);
        uv.push((j / seg) * tiling * Math.max(0.35, b.radius * 9), run * tiling * 0.5);
      }
    }
    // Rings wind counter-clockwise about the sweep direction, so the triangle
    // order below is what puts the front face on the OUTSIDE of the tube.
    for (let i = 0; i < line.length - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j, c = a + seg + 1;
        idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
    }
    const firstRing = base;
    base += line.length * (seg + 1);

    // --- close the tip ------------------------------------------------------
    const last = line[line.length - 1];
    const tipDir = dirs[dirs.length - 1];
    const tip = last.v.clone().add(tipDir.clone().multiplyScalar(last.r * 1.6));
    pos.push(tip.x, tip.y, tip.z);
    nrm.push(tipDir.x, tipDir.y, tipDir.z);
    uv.push(0.5, run * tiling * 0.5);
    const tipIdx = base;
    const lastRing = base - (seg + 1);
    for (let j = 0; j < seg; j++) idx.push(lastRing + j, lastRing + j + 1, tipIdx);
    base += 1;

    // --- close the base, so each stem is a solid rather than an open tube ----
    pos.push(line[0].v.x, line[0].v.y, line[0].v.z);
    nrm.push(-dirs[0].x, -dirs[0].y, -dirs[0].z);
    uv.push(0.5, 0);
    const baseIdx = base;
    for (let j = 0; j < seg; j++) idx.push(baseIdx, firstRing + j + 1, firstRing + j);
    base += 1;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1)
                                    : new THREE.Uint16BufferAttribute(idx, 1));
  // The swept normals are already exact and identical on both copies of the
  // seam vertex; computeVertexNormals() would average them apart and leave a
  // lit stripe down every trunk.
  return g;
}

/* ---------------------------------------------------------------- leaves -- */

/* Leaf outlines.
   `w(t)` is the half-width at fractional length t, `off(t)` shifts the midrib
   sideways (sickle shapes), `cup` bows the blade across its width, `droop`
   arches it along its length, `vein` picks the venation pattern drawn on it. */

const saw = (x) => 2 * Math.abs(x - Math.floor(x + 0.5));      // 0..1 triangle wave
const spike = (x, k) => Math.pow(saw(x), k);

const PROFILES = {
  round:      { w: (t) => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.5), cup: 0.18 },
  oval:       { w: (t) => 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.62), cup: 0.2 },
  elliptic:   { w: (t) => 0.4 * Math.pow(Math.sin(Math.PI * t), 0.7), cup: 0.22 },
  ovate:      { w: (t) => 0.46 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.66), cup: 0.2 },
  obovate:    { w: (t) => 0.44 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.38)), 0.6), cup: 0.2 },
  spatulate:  { w: (t) => 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.95)), 0.48), cup: 0.24 },
  lanceolate: { w: (t) => 0.3 * Math.pow(Math.sin(Math.PI * t), 1.5), cup: 0.3 },
  linear:     { w: (t) => 0.095 * Math.pow(Math.sin(Math.PI * t), 0.16), cup: 0.42, n: 10 },
  falcate:    { w: (t) => 0.26 * Math.pow(Math.sin(Math.PI * t), 1.2),
                off: (t) => 0.26 * Math.sin(Math.PI * t) * t, cup: 0.3, n: 14 },
  cordate:    { w: (t) => 0.52 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3)), 0.55),
                cup: 0.24, vein: 'palmate' },
  reniform:   { w: (t) => 0.62 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.52)), 0.44),
                cup: 0.3, vein: 'palmate' },
  deltoid:    { w: (t) => 0.5 * Math.pow(1 - t, 0.82), cup: 0.24, vein: 'palmate', n: 12 },
  sagittate:  { w: (t) => 0.32 * Math.pow(Math.sin(Math.PI * t), 0.8) +
                          0.3 * Math.exp(-Math.pow((t - 0.05) / 0.07, 2)),
                cup: 0.26, vein: 'palmate', n: 22 },
  oak:        { w: (t) => 0.42 * Math.pow(Math.sin(Math.PI * t), 0.62) *
                          (1 + 0.42 * Math.sin(9 * Math.PI * t + 1.2)), cup: 0.26 },
  serrate:    { w: (t) => 0.4 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.6) *
                          (1 + 0.15 * spike(t * 13, 0.8)), cup: 0.22, n: 30 },
  dentate:    { w: (t) => 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.6) *
                          (1 + 0.3 * spike(t * 8, 1.4)), cup: 0.22, n: 26 },
  holly:      { w: (t) => 0.36 * Math.pow(Math.sin(Math.PI * t), 0.5) *
                          (1 + 0.62 * spike(t * 5.5 + 0.2, 0.35)), cup: 0.3, n: 34 },
  needle:     { w: (t) => 0.11 * Math.pow(Math.sin(Math.PI * t), 0.22),
                cup: 0.5, n: 8, vein: 'plain' },
  scale:      { w: (t) => 0.34 * Math.pow(Math.sin(Math.PI * t), 0.4),
                cup: 0.35, n: 8, vein: 'plain' },
  frond:      { w: (t) => 0.36 * Math.pow(Math.sin(Math.PI * t), 0.75) *
                          (0.42 + 0.58 * Math.abs(Math.sin(24 * Math.PI * t))),
                cup: 0.55, droop: 0.42, n: 48, vein: 'parallel' },
  pinnate:    { w: (t) => 0.4 * Math.pow(Math.sin(Math.PI * t), 0.7) *
                          (0.4 + 0.6 * Math.abs(Math.sin(11 * Math.PI * t))),
                cup: 0.3, droop: 0.12, n: 30 },
  bipinnate:  { w: (t) => 0.34 * Math.pow(Math.sin(Math.PI * t), 0.7) *
                          (0.22 + 0.78 * Math.abs(Math.sin(29 * Math.PI * t))),
                cup: 0.3, droop: 0.16, n: 60 },
};

/** Rosette leaves (maple, sycamore), compound leaflets and blossoms. */
const ROSETTES = {
  maple:      { lobes: 5, inner: 0.34, sharp: 0.45, cup: 0.22, vein: 'palmate' },
  palmate5:   { lobes: 5, inner: 0.5, sharp: 0.9, cup: 0.18, vein: 'palmate' },
  palmate3:   { lobes: 3, inner: 0.42, sharp: 0.6, cup: 0.2, vein: 'palmate' },
  palmate7:   { lobes: 7, inner: 0.46, sharp: 0.55, cup: 0.2, vein: 'palmate' },
  trifoliate: { lobes: 3, inner: 0.12, sharp: 0.24, cup: 0.24, vein: 'palmate' },
  starleaf:   { lobes: 5, inner: 0.16, sharp: 0.3, cup: 0.26, vein: 'palmate' },
  blossom:    { lobes: 5, inner: 0.42, sharp: 1.6, cup: 0.32, vein: 'petal' },
  blossom6:   { lobes: 6, inner: 0.38, sharp: 1.9, cup: 0.3, vein: 'petal' },
};

/** Outlines that are not a width profile or a rosette. */
const SPECIALS = {
  /** Ginkgo: a fan on a stalk, notched at the top. */
  ginkgo(detail) {
    const n = Math.max(9, Math.round(22 * detail));
    const pts = [];
    const spread = 1.15;                       // half-angle of the fan, radians
    pts.push(new THREE.Vector2(0, 0));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const a = -spread + 2 * spread * u;
      // a shallow notch splits the outer edge of the fan in two
      const rad = 1 - 0.14 * Math.exp(-Math.pow((u - 0.5) / 0.1, 2));
      pts.push(new THREE.Vector2(0.5 * rad * Math.sin(a), rad * Math.cos(a) * 1.02));
    }
    return { pts, cup: 0.26, droop: 0, vein: 'parallel' };
  },
};

export const LEAF_SHAPES = [
  ...Object.keys(PROFILES), ...Object.keys(ROSETTES), ...Object.keys(SPECIALS),
];

/** Which venation pattern belongs on a given leaf shape. */
export function leafVeins(kind) {
  return (PROFILES[kind] || ROSETTES[kind] || {}).vein ||
    (SPECIALS[kind] ? 'parallel' : 'pinnate');
}

/** @returns {{pts: THREE.Vector2[], cup: number, droop: number}} x:[-.5,.5] y:[0,1] */
export function leafOutline(kind, detail = 1) {
  if (SPECIALS[kind]) return SPECIALS[kind](detail);

  const ros = ROSETTES[kind];
  if (ros) {
    const pts = [];
    const n = Math.max(8, Math.round(40 * detail));
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = ros.inner + (1 - ros.inner) *
        Math.pow(Math.abs(Math.cos((ros.lobes * phi) / 2)), ros.sharp);
      pts.push(new THREE.Vector2(0.5 * r * Math.cos(phi), 0.5 + 0.5 * r * Math.sin(phi)));
    }
    return { pts, cup: ros.cup, droop: 0 };
  }

  const prof = PROFILES[kind] || PROFILES.oval;
  const n = Math.max(3, Math.round((prof.n || 9) * detail));
  const off = prof.off || (() => 0);
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(new THREE.Vector2(prof.w(i / n) + off(i / n), i / n));
  for (let i = n; i >= 0; i--) pts.push(new THREE.Vector2(-prof.w(i / n) + off(i / n), i / n));
  return { pts, cup: prof.cup, droop: prof.droop || 0 };
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  const c = new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  return c.convertSRGBToLinear();
}

/**
 * @param {object} tree
 * @param {object} o { shape, colors: [hexA, hexB], curl, jitter }
 */
export function buildLeafGeometry(tree, o = {}) {
  // scale outline resolution to the canopy size so a dense tree stays drawable
  const n = tree.leaves.length;
  const auto = n > 20000 ? 0.3 : n > 8000 ? 0.5 : n > 2000 ? 0.75 : 1;
  const { pts, cup, droop } = leafOutline(o.shape || tree.params.leafShape || 'oval',
    (o.detail ?? 1) * auto);
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const curl = (o.curl ?? 1) * cup;

  // one flat template, instanced by hand into a single merged buffer
  const tpl = pts.map((v) => {
    // cup across the width, arch along the length (what makes a frond a frond)
    const z = -curl * (v.x * v.x * 2.2 + Math.pow(Math.max(0, v.y - 0.45), 2) * 0.9)
      - droop * v.y * v.y;
    return [v.x, v.y, z];
  });
  const tplUv = pts.map((v) => [v.x + 0.5, v.y]);

  const colA = hexToRgb((o.colors && o.colors[0]) || '#6f9e3a');
  const colB = hexToRgb((o.colors && o.colors[1]) || '#4f7f2c');

  const invR = 1 / Math.max(0.25, tree.radius);
  const invH = 1 / Math.max(0.25, tree.height);
  const count = tree.leaves.length;
  const vpl = tpl.length;
  const pos = new Float32Array(count * vpl * 3);
  const uvs = new Float32Array(count * vpl * 2);
  const col = new Float32Array(count * vpl * 3);
  const idx = new (count * vpl > 65535 ? Uint32Array : Uint16Array)(count * tris.length * 3);

  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let vo = 0, io = 0;

  for (let li = 0; li < count; li++) {
    const L = tree.leaves[li];
    q.set(L.q[0], L.q[1], L.q[2], L.q[3]);
    const sy = L.scale;
    const sx = L.scale * (L.width ?? 1);
    const mix = hash1(li * 3.71);
    // cheap stand-in for self-shadowing: exposure rises toward the crown's
    // outside and top, which is where the light actually reaches
    const exposure = Math.min(1,
      Math.hypot(L.p[0], L.p[2]) * invR * 0.62 + L.p[1] * invH * 0.38);
    const shade = (0.5 + 0.66 * exposure) * (0.86 + 0.28 * hash1(li * 9.13));

    for (let k = 0; k < vpl; k++) {
      v.set(tpl[k][0] * sx, tpl[k][1] * sy, tpl[k][2] * sx);
      v.applyQuaternion(q);
      const b = (vo + k) * 3;
      pos[b] = v.x + L.p[0]; pos[b + 1] = v.y + L.p[1]; pos[b + 2] = v.z + L.p[2];
      col[b] = (colA.r + (colB.r - colA.r) * mix) * shade;
      col[b + 1] = (colA.g + (colB.g - colA.g) * mix) * shade;
      col[b + 2] = (colA.b + (colB.b - colA.b) * mix) * shade;
      uvs[(vo + k) * 2] = tplUv[k][0];
      uvs[(vo + k) * 2 + 1] = tplUv[k][1];
    }
    for (const t of tris) {
      idx[io++] = vo + t[0]; idx[io++] = vo + t[1]; idx[io++] = vo + t[2];
    }
    vo += vpl;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
