/**
 * bush.js — shrubs: a clump of stems from one stool.
 *
 * A bush is not a small tree. It has no single trunk; it throws `stems` shoots
 * from a stool `stemSpread` × height across, each leaning `stemLean` degrees
 * outward, and every shoot is the parametric model (tree.js) grown at its own
 * seed and a slightly different height. The shoots are merged into one
 * skeleton, so meshing, LODs, epiphytes and exports treat a bush exactly as
 * they treat a tree. With `stems: 1` it is generateTree.
 *
 * Pure JS: no DOM, no three.js, like tree.js.
 */

import { DEG, generateTree, measure, mergeParams, qApply, qmul, qx, qy, rng } from './tree.js';

/**
 * @returns the generateTree shape: { branches, leaves, bounds, height, radius, params, stats }
 */
export function generateBush(userParams = {}) {
  const p = mergeParams(userParams);
  const n = Math.max(1, Math.round(p.stems));
  if (n === 1) return generateTree(p);

  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const rand = rng((p.seed ^ 0xb05e5) >>> 0);
  const branches = [], leaves = [];
  const spread = p.stemSpread * p.scale;

  for (let k = 0; k < n; k++) {
    // Evenly round the stool with jitter, so no side of the bush is bald.
    const yaw = ((k + 0.5 + (rand() - 0.5) * 0.8) / n) * Math.PI * 2;
    const d = spread * Math.sqrt(0.15 + 0.85 * rand());
    const lean = p.stemLean * (0.55 + 0.9 * rand()) * DEG;
    const R = qmul(qy(yaw), qx(lean));
    const off = qApply(qy(yaw), [0, 0, d]);
    const stem = generateTree({
      ...p, stems: 1,
      seed: (p.seed + k * 7919) >>> 0,
      // The middle shoots are the tallest, as a clump that has grown up into its own shade.
      scale: p.scale * (1 - 0.35 * (d / (spread || 1)) * rand()),
      maxBranches: Math.ceil(p.maxBranches / n),
      maxLeaves: Math.ceil(p.maxLeaves / n),
    });
    const move = (v) => {
      const r = qApply(R, v);
      return [r[0] + off[0], r[1] + off[1], r[2] + off[2]];
    };
    for (const b of stem.branches) {
      for (const pt of b.pts) {
        [pt.x, pt.y, pt.z] = move([pt.x, pt.y, pt.z]);
        pt.q = qmul(R, pt.q);
      }
      branches.push(b);
    }
    for (const l of stem.leaves) {
      l.p = move(l.p);
      l.q = qmul(R, l.q);
      leaves.push(l);
    }
  }
  return measure({ branches, leaves }, p, t0);
}

const seasons = (spring, summer, autumn, winter = null) => ({ spring, summer, autumn, winter });

/** Shared by every preset; each overrides what makes it itself. */
const SHRUB = {
  shape: 1, baseSize: 0.08, scaleV: 0.2, levels: 3,
  ratio: 0.022, ratioPower: 1.2, lobes: 0, lobeDepth: 0, flare: 0.2,
  length: [1, 0.5, 0.45, 0], lengthV: [0, 0.1, 0.1, 0], taper: [1, 1, 1, 1],
  baseSplits: 0, segSplits: [0, 0, 0, 0], splitAngle: [0, 0, 0, 0], splitAngleV: [0, 0, 0, 0],
  curveRes: [5, 4, 3, 1], curve: [0, -20, -20, 0], curveBack: [0, 0, 0, 0], curveV: [30, 60, 60, 0],
  downAngle: [0, 50, 40, 40], downAngleV: [0, -20, 15, 15],
  rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 15, 15, 0], branches: [0, 14, 10, 0],
  leaves: 22, leafShape: 'oval', leafScale: 0.06, leafScaleX: 0.7, leafBend: 0.5, attractionUp: 0.8,
  pruneRatio: 0, pruneWidth: 0.5, pruneWidthPeak: 0.5, prunePowerLow: 0.5, prunePowerHigh: 0.5,
  stems: 7, stemSpread: 0.1, stemLean: 20,
};

const shrub = (o) => ({ ...SHRUB, ...o });

/**
 * Same shape as species.js:SPECIES — name, note, params, palette — so a host
 * (and the site) can take a bush wherever it takes a tree.
 */
export const BUSHES = {
  bramble: {
    name: 'Bramble',
    note: 'Arching canes from a wide stool, bending back to the ground.',
    params: shrub({
      scale: 1.8, stems: 9, stemSpread: 0.16, stemLean: 42, levels: 2, ratio: 0.012,
      curveRes: [7, 4, 1, 1], curve: [70, -10, 0, 0], curveV: [40, 60, 0, 0],
      branches: [0, 10, 0, 0], downAngle: [0, 55, 40, 40], length: [1, 0.35, 0, 0],
      leaves: 9, leafShape: 'trifoliate', leafScale: 0.11, attractionUp: 0,
    }),
    palette: {
      bark: { base: '#6a3a3a', dark: '#2e1818', light: '#8e5a52', style: 'smooth', ridge: 0.3, streaks: 0 },
      leaf: seasons(['#5f8f3a', '#3f6e2a'], ['#3e6e2c', '#2b5222'], ['#8a4a2a', '#5e3a20'], ['#3a5a2a', '#2a4020']),
    },
  },
  hazel: {
    name: 'Hazel',
    note: 'Coppiced: a vase of straight rods, broad soft leaves.',
    params: shrub({
      scale: 3.4, stems: 8, stemSpread: 0.07, stemLean: 16, baseSize: 0.2, shape: 4,
      ratio: 0.014, curveV: [16, 40, 50, 0], branches: [0, 12, 8, 0],
      leaves: 10, leafShape: 'cordate', leafScale: 0.1, leafScaleX: 0.85, attractionUp: 1.2,
    }),
    palette: {
      bark: { base: '#7a6248', dark: '#3a2c1e', light: '#a08868', style: 'smooth', ridge: 0.3, streaks: 0.4 },
      leaf: seasons(['#8cbf55', '#6aa03e'], ['#4f8a34', '#3a6e28'], ['#d7b54a', '#b58a2e']),
    },
  },
  gorse: {
    evergreen: true,
    name: 'Gorse',
    note: 'A dense, spiny mound of short green shoots.',
    params: shrub({
      scale: 1.4, stems: 8, stemSpread: 0.12, stemLean: 28, shape: 2, ratio: 0.012,
      branches: [0, 16, 14, 0], length: [1, 0.45, 0.4, 0], curveV: [40, 80, 90, 0],
      leaves: 40, leafShape: 'scale', leafScale: 0.07, leafScaleX: 0.5, leafBend: 0.2,
    }),
    palette: {
      bark: { base: '#5a5038', dark: '#2a2418', light: '#7a6e50', style: 'fibrous', ridge: 0.8, streaks: 0 },
      leaf: seasons(['#5f7a2a', '#d8c23a'], ['#4e6a26', '#3e5620'], ['#4e6a26', '#3e5620']),
    },
  },
  heather: {
    evergreen: true,
    name: 'Heather',
    note: 'Knee-high wiry sprigs spreading into a low cushion.',
    params: shrub({
      scale: 0.6, stems: 12, stemSpread: 0.35, stemLean: 38, levels: 2, shape: 3,
      ratio: 0.03, branches: [0, 16, 0, 0], length: [1, 0.4, 0, 0],
      curveV: [30, 50, 0, 0], downAngle: [0, 35, 30, 30],
      leaves: 30, leafShape: 'scale', leafScale: 0.035, leafScaleX: 0.5, attractionUp: 1.5,
    }),
    palette: {
      bark: { base: '#5a4636', dark: '#2a2018', light: '#7a6450', style: 'fibrous', ridge: 0.6, streaks: 0 },
      leaf: seasons(['#5a6e3a', '#4a5a30'], ['#8a5a7a', '#5e6a3a'], ['#7a4a6a', '#5a4a3a']),
    },
  },
  fern: {
    evergreen: true,
    name: 'Bracken Fern',
    note: 'No wood to speak of: crowns of fronds fanned out from the ground.',
    params: shrub({
      scale: 0.12, scaleV: 0.02, stems: 4, stemSpread: 2.5, stemLean: 10, levels: 1,
      baseSize: 0.95, ratio: 0.12, taper: [1, 1, 1, 1], curveRes: [2, 1, 1, 1], branches: [0, 0, 0, 0],
      leaves: -11, leafShape: 'frond', leafScale: 0.8, leafScaleX: 0.4, leafBend: 0,
      downAngle: [0, 74, 0, 0], downAngleV: [0, 12, 0, 0], attractionUp: 0,
    }),
    palette: {
      bark: { base: '#4e5a2a', dark: '#2a3418', light: '#6a7a3a', style: 'smooth', ridge: 0.2, streaks: 0 },
      leaf: seasons(['#7ab04a', '#5a9038'], ['#4f8a34', '#3a6e28'], ['#b5823a', '#8a5a28']),
    },
  },
  juniper: {
    evergreen: true,
    name: 'Common Juniper',
    note: 'A ragged cone of a few leaning leaders.',
    params: shrub({
      scale: 2.4, stems: 4, stemSpread: 0.05, stemLean: 9, shape: 0, baseSize: 0.06,
      ratio: 0.018, branches: [0, 30, 12, 0], length: [1, 0.35, 0.4, 0],
      downAngle: [0, 55, 45, 40], curveV: [20, 40, 50, 0],
      leaves: 40, leafShape: 'scale', leafScale: 0.06, leafScaleX: 0.5, attractionUp: 1.4,
    }),
    palette: {
      bark: { base: '#6a4a38', dark: '#2e2018', light: '#8e6a52', style: 'fibrous', ridge: 1.1, streaks: 0 },
      leaf: seasons(['#3e6648', '#2a4a34'], ['#2f5a3e', '#20402c'], ['#2f5a3e', '#20402c']),
    },
  },
  rosebush: {
    name: 'Dog Rose',
    note: 'Loose, arching shoots; small leaves, the odd blossom.',
    params: shrub({
      scale: 1.4, stems: 7, stemSpread: 0.12, stemLean: 30, curve: [25, -20, -20, 0],
      branches: [0, 12, 8, 0], leaves: 14, leafShape: 'serrate', leafScale: 0.05, leafScaleX: 0.7,
    }),
    palette: {
      bark: { base: '#4e5a32', dark: '#283018', light: '#6a7a44', style: 'smooth', ridge: 0.3, streaks: 0 },
      leaf: seasons(['#5f9a3a', '#e08aa0'], ['#3e7a2c', '#2e5e22'], ['#a0502a', '#c0302a']),
    },
  },
  lavender: {
    evergreen: true,
    name: 'Lavender',
    note: 'A tidy grey-green cushion of upright spikes.',
    params: shrub({
      scale: 0.7, stems: 14, stemSpread: 0.25, stemLean: 26, levels: 2, shape: 3,
      ratio: 0.012, branches: [0, 8, 0, 0], length: [1, 0.5, 0, 0], downAngle: [0, 25, 20, 20],
      curveV: [10, 20, 0, 0], leaves: 32, leafShape: 'linear', leafScale: 0.11, leafScaleX: 0.9,
      attractionUp: 2,
    }),
    palette: {
      bark: { base: '#6a6a50', dark: '#34342a', light: '#8e8e70', style: 'fibrous', ridge: 0.5, streaks: 0 },
      leaf: seasons(['#7a8a6a', '#8a72c0'], ['#6e7e62', '#7a64b0'], ['#6e7e62', '#5e6a52']),
    },
  },
  boxwood: {
    evergreen: true,
    name: 'Boxwood',
    note: 'Dense and small-leaved; clipped here to a dome by the pruning envelope.',
    params: shrub({
      scale: 1.1, stems: 6, stemSpread: 0.1, stemLean: 22, shape: 1,
      branches: [0, 20, 12, 0], leaves: 28, leafShape: 'elliptic', leafScale: 0.035, leafScaleX: 0.7,
      pruneRatio: 1, pruneWidth: 0.6, pruneWidthPeak: 0.55, prunePowerLow: 0.4, prunePowerHigh: 0.4,
    }),
    palette: {
      bark: { base: '#7a6a50', dark: '#3a3024', light: '#a08e70', style: 'smooth', ridge: 0.4, streaks: 0 },
      leaf: seasons(['#5a8a3a', '#3e6e2a'], ['#2e5e26', '#20461c'], ['#3a5e26', '#2a4a1e']),
    },
  },
  reeds: {
    name: 'Common Reed',
    note: 'A stand of tall, single canes clothed in long blades.',
    params: shrub({
      scale: 2.2, stems: 16, stemSpread: 0.1, stemLean: 8, levels: 1, baseSize: 0.1,
      ratio: 0.008, curveRes: [5, 1, 1, 1], curve: [8, 0, 0, 0], curveV: [14, 0, 0, 0], branches: [0, 0, 0, 0],
      leaves: 8, leafShape: 'linear', leafScale: 0.4, leafScaleX: 0.5, leafBend: 0.1,
      downAngle: [0, 30, 0, 0], downAngleV: [0, 15, 0, 0], rotate: [0, 160, 0, 0], attractionUp: 0,
    }),
    palette: {
      bark: { base: '#8a8a52', dark: '#4a4a2a', light: '#b0aa70', style: 'smooth', ridge: 0.2, streaks: 0.5 },
      leaf: seasons(['#8aaa4a', '#6a8a38'], ['#6a8a3a', '#5a7a30'], ['#b5a05a', '#8a7a40'], ['#a8986a', '#8a7a52']),
    },
  },
};

export const BUSH_KEYS = Object.keys(BUSHES);
