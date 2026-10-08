import D from './cobena-data.js';
import R from './cobena-relieve.js';

// Relieve real de Cobeña (MDT05 del IGN). El juego sigue razonando en un mundo plano, con las
// alturas medidas desde el suelo: rampas, colisiones y minijuegos no saben nada de cuestas.
// La cota del terreno se suma al dibujar (lift) y el patinete la nota como pendiente (grade).
const RAD = Math.PI / 180;
const CS = R.step / 2; // lado de celda: la rejilla de datos se afina al doble
const NX = R.nx * 2 - 1;
const NZ = R.nz * 2 - 1;
const X0 = R.x0;
const Z0 = R.z0;
const g = new Float32Array(NX * NZ);
const lim = (v, n) => (v < 0 ? 0 : v > n ? n : v);

// Pendiente (dy/dx, dy/dz) del último punto consultado con lift()
export const grade = { x: 0, z: 0 };

// Afinado con Catmull-Rom: las cotas originales se conservan y las intermedias salen suaves
const mid = (a, b, c, d) => (9 * (b + c) - a - d) / 16;
const src = (i, j) => R.h[j * R.nx + lim(i, R.nx - 1)] / 10;
for (let j = 0; j < R.nz; j++) {
  for (let i = 0; i < NX; i++) {
    const k = i >> 1;
    g[j * 2 * NX + i] = i & 1 ? mid(src(k - 1, j), src(k, j), src(k + 1, j), src(k + 2, j)) : src(k, j);
  }
}
const row = (i, j) => g[lim(j, NZ - 1) * NX + i];
for (let j = 1; j < NZ; j += 2) {
  for (let i = 0; i < NX; i++) g[j * NX + i] = mid(row(i, j - 3), row(i, j - 1), row(i, j + 1), row(i, j + 3));
}

// ---------- Explanadas: donde hay rampas, pistas o porterías el terreno se allana ----------
const FLAT = CS * 1.45; // margen que garantiza celdas planas bajo toda la explanada
const BLEND = 70; // y de ahí vuelve poco a poco al terreno natural
const sk = D.places.skate;
const mg = D.places.mega;
const pads = [
  [sk.x, sk.z, sk.w + 6, sk.d + 6, sk.rot],
  [D.places.soccer.x, D.places.soccer.z - 3, 76, 58, 0],
  [D.places.bowling.x, D.places.bowling.z, 50, 52, 0],
  [D.places.plaza.x, D.places.plaza.z, 30, 30, 0],
  [mg.x + 2.5, mg.z + 2, 325, 76, 0],
  ...D.playgrounds.map(([x, z]) => [x, z, 24, 18, 0]),
  ...D.pitches.map(([x, z, w, d, rot]) => [x, z, w + 4, d + 4, rot * RAD]),
].map(([x, z, w, d, rot]) => ({ x, z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot), r: Math.hypot(w, d) / 2 + FLAT, group: null }));
// Distancia de un punto a la explanada (0 dentro)
function padDist(p, x, z) {
  const dx = x - p.x;
  const dz = z - p.z;
  return Math.hypot(Math.max(0, Math.abs(dx * p.c - dz * p.s) - p.hw), Math.max(0, Math.abs(dx * p.s + dz * p.c) - p.hd));
}
// Las explanadas pegadas (pistas contiguas) comparten cota
for (const p of pads) {
  if (p.group) continue;
  p.group = [p];
  for (let k = 0; k < p.group.length; k++) {
    for (const q of pads) {
      if (!q.group && Math.hypot(q.x - p.group[k].x, q.z - p.group[k].z) < q.r + p.group[k].r) {
        q.group = p.group;
        p.group.push(q);
      }
    }
  }
  const grp = p.group;
  const cells = new Map();
  let level = 0;
  for (const q of grp) {
    // Cota de la explanada: la media del centro y las cuatro esquinas
    for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) level += lift(q.x + a * q.hw * q.c + b * q.hd * q.s, q.z - a * q.hw * q.s + b * q.hd * q.c) / (5 * grp.length);
    const e = q.r + BLEND;
    for (let j = lim(Math.floor((q.z - e - Z0) / CS), NZ - 1); j <= lim(Math.ceil((q.z + e - Z0) / CS), NZ - 1); j++) {
      for (let i = lim(Math.floor((q.x - e - X0) / CS), NX - 1); i <= lim(Math.ceil((q.x + e - X0) / CS), NX - 1); i++) {
        const d = padDist(q, X0 + i * CS, Z0 + j * CS);
        if (d >= FLAT + BLEND) continue;
        const t = Math.max(0, (d - FLAT) / BLEND);
        const w = 1 - t * t * (3 - 2 * t);
        const o = j * NX + i;
        if (w > (cells.get(o) || 0)) cells.set(o, w);
      }
    }
  }
  for (const [o, w] of cells) g[o] += (level - g[o]) * w;
}

// ---------- Lejos del pueblo solo hay campos: allí el relieve se simplifica ----------
// Fuera de la zona de detalle las cotas intermedias pasan a ser las del triángulo de una celda
// FAR veces mayor, así el suelo de los campos puede dibujarse con triángulos grandes sin
// dejar rendijas en la unión.
export const FAR = 4;
const snapI = (v, o, up) => (up ? Math.ceil((v - o) / CS / FAR) : Math.floor((v - o) / CS / FAR)) * FAR;
const IA = snapI(D.bounds[0] - 60, X0, false);
const JA = snapI(D.bounds[1] - 60, Z0, false);
const IB = snapI(D.bounds[2] + 60, X0, true);
const JB = snapI(D.bounds[3] + 60, Z0, true);
export const NEAR = { x0: X0 + IA * CS, z0: Z0 + JA * CS, x1: X0 + IB * CS, z1: Z0 + JB * CS };
for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    if (i > IA && i < IB && j > JA && j < JB) continue;
    const ci = Math.min(Math.floor(i / FAR) * FAR, NX - 1 - FAR);
    const cj = Math.min(Math.floor(j / FAR) * FAR, NZ - 1 - FAR);
    const fx = (i - ci) / FAR;
    const fz = (j - cj) / FAR;
    if (!fx && !fz) continue;
    const a = g[cj * NX + ci];
    const b = g[cj * NX + ci + FAR];
    const c = g[(cj + FAR) * NX + ci];
    const d = g[(cj + FAR) * NX + ci + FAR];
    g[j * NX + i] = fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
}

export const TOP = g.reduce((a, b) => Math.max(a, b), 0);

// Cota del terreno en un punto. Cada celda son dos triángulos planos, igual que se dibuja.
export function lift(x, z) {
  const u = (x - X0) / CS;
  const v = (z - Z0) / CS;
  const i = lim(Math.floor(u), NX - 2);
  const j = lim(Math.floor(v), NZ - 2);
  const fx = lim(u - i, 1);
  const fz = lim(v - j, 1);
  const o = j * NX + i;
  const a = g[o];
  const b = g[o + 1];
  const c = g[o + NX];
  const d = g[o + NX + 1];
  if (fx + fz <= 1) {
    grade.x = (b - a) / CS;
    grade.z = (c - a) / CS;
    return a + (b - a) * fx + (c - a) * fz;
  }
  grade.x = (d - c) / CS;
  grade.z = (d - b) / CS;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

// Normal suavizada entre celdas, para que los triángulos no se noten en la luz
const vg = (i, j) => g[lim(j, NZ - 1) * NX + lim(i, NX - 1)];
export function normal(x, z, out) {
  const u = lim((x - X0) / CS, NX - 1.001);
  const v = lim((z - Z0) / CS, NZ - 1.001);
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fx = u - i;
  const fz = v - j;
  let nx = 0;
  let nz = 0;
  for (let b = 0; b < 2; b++) {
    for (let a = 0; a < 2; a++) {
      const w = (a ? fx : 1 - fx) * (b ? fz : 1 - fz);
      nx += w * (vg(i + a - 1, j + b) - vg(i + a + 1, j + b));
      nz += w * (vg(i + a, j + b - 1) - vg(i + a, j + b + 1));
    }
  }
  const l = Math.hypot(nx, 2 * CS, nz);
  out[0] = nx / l;
  out[1] = (2 * CS) / l;
  out[2] = nz / l;
  return out;
}

// Parte de un polígono convexo (x, z seguidos) que cumple a·x + b·z + c >= 0
export function clip(p, a, b, c) {
  const out = [];
  for (let i = 0; i < p.length; i += 2) {
    const k = (i + 2) % p.length;
    const da = a * p[i] + b * p[i + 1] + c;
    const db = a * p[k] + b * p[k + 1] + c;
    if (da >= 0) out.push(p[i], p[i + 1]);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push(p[i] + (p[k] - p[i]) * t, p[i + 1] + (p[k + 1] - p[i + 1]) * t);
    }
  }
  return out;
}

function fan(p, emit) {
  for (let i = 2; i + 3 < p.length; i += 2) {
    if (Math.abs((p[i] - p[0]) * (p[i + 3] - p[1]) - (p[i + 2] - p[0]) * (p[i + 1] - p[1])) < 1e-5) continue;
    emit(p[0], p[1]);
    emit(p[i], p[i + 1]);
    emit(p[i + 2], p[i + 3]);
  }
}

// Trocea un triángulo del suelo por las celdas del relieve: cada trozo queda apoyado en un solo
// triángulo de celda, así todas las capas del suelo casan exactamente con lift().
// emit(x, z) recibe los vértices de tres en tres. k = FAR para los campos de fuera de NEAR.
export function drape(t, emit, k = 1) {
  const cs = CS * k;
  const ni = (NX - 1) / k - 1;
  const nj = (NZ - 1) / k - 1;
  const i0 = lim(Math.floor((Math.min(t[0], t[2], t[4]) - X0) / cs), ni);
  const i1 = lim(Math.floor((Math.max(t[0], t[2], t[4]) - X0) / cs), ni);
  for (let i = i0; i <= i1; i++) {
    const x = X0 + i * cs;
    const col = clip(clip(t, 1, 0, -x), -1, 0, x + cs);
    if (col.length < 6) continue;
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let k = 1; k < col.length; k += 2) {
      zmin = Math.min(zmin, col[k]);
      zmax = Math.max(zmax, col[k]);
    }
    const j1 = lim(Math.floor((zmax - Z0) / cs), nj);
    for (let j = lim(Math.floor((zmin - Z0) / cs), nj); j <= j1; j++) {
      const z = Z0 + j * cs;
      const cell = clip(clip(col, 0, 1, -z), 0, -1, z + cs);
      if (cell.length < 6) continue;
      fan(clip(cell, -1, -1, x + z + cs), emit);
      fan(clip(cell, 1, 1, -(x + z + cs)), emit);
    }
  }
}

// Puntos en los que un segmento cambia de triángulo de celda, extremos incluidos y en orden: entre
// dos seguidos lift() es una recta. emit(x, z) los recibe de uno en uno.
export function crease(ax, az, bx, bz, emit) {
  const u0 = (ax - X0) / CS;
  const v0 = (az - Z0) / CS;
  const du = (bx - ax) / CS;
  const dv = (bz - az) / CS;
  const ts = [0, 1];
  // Las tres familias de rectas de la rejilla: x, z y la diagonal de cada celda
  for (const [o, d] of [[u0, du], [v0, dv], [u0 + v0, du + dv]]) {
    if (Math.abs(d) < 1e-9) continue;
    for (let n = Math.ceil(Math.min(o, o + d)); n <= Math.max(o, o + d); n++) {
      const t = (n - o) / d;
      if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
    }
  }
  ts.sort((a, b) => a - b);
  for (const t of ts) emit(ax + (bx - ax) * t, az + (bz - az) * t);
}
