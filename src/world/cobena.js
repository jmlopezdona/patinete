import * as THREE from 'three';
import D from './cobena-data.js';
import { C } from '../lego/colors.js';
import { F } from '../lego/batch.js';
import { createBrickMaterial } from '../lego/materials.js';
import { makeRng } from '../core/rng.js';
import { frame, fbox, tree, lamp, addSign, SIDEWALK_COLOR } from './city.js';
import { lift, drape, normal, NEAR, FAR } from './relief.js';

// Cobeña (Madrid) reconstruido con ladrillos a partir del callejero de OpenStreetMap:
// 2 unidades de juego por metro, con el origen en la calle Río Júcar, 44. El norte es -Z.
export const DATA = D;
export const BOUNDS = { x0: D.bounds[0], z0: D.bounds[1], x1: D.bounds[2], z1: D.bounds[3] };
export const CENTER = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, z: (BOUNDS.z0 + BOUNDS.z1) / 2 };
const RAD = Math.PI / 180;
const G0 = 7; // altura de la planta baja
const FH = 6; // altura del resto de plantas
const WHEAT = 0xd8c47a;
const TEJA = 0xb5562f;
const FIELDS = [0xcdb565, 0xbfc270, 0xa9bf63, 0xb99a5e, 0xe0cf8c, 0xc7b25a, WHEAT, WHEAT];
const FAMILIES = [
  [C.white, C.cream, 0xe9dcc0], [0xd9a066, C.cream, C.tan], [TEJA, 0xc46a43, C.nougat], [C.white, C.tan, C.nougat],
  [C.cream, 0xe8c98a, C.white], [C.lightBlue, C.white, C.cream], [0xc46a43, C.cream, C.white], [C.white, C.white, C.cream],
];
const ROOFS = [TEJA, 0xa84a26, 0x8f3d1f, TEJA, 0xc0683f, C.darkRed];
const DOORS = [C.brown, C.darkRed, C.green, C.blue, C.dgray, 0x8a5a2b];
const SIGN_BG = ['#c91a09', '#0055bf', '#237841', '#fe8a18', '#6b3fa0', '#008f9b', '#1b1d21', '#c870a0'];
const PROPS = ['hydrant', 'bin', 'mailbox', 'cone', 'bench', 'crate', 'flowerpot', 'barrier'];
// Capas del suelo, de abajo arriba
const LY = { field: 0, urban: 1, green: 2, water: 3, sidewalk: 4, path: 5, road: 6, mark: 7 };

// ---------- Suelo por capas (calles, aceras, parques...), tendido sobre el relieve ----------
const _col = new THREE.Color();
const _n = [0, 1, 0];
const SECTOR = 800;
class Ground {
  constructor(n) {
    this.layers = Array.from({ length: n }, () => new Map());
  }

  // Cada capa va troceada en sectores del mapa, para pintar solo los que quedan a la vista
  _sector(k, x, z) {
    const key = (Math.floor(x / SECTOR) + 64) * 128 + Math.floor(z / SECTOR) + 64;
    let L = this.layers[k].get(key);
    if (!L) this.layers[k].set(key, (L = { p: [], n: [], c: [], f: [] }));
    return L;
  }

  // far: triángulo de los campos de fuera de NEAR, donde el relieve va a celdas grandes
  tri(k, ax, az, bx, bz, cx, cz, color, flag = 0, far = false) {
    const L = this._sector(k, (ax + bx + cx) / 3, (az + bz + cz) / 3);
    _col.setHex(color);
    // Siempre mirando hacia arriba
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) >= 0;
    drape(up ? [ax, az, bx, bz, cx, cz] : [ax, az, cx, cz, bx, bz], (x, z) => {
      L.p.push(x, lift(x, z), z);
      normal(x, z, _n);
      L.n.push(_n[0], _n[1], _n[2]);
      L.c.push(_col.r, _col.g, _col.b);
      L.f.push(flag);
    }, far ? FAR : 1);
  }

  quad(k, ax, az, bx, bz, cx, cz, dx, dz, color, flag = 0, far = false) {
    this.tri(k, ax, az, bx, bz, cx, cz, color, flag, far);
    this.tri(k, ax, az, cx, cz, dx, dz, color, flag, far);
  }

  disc(k, x, z, r, color, flag = 0, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      this.tri(k, x, z, x + Math.cos(a) * r, z + Math.sin(a) * r, x + Math.cos(b) * r, z + Math.sin(b) * r, color, flag);
    }
  }

  // Cinta a lo largo de una polilínea (puntos x, z seguidos) con uniones a inglete
  ribbon(k, pts, half, color, flag = 0, caps = false) {
    const n = pts.length / 2;
    if (n < 2) return;
    let plx = 0, plz = 0, prx = 0, prz = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2];
      const z = pts[i * 2 + 1];
      let dx0 = 0, dz0 = 0, dx1 = 0, dz1 = 0;
      if (i > 0) {
        dx0 = x - pts[i * 2 - 2];
        dz0 = z - pts[i * 2 - 1];
        const l = Math.hypot(dx0, dz0) || 1;
        dx0 /= l;
        dz0 /= l;
      }
      if (i < n - 1) {
        dx1 = pts[i * 2 + 2] - x;
        dz1 = pts[i * 2 + 3] - z;
        const l = Math.hypot(dx1, dz1) || 1;
        dx1 /= l;
        dz1 /= l;
      }
      if (i === 0) {
        dx0 = dx1;
        dz0 = dz1;
      }
      if (i === n - 1) {
        dx1 = dx0;
        dz1 = dz0;
      }
      let tx = dx0 + dx1;
      let tz = dz0 + dz1;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-4) {
        tx = dx1;
        tz = dz1;
      } else {
        tx /= tl;
        tz /= tl;
      }
      const m = half / Math.max(0.5, -tz * -dz0 + tx * dx0);
      const lx = x - tz * m;
      const lz = z + tx * m;
      const rx = x + tz * m;
      const rz = z - tx * m;
      if (i > 0) this.quad(k, plx, plz, prx, prz, rx, rz, lx, lz, color, flag);
      plx = lx;
      plz = lz;
      prx = rx;
      prz = rz;
    }
    if (caps) {
      this.disc(k, pts[0], pts[1], half, color, flag);
      this.disc(k, pts[n * 2 - 2], pts[n * 2 - 1], half, color, flag);
    }
  }

  poly(k, pts, color, flag = 0) {
    const contour = [];
    for (let i = 0; i < pts.length; i += 2) contour.push(new THREE.Vector2(pts[i], pts[i + 1]));
    if (contour.length < 3) return;
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      this.tri(k, contour[t[0]].x, contour[t[0]].y, contour[t[1]].x, contour[t[1]].y, contour[t[2]].x, contour[t[2]].y, color, flag);
    }
  }

  // Una malla por capa y sector. Todas las capas van exactamente a la misma cota y se ordenan solo
  // con el polygonOffset: si se separasen en altura, en las crestas asomaría la de debajo.
  build() {
    const group = new THREE.Group();
    this.layers.forEach((sectors, k) => {
      const mat = createBrickMaterial({ vertexColors: true, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -(k + 1) * 0.5, polygonOffsetUnits: -(k + 1) * 2 });
      for (const L of sectors.values()) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L.p), 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(L.n), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(L.c), 3));
        geo.setAttribute('aFlags', new THREE.BufferAttribute(new Float32Array(L.f), 1));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.renderOrder = -5 + k;
        group.add(mesh);
      }
    });
    this.layers = null;
    return group;
  }
}

// Cara k de un rectángulo local (0: +Z, 1: +X, 2: -Z, 3: -X) con ayudas para colocar piezas en ella
function face(W, f, w, d, k) {
  const a = (k * Math.PI) / 2;
  const nx = Math.round(Math.sin(a));
  const nz = Math.round(Math.cos(a));
  const tx = Math.round(Math.cos(a));
  const tz = Math.round(-Math.sin(a));
  const half = (k % 2 === 0 ? d : w) / 2;
  const at = (t, off) => f.p(tx * t + nx * (half + off), tz * t + nz * (half + off));
  return {
    len: k % 2 === 0 ? w : d,
    rot: f.rot + a,
    at,
    put(t, y, off, bw, bh, bd, color, flags = 0) {
      const q = at(t, off);
      W.batch.box(q[0], y, q[1], bw, bh, bd, color, flags, f.rot + a);
    },
  };
}

function signOn(W, fc, text, y, rnd, bg, fg) {
  const w = Math.min(fc.len - 1, Math.max(7, text.length * 0.95), 16);
  if (w < 4) return;
  const h = Math.min(1.7, w / 4);
  fc.put(0, y - h / 2 - 0.15, 0.08, w + 0.4, h + 0.3, 0.2, C.white);
  const q = fc.at(0, 0.2);
  addSign(W, text, q[0], y, q[1], fc.rot, w, h, bg ?? rnd.pick(SIGN_BG), fg);
}

function windowsRow(fc, y, n, rnd, trim, glass, h = 2.9) {
  for (let i = 0; i < n; i++) {
    const t = -fc.len / 2 + (fc.len / n) * (i + 0.5);
    if (trim != null) fc.put(t, y - 0.3, 0.08, 2.9, h + 0.6, 0.2, trim);
    fc.put(t, y, 0.16, 2.3, h, 0.3, glass, F.WINDOW | (rnd.chance(0.4) ? F.LIT : 0));
  }
}

function door(fc, t, trim, color, w = 2.3, h = 5.1) {
  fc.put(t, 0, 0.1, w + 0.7, h + 0.4, 0.2, trim);
  fc.put(t, 0, 0.18, w, h, 0.3, color);
}

// Tejado a dos aguas con la cumbrera paralela a la fachada indicada
function gable(W, f, w, d, y, k, color, pitch = 0.45) {
  const ridgeX = k % 2 === 0;
  const span = (ridgeX ? d : w) + 1.2;
  const len = (ridgeX ? w : d) + 0.5;
  const n = Math.max(2, Math.min(5, Math.round(span / 4.2)));
  const lh = (span * 0.5 * pitch) / n;
  for (let i = 0; i < n; i++) {
    const m = span * (1 - i / n);
    fbox(W.batch, f, 0, y, 0, ridgeX ? len : m, lh, ridgeX ? m : len, color, F.STUDS);
    y += lh;
  }
  return y;
}

// Casa de pueblo: fachada encalada o de ladrillo, ventanas y tejado de teja
function house(W, b, rnd, fam) {
  const f = frame(b.x, b.z, b.rot);
  const floors = Math.max(1, Math.min(4, b.levels));
  const H = G0 + (floors - 1) * FH;
  const wall = rnd.pick(fam);
  const trim = wall === C.white ? rnd.pick([C.cream, C.stone, C.white]) : C.white;
  fbox(W.batch, f, 0, 0, 0, b.w, H, b.d, wall, F.SEAMS);
  for (let k = 0; k < 4; k++) {
    if (!((b.open >> k) & 1)) continue;
    const fc = face(W, f, b.w, b.d, k);
    if (fc.len < 4.6) continue;
    const main = k % 2 === b.front % 2;
    const n = Math.max(1, Math.min(main ? 4 : 2, Math.floor((fc.len - 1) / 5.4)));
    for (let fl = 0; fl < floors; fl++) {
      const y = fl === 0 ? 1.9 : G0 + (fl - 1) * FH + 1.5;
      if (k === b.front && fl === 0) {
        const dc = rnd.pick(DOORS);
        if (fc.len >= 8.5) {
          door(fc, -fc.len / 4, trim, dc);
          fc.put(fc.len / 4, y - 0.3, 0.08, 2.9, 3.5, 0.2, trim);
          fc.put(fc.len / 4, y, 0.16, 2.3, 2.9, 0.3, C.glass, F.WINDOW | (rnd.chance(0.5) ? F.LIT : 0));
        } else door(fc, 0, trim, dc);
      } else windowsRow(fc, y, n, rnd, main ? trim : null, C.glass);
    }
    if (k === b.front && b.label >= 0) signOn(W, fc, D.labels[b.label], G0 - 0.4, rnd);
  }
  const top = gable(W, f, b.w, b.d, H, b.front, rnd.pick(ROOFS));
  if (rnd.chance(0.45) && b.w > 6 && b.d > 6) fbox(W.batch, f, rnd.range(-b.w / 4, b.w / 4), H, rnd.range(-b.d / 4, b.d / 4), 1.3, top - H + 1.6, 1.3, trim, F.SEAMS);
  W.terrain.box(b.x, b.z, b.w + 0.4, b.d + 0.4, top, b.rot);
}

// Bloque de azotea plana: pisos, edificios públicos y comercios
function block(W, b, rnd, fam, pub) {
  const f = frame(b.x, b.z, b.rot);
  const floors = Math.max(pub ? 1 : 2, Math.min(5, b.levels));
  const g0 = pub ? 8 : G0;
  const H = g0 + (floors - 1) * FH;
  const label = b.label >= 0 ? D.labels[b.label] : '';
  const wall = pub ? rnd.pick([C.cream, C.white, C.tan, 0xe8c98a]) : rnd.pick([TEJA, 0xc46a43, C.cream, C.white, C.tan]);
  const trim = wall === C.white ? C.stone : C.white;
  fbox(W.batch, f, 0, 0, 0, b.w, H, b.d, wall, F.SEAMS);
  fbox(W.batch, f, 0, 0, 0, b.w + 0.3, 1.3, b.d + 0.3, pub ? C.stone : C.dgray, F.SEAMS);
  for (let k = 0; k < 4; k++) {
    if (!((b.open >> k) & 1)) continue;
    const fc = face(W, f, b.w, b.d, k);
    if (fc.len < 4.6) continue;
    const n = Math.max(1, Math.min(8, Math.floor((fc.len - 1) / 5.2)));
    for (let fl = 0; fl < floors; fl++) {
      const y = fl === 0 ? 2.1 : g0 + (fl - 1) * FH + 1.5;
      if (k === b.front && fl === 0) {
        door(fc, 0, trim, pub ? C.glassDark : rnd.pick(DOORS), 3.4, 5.6);
        if (fc.len > 14) {
          for (const s of [-1, 1]) {
            fc.put(s * (fc.len / 4 + 1), 1.4, 0.08, fc.len / 2 - 5.4, 4.4, 0.2, trim);
            fc.put(s * (fc.len / 4 + 1), 1.7, 0.16, fc.len / 2 - 6, 3.8, 0.3, C.glass, F.WINDOW | F.LIT);
          }
        }
      } else windowsRow(fc, y, n, rnd, trim, pub ? C.glass : rnd.chance(0.3) ? C.glassDark : C.glass);
    }
    if (k === b.front) {
      if (label) signOn(W, fc, label, g0 - 0.6, rnd, label.startsWith('POLICÍA') ? '#0055bf' : label.startsWith('AYUNTAMIENTO') ? '#7a1414' : undefined);
      if (label.startsWith('AYUNTAMIENTO')) {
        // Balcón con banderas y reloj
        fc.put(0, g0 + 0.2, 0.7, 7, 0.4, 1.4, C.stone, F.STUDS);
        [C.red, C.yellow, C.red].forEach((col, i) => fc.put(-2 + i * 0.01, g0 + 3.2 + i * 0.7, 1.3, 2.6, 0.7, 0.12, col));
        fc.put(-3.4, g0 + 0.6, 1.3, 0.2, 5.2, 0.2, C.white);
        fc.put(2.2, g0 + 3.4, 1.3, 2.6, 2.1, 0.12, C.medAzure);
        fc.put(3.6, g0 + 0.6, 1.3, 0.2, 5.2, 0.2, C.white);
        fc.put(0, H - 0.5, 0.1, 3, 3, 0.3, C.white);
        fc.put(0, H + 0.2, 0.2, 1.8, 1.8, 0.3, C.black);
      }
    }
  }
  if (label.startsWith('POLICÍA')) {
    // La puerta del cuartelillo: de aquí sale el municipal y aquí acaban los más buscados
    const fc = face(W, f, b.w, b.d, b.front);
    const a = fc.at(0, 0);
    const q = fc.at(0, 8);
    W.places.police = { x: q[0], z: q[1], heading: Math.atan2(q[0] - a[0], q[1] - a[1]) };
  }
  fbox(W.batch, f, 0, H, 0, b.w + 0.8, 0.5, b.d + 0.8, trim, F.STUDS);
  if (b.w > 9 && b.d > 9) {
    fbox(W.batch, f, 0, H + 0.5, 0, b.w - 2.4, 0.7, b.d - 2.4, wall, F.STUDS);
    if (rnd.chance(0.5)) fbox(W.batch, f, rnd.range(-b.w / 5, b.w / 5), H + 1.2, rnd.range(-b.d / 5, b.d / 5), 3, 1.8, 2.2, C.lgray, F.SEAMS | F.STUDS);
  }
  W.terrain.box(b.x, b.z, b.w + 0.6, b.d + 0.6, H + 0.5, b.rot);
}

// Nave del polígono industrial
function nave(W, b, rnd) {
  const f = frame(b.x, b.z, b.rot);
  const H = 9.5 + Math.min(2, b.levels - 1) * 3 + (b.w * b.d > 1800 ? 2 : 0);
  const wall = rnd.pick([0x9aa5ad, C.sandBlue, C.white, C.tan, 0x7d8a96, C.lgray, C.cream]);
  const stripe = rnd.pick([C.red, C.blue, C.orange, C.green, C.yellow, C.dgray]);
  fbox(W.batch, f, 0, 0, 0, b.w, H, b.d, wall, F.SEAMS);
  fbox(W.batch, f, 0, H - 2.4, 0, b.w + 0.25, 1.2, b.d + 0.25, stripe, 0);
  const fc = face(W, f, b.w, b.d, b.front);
  if ((b.open >> b.front) & 1) {
    const n = Math.max(1, Math.min(3, Math.floor(fc.len / 15)));
    for (let i = 0; i < n; i++) {
      const t = -fc.len / 2 + (fc.len / n) * (i + 0.5);
      if (fc.len > 8) fc.put(t, 0, 0.12, Math.min(7, fc.len - 2), 6.4, 0.25, i % 2 ? C.lgray : C.dgray, F.SEAMS);
    }
    if (b.label >= 0) signOn(W, fc, D.labels[b.label], H - 3.6, rnd);
  }
  const top = gable(W, f, b.w, b.d, H, b.w >= b.d ? 0 : 1, rnd.pick([C.lgray, C.dgray, 0x8f3d1f, C.stone]), 0.2);
  W.terrain.box(b.x, b.z, b.w + 0.4, b.d + 0.4, top, b.rot);
}

function church(W, b, rnd) {
  const f = frame(b.x, b.z, b.rot);
  const STONE = 0xd8c9a0;
  const H = 17;
  const long = b.w >= b.d ? 0 : 1;
  fbox(W.batch, f, 0, 0, 0, b.w, H, b.d, STONE, F.SEAMS);
  fbox(W.batch, f, 0, 0, 0, b.w + 0.4, 1.6, b.d + 0.4, C.darkTan, F.SEAMS);
  for (let k = 0; k < 4; k++) {
    const fc = face(W, f, b.w, b.d, k);
    if (k === b.front) {
      fc.put(0, 0, 0.1, 5.4, 8.2, 0.25, C.darkTan);
      fc.put(0, 0, 0.2, 4.2, 7.4, 0.3, C.brown);
      fc.put(0, 10.4, 0.15, 3, 3, 0.3, C.yellow, F.GLOW);
      signOn(W, fc, b.label >= 0 ? D.labels[b.label] : 'IGLESIA', 9.4, rnd, '#5c3a21', '#ffd23a');
    } else if (((b.open >> k) & 1) && fc.len > 8) {
      const n = Math.max(1, Math.floor(fc.len / 9));
      for (let i = 0; i < n; i++) fc.put(-fc.len / 2 + (fc.len / n) * (i + 0.5), 6, 0.12, 1.6, 6.5, 0.3, C.medAzure, F.WINDOW | F.LIT);
    }
  }
  const top = gable(W, f, b.w, b.d, H, long, TEJA, 0.6);
  W.terrain.box(b.x, b.z, b.w + 0.5, b.d + 0.5, top, b.rot);
}

function belfry(W, b) {
  const f = frame(b.x, b.z, b.rot);
  const STONE = 0xd8c9a0;
  const s = Math.max(10, Math.min(b.w, b.d));
  const H = 40;
  fbox(W.batch, f, 0, 0, 0, s, H, s, STONE, F.SEAMS);
  fbox(W.batch, f, 0, H - 12, 0, s + 0.8, 0.8, s + 0.8, C.darkTan, F.STUDS);
  for (let k = 0; k < 4; k++) {
    const fc = face(W, f, s, s, k);
    fc.put(0, H - 9.5, 0.1, s * 0.34, 6.5, 0.3, C.black);
    fc.put(0, H - 20, 0.1, 3.4, 3.4, 0.3, C.white);
    fc.put(0, H - 19.4, 0.22, 2.2, 2.2, 0.2, C.black);
  }
  let y = H;
  for (let i = 0; i < 4; i++) {
    fbox(W.batch, f, 0, y, 0, (s + 1.4) * (1 - i / 4), 1.6, (s + 1.4) * (1 - i / 4), TEJA, F.STUDS);
    y += 1.6;
  }
  fbox(W.batch, f, 0, y, 0, 0.4, 4, 0.4, C.gold, F.GLOW);
  fbox(W.batch, f, 0, y + 2.4, 0, 2.2, 0.4, 0.4, C.gold, F.GLOW);
  W.terrain.box(b.x, b.z, s + 0.6, s + 0.6, H, b.rot);
  W.places.belfry = { x: b.x, z: b.z, top: y + 4 };
}

function shed(W, b, rnd) {
  const f = frame(b.x, b.z, b.rot);
  const H = 5.4;
  fbox(W.batch, f, 0, 0, 0, b.w, H, b.d, rnd.pick([C.lgray, C.tan, C.white, C.cream, 0xc46a43]), F.SEAMS);
  fbox(W.batch, f, 0, H, 0, b.w + 0.6, 0.5, b.d + 0.6, rnd.pick([C.dgray, TEJA, 0x8f3d1f]), F.STUDS);
  const fc = face(W, f, b.w, b.d, b.front);
  if (((b.open >> b.front) & 1) && fc.len >= 5) fc.put(0, 0, 0.1, Math.min(fc.len - 1.4, 6), 4.2, 0.2, rnd.pick([C.white, C.lgray, C.brown]), F.SEAMS);
  W.terrain.box(b.x, b.z, b.w + 0.4, b.d + 0.4, H + 0.5, b.rot);
}

// Marquesina: postes y cubierta, sin colisión (se pasa por debajo)
function canopy(W, b, rnd) {
  const f = frame(b.x, b.z, b.rot);
  const H = b.w * b.d > 500 ? 9 : 5.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fbox(W.batch, f, sx * (b.w / 2 - 0.6), -b.drop, sz * (b.d / 2 - 0.6), 0.6, H + b.drop, 0.6, C.lgray, 0);
  fbox(W.batch, f, 0, H, 0, b.w, 0.7, b.d, b.w * b.d > 500 ? C.orange : rnd.pick([C.white, C.lgray, C.red]), F.STUDS);
}

function construction(W, b) {
  const f = frame(b.x, b.z, b.rot);
  for (const y of [0, 6.5, 13]) fbox(W.batch, f, 0, y, 0, b.w, 0.6, b.d, C.lgray, F.STUDS);
  const nx = Math.max(2, Math.round(b.w / 8));
  const nz = Math.max(2, Math.round(b.d / 8));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
      fbox(W.batch, f, -b.w / 2 + 0.6 + ((b.w - 1.2) * i) / (nx - 1), 0.6, -b.d / 2 + 0.6 + ((b.d - 1.2) * j) / (nz - 1), 0.9, 12.4, 0.9, C.dgray, F.SEAMS);
    }
  }
  fbox(W.batch, f, 0, 0.6, 0, b.w - 2, 5.9, b.d - 2, C.stone, F.SEAMS);
  W.terrain.box(b.x, b.z, b.w + 0.3, b.d + 0.3, 13.6, b.rot);
  if (b.label >= 0) {
    const fc = face(W, f, b.w, b.d, b.front);
    signOn(W, fc, D.labels[b.label], 4.6, null, '#fe8a18');
  }
}

function buildings(W) {
  const A = D.buildings;
  for (let i = 0; i < A.length; i += 11) {
    const b = { x: A[i], z: A[i + 1], w: A[i + 2], d: A[i + 3], rot: A[i + 4] * RAD, levels: A[i + 5], kind: A[i + 6], front: A[i + 7], label: A[i + 8], group: A[i + 9], open: A[i + 10] };
    const rnd = makeRng(b.group * 7919 + 13);
    const fam = FAMILIES[Math.abs((Math.floor(b.x / 120) * 73856093) ^ (Math.floor(b.z / 120) * 19349663)) % FAMILIES.length];
    plot(W, b);
    switch (b.kind) {
      case 1: block(W, b, rnd, fam, false); break;
      case 2: nave(W, b, rnd); break;
      case 3: block(W, b, rnd, fam, true); break;
      case 4: church(W, b, rnd); break;
      case 5: shed(W, b, rnd); break;
      case 6: canopy(W, b, rnd); break;
      case 7: construction(W, b); break;
      case 8: belfry(W, b); break;
      default: house(W, b, rnd, fam);
    }
    if (b.kind !== 6) W.map.buildings.push(b);
    if (i / 11 === D.home) homeDecor(W, b);
    W.batch.level = null;
  }
}

// Cada edificio se asienta a la cota de su fachada principal, con la puerta a pie de calle,
// y un zócalo de piedra lo calza por el lado en que el terreno cae
function plot(W, b) {
  const f = frame(b.x, b.z, b.rot);
  const a = (b.front * Math.PI) / 2;
  const half = (b.front % 2 === 0 ? b.d : b.w) / 2;
  const level = (W.batch.level = lift(...f.p(Math.round(Math.sin(a)) * half, Math.round(Math.cos(a)) * half)));
  let low = level;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) low = Math.min(low, lift(...f.p((sx * b.w) / 2, (sz * b.d) / 2)));
  b.drop = level - low + 0.3;
  if (b.kind !== 6) fbox(W.batch, f, 0, -b.drop, 0, b.w + 0.3, b.drop, b.d + 0.3, C.stone, F.SEAMS);
}

// La casa de salida: un banderín y un buzón para reconocerla
function homeDecor(W, b) {
  const f = frame(b.x, b.z, b.rot);
  const fc = face(W, f, b.w, b.d, b.front);
  const q = fc.at(fc.len / 2 - 1, 1.2);
  W.batch.box(q[0], 0, q[1], 0.3, 11, 0.3, C.white, 0);
  fc.put(fc.len / 2 - 2.3, 8.6, 1.2, 2.4, 1.6, 0.14, C.azure);
  fc.put(fc.len / 2 - 2.3, 9.1, 1.28, 0.8, 0.6, 0.1, C.yellow, F.GLOW);
  W.places.home = { x: b.x, z: b.z };
}

function ground(W, G) {
  const { batch, terrain, rng } = W;
  const M = 1700;
  const X0 = BOUNDS.x0 - M;
  const X1 = BOUNDS.x1 + M;
  const Z0 = BOUNDS.z0 - M;
  const Z1 = BOUNDS.z1 + M;
  // La charca del mega salto es un hueco en el suelo
  const m = D.places.mega;
  const h = (W.places.megaHole = { x0: m.x, x1: m.x + 108, z0: m.z - 27, z1: m.z + 31 });
  terrain.hole(h.x0, h.z0, h.x1, h.z1);
  const cx = (h.x0 + h.x1) / 2;
  const cz = (h.z0 + h.z1) / 2;
  for (const s of [-1, 1]) {
    batch.box(cx + s * ((h.x1 - h.x0) / 2 + 0.5), -3, cz, 1, 2.95, h.z1 - h.z0 + 2, WHEAT, F.SEAMS);
    batch.box(cx, -3, cz + s * ((h.z1 - h.z0) / 2 + 0.5), h.x1 - h.x0, 2.95, 1, WHEAT, F.SEAMS);
  }
  batch.box(cx, -3.4, cz, h.x1 - h.x0, 2, h.z1 - h.z0, C.water, F.STUDS | F.WINDOW);
  // Parte un rectángulo por una caja: out recibe los trozos de fuera e inn el de dentro
  const cut = (x0, z0, x1, z1, b, out, inn) => {
    if (x1 <= b.x0 || x0 >= b.x1 || z1 <= b.z0 || z0 >= b.z1) return out(x0, z0, x1, z1);
    const xa = Math.max(x0, b.x0);
    const xb = Math.min(x1, b.x1);
    if (x0 < b.x0) out(x0, z0, b.x0, z1);
    if (x1 > b.x1) out(b.x1, z0, x1, z1);
    if (z0 < b.z0) out(xa, z0, xb, b.z0);
    if (z1 > b.z1) out(xa, b.z1, xb, z1);
    if (inn) inn(xa, Math.max(z0, b.z0), xb, Math.min(z1, b.z1));
  };
  // Campos de cereal a parches: lejos del pueblo van con triángulos grandes, y la charca queda hueca
  const S = 230;
  for (let x = X0; x < X1; x += S) {
    for (let z = Z0; z < Z1; z += S) {
      const pick = rng.pick(FIELDS);
      const col = x < h.x1 + 4 && x + S > h.x0 - 4 && z < h.z1 + 4 && z + S > h.z0 - 4 ? WHEAT : pick;
      const field = (far) => (x0, z0, x1, z1) => G.quad(LY.field, x0, z0, x1, z0, x1, z1, x0, z1, col, F.STUDS, far);
      cut(x, z, x + S, z + S, NEAR, field(true), (...r) => cut(...r, h, field(false)));
    }
  }
  for (const p of D.urban) G.poly(LY.urban, p, 0xd6ccb0, F.STUDS);
  for (const [type, , pts] of D.greens) G.poly(LY.green, pts, type === 1 ? 0x3f8a45 : type === 2 ? 0x9fc36a : 0x58b35a, F.STUDS);
  for (const p of D.water) {
    G.poly(LY.water, p, C.water, F.WINDOW);
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < p.length; i += 2) {
      cx += p[i];
      cz += p[i + 1];
    }
    cx /= p.length / 2;
    cz /= p.length / 2;
    let r = 0;
    for (let i = 0; i < p.length; i += 2) r += Math.hypot(p[i] - cx, p[i + 1] - cz);
    W.splash.push({ x: cx, z: cz, r: (r / (p.length / 2)) * 0.8 });
  }
  for (const p of D.streams) G.ribbon(LY.water, p, 2.4, C.water, F.WINDOW);
  for (const [type, , pts] of D.paved) {
    if (type === 0) G.poly(LY.path, pts, 0xe6d8b4, F.STUDS);
    else G.poly(LY.road, pts, 0x565b62, 0);
  }
}

function roads(W, G) {
  const ROAD = [C.road, C.road, C.road, C.road, 0x565b62, 0xe6d8b4, 0xd2b48c, 0xb9925f, 0x70757b];
  for (const [cls, width, sw, , oneway, pts] of D.roads) {
    const half = width / 2;
    if (sw > 0) G.ribbon(LY.sidewalk, pts, half + sw, SIDEWALK_COLOR, F.STUDS, true);
    const soft = cls >= 5 && cls <= 7;
    G.ribbon(soft ? LY.path : LY.road, pts, half, ROAD[cls], cls === 5 ? F.STUDS : 0, true);
    // Línea discontinua central en las calles de doble sentido
    if (cls <= 3 && !oneway && width >= 11) {
      let acc = 3;
      for (let i = 2; i < pts.length; i += 2) {
        const ax = pts[i - 2];
        const az = pts[i - 1];
        const dx = pts[i] - ax;
        const dz = pts[i + 1] - az;
        const l = Math.hypot(dx, dz);
        if (l < 0.01) continue;
        const ux = dx / l;
        const uz = dz / l;
        let s = acc;
        for (; s + 4 <= l; s += 10) {
          const x0 = ax + ux * s;
          const z0 = az + uz * s;
          const x1 = x0 + ux * 4;
          const z1 = z0 + uz * 4;
          G.quad(LY.mark, x0 - uz * 0.24, z0 + ux * 0.24, x0 + uz * 0.24, z0 - ux * 0.24, x1 + uz * 0.24, z1 - ux * 0.24, x1 - uz * 0.24, z1 + ux * 0.24, C.white, 0);
        }
        acc = Math.max(0, s - l);
      }
    }
  }
}

function walls(W) {
  const { batch, terrain } = W;
  const SPEC = [
    { h: 1.5, t: 0.6, colors: [C.white, C.cream, C.tan, 0xc46a43], flags: F.SEAMS | F.STUDS },
    { h: 1.4, t: 0.3, colors: [C.green, C.dgray, 0x2f6f4a], flags: 0 },
    { h: 1.8, t: 1.3, colors: [C.brightGreen, C.green], flags: F.STUDS },
  ];
  D.walls.forEach((arr, type) => {
    const sp = SPEC[type];
    for (let i = 0; i < arr.length; i += 4) {
      const dx = arr[i + 2] - arr[i];
      const dz = arr[i + 3] - arr[i + 1];
      const l = Math.hypot(dx, dz);
      const x = (arr[i] + arr[i + 2]) / 2;
      const z = (arr[i + 1] + arr[i + 3]) / 2;
      const rot = Math.atan2(-dz, dx);
      const col = sp.colors[Math.abs(Math.floor(x / 60) * 31 + Math.floor(z / 60) * 17) % sp.colors.length];
      // En cuesta el tramo se trocea y baja a escalones, como las tapias de verdad
      const n = Math.max(1, Math.min(Math.ceil(l / 4), Math.ceil(Math.abs(lift(arr[i], arr[i + 1]) - lift(arr[i + 2], arr[i + 3])) / 0.4)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        batch.box(arr[i] + dx * t, -0.4, arr[i + 1] + dz * t, l / n + sp.t * 0.5, sp.h + 0.4, sp.t, col, sp.flags, rot);
      }
      terrain.box(x, z, l + sp.t * 0.5, sp.t + 0.2, sp.h, rot);
    }
  });
}

// Pista deportiva: suelo, líneas y porterías o canastas
function court(W, x, z, w, d, rot, sport) {
  const { batch } = W;
  if (w < d) {
    [w, d] = [d, w];
    rot += Math.PI / 2;
  }
  const f = frame(x, z, rot);
  const floor = sport === 1 ? 0x4aa652 : sport === 2 ? 0xc8553d : sport === 3 ? 0x2f7fb8 : 0x5cb85f;
  fbox(batch, f, 0, 0, 0, w + 3, 0.1, d + 3, sport === 3 ? 0x3f9a48 : 0x8a939c, F.STUDS);
  fbox(batch, f, 0, 0.1, 0, w, 0.06, d, floor, 0);
  const line = (lx, lz, lw, ld) => fbox(batch, f, lx, 0.16, lz, lw, 0.03, ld, C.white, 0);
  line(0, -d / 2 + 0.3, w, 0.4);
  line(0, d / 2 - 0.3, w, 0.4);
  line(-w / 2 + 0.3, 0, 0.4, d);
  line(w / 2 - 0.3, 0, 0.4, d);
  line(0, 0, 0.4, d);
  for (const s of [-1, 1]) {
    const gx = s * (w / 2 - 0.4);
    if (sport === 2) {
      fbox(batch, f, gx + s * 1.2, 0, 0, 0.5, 7, 0.5, C.dgray, 0);
      fbox(batch, f, gx - s * 0.2, 5.6, 0, 0.3, 2.4, 3.6, C.white, 0);
      fbox(batch, f, gx - s * 1.0, 5.8, 0, 1.2, 0.2, 1.2, C.orange, 0);
      W.terrain.cyl(...f.p(gx + s * 1.2, 0), 0.6, 7);
      const q = f.p(gx - s * 1.0, 0);
      W.places.hoops.push({ x: q[0], z: q[1], y: 5.9, nx: -s * f.c, nz: s * f.s, half: d / 2, len: w });
    } else if (sport === 3) {
      if (s > 0) fbox(batch, f, 0, 0.16, 0, 0.3, 1.8, d + 1.6, C.white, F.SEAMS);
    } else {
      const gw = Math.min(12, d * 0.4);
      for (const sz of [-1, 1]) fbox(batch, f, gx, 0, (sz * gw) / 2, 0.5, 4.6, 0.5, C.white, 0);
      fbox(batch, f, gx, 4.6, 0, 0.5, 0.5, gw + 0.5, C.white, 0);
      fbox(batch, f, gx + s * 1.6, 0, 0, 0.12, 4.4, gw, C.lgray, 0);
    }
  }
  W.map.pitches.push({ x, z, w, d, rot, color: sport === 1 ? '#4aa652' : sport === 2 ? '#c8553d' : sport === 3 ? '#2f7fb8' : '#5cb85f' });
}

function furniture(W) {
  const P = D.pools;
  for (let i = 0; i < P.length; i += 5) {
    // Bordillo y lámina de agua, tendidos sobre el terreno como el resto del suelo
    const f = frame(P[i], P[i + 1], P[i + 4] * RAD);
    const rect = (k, w, d, color, flag) => W.ground.quad(k, ...f.p(-w / 2, -d / 2), ...f.p(w / 2, -d / 2), ...f.p(w / 2, d / 2), ...f.p(-w / 2, d / 2), color, flag);
    rect(LY.sidewalk, P[i + 2] + 1.6, P[i + 3] + 1.6, C.cream, F.STUDS);
    rect(LY.path, P[i + 2], P[i + 3], 0x4fb4f0, F.WINDOW);
    W.splash.push({ x: P[i], z: P[i + 1], r: Math.min(P[i + 2], P[i + 3]) / 2 });
  }
  for (const p of D.pitches) if (p[5] !== 4) court(W, p[0], p[1], p[2], p[3], p[4] * RAD, p[5]);
  const T = D.trees;
  const KINDS = ['round', 'round', 'pink', 'pine'];
  for (let i = 0; i < T.length; i += 3) tree(W, T[i], T[i + 1], 0, T[i + 2] === 1 && i % 7 === 0 ? 'olive' : KINDS[T[i + 2]]);
  const L = D.lamps;
  for (let i = 0; i < L.length; i += 4) lamp(W, L[i], L[i + 1], L[i + 2], L[i + 3]);
  const R = D.props;
  for (let i = 0; i < R.length; i += 4) W.props.push({ type: PROPS[R[i]], x: R[i + 1], z: R[i + 2], rot: R[i + 3], y: 0 });
  const S = D.studs;
  for (let i = 0; i < S.length; i += 3) W.studs.push({ x: S[i], y: 1.4, z: S[i + 1], type: S[i + 2] });
  const V = D.deliveries;
  for (let i = 0; i < V.length; i += 3) W.doors.push({ x: V[i], z: V[i + 1], name: D.addrs[V[i + 2]] });
  for (const p of D.peds) W.pedPaths.push(p);
}

// ---------- Nombres de zona: la calle por la que se circula ----------
const ZC = 12;
const zoneGrid = new Map();
const zkey = (x, z) => (Math.floor(x / ZC) + 4096) * 8192 + Math.floor(z / ZC) + 4096;
function buildZones() {
  for (const [cls, , , name, , pts] of D.roads) {
    if (name < 0 || cls > 5) continue;
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - pts[i - 2];
      const dz = pts[i + 1] - pts[i - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 6));
      for (let k = 0; k <= n; k++) {
        const x = pts[i - 2] + (dx * k) / n;
        const z = pts[i - 1] + (dz * k) / n;
        for (let a = -1; a <= 1; a++) {
          for (let b = -1; b <= 1; b++) {
            const key = zkey(x + a * ZC, z + b * ZC);
            if (a === 0 && b === 0) zoneGrid.set(key, name);
            else if (!zoneGrid.has(key)) zoneGrid.set(key, name);
          }
        }
      }
    }
  }
}

function inPoly(x, z, q) {
  let c = false;
  for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
    if (q[i + 1] > z !== q[j + 1] > z && x < ((q[j] - q[i]) * (z - q[i + 1])) / (q[j + 1] - q[i + 1]) + q[i]) c = !c;
  }
  return c;
}

export function zoneAt(x, z) {
  const n = zoneGrid.get(zkey(x, z));
  if (n != null) return D.names[n];
  for (const [, name, pts] of D.paved) if (name >= 0 && inPoly(x, z, pts)) return D.names[name];
  for (const [, name, pts] of D.greens) if (name >= 0 && inPoly(x, z, pts)) return D.names[name];
  for (const [type, , pts] of D.greens) if (type !== 1 && inPoly(x, z, pts)) return 'Parque';
  for (const p of D.urban) if (inPoly(x, z, p)) return 'Cobeña';
  return 'Campos de Cobeña';
}

// Suelo, calles, casas, vallas y mobiliario. Los lugares especiales los crea landmarks.js.
export function buildTown(W) {
  const G = (W.ground = new Ground(8));
  ground(W, G);
  roads(W, G);
  buildings(W);
  walls(W);
  furniture(W);
  buildZones();
}
