import * as THREE from 'three';
import { C } from '../lego/colors.js';
import { F } from '../lego/batch.js';
import { profileGeo, frustumGeo } from '../lego/builder.js';
import { addPin } from '../lego/models.js';
import { BASE, frame, fbox, tree, lamp, palm, addSign } from './city.js';
import { DATA, BOUNDS } from './cobena.js';

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

export function addHump(W, cx, cz, w, d, H, rot, base = B, color = C.yellow) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = -d / 2 + (d * i) / 14;
    const c = Math.cos((Math.PI * t) / d);
    pts.push([t, H * c * c]);
  }
  W.geo.add(profileGeo(pts, w), color, cx, base, cz, 0, rot, 0);
  W.terrain.hump(cx, cz, w, d, H, rot, base);
}

export function addRail(W, ax, az, bx, bz, y, color = C.yellow) {
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

// Arco con cartel por las dos caras. rot = 0: postes a lo largo de X.
function arch(W, x, z, rot, span, h, text, bg, color = C.red) {
  const { batch, terrain } = W;
  const f = frame(x, z, rot);
  let gy = 0;
  for (const s of [-1, 1]) {
    const q = f.p((s * span) / 2, 0);
    const base = terrain.height(q[0], q[1]);
    gy = Math.max(gy, base);
    batch.box(q[0], base, q[1], 1.6, h, 1.6, color, F.SEAMS | F.STUDS, rot);
    terrain.box(q[0], q[1], 1.6, 1.6, base + h, rot);
  }
  const y = gy + h - 2.6;
  batch.box(x, y, z, span + 1.6, 2.6, 1.2, C.white, F.STUDS, rot);
  const sw = span - 3;
  for (const s of [-1, 1]) {
    const q = f.p(0, s * 0.63);
    addSign(W, text, q[0], y + 1.3, q[1], rot + (s > 0 ? 0 : Math.PI), sw, 2.1, bg);
  }
}

const free = (W, x, z) => W.terrain.height(x, z) < 0.05;

// ---------- Skatepark nuevo, en la parcela donde lo están construyendo ----------

function skatepark(W) {
  const { batch, terrain, geo } = W;
  const S = DATA.places.skate;
  const L = frame(S.x, S.z, S.rot); // X local: eje largo hacia el este; -Z local: borde recto del norte
  const P = (lx, lz) => L.p(lx, lz);
  const stud = (lx, y, lz, type = 1) => {
    const q = P(lx, lz);
    W.studs.push({ x: q[0], y, z: q[1], type });
  };
  const brick = (lx, y, lz) => {
    const q = P(lx, lz);
    W.bricks.push({ x: q[0], y, z: q[1] });
  };
  const inLot = (lx, lz) => {
    const q = S.local;
    let c = false;
    for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
      if (q[i + 1] > lz !== q[j + 1] > lz && lx < ((q[j] - q[i]) * (lz - q[i + 1])) / (q[j + 1] - q[i + 1]) + q[i]) c = !c;
    }
    return c;
  };

  // Losa de hormigón con la forma de la parcela
  const shape = new THREE.Shape();
  for (let i = 0; i < S.poly.length; i += 2) {
    if (i === 0) shape.moveTo(S.poly[i], S.poly[i + 1]);
    else shape.lineTo(S.poly[i], S.poly[i + 1]);
  }
  const slab = new THREE.ExtrudeGeometry(shape, { depth: B, bevelEnabled: false });
  slab.rotateX(Math.PI / 2);
  slab.translate(0, B, 0);
  geo.add(slab, CONCRETE);
  terrain.poly(S.poly, B);
  for (let i = -12; i <= 12; i++) {
    for (let j = -4; j <= 4; j++) {
      if ((i * 7 + j * 13) % 5 !== 0) continue;
      const lx = i * 9;
      const lz = j * 9;
      if (inLot(lx - 4.6, lz - 4.6) && inLot(lx + 4.6, lz - 4.6) && inLot(lx - 4.6, lz + 4.6) && inLot(lx + 4.6, lz + 4.6)) fbox(batch, L, lx, B, lz, 9, 0.03, 9, (i + j) % 3 === 0 ? 0x7fb6d8 : 0x8a939c, F.STUDS);
    }
  }

  // 1. Half-pipe, a lo largo del eje de la parcela
  const H = L.sub(-2, -19, Math.PI / 2);
  const hq = (lx, lz) => H.p(lx, lz);
  let c = hq(0, 12.23);
  const q = addQuarter(W, c[0], c[1], 30, 11, 72, H.rot, B, C.white, C.azure);
  c = hq(0, -12.23);
  addQuarter(W, c[0], c[1], 30, 11, 72, H.rot + Math.PI, B, C.white, C.azure);
  const dv = 7 + q.d;
  for (const s of [-1, 1]) {
    fbox(batch, H, 0, B, s * (dv + 2.5), 30, q.lip, 5, C.azure, F.SEAMS | F.STUDS);
    c = hq(0, s * (dv + 2.5));
    terrain.box(c[0], c[1], 30, 5, B + q.lip, H.rot);
    c = hq(0, s * (dv + 12));
    addWedge(W, c[0], c[1], 30, 14, q.lip, H.rot + (s > 0 ? Math.PI : 0), B, C.white, C.orange);
    for (let i = -2; i <= 2; i++) {
      c = hq(i * 5, s * (dv - 1.5));
      W.studs.push({ x: c[0], y: B + q.lip + 5, z: c[1], type: 1 });
    }
  }
  c = hq(0, -dv - 2.5);
  W.bricks.push({ x: c[0], y: B + q.lip + 1.8, z: c[1] });
  for (const [sx, sz, r] of [[-11, dv + 3, Math.PI], [9, dv + 3.4, Math.PI], [12, -dv - 3, 0]]) {
    c = hq(sx, sz);
    W.spectators.push({ x: c[0], y: B + q.lip, z: c[1], rot: H.rot + r });
  }

  // 2. Bowl circular en el extremo ancho
  const [bwx, bwz] = P(72, -4);
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
  for (const [rr, col] of [[r0 + bd, C.red], [r0 + bd + 3, C.yellow]]) {
    const cop = new THREE.TorusGeometry(rr, 0.22, 8, 64);
    cop.rotateX(Math.PI / 2);
    geo.add(cop, col, bwx, B + bl, bwz);
  }
  terrain.bowl(bwx, bwz, r0, BR, 65, B);
  terrain.ring(bwx, bwz, r0 + bd, r0 + bd + 3, B + bl);
  terrain.rcone(bwx, bwz, r0 + bd + 3, r0 + bd + 11, B + bl, B);
  for (let j = 0; j < 10; j++) {
    const a = (j / 10) * Math.PI * 2;
    W.studs.push({ x: bwx + Math.cos(a) * 5, y: B + 1.5, z: bwz + Math.sin(a) * 5, type: 1 });
  }
  W.bricks.push({ x: bwx, y: B + 1.8, z: bwz });

  // 3. Funbox con barandilla
  const [fx, fz] = P(8, 18);
  geo.add(frustumGeo(26, 18, 12, 5, 3), C.orange, fx, B, fz, 0, L.rot, 0);
  fbox(batch, L, 8, B + 3, 18, 11.6, 0.06, 4.6, C.white, 0);
  terrain.pyramid(fx, fz, 26, 18, 12, 5, 3, L.rot, B);
  addRail(W, ...P(2, 18), ...P(14, 18), B + 4.3, C.yellow);
  brick(8, B + 7.4, 18);

  // 4. Mesa de salto
  const J = L.sub(-76, -27);
  c = J.p(4.11, 0);
  const k = addQuarter(W, c[0], c[1], 10, 14, 36, J.rot + Math.PI / 2, B, C.white, C.lime);
  fbox(batch, J, k.d + 6, B, 0, 12, k.lip, 10, C.lime, F.SEAMS | F.STUDS);
  c = J.p(k.d + 6, 0);
  terrain.box(c[0], c[1], 12, 10, B + k.lip, J.rot);
  c = J.p(k.d + 17, 0);
  addWedge(W, c[0], c[1], 10, 10, k.lip, J.rot - Math.PI / 2, B, C.white, C.lime);
  for (let i = 0; i < 5; i++) {
    c = J.p(k.d + 1 + i * 2.5, 0);
    W.studs.push({ x: c[0], y: B + k.lip + 2.5 + Math.sin((i / 4) * Math.PI) * 2.2, z: c[1], type: i === 2 ? 2 : 1 });
  }
  c = J.p(k.d + 6, 0);
  W.bricks.push({ x: c[0], y: B + k.lip + 6.2, z: c[1] });

  // 5. Rollers
  for (let i = 0; i < 4; i++) addHump(W, ...P(-62 + i * 10, 8), 10, 8, 1.5, L.rot + Math.PI / 2, B, i % 2 ? C.yellow : C.orange);

  // 6. Barandilla larga y cajón
  addRail(W, ...P(24, 29), ...P(52, 29), B + 1.7, C.red);
  fbox(batch, L, -50, B, -5, 16, 0.9, 5, C.dgray, F.STUDS | F.SEAMS);
  terrain.box(...P(-50, -5), 16, 5, B + 0.9, L.rot);
  addRail(W, ...P(-58, -7.4), ...P(-42, -7.4), B + 0.95, C.lgray);
  for (let i = 0; i < 6; i++) stud(26 + i * 5, B + 3.2, 29);

  // 7. La pista de circo de Yago y su monociclo
  const yg = P(37, 15);
  for (const [rr, col] of [[6.7, C.red], [6.1, C.yellow]]) {
    const ring = new THREE.TorusGeometry(rr, 0.12, 6, 48);
    ring.rotateX(Math.PI / 2);
    geo.add(ring, col, yg[0], B + 0.05, yg[1]);
  }
  W.places.yago = { x: yg[0], z: yg[1], y: B, r: 4.4 };

  arch(W, ...P(-84, -12), L.rot + Math.PI / 2, 20, 11, 'SKATEPARK', '#fe8a18', C.purple);
  for (const [lx, lz] of [[93, 26], [95, -31], [-99, -31]]) {
    fbox(batch, L, lx, B, lz, 5, 0.9, 5, C.brown, F.STUDS);
    terrain.box(...P(lx, lz), 5, 5, B + 0.9, L.rot);
    tree(W, ...P(lx, lz), B + 0.9);
  }
  for (const [lx, lz, dz] of [[40, -34.6, 1], [-42, -34.6, 1], [30, 33, -1], [-30, 26.5, -1], [66, 32.5, -1]]) {
    const d = [L.p(0, dz)[0] - L.x, L.p(0, dz)[1] - L.z];
    lamp(W, ...P(lx, lz), d[0], d[1], B);
  }
  for (const [type, lx, lz, r] of [['cone', -70, -12, 0], ['cone', -67, -9, 0], ['barrier', -20, 22, 0.4], ['bench', 36, -33, Math.PI], ['bin', 41.5, -32, 0], ['crate', -34, 20, 0.3], ['bench', -12, 28, 0]]) {
    const p = P(lx, lz);
    W.props.push({ type, x: p[0], z: p[1], rot: L.rot + r, y: B });
  }
  const st = P(-94, -14);
  const mk = P(-93, -26);
  W.places.trick = { x: st[0], z: st[1], heading: Math.atan2(L.c, -L.s), marker: { x: mk[0], z: mk[1] }, poly: S.poly, x0: S.x, z0: S.z, rot: S.rot };
}

// ---------- Fuente de la Plaza de la Villa con el patinete dorado ----------

function fountain(W) {
  const { batch, terrain, geo } = W;
  const { x: bx, z: bz } = DATA.places.plaza;
  geo.cyl(8.2, 1.5, bx, 0.75, bz, C.lgray, { seg: 32 });
  geo.cyl(8.5, 0.3, bx, 1.5, bz, C.white, { seg: 32 });
  geo.cyl(7.5, 0.2, bx, 1.62, bz, C.water, { seg: 32 });
  geo.cyl(3.6, 3.4, bx, 1.7, bz, C.white, { seg: 24 });
  geo.cyl(4.0, 0.5, bx, 3.5, bz, C.lgray, { seg: 24 });
  terrain.cyl(bx, bz, 8.5, 1.8);
  terrain.cyl(bx, bz, 4.0, 3.75);
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2;
    for (let t = 0; t < 5; t++) {
      const r = 4.2 + t * 0.62;
      batch.box(bx + Math.cos(a) * r, 1.7 + Math.sin((t / 4.6) * Math.PI) * 2.6, bz + Math.sin(a) * r, 0.5, 0.5, 0.5, 0x7fc8f2, F.WINDOW, a);
    }
  }
  W.extras.push({ kind: 'statue', x: bx, y: 3.75, z: bz });
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2 + Math.PI / 8;
    const x = bx + Math.sin(a) * 13.5;
    const z = bz + Math.cos(a) * 13.5;
    if (free(W, x, z)) W.props.push({ type: j % 2 ? 'bench' : 'flowerpot', x, z, rot: a + Math.PI, y: 0 });
  }
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    W.studs.push({ x: bx + Math.sin(a) * 10.8, y: 1.5, z: bz + Math.cos(a) * 10.8, type: 1 });
  }
  W.places.plaza = { x: bx, z: bz };
  // Salida del reparto de pizzas: un hueco libre junto a la fuente
  let spot = { x: bx + 16, z: bz };
  for (let r = 15; r < 40 && spot.r == null; r += 4) {
    for (let a = 0; a < 12; a++) {
      const x = bx + Math.cos((a * Math.PI) / 6) * r;
      const z = bz + Math.sin((a * Math.PI) / 6) * r;
      if (free(W, x, z) && free(W, x + 4, z) && free(W, x - 4, z) && free(W, x, z + 4) && free(W, x, z - 4)) {
        spot = { x, z, r };
        break;
      }
    }
  }
  W.places.pizza = { x: spot.x, z: spot.z };
  W.map.circles.push({ x: bx, z: bz, r: 8, color: '#3a9be0' });
}

// ---------- Bolera gigante en el Recinto Ferial ----------

function bowling(W) {
  const { batch, terrain, geo } = W;
  const { x: bx, z: bz } = DATA.places.bowling;
  batch.box(bx, 0, bz, 44, B, 44, C.sandBlue, F.STUDS);
  terrain.box(bx, bz, 44, 44, B);
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
  arch(W, bx, bz + 20.5, 0, 19, 10, 'BOLOS GIGANTES', '#c91a09', C.blue);
  // Bola y bolo gigantes de adorno
  geo.sphere(4, bx - 15.5, B + 4, bz + 4, C.blue, { seg: 24, seg2: 16 });
  for (const [dx, dy, dz] of [[0.9, 2.6, 2.6], [-0.9, 2.6, 2.6], [0, 1.2, 3.6]]) geo.sphere(0.6, bx - 15.5 + dx, B + 4 + dy, bz + 4 + dz, C.black);
  terrain.cyl(bx - 15.5, bz + 4, 3.4, B + 7.5);
  addPin(geo, bx + 15.5, B, bz + 4, 1.9);
  terrain.cyl(bx + 15.5, bz + 4, 2.1, B + 11);
  for (const sx of [-1, 1]) {
    tree(W, bx + sx * 15.5, bz - 12, B);
    lamp(W, bx + sx * 12, bz + 16, -sx, 0, B);
  }
  W.places.bowling = { x: bx, z: bz + 17, heading: Math.PI, pinX: bx, pinZ: bz - 8, laneX0: bx - 8, laneX1: bx + 8, backZ: bz - 20, marker: { x: bx, z: bz + 27 } };
  W.map.blocks.push({ x: bx, z: bz, w: 44, d: 44, color: '#7f93bd' });
}

// ---------- Campo de fútbol en la Pista Polideportiva ----------

function soccer(W) {
  const { batch, terrain } = W;
  const { x: fx, z: fz } = DATA.places.soccer;
  batch.box(fx, 0, fz, 70, B, 46, 0x58b35a, F.STUDS);
  terrain.box(fx, fz, 70, 46, B);
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
  arch(W, fx, fz - 26, 0, 14, 9, 'POLIDEPORTIVO', '#237841', C.green);
  W.places.soccer = {
    cx: fx, cz: fz, x0: fx - 32.5, x1: fx + 32.5, z0: fz - 20.5, z1: fz + 20.5, goalX: fx + 29, westGoalX: fx - 29, gz0: fz - 6, gz1: fz + 6,
    start: { x: fx - 20, z: fz, heading: Math.PI / 2 }, marker: { x: fx + 12, z: fz - 28 },
  };
  W.map.blocks.push({ x: fx, z: fz, w: 64, d: 40, color: '#3f9a48' });
}

// ---------- Mega salto sobre la charca y la isla del tesoro ----------

function megaJump(W) {
  const { batch, terrain, geo } = W;
  const o = DATA.places.mega;
  const X = (x) => o.x + x - 236; // las cotas originales medían desde la orilla (x = 236)
  const z = o.z;
  const WOOD = 0xb9824f;
  batch.box(X(250), -3.2, z, 28, 3.2, 12, WOOD, F.SEAMS);
  terrain.box(X(250), z, 28, 12, 0);
  batch.box(X(255), -3.2, z + 13, 38, 3.2, 14, WOOD, F.SEAMS);
  terrain.box(X(255), z + 13, 38, 14, 0);
  for (let i = 0; i < 7; i++) {
    batch.box(X(238 + i * 4.4), 0, z - 6.2, 0.6, 1.6, 0.6, C.brown, F.STUDS);
    batch.box(X(238 + i * 6), 0, z + 20.2, 0.6, 1.6, 0.6, C.brown, F.STUDS);
  }
  const k = addQuarter(W, X(264 - 4.24), z, 12, 16, 32, Math.PI / 2, 0, C.white, C.red);
  for (let i = 0; i < 4; i++) batch.box(X(244 + i * 3), 0, z, 1.6, 0.03, 3, C.yellow, 0);
  arch(W, X(231), z, Math.PI / 2, 15, 11, '¡MEGA SALTO!', '#c91a09', C.yellow);
  // Camino de tierra para coger carrerilla
  W.ground.ribbon(5, [X(46), z - 75, X(86), z, X(236), z], 5, 0xb9925f, 0, true);
  for (let i = 0; i < 9; i++) W.studs.push({ x: X(100 + i * 14), y: 1.4, z, type: 0 });
  // Arco de studs azules sobre el agua
  for (let i = 1; i <= 5; i++) {
    const t = i * 0.2;
    W.studs.push({ x: X(264 + 37.3 * t), y: k.lip + 23.3 * t - 21 * t * t + 1.6, z, type: i === 3 ? 2 : 1 });
  }
  // Isla del tesoro
  const ix = X(318);
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
  addQuarter(W, X(297.5 + 4.24), z + 13, 10, 16, 32, -Math.PI / 2, 0, C.white, C.lime);
  batch.box(X(301.74), -3.2, z + 13, 8.48, 3.19, 10, WOOD, F.SEAMS);
  for (let i = 0; i < 3; i++) batch.box(X(320 - i * 3), 0, z + 13, 1.6, 0.03, 3, C.yellow, 0);
  const h = W.places.megaHole;
  W.map.blocks.push({ x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2, w: h.x1 - h.x0, d: h.z1 - h.z0, color: '#2f8fd6' }, { x: X(250), z, w: 28, d: 12, color: '#b9824f' }, { x: X(255), z: z + 13, w: 38, d: 14, color: '#b9824f' });
  W.map.circles.push({ x: ix, z, r: 22, color: '#e4cd9e' });
  W.places.mega = { x: X(150), z, hole: h, islandX: ix };
}

// ---------- Calle Libertad 17: Adrián, el pequeño batería heavy ----------

function drummer(W) {
  const { batch, terrain } = W;
  const door = W.doors.find((d) => d.name === 'C/ Libertad 17');
  if (!door) return;
  // Su casa es el edificio más cercano al portal; el escenario va delante de la fachada
  let b = null;
  let bd = Infinity;
  for (const k of W.map.buildings) {
    const d = Math.hypot(k.x - door.x, k.z - door.z);
    if (d < bd) {
      bd = d;
      b = k;
    }
  }
  const ux = (b.x - door.x) / bd;
  const uz = (b.z - door.z) / bd;
  let t = 0;
  while (t < bd && terrain.height(door.x + ux * (t + 0.5), door.z + uz * (t + 0.5)) < 0.5) t += 0.5;
  const s = Math.max(5, t - 5.5);
  const rot = Math.atan2(-ux, -uz); // de cara a la calle
  // Se corre a un lado si hay un árbol o una valla en medio
  let f = null;
  for (const side of [0, 8, -8, 16, -16, 24, -24]) {
    const c = frame(door.x + ux * s - uz * side, door.z + uz * s + ux * side, rot);
    let ok = true;
    for (let lx = -7.5; lx <= 7.5 && ok; lx += 0.75) {
      for (let lz = -4; lz <= 4.5 && ok; lz += 0.75) ok = free(W, ...c.p(lx, lz));
    }
    if (ok) {
      f = c;
      break;
    }
  }
  if (!f) return;
  const { x, z } = f;
  fbox(batch, f, 0, 0, 0, 9, 0.5, 7, C.black, F.STUDS);
  terrain.box(x, z, 9, 7, 0.5, rot);
  fbox(batch, f, 0, 0, -3.3, 9, 6.8, 0.5, C.black, F.SEAMS);
  terrain.box(...f.p(0, -3.3), 9, 0.5, 6.8, rot);
  const q = f.p(0, -3.02);
  addSign(W, 'HEAVY METAL', q[0], 5.4, q[1], rot, 8, 1.7, '#1b1d21', '#ffd23a');
  // Torres de altavoces
  for (const sx of [-1, 1]) {
    fbox(batch, f, sx * 5.9, 0, -1.2, 2.4, 5.6, 2.2, C.black, F.SEAMS);
    for (const y of [0.5, 3.1]) fbox(batch, f, sx * 5.9, y, -0.06, 1.8, 1.9, 0.12, C.dgray, 0);
    terrain.box(...f.p(sx * 5.9, -1.2), 2.4, 2.2, 5.6, rot);
  }
  terrain.cyl(x, z, 2.6, 3.2); // la batería no se atraviesa
  W.places.drummer = { x, z, rot, y: 0.5 };
}

// ---------- Parques infantiles ----------

function playground(W, gx, gz) {
  const { batch, terrain } = W;
  batch.box(gx, 0, gz, 22, 0.1, 16, C.tan, F.STUDS);
  for (const s of [-1, 1]) {
    batch.box(gx - 5 + s * 4, 0, gz - 3, 0.5, 6, 0.5, C.red, 0);
    batch.box(gx - 5 + s * 1.3, 2, gz - 3, 1.2, 0.25, 0.8, C.yellow, 0);
    batch.box(gx - 5 + s * 1.3, 2, gz - 3, 0.12, 4, 0.12, C.dgray, 0);
  }
  batch.box(gx - 5, 6, gz - 3, 9, 0.5, 0.5, C.red, 0);
  // Tobogán (también sirve de rampa)
  batch.box(gx + 6, 0, gz - 4.5, 3, 4, 3, C.azure, F.SEAMS | F.STUDS);
  terrain.box(gx + 6, gz - 4.5, 3, 3, 4);
  addWedge(W, gx + 6, gz + 1.5, 3, 9, 4, Math.PI, 0, C.yellow, C.red);
  // Balancín
  batch.box(gx - 4, 0, gz + 4, 0.8, 1, 0.8, C.blue, 0);
  batch.box(gx - 4, 1, gz + 4, 7, 0.3, 0.8, C.lime, 0, 0.2);
  for (let i = 0; i < 6; i++) W.studs.push({ x: gx + W.rng.range(-9, 9), y: 1.5, z: gz + W.rng.range(-6, 6), type: 0 });
  W.map.blocks.push({ x: gx, z: gz, w: 22, d: 16, color: '#e4cd9e' });
}

// ---------- El skatepark viejo: una pista pequeña con un par de módulos ----------

function oldSkate(W) {
  const o = DATA.places.oldSkate;
  if (!o) return;
  const f = frame(o.x, o.z, o.rot * RAD);
  const d = Math.max(30, o.d);
  fbox(W.batch, f, 0, 0, 0, o.w, 0.08, o.d, CONCRETE, F.STUDS);
  let c = f.p(0, d / 2 - 5);
  addQuarter(W, c[0], c[1], 12, 7, 55, f.rot, 0, C.white, C.orange);
  c = f.p(0, -d / 2 + 6);
  addWedge(W, c[0], c[1], 10, 8, 2.4, f.rot + Math.PI, 0, C.white, C.azure);
  addRail(W, ...f.p(-o.w / 2 + 5, 0), ...f.p(-o.w / 2 + 5, 14), 1.5, C.yellow);
  W.map.pitches.push({ x: o.x, z: o.z, w: o.w, d: o.d, rot: f.rot, color: '#9aa3ab' });
}

export function buildLandmarks(W) {
  skatepark(W);
  fountain(W);
  bowling(W);
  soccer(W);
  megaJump(W);
  drummer(W);
  for (const [x, z] of DATA.playgrounds) playground(W, x, z);
  oldSkate(W);
  // Ladrillos dorados escondidos por el pueblo: campanario, estanque del Mirador, colegio,
  // Cerro del Castillo, Jardín Botánico, skatepark viejo y el parque de al lado de casa
  DATA.places.bricks.forEach(([x, z], i) => {
    if (i !== 6) W.bricks.push({ x, y: W.terrain.height(x, z) + 1.8, z });
  });
  const sp = DATA.places.spawn;
  W.places.spawn = { x: sp.x, z: sp.z, heading: sp.heading };
  W.places.race = DATA.race;
  W.places.bounds = BOUNDS;
}
