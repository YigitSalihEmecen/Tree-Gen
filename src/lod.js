/**
 * lod.js — five levels of detail cut from one generated tree.
 *
 * Every level meshes the same skeleton; only the meshing gets cheaper, so the
 * silhouette holds while the triangle count falls. The recipe follows what
 * production foliage pipelines do (SpeedTree, Simplygon, MPC's Jungle Book):
 * fewer sides and rings on the wood, outlying twigs dropped, leaves thinned with
 * the survivors scaled up to keep the canopy's area, and finally a billboard
 * impostor baked from the full model.
 */

import * as THREE from 'three';
import { buildBranchGeometry, buildLeafGeometry } from './geometry.js';
import { buildGrowth } from './growth.js';

export const LODS = [
  { label: 'Full', subdiv: 3, radial: 1, minRadius: 0, simplify: 0,
    leafDetail: 1, keep: 1, growth: 1 },
  { label: 'High', subdiv: 2, radial: 0.7, minRadius: 0.006, simplify: 0.15,
    leafDetail: 0.55, keep: 0.8, growth: 0.6 },
  { label: 'Medium', subdiv: 1, radial: 0.48, minRadius: 0.03, simplify: 0.5,
    leafDetail: 0.25, keep: 0.45, growth: 0.35 },
  { label: 'Low', subdiv: 1, radial: 0.32, minRadius: 0.08, simplify: 1,
    leafDetail: 0.25, keep: 0.18, cards: true, growth: 0 },
  { label: 'Billboard', impostor: true },
];

/**
 * Geometry for one mesh level (0–3). Level 4 is a billboard and is baked from
 * level 0 by the renderer — see buildImpostorGeometry.
 * @param {object} o { detail, leaves: {shape, colors} | null, growth }
 */
export function lodGeometry(tree, level, o = {}) {
  const L = LODS[level];
  const detail = o.detail ?? 1;
  const bark = buildBranchGeometry(tree, {
    detail, subdiv: L.subdiv, radialScale: L.radial,
    minRadius: L.minRadius, simplify: L.simplify,
  });
  const leaves = o.leaves && tree.leaves.length
    ? buildLeafGeometry(tree, { ...o.leaves, curl: 1, detail: detail * L.leafDetail,
      keep: L.keep, cards: L.cards })
    : null;

  let moss = null, fungus = null, counts = { moss: 0, fungus: 0 };
  const G = o.growth;
  if (G && G.enabled && L.growth > 0) {
    // the amount slider already fills the best-scoring sites first, so turning
    // it down keeps the patches that matter most
    const g = buildGrowth(tree, {
      ...G, detail: G.detail * detail * L.growth,
      moss: { ...G.moss, amount: G.moss.amount * Math.sqrt(L.growth) },
      fungus: { ...G.fungus, amount: G.fungus.amount * Math.sqrt(L.growth) },
    });
    ({ moss, fungus, counts } = g);
  }
  return { bark, leaves, moss, fungus, counts };
}

/** Horizontal reach about (cx, cz) and top height of a set of geometries. */
export function extent(geos, cx, cz) {
  let r = 0.05, top = 0.05;
  for (const g of geos) {
    if (!g) continue;
    const a = g.getAttribute('position').array;
    for (let i = 0; i < a.length; i += 3) {
      r = Math.max(r, Math.hypot(a[i] - cx, a[i + 2] - cz));
      top = Math.max(top, a[i + 1]);
    }
  }
  return { r, top };
}

/** View directions of the billboard planes, as yaw angles. */
export const IMPOSTOR_VIEWS = [0, Math.PI / 3, (2 * Math.PI) / 3];

/**
 * Crossed quads, one per view, each mapped to its own tile of a horizontal
 * atlas. Each plane faces the camera it was baked from; the back face shows the
 * mirror image, which is exactly the silhouette seen from behind.
 */
export function buildImpostorGeometry({ cx, cz, r, top }, views = IMPOSTOR_VIEWS) {
  const pos = [], nrm = [], uv = [], idx = [];
  views.forEach((a, i) => {
    const nx = Math.sin(a), nz = Math.cos(a);
    const rx = Math.cos(a), rz = -Math.sin(a);
    const u0 = i / views.length, u1 = (i + 1) / views.length;
    for (const [s, y, u, v] of [[-1, 0, u0, 0], [1, 0, u1, 0], [1, top, u1, 1], [-1, top, u0, 1]]) {
      pos.push(cx + rx * r * s, y, cz + rz * r * s);
      nrm.push(nx, 0, nz);
      uv.push(u, v);
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
