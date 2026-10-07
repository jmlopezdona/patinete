import * as THREE from 'three';
import { C } from '../lego/colors.js';
import { F } from '../lego/batch.js';
import { profileGeo, frustumGeo } from '../lego/builder.js';
import { addPin } from '../lego/models.js';
import { BASE, BLOCK, ZONES, zoneRect, roadC, blockC, building, tree, lamp, palm, addSign, sidewalkStuff, SIDEWALK_COLOR } from './city.js';

const B = BASE;
const RAD = Math.PI / 180;
const CONCRETE = 0x9aa3ab;

// ---------- Piezas de skatepark (geometría visible + primitiva de terreno) ----------

function quarterPts(R, angleDeg, n = 14) {
  const d = R * Math.sin(angleDeg * RAD);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = (d * i) / n;
    pts.push([s - d / 2, R - Math.sqrt(R * R - s * s)]);
  }
  pts.push([d / 2, 0], [-d / 2, 0]);
  return { pts, d, lip: R * (1 - Math.cos(angleDeg * RAD)) };
}

export function addQuarter(W, cx, cz, w, R, angle, rot, base = B, color = C.white, side = C.azure) {
  const q = quarterPts(R, angle);
  W.geo.add(profileGeo(q.pts, w - 0.6), color, cx, base, cz, 0, rot, 0);
  // Laterales de color
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const sx of [-1, 1]) {
    const o = sx * (w / 2 - 0.15);
    W.geo.add(profileGeo(q.pts, 0.3), side, cx + o * c, base, cz - o * s, 0, rot, 0);
  }
  // Coping en el borde superior
  W.geo.cyl(0.22, w, cx + (q.d / 2) * s, base + q.lip, cz + (q.d / 2) * c, C.red, { axis: 'x', ry: rot, seg: 8 });
  W.terrain.quarter(cx, cz, w, R, angle, rot, base);
  return q;
}

export function addWedge(W, cx, cz, w, d, h, rot, base = B, color = C.white, side = C.orange) {
  const pts = [[-d / 2, 0], [d / 2, h], [d / 2, 0]];
  W.geo.add(profileGeo(pts, w - 0.6), color, cx, base, cz, 0, rot, 0);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const sx of [-1, 1]) {
    const o = sx * (w / 2 - 0.15);
    W.geo.add(profileGeo(pts, 0.3), side, cx + o * c, base, cz - o * s, 0, rot, 0);
  }
  W.terrain.wedge(cx, cz, w, d, base, base + h, rot);
}

function addHump(W, cx, cz, w, d, H, rot, base = B, color = C.yellow) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = -d / 2 + (d * i) / 14;
    const c = Math.cos((Math.PI * t) / d);
    pts.push([t, H * c * c]);
  }
  W.geo.add(profileGeo(pts, w), color, cx, base, cz, 0, rot, 0);
  W.terrain.hump(cx, cz, w, d, H, rot, base);
}

function addRail(W, ax, az, bx, bz, y, color = C.yellow) {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(bx - ax, bz - az);
  const bar = new THREE.CylinderGeometry(0.16, 0.16, len, 8);
  bar.rotateX(Math.PI / 2);
  W.geo.add(bar, color, (ax + bx) / 2, y, (az + bz) / 2, 0, rot, 0);
  W.terrain.rail(ax, az, bx, bz, y + 0.16);
  const posts = Math.max(2, Math.round(len / 5) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    const gy = W.terrain.height(px, pz);
    W.geo.box(0.24, y - gy, 0.24, px, (y + gy) / 2, pz, C.dgray);
  }
}

function arch(W, x, z, alongX, span, h, text, bg, color = C.red) {
  const { batch, terrain } = W;
  for (const s of [-1, 1]) {
    const px = x + (alongX ? (s * span) / 2 : 0);
    const pz = z + (alongX ? 0 : (s * span) / 2);
    const base = terrain.height(px, pz);
    batch.box(px, base, pz, 1.6, h, 1.6, color, F.SEAMS | F.STUDS);
    terrain.box(px, pz, 1.6, 1.6, base + h);
  }
  const y = Math.max(terrain.height(x, z), 0) + h - 2.6;
  batch.box(x, y, z, alongX ? span + 1.6 : 1.2, 2.6, alongX ? 1.2 : span + 1.6, C.white, F.STUDS);
  const sw = span - 3;
  if (alongX) {
    addSign(W, text, x, y + 1.3, z + 0.63, 0, sw, 2.1, bg);
    addSign(W, text, x, y + 1.3, z - 0.63, Math.PI, sw, 2.1, bg);
  } else {
    addSign(W, text, x + 0.63, y + 1.3, z, Math.PI / 2, sw, 2.1, bg);
    addSign(W, text, x - 0.63, y + 1.3, z, -Math.PI / 2, sw, 2.1, bg);
  }
}

// ---------- Plaza central con la fuente del patinete dorado ----------

function plaza(W, bx, bz) {
  const { batch, terrain, geo } = W;
  batch.box(bx, 0, bz, BLOCK, B, BLOCK, C.tan, F.STUDS);
  terrain.box(bx, bz, BLOCK, BLOCK, B);
  for (let a = -4; a <= 4; a++) {
    for (let b = -4; b <= 4; b++) {
      if ((a + b) & 1 && Math.hypot(a, b) > 2.4) batch.box(bx + a * 4, B, bz + b * 4, 4, 0.05, 4, C.cream, 0);
    }
  }
  geo.cyl(8.2, 1.5, bx, B + 0.75, bz, C.lgray, { seg: 32 });
  geo.cyl(8.5, 0.3, bx, B + 1.5, bz, C.white, { seg: 32 });
  geo.cyl(7.5, 0.2, bx, B + 1.62, bz, C.water, { seg: 32 });
  geo.cyl(3.6, 3.4, bx, B + 1.7, bz, C.white, { seg: 24 });
  geo.cyl(4.0, 0.5, bx, B + 3.5, bz, C.lgray, { seg: 24 });
  terrain.cyl(bx, bz, 8.5, B + 1.8);
  terrain.cyl(bx, bz, 4.0, B + 3.75);
  // Chorros de agua de ladrillitos
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2;
    for (let t = 0; t < 5; t++) {
      const r = 4.2 + t * 0.62;
      batch.box(bx + Math.cos(a) * r, B + 1.7 + Math.sin((t / 4.6) * Math.PI) * 2.6, bz + Math.sin(a) * r, 0.5, 0.5, 0.5, 0x7fc8f2, F.WINDOW, a);
    }
  }
  W.extras.push({ kind: 'statue', x: bx, y: B + 3.75, z: bz });
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2 + Math.PI / 8;
    W.props.push({ type: j % 2 ? 'bench' : 'flowerpot', x: bx + Math.sin(a) * 13.5, z: bz + Math.cos(a) * 13.5, rot: a + Math.PI, y: B });
  }
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    W.studs.push({ x: bx + Math.sin(a) * 10.8, y: B + 1.5, z: bz + Math.cos(a) * 10.8, type: 1 });
  }
  // Banderas
  const flags = [C.red, C.yellow, C.azure, C.lime];
  let fi = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = bx + sx * 15.5;
      const z = bz + sz * 15.5;
      batch.box(x, B, z, 0.8, 0.5, 0.8, C.dgray, 0);
      batch.box(x, B, z, 0.28, 13, 0.28, C.white, 0);
      batch.box(x + 1.7, B + 10.8, z, 3.2, 2, 0.14, flags[fi++], 0);
    }
  }
  sidewalkStuff(W, bx, bz, { noTrees: true, propChance: 0.12 });
  W.places.spawn = { x: bx - 9, z: bz + 17, heading: Math.PI };
  W.places.plaza = { x: bx, z: bz };
  W.map.blocks.push({ x: bx, z: bz, w: BLOCK, d: BLOCK, color: '#ead9ad' });
}

// ---------- Rascacielos ----------

function tower(W, bx, bz) {
  const { batch, terrain, rng } = W;
  batch.box(bx, 0, bz, BLOCK, B, BLOCK, SIDEWALK_COLOR, F.STUDS);
  terrain.box(bx, bz, BLOCK, BLOCK, B);
  batch.box(bx, B, bz, 34, 9, 34, C.stone, F.SEAMS);
  batch.box(bx, B + 9, bz, 35, 0.6, 35, C.white, F.STUDS);
  terrain.box(bx, bz, 35, 35, B + 9.6);
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    const nx = Math.round(Math.sin(rot));
    const nz = Math.round(Math.cos(rot));
    const tx = Math.round(Math.cos(rot));
    const tz = Math.round(-Math.sin(rot));
    // Escaparates del zócalo
    for (let i = -2; i <= 2; i++) {
      if (k === 0 && i === 0) continue;
      batch.box(bx + tx * i * 6.4 + nx * 17.1, B + 1.4, bz + tz * i * 6.4 + nz * 17.1, 5, 5.6, 0.3, C.glass, F.WINDOW | F.LIT, rot);
    }
    // Muro cortina
    for (let f = 0; f < 13; f++) {
      for (let i = 0; i < 4; i++) {
        const t = -7.5 + i * 5;
        batch.box(bx + tx * t + nx * 11.1, B + 10.6 + f * 6, bz + tz * t + nz * 11.1, 4.3, 4.9, 0.3, f % 4 === 3 ? C.medAzure : C.glassDark, F.WINDOW | (rng.chance(0.45) ? F.LIT : 0), rot);
      }
    }
  }
  batch.box(bx, B, bz + 17.15, 4.4, 6.4, 0.3, C.white, 0);
  batch.box(bx, B, bz + 17.25, 3.6, 6.0, 0.3, C.glassDark, F.WINDOW);
  addSign(W, 'TORRE BRICK', bx, B + 7.8, bz + 17.3, 0, 12, 1.6, '#1b1d21', '#ffd23a');
  const TH = 13 * 6;
  batch.box(bx, B + 9.6, bz, 22, TH, 22, C.white, F.SEAMS);
  batch.box(bx, B + 9.6 + TH, bz, 23, 0.8, 23, C.lgray, F.STUDS);
  batch.box(bx, B + 10.4 + TH, bz, 15, 8, 15, C.sandBlue, F.SEAMS | F.STUDS);
  batch.box(bx, B + 18.4 + TH, bz, 9, 6, 9, C.white, F.SEAMS | F.STUDS);
  batch.box(bx, B + 24.4 + TH, bz, 0.8, 20, 0.8, C.lgray, 0);
  batch.box(bx, B + 44.4 + TH, bz, 1.2, 1.2, 1.2, C.red, F.GLOW);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) batch.box(bx + sx * 6.8, B + 18.4 + TH, bz + sz * 6.8, 0.6, 0.6, 0.6, C.red, F.GLOW);
  terrain.box(bx, bz, 23, 23, B + 10.4 + TH);
  W.doors.push({ x: bx, z: bz + 20, nx: 0, nz: 1, name: 'TORRE BRICK' });
  sidewalkStuff(W, bx, bz);
  W.map.blocks.push({ x: bx, z: bz, w: BLOCK, d: BLOCK, color: '#c9cdd1' });
  W.map.buildings.push({ x: bx, z: bz, w: 34, d: 34 });
}

// ---------- Pizzería ----------

function pizzaBlock(W, bx, bz) {
  const { batch, terrain, geo } = W;
  batch.box(bx, 0, bz, BLOCK, B, BLOCK, SIDEWALK_COLOR, F.STUDS);
  terrain.box(bx, bz, BLOCK, BLOCK, B);
  const r = building(W, bx + 10, bz, 16, 36, 1, {
    floors: 2, wall: C.cream, base: C.red, accent: C.white, sign: 'PIZZERÍA', signBg: '#237841', awn: [C.red, C.white], door: C.green, roof: 'flat',
  });
  // Pizza gigante en la azotea
  const px = bx + 15;
  const py = r.top + 6.5;
  batch.box(px - 1.2, r.top, bz, 0.8, 3, 0.8, C.dgray, 0);
  geo.cyl(5.2, 0.7, px, py, bz, C.nougat, { axis: 'x', seg: 28 });
  geo.cyl(4.6, 0.8, px, py, bz, C.red, { axis: 'x', seg: 28 });
  geo.cyl(4.2, 0.9, px, py, bz, C.yellow, { axis: 'x', seg: 28 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    geo.cyl(0.8, 1.0, px, py + Math.sin(a) * 2.6, bz + Math.cos(a) * 2.6, C.darkRed, { axis: 'x', seg: 10 });
  }
  geo.cyl(0.7, 1.0, px, py, bz, C.darkRed, { axis: 'x', seg: 10 });
  building(W, bx - 10, bz - 10, 16, 16, 3, {});
  building(W, bx - 10, bz + 10, 16, 16, 3, {});
  sidewalkStuff(W, bx, bz);
  W.places.pizza = { x: bx + 20, z: bz + 9 };
  W.map.blocks.push({ x: bx, z: bz, w: BLOCK, d: BLOCK, color: '#c9cdd1' });
}

// ---------- Bolera gigante ----------

function bowling(W, bx, bz) {
  const { batch, terrain, geo } = W;
  batch.box(bx, 0, bz, BLOCK, B, BLOCK, C.sandBlue, F.STUDS);
  terrain.box(bx, bz, BLOCK, BLOCK, B);
  batch.box(bx, B, bz - 1, 16, 0.1, 40, 0xd9a066, 0);
  for (let i = -3; i <= 3; i++) batch.box(bx + i * 2, B + 0.1, bz - 1, 0.1, 0.02, 40, 0xb07a45, 0);
  for (let i = -2; i <= 2; i++) batch.box(bx + i * 2.2, B + 0.1, bz + 6 - Math.abs(i) * 1.5, 0.5, 0.03, 1.6, C.darkRed, 0);
  for (const sx of [-1, 1]) {
    batch.box(bx + sx * 8.75, B, bz - 1, 1.5, 2.2, 40, C.red, F.SEAMS | F.STUDS);
    batch.box(bx + sx * 8.75, B + 2.2, bz - 1, 1.5, 0.4, 40, C.white, F.STUDS);
    terrain.box(bx + sx * 8.75, bz - 1, 1.5, 40, B + 2.6);
  }
  batch.box(bx, B, bz - 21, 19, 7, 2, C.dgray, F.SEAMS | F.STUDS);
  terrain.box(bx, bz - 21, 19, 2, B + 7);
  batch.box(bx, B + 7, bz - 21, 16, 3.6, 1, C.white, 0);
  addSign(W, 'BOLERA', bx, B + 8.8, bz - 20.45, 0, 15, 3, '#0055bf', '#ffd23a');
  arch(W, bx, bz + 20.5, true, 19, 10, 'BOLOS GIGANTES', '#c91a09', C.blue);
  // Bola y bolo gigantes de adorno
  geo.sphere(4, bx - 15.5, B + 4, bz + 4, C.blue, { seg: 24, seg2: 16 });
  for (const [dx, dy, dz] of [[0.9, 2.6, 2.6], [-0.9, 2.6, 2.6], [0, 1.2, 3.6]]) geo.sphere(0.6, bx - 15.5 + dx, B + 4 + dy, bz + 4 + dz, C.black);
  terrain.cyl(bx - 15.5, bz + 4, 3.4, B + 7.5);
  addPin(geo, bx + 15.5, B, bz + 4, 1.9);
  terrain.cyl(bx + 15.5, bz + 4, 2.1, B + 11);
  for (const sx of [-1, 1]) {
    tree(W, bx + sx * 15.5, bz - 12);
    lamp(W, bx + sx * 12, bz + 16, -sx, 0);
  }
  sidewalkStuff(W, bx, bz, { noTrees: true, propChance: 0.1 });
  W.places.bowling = { x: bx, z: bz + 17, heading: Math.PI, pinX: bx, pinZ: bz - 8, laneX0: bx - 8, laneX1: bx + 8, backZ: bz - 20, marker: { x: bx, z: bz + 23.5 } };
  W.map.blocks.push({ x: bx, z: bz, w: BLOCK, d: BLOCK, color: '#7f93bd' });
}

// ---------- Skatepark ----------

function skatepark(W) {
  const { batch, terrain, geo } = W;
  const R = zoneRect(ZONES.skate);
  const cx = R.cx;
  const cz = R.cz;
  batch.box(cx, 0, cz, R.w, B, R.d, CONCRETE, F.STUDS);
  terrain.box(cx, cz, R.w, R.d, B);
  for (const s of [-1, 1]) {
    batch.box(cx, B, cz + s * (R.d / 2 - 1), R.w, 0.06, 2, C.azure, F.STUDS);
    batch.box(cx + s * (R.w / 2 - 1), B, cz, 2, 0.06, R.d - 4, C.azure, F.STUDS);
  }
  // Cuadros de color en el suelo
  for (let i = -5; i <= 5; i++) {
    for (let j = -5; j <= 5; j++) {
      if ((i * 7 + j * 13) % 9 === 0) batch.box(cx + i * 9, B, cz + j * 9, 9, 0.03, 9, 0x8a939c, F.STUDS);
    }
  }

  // 1. Half-pipe
  const hx = cx - 30;
  const q = addQuarter(W, hx, cz + 7 + 5.23, 30, 11, 72, 0, B, C.white, C.azure);
  addQuarter(W, hx, cz - 7 - 5.23, 30, 11, 72, Math.PI, B, C.white, C.azure);
  const dv = 7 + q.d;
  for (const s of [-1, 1]) {
    batch.box(hx, B, cz + s * (dv + 2.5), 30, q.lip, 5, C.azure, F.SEAMS | F.STUDS);
    terrain.box(hx, cz + s * (dv + 2.5), 30, 5, B + q.lip);
    addWedge(W, hx, cz + s * (dv + 5 + 7), 30, 14, q.lip, s > 0 ? Math.PI : 0, B, C.white, C.orange);
    for (let i = -2; i <= 2; i++) W.studs.push({ x: hx + i * 5, y: B + q.lip + 5, z: cz + s * (dv - 1.5), type: 1 });
  }
  W.bricks.push({ x: hx, y: B + q.lip + 1.8, z: cz - dv - 2.5 });
  W.spectators.push({ x: hx - 11, y: B + q.lip, z: cz + dv + 3, rot: Math.PI }, { x: hx + 9, y: B + q.lip, z: cz + dv + 3.4, rot: Math.PI }, { x: hx + 12, y: B + q.lip, z: cz - dv - 3, rot: 0 });

  // 2. Bowl circular
  const bwx = cx + 23;
  const bwz = cz - 24;
  const r0 = 8;
  const BR = 8.5;
  const bd = BR * Math.sin(65 * RAD);
  const bl = BR * (1 - Math.cos(65 * RAD));
  const pts = [new THREE.Vector2(0.01, 0.03), new THREE.Vector2(r0, 0.03)];
  for (let i = 1; i <= 12; i++) {
    const s = (bd * i) / 12;
    pts.push(new THREE.Vector2(r0 + s, BR - Math.sqrt(BR * BR - s * s)));
  }
  pts.push(new THREE.Vector2(r0 + bd + 3, bl), new THREE.Vector2(r0 + bd + 11, 0));
  geo.add(new THREE.LatheGeometry(pts, 56), C.white, bwx, B, bwz);
  const cop = new THREE.TorusGeometry(r0 + bd, 0.22, 8, 64);
  cop.rotateX(Math.PI / 2);
  geo.add(cop, C.red, bwx, B + bl, bwz);
  const cop2 = new THREE.TorusGeometry(r0 + bd + 3, 0.22, 8, 64);
  cop2.rotateX(Math.PI / 2);
  geo.add(cop2, C.yellow, bwx, B + bl, bwz);
  terrain.bowl(bwx, bwz, r0, BR, 65, B);
  terrain.ring(bwx, bwz, r0 + bd, r0 + bd + 3, B + bl);
  terrain.rcone(bwx, bwz, r0 + bd + 3, r0 + bd + 11, B + bl, B);
  for (let j = 0; j < 10; j++) {
    const a = (j / 10) * Math.PI * 2;
    W.studs.push({ x: bwx + Math.cos(a) * 5, y: B + 1.5, z: bwz + Math.sin(a) * 5, type: 1 });
  }
  W.bricks.push({ x: bwx, y: B + 1.8, z: bwz });

  // 3. Funbox con barandilla
  const fx = cx + 22;
  const fz = cz + 18;
  geo.add(frustumGeo(26, 18, 12, 5, 3), C.orange, fx, B, fz);
  geo.box(11.6, 0.06, 4.6, fx, B + 3.02, fz, C.white);
  terrain.pyramid(fx, fz, 26, 18, 12, 5, 3, 0, B);
  addRail(W, fx - 6, fz, fx + 6, fz, B + 4.3, C.yellow);
  W.bricks.push({ x: fx, y: B + 7.4, z: fz });

  // 4. Mesa de salto
  const jz = cz + 41;
  const k = addQuarter(W, cx - 4, jz, 10, 14, 36, Math.PI / 2, B, C.white, C.lime);
  const kx1 = cx - 4 + k.d / 2;
  batch.box(kx1 + 6, B, jz, 12, k.lip, 10, C.lime, F.SEAMS | F.STUDS);
  terrain.box(kx1 + 6, jz, 12, 10, B + k.lip);
  addWedge(W, kx1 + 17, jz, 10, 10, k.lip, -Math.PI / 2, B, C.white, C.lime);
  for (let i = 0; i < 5; i++) W.studs.push({ x: kx1 + 1 + i * 2.5, y: B + k.lip + 2.5 + Math.sin((i / 4) * Math.PI) * 2.2, z: jz, type: i === 2 ? 2 : 1 });
  W.bricks.push({ x: kx1 + 6, y: B + k.lip + 6.2, z: jz });

  // 5. Rollers
  for (let i = 0; i < 4; i++) addHump(W, cx + 43, cz + 11 + i * 10, 10, 8, 1.5, 0, B, i % 2 ? C.yellow : C.orange);

  // 6. Barandilla larga y cajón
  addRail(W, cx - 7, cz - 18, cx - 7, cz + 10, B + 1.7, C.red);
  batch.box(cx + 2, B, cz - 8, 5, 0.9, 16, C.dgray, F.STUDS | F.SEAMS);
  terrain.box(cx + 2, cz - 8, 5, 16, B + 0.9);
  addRail(W, cx - 0.4, cz - 16, cx - 0.4, cz, B + 0.95, C.lgray);

  arch(W, cx, R.z0 + 1.2, true, 24, 11, 'SKATEPARK', '#fe8a18', C.purple);
  for (const [dx, dz] of [[-47, 47], [47, 47], [-47, -47]]) {
    batch.box(cx + dx, B, cz + dz, 5, 0.9, 5, C.brown, F.STUDS);
    terrain.box(cx + dx, cz + dz, 5, 5, B + 0.9);
    tree(W, cx + dx, cz + dz, B + 0.9);
  }
  for (const [dx, dz] of [[-12, -47], [12, -47], [-48, 0], [0, 48], [48, -1]]) lamp(W, cx + dx, cz + dz, dx < 0 ? 1 : -1, 0);
  W.props.push({ type: 'cone', x: cx - 12, z: cz + 30, rot: 0, y: B }, { type: 'cone', x: cx - 10, z: cz + 33, rot: 0, y: B }, { type: 'barrier', x: cx + 6, z: cz + 30, rot: 0.4, y: B }, { type: 'bench', x: cx + 8, z: cz - 44, rot: 0, y: B }, { type: 'bin', x: cx + 12, z: cz - 44, rot: 0, y: B }, { type: 'crate', x: cx - 14, z: cz - 40, rot: 0.3, y: B });
  W.pedLoops.push({ cx, cz, h: R.w / 2 - 1.2 });
  W.places.trick = { x: cx, z: R.z0 + 9, heading: 0, marker: { x: cx + 9, z: R.z0 + 6 }, rect: R };
  W.map.blocks.push({ x: cx, z: cz, w: R.w, d: R.d, color: '#f2a65a' });
}

// ---------- Parque con campo de fútbol, estanque y columpios ----------

function park(W) {
  const { batch, terrain, geo, rng } = W;
  const R = zoneRect(ZONES.park);
  const cx = R.cx;
  const cz = R.cz;
  batch.box(cx, 0, cz, R.w, B, R.d, C.brightGreen, F.STUDS);
  terrain.box(cx, cz, R.w, R.d, B);
  batch.box(cx, B, R.z0 + 27, 5, 0.08, 54, C.tan, 0);
  batch.box(cx, B, cz - 12, R.w - 4, 0.08, 5, C.tan, 0);

  // Campo de fútbol
  const fx = cx;
  const fz = cz + 25;
  for (let i = 0; i < 8; i++) batch.box(fx - 28 + i * 8, B, fz, 8, 0.1, 40, i % 2 ? 0x3f9a48 : 0x5cb85f, F.STUDS);
  const line = (x, z, w, d) => batch.box(x, B + 0.1, z, w, 0.04, d, C.white, 0);
  line(fx, fz - 19.6, 64, 0.5);
  line(fx, fz + 19.6, 64, 0.5);
  line(fx - 31.6, fz, 0.5, 39.6);
  line(fx + 31.6, fz, 0.5, 39.6);
  line(fx, fz, 0.5, 39.6);
  for (let a = 0; a < 20; a++) {
    const t = (a / 20) * Math.PI * 2;
    batch.box(fx + Math.cos(t) * 6, B + 0.1, fz + Math.sin(t) * 6, 0.5, 0.04, 2, C.white, 0, -t);
  }
  for (const s of [-1, 1]) {
    line(fx + s * 24, fz, 0.5, 20);
    line(fx + s * 28, fz - 10, 8, 0.5);
    line(fx + s * 28, fz + 10, 8, 0.5);
    // Porterías
    const gx = fx + s * 29;
    for (const sz of [-1, 1]) {
      batch.box(gx, B, fz + sz * 6, 0.6, 5, 0.6, C.white, 0);
      batch.box(gx + s * 1.5, B + 4.6, fz + sz * 6, 3, 0.4, 0.4, C.white, 0);
    }
    batch.box(gx, B + 4.6, fz, 0.6, 0.6, 12.6, C.white, 0);
    for (let i = -2; i <= 2; i++) batch.box(gx + s * 2.9, B, fz + i * 3, 0.15, 4.8, 0.15, C.lgray, 0);
    for (let i = 1; i <= 3; i++) batch.box(gx + s * 2.9, B + i * 1.2, fz, 0.15, 0.15, 12, C.lgray, 0);
    // Vallas
    batch.box(fx + s * 33, B, fz, 1, 1.8, 42, C.white, F.SEAMS | F.STUDS);
    terrain.box(fx + s * 33, fz, 1, 42, B + 1.8);
    for (const sz of [-1, 1]) {
      batch.box(fx + s * 18.75, B, fz + sz * 21, 29.5, 1.8, 1, sz * s > 0 ? C.azure : C.white, F.SEAMS | F.STUDS);
      terrain.box(fx + s * 18.75, fz + sz * 21, 29.5, 1, B + 1.8);
    }
  }
  W.bricks.push({ x: fx - 30.6, y: B + 1.8, z: fz });
  W.places.soccer = {
    cx: fx, cz: fz, x0: fx - 32.5, x1: fx + 32.5, z0: fz - 20.5, z1: fz + 20.5, goalX: fx + 29, westGoalX: fx - 29, gz0: fz - 6, gz1: fz + 6,
    start: { x: fx - 20, z: fz, heading: Math.PI / 2 }, marker: { x: cx + 9, z: fz - 26 },
  };

  // Estanque con isleta y patos
  const px = cx - 25;
  const pz = cz - 26;
  geo.cyl(13.2, 0.1, px, B + 0.05, pz, C.tan, { seg: 36 });
  geo.cyl(12, 0.16, px, B + 0.08, pz, C.water, { seg: 36 });
  geo.cyl(2.8, 0.5, px, B + 0.25, pz, C.lime, { seg: 16 });
  W.bricks.push({ x: px, y: B + 2.2, z: pz });
  W.splash.push({ x: px, z: pz, r: 12 });
  for (const [dx, dz, r] of [[5, 4, 0.5], [-6, 2, 2.2], [3, -7, 4]]) {
    const c = Math.cos(r);
    const s = Math.sin(r);
    batch.box(px + dx, B + 0.16, pz + dz, 1, 0.6, 1.5, C.yellow, 0, r);
    batch.box(px + dx + s * 0.6, B + 0.76, pz + dz + c * 0.6, 0.7, 0.6, 0.7, C.yellow, 0, r);
    batch.box(px + dx + s * 1.1, B + 0.86, pz + dz + c * 1.1, 0.4, 0.2, 0.4, C.orange, 0, r);
  }
  // Trampolín para saltar el estanque
  const k = addQuarter(W, px + 20, pz, 8, 12, 38, -Math.PI / 2, B, C.white, C.red);
  for (let i = 0; i < 5; i++) W.studs.push({ x: px + 14 - i * 5, y: B + k.lip + 2 + Math.sin((i / 4) * Math.PI) * 2.6, z: pz, type: 1 });

  // Zona infantil
  const gx = cx + 26;
  const gz = cz - 30;
  batch.box(gx, B, gz, 22, 0.1, 16, C.tan, F.STUDS);
  for (const s of [-1, 1]) {
    batch.box(gx - 5 + s * 4, B, gz - 3, 0.5, 6, 0.5, C.red, 0);
    batch.box(gx - 5 + s * 1.3, B + 2, gz - 3, 1.2, 0.25, 0.8, C.yellow, 0);
    batch.box(gx - 5 + s * 1.3, B + 2, gz - 3, 0.12, 4, 0.12, C.dgray, 0);
  }
  batch.box(gx - 5, B + 6, gz - 3, 9, 0.5, 0.5, C.red, 0);
  // Tobogán (también sirve de rampa)
  batch.box(gx + 6, B, gz - 4.5, 3, 4, 3, C.azure, F.SEAMS | F.STUDS);
  terrain.box(gx + 6, gz - 4.5, 3, 3, B + 4);
  addWedge(W, gx + 6, gz + 1.5, 3, 9, 4, Math.PI, B, C.yellow, C.red);
  // Balancín y arenero
  batch.box(gx - 4, B, gz + 4, 0.8, 1, 0.8, C.blue, 0);
  batch.box(gx - 4, B + 1, gz + 4, 7, 0.3, 0.8, C.lime, 0, 0.2);
  for (let i = 0; i < 9; i++) {
    W.studs.push({ x: gx + rng.range(-9, 9), y: B + 1.5, z: gz + rng.range(-6, 6), type: 0 });
  }

  // Árboles y flores evitando lo anterior
  const blocked = (x, z) =>
    Math.hypot(x - px, z - pz) < 16 || (Math.abs(x - gx) < 13 && Math.abs(z - gz) < 10) || Math.abs(x - cx) < 5 || Math.abs(z - (cz - 12)) < 5 || z > fz - 25 || (Math.abs(z - pz) < 6 && x > px && x < px + 30);
  let placed = 0;
  for (let t = 0; t < 400 && placed < 26; t++) {
    const x = rng.range(R.x0 + 4, R.x1 - 4);
    const z = rng.range(R.z0 + 4, fz - 26);
    if (blocked(x, z)) continue;
    tree(W, x, z, B);
    placed++;
  }
  const fcol = [C.red, C.yellow, C.pink, C.white, C.orange, C.lavender];
  for (let t = 0; t < 70; t++) {
    const x = rng.range(R.x0 + 3, R.x1 - 3);
    const z = rng.range(R.z0 + 3, R.z1 - 3);
    if (blocked(x, z) && z < fz - 22) continue;
    if (z >= fz - 22 && Math.abs(x - fx) < 35 && z < fz + 22.5) continue;
    batch.box(x, B, z, 0.25, 0.8, 0.25, C.green, 0);
    batch.box(x, B + 0.8, z, 0.8, 0.35, 0.8, rng.pick(fcol), F.STUDS);
  }
  for (const dz of [-44, -30, -4]) {
    lamp(W, cx - 3.4, cz + dz, 1, 0);
    W.props.push({ type: 'bench', x: cx + 3.6, z: cz + dz + 5, rot: -Math.PI / 2, y: B });
  }
  arch(W, cx, R.z0 + 1.2, true, 14, 9, 'PARQUE', '#237841', C.brown);
  W.pedLoops.push({ cx, cz, h: R.w / 2 - 1.2 });
  W.map.blocks.push({ x: cx, z: cz, w: R.w, d: R.d, color: '#58b35a' }, { x: fx, z: fz, w: 64, d: 40, color: '#3f9a48' });
  W.map.circles.push({ x: px, z: pz, r: 12, color: '#3a9be0' });
}

// ---------- Muelle del mega salto e isla del tesoro ----------

function megaJump(W) {
  const { batch, terrain, geo } = W;
  const z = roadC(4);
  const WOOD = 0xb9824f;
  batch.box(250, -3.2, z, 28, 3.2, 12, WOOD, F.SEAMS);
  terrain.box(250, z, 28, 12, 0);
  batch.box(255, -3.2, z + 13, 38, 3.2, 14, WOOD, F.SEAMS);
  terrain.box(255, z + 13, 38, 14, 0);
  for (let i = 0; i < 7; i++) {
    batch.box(238 + i * 4.4, 0, z - 6.2, 0.6, 1.6, 0.6, C.brown, F.STUDS);
    batch.box(238 + i * 6, 0, z + 20.2, 0.6, 1.6, 0.6, C.brown, F.STUDS);
  }
  const k = addQuarter(W, 264 - 4.24, z, 12, 16, 32, Math.PI / 2, 0, C.white, C.red);
  for (let i = 0; i < 4; i++) batch.box(244 + i * 3, 0, z, 1.6, 0.03, 3, C.yellow, 0);
  arch(W, 231, z, false, 15, 11, '¡MEGA SALTO!', '#c91a09', C.yellow);
  // Arco de studs azules sobre el agua
  for (let i = 1; i <= 5; i++) {
    const t = i * 0.2;
    W.studs.push({ x: 264 + 37.3 * t, y: k.lip + 23.3 * t - 21 * t * t + 1.6, z, type: i === 3 ? 2 : 1 });
  }
  // Isla del tesoro
  const ix = 318;
  geo.cyl(22, 3.2, ix, -1.6, z, C.tan, { seg: 44 });
  terrain.cyl(ix, z, 22, 0);
  batch.box(ix + 4, 0, z - 4, 16, 0.08, 14, C.lime, F.STUDS, 0.3);
  palm(W, ix + 8, z - 14);
  palm(W, ix + 14, z - 6);
  palm(W, ix - 6, z - 16);
  batch.box(ix, 0, z - 17.5, 0.5, 6, 0.5, C.brown, 0);
  batch.box(ix, 4, z - 17.4, 11, 2.4, 0.4, C.white, 0);
  addSign(W, 'ISLA DEL TESORO', ix, 5.2, z - 17.15, 0, 10.4, 1.9, '#5c3a21', '#ffd23a');
  // Cofre
  batch.box(ix + 9, 0, z - 4, 4, 2, 2.6, C.brown, F.SEAMS, 0.4);
  batch.box(ix + 9, 2, z - 4, 4.2, 0.6, 2.8, C.gold, F.STUDS, 0.4);
  terrain.box(ix + 9, z - 4, 4.2, 2.8, 2.6, 0.4);
  W.bricks.push({ x: ix, y: 2, z });
  for (let j = 0; j < 5; j++) W.studs.push({ x: ix + 4 + Math.cos(j * 1.26) * 4, y: 1.6, z: z + Math.sin(j * 1.26) * 4, type: 2 });
  // Rampa de vuelta
  addQuarter(W, 297.5 + 4.24, z + 13, 10, 16, 32, -Math.PI / 2, 0, C.white, C.lime);
  batch.box(301.74, -3.2, z + 13, 8.48, 3.19, 10, WOOD, F.SEAMS);
  for (let i = 0; i < 3; i++) batch.box(320 - i * 3, 0, z + 13, 1.6, 0.03, 3, C.yellow, 0);
  W.map.blocks.push({ x: 250, z, w: 28, d: 12, color: '#b9824f' }, { x: 255, z: z + 13, w: 38, d: 14, color: '#b9824f' });
  W.map.circles.push({ x: ix, z, r: 22, color: '#e4cd9e' });
  W.places.mega = { x: 244, z };
}

export const SPECIAL = {
  '3,3': plaza,
  '3,1': tower,
  '2,3': pizzaBlock,
  '5,1': bowling,
};

export function buildLandmarks(W) {
  skatepark(W);
  park(W);
  megaJump(W);
  // Ladrillos dorados escondidos por el mapa
  W.bricks.push({ x: -228, y: 1.8, z: -228 }, { x: 228, y: 1.8, z: -228 }, { x: -150, y: 1.8, z: 229 });
  if (W.alleys.length) {
    const a = W.alleys[0];
    const b = W.alleys[W.alleys.length - 1];
    W.bricks.push({ x: a.x, y: B + 1.8, z: a.z });
    if (b !== a) W.bricks.push({ x: b.x, y: B + 1.8, z: b.z });
  }
  // Calles de studs en la playa
  for (let i = 0; i < 14; i++) {
    W.studs.push({ x: -180 + i * 6, y: 1.4, z: 224, type: 0 }, { x: -180 + i * 6, y: 1.4, z: -224, type: 0 }, { x: -224, y: 1.4, z: -120 + i * 6, type: 0 });
  }
}

export { blockC };
