/**
 * species.js — parameter sets.
 *
 * The first four are Weber & Penn's own published specifications (SIGGRAPH '95,
 * Appendix), transcribed verbatim; the rest are hand-tuned in the same model.
 * `palette` drives the procedural bark/leaf materials — nothing here is an asset.
 */

import { MOSS_TYPES, FUNGUS_TYPES } from './growth.js';

const seasons = (spring, summer, autumn) => ({ spring, summer, autumn, winter: null });

export const SPECIES = {
  aspen: {
    name: 'Quaking Aspen',
    note: 'Weber & Penn, Appendix — flame crown, fluttering round leaves.',
    params: {
      shape: 7, baseSize: 0.4, scale: 13, scaleV: 3, levels: 3,
      ratio: 0.015, ratioPower: 1.2, lobes: 5, lobeDepth: 0.07, flare: 0.6,
      length: [1, 0.3, 0.6, 0], lengthV: [0, 0, 0, 0], taper: [1, 1, 1, 1],
      baseSplits: 0, segSplits: [0, 0, 0, 0], splitAngle: [0, 0, 0, 0], splitAngleV: [0, 0, 0, 0],
      curveRes: [3, 5, 3, 1], curve: [0, -40, -40, 0], curveBack: [0, 0, 0, 0], curveV: [20, 50, 75, 0],
      downAngle: [0, 60, 45, 45], downAngleV: [0, -50, 10, 10],
      rotate: [0, 140, 140, 77], rotateV: [0, 0, 0, 0], branches: [0, 50, 30, 10],
      leaves: 25, leafShape: 'round', leafScale: 0.17, leafScaleX: 1, attractionUp: 0.5,
      pruneRatio: 0, pruneWidth: 0.5, pruneWidthPeak: 0.5, prunePowerLow: 0.5, prunePowerHigh: 0.5,
    },
    palette: {
      bark: { base: '#cfc9bb', dark: '#6e6a5e', light: '#e9e5da', style: 'smooth', ridge: 0.35, streaks: 0.85 },
      leaf: seasons(['#9ec95a', '#7fb03f'], ['#6f9e3a', '#4f7f2c'], ['#f0b429', '#d98014']),
    },
  },

  tupelo: {
    name: 'Black Tupelo',
    note: 'Weber & Penn, Appendix — tapered cylinder, four recursion levels.',
    params: {
      shape: 4, baseSize: 0.2, scale: 23, scaleV: 5, levels: 4,
      ratio: 0.015, ratioPower: 1.3, lobes: 3, lobeDepth: 0.1, flare: 1,
      length: [1, 0.3, 0.6, 0.4], lengthV: [0, 0.05, 0.1, 0], taper: [1.1, 1, 1, 1],
      baseSplits: 0, segSplits: [0, 0, 0, 0], splitAngle: [0, 0, 0, 0], splitAngleV: [0, 0, 0, 0],
      curveRes: [10, 10, 10, 1], curve: [0, 0, -10, 0], curveBack: [0, 0, 0, 0], curveV: [40, 90, 150, 0],
      downAngle: [0, 60, 30, 45], downAngleV: [0, -40, 10, 10],
      rotate: [0, 140, 140, 140], rotateV: [0, 0, 0, 0], branches: [0, 44, 20, 9],
      leaves: 6, leafShape: 'elliptic', leafScale: 0.3, leafScaleX: 0.5, attractionUp: 0.5,
      pruneRatio: 0, pruneWidth: 0.5, pruneWidthPeak: 0.5, prunePowerLow: 0.5, prunePowerHigh: 0.5,
    },
    palette: {
      bark: { base: '#4a4239', dark: '#1d1915', light: '#6b6155', style: 'plated', ridge: 1.15, streaks: 0 },
      leaf: seasons(['#7fb04a', '#5f8f33'], ['#3f7a30', '#2d5c24'], ['#d94f2b', '#a3221a']),
    },
  },

  willow: {
    name: 'Weeping Willow',
    note: 'Weber & Penn, Appendix — negative AttractionUp droops, envelope pruned.',
    params: {
      shape: 3, baseSize: 0.05, scale: 15, scaleV: 5, levels: 4,
      ratio: 0.03, ratioPower: 2, lobes: 9, lobeDepth: 0.03, flare: 0.75,
      length: [0.8, 0.5, 1.5, 0.1], lengthV: [0, 0.1, 0, 0], taper: [1, 1, 1, 1],
      baseSplits: 2, segSplits: [0.1, 0.1, 0.15, 0], splitAngle: [3, 30, 45, 0], splitAngleV: [0, 10, 20, 0],
      curveRes: [8, 12, 10, 1], curve: [0, 40, 0, 0], curveBack: [20, 80, 0, 0], curveV: [120, 90, 0, 0],
      downAngle: [0, 20, 30, 20], downAngleV: [0, 10, 10, 10],
      rotate: [0, -120, -120, 140], rotateV: [0, 30, 30, 0], branches: [0, 25, 10, 70],
      leaves: 15, leafShape: 'lanceolate', leafScale: 0.12, leafScaleX: 0.2, attractionUp: -3,
      pruneRatio: 1, pruneWidth: 0.4, pruneWidthPeak: 0.6, prunePowerLow: 0.001, prunePowerHigh: 0.5,
    },
    palette: {
      bark: { base: '#5b5344', dark: '#2a251c', light: '#7d7460', style: 'ridged', ridge: 1.4, streaks: 0 },
      leaf: seasons(['#a8c766', '#86ab45'], ['#7fa94a', '#5c8734'], ['#d7c04a', '#b39433']),
    },
  },

  oak: {
    name: 'California Black Oak',
    note: 'Weber & Penn, Appendix — heavy split trunk, broad hemispherical crown.',
    params: {
      shape: 2, baseSize: 0.05, scale: 10, scaleV: 10, levels: 3,
      ratio: 0.018, ratioPower: 1.3, lobes: 5, lobeDepth: 0.1, flare: 1.2,
      length: [1, 0.8, 0.2, 0.4], lengthV: [0, 0.1, 0.05, 0], taper: [0.95, 1, 1, 1],
      baseSplits: 2, segSplits: [0.4, 0.2, 0.1, 0], splitAngle: [10, 10, 10, 0], splitAngleV: [0, 10, 10, 0],
      curveRes: [8, 10, 3, 1], curve: [0, 40, 0, 0], curveBack: [0, -70, 0, 0], curveV: [90, 150, 30, 0],
      downAngle: [0, 30, 45, 45], downAngleV: [0, -30, 10, 10],
      rotate: [0, 80, 140, 140], rotateV: [0, 0, 0, 0], branches: [0, 40, 45, 0],
      leaves: 25, leafShape: 'oak', leafScale: 0.12, leafScaleX: 0.66, attractionUp: 0.8,
      pruneRatio: 0, pruneWidth: 0.5, pruneWidthPeak: 0.5, prunePowerLow: 0.5, prunePowerHigh: 0.5,
    },
    palette: {
      bark: { base: '#453b31', dark: '#181310', light: '#6a5c4c', style: 'ridged', ridge: 1.6, streaks: 0 },
      leaf: seasons(['#86b04a', '#66903a'], ['#41702c', '#2f5622'], ['#c2611f', '#8a3a13']),
    },
  },

  birch: {
    name: 'Silver Birch',
    params: {
      shape: 7, baseSize: 0.3, scale: 16, scaleV: 3, levels: 3,
      ratio: 0.011, ratioPower: 1.3, lobes: 0, lobeDepth: 0, flare: 0.45,
      length: [1, 0.35, 0.5, 0], lengthV: [0, 0.05, 0.1, 0], taper: [1, 1, 1, 1],
      baseSplits: 0, segSplits: [0, 0.1, 0, 0], splitAngle: [0, 18, 0, 0], splitAngleV: [0, 6, 0, 0],
      curveRes: [8, 8, 5, 1], curve: [8, -25, -30, 0], curveBack: [0, 0, 0, 0], curveV: [40, 70, 110, 0],
      downAngle: [0, 55, 55, 50], downAngleV: [0, -35, 15, 10],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 10, 12, 0], branches: [0, 46, 34, 10],
      leaves: 28, leafShape: 'cordate', leafScale: 0.09, leafScaleX: 0.85, attractionUp: -0.6,
      pruneRatio: 0, pruneWidth: 0.45, pruneWidthPeak: 0.4, prunePowerLow: 0.6, prunePowerHigh: 0.7,
    },
    palette: {
      bark: { base: '#ece7dd', dark: '#3b352f', light: '#ffffff', style: 'papery', ridge: 0.2, streaks: 1 },
      leaf: seasons(['#a6cf5e', '#84b344'], ['#6ca03c', '#4c7a2a'], ['#f2c53d', '#d99a24']),
    },
  },

  maple: {
    name: 'Japanese Maple',
    params: {
      shape: 1, baseSize: 0.15, scale: 5.5, scaleV: 1, levels: 4,
      ratio: 0.022, ratioPower: 1.25, lobes: 3, lobeDepth: 0.05, flare: 0.9,
      length: [0.9, 0.55, 0.65, 0.45], lengthV: [0, 0.12, 0.12, 0], taper: [1, 1, 1, 1],
      baseSplits: 1, segSplits: [0.25, 0.3, 0.2, 0], splitAngle: [26, 32, 34, 0], splitAngleV: [8, 12, 10, 0],
      curveRes: [6, 7, 5, 1], curve: [12, 30, -20, 0], curveBack: [-14, -40, 0, 0], curveV: [70, 110, 120, 0],
      downAngle: [0, 52, 48, 45], downAngleV: [0, -28, 18, 12],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 20, 20, 0], branches: [0, 22, 16, 10],
      leaves: 14, leafShape: 'maple', leafScale: 0.09, leafScaleX: 1.05, attractionUp: 0.35,
      pruneRatio: 0.6, pruneWidth: 0.62, pruneWidthPeak: 0.45, prunePowerLow: 0.55, prunePowerHigh: 0.7,
    },
    palette: {
      bark: { base: '#4e4238', dark: '#241c17', light: '#6f6153', style: 'smooth', ridge: 0.6, streaks: 0.2 },
      leaf: seasons(['#c8553d', '#96351f'], ['#8d3b2a', '#5e2318'], ['#e03b1f', '#9c1408']),
    },
  },

  pine: {
    evergreen: true,
    name: 'Scots Pine',
    params: {
      shape: 0, baseSize: 0.25, scale: 22, scaleV: 4, levels: 3,
      ratio: 0.014, ratioPower: 1.5, lobes: 5, lobeDepth: 0.06, flare: 0.5,
      length: [1, 0.28, 0.42, 0], lengthV: [0, 0.05, 0.1, 0], taper: [1, 1, 1, 1],
      baseSplits: 0, segSplits: [0, 0, 0, 0], splitAngle: [0, 0, 0, 0], splitAngleV: [0, 0, 0, 0],
      curveRes: [10, 4, 3, 1], curve: [4, -12, -18, 0], curveBack: [0, 0, 0, 0], curveV: [22, 40, 60, 0],
      downAngle: [0, 78, 62, 60], downAngleV: [0, -22, 14, 10],
      rotate: [0, 137.5, 137.5, 90], rotateV: [0, 14, 14, 0], branches: [0, 58, 26, 12],
      leaves: 42, leafShape: 'needle', leafScale: 0.12, leafScaleX: 0.08, attractionUp: 0.9,
      pruneRatio: 0, pruneWidth: 0.4, pruneWidthPeak: 0.25, prunePowerLow: 0.6, prunePowerHigh: 0.8,
    },
    palette: {
      bark: { base: '#8a5a3c', dark: '#3a251a', light: '#c08a58', style: 'plated', ridge: 1.3, streaks: 0 },
      leaf: seasons(['#4f7d42', '#3a6134'], ['#3b6b38', '#27502a'], ['#3b6b38', '#27502a']),
    },
  },

  cypress: {
    evergreen: true,
    name: 'Italian Cypress',
    params: {
      shape: 8, baseSize: 0.02, scale: 17, scaleV: 3, levels: 3,
      ratio: 0.012, ratioPower: 1.6, lobes: 7, lobeDepth: 0.05, flare: 0.4,
      length: [1, 0.35, 0.5, 0], lengthV: [0, 0.08, 0.1, 0], taper: [1, 1, 1, 1],
      baseSplits: 0, segSplits: [0.05, 0.1, 0, 0], splitAngle: [4, 8, 0, 0], splitAngleV: [2, 4, 0, 0],
      curveRes: [10, 6, 4, 1], curve: [0, -60, -50, 0], curveBack: [0, 0, 0, 0], curveV: [20, 40, 60, 0],
      downAngle: [0, 40, 40, 40], downAngleV: [0, -20, 12, 10],
      rotate: [0, 137.5, 137.5, 120], rotateV: [0, 12, 12, 0], branches: [0, 70, 22, 10],
      leaves: 38, leafShape: 'scale', leafScale: 0.07, leafScaleX: 0.5, attractionUp: 2.2,
      pruneRatio: 1, pruneWidth: 0.16, pruneWidthPeak: 0.35, prunePowerLow: 0.5, prunePowerHigh: 0.45,
    },
    palette: {
      bark: { base: '#6b5a48', dark: '#2f261d', light: '#8d7b63', style: 'ridged', ridge: 1.2, streaks: 0 },
      leaf: seasons(['#3f6b45', '#2c5033'], ['#355e3d', '#22402a'], ['#355e3d', '#22402a']),
    },
  },

  palm: {
    evergreen: true,
    name: 'Coconut Palm',
    params: {
      shape: 3, baseSize: 0.95, scale: 14, scaleV: 2, levels: 1,
      ratio: 0.014, ratioPower: 1.2, lobes: 9, lobeDepth: 0.04, flare: 0.9,
      length: [1, 0.3, 0.6, 0], lengthV: [0.05, 0, 0, 0], taper: [2.1, 1, 1, 1],
      baseSplits: 0, segSplits: [0, 0, 0, 0], splitAngle: [0, 0, 0, 0], splitAngleV: [0, 0, 0, 0],
      curveRes: [14, 1, 1, 1], curve: [24, 0, 0, 0], curveBack: [0, 0, 0, 0], curveV: [18, 0, 0, 0],
      downAngle: [0, 60, 60, 62], downAngleV: [0, 0, 0, 26],
      rotate: [0, 140, 140, 140], rotateV: [0, 0, 0, 0], branches: [0, 0, 0, 0],
      leaves: -22, leafShape: 'frond', leafScale: 2.6, leafScaleX: 0.16, attractionUp: 0,
      pruneRatio: 0, pruneWidth: 0.5, pruneWidthPeak: 0.5, prunePowerLow: 0.5, prunePowerHigh: 0.5,
      leafBend: 0.15,
    },
    palette: {
      bark: { base: '#8d7a5c', dark: '#443723', light: '#b8a67f', style: 'ringed', ridge: 1.0, streaks: 0 },
      leaf: seasons(['#6fa03c', '#4e7a28'], ['#548a30', '#36631f'], ['#8f9a2f', '#6d7a22']),
    },
  },

  sakura: {
    name: 'Cherry Blossom',
    params: {
      shape: 2, baseSize: 0.22, scale: 8, scaleV: 1.5, levels: 4,
      ratio: 0.019, ratioPower: 1.28, lobes: 0, lobeDepth: 0, flare: 0.8,
      length: [1, 0.6, 0.55, 0.4], lengthV: [0, 0.1, 0.12, 0], taper: [1, 1, 1, 1],
      baseSplits: 2, segSplits: [0.3, 0.25, 0.15, 0], splitAngle: [22, 30, 30, 0], splitAngleV: [8, 10, 10, 0],
      curveRes: [6, 8, 5, 1], curve: [0, 20, -30, 0], curveBack: [0, -50, 0, 0], curveV: [80, 120, 120, 0],
      downAngle: [0, 42, 50, 48], downAngleV: [0, -30, 16, 12],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 18, 18, 0], branches: [0, 24, 18, 12],
      leaves: 16, leafShape: 'blossom', leafScale: 0.075, leafScaleX: 1, attractionUp: 0.2,
      pruneRatio: 0.7, pruneWidth: 0.7, pruneWidthPeak: 0.5, prunePowerLow: 0.6, prunePowerHigh: 0.6,
    },
    palette: {
      bark: { base: '#6a5a52', dark: '#2d2420', light: '#8d7c70', style: 'ringed', ridge: 0.5, streaks: 0.6 },
      leaf: seasons(['#ffd7e4', '#f9b4cb'], ['#6f9e3a', '#4f7f2c'], ['#e8a0b4', '#c96f8c']),
    },
  },

  acacia: {
    name: 'Umbrella Acacia',
    params: {
      shape: 6, baseSize: 0.45, scale: 11, scaleV: 2, levels: 4,
      ratio: 0.022, ratioPower: 1.35, lobes: 5, lobeDepth: 0.08, flare: 1.1,
      length: [1, 0.75, 0.45, 0.35], lengthV: [0, 0.1, 0.1, 0], taper: [1, 1, 1, 1],
      baseSplits: 1, segSplits: [0.35, 0.3, 0.2, 0], splitAngle: [18, 26, 30, 0], splitAngleV: [8, 10, 10, 0],
      curveRes: [7, 9, 5, 1], curve: [0, -55, -25, 0], curveBack: [0, 0, 0, 0], curveV: [60, 90, 100, 0],
      downAngle: [0, 34, 70, 70], downAngleV: [0, -16, 16, 12],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 16, 16, 0], branches: [0, 18, 20, 14],
      leaves: 20, leafShape: 'pinnate', leafScale: 0.11, leafScaleX: 0.45, attractionUp: 1.4,
      pruneRatio: 1, pruneWidth: 0.95, pruneWidthPeak: 0.9, prunePowerLow: 1.6, prunePowerHigh: 0.3,
    },
    palette: {
      bark: { base: '#6f6252', dark: '#2f271d', light: '#9a8b73', style: 'ridged', ridge: 1.0, streaks: 0 },
      leaf: seasons(['#88a83c', '#6d8a34'], ['#5f8232', '#425f22'], ['#9a8f33', '#736a25']),
    },
  },

  baobab: {
    name: 'Baobab',
    params: {
      shape: 6, baseSize: 0.62, scale: 14, scaleV: 3, levels: 3,
      ratio: 0.085, ratioPower: 1.9, lobes: 5, lobeDepth: 0.06, flare: 1.8,
      length: [1, 0.4, 0.5, 0], lengthV: [0, 0.12, 0.12, 0], taper: [1.35, 1, 1, 1],
      baseSplits: 3, segSplits: [0.1, 0.35, 0.25, 0], splitAngle: [14, 32, 36, 0], splitAngleV: [6, 12, 12, 0],
      curveRes: [8, 6, 4, 1], curve: [0, -30, -20, 0], curveBack: [0, 0, 0, 0], curveV: [30, 90, 110, 0],
      downAngle: [0, 40, 55, 55], downAngleV: [0, -20, 18, 12],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 20, 20, 0], branches: [0, 14, 22, 12],
      leaves: 14, leafShape: 'palmate5', leafScale: 0.16, leafScaleX: 1, attractionUp: 1.1,
      pruneRatio: 0, pruneWidth: 0.55, pruneWidthPeak: 0.8, prunePowerLow: 1.4, prunePowerHigh: 0.5,
    },
    palette: {
      bark: { base: '#8a8172', dark: '#494035', light: '#b3aa98', style: 'smooth', ridge: 0.5, streaks: 0.3 },
      leaf: seasons(['#6f9e3a', '#4f7f2c'], ['#5b8a30', '#3d6421'], ['#b8952f', '#8d6f21']),
    },
  },

  saguaro: {
    evergreen: true,
    name: 'Saguaro Cactus',
    params: {
      shape: 3, baseSize: 0.25, scale: 9, scaleV: 2, levels: 2,
      ratio: 0.055, ratioPower: 1.1, lobes: 13, lobeDepth: 0.09, flare: 0.3,
      length: [1, 0.55, 0.4, 0], lengthV: [0, 0.15, 0, 0], taper: [2.05, 2.05, 1, 1],
      baseSplits: 0, segSplits: [0, 0, 0, 0], splitAngle: [0, 0, 0, 0], splitAngleV: [0, 0, 0, 0],
      curveRes: [10, 10, 1, 1], curve: [0, -95, 0, 0], curveBack: [0, 0, 0, 0], curveV: [8, 30, 0, 0],
      downAngle: [0, 88, 45, 45], downAngleV: [0, 6, 0, 0],
      rotate: [0, 137.5, 140, 140], rotateV: [0, 40, 0, 0], branches: [0, 4, 0, 0],
      leaves: 0, leafShape: 'round', leafScale: 0.1, leafScaleX: 1, attractionUp: 0,
      pruneRatio: 0, pruneWidth: 0.5, pruneWidthPeak: 0.5, prunePowerLow: 0.5, prunePowerHigh: 0.5,
    },
    palette: {
      bark: { base: '#4e7a45', dark: '#24401f', light: '#79a960', style: 'ribbed', ridge: 1.0, streaks: 0 },
      leaf: seasons(['#4e7a45', '#3a5c33'], ['#4e7a45', '#3a5c33'], ['#4e7a45', '#3a5c33']),
    },
  },

  bonsai: {
    name: 'Bonsai',
    params: {
      shape: 2, baseSize: 0.18, scale: 1.1, scaleV: 0.15, levels: 4,
      ratio: 0.055, ratioPower: 1.15, lobes: 7, lobeDepth: 0.12, flare: 1.6,
      length: [1, 0.5, 0.5, 0.4], lengthV: [0, 0.15, 0.15, 0], taper: [1, 1, 1, 1],
      baseSplits: 1, segSplits: [0.35, 0.3, 0.25, 0], splitAngle: [40, 45, 40, 0], splitAngleV: [14, 16, 14, 0],
      curveRes: [8, 8, 5, 1], curve: [40, 50, -40, 0], curveBack: [-70, -80, 0, 0], curveV: [130, 150, 140, 0],
      downAngle: [0, 70, 60, 55], downAngleV: [0, -30, 20, 14],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 20, 20, 0], branches: [0, 14, 14, 10],
      leaves: 18, leafShape: 'elliptic', leafScale: 0.026, leafScaleX: 0.7, attractionUp: 1.6,
      pruneRatio: 1, pruneWidth: 0.85, pruneWidthPeak: 0.75, prunePowerLow: 1.2, prunePowerHigh: 0.35,
    },
    palette: {
      bark: { base: '#5f5346', dark: '#241d17', light: '#8b7c68', style: 'ridged', ridge: 1.8, streaks: 0 },
      leaf: seasons(['#6f9e3a', '#4f7f2c'], ['#3f7a30', '#2a5522'], ['#c2611f', '#8a3a13']),
    },
  },

  deadwood: {
    name: 'Dead Oak',
    note: 'Standing deadwood — bare, and the only preset that ships with moss and bracket fungi turned on.',
    growth: {
      enabled: true,
      moss: { on: true, type: 'mixed', amount: 0.55, reach: 0.5, side: 30, scale: 1.05,
              colors: ['#7d9a4c', '#3c5222'] },
      fungus: { on: true, type: 'mixed', amount: 0.75, scale: 1.15,
                colors: ['#d8c191', '#5a3f22'] },
    },
    params: {
      shape: 2, baseSize: 0.12, scale: 11, scaleV: 2, levels: 4,
      ratio: 0.02, ratioPower: 1.35, lobes: 7, lobeDepth: 0.13, flare: 1.4,
      length: [1, 0.55, 0.5, 0.45], lengthV: [0, 0.15, 0.15, 0], taper: [1, 1, 1, 1],
      baseSplits: 2, segSplits: [0.3, 0.2, 0.2, 0], splitAngle: [16, 28, 34, 0], splitAngleV: [10, 12, 14, 0],
      curveRes: [8, 9, 6, 1], curve: [0, 30, -20, 0], curveBack: [0, -60, 0, 0], curveV: [110, 160, 160, 0],
      downAngle: [0, 40, 50, 50], downAngleV: [0, -30, 20, 16],
      rotate: [0, 137.5, 137.5, 137.5], rotateV: [0, 22, 22, 0], branches: [0, 26, 26, 18],
      leaves: 0, leafShape: 'oak', leafScale: 0.1, leafScaleX: 0.7, attractionUp: 0.9,
      pruneRatio: 0, pruneWidth: 0.6, pruneWidthPeak: 0.55, prunePowerLow: 0.7, prunePowerHigh: 0.7,
    },
    palette: {
      bark: { base: '#6c6155', dark: '#2b241e', light: '#9a8e7d', style: 'ridged', ridge: 1.9, streaks: 0 },
      leaf: seasons(['#6f9e3a', '#4f7f2c'], ['#6f9e3a', '#4f7f2c'], ['#8a6a2a', '#5f4a1c']),
    },
  },

  organic: {
    name: 'Organic Canopy',
    note: 'Space colonization (Runions et al.) — the crown grows into its own volume.',
    params: {
      mode: 'colonize', shape: 1, baseSize: 0.3, scale: 13, scaleV: 1, levels: 4,
      pruneWidth: 0.42,
      scAttractors: 1600, scInfluence: 0.2, scKill: 0.038, scStep: 0.03,
      scTropism: 0.18, scIterations: 420, scPipe: 2.4, scTipRadius: 0.012,
      leaves: 34, leafShape: 'ovate', leafScale: 0.13, leafScaleX: 0.75,
      downAngle: [0, 60, 45, 55], downAngleV: [0, -50, 10, 22], attractionUp: 0.5,
      lobes: 0, lobeDepth: 0, flare: 0.9,
    },
    palette: {
      bark: { base: '#4a4137', dark: '#1e1915', light: '#6d6053', style: 'ridged', ridge: 1.1, streaks: 0 },
      leaf: seasons(['#8dbb4e', '#6d9a36'], ['#4f8330', '#356021'], ['#e08a1e', '#a84e12']),
    },
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

/* --------------------------------------------------------- wild types ---- */

const hsl = (h, s, l) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * A complete random parameter set — not uniform noise over every slider, which
 * mostly yields shrubbery, but a roll over a handful of growth habits and then
 * randomised ranges inside the chosen one. Every roll is a different tree.
 */
export function randomSpecies(rand = Math.random) {
  const R = (a, b) => a + rand() * (b - a);
  const RI = (a, b) => Math.round(R(a, b));
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const chance = (p) => rand() < p;

  const habit = (() => {
    const r = rand();
    if (r < 0.08) return 'palmoid';
    if (r < 0.16) return 'succulent';
    if (r < 0.30) return 'weeping';
    if (r < 0.42) return 'conifer';
    if (r < 0.54) return 'colonize';
    return 'broadleaf';
  })();

  const seed = RI(1, 99999);
  const scale = habit === 'succulent' ? R(2.5, 11)
    : habit === 'palmoid' ? R(6, 20) : R(3, 26);

  const broadLeaves = ['round', 'oval', 'elliptic', 'ovate', 'lanceolate',
    'cordate', 'oak', 'maple', 'palmate3', 'palmate5', 'pinnate'];

  // --- foliage colour ------------------------------------------------------
  const blossom = chance(0.12);
  const hue = blossom ? R(300, 355) : R(62, 142);
  const sat = blossom ? R(45, 78) : R(30, 68);
  const lum = blossom ? R(62, 82) : R(28, 50);
  const shades = (h, s, l) => [hsl(h, s, l + 6), hsl(h + R(-8, 8), s, Math.max(12, l - 9))];
  const autumnHue = R(16, 52);
  const evergreen = habit === 'conifer' || habit === 'succulent' || habit === 'palmoid'
    || chance(0.15);
  const leafSeasons = {
    spring: shades(hue + (blossom ? 0 : R(4, 14)), sat, lum + R(4, 12)),
    summer: shades(hue, sat, lum),
    autumn: blossom ? shades(hue - 12, sat - 8, lum - 6)
                    : shades(autumnHue, R(55, 85), R(38, 58)),
    winter: evergreen ? shades(hue, sat - 6, Math.max(14, lum - 6)) : null,
  };

  // --- bark ----------------------------------------------------------------
  const barkHue = habit === 'succulent' ? R(75, 130) : R(12, 46);
  const barkSat = habit === 'succulent' ? R(22, 42) : R(2, 26);
  const barkLum = R(18, 74);
  const bark = {
    base: hsl(barkHue, barkSat, barkLum),
    dark: hsl(barkHue, barkSat + 4, Math.max(6, barkLum - R(18, 32))),
    light: hsl(barkHue, Math.max(0, barkSat - 6), Math.min(96, barkLum + R(12, 26))),
    style: habit === 'succulent' ? 'ribbed'
      : habit === 'palmoid' ? pick(['ringed', 'plated'])
      : pick(['ridged', 'ridged', 'smooth', 'plated', 'papery', 'ringed',
              'fibrous', 'blocky', 'diamond', 'shaggy', 'mottled', 'spiny']),
    ridge: R(0.25, 2.1),
    streaks: chance(0.35) ? R(0.2, 1.3) : 0,
  };

  // --- structure -----------------------------------------------------------
  const base = {
    seed,
    shape: RI(0, 8),
    baseSize: R(0.04, 0.5),
    scale, scaleV: R(0, scale * 0.18),
    levels: 3,
    ratio: R(0.009, 0.05), ratioPower: R(0.95, 2.1),
    lobes: chance(0.55) ? pick([0, 3, 5, 7, 9, 13]) : 0,
    lobeDepth: R(0.02, 0.12),
    flare: R(0, 1.7),
    length: [1, R(0.22, 0.85), R(0.3, 0.95), R(0.2, 0.7)],
    lengthV: [0, R(0, 0.18), R(0, 0.18), 0],
    taper: [R(0.9, 1.15), 1, 1, 1],
    baseSplits: chance(0.35) ? RI(1, 3) : 0,
    segSplits: [R(0, 0.24), R(0, 0.2), R(0, 0.16), 0],
    splitAngle: [R(4, 26), R(8, 34), R(10, 38), 0],
    splitAngleV: [R(0, 10), R(2, 12), R(2, 12), 0],
    curveRes: [RI(5, 10), RI(4, 8), RI(2, 5), 1],
    curve: [R(-14, 14), R(-70, 60), R(-60, 30), 0],
    curveBack: [chance(0.4) ? R(-60, 60) : 0, chance(0.45) ? R(-80, 60) : 0, 0, 0],
    curveV: [R(15, 110), R(30, 150), R(40, 160), 0],
    downAngle: [0, R(22, 88), R(30, 75), R(35, 70)],
    downAngleV: [0, chance(0.6) ? R(-55, -10) : R(8, 30), R(8, 26), R(8, 24)],
    rotate: [0, chance(0.18) ? R(-140, -95) : R(70, 180),
                chance(0.18) ? R(-140, -95) : R(70, 180), 137.5],
    rotateV: [0, R(0, 26), R(0, 26), 0],
    branches: [0, RI(10, 38), RI(8, 26), RI(5, 15)],
    leaves: RI(10, 40),
    leafShape: pick(broadLeaves),
    leafScale: R(0.05, 0.3) * Math.max(0.35, Math.min(2, scale / 12)),
    leafScaleX: R(0.35, 1.25),
    leafBend: R(0.1, 0.8),
    attractionUp: R(-0.6, 1.8),
    oddity: chance(0.28) ? R(0.2, 0.85) : 0,
    pruneRatio: chance(0.4) ? R(0.4, 1) : 0,
    pruneWidth: R(0.2, 0.9), pruneWidthPeak: R(0.2, 0.85),
    prunePowerLow: R(0.1, 1.8), prunePowerHigh: R(0.2, 1.6),
  };

  let params = base;
  let note = 'Rolled at random — no preset, no two alike.';

  if (habit === 'palmoid') {
    params = {
      ...base, levels: 1, shape: 3, baseSize: R(0.85, 0.97),
      taper: [R(1.9, 2.3), 1, 1, 1], lobes: pick([7, 9, 11]), lobeDepth: R(0.02, 0.07),
      curveRes: [RI(10, 16), 1, 1, 1], curve: [R(8, 40), 0, 0, 0], curveV: [R(10, 30), 0, 0, 0],
      ratio: R(0.008, 0.018), flare: R(0.4, 1.2), pruneRatio: 0,
      leaves: -RI(9, 26), leafShape: chance(0.5) ? 'frond' : 'pinnate',
      leafScale: scale * R(0.12, 0.22), leafScaleX: R(0.1, 0.3),
      downAngle: [0, 60, 60, R(40, 80)], downAngleV: [0, 0, 0, R(14, 34)],
      leafBend: R(0.05, 0.25), attractionUp: 0,
    };
    note = 'Rolled at random — a palm-like habit: one trunk, a crown of fronds.';
  } else if (habit === 'succulent') {
    params = {
      ...base, levels: 2, shape: 3, leaves: 0,
      ratio: R(0.035, 0.08), ratioPower: R(0.9, 1.3),
      taper: [R(1.95, 2.35), R(1.95, 2.35), 1, 1],
      lobes: pick([9, 11, 13, 15]), lobeDepth: R(0.05, 0.12), flare: R(0, 0.5),
      curveRes: [RI(8, 14), RI(8, 12), 1, 1],
      curve: [R(-8, 8), R(-110, -70), 0, 0], curveV: [R(2, 14), R(10, 40), 0, 0],
      downAngle: [0, R(78, 95), 45, 45], downAngleV: [0, R(2, 10), 0, 0],
      branches: [0, RI(2, 7), 0, 0], baseSplits: 0, segSplits: [0, 0, 0, 0],
      pruneRatio: 0, attractionUp: 0,
    };
    note = 'Rolled at random — a succulent habit: ribbed columns, no foliage.';
  } else if (habit === 'weeping') {
    params = {
      ...base, levels: 4, attractionUp: R(-3.4, -1),
      curveRes: [RI(6, 10), RI(8, 14), RI(6, 12), 1],
      length: [1, R(0.4, 0.75), R(0.9, 1.7), R(0.08, 0.2)],
      branches: [0, RI(14, 28), RI(8, 15), RI(26, 64)],
      downAngle: [0, R(14, 38), R(20, 45), R(14, 30)],
      leafShape: pick(['lanceolate', 'elliptic', 'linear', 'oval']),
      leafScale: R(0.06, 0.16), leafScaleX: R(0.15, 0.45),
      pruneRatio: chance(0.6) ? R(0.6, 1) : 0,
    };
    note = 'Rolled at random — a weeping habit: negative vertical attraction.';
  } else if (habit === 'conifer') {
    params = {
      ...base, shape: pick([0, 0, 8]), baseSize: R(0.1, 0.35),
      branches: [0, RI(32, 60), RI(16, 30), RI(8, 15)],
      downAngle: [0, R(58, 92), R(50, 72), R(50, 70)],
      downAngleV: [0, R(-32, -8), R(8, 18), R(8, 18)],
      curve: [R(-6, 8), R(-26, -4), R(-30, -8), 0],
      length: [1, R(0.2, 0.4), R(0.3, 0.55), 0],
      attractionUp: R(0.5, 1.6),
      leafShape: pick(['needle', 'scale']),
      leafScale: R(0.05, 0.16), leafScaleX: R(0.05, 0.4), leaves: RI(24, 50),
      pruneRatio: chance(0.4) ? R(0.5, 1) : 0, pruneWidth: R(0.16, 0.45),
    };
    note = 'Rolled at random — a conifer habit: conical crown, needle foliage.';
  } else if (habit === 'colonize') {
    params = {
      ...base, mode: 'colonize', levels: 4,
      shape: pick([1, 2, 5, 7, 0]),
      baseSize: R(0.15, 0.45), pruneWidth: R(0.28, 0.6),
      scAttractors: RI(600, 1700), scInfluence: R(0.14, 0.3),
      scKill: R(0.034, 0.07), scStep: R(0.028, 0.05),
      scTropism: R(-0.05, 0.4), scIterations: RI(200, 360),
      scPipe: R(1.9, 2.9), scTipRadius: R(0.008, 0.022),
      leaves: RI(16, 44), leafBend: R(0.2, 0.7),
    };
    note = 'Rolled at random — grown by space colonization into its own crown volume.';
  }

  // roughly a third of wild types come mossed over
  const mossy = chance(0.34);
  const mHue = R(58, 118), mSat = R(22, 62), mLum = R(24, 46);
  const fHue = R(16, 48), fSat = R(18, 55), fLum = R(34, 62);
  const growth = {
    enabled: mossy,
    detail: 1,
    moss: {
      on: true, type: pick(MOSS_TYPES), amount: R(0.2, 0.9), reach: R(0.25, 0.9),
      side: R(0, 360), scale: R(0.6, 1.7),
      colors: [hsl(mHue, mSat, mLum + 10), hsl(mHue - R(2, 14), mSat + 8, mLum - 8)],
    },
    fungus: {
      on: chance(0.65), type: pick(FUNGUS_TYPES), amount: R(0.1, 0.8), scale: R(0.6, 2),
      colors: [hsl(fHue, fSat, fLum + 12), hsl(fHue - R(2, 12), fSat + 10, fLum - 16)],
    },
  };

  return {
    name: 'Wild Type',
    note,
    evergreen,
    params,
    growth,
    palette: { bark, leaf: leafSeasons },
  };
}
