/**
 * materials.js — every texture here is drawn at runtime on a canvas.
 * No image files, nothing fetched. Bark is a tileable value-noise fbm turned
 * into colour + normal + roughness; leaves get a drawn midrib and venation.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------ noise ------ */

function lattice(px, py, rand) {
  const a = new Float32Array(px * py);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  return a;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function vnoise(a, px, py, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const i0 = ((xi % px) + px) % px, j0 = ((yi % py) + py) % py;
  const i1 = (i0 + 1) % px, j1 = (j0 + 1) % py;
  const u = fade(xf), v = fade(yf);
  const n00 = a[j0 * px + i0], n10 = a[j0 * px + i1];
  const n01 = a[j1 * px + i0], n11 = a[j1 * px + i1];
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/** Anisotropic tileable fbm. fx/fy are integer frequencies, so it wraps exactly. */
function makeFbm(fx, fy, octaves, rand) {
  const lats = [];
  for (let o = 0; o < octaves; o++) {
    lats.push({ a: lattice(fx << o, fy << o, rand), px: fx << o, py: fy << o });
  }
  return (u, v) => {
    let amp = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const L = lats[o];
      sum += amp * vnoise(L.a, L.px, L.py, u * L.px, v * L.py);
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

function mulberry(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

/* -------------------------------------------------------------- bark ----- */

export const BARK_STYLES = [
  'ridged',   // oak, willow — deep vertical furrows
  'smooth',   // beech, young maple
  'plated',   // tupelo, pine — irregular scaly plates
  'papery',   // birch — thin peeling sheets with lenticels
  'ringed',   // palm, cherry — horizontal banding
  'ribbed',   // cactus — regular vertical ribs with areoles
  'fibrous',  // cedar, redwood — long stringy fibres
  'blocky',   // persimmon, dogwood — alligator-hide blocks
  'diamond',  // ash — interlacing diamond furrows
  'shaggy',   // shagbark hickory — long lifting strips
  'mottled',  // plane, eucalyptus — flat camouflage patches
  'spiny',    // silk floss, ceiba — smooth trunk studded with thorns
];

/**
 * @param {object} bark  { base, dark, light, style, ridge, streaks }
 * @returns {{map, normalMap, roughnessMap, dispose()}}
 */
export function makeBarkTexture(bark, size = 512, seed = 1) {
  const rand = mulberry(seed);
  const style = bark.style || 'ridged';
  const strength = bark.ridge ?? 1;

  // ridges run along the stem: high frequency around it, low frequency along it
  const coarse = makeFbm(16, 3, 4, rand);
  const fine = makeFbm(32, 12, 3, rand);
  const warp = makeFbm(6, 3, 2, rand);
  const blotch = makeFbm(5, 5, 3, rand);
  const strands = makeFbm(48, 2, 3, rand);     // long stretched fibres
  const cells = makeFbm(8, 8, 2, rand);        // plate / patch scale
  const grain = makeFbm(64, 32, 2, rand);      // fine surface tooth

  const fract = (x) => x - Math.floor(x);
  const tri = (x) => Math.abs(fract(x) * 2 - 1);   // 0 at cell centre, 1 at the seam

  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const wu = u + (warp(u, v) - 0.5) * 0.12;
      let n;
      switch (style) {
        case 'smooth':
          n = 0.5 + (coarse(wu, v) - 0.5) * 0.5 + (fine(u, v) - 0.5) * 0.25;
          break;
        case 'papery':
          n = 0.72 + (coarse(wu, v * 0.4) - 0.5) * 0.25 + (fine(u, v) - 0.5) * 0.12;
          break;
        case 'plated': {
          const c = coarse(wu, v);
          const plate = Math.abs(((c * 4) % 1) - 0.5) * 2;      // tight crack lines
          n = 0.35 + 0.65 * Math.pow(plate, 0.6) - (fine(u, v) - 0.5) * 0.2;
          break;
        }
        case 'ribbed': {
          const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 13);
          n = 0.45 + 0.4 * rib + (fine(u, v) - 0.5) * 0.15;
          break;
        }
        case 'ringed': {
          const band = 0.5 + 0.5 * Math.cos(v * Math.PI * 2 * 14 + (warp(u, v) - 0.5) * 2);
          n = 0.4 + 0.45 * Math.pow(band, 1.6) + (fine(u, v) - 0.5) * 0.2;
          break;
        }
        case 'fibrous': {                                       // cedar, redwood
          const f = strands(u + (warp(u, v) - 0.5) * 0.05, v);
          const ridge = 1 - Math.abs(f * 2 - 1);
          n = 0.2 + 0.8 * Math.pow(ridge, 1.35) - (grain(u, v) - 0.5) * 0.18;
          break;
        }
        case 'blocky': {                                        // alligator bark
          const jx = (cells(u, v) - 0.5) * 0.22;
          const jy = (cells(v, u) - 0.5) * 0.22;
          const gx = tri(u * 11 + jx), gy = tri(v * 16 + jy);
          const crack = Math.min(1, Math.min(1 - gx, 1 - gy) * 4.2);
          n = 0.16 + 0.84 * Math.pow(crack, 0.55) - (fine(u, v) - 0.5) * 0.16;
          break;
        }
        case 'diamond': {                                       // ash, interlaced
          const a = Math.abs(Math.sin((u * 9 + v * 5.5) * Math.PI + (warp(u, v) - 0.5) * 2.4));
          const b2 = Math.abs(Math.sin((u * 9 - v * 5.5) * Math.PI + (warp(v, u) - 0.5) * 2.4));
          n = 0.18 + 0.82 * Math.pow(Math.min(a, b2), 0.45) - (fine(u, v) - 0.5) * 0.2;
          break;
        }
        case 'shaggy': {                                        // shagbark hickory
          const band = tri(u * 7 + (cells(u, v * 0.3) - 0.5) * 0.5);
          const lift = strands(u, v * 0.35);
          const edge = Math.min(1, band * 5.5);
          n = 0.22 + 0.6 * edge + 0.28 * lift - (grain(u, v) - 0.5) * 0.2;
          break;
        }
        case 'mottled': {                                       // plane, eucalyptus
          const patch = cells(u + (warp(u, v) - 0.5) * 0.3, v);
          const step = Math.round(patch * 3) / 3;               // flat colour plates
          n = 0.3 + 0.62 * step + (grain(u, v) - 0.5) * 0.14;
          break;
        }
        case 'spiny': {                                         // silk floss, ceiba
          n = 0.55 + (coarse(u, v * 0.6) - 0.5) * 0.3 + (grain(u, v) - 0.5) * 0.12;
          break;
        }
        default: {                                              // ridged
          const c = coarse(wu, v);
          n = 1 - Math.abs(c * 2 - 1);                          // ridged fbm
          n = 0.25 + 0.75 * Math.pow(n, 0.8) - (fine(u, v) - 0.5) * 0.25;
        }
      }
      h[y * size + x] = Math.max(0, Math.min(1, n));
    }
  }

  const base = hex(bark.base), dark = hex(bark.dark), light = hex(bark.light);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);

  const rough = document.createElement('canvas');
  rough.width = rough.height = size;
  const rctx = rough.getContext('2d');
  const rimg = rctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = h[i];
      // Relief and colour are separate knobs: a low-relief bark is still a
      // patterned bark, it just is not deeply grooved.
      const c0 = Math.max(0, Math.min(1, 0.5 + (v - 0.5) * (1.15 + 0.5 * strength)));
      let c = c0 < 0.5 ? mix(dark, base, c0 * 2) : mix(base, light, (c0 - 0.5) * 2);
      // large-scale colour blotching keeps it from looking like one material
      const bl = blotch(x / size, y / size) - 0.5;
      c = [c[0] + bl * 26, c[1] + bl * 22, c[2] + bl * 18];
      const o = i * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      const r = 255 * (0.94 - 0.32 * c0);
      rimg.data[o] = r; rimg.data[o + 1] = r; rimg.data[o + 2] = r; rimg.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // birch lenticels / aspen scarring: short horizontal dashes
  if (bark.streaks) {
    ctx.save();
    for (let i = 0; i < 90 * bark.streaks; i++) {
      const y = rand() * size, w = 8 + rand() * 70, hgt = 1 + rand() * 3.5;
      ctx.fillStyle = `rgba(${dark[0]},${dark[1]},${dark[2]},${0.25 + rand() * 0.55})`;
      ctx.fillRect(rand() * size, y, w, hgt);
      if (rand() < 0.3) ctx.fillRect(rand() * size, y + hgt + 1, w * 0.4, hgt * 0.7);
    }
    ctx.restore();
  }
  if (style === 'spiny') {
    for (let i = 0; i < 110; i++) {
      const x = rand() * size, y = rand() * size, rad = 4 + rand() * 9;
      const g2 = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
      g2.addColorStop(0, `rgba(${light[0]},${light[1]},${light[2]},0.95)`);
      g2.addColorStop(0.55, `rgba(${base[0]},${base[1]},${base[2]},0.8)`);
      g2.addColorStop(1, `rgba(${dark[0]},${dark[1]},${dark[2]},0.85)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(x, y, rad * 0.75, rad, rand() * 0.5 - 0.25, 0, 6.283);
      ctx.fill();
    }
  }
  if (style === 'mottled') {                                  // peeled patch edges
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(${dark[0]},${dark[1]},${dark[2]},${0.18 + rand() * 0.25})`;
      ctx.beginPath();
      const x = rand() * size, y = rand() * size, rad = 18 + rand() * 60;
      ctx.ellipse(x, y, rad, rad * (0.5 + rand()), rand() * 3, 0, 6.283);
      ctx.stroke();
    }
  }
  if (style === 'ribbed') {                                   // cactus areoles
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${dark[0]},${dark[1]},${dark[2]},0.8)`;
      ctx.beginPath();
      ctx.arc(Math.round(rand() * 13) / 13 * size, rand() * size, 1.6 + rand(), 0, 6.283);
      ctx.fill();
    }
  }

  // --- normal map from the height field (Sobel) ---------------------------
  const nrm = document.createElement('canvas');
  nrm.width = nrm.height = size;
  const nctx = nrm.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const scale = 3.2 * strength;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * scale;
      const dy = (at(x, y + 1) - at(x, y - 1)) * scale;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      nimg.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(cv, true), normalMap: tex(nrm, false), roughnessMap: tex(rough, false) };
}

/* -------------------------------------------------------------- leaf ----- */

/**
 * Near-white sheet with venation; the per-leaf colour comes from vertex colours,
 * so one texture serves every palette. `style` picks the vein architecture:
 * pinnate (one midrib with angled secondaries), palmate (several ribs from the
 * base), parallel (monocots and ginkgo), petal (soft radial streaks), plain.
 */
export function makeLeafTexture(style = 'pinnate', size = 256, seed = 7) {
  const rand = mulberry(seed);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // soft mottling so a flat colour never reads as plastic
  const f = makeFbm(6, 6, 3, rand);
  const fineMottle = makeFbm(18, 18, 2, rand);
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (f(x / size, y / size) - 0.5) * 34 + (fineMottle(x / size, y / size) - 0.5) * 12;
      const o = (y * size + x) * 4;
      img.data[o] = 255 + n; img.data[o + 1] = 255 + n * 0.6; img.data[o + 2] = 255 + n;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.lineCap = 'round';
  const rib = 'rgba(118,128,92,0.55)';
  const minor = 'rgba(132,142,106,0.38)';
  const mid = size / 2;

  if (style === 'pinnate') {
    ctx.strokeStyle = rib;
    ctx.lineWidth = size * 0.022;
    ctx.beginPath();
    ctx.moveTo(mid, size);
    ctx.lineTo(mid, size * 0.02);
    ctx.stroke();

    ctx.strokeStyle = minor;
    ctx.lineWidth = size * 0.008;
    for (let i = 1; i < 11; i++) {
      const y = size - (i / 11) * size * 0.94;
      const spread = size * 0.46 * Math.sin(Math.PI * (i / 11));
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid, y);
        ctx.quadraticCurveTo(mid + sgn * spread * 0.6, y - size * 0.02,
          mid + sgn * spread, y - size * 0.09);
        ctx.stroke();
      }
    }
  } else if (style === 'palmate') {
    // several main ribs fanning from the leaf base, each with side veins
    const ribs = 5;
    for (let i = 0; i < ribs; i++) {
      const a = (-0.85 + (1.7 * i) / (ribs - 1));
      const tipX = mid + Math.sin(a) * size * 0.46;
      const tipY = size - Math.cos(a) * size * 0.92;
      ctx.strokeStyle = rib;
      ctx.lineWidth = size * (i === (ribs - 1) / 2 ? 0.02 : 0.014);
      ctx.beginPath();
      ctx.moveTo(mid, size * 0.98);
      ctx.quadraticCurveTo(mid + Math.sin(a) * size * 0.2, size * 0.55, tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = minor;
      ctx.lineWidth = size * 0.006;
      for (let k = 1; k < 5; k++) {
        const u = k / 5;
        const px = mid + (tipX - mid) * u, py = size * 0.98 + (tipY - size * 0.98) * u;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + sgn * size * 0.09 * (1 - u), py - size * 0.05);
          ctx.stroke();
        }
      }
    }
  } else if (style === 'parallel') {
    for (let i = 0; i < 22; i++) {
      const u = (i + 0.5) / 22;
      ctx.strokeStyle = i % 4 === 0 ? rib : minor;
      ctx.lineWidth = size * (i % 4 === 0 ? 0.01 : 0.005);
      ctx.beginPath();
      ctx.moveTo(mid + (u - 0.5) * size * 0.2, size);
      ctx.quadraticCurveTo(mid + (u - 0.5) * size * 0.7, size * 0.5,
        mid + (u - 0.5) * size * 0.95, size * 0.02);
      ctx.stroke();
    }
  } else if (style === 'petal') {
    ctx.strokeStyle = 'rgba(190,150,165,0.42)';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ctx.lineWidth = size * (0.003 + rand() * 0.004);
      ctx.beginPath();
      ctx.moveTo(mid, mid);
      ctx.lineTo(mid + Math.cos(a) * size * 0.5, mid + Math.sin(a) * size * 0.5);
      ctx.stroke();
    }
    const c = ctx.createRadialGradient(mid, mid, 0, mid, mid, size * 0.16);
    c.addColorStop(0, 'rgba(250,225,140,0.85)');
    c.addColorStop(1, 'rgba(250,225,140,0)');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, size, size);
  }

  // darker margin, which is what reads as thickness at a distance
  const g = ctx.createRadialGradient(mid, mid, size * 0.18, mid, mid, size * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(40,45,25,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------- environment ----- */

/** Equirect sky gradient -> PMREM. Gives the PBR materials something to reflect. */
export function makeEnvironment(renderer, { top, horizon, ground, sun, sunPos = 0.72 }) {
  const w = 512, h = 256;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(0.48, horizon);
  g.addColorStop(0.52, ground);
  g.addColorStop(1, ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const sg = ctx.createRadialGradient(w * sunPos, h * 0.26, 2, w * sunPos, h * 0.26, h * 0.45);
  sg.addColorStop(0, sun);
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}
