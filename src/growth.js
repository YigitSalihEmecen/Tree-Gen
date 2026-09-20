/**
 * growth.js — epiphytes: moss, lichen and bracket fungi grown onto a finished tree.
 *
 * Placement is scored, not scattered. Moss favours the shaded side of a trunk,
 * the lower stretch of it, the upper surfaces of near-horizontal limbs and thick
 * wood over twigs. Bracket fungi favour vertical wood, sideways-facing surfaces,
 * the lower half of the trunk, and they stack in short vertical flights the way
 * real conks do. Every form is real 3D geometry, merged into one buffer per
 * material so a mossy tree is still two extra draw calls.
 */

import * as THREE from 'three';

export const MOSS_TYPES = ['mat', 'carpet', 'fuzz', 'cushion', 'lichen', 'beard', 'mixed'];
export const FUNGUS_TYPES = ['bracket', 'turkeytail', 'caps', 'cup', 'mixed'];

/* ------------------------------------------------------------- helpers --- */

const rng = (seed) => {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Cheap smooth 3-D value noise — used to make growth clump into patches. */
function patchNoise(x, y, z) {
  const h = (i, j, k) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let acc = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        const wx = i ? u : 1 - u, wy = j ? v : 1 - v, wz = k ? w : 1 - w;
        acc += h(xi + i, yi + j, zi + k) * wx * wy * wz;
      }
    }
  }
  return acc;
}

const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const mixCol = (a, b, t) => [
  a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t,
];

/* ---------------------------------------------------- mesh accumulator --- */

const M = () => ({ p: [], n: [], c: [] , i: [] });
const nv = (m) => m.p.length / 3;
function vert(m, x, y, z, nx, ny, nz, col) {
  m.p.push(x, y, z); m.n.push(nx, ny, nz); m.c.push(col[0], col[1], col[2]);
}
function quad(m, a, b, c, d) { m.i.push(a, b, c, a, c, d); }

function toGeometry(m) {
  if (!m.i.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(m.c, 3));
  g.setIndex(nv(m) > 65535 ? new THREE.Uint32BufferAttribute(m.i, 1)
                           : new THREE.Uint16BufferAttribute(m.i, 1));
  return g;
}

/* ------------------------------------------------------------ templates -- */
/* Local frame: +Z is the outward surface normal, +Y runs along the branch,
   +X is tangential. Everything lives in roughly a unit box. */

/** One ragged, low lobe of a moss patch. Flat: thickness is a few per cent. */
function lobe(m, rand, lo, hi, seg, ox, oy, rad, thick, ragged, tone) {
  const lift = thick * (0.8 + rand() * 0.5);
  const c = nv(m);
  vert(m, ox, oy, lift, 0, 0, 1, mixCol(lo, hi, tone));
  const rings = 2;
  const phase = rand() * 6.283;
  const bumps = 3 + Math.floor(rand() * 4);
  for (let ri = 1; ri <= rings; ri++) {
    const f = ri / rings;
    for (let si = 0; si < seg; si++) {
      const th = (si / seg) * Math.PI * 2;
      const edge = 1 + ragged * (Math.sin(bumps * th + phase) * 0.5 + (rand() - 0.5) * 0.7);
      const rr = rad * f * Math.max(0.35, edge);
      // a shallow crown, then the rim settles back onto the bark
      const z = ri === rings ? thick * 0.12 : lift * 0.85 + thick * 0.6 * (rand() - 0.5);
      vert(m, ox + rr * Math.cos(th), oy + rr * Math.sin(th) * 0.92, z,
        (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5, 1,
        mixCol(lo, hi, tone * (ri === rings ? 0.45 : 0.85) + 0.12 * rand()));
    }
  }
  const r0 = c + 1, r1 = c + 1 + seg;
  for (let si = 0; si < seg; si++) {
    const n2 = (si + 1) % seg;
    m.i.push(c, r0 + si, r0 + n2);
    quad(m, r0 + si, r0 + n2, r1 + n2, r1 + si);
  }
}

/** Spreading mat — several overlapping lobes creeping across the bark. */
function matMoss(rand, lo, hi, detail) {
  const m = M();
  const n = 3 + Math.floor(rand() * 3);
  const seg = Math.max(7, Math.round(13 * detail));
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.283, d = Math.sqrt(rand()) * 0.5;
    lobe(m, rand, lo, hi, seg, Math.cos(a) * d, Math.sin(a) * d,
      0.5 + rand() * 0.55, 0.07 + rand() * 0.05, 0.3, 0.6 + rand() * 0.4);
  }
  return m;
}

/** A single flat patch — simpler and tidier than the mat. */
function carpetMoss(rand, lo, hi, detail) {
  const m = M();
  const seg = Math.max(8, Math.round(16 * detail));
  lobe(m, rand, lo, hi, seg, 0, 0, 1, 0.08 + rand() * 0.05, 0.26, 0.75 + rand() * 0.25);
  return m;
}

/** Velvet: a flat mat with a dense pile of very short filaments standing on it. */
function fuzzMoss(rand, lo, hi, detail) {
  const m = M();
  const seg = Math.max(7, Math.round(12 * detail));
  lobe(m, rand, lo, hi, seg, 0, 0, 0.95, 0.06, 0.28, 0.55);
  const hairs = Math.max(10, Math.round(34 * detail));
  for (let s = 0; s < hairs; s++) {
    const a = rand() * 6.283, d = Math.sqrt(rand()) * 0.85;
    const bx = Math.cos(a) * d, by = Math.sin(a) * d;
    const h = 0.1 + rand() * 0.13;           // short — pile, not spikes
    const w = 0.05 + rand() * 0.04;
    const base = nv(m);
    for (let k = 0; k < 3; k++) {
      const th = (k / 3) * 6.283 + a;
      vert(m, bx + Math.cos(th) * w, by + Math.sin(th) * w, 0.05,
        Math.cos(th), Math.sin(th), 0.4, mixCol(lo, hi, 0.35));
    }
    vert(m, bx + (rand() - 0.5) * 0.06, by + (rand() - 0.5) * 0.06, h,
      0, 0, 1, mixCol(lo, hi, 1));
    for (let k = 0; k < 3; k++) m.i.push(base + k, base + ((k + 1) % 3), base + 3);
  }
  return m;
}

/** A low swelling cushion — a mound, not a ball. */
function cushionMoss(rand, lo, hi, detail) {
  const m = M();
  const rings = Math.max(3, Math.round(4 * detail));
  const seg = Math.max(7, Math.round(12 * detail));
  const squash = 0.18 + rand() * 0.16;
  const lumps = 2 + Math.floor(rand() * 3);
  const phase = rand() * 6.283;
  for (let ri = 0; ri <= rings; ri++) {
    const phi = (ri / rings) * (Math.PI / 2);
    for (let si = 0; si <= seg; si++) {
      const th = (si / seg) * Math.PI * 2;
      const bump = 1 + 0.2 * Math.sin(lumps * th + phase) * Math.sin(phi * 2);
      const rad = Math.sin(phi) * bump * (0.92 + 0.16 * rand());
      const z = Math.cos(phi) * squash * bump;
      const x = rad * Math.cos(th), y = rad * Math.sin(th);
      const n = new THREE.Vector3(x * squash, y * squash, z / squash).normalize();
      vert(m, x, y, z, n.x, n.y, n.z, mixCol(lo, hi, clamp01(Math.cos(phi) * 1.15)));
    }
  }
  const row = seg + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < seg; si++) {
      const a = ri * row + si;
      quad(m, a, a + 1, a + row + 1, a + row);
    }
  }
  return m;
}

/** Foliose lichen — paler, thinner, more deeply lobed than moss. */
function lichenPatch(rand, lo, hi, detail) {
  const m = M();
  const seg = Math.max(11, Math.round(26 * detail));
  lobe(m, rand, lo, hi, seg, 0, 0, 1, 0.03 + rand() * 0.02, 0.4, 1);
  return m;
}

/** Hanging strands (usnea, Spanish moss) — oriented straight down by the caller. */
function beardMoss(rand, lo, hi, detail) {
  const m = M();
  const strands = Math.max(4, Math.round(11 * detail));
  const links = Math.max(3, Math.round(5 * detail));
  for (let s = 0; s < strands; s++) {
    const a = rand() * 6.283, d = Math.sqrt(rand()) * 0.55;
    let x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0;
    const driftX = (rand() - 0.5) * 0.35, driftZ = (rand() - 0.5) * 0.35;
    const len = (0.6 + rand() * 0.9) / links;
    const w = 0.035 + rand() * 0.03;
    let prev = -1;
    for (let k = 0; k <= links; k++) {
      const t = k / links;
      const ww = w * (1 - t * 0.75);
      const base = nv(m);
      const col = mixCol(lo, hi, 1 - t * 0.8);
      vert(m, x - ww, y, z, 0, 0, 1, col);
      vert(m, x + ww, y, z, 0, 0, 1, col);
      if (prev >= 0) quad(m, prev, prev + 1, base + 1, base);
      prev = base;
      y -= len;
      x += driftX * len; z += driftZ * len;
    }
  }
  return m;
}

/** Shelf fungus: thick at the wall, thin at the rim, zoned in concentric bands. */
function bracketFungus(rand, lo, hi, detail, thin) {
  const m = M();
  const arc = Math.max(5, Math.round((thin ? 15 : 11) * detail));
  const rad = Math.max(2, Math.round((thin ? 5 : 4) * detail));
  const span = (thin ? 1.15 : 0.95) * Math.PI;
  const width = thin ? 1.15 : 1;
  const thick = thin ? 0.06 : 0.17;
  const droop = 0.12 + rand() * 0.22;
  const wave = thin ? 0.12 : 0.05;
  const bands = 3 + Math.floor(rand() * 4);

  const ring = arc + 1;
  for (const side of [1, -1]) {                       // top sheet, then bottom
    for (let ui = 0; ui <= rad; ui++) {
      const u = ui / rad;
      for (let ai = 0; ai <= arc; ai++) {
        const a = -span / 2 + span * (ai / arc);
        const edge = 1 + wave * Math.sin(ai * 2.7 + rand() * 0.02);
        const rr = u * edge * (0.85 + 0.3 * Math.cos(a * 0.8));
        const x = Math.sin(a) * rr * width;
        const z = Math.cos(a) * rr;
        const th = thick * Math.pow(1 - u, 0.7);
        const y = side * th - droop * u * u + 0.04 * Math.sin(u * bands * 3.14) * side;
        const band = side > 0 ? clamp01(0.15 + 0.85 * ((u * bands) % 1)) : 0.1;
        const ny = side;
        const n = new THREE.Vector3(x * 0.25, ny, z * 0.25).normalize();
        vert(m, x, y, z, n.x, n.y, n.z, mixCol(lo, hi, band));
      }
    }
  }
  const sheet = (rad + 1) * ring;
  for (let s = 0; s < 2; s++) {
    for (let ui = 0; ui < rad; ui++) {
      for (let ai = 0; ai < arc; ai++) {
        const a = s * sheet + ui * ring + ai;
        if (s === 0) quad(m, a, a + 1, a + ring + 1, a + ring);
        else quad(m, a, a + ring, a + ring + 1, a + 1);
      }
    }
  }
  // close the rim so the shelf is solid
  for (let ai = 0; ai < arc; ai++) {
    const top = rad * ring + ai;
    const bot = sheet + rad * ring + ai;
    quad(m, top, bot, bot + 1, top + 1);
  }
  return m;
}

function capFungus(rand, lo, hi, detail) {
  const m = M();
  const count = 3 + Math.floor(rand() * 5);
  const seg = Math.max(5, Math.round(9 * detail));
  for (let c = 0; c < count; c++) {
    const a = rand() * 6.283, d = Math.sqrt(rand()) * 0.75;
    const ox = Math.cos(a) * d, oy = Math.sin(a) * d;
    const out = 0.35 + rand() * 0.5;            // how far it stands off the bark
    const capR = 0.3 + rand() * 0.35;
    const rise = 0.25 + rand() * 0.35;
    const stalkR = capR * 0.22;

    const s0 = nv(m);
    for (let k = 0; k <= seg; k++) {            // stalk
      const th = (k / seg) * 6.283;
      const nx = Math.cos(th), ny = Math.sin(th);
      vert(m, ox + nx * stalkR, oy + ny * stalkR, 0.02, nx, ny, 0, mixCol(lo, hi, 0.2));
    }
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * 6.283;
      const nx = Math.cos(th), ny = Math.sin(th);
      vert(m, ox + nx * stalkR * 0.8, oy + ny * stalkR * 0.8 + rise, out,
        nx, ny, 0, mixCol(lo, hi, 0.45));
    }
    for (let k = 0; k < seg; k++) {
      const a0 = s0 + k;
      quad(m, a0, a0 + 1, a0 + seg + 2, a0 + seg + 1);
    }
    const c0 = nv(m);                            // cap: rim ring + apex
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * 6.283;
      const nx = Math.cos(th), ny = Math.sin(th);
      vert(m, ox + nx * capR, oy + ny * capR + rise, out - 0.12,
        nx * 0.5, ny * 0.5, -0.4, mixCol(lo, hi, 0.55));
    }
    const apex = nv(m);
    vert(m, ox, oy + rise, out + 0.16, 0, 0.2, 1, mixCol(lo, hi, 1));
    for (let k = 0; k < seg; k++) m.i.push(c0 + k, c0 + k + 1, apex);
  }
  return m;
}

function cupFungus(rand, lo, hi, detail) {
  const m = M();
  const count = 2 + Math.floor(rand() * 4);
  const seg = Math.max(6, Math.round(11 * detail));
  for (let c = 0; c < count; c++) {
    const a = rand() * 6.283, d = Math.sqrt(rand()) * 0.7;
    const ox = Math.cos(a) * d, oy = Math.sin(a) * d;
    const r = 0.3 + rand() * 0.35;
    const depth = r * (0.5 + rand() * 0.4);
    const base = nv(m);
    vert(m, ox, oy, 0.02, 0, 0, 1, mixCol(lo, hi, 0));
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * 6.283;
      const nx = Math.cos(th), ny = Math.sin(th);
      vert(m, ox + nx * r, oy + ny * r, depth, nx * 0.4, ny * 0.4, 0.8,
        mixCol(lo, hi, 0.8 + 0.2 * rand()));
    }
    for (let k = 0; k < seg; k++) m.i.push(base, base + 1 + k, base + 2 + k);
  }
  return m;
}

/* -------------------------------------------------------------- growing -- */

const MOSS_BUILDERS = {
  mat: matMoss, carpet: carpetMoss, fuzz: fuzzMoss,
  cushion: cushionMoss, lichen: lichenPatch, beard: beardMoss,
};
// 'mixed' never reaches for the hanging strands: usnea is a distinct look, not
// a texture to sprinkle over everything.
const MOSS_MIX = ['mat', 'carpet', 'fuzz', 'cushion', 'lichen'];
const FUNGUS_BUILDERS = {
  bracket: (r, a, b, d) => bracketFungus(r, a, b, d, false),
  turkeytail: (r, a, b, d) => bracketFungus(r, a, b, d, true),
  caps: capFungus, cup: cupFungus,
};

function variants(builders, type, rand, lo, hi, detail, mix, n = 4) {
  const keys = type === 'mixed' ? (mix || Object.keys(builders)) : [type];
  const out = [];
  for (const k of keys) {
    for (let i = 0; i < n; i++) out.push({ kind: k, mesh: builders[k](rand, lo, hi, detail) });
  }
  return out;
}

/**
 * Appends a template into the accumulator under a position/orientation/scale.
 * With `wrapR` the template is bent around a cylinder of that radius about the
 * local branch axis first — without it a flat patch sits on a curved branch as
 * a rigid disc, and from the side it reads as a blade sticking out of the bark.
 */
function stamp(dst, tpl, pos, quat, sx, sy, sz, tint, wrapR = 0) {
  const base = nv(dst);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const count = nv(tpl);
  for (let i = 0; i < count; i++) {
    let px = tpl.p[i * 3] * sx, py = tpl.p[i * 3 + 1] * sy, pz = tpl.p[i * 3 + 2] * sz;
    let nx = tpl.n[i * 3] / sx, ny = tpl.n[i * 3 + 1] / sy, nz = tpl.n[i * 3 + 2] / sz;
    if (wrapR > 0) {
      const th = Math.max(-2.2, Math.min(2.2, px / wrapR));
      const rr = wrapR + pz;
      const ct = Math.cos(th), st = Math.sin(th);
      px = rr * st;
      pz = rr * ct - wrapR;
      const nx2 = nx * ct + nz * st;
      nz = -nx * st + nz * ct;
      nx = nx2;
    }
    v.set(px, py, pz).applyQuaternion(quat);
    n.set(nx, ny, nz).normalize().applyQuaternion(quat);
    dst.p.push(v.x + pos.x, v.y + pos.y, v.z + pos.z);
    dst.n.push(n.x, n.y, n.z);
    dst.c.push(tpl.c[i * 3] * tint, tpl.c[i * 3 + 1] * tint, tpl.c[i * 3 + 2] * tint);
  }
  for (let i = 0; i < tpl.i.length; i++) dst.i.push(base + tpl.i[i]);
}

export const GROWTH_DEFAULTS = {
  enabled: false,
  detail: 1,
  moss: {
    on: true, type: 'mixed', amount: 0.6, reach: 0.55, side: 20, scale: 1,
    colors: ['#87ac57', '#46662a'],
  },
  fungus: {
    on: true, type: 'bracket', amount: 0.4, scale: 1,
    colors: ['#c9b083', '#5d4326'],
  },
  maxMoss: 2600,
  maxFungus: 260,
};

/**
 * @param {object} tree  output of generateTree()
 * @param {object} opts  see GROWTH_DEFAULTS
 * @returns {{moss: THREE.BufferGeometry|null, fungus: THREE.BufferGeometry|null,
 *            counts: {moss:number, fungus:number}}}
 */
export function buildGrowth(tree, opts = {}) {
  const o = {
    ...GROWTH_DEFAULTS, ...opts,
    moss: { ...GROWTH_DEFAULTS.moss, ...(opts.moss || {}) },
    fungus: { ...GROWTH_DEFAULTS.fungus, ...(opts.fungus || {}) },
  };
  const empty = { moss: null, fungus: null, counts: { moss: 0, fungus: 0 } };
  if (!o.enabled || !tree.branches.length) return empty;

  const rand = rng((tree.params.seed >>> 0) * 2654435761 + 17);
  const trunkR = tree.branches[0].radius || 1;
  const H = Math.max(0.5, tree.height);
  const detail = Math.max(0.35, Math.min(1.6, o.detail));

  const mossLo = srgb(o.moss.colors[1]), mossHi = srgb(o.moss.colors[0]);
  const funLo = srgb(o.fungus.colors[1]), funHi = srgb(o.fungus.colors[0]);
  const mossVars = o.moss.on ? variants(MOSS_BUILDERS, o.moss.type, rand, mossLo, mossHi, detail, MOSS_MIX) : [];
  const funVars = o.fungus.on ? variants(FUNGUS_BUILDERS, o.fungus.type, rand, funLo, funHi, detail, null) : [];

  const mossOut = M(), funOut = M();

  const sideA = (o.moss.side || 0) * Math.PI / 180;
  const sideDir = new THREE.Vector3(Math.sin(sideA), 0, Math.cos(sideA));

  const standing = mossVars.filter((v) => v.kind !== 'beard');
  const hanging = mossVars.filter((v) => v.kind === 'beard');

  const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const nrm = new THREE.Vector3(), pos = new THREE.Vector3(), tmp = new THREE.Vector3();

  // --- pass 1: score every candidate site ----------------------------------
  const mossCand = [], funCand = [];
  const samplesPerStation = tree.branches.length > 3000 ? 1
    : tree.branches.length > 900 ? 2 : 3;

  for (const b of tree.branches) {
    const rel = b.radius / trunkR;
    if (rel < 0.035) continue;                      // twigs stay bare
    const pts = b.pts;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      dir.set(c.x - a.x, c.y - a.y, c.z - a.z);
      const segLen = dir.length();
      if (segLen < 1e-5) continue;
      dir.multiplyScalar(1 / segLen);

      // a stable-enough pair of perpendiculars; these decorations are scattered,
      // so frame drift between segments does not matter
      right.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.94) right.set(1, 0, 0);
      right.cross(dir).normalize();
      up.crossVectors(dir, right).normalize();

      const step = Math.max(0.04, (a.r + c.r) * 0.9);
      const stations = Math.max(1, Math.min(60, Math.floor(segLen / step)));

      for (let sIdx = 0; sIdx < stations; sIdx++) {
        const t = (sIdx + 0.5) / stations;
        const px = a.x + (c.x - a.x) * t, py = a.y + (c.y - a.y) * t, pz = a.z + (c.z - a.z) * t;
        const r = a.r + (c.r - a.r) * t;

        for (let k = 0; k < samplesPerStation; k++) {
          const ang = rand() * Math.PI * 2;
          nrm.copy(right).multiplyScalar(Math.cos(ang))
            .addScaledVector(up, Math.sin(ang)).normalize();
          pos.set(px + nrm.x * r * 0.92, py + nrm.y * r * 0.92, pz + nrm.z * r * 0.92);

          const patch = patchNoise(pos.x * 1.5, pos.y * 1.5, pos.z * 1.5);
          const thick = clamp01(rel * 2.6);
          // plain numbers, not Vector3 clones: a big oak throws ~30k candidates
          // and the allocations dominate everything else
          const px2 = pos.x, py2 = pos.y, pz2 = pos.z;
          const nx = nrm.x, ny = nrm.y, nz = nrm.z;
          const dx = dir.x, dy = dir.y, dz = dir.z;

          if (standing.length || hanging.length) {
            tmp.set(nrm.x, 0, nrm.z);
            const side = tmp.lengthSq() > 1e-6
              ? 0.5 + 0.5 * tmp.normalize().dot(sideDir) : 0.5;
            const low = clamp01(1 - pos.y / (H * Math.max(0.05, o.moss.reach)));
            const top = 0.5 + 0.5 * nrm.y;
            mossCand.push({
              px: px2, py: py2, pz: pz2, nx, ny, nz, dx, dy, dz, r,
              s: 0.30 * side + 0.26 * low + 0.17 * top + 0.15 * thick + 0.30 * patch,
              // Hanging strands are a distinct look (usnea, Spanish moss), not
              // something to sprinkle through a mixed carpet — opt in explicitly.
              hang: o.moss.type === 'beard' && hanging.length > 0,
            });
          }

          if (funVars.length && rel > 0.1) {
            const horiz = 1 - Math.abs(nrm.y);
            const low = clamp01(1 - pos.y / (H * 0.8));
            const vertical = Math.abs(dir.y);
            funCand.push({
              px: px2, py: py2, pz: pz2, nx, ny, nz, dx, dy, dz, r,
              s: 0.24 * horiz + 0.22 * low + 0.26 * thick + 0.12 * vertical +
                 0.28 * patchNoise(px2 * 0.7 + 40, py2 * 0.7, pz2 * 0.7),
            });
          }
        }
      }
    }
  }

  // --- pass 2: keep the best sites and grow something on each --------------
  // Taking the top-scoring fraction (rather than thresholding as we walk) means
  // the amount slider maps straight to coverage, and the trunk does not eat the
  // whole budget before the crown is reached.
  const basis = new THREE.Matrix4(), quat = new THREE.Quaternion();
  const yAx = new THREE.Vector3(), xAx = new THREE.Vector3();
  const DOWN = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));

  const sitePos = new THREE.Vector3(), siteN = new THREE.Vector3(), siteD = new THREE.Vector3();
  // Real sizes, in metres. A bracket fungus is a hand's width whether it is on a
  // sapling or a redwood, so size tracks the branch only loosely and is clamped.
  const grow = (out, cands, vars, hangVars, amount, cap, scale, gain, lo2, hi2) => {
    if (!cands.length || (!vars.length && !hangVars.length)) return 0;
    cands.sort((a, b2) => b2.s - a.s);
    // `amount` spends the budget directly: the best-scoring sites are used first,
    // so turning it down thins the growth back to the most plausible spots
    // instead of scattering the same count more sparsely.
    const take = Math.min(cands.length, Math.round(cap * clamp01(amount)));
    for (let i = 0; i < take; i++) {
      const site = cands[i];
      const pool = site.hang ? (hangVars.length ? hangVars : vars) : vars;
      if (!pool.length) continue;
      const tpl = pool[Math.floor(rand() * pool.length)].mesh;
      sitePos.set(site.px, site.py, site.pz);
      siteN.set(site.nx, site.ny, site.nz);
      siteD.set(site.dx, site.dy, site.dz);
      let q;
      if (site.hang) {
        q = DOWN;
      } else {
        yAx.copy(siteD).addScaledVector(siteN, -siteD.dot(siteN));
        if (yAx.lengthSq() < 1e-8) yAx.set(0, 1, 0).addScaledVector(siteN, -siteN.y);
        yAx.normalize();
        xAx.crossVectors(yAx, siteN).normalize();
        basis.makeBasis(xAx, yAx, siteN);
        q = quat.setFromRotationMatrix(basis);
      }
      let sc = scale * Math.min(hi2, Math.max(lo2, gain * site.r)) * (0.7 + rand() * 0.7);
      if (site.hang) sc *= 3.2;                    // strands hang well below the limb
      // flat growth creeps around the branch rather than jutting off it
      const wrap = site.hang ? 0 : Math.max(site.r, 1e-3);
      if (!site.hang) sc = Math.min(sc, site.r * 1.6);
      stamp(out, tpl, sitePos, q, sc, sc, sc, 0.85 + rand() * 0.3, wrap);
    }
    return take;
  };

  const mossN = grow(mossOut, mossCand, standing, hanging,
    o.moss.amount, o.maxMoss, o.moss.scale, 0.7, 0.02, 0.18);
  const funN = grow(funOut, funCand, funVars, [],
    o.fungus.amount, o.maxFungus, o.fungus.scale, 0.55, 0.028, 0.2);

  return {
    moss: toGeometry(mossOut),
    fungus: toGeometry(funOut),
    counts: { moss: mossN, fungus: funN },
  };
}
