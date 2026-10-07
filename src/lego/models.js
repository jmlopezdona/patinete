import * as THREE from 'three';
import { Builder } from './builder.js';
import { C } from './colors.js';

// Bolo gigante (se usa en la bolera y como estatua)
export function addPin(b, x = 0, y = 0, z = 0, s = 1) {
  const seg = 16;
  b.cyl(0.85 * s, 0.5 * s, x, y + 0.25 * s, z, C.white, { r2: 1.0 * s, seg });
  b.cyl(1.0 * s, 1.6 * s, x, y + 1.3 * s, z, C.white, { r2: 1.05 * s, seg });
  b.cyl(1.05 * s, 1.3 * s, x, y + 2.75 * s, z, C.white, { r2: 0.58 * s, seg });
  b.cyl(0.58 * s, 0.45 * s, x, y + 3.62 * s, z, C.red, { r2: 0.5 * s, seg });
  b.cyl(0.5 * s, 0.35 * s, x, y + 4.02 * s, z, C.white, { r2: 0.56 * s, seg });
  b.cyl(0.56 * s, 0.3 * s, x, y + 4.35 * s, z, C.red, { r2: 0.64 * s, seg });
  b.sphere(0.7 * s, x, y + 4.95 * s, z, C.white);
  b.cyl(0.3 * s, 0.25 * s, x, y + 5.7 * s, z, C.white, { seg: 12 });
  return b;
}
export const PIN_H = 5.8;

const TERRACOTTA = 0xb5562f;

// Mobiliario urbano rompible. Devuelve geometría, radio de colisión, colores y premio.
export function propModel(type) {
  const b = new Builder();
  let r = 0.9;
  let colors = [C.lgray];
  let reward = 3;
  switch (type) {
    case 'hydrant':
      b.cyl(0.55, 0.25, 0, 0.125, 0, C.red, { seg: 12 });
      b.cyl(0.4, 1.1, 0, 0.8, 0, C.red, { seg: 12 });
      b.sphere(0.43, 0, 1.4, 0, C.red);
      b.cyl(0.18, 1.15, 0, 0.95, 0, C.lgray, { axis: 'x', seg: 10 });
      b.stud(0, 1.8, 0, C.red);
      colors = [C.red, C.red, C.lgray];
      r = 0.8;
      break;
    case 'bin':
      b.cyl(0.6, 1.5, 0, 0.75, 0, C.green, { r2: 0.74, seg: 12 });
      b.cyl(0.8, 0.2, 0, 1.6, 0, C.dgray, { seg: 12 });
      b.stud(0, 1.7, 0, C.dgray);
      colors = [C.green, C.green, C.dgray];
      break;
    case 'mailbox':
      b.box(0.34, 1.0, 0.34, 0, 0.5, 0, C.dgray);
      b.box(1.2, 1.3, 1.0, 0, 1.65, 0, C.yellow, { r: 0.14 });
      b.box(0.75, 0.12, 0.05, 0, 1.9, 0.5, C.black);
      b.stud(0, 2.3, 0, C.yellow);
      colors = [C.yellow, C.yellow, C.dgray];
      break;
    case 'cone':
      b.box(1.3, 0.16, 1.3, 0, 0.08, 0, C.orange);
      b.cyl(0.5, 1.5, 0, 0.9, 0, C.orange, { r2: 0.1, seg: 12 });
      b.cyl(0.37, 0.3, 0, 0.9, 0, C.white, { r2: 0.29, seg: 12 });
      colors = [C.orange, C.orange, C.white];
      r = 0.8;
      reward = 2;
      break;
    case 'bench':
      for (const sx of [-1, 1]) b.box(0.3, 0.9, 1.0, sx * 1.3, 0.45, 0, C.dgray);
      b.box(3.3, 0.22, 1.15, 0, 1.0, 0, C.brown, { r: 0.05 });
      b.box(3.3, 0.9, 0.22, 0, 1.75, -0.5, C.brown, { r: 0.05 });
      colors = [C.brown, C.brown, C.dgray];
      r = 1.5;
      reward = 4;
      break;
    case 'crate':
      b.box(1.7, 1.7, 1.7, 0, 0.85, 0, C.nougat, { r: 0.06 });
      b.box(1.78, 0.2, 1.78, 0, 0.42, 0, C.brown);
      b.box(1.78, 0.2, 1.78, 0, 1.28, 0, C.brown);
      b.studs(2, 2, 0, 1.7, 0, C.nougat);
      colors = [C.nougat, C.nougat, C.brown];
      r = 1.1;
      reward = 5;
      break;
    case 'flowerpot':
      b.cyl(0.7, 0.9, 0, 0.45, 0, TERRACOTTA, { r2: 0.9, seg: 10 });
      b.cyl(0.86, 0.15, 0, 0.95, 0, C.brown, { seg: 10 });
      [[0.35, 0.1, C.red], [-0.3, 0.3, C.yellow], [-0.05, -0.38, C.pink]].forEach(([dx, dz, col], i) => {
        b.box(0.12, 0.7 + i * 0.2, 0.12, dx, 1.35 + i * 0.1, dz, C.green);
        b.cyl(0.32, 0.25, dx, 1.82 + i * 0.2, dz, col, { seg: 8 });
      });
      colors = [TERRACOTTA, C.green, C.red, C.yellow];
      break;
    case 'barrier':
      for (const sx of [-1, 1]) b.box(0.25, 1.3, 0.9, sx * 1.3, 0.65, 0, C.dgray);
      b.box(3.2, 0.6, 0.2, 0, 1.2, 0, C.white);
      for (let i = 0; i < 4; i++) b.box(0.4, 0.62, 0.22, -1.2 + i * 0.8, 1.2, 0, C.red);
      b.cyl(0.2, 0.25, 1.3, 1.65, 0, C.orange, { seg: 8 });
      colors = [C.white, C.red, C.dgray];
      r = 1.5;
      break;
  }
  return { geo: b.geometry(), r, colors, reward };
}

// Vehículos del tráfico. Adelante es +Z.
export function carModel(kind, color) {
  const b = new Builder();
  const W = 5;
  let L = 10;
  const wheels = (zs) => {
    for (const sx of [-1, 1]) {
      for (const wz of zs) {
        b.cyl(1.0, 0.9, sx * (W / 2 - 0.3), 1.0, wz, C.black, { axis: 'x', seg: 16 });
        b.cyl(0.5, 0.96, sx * (W / 2 - 0.3), 1.0, wz, C.lgray, { axis: 'x', seg: 10 });
      }
    }
  };
  const lights = (zf, zr, y = 2.1) => {
    for (const sx of [-1, 1]) {
      b.box(1.0, 0.5, 0.16, sx * 1.6, y, zf, 0xfff3b0);
      b.box(1.0, 0.45, 0.16, sx * 1.6, y, zr, C.red);
    }
    b.box(W + 0.2, 0.5, 0.5, 0, 1.3, zf - 0.05, C.lgray, { r: 0.1 });
    b.box(W + 0.2, 0.5, 0.5, 0, 1.3, zr + 0.05, C.lgray, { r: 0.1 });
  };
  if (kind === 'bus') {
    L = 15;
    b.box(W, 0.5, L - 0.4, 0, 0.95, 0, C.dgray);
    b.box(W, 3.9, L, 0, 3.1, 0, color, { r: 0.35 });
    b.box(W + 0.08, 1.5, L - 2.4, 0, 3.75, -0.3, C.glassDark);
    b.box(W - 0.6, 1.7, 0.1, 0, 3.6, L / 2 + 0.02, C.glassDark);
    b.box(W - 0.4, 0.3, L - 1, 0, 5.2, 0, C.white, { r: 0.1 });
    b.studs(4, 10, 0, 5.35, 0, C.white);
    lights(L / 2 + 0.02, -L / 2 - 0.02, 1.9);
    wheels([L / 2 - 2.6, -L / 2 + 2.6]);
  } else if (kind === 'truck') {
    L = 12;
    b.box(W, 0.5, L - 0.4, 0, 0.95, 0, C.dgray);
    b.box(W, 3.2, 3.4, 0, 2.8, L / 2 - 1.7, color, { r: 0.3 });
    b.box(W - 0.5, 1.3, 0.12, 0, 3.4, L / 2 + 0.02, C.glassDark);
    b.box(W + 0.06, 1.2, 1.6, 0, 3.4, L / 2 - 1.4, C.glassDark);
    b.box(W, 4.2, L - 4.2, 0, 3.3, -1.9, C.white, { r: 0.12 });
    b.box(W + 0.06, 1.0, L - 5.2, 0, 3.4, -1.9, color);
    b.studs(4, 6, 0, 5.4, -1.9, C.white);
    lights(L / 2 + 0.02, -L / 2 - 0.02, 1.9);
    wheels([L / 2 - 2.0, -L / 2 + 2.2]);
  } else {
    b.box(W, 0.5, L - 0.4, 0, 0.95, 0, C.dgray);
    b.box(W, 1.7, L, 0, 2.0, 0, color, { r: 0.3 });
    b.box(W - 0.5, 1.7, 4.6, 0, 3.65, -0.6, C.glassDark, { r: 0.15 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.36, 1.7, 0.36, sx * (W / 2 - 0.42), 3.65, -0.6 + sz * 2.15, color);
    b.box(W - 0.3, 0.36, 4.9, 0, 4.62, -0.6, color, { r: 0.1 });
    b.studs(4, 4, 0, 4.8, -0.6, color);
    b.box(2.2, 0.6, 0.12, 0, 2.05, L / 2 + 0.03, C.black);
    lights(L / 2 + 0.02, -L / 2 - 0.02);
    wheels([L / 2 - 2.2, -L / 2 + 2.2]);
    if (kind === 'taxi') {
      b.box(1.8, 0.6, 0.7, 0, 5.3, -0.6, C.black, { r: 0.1 });
      for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) b.box(0.06, 0.5, 0.5, sx * (W / 2 + 0.01), 2.3, -1.75 + i * 0.5, i % 2 ? C.black : C.white);
    } else if (kind === 'police') {
      b.box(1.0, 0.45, 0.6, -0.55, 5.25, -0.6, C.blue, { r: 0.1 });
      b.box(1.0, 0.45, 0.6, 0.55, 5.25, -0.6, C.red, { r: 0.1 });
      b.box(W + 0.05, 0.5, L - 3, 0, 2.2, 0, C.blue);
    } else if (kind === 'icecream') {
      b.cyl(0.2, 1.6, 0, 5.9, -0.6, TERRACOTTA, { r2: 0.75, seg: 12 });
      b.sphere(0.85, 0, 7.2, -0.6, C.pink);
      b.sphere(0.6, 0, 8.1, -0.6, C.cream);
    }
  }
  return { geo: b.geometry(), len: L, width: W };
}

// Stud coleccionable (moneda): disco de canto con relieve central
export function studGeometry() {
  const b = new Builder();
  b.cyl(0.62, 0.18, 0, 0, 0, 0xffffff, { axis: 'z', seg: 20 });
  b.cyl(0.4, 0.32, 0, 0, 0, 0xffffff, { axis: 'z', seg: 16 });
  return b.geometry();
}

// Ladrillo dorado 2x4
export function goldBrickGeometry() {
  const b = new Builder();
  b.box(4, 1.2, 2, 0, 0, 0, 0xffffff, { r: 0.08 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.stud(-1.5 + i, 0.6, -0.5 + j, 0xffffff);
  return b.geometry();
}

// Ladrillito 1x1 para escombros y partículas
export function bitGeometry() {
  const b = new Builder();
  b.box(0.8, 0.6, 0.8, 0, 0, 0, 0xffffff);
  b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 8), 0xffffff, 0, 0.39, 0);
  return b.geometry();
}

// Balón de fútbol facetado
export function ballGeometry(r) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const w = new THREE.Color(C.white);
  const k = new THREE.Color(C.black);
  for (let f = 0; f < n / 3; f++) {
    const c = f % 4 === 0 ? k : w;
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (f * 3 + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
