/**
 * kit.js — TreeGen as a library: what a host renderer needs to draw a
 * generated tree at every level of detail. The site (app.js) and any game
 * embedding the generator go through the same calls.
 *
 *   const tree = generateTree(mergeParams({ ...SPECIES.oak.params, seed: 4 }));
 *   const levels = buildTreeLevels(tree, LODS, { renderer, bark: SPECIES.oak.palette.bark,
 *     leaves: { shape: tree.params.leafShape, colors: ['#6f9e3a', '#4f7f2c'] } });
 *   // levels[i].parts = [{ name, geometry, material }], levels[i].dispose()
 *
 * Without a canvas (Node, headless probes) every texture is null and the
 * materials fall back to flat colours, so geometry work still runs.
 */

import * as THREE from 'three';
import { leafVeins } from './geometry.js';
import { IMPOSTOR_VIEWS, buildLods, paintCards, extent, buildImpostorGeometry } from './lod.js';
import { makeBarkTexture, makeLeafTexture } from './materials.js';

/** A 2D context of the given size, or null where there is no canvas. */
export function canvas2d(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return (cv.getContext && cv.getContext('2d')) || null;
}

let drawable = null;
const canDraw = () => (drawable ??= !!canvas2d(1, 1));

/** Bark with its generated colour, normal and roughness maps. */
export function barkMaterial(bark, { size = 512, seed = 1, anisotropy = 8 } = {}) {
  const maps = canDraw() ? makeBarkTexture(bark, size, seed) : {};
  for (const t of Object.values(maps)) t.anisotropy = anisotropy;
  return new THREE.MeshStandardMaterial({
    ...maps, color: maps.map ? 0xffffff : new THREE.Color(bark.base), roughness: 1, metalness: 0,
  });
}

// one venation texture per pattern, shared by every leaf material
const leafTextures = new Map();
export function leafTexture(shape) {
  const style = leafVeins(shape);
  if (!leafTextures.has(style)) leafTextures.set(style, canDraw() ? makeLeafTexture(style) : null);
  return leafTextures.get(style);
}

/** Polygon leaves: vertex-coloured, venation from the shared texture. */
export function leafMaterial(shape) {
  return new THREE.MeshStandardMaterial({
    map: leafTexture(shape), vertexColors: true, side: THREE.DoubleSide, roughness: 0.68, metalness: 0,
  });
}

/** Cluster cards: paints the layout's atlas (see lod.js:leafCards) and cuts it out. */
export function cardMaterial(layout, { anisotropy = 4 } = {}) {
  const ctx = canvas2d(layout.size, layout.size);
  let map = null;
  if (ctx) {
    paintCards(ctx, layout);
    map = new THREE.CanvasTexture(ctx.canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
  }
  // ponytail: plain mipmaps let alpha coverage shrink with distance; the low
  // cutoff compensates, coverage-preserving mips would fix it properly
  const mat = new THREE.MeshStandardMaterial({
    map, alphaTest: map ? 0.3 : 0, side: THREE.DoubleSide, roughness: 0.68, metalness: 0,
  });
  mat.userData.baked = !!map;
  return mat;
}

/** Moss and fungus: vertex colour only. */
export const epiphyteMaterial = (roughness) => new THREE.MeshStandardMaterial({
  vertexColors: true, roughness, metalness: 0, side: THREE.DoubleSide,
});

/** Horizontal reach and top of everything drawn in `object`, about the trunk axis (cx, cz). */
export function impostorBox(object, cx = 0, cz = 0) {
  const geos = [];
  object.traverse((o) => { if (o.isMesh) geos.push(o.geometry); });
  return { cx, cz, ...extent(geos, cx, cz) };
}

/**
 * The billboard level: `source` (a mesh level) photographed orthographically
 * from each of `views`, into two atlases — unlit albedo and view-space normals.
 * Each crossed quad faces the camera it was baked from, so that camera's view
 * space IS the quad's tangent space and the normal atlas works as a plain
 * normal map: the billboard is lit by whatever scene it ends up in, under any
 * sky, instead of carrying the bake's lighting.
 * The atlases are read back into DataTextures, so exporters can write them.
 * @returns {{geometry, material, box}} `material.userData.dispose()` frees
 *          the material and both atlases.
 */
export function bakeImpostor(renderer, source, o = {}) {
  const views = o.views ?? IMPOSTOR_VIEWS;
  const box = o.box ?? impostorBox(source, o.cx, o.cz);
  const th = o.height ?? 256;
  const tw = Math.max(1, Math.min(th * 2, Math.round((th * 2 * box.r) / box.top)));
  const W = tw * views.length;
  const target = (colorSpace) => {
    const rt = new THREE.WebGLRenderTarget(W, th, { colorSpace });
    rt.texture.colorSpace = colorSpace;
    return rt;
  };
  // the stored bytes come back as they are (sRGB-encoded for the albedo)
  const read = (rt) => {
    const buf = new Uint8Array(W * th * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, th, buf);
    const t = new THREE.DataTexture(buf, W, th);
    t.colorSpace = rt.texture.colorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = o.anisotropy ?? 4;
    t.needsUpdate = true;
    rt.dispose();
    return t;
  };
  const albedo = target(THREE.SRGBColorSpace);
  const normals = target(THREE.NoColorSpace);

  const meshes = [];
  source.traverse((m) => { if (m.isMesh) meshes.push([m, m.material]); });
  const unlit = meshes.map(([, m]) => new THREE.MeshBasicMaterial({
    map: m.map, color: m.color, vertexColors: m.vertexColors, alphaTest: m.alphaTest,
    side: THREE.DoubleSide,
  }));
  const facing = meshes.map(([, m]) => new THREE.MeshNormalMaterial({
    normalMap: m.normalMap, side: THREE.DoubleSide,
  }));

  const parent = source.parent;
  const scene = new THREE.Scene();
  scene.add(source);
  const keep = {
    target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
    color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
    shadows: renderer.shadowMap.autoUpdate,
  };
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;

  const d = box.r * 2 + 0.5;
  const cam = new THREE.OrthographicCamera(-box.r, box.r, box.top, 0, 0.01, d + box.r + 1);
  // Cleared to the foliage's own colour (at zero alpha) and to a facing
  // normal, so filtering at the silhouette does not bleed in black.
  const pass = (rt, mats, clear) => {
    meshes.forEach(([m], i) => { m.material = mats[i]; });
    rt.viewport.set(0, 0, W, th);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(clear, 0);
    renderer.clear();
    views.forEach((a, i) => {
      cam.position.set(box.cx + Math.sin(a) * d, 0, box.cz + Math.cos(a) * d);
      cam.lookAt(box.cx, 0, box.cz);
      rt.viewport.set(i * tw, 0, tw, th);
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
    });
  };
  pass(albedo, unlit, o.background ?? 0x4f6f30);
  pass(normals, facing, new THREE.Color(0.5, 0.5, 1));

  meshes.forEach(([m, mat]) => { m.material = mat; });
  for (const m of [...unlit, ...facing]) m.dispose();
  scene.remove(source);
  if (parent) parent.add(source);
  renderer.setRenderTarget(keep.target);
  renderer.autoClear = keep.autoClear;
  renderer.setClearColor(keep.color, keep.alpha);
  renderer.shadowMap.autoUpdate = keep.shadows;

  // ponytail: plain mipmaps let alpha coverage shrink with distance; add
  // coverage-preserving mips if far billboards look thin
  const map = read(albedo), normalMap = read(normals);
  const material = new THREE.MeshStandardMaterial({
    map, normalMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
  });
  material.userData.baked = true;
  material.userData.dispose = () => { map.dispose(); normalMap.dispose(); material.dispose(); };
  return { geometry: buildImpostorGeometry(box, views), material, box };
}

/**
 * Meshes and materials for each of `levels` (LODS entries or specs shaped
 * like them). Impostor levels are baked from the finest mesh level when a
 * `renderer` is given, and come back empty otherwise.
 * @param {object} o { renderer, detail, gpu, growth,
 *                     bark: palette bark | a material to share,
 *                     barkSize, leaves: { shape, colors } | null,
 *                     impostor: { height, views } }
 * @returns {Array<{parts: Array<{name, geometry, material}>, counts, dispose()}>}
 */
export function buildTreeLevels(tree, levels, o = {}) {
  const geos = buildLods(tree, levels, o);
  const bark = o.bark?.isMaterial ? o.bark
    : barkMaterial(o.bark || { base: '#5a4a3a', dark: '#2a2018', light: '#7a6a58' },
      { size: o.barkSize ?? 512, seed: tree.params.seed });
  const ownsBark = !o.bark?.isMaterial;
  const shape = o.leaves?.shape || tree.params.leafShape;

  const mesh = (g) => {
    const parts = [];
    const add = (name, geometry, material) => { if (geometry) parts.push({ name, geometry, material }); };
    add('Bark', g.bark, bark);
    add('Foliage', g.leaves, g.leaves && (g.cards ? cardMaterial(g.cards) : leafMaterial(shape)));
    add('Moss', g.moss, epiphyteMaterial(0.97));
    add('Fungus', g.fungus, epiphyteMaterial(0.72));
    return { parts, counts: g.counts };
  };
  const out = geos.map((g) => (g ? mesh(g) : { parts: [], counts: { moss: 0, fungus: 0 } }));

  const src = levels.findIndex((L) => !L.impostor);
  levels.forEach((L, i) => {
    if (!L.impostor || !o.renderer || src < 0) return;
    const group = new THREE.Group();
    for (const p of out[src].parts) group.add(new THREE.Mesh(p.geometry, p.material));
    const [cx, , cz] = tree.bounds.center;
    const leaf = o.leaves?.colors?.[0];
    const { geometry, material } = bakeImpostor(o.renderer, group, {
      cx, cz, height: o.impostor?.height, views: o.impostor?.views,
      background: leaf ? new THREE.Color(leaf) : undefined,
    });
    out[i].parts.push({ name: 'Billboard', geometry, material });
  });

  for (const level of out) {
    level.dispose = () => {
      for (const p of level.parts) {
        p.geometry.dispose();
        if (p.material === bark) continue;
        if (p.material.userData.dispose) p.material.userData.dispose();
        else { if (p.material.userData.baked) p.material.map.dispose(); p.material.dispose(); }
      }
    };
  }
  out.disposeBark = () => {
    if (!ownsBark) return;
    for (const k of ['map', 'normalMap', 'roughnessMap']) bark[k]?.dispose();
    bark.dispose();
  };
  return out;
}
