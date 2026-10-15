/**
 * lod.js — five levels of detail cut from one generated tree.
 *
 * Every level meshes the same skeleton at full resolution and then optimises
 * the result instead of building a cruder tree:
 *   - wood, moss and fungus go through meshoptimizer's quadric-error edge
 *     collapse, which removes triangles only where the surface stays within an
 *     error bound, and prunes pieces (hair-thin twigs, tufts) smaller than it;
 *   - LOD1 thins leaves and scales the survivors to keep the canopy's area
 *     (SpeedTree's leaf LOD);
 *   - LOD2–3 replace leaves with cluster cards: leaves are grouped, each group
 *     gets its principal axes, and its real leaves are painted, as seen along
 *     two of them, into atlas tiles that two crossed quads carry;
 *   - LOD4 is a crossed-billboard impostor baked from LOD0 (in app.js);
 *   - every buffer is reordered for the post-transform vertex cache and for
 *     vertex fetch locality.
 */

import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { buildBranchGeometry, buildLeafGeometry } from './geometry.js';
import { buildGrowth } from './growth.js';

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready]);

/**
 * `error` is the simplifier's bound as a fraction of the tree's extent. Each
 * level is meant to be shown once that error is about a pixel on screen, which
 * is also how lodDistances() places the switches.
 */
export const LODS = [
  { label: 'Full', error: 0, leafDetail: 1, keep: 1 },
  { label: 'High', error: 0.002, leafDetail: 0.5, keep: 0.75 },
  { label: 'Medium', error: 0.004, perCard: 6, cardSpan: 0.05 },
  { label: 'Low', error: 0.008, perCard: 24, cardSpan: 0.1 },
  { label: 'Billboard', impostor: true, error: 0.016 },
];

/**
 * Camera distances at which each level's error shrinks to `px` pixels, for a
 * tree of extent `size` seen through a vertical field of view `fov` (radians)
 * on a viewport `height` pixels tall.
 */
export function lodDistances(size, fov, height, px = 1.5) {
  const perPixel = (2 * Math.tan(fov / 2)) / height;     // world units per pixel at distance 1
  return LODS.map((L) => (L.error ? (L.error * size) / (px * perPixel) : 0));
}

/** Copy `g`'s attributes through a meshoptimizer remap, dropping unused vertices. */
function remapGeometry(g, indices, remap, unique) {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const n = attr.itemSize, src = attr.array;
    const dst = new src.constructor(unique * n);
    for (let v = 0; v < remap.length; v++) {
      const r = remap[v];
      if (r === 0xffffffff) continue;
      for (let k = 0; k < n; k++) dst[r * n + k] = src[v * n + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, n, attr.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(unique > 65535 ? indices : new Uint16Array(indices), 1));
  out.userData = { ...g.userData };
  return out;
}

/** Vertex-cache triangle order plus vertex-fetch vertex order. */
export function optimizeForGpu(g) {
  const indices = new Uint32Array(g.index.array);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  return remapGeometry(g, indices, remap, unique);
}

/**
 * Quadric edge collapse to `error` (a fraction of the mesh's extent, or metres
 * with 'ErrorAbsolute'). Normals ride
 * along as attributes so shading creases survive; UV seams are found from
 * coincident positions, so the bark's wrap seam stays welded. 'Permissive'
 * lets collapses cross those seams — fine for vertex-coloured epiphytes, whose
 * hard edges otherwise pin them at several times the triangle count.
 */
export function simplifyGeometry(g, error, flags = ['Prune']) {
  if (!(error > 0)) return g;
  const pos = g.getAttribute('position').array;
  const nrm = g.getAttribute('normal').array;
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(g.index.array), pos, 3, nrm, 3, [0.25, 0.25, 0.25], null, 0, error, flags);
  return remapGeometry(g, indices, ...MeshoptSimplifier.compactMesh(indices));
}

/* ------------------------------------------------------- leaf cluster cards */

const toSrgb = (c) => Math.round(255 * Math.min(1,
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));

/** Dominant eigenvector of a symmetric 3×3, by power iteration. */
function principal(m) {
  const x = new THREE.Vector3(0.577, 0.613, 0.541);
  for (let k = 0; k < 32; k++) {
    x.set(m[0] * x.x + m[1] * x.y + m[2] * x.z,
      m[3] * x.x + m[4] * x.y + m[5] * x.z,
      m[6] * x.x + m[7] * x.y + m[8] * x.z);
    const l = x.length();
    if (l < 1e-20) return x.set(1, 0, 0);
    x.divideScalar(l);
  }
  return x;
}

/**
 * Balanced clusters by recursive median split along the longest axis, until a
 * cluster has at most `max` leaves and spans at most `maxSpan` — so big leaves
 * like palm fronds get a card each instead of sharing one.
 */
function clusterLeaves(cent, n, max, maxSpan) {
  const groups = [];
  const stack = [Array.from({ length: n }, (_, i) => i)];
  while (stack.length) {
    const ids = stack.pop();
    let axis = 0, span = -1;
    for (let a = 0; a < 3; a++) {
      let lo = Infinity, hi = -Infinity;
      for (const i of ids) { lo = Math.min(lo, cent[i * 3 + a]); hi = Math.max(hi, cent[i * 3 + a]); }
      if (hi - lo > span) { span = hi - lo; axis = a; }
    }
    if (ids.length === 1 || (ids.length <= max && span <= maxSpan)) { groups.push(ids); continue; }
    ids.sort((p, q) => cent[p * 3 + axis] - cent[q * 3 + axis]);
    const mid = ids.length >> 1;
    stack.push(ids.slice(0, mid), ids.slice(mid));
  }
  return groups;
}

/**
 * Replace a leaf buffer by two crossed quads per cluster of about `perCard` leaves.
 * @returns {{geometry, cards, tile, cols, size}} pass the result to paintCards
 *          for the atlas the quads' UVs point into.
 */
export function leafCards(leaves, perCard, crown, maxSpan = Infinity) {
  const n = leaves.userData.leafCount;
  const pos = leaves.getAttribute('position').array;
  const col = leaves.getAttribute('color').array;
  const idx = leaves.index.array;
  const vpl = pos.length / 3 / n, tpl = idx.length / 3 / n;

  const cent = new Float32Array(n * 3);
  for (let l = 0; l < n; l++) {
    for (let k = 0; k < vpl; k++) {
      for (let a = 0; a < 3; a++) cent[l * 3 + a] += pos[(l * vpl + k) * 3 + a] / vpl;
    }
  }
  const groups = clusterLeaves(cent, n, perCard, maxSpan);

  // two crossed cards per cluster, so it still has body seen edge-on
  const cols = Math.ceil(Math.sqrt(groups.length * 2));
  const tile = Math.max(8, Math.min(128, Math.floor(2048 / cols)));
  const size = cols * tile;
  const inner = (tile - 2) / size;          // a texel of padding stops mip bleed
  const P = [], N = [], UV = [], I = [], cards = [];
  const mean = new THREE.Vector3(), p = new THREE.Vector3(), w = new THREE.Vector3();
  const c = new THREE.Vector3(crown.x, crown.y, crown.z);

  /** One quad in the plane through `mean` spanned by `u` and facing `facing`. */
  const card = (ids, u, facing) => {
    const nrm = facing.clone();
    // face away from the crown's centre, so the lit side is the outside
    if (nrm.dot(w.copy(mean).sub(c)) < 0) nrm.negate();
    const v = new THREE.Vector3().crossVectors(nrm, u);

    // an orthographic view of the cluster's own triangles along the normal
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    const flat = ids.map((l) => {
      const tris = [];
      for (let t = l * tpl * 3; t < (l + 1) * tpl * 3; t++) {
        p.fromArray(pos, idx[t] * 3).sub(mean);
        const a = p.dot(u), b = p.dot(v);
        tris.push(a, b);
        s0 = Math.min(s0, a); s1 = Math.max(s1, a); t0 = Math.min(t0, b); t1 = Math.max(t1, b);
      }
      const vi = l * vpl * 3;
      const depth = (cent[l * 3] - mean.x) * nrm.x + (cent[l * 3 + 1] - mean.y) * nrm.y +
        (cent[l * 3 + 2] - mean.z) * nrm.z;
      return { tris, depth, color: `rgb(${toSrgb(col[vi])},${toSrgb(col[vi + 1])},${toSrgb(col[vi + 2])})` };
    });
    const ds = Math.max(1e-4, s1 - s0), dt = Math.max(1e-4, t1 - t0);
    for (const f of flat) {
      for (let k = 0; k < f.tris.length; k += 2) {
        f.tris[k] = (f.tris[k] - s0) / ds;
        f.tris[k + 1] = (f.tris[k + 1] - t0) / dt;
      }
    }
    flat.sort((a, b) => a.depth - b.depth);        // painter's order: far side first
    const ci = cards.push(flat) - 1;

    const u0 = ((ci % cols) * tile + 1) / size;
    const v0 = 1 - (Math.floor(ci / cols) * tile + tile - 1) / size;
    const base = P.length / 3;
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      w.copy(mean).addScaledVector(u, s0 + a * ds).addScaledVector(v, t0 + b * dt);
      P.push(w.x, w.y, w.z);
      // lean the normal toward the crown's sphere so cards shade as a canopy,
      // not as a pile of flat panels
      p.copy(w).sub(c).normalize().multiplyScalar(0.65).addScaledVector(nrm, 0.35).normalize();
      N.push(p.x, p.y, p.z);
      UV.push(u0 + a * inner, v0 + b * inner);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (const ids of groups) {
    mean.set(0, 0, 0);
    for (const l of ids) mean.x += cent[l * 3], mean.y += cent[l * 3 + 1], mean.z += cent[l * 3 + 2];
    mean.divideScalar(ids.length);

    // principal axes of the cluster's leaf vertices
    const m = new Float64Array(9);
    for (const l of ids) {
      for (let k = 0; k < vpl; k++) {
        p.fromArray(pos, (l * vpl + k) * 3).sub(mean);
        const v = [p.x, p.y, p.z];
        for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) m[r * 3 + s] += v[r] * v[s];
      }
    }
    const e1 = principal(m);
    const l1 = e1.dot(w.set(m[0] * e1.x + m[1] * e1.y + m[2] * e1.z,
      m[3] * e1.x + m[4] * e1.y + m[5] * e1.z, m[6] * e1.x + m[7] * e1.y + m[8] * e1.z));
    const e = [e1.x, e1.y, e1.z];
    for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) m[r * 3 + s] -= l1 * e[r] * e[s];
    const e3 = new THREE.Vector3().crossVectors(e1, principal(m));
    if (e3.lengthSq() < 1e-8) e3.set(0, 1, 0).cross(e1);
    if (e3.lengthSq() < 1e-8) e3.set(1, 0, 0);
    e3.normalize();
    const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
    // the best-fit plane, and the one standing across it along the long axis
    card(ids, e1, e3);
    card(ids, e1, e2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geometry.setIndex(I);
  return { geometry, cards, tile, cols, size };
}

/** Paint every card's leaves into its atlas tile. `ctx` is a 2D canvas context. */
export function paintCards(ctx, { cards, tile, cols, size }) {
  ctx.clearRect(0, 0, size, size);
  const inner = tile - 2;
  cards.forEach((leaves, ci) => {
    const ox = (ci % cols) * tile + 1, oy = Math.floor(ci / cols) * tile + 1;
    for (const { tris, color } of leaves) {
      // one path per leaf, so its triangles fill as one shape with no seams
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let k = 0; k < tris.length; k += 6) {
        ctx.moveTo(ox + tris[k] * inner, oy + (1 - tris[k + 1]) * inner);
        ctx.lineTo(ox + tris[k + 2] * inner, oy + (1 - tris[k + 3]) * inner);
        ctx.lineTo(ox + tris[k + 4] * inner, oy + (1 - tris[k + 5]) * inner);
        ctx.closePath();
      }
      ctx.fill();
    }
  });
}

/* ------------------------------------------------------------------ levels */

/**
 * Geometry for one mesh level (0–3). Level 4 is a billboard and is baked from
 * level 0 by the renderer — see buildImpostorGeometry.
 * @param {object} o { detail, leaves: {shape, colors} | null, growth,
 *                     gpu (reorder buffers for the vertex cache; default true) }
 * @returns {{bark, leaves, cards, moss, fungus, counts}} `cards` is the
 *          leafCards layout (atlas still to paint) when the level uses cards.
 */
export function lodGeometry(tree, level, o = {}) {
  const L = LODS[level];
  const detail = o.detail ?? 1;
  // one bound in metres for every part, so moss is judged against the tree's
  // size rather than against its own much smaller extent
  const size = Math.max(tree.height, tree.radius * 2);
  const tol = L.error * size;
  const gpu = (o.gpu ?? true) ? optimizeForGpu : (g) => g;
  const bark = gpu(simplifyGeometry(buildBranchGeometry(tree, { detail }), tol,
    ['Prune', 'ErrorAbsolute']));

  let leaves = null, cards = null;
  if (o.leaves && tree.leaves.length) {
    const full = buildLeafGeometry(tree, { ...o.leaves, curl: 1,
      detail: detail * (L.leafDetail ?? 1), keep: L.keep ?? 1 });
    if (L.perCard) {
      const [x, y, z] = tree.bounds.center;
      cards = leafCards(full, L.perCard, { x, y, z }, L.cardSpan * size);
      leaves = gpu(cards.geometry);
      full.dispose();
    } else {
      leaves = gpu(full);
    }
  }

  let moss = null, fungus = null, counts = { moss: 0, fungus: 0 };
  const G = o.growth;
  if (G && G.enabled) {
    const g = buildGrowth(tree, { ...G, detail: G.detail * detail });
    // tufts below the error bound are pruned outright, which can empty a buffer
    const opt = (geo) => {
      const s = geo && simplifyGeometry(geo, tol, ['Prune', 'Permissive', 'ErrorAbsolute']);
      return s && s.index.count ? gpu(s) : null;
    };
    ({ counts } = g);
    moss = opt(g.moss);
    fungus = opt(g.fungus);
  }
  return { bark, leaves, cards, moss, fungus, counts };
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
