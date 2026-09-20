/**
 * app.js — the studio: viewport, controls, exporters.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

import { generateTree, mergeParams, SHAPES } from './tree.js';
import { SPECIES, SPECIES_KEYS, randomSpecies } from './species.js';
import { buildBranchGeometry, buildLeafGeometry, LEAF_SHAPES, leafVeins } from './geometry.js';
import { makeBarkTexture, makeLeafTexture, makeEnvironment, BARK_STYLES } from './materials.js';
import { buildGrowth, GROWTH_DEFAULTS, MOSS_TYPES, FUNGUS_TYPES } from './growth.js';

/* ------------------------------------------------------------- state ---- */

const state = {
  species: 'aspen',
  season: 'summer',
  level: 1,                 // which branch level the level-bound sliders edit
  detail: 1,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  params: null,
  bark: null,
  leafColors: null,
  showLeaves: true,
  wireframe: false,
  wind: true,
  spin: true,
  growth: null,
};

const cloneGrowth = (g) => ({
  ...GROWTH_DEFAULTS, ...g,
  moss: { ...GROWTH_DEFAULTS.moss, ...(g && g.moss) },
  fungus: { ...GROWTH_DEFAULTS.fungus, ...(g && g.fungus) },
});

function loadSpecies(key, seed) {
  const sp = SPECIES[key];
  state.species = key;
  state.growth = cloneGrowth(sp.growth);
  state.params = mergeParams({
    ...sp.params,
    seed: seed ?? sp.params.seed ?? state.params?.seed ?? 1,
  });
  state.bark = { ...sp.palette.bark };
  state.leafColors = null;
  applySeason();
}

function leafPalette() {
  const sp = SPECIES[state.species];
  const L = sp.palette.leaf;
  if (state.season === 'winter') return L.winter || (sp.evergreen ? L.summer : null);
  return L[state.season] || L.summer;
}

function applySeason() {
  const c = leafPalette();
  state.showLeavesSeason = !!c;
  state.leafColors = state.leafColors || (c ? [...c] : ['#6f9e3a', '#4f7f2c']);
}

/* --------------------------------------------------------- three set-up - */

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 2000);
camera.position.set(9, 6, 14);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.4;
controls.autoRotateSpeed = 0.55;

const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(6, 14, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0009;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(0xbfd4e8, 0.5);
fill.position.set(-8, 5, -6);
scene.add(fill);

const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x54452f, 0.85);
scene.add(hemi);

const groundMat = new THREE.ShadowMaterial({ opacity: 0.16 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 96), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const epiphyte = (rough) => new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: rough, metalness: 0,
  side: THREE.DoubleSide,
});

const treeGroup = new THREE.Group();
scene.add(treeGroup);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
// The ground catches shadows but is otherwise transparent, so the short stub
// that plants each trunk flat would show through it. Clip everything below.
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const treeClips = [clipPlane, groundPlane];
const windU = { t: { value: 0 }, amp: { value: 0 }, h: { value: 10 } };

// one leaf texture per venation pattern, built the first time it is needed
const leafTextures = new Map();
const leafTexture = (shape) => {
  const style = leafVeins(shape);
  if (!leafTextures.has(style)) leafTextures.set(style, makeLeafTexture(style));
  return leafTextures.get(style);
};
let barkTex = null;
let env = null;

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const dark = state.theme === 'dark';
  if (env) env.dispose();
  env = makeEnvironment(renderer, dark
    ? { top: '#0c1016', horizon: '#1a2029', ground: '#0a0c0a', sun: 'rgba(160,190,220,.7)' }
    : { top: '#a9c6e8', horizon: '#eef2f0', ground: '#cfc7b4', sun: 'rgba(255,250,230,.95)' });
  scene.environment = env;
  sun.intensity = dark ? 1.6 : 2.6;
  sun.color.set(dark ? 0xcfe0ff : 0xfff3e0);
  hemi.intensity = dark ? 0.5 : 0.85;
  groundMat.opacity = dark ? 0.3 : 0.16;
  renderer.toneMappingExposure = dark ? 0.95 : 1.05;
}

/* -------------------------------------------------------- tree building - */

function windify(mat, leafy) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windU.t;
    shader.uniforms.uWind = windU.amp;
    shader.uniforms.uH = windU.h;
    shader.vertexShader = 'uniform float uTime;uniform float uWind;uniform float uH;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float hf = clamp(transformed.y / uH, 0.0, 1.0);
        float amp = uWind * hf * hf * ${leafy ? '1.7' : '1.0'};
        float ph = uTime * 1.5 + transformed.x * 0.35 + transformed.z * 0.45;
        transformed.x += amp * (sin(ph) * 0.6 + sin(ph * 2.3) * 0.22);
        transformed.z += amp * cos(ph * 0.83) * 0.45;`);
  };
}

let current = null;
let growStart = -1;   // wall clock, so a throttled tab still finishes growing

function disposeTree() {
  treeGroup.traverse((o) => {
    if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
  });
  treeGroup.clear();
}

function build({ refit = false, grow = false } = {}) {
  const t0 = performance.now();
  const p = { ...state.params, density: state.detail };
  const showLeaves = state.showLeaves && state.showLeavesSeason && p.leaves !== 0;
  const tree = generateTree(p);
  current = tree;

  disposeTree();
  if (barkTex) for (const k of Object.keys(barkTex)) barkTex[k].dispose();
  barkTex = makeBarkTexture(state.bark, 512, p.seed);

  const barkGeo = buildBranchGeometry(tree, { detail: state.detail });
  const barkMat = new THREE.MeshStandardMaterial({
    ...barkTex,
    roughness: 1, metalness: 0,
    wireframe: state.wireframe,
    clippingPlanes: treeClips, clipShadows: true,
  });
  windify(barkMat, false);
  const barkMesh = new THREE.Mesh(barkGeo, barkMat);
  barkMesh.name = 'Bark';
  barkMesh.castShadow = barkMesh.receiveShadow = true;
  treeGroup.add(barkMesh);

  let tris = barkGeo.index.count / 3;

  if (showLeaves && tree.leaves.length) {
    const leafGeo = buildLeafGeometry(tree, {
      shape: p.leafShape, colors: state.leafColors, curl: 1, detail: state.detail,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      map: leafTexture(p.leafShape),
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.68, metalness: 0,
      wireframe: state.wireframe,
      clippingPlanes: treeClips, clipShadows: true,
    });
    windify(leafMat, true);
    const leafMesh = new THREE.Mesh(leafGeo, leafMat);
    leafMesh.name = 'Foliage';
    leafMesh.castShadow = leafMesh.receiveShadow = true;
    treeGroup.add(leafMesh);
    tris += leafGeo.index.count / 3;
  }

  // --- epiphytes ----------------------------------------------------------
  let mossN = 0, fungusN = 0;
  if (state.growth.enabled) {
    const g = buildGrowth(tree, { ...state.growth, detail: state.growth.detail * state.detail });
    mossN = g.counts.moss;
    fungusN = g.counts.fungus;
    for (const [geo, rough, name] of [[g.moss, 0.97, 'Moss'], [g.fungus, 0.72, 'Fungus']]) {
      if (!geo) continue;
      const mat = epiphyte(rough);
      mat.wireframe = state.wireframe;
      mat.clippingPlanes = treeClips;
      mat.clipShadows = true;
      windify(mat, false);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = true;
      treeGroup.add(mesh);
      tris += geo.index.count / 3;
    }
  }

  // ground + shadow camera sized to the tree
  const r = Math.max(1.2, tree.radius * 1.9);
  ground.scale.setScalar(r * 1.8);
  const s = Math.max(tree.height, tree.radius) * 1.3;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: s * 6 });
  sun.position.set(s * 0.6, s * 1.5, s * 0.75);
  sun.shadow.camera.updateProjectionMatrix();
  windU.h.value = Math.max(1, tree.height);

  if (refit) frame(tree);
  if (grow) { growStart = performance.now(); clipPlane.constant = 0.001; }

  const ms = performance.now() - t0;
  const epi = mossN || fungusN
    ? ` · ${fmt(mossN)} moss · ${fmt(fungusN)} fungi` : '';
  document.getElementById('stats').textContent =
    `${fmt(tris)} tris · ${fmt(tree.stats.branches)} branches · ${fmt(tree.stats.leaves)} leaves${epi}\n` +
    `${tree.height.toFixed(1)} m tall · ${(tree.radius * 2).toFixed(1)} m wide · ${ms.toFixed(0)} ms`;
  document.getElementById('hud-species').textContent = SPECIES[state.species].name;
  document.getElementById('hud-seed').textContent = `seed ${p.seed}`;

  history.replaceState(null, '', `?species=${state.species}&seed=${p.seed}` +
    `&season=${state.season}&theme=${state.theme}` +
    (state.detail !== 1 ? `&detail=${state.detail}` : '') +
    (state.growth.enabled ? '&growth=1' : '') +
    (p.mode === 'colonize' ? '&mode=colonize' : ''));
}

const fmt = (n) => n.toLocaleString('en-US');

function frame(tree) {
  const h = Math.max(0.5, tree.height);
  const c = tree.bounds.center;
  const center = new THREE.Vector3(c[0], c[1], c[2]);
  // fit the real bounding sphere to the narrower of the two field angles, so a
  // leaning palm or a lopsided crown still lands in frame
  const sphere = tree.bounds.sphere * 1.02;
  const fovV = (camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const dist = (sphere / Math.sin(Math.min(fovV, fovH) / 2)) * 1.12;
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.42, 1);
  dir.normalize().multiplyScalar(dist);
  controls.target.copy(center);
  camera.position.copy(center).add(dir);
  camera.near = dist / 120;
  camera.far = dist * 22;
  camera.updateProjectionMatrix();
  controls.minDistance = h * 0.12;
  controls.maxDistance = dist * 5;
}

/* ------------------------------------------------------------ controls -- */

function schema() {
  const p = state.params;
  const L = state.level;
  const sc = p.mode === 'colonize';

  return [
    { title: 'Species', open: true, rows: [{ type: 'species' }, { type: 'note' }] },

    { title: 'Form', open: true, rows: [
      { type: 'seg', label: 'Model', value: p.mode,
        options: [['parametric', 'Parametric'], ['colonize', 'Colonization']],
        set: (v) => { p.mode = v; renderControls(); } },
      { type: 'seed' },
      { type: 'range', key: 'scale', label: 'Height', min: 0.4, max: 40, step: 0.1, unit: ' m' },
      { type: 'range', key: 'scaleV', label: 'Height variance', min: 0, max: 12, step: 0.1, unit: ' m' },
      { type: 'select', key: 'shape', label: 'Crown shape', num: true,
        options: SHAPES.map((s, i) => [i, s]) },
      { type: 'range', key: 'baseSize', label: 'Bare trunk', min: 0.01, max: 0.95, step: 0.01, pct: true },
      ...(sc ? [] : [{ type: 'range', key: 'levels', label: 'Recursion levels', min: 1, max: 4, step: 1 }]),
      { type: 'range', get: () => state.detail, set: (v) => { state.detail = v; },
        label: 'Detail', min: 0.25, max: 1.8, step: 0.05 },
      ...(sc ? [] : [{ type: 'range', key: 'oddity', label: 'Experimental forms',
        min: 0, max: 1, step: 0.01, pct: true }]),
    ] },

    ...(sc ? [] : [{ title: 'Trunk', open: false, rows: [
      { type: 'range', key: 'ratio', label: 'Thickness', min: 0.004, max: 0.12, step: 0.001 },
      { type: 'range', key: 'ratioPower', label: 'Branch taper power', min: 0.5, max: 3, step: 0.05 },
      { type: 'lrange', lkey: 'taper', lvl: 0, label: 'Taper mode', min: 0, max: 3, step: 0.05 },
      { type: 'range', key: 'flare', label: 'Root flare', min: 0, max: 3, step: 0.05 },
      { type: 'range', key: 'lobes', label: 'Cross-section lobes', min: 0, max: 15, step: 1 },
      { type: 'range', key: 'lobeDepth', label: 'Lobe depth', min: 0, max: 0.4, step: 0.005 },
      { type: 'lrange', lkey: 'curve', lvl: 0, label: 'Trunk curve', min: -120, max: 120, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curveBack', lvl: 0, label: 'Trunk S-curve', min: -120, max: 120, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curveV', lvl: 0, label: 'Curve variance', min: 0, max: 200, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curveRes', lvl: 0, label: 'Segments', min: 1, max: 20, step: 1 },
      { type: 'range', key: 'baseSplits', label: 'Trunk splits at base', min: 0, max: 5, step: 1 },
      { type: 'lrange', lkey: 'segSplits', lvl: 0, label: 'Split rate', min: 0, max: 2, step: 0.05 },
      { type: 'lrange', lkey: 'splitAngle', lvl: 0, label: 'Split angle', min: 0, max: 80, step: 1, unit: '°' },
    ] }]),

    ...(sc ? [] : [{ title: 'Branches', open: true, rows: [
      { type: 'seg', label: 'Editing level', value: String(L),
        options: [['1', 'Level 1'], ['2', 'Level 2'], ['3', 'Level 3']],
        set: (v) => { state.level = +v; renderControls(); } },
      { type: 'lrange', lkey: 'branches', label: 'Branches per stem', min: 0, max: 200, step: 1 },
      { type: 'lrange', lkey: 'length', label: 'Relative length', min: 0, max: 2.5, step: 0.01 },
      { type: 'lrange', lkey: 'lengthV', label: 'Length variance', min: 0, max: 1, step: 0.01 },
      { type: 'lrange', lkey: 'downAngle', label: 'Down angle', min: -20, max: 140, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'downAngleV', label: 'Down angle spread', min: -90, max: 90, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'rotate', label: 'Spiral angle', min: -180, max: 180, step: 0.5, unit: '°' },
      { type: 'lrange', lkey: 'rotateV', label: 'Spiral variance', min: 0, max: 90, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curve', label: 'Curve', min: -160, max: 160, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curveBack', label: 'S-curve', min: -160, max: 160, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curveV', label: 'Curve variance', min: 0, max: 220, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'curveRes', label: 'Segments', min: 1, max: 20, step: 1 },
      { type: 'lrange', lkey: 'segSplits', label: 'Split rate', min: 0, max: 2, step: 0.05 },
      { type: 'lrange', lkey: 'splitAngle', label: 'Split angle', min: 0, max: 80, step: 1, unit: '°' },
      { type: 'lrange', lkey: 'taper', label: 'Taper mode', min: 0, max: 3, step: 0.05 },
    ] }]),

    ...(sc ? [{ title: 'Colonization', open: true, rows: [
      { type: 'range', key: 'scAttractors', label: 'Attraction points', min: 100, max: 4000, step: 50 },
      { type: 'range', key: 'pruneWidth', label: 'Crown radius', min: 0.1, max: 1.2, step: 0.01 },
      { type: 'range', key: 'scInfluence', label: 'Influence radius', min: 0.05, max: 0.6, step: 0.005 },
      { type: 'range', key: 'scKill', label: 'Kill distance', min: 0.01, max: 0.2, step: 0.005 },
      { type: 'range', key: 'scStep', label: 'Growth step', min: 0.01, max: 0.09, step: 0.002 },
      { type: 'range', key: 'scTropism', label: 'Upward tropism', min: -0.4, max: 0.8, step: 0.01 },
      { type: 'range', key: 'scIterations', label: 'Iterations', min: 20, max: 500, step: 10 },
      { type: 'range', key: 'scPipe', label: 'Pipe-model exponent', min: 1.6, max: 3.2, step: 0.05 },
      { type: 'range', key: 'scTipRadius', label: 'Tip radius', min: 0.002, max: 0.06, step: 0.001 },
    ] }] : []),

    { title: 'Crown shaping', open: false, rows: [
      { type: 'range', key: 'attractionUp', label: 'Vertical attraction', min: -4, max: 4, step: 0.05 },
      ...(sc ? [] : [
        { type: 'range', key: 'pruneRatio', label: 'Pruning', min: 0, max: 1, step: 0.01, pct: true },
        { type: 'range', key: 'pruneWidth', label: 'Envelope width', min: 0.05, max: 1.4, step: 0.01 },
        { type: 'range', key: 'pruneWidthPeak', label: 'Envelope peak', min: 0.05, max: 0.95, step: 0.01 },
        { type: 'range', key: 'prunePowerLow', label: 'Lower curvature', min: 0.001, max: 3, step: 0.01 },
        { type: 'range', key: 'prunePowerHigh', label: 'Upper curvature', min: 0.05, max: 3, step: 0.01 },
      ]),
    ] },

    { title: 'Foliage', open: true, rows: [
      { type: 'seg', label: 'Season', value: state.season,
        options: [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']],
        set: (v) => { state.season = v; state.leafColors = null; applySeason(); renderControls(); } },
      { type: 'select', key: 'leafShape', label: 'Leaf shape',
        options: LEAF_SHAPES.map((s) => [s, s]) },
      { type: 'range', key: 'leaves', label: 'Leaves per twig', min: -40, max: 90, step: 1 },
      { type: 'range', key: 'leafScale', label: 'Leaf length', min: 0.005, max: 3, step: 0.005, unit: ' m' },
      { type: 'range', key: 'leafScaleX', label: 'Leaf width', min: 0.04, max: 2, step: 0.01 },
      { type: 'range', key: 'leafBend', label: 'Face the light', min: 0, max: 1, step: 0.01, pct: true },
      { type: 'swatches', label: 'Leaf colour',
        get: () => state.leafColors, set: (i, v) => { state.leafColors[i] = v; } },
    ] },

    { title: 'Moss & fungus', open: true, rows: (() => {
      const G = state.growth;
      const head = [{ type: 'seg', label: 'Epiphytes', value: G.enabled ? 'on' : 'off',
        options: [['off', 'Off'], ['on', 'On']],
        set: (v) => { G.enabled = v === 'on'; renderControls(); } }];
      if (!G.enabled) return head;
      return [...head,
        { type: 'seg', label: 'Moss & lichen', value: G.moss.on ? 'on' : 'off',
          options: [['off', 'Off'], ['on', 'On']],
          set: (v) => { G.moss.on = v === 'on'; renderControls(); } },
        ...(G.moss.on ? [
          { type: 'select', label: 'Moss form', options: MOSS_TYPES.map((t) => [t, t]),
            get: () => G.moss.type, set: (v) => { G.moss.type = v; } },
          { type: 'range', label: 'Moss coverage', min: 0, max: 1, step: 0.01, pct: true,
            get: () => G.moss.amount, set: (v) => { G.moss.amount = v; } },
          { type: 'range', label: 'Climbs to', min: 0.05, max: 1, step: 0.01, pct: true,
            get: () => G.moss.reach, set: (v) => { G.moss.reach = v; } },
          { type: 'range', label: 'Damp side', min: 0, max: 360, step: 1, unit: '°',
            get: () => G.moss.side, set: (v) => { G.moss.side = v; } },
          { type: 'range', label: 'Moss size', min: 0.3, max: 2.5, step: 0.05,
            get: () => G.moss.scale, set: (v) => { G.moss.scale = v; } },
          { type: 'swatches', label: 'Moss colour',
            get: () => G.moss.colors, set: (i, v) => { G.moss.colors[i] = v; } },
        ] : []),
        { type: 'seg', label: 'Fungus', value: G.fungus.on ? 'on' : 'off',
          options: [['off', 'Off'], ['on', 'On']],
          set: (v) => { G.fungus.on = v === 'on'; renderControls(); } },
        ...(G.fungus.on ? [
          { type: 'select', label: 'Fungus form', options: FUNGUS_TYPES.map((t) => [t, t]),
            get: () => G.fungus.type, set: (v) => { G.fungus.type = v; } },
          { type: 'range', label: 'Fungus amount', min: 0, max: 1, step: 0.01, pct: true,
            get: () => G.fungus.amount, set: (v) => { G.fungus.amount = v; } },
          { type: 'range', label: 'Fungus size', min: 0.3, max: 3, step: 0.05,
            get: () => G.fungus.scale, set: (v) => { G.fungus.scale = v; } },
          { type: 'swatches', label: 'Fungus colour',
            get: () => G.fungus.colors, set: (i, v) => { G.fungus.colors[i] = v; } },
        ] : []),
        { type: 'range', label: 'Growth detail', min: 0.4, max: 1.6, step: 0.05,
          get: () => G.detail, set: (v) => { G.detail = v; } },
      ];
    })() },

    { title: 'Bark', open: false, rows: [
      { type: 'select', label: 'Bark style',
        get: () => state.bark.style, set: (v) => { state.bark.style = v; },
        options: BARK_STYLES.map((s) => [s, s]) },
      { type: 'range', label: 'Relief', min: 0.1, max: 2.5, step: 0.05,
        get: () => state.bark.ridge, set: (v) => { state.bark.ridge = v; } },
      { type: 'range', label: 'Markings', min: 0, max: 2, step: 0.05,
        get: () => state.bark.streaks || 0, set: (v) => { state.bark.streaks = v; } },
      { type: 'swatches', label: 'Bark colour',
        get: () => [state.bark.base, state.bark.dark, state.bark.light],
        set: (i, v) => { state.bark[['base', 'dark', 'light'][i]] = v; } },
    ] },
  ];
}

const openState = {};
const host = document.getElementById('controls');

function renderControls() {
  const p = state.params;
  host.innerHTML = '';
  schema().forEach((sec, i) => {
    const open = openState[sec.title] ?? sec.open;
    const el = document.createElement('section');
    el.className = 'section';
    el.dataset.open = String(open);
    el.innerHTML = `<button class="section-head">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <span class="title">${sec.title}</span>
        <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button><div class="section-body"><div><div class="section-inner"></div></div></div>`;
    el.querySelector('.section-head').onclick = () => {
      const now = el.dataset.open !== 'true';
      el.dataset.open = String(now);
      openState[sec.title] = now;
    };
    const inner = el.querySelector('.section-inner');
    for (const row of sec.rows) inner.appendChild(makeRow(row, p));
    host.appendChild(el);
  });
}

function makeRow(row, p) {
  const wrap = document.createElement('div');
  wrap.className = 'row';

  if (row.type === 'species') {
    wrap.className = 'species';
    for (const k of SPECIES_KEYS) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = SPECIES[k].name;
      b.setAttribute('aria-pressed', String(k === state.species));
      b.onclick = () => { loadSpecies(k); renderControls(); queue(true); };
      wrap.appendChild(b);
    }
    return wrap;
  }

  if (row.type === 'note') {
    wrap.className = 'note';
    wrap.textContent = SPECIES[state.species].note ||
      'Parametric model after Weber & Penn (SIGGRAPH ’95).';
    return wrap;
  }

  if (row.type === 'seed') {
    wrap.innerHTML = `<div class="row-head"><label>Seed</label></div>
      <div class="seed-row">
        <input type="number" aria-label="Seed" min="1" max="999999" step="1" value="${p.seed}">
        <button title="Random seed"><svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/></svg></button>
      </div>`;
    const input = wrap.querySelector('input');
    input.oninput = () => { p.seed = Math.max(1, +input.value | 0); queue(); };
    wrap.querySelector('button').onclick = () => {
      p.seed = 1 + Math.floor(Math.random() * 99999);
      input.value = p.seed;
      queue();
    };
    return wrap;
  }

  if (row.type === 'seg') {
    wrap.innerHTML = `<div class="row-head"><label>${row.label}</label></div><div class="seg"></div>`;
    const box = wrap.querySelector('.seg');
    for (const [v, label] of row.options) {
      const b = document.createElement('button');
      b.textContent = label;
      b.setAttribute('aria-pressed', String(v === row.value));
      b.onclick = () => { row.set(v); queue(true); };
      box.appendChild(b);
    }
    return wrap;
  }

  if (row.type === 'select') {
    const get = row.get || (() => p[row.key]);
    wrap.innerHTML = `<div class="row-head"><label>${row.label}</label></div>
      <select aria-label="${row.label}"></select>`;
    const sel = wrap.querySelector('select');
    for (const [v, label] of row.options) {
      const o = document.createElement('option');
      o.value = v; o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = String(get());
    sel.onchange = () => {
      const v = row.num ? +sel.value : sel.value;
      if (row.set) row.set(v); else p[row.key] = v;
      queue();
    };
    return wrap;
  }

  if (row.type === 'swatches') {
    const vals = row.get();
    wrap.innerHTML = `<div class="row-head"><label>${row.label}</label></div>
      <div class="row-colors" style="grid-template-columns:repeat(${vals.length},1fr)"></div>`;
    const box = wrap.querySelector('.row-colors');
    vals.forEach((c, i) => {
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = c;
      inp.setAttribute('aria-label', `${row.label} ${i + 1}`);
      inp.oninput = () => { row.set(i, inp.value); queue(); };
      box.appendChild(inp);
    });
    return wrap;
  }

  // range (plain or level-indexed)
  const lvl = row.type === 'lrange' ? (row.lvl ?? state.level) : null;
  const get = row.get || (lvl !== null ? () => p[row.lkey][lvl] : () => p[row.key]);
  const set = row.set || (lvl !== null
    ? (v) => { p[row.lkey][lvl] = v; }
    : (v) => { p[row.key] = v; });

  const label = row.label + (row.type === 'lrange' && row.lvl === undefined ? '' : '');
  wrap.innerHTML = `<div class="row-head"><label>${label}</label>
      <span class="val" aria-hidden="true"></span></div>
    <input type="range" aria-label="${label}" min="${row.min}" max="${row.max}" step="${row.step}">`;
  const input = wrap.querySelector('input');
  const val = wrap.querySelector('.val');
  const show = (v) => {
    val.textContent = row.pct ? `${Math.round(v * 100)}%`
      : (row.step < 1 ? v.toFixed(String(row.step).split('.')[1]?.length || 2) : String(v)) + (row.unit || '');
    input.style.setProperty('--fill', `${((v - row.min) / (row.max - row.min)) * 100}%`);
  };
  input.value = get();
  show(+input.value);
  input.oninput = () => {
    const v = +input.value;
    set(v); show(v);
    wrap.classList.add('live');
    queue();
  };
  input.onchange = () => wrap.classList.remove('live');
  return wrap;
}

/* ------------------------------------------------------------ plumbing -- */

const working = document.getElementById('working');
let timer = null;
function queue(refit = false) {
  working.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    build({ refit, grow: refit });
    working.hidden = true;
  }, 110);
}

// panel collapse
const app = document.querySelector('.app');
document.getElementById('collapse').onclick = () => app.classList.add('collapsed');
document.getElementById('expand').onclick = () => app.classList.remove('collapsed');
document.getElementById('grip').onclick = () => app.classList.toggle('collapsed');

document.getElementById('reseed').onclick = () => {
  state.params.seed = 1 + Math.floor(Math.random() * 99999);
  renderControls();
  queue(true);
};

// Universal shuffle: a whole new parameter set, palette and growth habit.
// It lands in SPECIES under a reserved key so seasons, bark and the HUD keep
// working exactly as they do for a preset — it just is not in the chip list.
document.getElementById('randomize').onclick = () => {
  SPECIES.wild = randomSpecies();
  // pick the season before loading, so the new palette is the one applied
  if (state.season === 'winter' && !SPECIES.wild.evergreen) state.season = 'summer';
  loadSpecies('wild');
  renderControls();
  queue(true);
};

const toggle = (id, fn) => {
  const b = document.getElementById(id);
  b.onclick = () => {
    const on = b.dataset.on !== 'true';
    b.dataset.on = String(on);
    fn(on);
  };
};
toggle('t-spin', (v) => { state.spin = v; controls.autoRotate = v; });
toggle('t-wind', (v) => { state.wind = v; });
toggle('t-wire', (v) => { state.wireframe = v; build(); });
toggle('t-leaves', (v) => { state.showLeaves = v; build(); });
document.getElementById('t-theme').onclick = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
};

// info dialog
const info = document.getElementById('info');
document.getElementById('t-info').onclick = () => info.showModal();
document.getElementById('info-close').onclick = () => info.close();
info.addEventListener('click', (e) => {          // click outside the card closes it
  const r = info.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
    info.close();
  }
});
for (const tab of info.querySelectorAll('.modal-tabs button')) {
  tab.onclick = () => {
    for (const t of info.querySelectorAll('.modal-tabs button')) {
      t.setAttribute('aria-selected', String(t === tab));
    }
    for (const panel of info.querySelectorAll('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    }
    info.querySelector('.modal-body').scrollTop = 0;
  };
}

/* ------------------------------------------------------------- exports -- */

function save(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const menu = document.getElementById('download-menu');
document.getElementById('download').onclick = (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
};
addEventListener('click', () => { menu.hidden = true; });
menu.onclick = (e) => {
  const btn = e.target.closest('button[data-fmt]');
  if (!btn) return;
  menu.hidden = true;
  doExport(btn.dataset.fmt);
};

function exportName(ext) {
  return `${state.species}-${state.params.seed}.${ext}`;
}

function doExport(fmt) {
  const name = SPECIES[state.species].name;
  if (fmt === 'json') {
    save(JSON.stringify({ species: state.species, name, season: state.season,
      bark: state.bark, leafColors: state.leafColors, growth: state.growth,
      params: state.params }, null, 2),
      exportName('json'), 'application/json');
    return;
  }
  if (fmt === 'png') {
    renderer.render(scene, camera);
    canvas.toBlob((b) => save(b, exportName('png'), 'image/png'), 'image/png');
    return;
  }

  // clip plane must be neutral or the exporters bake a half-grown tree
  const keep = clipPlane.constant;
  clipPlane.constant = 1e6;
  const group = new THREE.Group();
  group.name = name;
  treeGroup.children.forEach((m) => group.add(new THREE.Mesh(m.geometry, m.material)));

  if (fmt === 'obj') {
    save(new OBJExporter().parse(group), exportName('obj'), 'text/plain');
  } else if (fmt === 'stl') {
    save(new STLExporter().parse(group, { binary: true }), exportName('stl'), 'model/stl');
  } else {
    new GLTFExporter().parse(group, (glb) => save(glb, exportName('glb'), 'model/gltf-binary'),
      (err) => { console.error(err); alert('GLB export failed — see console.'); },
      { binary: true });
  }
  clipPlane.constant = keep;
}

/* ---------------------------------------------------------------- loop -- */

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

const clock = new THREE.Clock();
let windAmp = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  windU.t.value += dt;

  const target = state.wind ? Math.max(0.012, (current?.height || 8) * 0.012) : 0;
  windAmp += (target - windAmp) * Math.min(1, dt * 3);
  windU.amp.value = windAmp;

  if (growStart >= 0) {
    const t = Math.min(1, (performance.now() - growStart) / 950);
    const e = 1 - Math.pow(1 - t, 3);
    clipPlane.constant = e * (current?.height || 10) * 1.08 + 0.001;
    if (t >= 1) { growStart = -1; clipPlane.constant = 1e6; }
  }

  controls.update();
  renderer.render(scene, camera);
}

/* ----------------------------------------------------------------- go --- */

// A tree is fully described by species + seed + season, so the URL can carry it.
const q = new URLSearchParams(location.search);
loadSpecies(SPECIES[q.get('species')] ? q.get('species') : 'aspen');
if (q.get('season')) state.season = q.get('season');
if (q.get('theme')) state.theme = q.get('theme') === 'dark' ? 'dark' : 'light';
state.params.seed = Math.max(1, +q.get('seed') || 1 + Math.floor(Math.random() * 99999));
if (q.get('mode') === 'colonize') state.params.mode = 'colonize';
if (q.get('detail')) state.detail = Math.min(1.8, Math.max(0.25, +q.get('detail') || 1));
if (q.get('growth')) state.growth.enabled = q.get('growth') !== '0';
applySeason();
applyTheme();
renderControls();
resize();
build({ refit: true, grow: true });
controls.autoRotate = state.spin;
// on a phone the sheet would cover most of the tree, so start it closed
if (innerWidth < 900) app.classList.add('collapsed');
tick();
