import * as THREE from 'three';
import { C } from '../lego/colors.js';
import { F } from '../lego/batch.js';

// Rejilla de la ciudad: 7 x 7 manzanas de 44 separadas por calles de 14.
export const N = 7;
export const BLOCK = 44;
export const ROAD = 14;
export const PITCH = BLOCK + ROAD;
export const HALF = (N * BLOCK + (N + 1) * ROAD) / 2; // 210
export const ISLAND = 236;
export const BASE = 0.4; // altura de las aceras
export const blockC = (i) => (i - 3) * PITCH;
export const roadC = (k) => (k - 3.5) * PITCH;

// Zonas grandes que fusionan varias manzanas.
export const ZONES = {
  skate: { i0: 4, i1: 5, j0: 4, j1: 5 },
  park: { i0: 0, i1: 1, j0: 4, j1: 5 },
};
export function zoneRect(z) {
  const x0 = blockC(z.i0) - BLOCK / 2;
  const x1 = blockC(z.i1) + BLOCK / 2;
  const z0 = blockC(z.j0) - BLOCK / 2;
  const z1 = blockC(z.j1) + BLOCK / 2;
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
export function zoneOf(i, j) {
  for (const k in ZONES) {
    const z = ZONES[k];
    if (i >= z.i0 && i <= z.i1 && j >= z.j0 && j <= z.j1) return k;
  }
  return null;
}
// ¿El tramo de calle k junto a la manzana m queda dentro de una zona? (vertical: k separa columnas)
function roadInZone(k, m, vertical) {
  for (const key in ZONES) {
    const z = ZONES[key];
    if (vertical) {
      if (k > z.i0 && k <= z.i1 && m >= z.j0 && m <= z.j1) return true;
    } else if (k > z.j0 && k <= z.j1 && m >= z.i0 && m <= z.i1) return true;
  }
  return false;
}

const SIDEWALK = 0xc3c7ca;
const WALLS = [C.tan, C.sandGreen, C.medAzure, C.darkRed, C.white, C.sandBlue, C.nougat, C.yellow, C.olive, C.lightBlue, C.turquoise, C.red, C.orange, C.lavender, C.cream, C.pink];
const ACCENTS = [C.white, C.white, C.cream, C.lgray, C.dgray];
const BASES = [C.dgray, C.stone, C.darkTan, C.white, C.sandBlue, C.brown];
const AWNINGS = [C.red, C.blue, C.green, C.orange, C.turquoise, C.magenta, C.yellow];
const ROOFS = [C.darkRed, C.sandBlue, C.dgray, C.brown, C.turquoise];
const SHOPS = ['HELADERÍA', 'JUGUETES', 'CAFÉ', 'CINE', 'BANCO', 'HOTEL', 'LIBRERÍA', 'PANADERÍA', 'TALLER', 'MÚSICA', 'FLORES', 'MERCADO', 'MUSEO', 'ARCADE', 'TACOS', 'SUSHI', 'BICIS', 'FARMACIA', 'CÓMICS', 'DONUTS', 'PATINES', 'ZAPATOS', 'TEATRO', 'BURGER', 'FRUTERÍA', 'GIMNASIO', 'MASCOTAS', 'ÓPTICA', 'CHURROS', 'RADIO'];
const SIGN_BG = ['#c91a09', '#0055bf', '#237841', '#fe8a18', '#6b3fa0', '#008f9b', '#1b1d21', '#c870a0'];

const G0 = 8; // altura de la planta baja
const FH = 6; // altura del resto de plantas

function faceInfo(w, d, k) {
  const rot = (k * Math.PI) / 2;
  return {
    rot,
    nx: Math.round(Math.sin(rot)),
    nz: Math.round(Math.cos(rot)),
    tx: Math.round(Math.cos(rot)),
    tz: Math.round(-Math.sin(rot)),
    len: k % 2 === 0 ? w : d,
    half: k % 2 === 0 ? d / 2 : w / 2,
  };
}

export function tree(W, x, z, base = BASE, kind = null) {
  const { batch, rng, terrain } = W;
  kind = kind ?? rng.pick(['round', 'round', 'round', 'pine', 'pink']);
  const th = rng.range(3.4, 4.8);
  const rot = rng.pick([0, 0, Math.PI / 4]);
  batch.box(x, base, z, 1, th, 1, C.brown, 0, rot);
  const pal = kind === 'pink' ? [C.pink, C.magenta] : kind === 'pine' ? [C.green, 0x1c6a39] : rng.pick([[C.brightGreen, C.green], [C.lime, C.brightGreen]]);
  const layers = kind === 'pine' ? [5, 5, 3, 3, 1] : [3, 5, 5, 3];
  let y = base + th;
  layers.forEach((s, i) => {
    batch.box(x, y, z, s, 1.2, s, pal[i % 2], F.STUDS, rot);
    y += 1.2;
  });
  terrain.cyl(x, z, 0.75, y);
}

export function lamp(W, x, z, dx, dz, base = BASE) {
  const { batch } = W;
  batch.box(x, base, z, 0.9, 0.4, 0.9, C.dgray, 0);
  batch.box(x, base, z, 0.36, 8, 0.36, C.black, 0);
  batch.box(x + dx * 1.1, base + 7.8, z + dz * 1.1, dx ? 2.5 : 0.3, 0.3, dz ? 2.5 : 0.3, C.black, 0);
  const lx = x + dx * 2.1;
  const lz = z + dz * 2.1;
  batch.box(lx, base + 7.3, lz, 1.1, 0.5, 1.1, 0xfff0b8, F.GLOW);
  W.lamps.push({ x: lx, y: base + 7.3, z: lz });
}

export function addSign(W, text, x, y, z, rot, w, h, bg = '#c91a09', fg = '#ffffff') {
  W.signs.push({ text, x, y, z, rot, w, h, bg, fg });
}

// Edificio modular: planta baja con tienda, plantas con ventanas, cornisas y azotea.
export function building(W, x, z, w, d, front, o = {}) {
  const { batch, terrain, rng } = W;
  const wall = o.wall ?? rng.pick(WALLS);
  const accent = o.accent ?? rng.pick(ACCENTS);
  const base = o.base ?? rng.pick(BASES);
  const floors = o.floors ?? rng.int(2, 5);
  const awn = o.awn ?? [rng.pick(AWNINGS), C.white];
  const glass = rng.chance(0.3) ? C.glassDark : C.glass;
  const litP = rng.range(0.25, 0.6);
  const sill = rng.chance(0.6);
  const H = G0 + (floors - 1) * FH;
  const y0 = BASE;

  batch.box(x, y0, z, w, G0, d, base, F.SEAMS);
  batch.box(x, y0 + G0 - 0.4, z, w + 0.7, 0.4, d + 0.7, accent, 0);
  if (floors > 1) batch.box(x, y0 + G0, z, w, H - G0, d, wall, F.SEAMS);
  // Pilastras en las esquinas
  if (floors > 1 && rng.chance(0.5)) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(x + sx * (w / 2 - 0.4), y0 + G0, z + sz * (d / 2 - 0.4), 1.1, H - G0, 1.1, accent, F.SEAMS);
  }

  for (let k = 0; k < 4; k++) {
    const fi = faceInfo(w, d, k);
    const put = (t, y, off, bw, bh, bd, color, flags = 0) =>
      batch.box(x + fi.tx * t + fi.nx * (fi.half + off), y, z + fi.tz * t + fi.nz * (fi.half + off), bw, bh, bd, color, flags, fi.rot);
    const n = Math.max(1, Math.floor((fi.len - 2) / 4.6));
    const sp = (fi.len - 2) / n;
    // Plantas superiores
    for (let f = 1; f < floors; f++) {
      const fy = y0 + G0 + (f - 1) * FH;
      for (let i = 0; i < n; i++) {
        const t = -(fi.len - 2) / 2 + sp * (i + 0.5);
        put(t, fy + 1.3, 0.1, 2.9, 3.7, 0.2, accent);
        put(t, fy + 1.6, 0.2, 2.3, 3.1, 0.3, glass, F.WINDOW | (rng.chance(litP) ? F.LIT : 0));
        if (sill) put(t, fy + 0.95, 0.3, 3.3, 0.35, 0.6, accent);
      }
    }
    if (k === front) {
      // Puerta, escaparates, toldo y cartel
      put(0, y0, 0.12, 3.1, 5.7, 0.24, accent);
      put(0, y0, 0.2, 2.4, 5.3, 0.3, o.door ?? awn[0]);
      put(0.75, y0 + 2.4, 0.4, 0.25, 0.25, 0.2, C.yellow);
      const sw = (fi.len - 3.1) / 2 - 2.0;
      if (sw > 2) {
        for (const s of [-1, 1]) {
          const t = s * (1.55 + 1.0 + sw / 2);
          put(t, y0 + 1.0, 0.1, sw + 0.6, 4.3, 0.2, accent);
          put(t, y0 + 1.3, 0.2, sw, 3.7, 0.3, C.glass, F.WINDOW | F.LIT);
        }
      }
      const na = Math.floor(fi.len - 2);
      for (let i = 0; i < na; i++) put(-na / 2 + 0.5 + i, y0 + 5.9, 0.95, 1, 0.3, 1.9, awn[i % 2], F.STUDS);
      const text = o.sign ?? rng.pick(SHOPS);
      const sgw = Math.min(fi.len - 3, 11);
      put(0, y0 + 6.35, 0.1, sgw + 0.4, 1.5, 0.2, C.white);
      addSign(W, text, x + fi.nx * (fi.half + 0.22), y0 + 7.1, z + fi.nz * (fi.half + 0.22), fi.rot, sgw, 1.25, o.signBg ?? rng.pick(SIGN_BG));
      W.doors.push({ x: x + fi.nx * (fi.half + 2.6), z: z + fi.nz * (fi.half + 2.6), nx: fi.nx, nz: fi.nz, name: text });
    } else {
      for (let i = 0; i < n; i++) {
        const t = -(fi.len - 2) / 2 + sp * (i + 0.5);
        put(t, y0 + 2.0, 0.1, 2.9, 4.0, 0.2, accent);
        put(t, y0 + 2.3, 0.2, 2.3, 3.4, 0.3, glass, F.WINDOW | (rng.chance(litP) ? F.LIT : 0));
      }
    }
  }

  let top = y0 + H;
  const style = o.roof ?? (floors <= 2 ? rng.pick(['gable', 'gable', 'flat']) : 'flat');
  if (style === 'gable') {
    // Tejado a dos aguas hecho con capas escalonadas
    const rc = rng.pick(ROOFS);
    const alongX = w >= d;
    const span = alongX ? d : w;
    for (let s = 0; span + 1.4 - s * 2 > 0.6; s++) {
      const m = span + 1.4 - s * 2;
      batch.box(x, top, z, alongX ? w + 1.4 : m, 1.2, alongX ? m : d + 1.4, rc, F.STUDS);
      top += 1.2;
    }
  } else {
    batch.box(x, top, z, w + 0.9, 0.5, d + 0.9, accent, F.STUDS);
    top += 0.5;
    const pc = rng.chance(0.5) ? wall : accent;
    batch.box(x, top, z - d / 2 + 0.05, w + 0.9, 1.2, 0.8, pc, F.STUDS | F.SEAMS);
    batch.box(x, top, z + d / 2 - 0.05, w + 0.9, 1.2, 0.8, pc, F.STUDS | F.SEAMS);
    batch.box(x - w / 2 + 0.05, top, z, 0.8, 1.2, d - 0.7, pc, F.STUDS | F.SEAMS);
    batch.box(x + w / 2 - 0.05, top, z, 0.8, 1.2, d - 0.7, pc, F.STUDS | F.SEAMS);
    // Trastos de azotea
    const items = rng.int(1, 3);
    for (let q = 0; q < items; q++) {
      const px = x + rng.range(-w / 2 + 3, w / 2 - 3);
      const pz = z + rng.range(-d / 2 + 3, d / 2 - 3);
      const kind = rng.int(0, 3);
      if (kind === 0) {
        batch.box(px, top, pz, 3, 1.8, 2, C.lgray, F.SEAMS);
        batch.box(px, top + 1.8, pz, 2.6, 0.3, 1.6, C.dgray, F.STUDS);
      } else if (kind === 1) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(px + sx * 1.2, top, pz + sz * 1.2, 0.4, 2, 0.4, C.dgray, 0);
        W.geo.cyl(2, 3.2, px, top + 3.6, pz, C.nougat, { seg: 14 });
        W.geo.cyl(2.1, 1.3, px, top + 5.85, pz, C.brown, { seg: 14, r2: 0.2 });
      } else if (kind === 2) {
        batch.box(px, top, pz, 0.3, 7, 0.3, C.lgray, 0);
        batch.box(px, top + 4.5, pz, 2.2, 0.2, 0.2, C.lgray, 0);
        batch.box(px, top + 7, pz, 0.5, 0.5, 0.5, C.red, F.GLOW);
      } else {
        batch.box(px, top, pz, 4, 0.6, 3, C.brown, 0);
        batch.box(px, top + 0.6, pz, 3.6, 0.5, 2.6, C.brightGreen, F.STUDS);
        batch.box(px - 1, top + 1.1, pz, 1, 1.2, 1, C.lime, F.STUDS);
        batch.box(px + 1, top + 1.1, pz + 0.5, 1, 0.8, 1, C.pink, F.STUDS);
      }
    }
    // Ático retranqueado en edificios altos
    if (floors >= 5 && w > 20 && d > 20 && rng.chance(0.7)) {
      const ew = w - 12;
      const ed = d - 12;
      const eh = rng.int(1, 3) * FH;
      batch.box(x, top, z, ew, eh, ed, wall, F.SEAMS);
      for (let k = 0; k < 4; k++) {
        const fi = faceInfo(ew, ed, k);
        const n = Math.max(1, Math.floor((fi.len - 2) / 4.6));
        const sp = (fi.len - 2) / n;
        for (let f = 0; f < eh / FH; f++) {
          for (let i = 0; i < n; i++) {
            const t = -(fi.len - 2) / 2 + sp * (i + 0.5);
            batch.box(x + fi.tx * t + fi.nx * (fi.half + 0.2), top + f * FH + 1.5, z + fi.tz * t + fi.nz * (fi.half + 0.2), 2.3, 3.1, 0.3, glass, F.WINDOW | (rng.chance(litP) ? F.LIT : 0), fi.rot);
          }
        }
      }
      batch.box(x, top + eh, z, ew + 0.9, 0.5, ed + 0.9, accent, F.STUDS);
      terrain.box(x, z, ew + 0.9, ed + 0.9, top + eh + 0.5);
    }
  }
  terrain.box(x, z, w + 0.7, d + 0.7, top);
  W.map.buildings.push({ x, z, w, d });
  return { top, H: y0 + H };
}

function roads(W) {
  const { batch, rng } = W;
  for (let k = 0; k <= N; k++) {
    const c = roadC(k);
    for (let m = 0; m < N; m++) {
      const mc = blockC(m);
      for (const vertical of [true, false]) {
        if (roadInZone(k, m, vertical)) continue;
        for (const o of [-16, -8, 0, 8, 16]) {
          if (vertical) batch.box(c, 0, mc + o, 0.5, 0.04, 4, C.white, 0);
          else batch.box(mc + o, 0, c, 4, 0.04, 0.5, C.white, 0);
        }
        for (const e of [-19.6, 19.6]) {
          for (let s = 0; s < 6; s++) {
            const q = -5.5 + s * 2.2;
            if (vertical) batch.box(c + q, 0, mc + e, 1.2, 0.04, 3.4, C.white, 0);
            else batch.box(mc + e, 0, c + q, 3.4, 0.04, 1.2, C.white, 0);
          }
        }
        if (rng.chance(0.4)) {
          for (const o of [-12, -4, 4, 12]) W.studs.push(vertical ? { x: c, y: 1.4, z: mc + o, type: 0 } : { x: mc + o, y: 1.4, z: c, type: 0 });
        }
      }
    }
  }
}

const PROP_TYPES = ['hydrant', 'bin', 'mailbox', 'cone', 'bench', 'crate', 'flowerpot', 'barrier'];

// Mobiliario, árboles y farolas en las aceras de una manzana.
export function sidewalkStuff(W, bx, bz, o = {}) {
  const { rng } = W;
  const E = BLOCK / 2;
  for (let side = 0; side < 4; side++) {
    const nx = [0, 1, 0, -1][side];
    const nz = [1, 0, -1, 0][side];
    const tx = nz;
    const tz = -nx;
    const treeAt = rng.pick([-10, 10, 99]);
    for (const t of [-15, -10, -5, 5, 10, 15]) {
      const px = bx + nx * (E - 1.3) + tx * t;
      const pz = bz + nz * (E - 1.3) + tz * t;
      if (t === treeAt && !o.noTrees) {
        tree(W, px, pz);
      } else if (rng.chance(o.propChance ?? 0.36)) {
        W.props.push({ type: rng.pick(PROP_TYPES), x: px, z: pz, rot: Math.atan2(nx, nz), y: BASE });
      }
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lamp(W, bx + sx * (E - 1.2), bz + sz * (E - 1.2), sx, 0);
  W.pedLoops.push({ cx: bx, cz: bz, h: E - 2.6 });
}

function miniPark(W, bx, bz) {
  const { batch, rng } = W;
  batch.box(bx, 0, bz, BLOCK, BASE, BLOCK, SIDEWALK, F.STUDS);
  batch.box(bx, BASE, bz, 36, 0.12, 36, C.brightGreen, F.STUDS);
  batch.box(bx, BASE, bz, 36, 0.16, 4, C.tan, 0);
  batch.box(bx, BASE, bz, 4, 0.16, 36, C.tan, 0);
  W.terrain.box(bx, bz, BLOCK, BLOCK, BASE);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      tree(W, bx + sx * rng.range(6, 9), bz + sz * rng.range(11, 15));
      tree(W, bx + sx * rng.range(11, 15), bz + sz * rng.range(5, 9));
      W.props.push({ type: 'bench', x: bx + sx * 3.4, z: bz + sz * 9, rot: (sx * Math.PI) / 2, y: BASE });
      W.props.push({ type: 'flowerpot', x: bx + sx * 3.2, z: bz + sz * 3.2, rot: 0, y: BASE });
    }
  }
  for (let a = 0; a < 8; a++) W.studs.push({ x: bx + Math.cos((a / 8) * Math.PI * 2) * 6, y: 1.9, z: bz + Math.sin((a / 8) * Math.PI * 2) * 6, type: 1 });
  W.map.blocks.push({ x: bx, z: bz, w: 36, d: 36, color: '#58b35a' });
}

function genericBlock(W, i, j) {
  const { batch, rng, terrain } = W;
  const bx = blockC(i);
  const bz = blockC(j);
  const dist = Math.max(Math.abs(i - 3), Math.abs(j - 3));
  const p = rng();
  if (p < 0.13 && dist >= 1) {
    miniPark(W, bx, bz);
    sidewalkStuff(W, bx, bz, { noTrees: true });
    return;
  }
  batch.box(bx, 0, bz, BLOCK, BASE, BLOCK, SIDEWALK, F.STUDS);
  terrain.box(bx, bz, BLOCK, BLOCK, BASE);
  const fl = () => (dist <= 1 ? rng.int(4, 8) : dist === 2 ? rng.int(3, 5) : rng.int(2, 3));
  if (p < 0.3) {
    building(W, bx, bz, 36, 36, rng.int(0, 3), { floors: fl() + (dist <= 1 ? 2 : 0) });
  } else if (p < 0.6) {
    const alongX = rng.chance(0.5);
    for (const s of [-1, 1]) {
      if (alongX) building(W, bx + s * 10, bz, 16, 36, s > 0 ? 1 : 3, { floors: fl() });
      else building(W, bx, bz + s * 10, 36, 16, s > 0 ? 0 : 2, { floors: fl() });
    }
    for (let t = -12; t <= 12; t += 6) W.studs.push(alongX ? { x: bx, y: 1.9, z: bz + t, type: 1 } : { x: bx + t, y: 1.9, z: bz, type: 1 });
  } else {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const front = rng.chance(0.5) ? (sx > 0 ? 1 : 3) : sz > 0 ? 0 : 2;
        building(W, bx + sx * 10, bz + sz * 10, 16, 16, front, { floors: fl() });
      }
    }
    for (let t = -12; t <= 12; t += 6) {
      W.studs.push({ x: bx + t, y: 1.9, z: bz, type: 1 });
      if (t !== 0) W.studs.push({ x: bx, y: 1.9, z: bz + t, type: 1 });
    }
    W.alleys.push({ x: bx, z: bz });
  }
  sidewalkStuff(W, bx, bz);
  W.map.blocks.push({ x: bx, z: bz, w: BLOCK, d: BLOCK, color: '#c9cdd1' });
}

// Suelo, calles y manzanas genéricas. Las manzanas especiales las crea landmarks.js.
export function buildCity(W, special) {
  const { batch } = W;
  batch.box(0, -3.4, 0, 2600, 2, 2600, C.water, F.STUDS | F.WINDOW);
  batch.box(0, -3.05, 0, ISLAND * 2, 3, ISLAND * 2, C.tan, F.STUDS | F.SEAMS);
  batch.box(0, -0.6, 0, HALF * 2, 0.6, HALF * 2, C.road, 0);
  roads(W);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (zoneOf(i, j)) continue;
      const fn = special[i + ',' + j];
      if (fn) fn(W, blockC(i), blockC(j));
      else genericBlock(W, i, j);
    }
  }
  // Playa: palmeras y sombrillas
  const { rng } = W;
  for (let a = 0; a < 44; a++) {
    const t = rng.range(-HALF, HALF);
    const side = a % 4;
    const off = rng.range(HALF + 6, ISLAND - 5);
    const x = side === 0 ? t : side === 1 ? off : side === 2 ? t : -off;
    const z = side === 0 ? off : side === 1 ? t : side === 2 ? -off : t;
    if (side === 1 && Math.abs(z - roadC(4)) < 22) continue; // zona del muelle despejada
    if (rng.chance(0.6)) palm(W, x, z, 0);
    else {
      batch.box(x, 0, z, 0.3, 4, 0.3, C.white, 0);
      const col = rng.pick([C.red, C.yellow, C.azure, C.orange]);
      batch.box(x, 4, z, 5, 0.4, 5, col, F.STUDS, 0.4);
      batch.box(x, 4.4, z, 3, 0.4, 3, C.white, F.STUDS, 0.4);
      batch.box(x + 2.4, 0, z + 1, 1.6, 0.3, 3.4, rng.pick([C.azure, C.magenta, C.lime]), 0, 0.3);
    }
  }
}

export function palm(W, x, z, base = 0) {
  const { batch, rng, terrain } = W;
  const h = rng.range(6, 9);
  const n = Math.round(h / 1.2);
  let ox = 0;
  for (let s = 0; s < n; s++) {
    batch.box(x + ox, base + s * 1.2, z, 0.9, 1.2, 0.9, s % 2 ? C.darkTan : C.brown, 0);
    ox += 0.12;
  }
  const ty = base + n * 1.2;
  for (let a = 0; a < 4; a++) {
    const r = (a * Math.PI) / 4;
    batch.box(x + ox, ty, z, 7.5, 0.35, 1.1, a % 2 ? C.brightGreen : C.green, F.STUDS, r);
  }
  batch.box(x + ox, ty + 0.35, z, 1.2, 0.5, 1.2, C.lime, F.STUDS);
  terrain.cyl(x, z, 0.8, ty);
}

export const SIDEWALK_COLOR = SIDEWALK;
export { THREE };
