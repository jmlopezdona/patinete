import D from './cobena-data.js';
import { clip } from './relief.js';

// Bordillos: las aceras de las calles van un escalón por encima de la calzada. La forma sale del
// callejero: es acera lo que queda a menos de `sw` del borde de una calle y fuera de toda calzada
// (las de asfalto; los caminos de tierra pasan por debajo). De aquí beben la física (curbAt), el
// dibujo (curbs) y los cantos por los que se puede grindar (curbRails).
export const CURB = 0.25;
const REACH = 14; // hasta dónde se mide la distancia a una calzada
const EPS = 0.02;
const LEAF = 1.5; // tamaño al que un trozo de acera se recorta ya en línea recta
const GC = 24;
const grid = new Map();
const gkey = (x, z) => (Math.floor(x / GC) + 512) * 1024 + Math.floor(z / GC) + 512;
const hard = (cls) => cls < 5 || cls > 7;

const roads = [];
D.roads.forEach(([cls, width, sw, , , pts]) => {
  if (!hard(cls)) return;
  const half = width / 2;
  const road = { pts, half, sw, segs: [] };
  let at = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2];
    const az = pts[i - 1];
    const dx = pts[i] - ax;
    const dz = pts[i + 1] - az;
    const s = { ax, az, dx, dz, l2: dx * dx + dz * dz || 1, half, out: sw > 0 ? half + sw : 0, at, mute: false };
    at += Math.hypot(dx, dz);
    road.segs.push(s);
    const e = half + REACH;
    for (let gx = Math.floor((Math.min(ax, ax + dx) - e) / GC); gx <= Math.floor((Math.max(ax, ax + dx) + e) / GC); gx++) {
      for (let gz = Math.floor((Math.min(az, az + dz) - e) / GC); gz <= Math.floor((Math.max(az, az + dz) + e) / GC); gz++) {
        const k = gkey(gx * GC, gz * GC);
        let c = grid.get(k);
        if (!c) grid.set(k, (c = []));
        c.push(s);
      }
    }
  }
  if (sw > 0) roads.push(road);
});

// Explanadas de asfalto (aparcamientos, plazas de calzada): también cortan la acera
const lots = D.paved.filter(([type]) => type !== 0).map(([, , pts]) => {
  const b = { pts, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (let i = 0; i < pts.length; i += 2) {
    b.x0 = Math.min(b.x0, pts[i]);
    b.x1 = Math.max(b.x1, pts[i]);
    b.z0 = Math.min(b.z0, pts[i + 1]);
    b.z1 = Math.max(b.z1, pts[i + 1]);
  }
  return b;
});

function dist(s, x, z) {
  const px = x - s.ax;
  const pz = z - s.az;
  const t = Math.min(1, Math.max(0, (px * s.dx + pz * s.dz) / s.l2));
  return Math.hypot(px - s.dx * t, pz - s.dz * t);
}

// Distancia con signo al borde de una explanada (negativa dentro)
function lotDist(b, x, z) {
  const q = b.pts;
  let c = false;
  let d = Infinity;
  for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
    if (q[i + 1] > z !== q[j + 1] > z && x < ((q[j] - q[i]) * (z - q[i + 1])) / (q[j + 1] - q[i + 1]) + q[i]) c = !c;
    const ex = q[i] - q[j];
    const ez = q[i + 1] - q[j + 1];
    const t = Math.min(1, Math.max(0, ((x - q[j]) * ex + (z - q[j + 1]) * ez) / (ex * ex + ez * ez || 1)));
    d = Math.min(d, Math.hypot(x - q[j] - ex * t, z - q[j + 1] - ez * t));
  }
  return c ? -d : d;
}

// Altura de la acera en un punto: CURB sobre una acera, 0 en la calzada y fuera de las calles
export function curbAt(x, z) {
  const cell = grid.get(gkey(x, z));
  if (!cell) return 0;
  let on = false;
  for (let i = 0; i < cell.length; i++) {
    const s = cell[i];
    const d = dist(s, x, z);
    if (d < s.half) return 0;
    if (d <= s.out) on = true;
  }
  if (!on) return 0;
  for (const b of lots) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && lotDist(b, x, z) < 0) return 0;
  return CURB;
}

// Distancia a la calzada más cercana (negativa dentro), sin pasar de REACH. No cuenta los tramos
// silenciados: los vecinos del trozo de acera que se esté recortando, que ya lo bordean.
function clear(x, z) {
  let c = REACH;
  const cell = grid.get(gkey(x, z));
  if (cell) {
    for (let i = 0; i < cell.length; i++) {
      const s = cell[i];
      if (!s.mute) c = Math.min(c, dist(s, x, z) - s.half);
    }
  }
  for (const b of lots) if (x > b.x0 - REACH && x < b.x1 + REACH && z > b.z0 - REACH && z < b.z1 + REACH) c = Math.min(c, lotDist(b, x, z));
  return c;
}

// ¿Está ya el trozo entero (x, z seguidos) sobre la calzada o sobre la acera recta de algún tramo?
function covered(p) {
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < p.length; i += 2) {
    cx += p[i] / (p.length / 2);
    cz += p[i + 1] / (p.length / 2);
  }
  const taken = (x, z) => {
    const cell = grid.get(gkey(x, z));
    if (!cell) return false;
    for (let i = 0; i < cell.length; i++) {
      const s = cell[i];
      const t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2;
      const d = dist(s, x, z);
      if (d < s.half || (t >= 0 && t <= 1 && d <= s.out)) return true;
    }
    return false;
  };
  if (!taken(cx, cz)) return false;
  // Las esquinas, un poco hacia dentro: justo en el borde no se sabe de qué lado caen
  for (let i = 0; i < p.length; i += 2) if (!taken(p[i] + (cx - p[i]) * 0.05, p[i + 1] + (cz - p[i + 1]) * 0.05)) return false;
  return true;
}

// Hacia dónde se abre una cinta en cada punto de su polilínea (ox, oz por punto): el borde izquierdo
// es p + o·half y el derecho p - o·half, con uniones a inglete
export function miters(pts) {
  const n = pts.length / 2;
  const o = new Float64Array(n * 2);
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
    const m = 1 / Math.max(0.5, tz * dz0 + tx * dx0);
    o[i * 2] = -tz * m;
    o[i * 2 + 1] = tx * m;
  }
  return o;
}

// Recorta un trozo convexo de acera (x, z seguidos) por las calzadas y entrega lo que queda.
// Lejos de toda calzada sale entero; cerca se parte hasta LEAF y ahí el corte ya es una recta.
function carve(p, top) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let lo = Infinity, hi = -Infinity;
  const c = [];
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    z0 = Math.min(z0, p[i + 1]);
    z1 = Math.max(z1, p[i + 1]);
    const v = clear(p[i], p[i + 1]) + EPS;
    c.push(v);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const size = Math.hypot(x1 - x0, z1 - z0);
  // Si el centro queda más lejos del borde de la calzada que cualquier esquina, no hay corte
  const far = clear((x0 + x1) / 2, (z0 + z1) / 2);
  if (size < REACH && lo >= 0 && far >= size / 2) return top(p);
  if (size < REACH && hi < 0 && far <= -size / 2) return;
  if (size > LEAF) {
    // Por la mitad, a través de su lado más largo
    const wide = x1 - x0 > z1 - z0;
    const m = wide ? (x0 + x1) / 2 : (z0 + z1) / 2;
    for (const s of [1, -1]) {
      const half = wide ? clip(p, s, 0, -s * m) : clip(p, 0, s, -s * m);
      if (half.length >= 6) carve(half, top);
    }
    return;
  }
  if (hi < 0) return;
  if (lo >= 0) return top(p);
  const out = [];
  for (let i = 0, n = c.length; i < n; i++) {
    const k = (i + 1) % n;
    if (c[i] >= 0) out.push(p[i * 2], p[i * 2 + 1]);
    if (c[i] >= 0 !== c[k] >= 0) {
      const t = c[i] / (c[i] - c[k]);
      out.push(p[i * 2] + (p[k * 2] - p[i * 2]) * t, p[i * 2 + 1] + (p[k * 2 + 1] - p[i * 2 + 1]) * t);
    }
  }
  if (out.length >= 6) top(out);
}

// Recorta un trozo que nace pegado a su propia calle: los tramos de alrededor no lo cortan, salvo
// que de verdad se le metan dentro (una curva más cerrada que el ancho de la acera). Con `end`
// es el remate redondo de un extremo, que por dentro ya sigue el borde de la calzada.
function carveBeside(road, i, p, top, end = false) {
  const muted = [];
  const at = road.segs[i].at;
  for (let j = 0; j < road.segs.length; j++) {
    const s = road.segs[j];
    if (Math.abs(j - i) > 2 && Math.abs(s.at - at) > 30) continue;
    let inside = false;
    for (let k = 0; k < p.length && !inside && !end; k += 2) {
      const n = (k + 2) % p.length;
      inside = dist(s, p[k], p[k + 1]) < s.half - EPS || dist(s, (p[k] + p[n]) / 2, (p[k + 1] + p[n + 1]) / 2) < s.half - EPS;
    }
    if (!inside) {
      s.mute = true;
      muted.push(s);
    }
  }
  carve(p, top);
  for (const s of muted) s.mute = false;
}

// Recorre las aceras levantadas. top(p) recibe cada trozo convexo de la cara de arriba (x, z
// seguidos) y side(ax, az, bx, bz, nx, nz) cada tramo de canto, con la normal mirando hacia fuera.
export function curbs(top, side) {
  // Cada lado de cada trozo es canto si justo al otro lado ya no hay acera
  const piece = (p) => {
    top(p);
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < p.length; i += 2) {
      cx += p[i] / (p.length / 2);
      cz += p[i + 1] / (p.length / 2);
    }
    for (let i = 0; i < p.length; i += 2) {
      const k = (i + 2) % p.length;
      const dx = p[k] - p[i];
      const dz = p[k + 1] - p[i + 1];
      const l = Math.hypot(dx, dz);
      if (l < 1e-3) continue;
      // El trozo va en cualquier sentido: fuera es el lado contrario a su centro
      const flip = (cx - p[i]) * dz - (cz - p[i + 1]) * dx > 0 ? -1 : 1;
      const nx = (dz / l) * flip;
      const nz = (-dx / l) * flip;
      const n = Math.ceil(l);
      let from = -1;
      for (let s = 0; s <= n; s++) {
        const t = (s + 0.5) / n;
        const open = s < n && !curbAt(p[i] + dx * t + nx * 0.05, p[i + 1] + dz * t + nz * 0.05);
        if (open && from < 0) from = s;
        if (!open && from >= 0) {
          side(p[i] + (dx * from) / n, p[i + 1] + (dz * from) / n, p[i] + (dx * s) / n, p[i + 1] + (dz * s) / n, nx, nz);
          from = -1;
        }
      }
    }
  };
  for (const road of roads) {
    const { pts, half, sw } = road;
    const o = miters(pts);
    const n = pts.length / 2;
    const at = (i, s, r) => [pts[i * 2] + o[i * 2] * s * r, pts[i * 2 + 1] + o[i * 2 + 1] * s * r];
    for (const s of [1, -1]) {
      for (let i = 0; i + 1 < n; i++) {
        // Los tramos largos van en trozos que quepan en REACH
        const len = Math.hypot(pts[i * 2 + 2] - pts[i * 2], pts[i * 2 + 3] - pts[i * 2 + 1]);
        const parts = Math.max(1, Math.ceil(len / 12));
        const a0 = at(i, s, half);
        const a1 = at(i, s, half + sw);
        const b0 = at(i + 1, s, half);
        const b1 = at(i + 1, s, half + sw);
        const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (let k = 0; k < parts; k++) {
          const t0 = k / parts;
          const t1 = (k + 1) / parts;
          carveBeside(road, i, [...mix(a0, b0, t0), ...mix(a0, b0, t1), ...mix(a1, b1, t1), ...mix(a1, b1, t0)], piece);
        }
      }
    }
    // Los extremos de la calle se cierran en redondo, como su cinta, salvo donde sigue otra calle
    // y ya lo tapa su acera
    for (const end of [0, n - 1]) {
      const x = pts[end * 2];
      const z = pts[end * 2 + 1];
      const k = end ? end - 1 : 1;
      const out = Math.atan2(z - pts[k * 2 + 1], x - pts[k * 2]);
      const ring = (r, q) => [x + Math.cos(q) * r, z + Math.sin(q) * r];
      for (let j = 0; j < 5; j++) {
        const a = out + (j / 5 - 0.5) * Math.PI;
        const b = out + ((j + 1) / 5 - 0.5) * Math.PI;
        const p = [...ring(half, a), ...ring(half, b), ...ring(half + sw, b), ...ring(half + sw, a)];
        if (!covered(p)) carveBeside(road, end ? end - 1 : 0, p, piece, true);
      }
    }
  }
}

// Cantos de acera que dan a la calzada, para grindar: un raíl por tramo de calle y lado, partido
// donde la acera se interrumpe. rail(ax, az, bx, bz) devuelve lo que guarde quien llama, y los
// raíles que se continúan quedan enlazados con next y prev.
export function curbRails(rail) {
  for (const { pts, half } of roads) {
    const o = miters(pts);
    const n = pts.length / 2;
    for (const s of [1, -1]) {
      let last = null; // el raíl que llegó hasta el final del tramo anterior
      for (let i = 0; i + 1 < n; i++) {
        const ax = pts[i * 2] + o[i * 2] * s * half;
        const az = pts[i * 2 + 1] + o[i * 2 + 1] * s * half;
        const dx = pts[i * 2 + 2] + o[i * 2 + 2] * s * half - ax;
        const dz = pts[i * 2 + 3] + o[i * 2 + 3] * s * half - az;
        const l = Math.hypot(dx, dz);
        if (l < 0.5) {
          last = null;
          continue;
        }
        // Hacia la acera: el mismo lado al que se abre la cinta
        const wx = (-dz / l) * s;
        const wz = (dx / l) * s;
        const m = Math.ceil(l * 2);
        const MIN = 3; // más corto que esto no da para subirse
        let from = -1;
        let reached = null;
        for (let k = 0; k <= m; k++) {
          const t = (k + 0.5) / m;
          const x = ax + dx * t;
          const z = az + dz * t;
          const edge = k < m && curbAt(x + wx * 0.1, z + wz * 0.1) > 0 && !curbAt(x - wx * 0.5, z - wz * 0.5);
          if (edge && from < 0) from = k;
          if (!edge && from >= 0) {
            if (((k - from) * l) / m >= MIN) {
              const r = rail(ax + (dx * from) / m, az + (dz * from) / m, ax + (dx * k) / m, az + (dz * k) / m);
              if (from === 0 && last) {
                last.next = r;
                r.prev = last;
              }
              if (k === m) reached = r;
            }
            from = -1;
          }
        }
        last = reached;
      }
    }
  }
}
