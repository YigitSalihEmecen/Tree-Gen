/**
 * tree.js — procedural tree skeleton generator.
 *
 * Two independent models, one output format:
 *
 *  1. "parametric"  — Weber & Penn, "Creation and Rendering of Realistic Trees",
 *     SIGGRAPH '95. Recursive stems with per-level curvature, splits (clones),
 *     children, shape-driven length profiles, taper modes and a pruning envelope.
 *
 *  2. "colonize"    — Runions, Lane & Prusinkiewicz, "Modeling Trees with a Space
 *     Colonization Algorithm", EGWNP 2007. Crown filled with attraction points;
 *     nodes grow toward the normalized sum of nearby attractors. Radii from the
 *     da Vinci / pipe model.
 *
 * Pure JS: no DOM, no three.js. Runs in node (see test/engine.test.mjs).
 *
 * Coordinate system: Y is up. A stem's local +Y is its growth direction, so the
 * paper's z-axis maps to our y-axis and the paper's y-axis to our -z.
 */

export const DEG = Math.PI / 180;

/* ---------------------------------------------------------------- math --- */

/** mulberry32 — small, fast, seedable. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// quaternions as [x, y, z, w]
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qnorm = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qAxis = (ax, a) => {
  const s = Math.sin(a / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)];
};
export function qApply(q, v) {
  const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
  const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
  const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
  return [
    v[0] + q[3] * tx + q[1] * tz - q[2] * ty,
    v[1] + q[3] * ty + q[2] * tx - q[0] * tz,
    v[2] + q[3] * tz + q[0] * ty - q[1] * tx,
  ];
}
/** Rotates a frame in world space so its +Y moves `t` of the way toward `target`. */
function alignTo(Q, target, t) {
  const ly = qApply(Q, [0, 1, 0]);
  const ang = Math.acos(clamp(dot(ly, target), -1, 1)) * t;
  if (!(ang > 1e-5)) return Q;
  let ax = cross(ly, target);
  let l = len(ax);
  if (l < 1e-8) { ax = [1, 0, 0]; l = 1; }            // antiparallel: any perpendicular
  return qnorm(qmul(qAxis(mul(ax, 1 / l), ang), Q));
}

/** Shortest-arc quaternion taking +Y to `dir`. */
function qFromDir(dir) {
  const d = norm(dir);
  if (d[1] > 0.999999) return [0, 0, 0, 1];
  if (d[1] < -0.999999) return [0, 0, 1, 0];
  const ax = cross([0, 1, 0], d);
  return qnorm([ax[0], ax[1], ax[2], 1 + d[1]]);
}

/* ------------------------------------------------------------ parameters -- */

export const SHAPES = [
  'conical', 'spherical', 'hemispherical', 'cylindrical', 'tapered cylindrical',
  'flame', 'inverse conical', 'tend flame', 'envelope',
];

export const DEFAULTS = {
  mode: 'parametric',      // 'parametric' | 'colonize'
  seed: 1,

  // global
  shape: 7,
  baseSize: 0.4,           // fractional branchless area at the base
  scale: 13, scaleV: 3,    // overall size in metres
  levels: 3,               // recursion levels of stems (leaves sit one past)
  ratio: 0.015,            // trunk radius / trunk length
  ratioPower: 1.2,         // child radius falloff exponent
  lobes: 5, lobeDepth: 0.07,
  flare: 0.6,
  scale0: 1,

  // per level (index 0 = trunk)
  length:      [1, 0.3, 0.6, 0.45],
  lengthV:     [0, 0, 0, 0],
  taper:       [1, 1, 1, 1],
  segSplits:   [0, 0, 0, 0],
  splitAngle:  [0, 0, 0, 0],
  splitAngleV: [0, 0, 0, 0],
  curveRes:    [8, 5, 3, 1],
  curve:       [0, -40, -40, 0],
  curveBack:   [0, 0, 0, 0],
  curveV:      [20, 50, 75, 0],
  downAngle:   [0, 60, 45, 45],
  downAngleV:  [0, -50, 10, 10],
  rotate:      [0, 140, 140, 140],
  rotateV:     [0, 0, 0, 0],
  branches:    [0, 50, 30, 10],
  baseSplits: 0,

  // foliage
  leaves: 25,              // per parent stem; negative = fan (palm fronds)
  leafShape: 'oval',
  leafScale: 0.17,
  leafScaleX: 1,
  leafBend: 0.4,           // 0..1, orient leaves up and outward
  leafQuality: 1,
  density: 1,             // global multiplier on branch + leaf counts
  attractionUp: 0.5,
  oddity: 0,               // 0 = ordinary growth; >0 injects habit breaks

  // pruning envelope
  pruneRatio: 0,
  pruneWidth: 0.5, pruneWidthPeak: 0.5,
  prunePowerLow: 0.5, prunePowerHigh: 0.5,

  // space colonization
  scAttractors: 900,
  scInfluence: 0.22,       // di, as a fraction of tree height
  scKill: 0.06,            // dk
  scStep: 0.035,           // D
  scTropism: 0.22,         // upward bias added to the growth direction
  scIterations: 260,
  scPipe: 2.3,             // pipe-model exponent (2 = da Vinci, 3 = Murray)
  scTipRadius: 0.012,

  // safety caps
  maxBranches: 7000,
  maxLeaves: 26000,
};

const LEVEL_ARRAYS = [
  'length', 'lengthV', 'taper', 'segSplits', 'splitAngle', 'splitAngleV',
  'curveRes', 'curve', 'curveBack', 'curveV', 'downAngle', 'downAngleV',
  'rotate', 'rotateV', 'branches',
];

export function mergeParams(user = {}) {
  const p = { ...DEFAULTS, ...user };
  for (const k of LEVEL_ARRAYS) {
    const base = DEFAULTS[k];
    const got = user[k];
    p[k] = base.map((d, i) => (Array.isArray(got) && got[i] != null ? got[i] : d));
  }
  p.levels = clamp(Math.round(p.levels), 1, 4);
  return p;
}

/** Weber & Penn's ShapeRatio table. `ratio` runs 1 at the tree base to 0 at the top. */
export function shapeRatio(shape, ratio, p) {
  switch (shape | 0) {
    case 0: return 0.2 + 0.8 * ratio;
    case 1: return 0.2 + 0.8 * Math.sin(Math.PI * ratio);
    case 2: return 0.2 + 0.8 * Math.sin(0.5 * Math.PI * ratio);
    case 3: return 1.0;
    case 4: return 0.5 + 0.5 * ratio;
    case 5: return ratio <= 0.7 ? ratio / 0.7 : (1 - ratio) / 0.3;
    case 6: return 1.0 - 0.8 * ratio;
    case 7: return ratio <= 0.7 ? 0.5 + 0.5 * ratio / 0.7 : 0.5 + 0.5 * (1 - ratio) / 0.3;
    case 8: {
      // Custom envelope. The paper prints the same denominator twice; using
      // pruneWidthPeak below the peak is what actually makes the curve
      // continuous (both halves reach 1 at the peak).
      if (ratio < 0 || ratio > 1) return 0;
      const peak = clamp(p ? p.pruneWidthPeak : 0.5, 0.001, 0.999);
      if (ratio < 1 - peak) return Math.pow(ratio / (1 - peak), p ? p.prunePowerHigh : 0.5);
      return Math.pow((1 - ratio) / peak, p ? p.prunePowerLow : 0.5);
    }
    default: return 1.0;
  }
}

/* ------------------------------------------------------------- public API - */

/**
 * @returns {{branches: Array, leaves: Array, height: number, radius: number,
 *            params: object, stats: object}}
 * A branch is { level, pts: [{x,y,z,r,q}], length, radius, offset, parentLength }.
 * A leaf is   { p: [x,y,z], q: [x,y,z,w], scale, width }.
 */
export function generateTree(userParams = {}) {
  const p = mergeParams(userParams);
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const out = p.mode === 'colonize' ? colonize(p) : parametric(p);

  // bounds + an exact bounding sphere, so a leaning tree still frames correctly
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  // A leaf is stored by its attachment point, so its blade has to be added back
  // in or a palm's two-metre fronds fall outside the bounds entirely.
  const each = (fn) => {
    for (const b of out.branches) for (const pt of b.pts) fn(pt.x, pt.y, pt.z, pt.r);
    for (const l of out.leaves) fn(l.p[0], l.p[1], l.p[2], l.scale * 1.05);
  };
  each((x, y, z, pad) => {
    const v = [x, y, z];
    for (let i = 0; i < 3; i++) {
      if (v[i] - pad < lo[i]) lo[i] = v[i] - pad;
      if (v[i] + pad > hi[i]) hi[i] = v[i] + pad;
    }
  });
  if (!Number.isFinite(lo[0])) { lo[0] = lo[1] = lo[2] = 0; hi[0] = hi[1] = hi[2] = 1; }
  const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let sphere = 0, maxY = 0, maxR = 0;
  each((x, y, z, pad) => {
    const d = Math.hypot(x - center[0], y - center[1], z - center[2]) + pad;
    if (d > sphere) sphere = d;
    if (y + pad > maxY) maxY = y + pad;
    const h = Math.hypot(x, z) + pad;
    if (h > maxR) maxR = h;
  });
  out.bounds = { min: lo, max: hi, center, sphere: Math.max(0.25, sphere) };
  out.height = maxY;
  out.radius = maxR;
  out.params = p;
  out.stats = {
    branches: out.branches.length,
    leaves: out.leaves.length,
    ms: (typeof performance !== 'undefined' ? performance : Date).now() - t0,
  };
  return out;
}

/* ----------------------------------------------------- parametric model --- */

function parametric(p) {
  const rand = rng(p.seed);
  let seedCounter = (p.seed >>> 0) + 0x9e3779b9;
  const nextSeed = () => (seedCounter = (Math.imul(seedCounter, 1664525) + 1013904223) >>> 0);

  const branches = [];
  const leaves = [];
  const splitErr = [0, 0, 0, 0];

  const scaleTree = Math.max(0.1, p.scale + p.scaleV * (rand() * 2 - 1));
  const lengthTrunk = Math.max(0.1, (p.length[0] + p.lengthV[0] * (rand() * 2 - 1)) * scaleTree);
  const baseLength = p.baseSize * scaleTree;
  const radiusTrunk = lengthTrunk * p.ratio * p.scale0;

  const insideEnvelope = (x, y, z) => {
    const ratio = (scaleTree - y) / (scaleTree * (1 - p.baseSize) || 1);
    const w = shapeRatio(8, ratio, p) * p.pruneWidth * scaleTree;
    return Math.hypot(x, z) <= w;
  };

  /** Radius at normalized position z along a stem, with the taper modes. */
  function stemRadius(level, z, base, length) {
    const taper = p.taper[level];
    let unitTaper;
    if (taper < 1) unitTaper = taper;
    else if (taper < 2) unitTaper = 2 - taper;
    else unitTaper = 0;
    const taperZ = base * (1 - unitTaper * z);
    if (taper < 1) return taperZ;

    const z2 = (1 - z) * length;
    let z3, depth;
    if (taper < 2 || z2 < taperZ) { z3 = z2; depth = 1; }
    else {
      depth = taper - 2;
      z3 = Math.abs(z2 - 2 * taperZ * Math.floor(z2 / (2 * taperZ) + 0.5));
    }
    if (taper < 2 && z3 >= taperZ) return taperZ;
    return (1 - depth) * taperZ +
      depth * Math.sqrt(Math.max(0, taperZ * taperZ - (z3 - taperZ) * (z3 - taperZ)));
  }

  /**
   * Builds one stem (and recursively its split clones). The path is generated at
   * unit length first, which makes it independent of the final length — that is
   * what lets pruning just rescale it instead of re-simulating.
   */
  function buildStem(level, origin, quat, length, radius, info) {
    if (branches.length >= p.maxBranches || length <= 1e-4) return null;
    if ((info.depth || 0) > 24) return null;
    // A clone continues its twin: it inherits the segments its twin had left,
    // which is also what keeps split recursion finite.
    const fullRes = Math.max(1, Math.round(p.curveRes[level]));
    const res = Math.max(1, Math.round(info.segments || fullRes));
    const curveDiv = info.curveDiv || fullRes;
    const r = rng(nextSeed());

    const frames = [{ o: [0, 0, 0], q: quat }];
    const splits = [];
    let Q = quat, O = [0, 0, 0], correction = 0;
    let oddEvent = null, oddLeft = 0, oddSign = 1;

    for (let i = 0; i < res; i++) {
      // --- splits (clones) -------------------------------------------------
      let n = 0;
      if (level === 0 && i === 0 && p.baseSplits > 0 && !info.isClone) {
        n = Math.round(p.baseSplits);
      } else if (p.segSplits[level] > 0 && i > 0) {
        // Floyd–Steinberg style error diffusion keeps fractional split counts
        // spread evenly instead of clumping.
        const eff = Math.round(p.segSplits[level] + splitErr[level]);
        splitErr[level] -= eff - p.segSplits[level];
        n = eff;
      }
      if (n > 0) {
        const dir = qApply(Q, [0, 1, 0]);
        const declination = Math.acos(clamp(dir[1], -1, 1)) / DEG;
        const sAngle = Math.max(0,
          p.splitAngle[level] + p.splitAngleV[level] * (r() * 2 - 1) - declination) * DEG;
        const spreadOf = () => {
          const u = r();
          return (20 + 0.75 * (30 + Math.abs(declination - 90)) * u * u) *
            (r() < 0.5 ? -1 : 1) * DEG;
        };
        for (let k = 0; k < n; k++) {
          splits.push({ i, q: qnorm(qmul(qy(0), qmul(qAxis([0, 1, 0], spreadOf()), qmul(Q, qx(sAngle))))) });
        }
        Q = qnorm(qmul(qAxis([0, 1, 0], spreadOf()), qmul(Q, qx(sAngle))));
        correction += sAngle;
      }

      // --- curvature -------------------------------------------------------
      let ang;
      if (p.curveBack[level] === 0) ang = p.curve[level] / curveDiv;
      else ang = (i < res / 2 ? p.curve[level] : p.curveBack[level]) / (curveDiv / 2);
      ang += p.curveV[level] * (r() * 2 - 1) / curveDiv;
      ang *= DEG;

      if (correction > 0) {
        const c = correction / (res - i);
        ang -= c;
        correction -= c;
      }
      // vertical attraction (phototropism / gravity), sub-branches only
      if (level >= 2 && p.attractionUp !== 0) {
        const ly = qApply(Q, [0, 1, 0]);
        const lz = qApply(Q, [0, 0, 1]);
        ang += p.attractionUp * Math.acos(clamp(ly[1], -1, 1)) * lz[1] / curveDiv;
      }

      // --- habit breaks ----------------------------------------------------
      // Real trees get knocked sideways, lose a leader, resprout off a fallen
      // trunk. `oddity` lets a stem run horizontally for a stretch, throw a
      // sharp elbow, dive, or corkscrew — then pick its old heading back up.
      // Trunks and main limbs only; twigs doing this just looks like noise.
      if (p.oddity > 0 && level <= 1) {
        if (!oddEvent && i > 0 && i < res - 1 && r() < p.oddity * 0.3) {
          const roll = r();
          oddEvent = roll < 0.42 ? 'run' : roll < 0.62 ? 'kink'
            : roll < 0.8 ? 'dive' : 'spiral';
          oddLeft = oddEvent === 'kink' ? 1 : 1 + Math.floor(r() * 3);
          oddSign = r() < 0.5 ? -1 : 1;
        }
        if (oddEvent === 'run') {
          const ly = qApply(Q, [0, 1, 0]);
          const h = [ly[0], 0, ly[2]];
          if (len(h) > 1e-4) Q = alignTo(Q, norm(h), 0.85);
          ang *= 0.15;
        } else if (oddEvent === 'dive') {
          Q = alignTo(Q, [0, -1, 0], 0.35);
          ang *= 0.2;
        } else if (oddEvent === 'kink') {
          Q = qnorm(qmul(Q, qmul(qy(r() * Math.PI * 2), qx(oddSign * (35 + 55 * r()) * DEG))));
        } else if (oddEvent === 'spiral') {
          Q = qnorm(qmul(Q, qy(oddSign * (40 + 60 * r()) * DEG)));
          ang += oddSign * 18 * DEG;
        }
        if (oddEvent && --oddLeft <= 0) {
          if (oddEvent === 'run' || oddEvent === 'dive') {
            Q = alignTo(Q, [0, 1, 0], 0.3 + 0.4 * r());   // elbow back toward the light
          }
          oddEvent = null;
        }
      }

      Q = qnorm(qmul(Q, qx(ang)));
      O = add(O, mul(qApply(Q, [0, 1, 0]), 1 / res));
      frames.push({ o: O, q: Q });
    }

    // --- pruning: shrink until the (shape-invariant) path fits the envelope --
    if (p.pruneRatio > 0 && level > 0) {
      const fits = (s) => frames.every((f) =>
        insideEnvelope(origin[0] + f.o[0] * length * s,
                       origin[1] + f.o[1] * length * s,
                       origin[2] + f.o[2] * length * s));
      // If the stem's own base already sits outside the envelope there is
      // nothing sensible to shrink toward, so leave it alone. The 0.2 floor
      // stops pruning from deleting branches outright.
      if (!fits(1) && fits(0)) {
        let lo = 0, hi = 1;
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid; else hi = mid;
        }
        const keep = Math.max(0.2, lo);
        length = length * (1 - p.pruneRatio) + length * keep * p.pruneRatio;
      }
    }

    let pts = frames.map((f, i) => ({
      x: origin[0] + f.o[0] * length,
      y: origin[1] + f.o[1] * length,
      z: origin[2] + f.o[2] * length,
      r: Math.max(1e-4, stemRadius(level, i / res, radius, length)),
      q: f.q,
    }));

    // Spherical and periodic tapers vary far faster than the curvature does.
    // Sampling them only at segment boundaries aliases the rings of a palm or a
    // cactus into random bulges and cone-ended sections, so refine the radius
    // along each segment when one of those modes is in use.
    if (p.taper[level] >= 1.5 && pts.length > 1) {
      const refined = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i];
        const segLen = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
        const k = Math.min(10, Math.max(1, Math.ceil(segLen / Math.max(1e-4, radius * 0.45))));
        for (let sIdx = 1; sIdx <= k; sIdx++) {
          const f = sIdx / k;
          refined.push({
            x: a.x + (c.x - a.x) * f,
            y: a.y + (c.y - a.y) * f,
            z: a.z + (c.z - a.z) * f,
            r: Math.max(1e-4, stemRadius(level, (i - 1 + f) / res, radius, length)),
            q: c.q,
          });
        }
      }
      pts = refined;
    }

    const branch = {
      level, pts, length, radius,
      offset: info.offset, parentLength: info.parentLength,
      isClone: !!info.isClone, fullLength: info.fullLength || length,
      // radius of the wood this stem grows out of — the mesh stage uses it to
      // bury the stem's base inside its parent instead of butting against it
      attachRadius: info.attachRadius || 0,
    };
    branches.push(branch);

    for (const s of splits) {
      const o2 = [
        origin[0] + frames[s.i].o[0] * length,
        origin[1] + frames[s.i].o[1] * length,
        origin[2] + frames[s.i].o[2] * length,
      ];
      buildStem(level, o2, s.q, length * (res - s.i) / res, pts[s.i].r, {
        ...info, isClone: true, segments: res - s.i, curveDiv,
        attachRadius: pts[s.i].r,
        fullLength: info.fullLength || length, depth: (info.depth || 0) + 1,
      });
    }
    return branch;
  }

  /** Point + frame + radius at normalized arc position t along a branch. */
  function sampleBranch(b, t) {
    const pts = b.pts;
    const want = clamp(t, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(want));
    const f = want - i;
    const a = pts[i], c = pts[i + 1];
    return {
      p: [a.x + (c.x - a.x) * f, a.y + (c.y - a.y) * f, a.z + (c.z - a.z) * f],
      q: f < 0.5 ? a.q : c.q,
      r: a.r + (c.r - a.r) * f,
    };
  }

  function childCount(parent, level) {
    let n;
    if (parent.level === 0) n = p.branches[level];
    else if (parent.level === 1) {
      const lmax = p.length[1] || 1;
      n = p.branches[level] * (0.2 + 0.8 * (parent.length / lengthTrunk) / lmax);
    } else {
      n = p.branches[level] * (1 - 0.5 * (parent.offset / (parent.parentLength || 1)));
    }
    // A clone is half of a stem, not a second whole one: it carries children in
    // proportion to the length it actually holds. Without this, split-heavy
    // species multiply their branch count exponentially.
    n *= clamp(parent.length / (parent.fullLength || parent.length), 0, 1);
    return n * p.density;
  }

  function makeChildren(parent, level, budgetScale = 1) {
    const count = Math.round(Math.max(0, childCount(parent, level) * budgetScale));
    if (count <= 0) return;

    const base = parent.level === 0 ? baseLength : parent.length * 0.1;
    const span = parent.length - base;
    if (span <= 1e-4) return;

    let rot = rand() * 360;
    for (let j = 0; j < count; j++) {
      const offset = base + span * ((j + 0.5 + 0.35 * (rand() - 0.5)) / count);
      const t = offset / parent.length;

      // rotation about the parent's axis: helical, or alternating/coplanar
      let phi;
      if (p.rotate[level] >= 0) {
        rot += p.rotate[level] + p.rotateV[level] * (rand() * 2 - 1);
        phi = rot;
      } else {
        phi = (j % 2 ? 1 : -1) * (180 + p.rotate[level] + p.rotateV[level] * (rand() * 2 - 1));
      }

      // down angle: fixed, or distributed along the parent's height
      let down;
      if (p.downAngleV[level] >= 0) {
        down = p.downAngle[level] + p.downAngleV[level] * (rand() * 2 - 1);
      } else {
        const denom = parent.length - (parent.level === 0 ? baseLength : 0);
        const rr = denom > 0 ? (parent.length - offset) / denom : 0;
        down = p.downAngle[level] + p.downAngleV[level] * (1 - 2 * shapeRatio(0, rr, p));
      }

      const lmax = p.length[level] + p.lengthV[level] * (rand() * 2 - 1);
      let clen;
      if (parent.level === 0) {
        const denom = parent.length - baseLength;
        const rr = denom > 0 ? (parent.length - offset) / denom : 0;
        clen = parent.length * lmax * shapeRatio(p.shape, rr, p);
      } else {
        clen = lmax * (parent.length - 0.6 * offset);
      }
      if (clen <= 1e-3) continue;

      const at = sampleBranch(parent, t);
      let crad = parent.radius * Math.pow(Math.max(1e-6, clen / parent.length), p.ratioPower);
      crad = Math.min(crad, at.r * 0.9);

      const q = qnorm(qmul(qmul(at.q, qy(phi * DEG)), qx(down * DEG)));
      buildStem(level, at.p, q, clen, crad,
        { offset, parentLength: parent.length, attachRadius: at.r });
    }
  }

  function pushLeaf(pos, q, scale) {
    if (leaves.length >= p.maxLeaves) return;
    leaves.push({
      p: pos,
      q: bendLeaf(q, pos, p.leafBend),
      scale: scale * (0.82 + 0.36 * rand()),
      width: p.leafScaleX,
    });
  }

  function leafCount(parent) {
    if (p.leaves <= 0) return Math.max(0, -p.leaves);
    const density = shapeRatio(4, (parent.offset || 0) / (parent.parentLength || 1), p);
    return p.leaves * density * (p.leafQuality || 1) * p.density;
  }

  function makeLeaves(parent, budgetScale = 1) {
    if (!p.leaves) return;
    const lvl = Math.min(p.levels, 3);
    const size = p.leafScale / Math.sqrt(p.leafQuality || 1);

    if (p.leaves < 0) {
      // fan mode: fronds radiating from the stem tip (palms, cycads)
      const n = Math.round(-p.leaves);
      const tip = parent.pts[parent.pts.length - 1];
      for (let j = 0; j < n; j++) {
        const phi = (j * 360) / n + rand() * 12;
        const down = p.downAngle[lvl] + p.downAngleV[lvl] * (rand() * 2 - 1);
        const q = qnorm(qmul(qmul(tip.q, qy(phi * DEG)), qx(down * DEG)));
        pushLeaf([tip.x, tip.y, tip.z], q, size);
      }
      return;
    }

    const count = Math.round(leafCount(parent) * budgetScale);
    if (count <= 0) return;

    let rot = rand() * 360;
    for (let j = 0; j < count; j++) {
      const t = 0.12 + 0.88 * ((j + 0.5 + 0.4 * (rand() - 0.5)) / count);
      const at = sampleBranch(parent, t);
      if (p.rotate[lvl] >= 0) rot += p.rotate[lvl] + p.rotateV[lvl] * (rand() * 2 - 1);
      else rot = (j % 2 ? 1 : -1) * (180 + p.rotate[lvl]);
      const down = p.downAngle[lvl] + p.downAngleV[lvl] * (rand() * 2 - 1);
      const q = qnorm(qmul(qmul(at.q, qy(rot * DEG)), qx(down * DEG)));
      pushLeaf(at.p, q, size);
    }
  }

  // --- drive it -------------------------------------------------------------
  buildStem(0, [0, 0, 0], [0, 0, 0, 1], lengthTrunk, radiusTrunk,
    { offset: 0, parentLength: lengthTrunk });

  // Breadth-first, one level at a time, so a level that would blow the polygon
  // budget is thinned evenly across the whole crown rather than truncated
  // half-way through (which used to leave a dense stump and a bald top).
  for (let level = 0; level < p.levels; level++) {
    const parents = branches.filter((b) => b.level === level);
    if (!parents.length) break;

    if (level + 1 < p.levels) {
      const childLevel = level + 1;
      let want = 0;
      for (const b of parents) want += Math.max(0, childCount(b, childLevel));
      const splitFactor = Math.pow(1 + Math.max(0, p.segSplits[childLevel]),
        Math.max(0, Math.round(p.curveRes[childLevel]) - 1));
      // Reserve room for the levels that still have to be built, otherwise a
      // dense mid level eats the whole budget and the twigs (which carry the
      // leaves) never get made.
      const levelsLeft = p.levels - 1 - childLevel;
      const budget = Math.max(0, (p.maxBranches - branches.length) / (levelsLeft > 0 ? 3 : 1));
      const projected = want * splitFactor;
      const scale = projected > budget ? budget / projected : 1;
      for (const b of parents) makeChildren(b, childLevel, scale);
    } else {
      let want = 0;
      for (const b of parents) want += leafCount(b);
      const scale = want > p.maxLeaves ? p.maxLeaves / want : 1;
      for (const b of parents) makeLeaves(b, scale);
    }
  }

  return { branches, leaves };
}

/** Rotate a leaf so it faces outward from the trunk axis and tips toward the sky. */
function bendLeaf(q, pos, bend) {
  if (!bend) return q;
  let n = qApply(q, [0, 0, 1]);
  const thetaBend = Math.atan2(pos[2], pos[0]) - Math.atan2(n[2], n[0]);
  q = qnorm(qmul(qAxis([0, 1, 0], bend * thetaBend), q));
  n = qApply(q, [0, 0, 1]);
  const axis = cross(n, [0, 1, 0]);
  const l = len(axis);
  if (l > 1e-5) {
    const phi = Math.acos(clamp(dot(n, [0, 1, 0]), -1, 1));
    q = qnorm(qmul(qAxis(mul(axis, 1 / l), bend * phi), q));
  }
  return q;
}

/* ---------------------------------------------- space colonization model -- */

/** Uniform grid over the node cloud. ponytail: fine up to ~1e5 nodes; swap for a
 *  k-d tree only if node counts get silly. */
function grid(cell) {
  const map = new Map();
  const key = (x, y, z) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  return {
    add(pt, idx) {
      const k = key(pt[0], pt[1], pt[2]);
      let a = map.get(k);
      if (!a) map.set(k, (a = []));
      a.push(idx);
    },
    near(pt, fn) {
      const cx = Math.floor(pt[0] / cell), cy = Math.floor(pt[1] / cell), cz = Math.floor(pt[2] / cell);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            const a = map.get(`${cx + i},${cy + j},${cz + k}`);
            if (a) for (const idx of a) fn(idx);
          }
    },
  };
}

function colonize(p) {
  const rand = rng(p.seed);
  const H = Math.max(1, p.scale + p.scaleV * (rand() * 2 - 1));
  const trunkH = H * clamp(p.baseSize, 0.02, 0.9);
  const crownR = H * Math.max(0.05, p.pruneWidth);
  const D = Math.max(1e-3, p.scStep * H);
  const di = p.scInfluence * H;
  const dk = Math.max(D * 1.05, p.scKill * H);

  // --- attraction points, rejection-sampled inside the crown envelope -------
  const att = [];
  const alive = [];
  let guard = 0;
  while (att.length < p.scAttractors && guard++ < p.scAttractors * 60) {
    const x = rand() * 2 - 1, z = rand() * 2 - 1, u = rand();
    if (x * x + z * z > 1) continue;
    const w = shapeRatio(p.shape, 1 - u, p);          // width profile at height u
    if (Math.hypot(x, z) > w) continue;
    att.push([x * crownR, trunkH + u * (H - trunkH), z * crownR]);
    alive.push(true);
  }

  // --- grow a trunk up to the crown, then colonize --------------------------
  const nodes = [{ p: [0, 0, 0], parent: -1, kids: [], r: 0 }];
  let cur = 0;
  while (nodes[cur].p[1] < trunkH && nodes.length < 4000) {
    const prev = nodes[cur];
    const wobble = 0.12;
    const dir = norm([(rand() - 0.5) * wobble, 1, (rand() - 0.5) * wobble]);
    nodes.push({ p: add(prev.p, mul(dir, D)), parent: cur, kids: [], r: 0 });
    prev.kids.push(nodes.length - 1);
    cur = nodes.length - 1;
  }

  const g = grid(Math.max(di, D));
  for (let i = 0; i < nodes.length; i++) g.add(nodes[i].p, i);

  for (let iter = 0; iter < p.scIterations; iter++) {
    const pull = new Map();
    let any = false;
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      let best = -1, bestD = di * di;
      g.near(att[a], (idx) => {
        const d = sub(att[a], nodes[idx].p);
        const dd = dot(d, d);
        if (dd < bestD) { bestD = dd; best = idx; }
      });
      if (best < 0) continue;
      any = true;
      const dir = norm(sub(att[a], nodes[best].p));
      const acc = pull.get(best);
      if (acc) { acc[0] += dir[0]; acc[1] += dir[1]; acc[2] += dir[2]; }
      else pull.set(best, [dir[0], dir[1], dir[2]]);
    }
    if (!any) break;

    const fresh = [];
    for (const [idx, sum] of pull) {
      let d = norm(sum);
      d = norm([
        d[0] + (rand() - 0.5) * 0.12,
        d[1] + p.scTropism + (rand() - 0.5) * 0.06,
        d[2] + (rand() - 0.5) * 0.12,
      ]);
      const np = add(nodes[idx].p, mul(d, D));
      nodes.push({ p: np, parent: idx, kids: [], r: 0 });
      const ni = nodes.length - 1;
      nodes[idx].kids.push(ni);
      g.add(np, ni);
      fresh.push(np);
      if (nodes.length > 60000) break;
    }

    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      for (const np of fresh) {
        if (len(sub(att[a], np)) < dk) { alive[a] = false; break; }
      }
    }
    if (nodes.length > 60000) break;
  }

  // --- radii: pipe model, r_parent^e = sum(r_child^e) -----------------------
  const e = Math.max(1.5, p.scPipe);
  const order = [];
  (function walk(i) {
    order.push(i);
    for (const k of nodes[i].kids) walk(k);
  })(0);
  for (let i = order.length - 1; i >= 0; i--) {
    const n = nodes[order[i]];
    if (!n.kids.length) { n.r = p.scTipRadius * H * 0.1 + p.scTipRadius; continue; }
    let s = 0;
    for (const k of nodes[order[i]].kids) s += Math.pow(nodes[k].r, e);
    n.r = Math.pow(s, 1 / e);
  }

  // --- node tree -> branch polylines ---------------------------------------
  const branches = [];
  const leaves = [];
  const trunkRoot = nodes[0].r || 1;

  const emit = (chain, level, attachRadius = 0) => {
    if (chain.length < 2) return null;
    const pts = chain.map((i) => {
      const n = nodes[i];
      const dir = n.parent >= 0 ? sub(n.p, nodes[n.parent].p) : [0, 1, 0];
      return { x: n.p[0], y: n.p[1], z: n.p[2], r: Math.max(1e-4, n.r), q: qFromDir(dir) };
    });
    let L = 0;
    for (let i = 1; i < pts.length; i++)
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    const b = { level, pts, length: L, radius: pts[0].r, offset: 0, parentLength: L,
                attachRadius };
    branches.push(b);
    return b;
  };

  const stack = [{ start: 0, level: 0 }];
  while (stack.length) {
    const { start, level } = stack.pop();
    // include the parent node so side branches stay attached to their trunk
    const chain = nodes[start].parent >= 0 ? [nodes[start].parent, start] : [start];
    let n = nodes[start];
    while (n.kids.length) {
      // continue along the thickest child; the rest become new branches
      let main = n.kids[0];
      for (const k of n.kids) if (nodes[k].r > nodes[main].r) main = k;
      for (const k of n.kids) if (k !== main) stack.push({ start: k, level: Math.min(3, level + 1) });
      chain.push(main);
      n = nodes[main];
    }
    const b = emit(chain, level, nodes[start].parent >= 0 ? nodes[nodes[start].parent].r : 0);
    if (branches.length > p.maxBranches) break;
    if (!b) continue;

    // leaves along the thin outer part of the branch
    if (p.leaves > 0) {
      const size = p.leafScale / Math.sqrt(p.leafQuality || 1);
      for (let i = 1; i < chain.length; i++) {
        const nn = nodes[chain[i]];
        if (nn.r > trunkRoot * 0.12) continue;
        const per = Math.max(1, Math.round(p.leaves / 6 * (p.leafQuality || 1) * p.density));
        for (let j = 0; j < per; j++) {
          if (leaves.length >= p.maxLeaves) break;
          const dir = norm(sub(nn.p, nodes[nn.parent].p));
          const q0 = qFromDir(dir);
          const q = qnorm(qmul(qmul(q0, qy(rand() * Math.PI * 2)),
            qx((p.downAngle[3] + p.downAngleV[3] * (rand() * 2 - 1)) * DEG)));
          leaves.push({
            p: [nn.p[0], nn.p[1], nn.p[2]],
            q: bendLeaf(q, nn.p, p.leafBend),
            scale: size * (0.82 + 0.36 * rand()),
            width: p.leafScaleX,
          });
        }
      }
    }
  }

  return { branches, leaves };
}
