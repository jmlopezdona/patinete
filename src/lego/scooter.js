import * as THREE from 'three';
import { Builder } from './builder.js';
import { C } from './colors.js';
import { plastic, rubber } from './materials.js';

export const WHEEL_R = 0.72;
const WZ_R = -2.35; // eje trasero
const WZ_F = 2.45; // eje delantero
export const STEER_Z = 1.75; // eje de la dirección
export const DECK_Y = 0.97; // altura de la tabla
export const BAR_Y = 4.05; // altura del manillar

function darker(hex, k = 0.62) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

function createWheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.23, 12, 28), rubber);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);
  const b = new Builder();
  b.cyl(0.5, 0.5, 0, 0, 0, C.white, { axis: 'x', seg: 24 });
  b.cyl(0.17, 0.6, 0, 0, 0, C.lgray, { axis: 'x', seg: 12 });
  // Radios de la llanta
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(0.54, 0.06, 0.26, 0, Math.sin(a) * 0.31, Math.cos(a) * 0.31, C.lgray, { rx: -a });
  }
  g.add(b.mesh(plastic));
  return g;
}

// Patinete Technic basado en las fotos: largueros azules con agujeros, losetas grises
// en el centro, guardabarros gris curvado sobre la rueda trasera, horquilla blanca en L,
// conectores negros, columna a rayas gris/blanco y manillar gris en T.
// Adelante es +Z; el origen está en el suelo, entre las dos ruedas.
export function createScooter(deckColor = C.azure) {
  const group = new THREE.Group();
  const b = new Builder();
  const hole = darker(deckColor);

  for (const sx of [-1, 1]) {
    // Largueros azules
    b.box(0.42, 0.5, 4.3, sx * 0.62, 0.72, -0.55, deckColor, { r: 0.12 });
    for (let i = 0; i < 9; i++) b.cyl(0.15, 0.05, sx * 0.835, 0.72, -2.35 + i * 0.47, hole, { axis: 'x', seg: 12 });
    // Horquilla blanca en L
    b.box(0.42, 0.5, 2.55, sx * 1.05, 0.62, 1.72, C.white, { r: 0.12 });
    b.box(0.42, 1.6, 0.5, sx * 1.05, 1.42, 1.5, C.white, { r: 0.12 });
    b.box(0.4, 2.0, 0.5, sx * 0.62, 1.78, 1.75, C.white, { r: 0.12 });
    for (let i = 0; i < 5; i++) {
      b.cyl(0.14, 0.05, sx * 1.265, 0.62, 0.72 + i * 0.5, i === 1 ? C.blue : C.black, { axis: 'x', seg: 12 });
    }
    b.cyl(0.14, 0.05, sx * 1.265, 1.5, 1.5, C.cream, { axis: 'x', seg: 12 });
    b.cyl(0.14, 0.05, sx * 1.265, 1.95, 1.5, C.cream, { axis: 'x', seg: 12 });
    // Pasadores y casquillos
    b.cyl(0.1, 0.34, sx * 1.36, 1.18, 1.5, sx > 0 ? C.blue : C.black, { axis: 'x', seg: 10 });
    b.cyl(0.19, 0.24, sx * 1.4, WHEEL_R, WZ_F, C.lgray, { axis: 'x', seg: 12 });
    b.cyl(0.15, 0.1, sx * 1.56, WHEEL_R, WZ_F, C.lgray, { axis: 'x', seg: 12 });
    // Guardabarros / freno trasero (dos piezas grises dobladas)
    b.box(0.36, 0.4, 1.7, sx * 0.19, 1.36, -1.86, C.lgray, { r: 0.14, rx: 0.62 });
    b.cyl(0.13, 0.05, sx * 0.375, 1.72, -2.36, C.dgray, { axis: 'x', seg: 10 });
    b.cyl(0.13, 0.05, sx * 0.375, 1.44, -1.96, C.dgray, { axis: 'x', seg: 10 });
    // Losetas grises de la tabla
    b.box(0.37, 0.5, 2.95, sx * 0.19, 0.72, 0.12, C.lgray, { r: 0.05 });
    // Bielas negras que sujetan la columna
    b.box(0.2, 0.42, 1.25, sx * 0.24, 2.28, 2.1, C.black, { r: 0.1 });
    b.cyl(0.11, 0.06, sx * 0.34, 2.28, 2.5, C.dgray, { axis: 'x', seg: 10 });
  }
  // Ejes grises que sobresalen, como en el modelo real
  b.cyl(0.09, 2.3, 0, WHEEL_R, WZ_R, C.lgray, { axis: 'x', seg: 8 });
  b.cyl(0.09, 3.1, 0, WHEEL_R, WZ_F, C.lgray, { axis: 'x', seg: 8 });
  b.cyl(0.09, 3.0, 0, 2.5, 1.75, C.lgray, { axis: 'x', seg: 8 });
  b.box(0.5, 0.9, 0.6, 0, 2.2, 1.75, C.black, { r: 0.1 });
  group.add(b.mesh(plastic));

  // Dirección: columna a rayas y manillar en T
  const steer = new THREE.Group();
  steer.position.set(0, 0, STEER_Z);
  const s = new Builder();
  const bands = [
    [2.55, 2.9, C.black],
    [2.9, 3.2, C.lgray],
    [3.2, 3.5, C.white],
    [3.5, 3.72, C.lgray],
    [3.72, 3.95, C.black],
  ];
  for (const [y0, y1, col] of bands) s.cyl(0.2, y1 - y0, 0, (y0 + y1) / 2, 0, col, { seg: 14 });
  s.box(0.06, 0.2, 0.05, 0, 3.82, 0.2, C.yellow);
  s.cyl(0.24, 0.55, 0, BAR_Y, 0, C.black, { axis: 'x', seg: 14 });
  s.cyl(0.1, 3.3, 0, BAR_Y, 0, C.lgray, { axis: 'x', seg: 10 });
  for (const sx of [-1, 1]) {
    s.cyl(0.2, 0.1, sx * 0.36, BAR_Y, 0, C.black, { axis: 'x', seg: 12 });
    s.cyl(0.19, 0.34, sx * 1.52, BAR_Y, 0, C.lgray, { axis: 'x', seg: 12 });
    s.cyl(0.22, 0.07, sx * 1.34, BAR_Y, 0, C.lgray, { axis: 'x', seg: 12 });
  }
  // Conector gris que cuelga de un extremo del manillar
  s.box(0.32, 0.8, 0.36, -1.55, BAR_Y - 0.3, 0, C.lgray, { r: 0.12 });
  s.cyl(0.12, 0.34, -1.55, BAR_Y - 0.52, 0, C.dgray, { axis: 'x', seg: 10 });
  steer.add(s.mesh(plastic));
  group.add(steer);

  const rear = createWheel();
  rear.position.set(0, WHEEL_R, WZ_R);
  group.add(rear);
  const front = createWheel();
  front.position.set(0, WHEEL_R, WZ_F);
  group.add(front);

  return { group, steer, rear, front };
}
