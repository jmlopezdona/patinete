// Herramienta de desarrollo: convierte el callejero de Cobeña (OpenStreetMap) en los datos
// que usa el juego (src/world/cobena-data.js). La descarga se guarda en tools/.cache.
// Uso: node tools/osm-cobena.mjs [--descargar]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../src/core/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools/.cache/cobena-osm.json');
const OUT = path.join(ROOT, 'src/world/cobena-data.js');
const BBOX = '40.553,-3.522,40.578,-3.492';
const QUERY = `[out:json][timeout:90];(way(${BBOX});relation(${BBOX})[type=multipolygon][building];node(${BBOX})[~"^(amenity|leisure|shop|tourism)$"~"."];);out body geom;`;

if (!fs.existsSync(CACHE) || process.argv.includes('--descargar')) {
  console.log('Descargando de Overpass…');
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'juego-patinete-dev/1.0', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error('Overpass respondió ' + res.status);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, await res.text());
}
const osm = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const rng = makeRng(28863);

// ---------- Proyección: 2 unidades de juego por metro, origen en Calle Río Júcar 44 ----------
const U = 2;
const LAT0 = 40.5624947;
const LON0 = -3.5105437;
const MX = 84703 * U;
const MZ = 111046 * U;
const P = (lat, lon) => [(lon - LON0) * MX, -(lat - LAT0) * MZ];
const M = (east, north) => [east * U, -north * U]; // metros (este, norte) -> juego
const B = { x0: -1200, z0: -2840, x1: 2600, z1: 840 };
const inB = (x, z, m = 0) => x > B.x0 + m && x < B.x1 - m && z > B.z0 + m && z < B.z1 - m;
// Casas de los personajes: edificio de OSM, calle a la que salen y número del portal. La primera
// es el origen del mapa.
const HOMES = [
  { id: 'jose', way: 663317227, street: 'Calle Río Júcar', n: 44 },
  { id: 'yago', way: 787857131, street: 'Calle Río Guadiana', n: 17 },
  { id: 'teo', way: 788577518, street: 'Avenida Río Guadalquivir', n: 39 },
  { id: 'adrian', way: 671793426, street: 'Calle Libertad', n: 17 },
];
const SKATE_WAY = 672252920;
// Parques que en OSM no tienen nombre, con el que les dan los vecinos
const PARK_NAMES = { 672252921: 'Parque El Palmeral' };

// ---------- Geometría ----------
const r1 = (v) => Math.round(v * 10) / 10;
function ptSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t;
  const qz = az + dz * t;
  return [Math.hypot(px - qx, pz - qz), qx, qz, t];
}
function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function polyArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(s) / 2;
}
function centroid(pts) {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}
function polyLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Rectángulo orientado de área mínima. Ejes locales como en el juego:
// X local -> (cos r, -sin r), Z local -> (sin r, cos r).
function obb(pts) {
  const h = hull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const c = (b[0] - a[0]) / l;
    const s = -(b[1] - a[1]) / l;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of h) {
      const lx = q[0] * c - q[1] * s;
      const lz = q[0] * s + q[1] * c;
      x0 = Math.min(x0, lx);
      x1 = Math.max(x1, lx);
      z0 = Math.min(z0, lz);
      z1 = Math.max(z1, lz);
    }
    const ar = (x1 - x0) * (z1 - z0);
    if (!best || ar < best.ar) {
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      best = { ar, c, s, rot: Math.atan2(s, c), w: x1 - x0, d: z1 - z0, x: mx * c + mz * s, z: -mx * s + mz * c };
    }
  }
  return best;
}
const toLocal = (o, x, z) => {
  const dx = x - o.x;
  const dz = z - o.z;
  return [dx * o.c - dz * o.s, dx * o.s + dz * o.c];
};
const toWorld = (o, lx, lz) => [o.x + lx * o.c + lz * o.s, o.z - lx * o.s + lz * o.c];
// Distancia con signo de un punto a un rectángulo orientado (negativa dentro)
function rectDist(o, x, z) {
  const [lx, lz] = toLocal(o, x, z);
  const ax = Math.abs(lx) - o.w / 2;
  const az = Math.abs(lz) - o.d / 2;
  if (ax <= 0 && az <= 0) return Math.max(ax, az);
  return Math.hypot(Math.max(ax, 0), Math.max(az, 0));
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = 0;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = ptSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1])[0];
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md > tol) {
      keep[mi] = true;
      st.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
// Recorta un polígono a la franja u0 <= lx <= u1 (coordenadas locales)
function clipSlab(poly, u0, u1) {
  const clip = (pts, edge, keepLess) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ia = keepLess ? a[0] <= edge : a[0] >= edge;
      const ib = keepLess ? b[0] <= edge : b[0] >= edge;
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (edge - a[0]) / (b[0] - a[0]);
        out.push([edge, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return clip(clip(poly, u0, false), u1, true);
}
// Punto y dirección a una distancia s a lo largo de una polilínea
function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= l || i === pts.length - 1) {
      const t = l ? Math.min(1, s / l) : 0;
      const dx = l ? (pts[i][0] - pts[i - 1][0]) / l : 1;
      const dz = l ? (pts[i][1] - pts[i - 1][1]) / l : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, dx, dz];
    }
    s -= l;
  }
  return [pts[0][0], pts[0][1], 1, 0];
}
// Desplaza una polilínea a su derecha (sentido de la marcha) una distancia off
function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push([pts[i][0] - ((b[1] - a[1]) / l) * off, pts[i][1] + ((b[0] - a[0]) / l) * off]);
  }
  return out;
}
function resample(pts, step) {
  const L = polyLen(pts);
  const n = Math.max(2, Math.round(L / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const q = along(pts, (L * i) / n);
    out.push([q[0], q[1]]);
  }
  return out;
}
function chaikin(pts, closed) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  if (!closed) {
    out.unshift(pts[0]);
    out.push(pts[n - 1]);
  }
  return out;
}
const flat = (pts) => pts.flatMap((p) => [r1(p[0]), r1(p[1])]);

// ---------- Lectura de OSM ----------
const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry);
const nodes = osm.elements.filter((e) => e.type === 'node');
const rels = osm.elements.filter((e) => e.type === 'relation' && e.tags && e.tags.type === 'multipolygon' && e.tags.building);
const G = (w) => w.geometry.map((p) => P(p.lat, p.lon));
const closed = (w) => w.geometry.length > 3 && w.nodes && w.nodes[0] === w.nodes[w.nodes.length - 1];
const strip = (pts) => (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts);
const warn = (...a) => console.log('  AVISO:', ...a);

// ---------- Lugares especiales (se reservan antes de colocar nada) ----------
const skateWay = ways.find((w) => w.id === SKATE_WAY);
if (!skateWay) throw new Error('Falta la parcela del skatepark en los datos');
const skatePoly = strip(G(skateWay));
const skateO = obb(skatePoly);
// Eje largo en X local apuntando al este; así el borde recto (norte) queda en -Z local
let skateA = skateO.w >= skateO.d ? skateO.rot : skateO.rot + Math.PI / 2;
if (Math.cos(skateA) < 0) skateA += Math.PI;
const skateC = centroid(skatePoly);
const lot = { x: skateO.x, z: skateO.z, c: Math.cos(skateA), s: Math.sin(skateA), w: Math.max(skateO.w, skateO.d), d: Math.min(skateO.w, skateO.d), rot: skateA };
const skateLocal = skatePoly.map((p) => toLocal(lot, p[0], p[1]));

const fountainNode = nodes.find((n) => n.id === 9908665765);
const plaza = fountainNode ? P(fountainNode.lat, fountainNode.lon) : M(484, 570);
const pistaWay = ways.find((w) => w.id === 204965143);
const pistaC = pistaWay ? obb(strip(G(pistaWay))) : { x: M(-54, 176)[0], z: M(-54, 176)[1] };
const feriaWay = ways.find((w) => w.id === 1324280489);
const feriaC = feriaWay ? centroid(strip(G(feriaWay))) : M(144, 514);
const MEGA = { x: -150, z: 480 };
const rect = (cx, cz, w, d) => ({ x: cx, z: cz, w, d, c: 1, s: 0, rot: 0 });
const places = {
  soccer: { x: r1(pistaC.x), z: r1(pistaC.z) },
  bowling: { x: r1(feriaC[0]), z: r1(feriaC[1]) },
  plaza: { x: r1(plaza[0]), z: r1(plaza[1]) },
  mega: MEGA,
};
// Zonas reservadas: nada de vallas, árboles, farolas ni mobiliario dentro
const reserved = [
  { ...lot, w: lot.w + 6, d: lot.d + 6, name: 'skatepark', poly: skatePoly },
  { ...rect(places.soccer.x, places.soccer.z, 74, 50), name: 'fútbol' },
  { ...rect(places.bowling.x, places.bowling.z, 50, 52), name: 'bolera' },
  { ...rect(places.plaza.x, places.plaza.z, 26, 26), name: 'fuente' },
  { ...rect(MEGA.x + 20, MEGA.z + 2, 290, 72), name: 'mega salto' },
];
function polyDist(poly, x, z) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, ptSeg(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1])[0]);
  return inPoly(x, z, poly) ? -d : d;
}
const resDist = (r, x, z) => (r.poly ? polyDist(r.poly, x, z) - 3 : rectDist(r, x, z));
const inReserved = (x, z, m = 0) => reserved.some((r) => resDist(r, x, z) < m);

// ---------- Calles ----------
const RC = {
  trunk: [0, 22], trunk_link: [0, 13], secondary: [1, 17], secondary_link: [1, 12], tertiary: [2, 15], unclassified: [3, 13], residential: [3, 13],
  living_street: [3, 11], service: [4, 8], pedestrian: [5, 10], footway: [6, 5], path: [6, 5], steps: [6, 5], cycleway: [6, 5], track: [7, 7], construction: [8, 12],
};
const NEED = [4, 3.6, 3.4, 3.4, 2.8, 2.8, 2.2, 2.4, 3]; // medio ancho mínimo libre por clase
const names = [];
const nameIdx = (n) => {
  if (!n) return -1;
  let i = names.indexOf(n);
  if (i < 0) i = names.push(n) - 1;
  return i;
};
const urbanPolys = [];
const paved = [];
let roads = [];
for (const w of ways) {
  const t = w.tags || {};
  if (['residential', 'industrial', 'commercial', 'retail'].includes(t.landuse) && closed(w)) {
    const pts = simplify(strip(G(w)), 1.5);
    if (pts.some((p) => inB(p[0], p[1]))) urbanPolys.push(pts);
  }
  const h = t.highway;
  if (!h || !RC[h]) continue;
  const pts = G(w);
  if ((t.area === 'yes' || (h === 'pedestrian' && closed(w))) && closed(w)) {
    const c = centroid(pts);
    if (inB(c[0], c[1])) paved.push({ type: h === 'pedestrian' ? 0 : 1, pts: simplify(strip(pts), 0.4), name: nameIdx(t.name) });
    continue;
  }
  const [cls, w0] = RC[h];
  const oneway = t.oneway === 'yes' || t.junction === 'roundabout';
  let width = w0;
  if (oneway && cls >= 1 && cls <= 3 && t.lanes !== '2') width = Math.round(w0 * 0.78);
  // Trocear en tramos dentro de los límites y de longitud moderada
  let run = [];
  let ids = [];
  let len = 0;
  const flush = () => {
    if (run.length > 1) roads.push({ cls, def: width, name: nameIdx(t.name), oneway, pts: run, ids, round: t.junction === 'roundabout', hw: h });
    run = [];
    ids = [];
    len = 0;
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!inB(p[0], p[1], -20)) {
      flush();
      continue;
    }
    if (run.length) len += Math.hypot(p[0] - run[run.length - 1][0], p[1] - run[run.length - 1][1]);
    run.push(p);
    ids.push(w.nodes ? w.nodes[i] : -1);
    if (len > 130 && i < pts.length - 1) {
      flush();
      run.push(p);
      ids.push(w.nodes ? w.nodes[i] : -1);
    }
  }
  flush();
}
// Los caminos peatonales no atraviesan las zonas reservadas
roads = roads.flatMap((r) => {
  if (r.cls < 6) {
    if (r.pts.some((p) => inReserved(p[0], p[1], 0)) && r.cls !== 7) warn('una calle cruza la zona', reserved.find((q) => r.pts.some((p) => resDist(q, p[0], p[1]) < 0)).name, names[r.name] || r.hw);
    return [r];
  }
  const out = [];
  let run = [];
  let ids = [];
  const fine = [];
  const fid = [];
  for (let i = 0; i < r.pts.length; i++) {
    if (i) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
      for (let k = 1; k < n; k++) {
        fine.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
        fid.push(-1);
      }
    }
    fine.push(r.pts[i]);
    fid.push(r.ids[i]);
  }
  fine.forEach((p, i) => {
    if (inReserved(p[0], p[1], 1.5)) {
      if (run.length > 1) out.push({ ...r, pts: simplify(run, 0.05), ids: [] });
      run = [];
      ids = [];
    } else {
      run.push(p);
      ids.push(fid[i]);
    }
  });
  if (run.length === fine.length) return [r];
  if (run.length > 1) out.push({ ...r, pts: simplify(run, 0.05), ids: [] });
  return out;
});

// ---------- Edificios ----------
const KIND = { house: 0, apartments: 1, industrial: 2, public: 3, church: 4, shed: 5, roof: 6, construction: 7, tower: 8 };
const BK = {
  terrace: 0, house: 0, detached: 0, semidetached_house: 0, residential: 0, yes: 0, apartments: 1, industrial: 2, warehouse: 2, barn: 2, public: 3, school: 3,
  office: 3, retail: 3, commercial: 3, clinic: 3, church: 4, shed: 5, garage: 5, service: 5, garages: 5, roof: 6, carport: 6, construction: 7, ruins: 7,
};
const labels = [];
const addrs = [];
const short = (s) => s.replace(/^Calle /, 'C/ ').replace(/^Avenida /, 'Av. ').replace(/^Travesía /, 'Trv. ').replace(/^Carretera /, 'Ctra. ').replace(/^Plaza /, 'Pza. ').replace(/^Callejón /, 'Cjón. ');
let buildings = [];
function addBuilding(poly, t, id) {
  poly = strip(poly);
  if (poly.length < 3) return;
  const c = centroid(poly);
  if (!inB(c[0], c[1], 6)) return;
  let kind = BK[t.building] ?? 0;
  if (t.man_made === 'tower') kind = KIND.tower;
  const o = obb(poly);
  if (!o || o.w < 2.4 || o.d < 2.4) return;
  const ar = polyArea(poly);
  let levels = parseInt(t['building:levels'], 10);
  if (!(levels > 0)) levels = kind === 1 ? 3 : kind === 0 || kind === 3 ? 2 : 1;
  if (kind === 0 && ar > 1400) kind = t.building === 'yes' ? 2 : 1;
  const name = t.name || (t.amenity === 'fuel' ? t.brand : null);
  const group = buildings.length;
  const base = { kind, levels: Math.min(levels, 5), label: name ? labels.push(name) - 1 : -1, addr: -1, group, id, open: 0 };
  if (t['addr:housenumber'] && t['addr:street']) base.addr = addrs.push(short(t['addr:street']) + ' ' + t['addr:housenumber']) - 1;
  const home = HOMES.find((h) => h.way === id);
  if (home) {
    home.group = group;
    base.label = labels.push('Nº ' + home.n) - 1;
  }
  const long = Math.max(o.w, o.d);
  if (ar / o.ar < 0.72 && long > 22 && kind !== 6 && kind !== 8) {
    // Planta en L, U...: se trocea en franjas a lo largo del eje largo
    const alongX = o.w >= o.d;
    const f = alongX ? { ...o } : { ...o, c: Math.cos(o.rot + Math.PI / 2), s: Math.sin(o.rot + Math.PI / 2), rot: o.rot + Math.PI / 2, w: o.d, d: o.w };
    const loc = poly.map((p) => toLocal(f, p[0], p[1]));
    const n = Math.max(2, Math.min(8, Math.ceil(f.w / 14)));
    let first = true;
    for (let i = 0; i < n; i++) {
      const u0 = -f.w / 2 + (f.w * i) / n;
      const u1 = u0 + f.w / n;
      const cl = clipSlab(loc, u0, u1);
      if (cl.length < 3) continue;
      const v0 = Math.min(...cl.map((p) => p[1]));
      const v1 = Math.max(...cl.map((p) => p[1]));
      if (v1 - v0 < 2.4) continue;
      const wc = toWorld(f, (u0 + u1) / 2, (v0 + v1) / 2);
      buildings.push({ ...base, label: first ? base.label : -1, addr: first ? base.addr : -1, x: wc[0], z: wc[1], w: u1 - u0, d: v1 - v0, rot: f.rot, c: f.c, s: f.s, part: true });
      first = false;
    }
  } else buildings.push({ ...base, x: o.x, z: o.z, w: o.w, d: o.d, rot: o.rot, c: o.c, s: o.s });
}
for (const w of ways) {
  const t = w.tags || {};
  if ((t.building || t.man_made === 'tower') && closed(w)) addBuilding(G(w), t, w.id);
}
for (const r of rels) {
  for (const m of r.members || []) if (m.role === 'outer' && m.geometry && m.geometry.length > 3) addBuilding(m.geometry.map((p) => P(p.lat, p.lon)), r.tags, r.id);
}
buildings = buildings.filter((b) => {
  const hit = reserved.find((r) => resDist(r, b.x, b.z) < Math.min(b.w, b.d) / 2);
  if (hit && b.kind !== 6) warn('edificio eliminado por estar en la zona', hit.name);
  return !hit;
});

// Muestras de las calles para medir huecos con los edificios
const samples = [];
roads.forEach((r, ri) => {
  const L = polyLen(r.pts);
  const n = Math.max(1, Math.ceil(L / 1.5));
  for (let i = 0; i <= n; i++) {
    const q = along(r.pts, (L * i) / n);
    samples.push([q[0], q[1], ri]);
  }
});
const CELL = 60;
const key = (i, j) => i * 4096 + j;
function gridOf(items, bboxFn) {
  const g = new Map();
  items.forEach((it, idx) => {
    const [x0, z0, x1, z1] = bboxFn(it);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = key(i + 2048, j + 2048);
        let c = g.get(k);
        if (!c) g.set(k, (c = []));
        c.push(idx);
      }
    }
  });
  return (x, z) => g.get(key(Math.floor(x / CELL) + 2048, Math.floor(z / CELL) + 2048)) || [];
}
const bbBox = (b, m) => {
  const e = Math.hypot(b.w, b.d) / 2 + m;
  return [b.x - e, b.z - e, b.x + e, b.z + e];
};
// Los edificios que invaden una calle se encogen (o se eliminan) hasta dejar paso
let dropped = 0;
for (let pass = 0; pass < 14; pass++) {
  const at = gridOf(buildings, (b) => bbBox(b, 6));
  const worst = new Map();
  for (const [x, z, ri] of samples) {
    const need = NEED[roads[ri].cls];
    for (const bi of at(x, z)) {
      const b = buildings[bi];
      if (b.kind === 6) continue;
      const d = rectDist(b, x, z);
      if (d < need) {
        const w = worst.get(bi);
        if (!w || d - need < w.def) worst.set(bi, { def: d - need, x, z, need });
      }
    }
  }
  if (!worst.size) break;
  for (const [bi, c] of worst) {
    const b = buildings[bi];
    const [lx, lz] = toLocal(b, c.x, c.z);
    const ax = Math.abs(lx) - b.w / 2;
    const az = Math.abs(lz) - b.d / 2;
    let axis;
    let delta;
    if (ax <= 0 && az <= 0) {
      axis = ax > az ? 'x' : 'z';
      delta = -Math.max(ax, az) + c.need + 0.2;
    } else {
      axis = ax > az ? 'x' : 'z';
      delta = c.need - Math.max(ax, az) + 0.2;
    }
    const sg = Math.sign(axis === 'x' ? lx : lz) || 1;
    if (axis === 'x') {
      b.w -= delta;
      const nc = toWorld(b, (-sg * delta) / 2, 0);
      b.x = nc[0];
      b.z = nc[1];
    } else {
      b.d -= delta;
      const nc = toWorld(b, 0, (-sg * delta) / 2);
      b.x = nc[0];
      b.z = nc[1];
    }
    if (b.w < 3.5 || b.d < 3.5) b.dead = true;
  }
  dropped += buildings.filter((b) => b.dead).length;
  buildings = buildings.filter((b) => !b.dead);
}
const bAt = gridOf(buildings, (b) => bbBox(b, 12));
const nearBuilding = (x, z, m) => bAt(x, z).some((bi) => rectDist(buildings[bi], x, z) < m);

// Anchura final de cada tramo según el hueco real entre fachadas
const clr = roads.map(() => 99);
for (const [x, z, ri] of samples) {
  for (const bi of bAt(x, z)) {
    if (buildings[bi].kind === 6) continue;
    const d = rectDist(buildings[bi], x, z);
    if (d < clr[ri]) clr[ri] = d;
  }
}
const inUrban = (x, z) => urbanPolys.some((p) => inPoly(x, z, p));
roads.forEach((r, i) => {
  r.half = Math.max(2, Math.min(r.def / 2, clr[i] - 0.3));
  const mid = along(r.pts, polyLen(r.pts) / 2);
  r.sw = 0;
  if ((r.cls === 2 || r.cls === 3 || (r.cls === 1 && r.hw === 'secondary')) && !r.round && inUrban(mid[0], mid[1])) {
    const s = Math.min(3, clr[i] - r.half - 0.2);
    if (s >= 1.2) r.sw = s;
  }
  r.outer = r.half + r.sw;
});

// Índice espacial de tramos de calle
const segs = [];
roads.forEach((r, ri) => {
  for (let i = 1; i < r.pts.length; i++) segs.push([r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], ri]);
});
const sAt = gridOf(segs, (s) => [Math.min(s[0], s[2]) - 24, Math.min(s[1], s[3]) - 24, Math.max(s[0], s[2]) + 24, Math.max(s[1], s[3]) + 24]);
// Hueco hasta el borde exterior (acera incluida) de la calle más cercana; negativo = encima
function roadClear(x, z, skip = -1, maxCls = 8) {
  let best = 24;
  for (const si of sAt(x, z)) {
    const s = segs[si];
    if (s[4] === skip || roads[s[4]].cls > maxCls) continue;
    const d = ptSeg(x, z, s[0], s[1], s[2], s[3])[0] - roads[s[4]].outer;
    if (d < best) best = d;
  }
  return best;
}
function nearestRoad(x, z, maxCls = 5) {
  let best = null;
  for (const si of sAt(x, z)) {
    const s = segs[si];
    if (roads[s[4]].cls > maxCls) continue;
    const q = ptSeg(x, z, s[0], s[1], s[2], s[3]);
    if (!best || q[0] < best.d) best = { d: q[0], x: q[1], z: q[2], ri: s[4], dx: s[2] - s[0], dz: s[3] - s[1] };
  }
  return best;
}
const inPaved = (x, z) => paved.some((p) => inPoly(x, z, p.pts));

// Fachada principal: la cara más cercana a una calle
for (const b of buildings) {
  let bestK = 0;
  let bestD = Infinity;
  for (let k = 0; k < 4; k++) {
    const nx = Math.round(Math.sin((k * Math.PI) / 2));
    const nz = Math.round(Math.cos((k * Math.PI) / 2));
    const half = (k % 2 === 0 ? b.d : b.w) / 2;
    const q = toWorld(b, nx * (half + 2), nz * (half + 2));
    const nr = nearestRoad(q[0], q[1], 5);
    let d = nr ? nr.d : 60;
    if (nearBuilding(q[0], q[1], 0)) d += 30; // cara pegada a otra casa
    if (d < bestD) {
      bestD = d;
      bestK = k;
    }
    const q1 = toWorld(b, nx * (half + 1.2), nz * (half + 1.2));
    if (!bAt(q1[0], q1[1]).some((bi) => buildings[bi] !== b && buildings[bi].kind !== 6 && rectDist(buildings[bi], q1[0], q1[1]) < 0.4)) b.open |= 1 << k;
  }
  b.front = bestK;
  b.open |= 1 << bestK;
}
// Recintos con nombre (colegios, residencias...): el cartel va en su edificio más grande
for (const w of ways) {
  const t = w.tags || {};
  if (!t.name || t.building || !closed(w) || !(t.amenity || t.shop)) continue;
  const poly = strip(G(w));
  let best = null;
  for (const b of buildings) if (b.label < 0 && b.kind !== 6 && inPoly(b.x, b.z, poly) && (!best || b.w * b.d > best.w * best.d)) best = b;
  if (best) best.label = labels.push(t.name) - 1;
}
// Nombres de comercios (nodos) sobre el edificio más cercano
for (const n of nodes) {
  const t = n.tags || {};
  if (!t.name || !(t.shop || t.amenity || t.tourism) || t.amenity === 'bus_station') continue;
  const [x, z] = P(n.lat, n.lon);
  let best = null;
  for (const bi of bAt(x, z)) {
    const d = rectDist(buildings[bi], x, z);
    if (d < 9 && (!best || d < best.d)) best = { d, bi };
  }
  if (best && buildings[best.bi].label < 0 && buildings[best.bi].kind !== 6) buildings[best.bi].label = labels.push(t.name) - 1;
}

// ---------- Vallas, muros y setos ----------
const BT = { wall: 0, retaining_wall: 0, fence: 1, hedge: 2 };
const walls = [[], [], []];
let wallN = 0;
for (const w of ways) {
  const t = w.tags || {};
  if (!(t.barrier in BT)) continue;
  const pts = simplify(G(w), 0.35);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    const n = Math.max(1, Math.round(L / 2.5));
    let start = -1;
    const emit = (k0, k1) => {
      if (((k1 - k0) * L) / n < 1.6) return;
      walls[BT[t.barrier]].push(r1(a[0] + ((b[0] - a[0]) * k0) / n), r1(a[1] + ((b[1] - a[1]) * k0) / n), r1(a[0] + ((b[0] - a[0]) * k1) / n), r1(a[1] + ((b[1] - a[1]) * k1) / n));
      wallN++;
    };
    for (let k = 0; k < n; k++) {
      const mx = a[0] + ((b[0] - a[0]) * (k + 0.5)) / n;
      const mz = a[1] + ((b[1] - a[1]) * (k + 0.5)) / n;
      const ok = inB(mx, mz, 4) && roadClear(mx, mz) > 0.7 && !nearBuilding(mx, mz, -0.4) && !inReserved(mx, mz, 1) && !inPaved(mx, mz);
      if (ok && start < 0) start = k;
      if (!ok && start >= 0) {
        emit(start, k);
        start = -1;
      }
    }
    if (start >= 0) emit(start, n);
  }
}

// ---------- Zonas verdes, agua, piscinas y pistas ----------
const greens = [];
const water = [];
const streams = [];
const pools = [];
const pitches = [];
const SPORT = { soccer: 1, basketball: 2, tennis: 3, multi: 2, skateboard: 4 };
for (const w of ways) {
  const t = w.tags || {};
  const pts = G(w);
  const c = centroid(pts);
  if (t.waterway && !closed(w)) {
    const run = pts.filter((p) => inB(p[0], p[1]));
    if (run.length > 1) streams.push(simplify(run, 0.6));
    continue;
  }
  if (!closed(w)) continue;
  const isGreen = ['park', 'garden', 'village_green'].includes(t.leisure) || ['grass', 'forest', 'meadow', 'orchard'].includes(t.landuse) || t.natural === 'wood';
  if (isGreen) {
    if (!pts.some((p) => inB(p[0], p[1]))) continue;
    const wood = t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'orchard';
    greens.push({ type: wood ? 1 : t.landuse === 'meadow' ? 2 : 0, name: nameIdx(t.name || PARK_NAMES[w.id]), pts: simplify(strip(pts), 0.8) });
  } else if (t.natural === 'water' && inB(c[0], c[1])) water.push(simplify(strip(pts), 0.4));
  else if (t.leisure === 'swimming_pool' && inB(c[0], c[1], 6)) {
    const o = obb(strip(pts));
    if (o && o.w > 2.5 && o.d > 2.5 && !inReserved(o.x, o.z, 2)) pools.push(r1(o.x), r1(o.z), r1(o.w), r1(o.d), r1((o.rot * 180) / Math.PI));
  } else if (t.leisure === 'pitch' && inB(c[0], c[1], 6) && w.id !== 204965143) {
    const o = obb(strip(pts));
    if (o && !inReserved(o.x, o.z, 2)) pitches.push([r1(o.x), r1(o.z), r1(o.w), r1(o.d), r1((o.rot * 180) / Math.PI), SPORT[t.sport] || 0]);
  }
}

// ---------- Mobiliario, farolas, árboles y studs ----------
const PROPS = ['hydrant', 'bin', 'mailbox', 'cone', 'bench', 'crate', 'flowerpot', 'barrier'];
const lamps = [];
const trees = [];
const props = [];
const studs = [];
const treePts = [];
const freeSpot = (x, z, ri, m = 1) => inB(x, z, 10) && !nearBuilding(x, z, m) && roadClear(x, z, ri, 5) > 0.4 && !inReserved(x, z, 1.5) && !inPaved(x, z);
const farFromTrees = (x, z, m) => !treePts.some((t) => Math.abs(t[0] - x) < m && Math.abs(t[1] - z) < m);
roads.forEach((r, ri) => {
  const L = polyLen(r.pts);
  if (r.sw >= 2 && L > 30) {
    let side = rng.chance(0.5) ? 1 : -1;
    for (let s = rng.range(8, 24); s < L - 6; s += rng.range(15, 26)) {
      const q = along(r.pts, s);
      const off = r.half + r.sw * 0.5;
      const x = q[0] - q[3] * off * side;
      const z = q[1] + q[2] * off * side;
      side = -side;
      if (!freeSpot(x, z, ri, 1.2)) continue;
      const roll = rng();
      if (roll < 0.3) lamps.push(r1(x), r1(z), r1(q[3] * side), r1(-q[2] * side));
      else if (roll < 0.55 && farFromTrees(x, z, 5)) {
        trees.push(r1(x), r1(z), rng.int(0, 2));
        treePts.push([x, z]);
      } else if (roll < 0.8) props.push(rng.int(0, PROPS.length - 1), r1(x), r1(z), r1(Math.atan2(q[3] * side, -q[2] * side)));
    }
  }
  // Hileras de studs
  if (r.cls >= 1 && r.cls <= 7 && L > 50 && rng.chance(r.cls === 6 ? 0.45 : r.cls === 7 ? 0.5 : 0.3)) {
    const s0 = rng.range(10, L - 40);
    const type = r.cls >= 6 ? (rng.chance(0.12) ? 2 : 1) : 0;
    for (let k = 0; k < 5; k++) {
      const q = along(r.pts, s0 + k * 6);
      if (!inReserved(q[0], q[1], 2) && inB(q[0], q[1], 12)) studs.push(r1(q[0]), r1(q[1]), type === 2 && k !== 2 ? 1 : type);
    }
  }
});
for (const g of greens) {
  const xs = g.pts.map((p) => p[0]);
  const zs = g.pts.map((p) => p[1]);
  const x0 = Math.max(B.x0 + 10, Math.min(...xs));
  const x1 = Math.min(B.x1 - 10, Math.max(...xs));
  const z0 = Math.max(B.z0 + 10, Math.min(...zs));
  const z1 = Math.min(B.z1 - 10, Math.max(...zs));
  if (x1 <= x0 || z1 <= z0) continue;
  const n = Math.min(g.type === 1 ? 260 : 60, Math.round(((x1 - x0) * (z1 - z0)) / (g.type === 1 ? 1700 : 900)));
  for (let i = 0; i < n * 3; i++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    if (!inPoly(x, z, g.pts) || nearBuilding(x, z, 2.5) || roadClear(x, z) < 2.5 || inReserved(x, z, 3) || inPaved(x, z) || !farFromTrees(x, z, 6)) continue;
    if (water.some((p) => inPoly(x, z, p))) continue;
    trees.push(r1(x), r1(z), g.type === 1 ? 3 : rng.int(0, 2));
    treePts.push([x, z]);
    if (treePts.length % 3 === 0 && g.type === 0) studs.push(r1(x + 4), r1(z + 3), 1);
  }
}

// ---------- Portales para el reparto ----------
const deliveries = [];
buildings.forEach((b, i) => {
  if (b.addr < 0 || b.kind > 1 || i % 5 !== 0) return;
  const nx = Math.round(Math.sin((b.front * Math.PI) / 2));
  const nz = Math.round(Math.cos((b.front * Math.PI) / 2));
  const half = (b.front % 2 === 0 ? b.d : b.w) / 2;
  const door = toWorld(b, nx * (half + 2), nz * (half + 2));
  const nr = nearestRoad(door[0], door[1], 5);
  if (!nr || nr.d > 22) return;
  const t = Math.max(0, (nr.d - 1.5) / nr.d);
  const x = door[0] + (nr.x - door[0]) * t;
  const z = door[1] + (nr.z - door[1]) * t;
  deliveries.push(r1(x), r1(z), b.addr);
});

// ---------- Grafo de calles para coches y carrera ----------
const graph = new Map();
const nodePos = new Map();
roads.forEach((r, ri) => {
  if (r.cls < 1 || r.cls > 3 || !r.ids || r.ids.length !== r.pts.length) return;
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.ids[i - 1];
    const b = r.ids[i];
    if (a < 0 || b < 0) continue;
    nodePos.set(a, r.pts[i - 1]);
    nodePos.set(b, r.pts[i]);
    const len = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    const add = (u, v, fwd) => {
      if (!graph.has(u)) graph.set(u, []);
      graph.get(u).push({ to: v, len, ri, legal: fwd || !r.oneway });
    };
    add(a, b, true);
    add(b, a, false);
  }
});
function nearestNode(x, z, filter) {
  let best = null;
  let bd = Infinity;
  for (const [id, p] of nodePos) {
    if (filter && !filter(id)) continue;
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}
function route(src, dst, { cars = false, used = null } = {}) {
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const open = [[0, src]];
  while (open.length) {
    let mi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[mi][0]) mi = i;
    const [d, u] = open.splice(mi, 1)[0];
    if (u === dst) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const e of graph.get(u) || []) {
      if (cars && (!e.legal || roads[e.ri].half < 4.6)) continue;
      const pen = used && (used.has(u + '>' + e.to) || used.has(e.to + '>' + u)) ? 6 : 1;
      const nd = d + e.len * pen;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, [u, e]);
        open.push([nd, e.to]);
      }
    }
  }
  if (!prev.has(dst)) return null;
  const out = [];
  let cur = dst;
  while (cur !== src) {
    const [u, e] = prev.get(cur);
    out.unshift({ from: u, to: cur, e });
    cur = u;
  }
  return out;
}
function loopThrough(stops, opts) {
  const used = new Set();
  const steps = [];
  stops = stops.filter((s, i) => s !== stops[(i + 1) % stops.length]);
  for (let i = 0; i < stops.length; i++) {
    const leg = route(stops[i], stops[(i + 1) % stops.length], { ...opts, used });
    if (!leg || !leg.length) return null;
    for (const s of leg) {
      used.add(s.from + '>' + s.to);
      steps.push(s);
    }
  }
  const total = steps.reduce((a, s) => a + s.e.len, 0);
  const uniq = new Set(steps.map((s) => (s.from < s.to ? s.from + '>' + s.to : s.to + '>' + s.from)));
  let ulen = 0;
  for (const k of uniq) {
    const [a, b] = k.split('>').map(Number);
    ulen += Math.hypot(nodePos.get(a)[0] - nodePos.get(b)[0], nodePos.get(a)[1] - nodePos.get(b)[1]);
  }
  return { steps, total, reuse: 1 - ulen / total };
}
const carNode = (id) => (graph.get(id) || []).some((e) => e.legal && roads[e.ri].half >= 4.6);
const ANCHORS = [M(-40, 10), M(-300, 60), M(-220, -230), M(350, 500), M(600, 800), M(800, 300), M(1050, -100), M(200, 950), M(900, 1100), M(500, 150), M(-150, 650), M(120, 250)];
const cars = [];
for (const an of ANCHORS) {
  const a = nearestNode(an[0], an[1], carNode);
  const pa = nodePos.get(a);
  const cand = [...nodePos.keys()].filter((id) => {
    if (!carNode(id)) return false;
    const p = nodePos.get(id);
    const d = Math.hypot(p[0] - pa[0], p[1] - pa[1]);
    return d > 260 && d < 900;
  });
  let best = null;
  for (let t = 0; t < 40 && cand.length > 2; t++) {
    const b = rng.pick(cand);
    const c = rng.pick(cand);
    if (b === c || Math.hypot(nodePos.get(b)[0] - nodePos.get(c)[0], nodePos.get(b)[1] - nodePos.get(c)[1]) < 240) continue;
    const lp = loopThrough([a, b, c], { cars: true });
    if (!lp || lp.total < 900 || lp.total > 4200) continue;
    if (!best || lp.reuse < best.reuse) best = lp;
  }
  if (!best || best.reuse > 0.35) {
    warn('sin circuito de coches cerca de', an.map(Math.round));
    continue;
  }
  // Polilínea por el carril derecho, suavizada
  let pts = best.steps.map((s) => {
    const r = roads[s.e.ri];
    const p = nodePos.get(s.from);
    const q = nodePos.get(s.to);
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const lane = r.oneway ? 0 : Math.min(3.3, r.half - 2.3);
    return [(p[0] + q[0]) / 2 - ((q[1] - p[1]) / l) * lane, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / l) * lane];
  });
  pts = chaikin(chaikin(pts, true), true);
  pts.push(pts[0]);
  pts = resample(pts, 2.5).slice(0, -1);
  cars.push(flat(pts));
}

// Cada personaje sale a su calle, a la altura de su casa y mirando al oeste
places.homes = {};
for (const h of HOMES) {
  const b = buildings.find((k) => k.group === h.group && k.label >= 0);
  if (!b) throw new Error(`La casa de ${h.street} ${h.n} se ha perdido por el camino`);
  const street = names.indexOf(h.street);
  let spawn = null;
  for (const s of segs) {
    if (roads[s[4]].name !== street) continue;
    const q = ptSeg(b.x, b.z, s[0], s[1], s[2], s[3]);
    if (!spawn || q[0] < spawn.d) {
      let dx = s[2] - s[0];
      let dz = s[3] - s[1];
      if (dx > 0) {
        dx = -dx;
        dz = -dz;
      }
      spawn = { d: q[0], x: q[1], z: q[2], heading: Math.atan2(dx, dz) };
    }
  }
  if (!spawn) throw new Error(`No hay calle por la que salir de ${h.street} ${h.n}`);
  places.homes[h.id] = { name: `${short(h.street)} ${h.n}`, b: buildings.indexOf(b), x: r1(b.x), z: r1(b.z), spawn: { x: r1(spawn.x), z: r1(spawn.z), heading: +spawn.heading.toFixed(3) } };
}
// Carrera: vuelta al barrio de los ríos saliendo de Río Júcar 44, la casa que hace de origen
const { spawn } = places.homes[HOMES[0].id];
places.spawn = spawn;
places.home = { x: places.homes[HOMES[0].id].x, z: places.homes[HOMES[0].id].z };
const RACE_STOPS = [[-300, 110], [-470, -50], [-150, -170], [0, -235]];
const raceNodes = RACE_STOPS.map((p) => nearestNode(p[0], p[1], (id) => (graph.get(id) || []).some((e) => roads[e.ri].half >= 4)));
const startNode = nearestNode(spawn.x, spawn.z);
const raceLoop = loopThrough([startNode, ...raceNodes], {});
let race = null;
if (raceLoop) {
  let line = [nodePos.get(raceLoop.steps[0].from), ...raceLoop.steps.map((s) => nodePos.get(s.to))];
  const L = polyLen(line);
  const n = Math.round(L / 105);
  const gates = [];
  for (let i = 1; i <= n; i++) {
    const q = along(line, (L * i) / n);
    gates.push([r1(q[0]), r1(q[1])]);
  }
  const s0 = along(line, 2);
  race = { start: { x: r1(s0[0]), z: r1(s0[1]), heading: +Math.atan2(s0[2], s0[3]).toFixed(3) }, gates, length: Math.round(L), line: flat(simplify(line, 0.5)) };
} else warn('no se ha podido trazar la carrera');

// Paseos de los peatones: aceras y caminos de los parques
const HOT = [[0, 0], [lot.x, lot.z], [places.plaza.x, places.plaza.z], M(298, 769), [places.soccer.x, places.soccer.z], M(-400, -150)];
const pedCand = [];
roads.forEach((r) => {
  const L = polyLen(r.pts);
  if (L < 60) return;
  let pts = null;
  if (r.sw >= 2) pts = offsetLine(r.pts, (r.half + r.sw * 0.5) * (rng.chance(0.5) ? 1 : -1));
  else if (r.cls === 5 || r.cls === 6) pts = r.pts;
  if (!pts || pts.some((p) => nearBuilding(p[0], p[1], 0.9) || !inB(p[0], p[1], 12))) return;
  const c = along(pts, L / 2);
  const hot = HOT.some((h) => Math.hypot(h[0] - c[0], h[1] - c[1]) < 520);
  pedCand.push({ pts, w: (hot ? 5 : 1) * rng() });
});
pedCand.sort((a, b) => b.w - a.w);
const peds = pedCand.slice(0, 48).map((p) => flat(p.pts));

// Parques infantiles y ladrillos dorados
const playgrounds = [];
for (const n of nodes) {
  if (!n.tags || n.tags.leisure !== 'playground') continue;
  const [x, z] = P(n.lat, n.lon);
  if (!inB(x, z, 30)) continue;
  let ok = true;
  for (const [dx, dz] of [[0, 0], [-11, -8], [11, -8], [-11, 8], [11, 8], [0, -8], [0, 8]]) if (nearBuilding(x + dx, z + dz, 1.5) || roadClear(x + dx, z + dz, -1, 5) < 0.5) ok = false;
  if (ok && !inReserved(x, z, 14)) {
    playgrounds.push([r1(x), r1(z)]);
    reserved.push({ ...rect(x, z, 24, 18), name: 'parque infantil' });
  }
}
const padSpots = playgrounds.map((p) => rect(p[0], p[1], 25, 19));
const clearPads = (arr, step, xi = 0) => {
  const out = [];
  for (let i = 0; i < arr.length; i += step) if (!padSpots.some((r) => rectDist(r, arr[i + xi], arr[i + xi + 1]) < 1.5)) out.push(...arr.slice(i, i + step));
  return out;
};
function freeNear(x, z) {
  for (let r = 0; r < 60; r += 3) {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos((a * Math.PI) / 4) * r;
      const pz = z + Math.sin((a * Math.PI) / 4) * r;
      if (!nearBuilding(px, pz, 2.5) && roadClear(px, pz, -1, 4) > 1 && !inReserved(px, pz, 2) && farFromTrees(px, pz, 3)) return [r1(px), r1(pz)];
    }
  }
  return [r1(x), r1(z)];
}
places.bricks = [M(503, 552), M(-437, -62), M(300, 745), M(293, 1237), M(492, 394), M(829, 937), M(1056, -150), M(60, 60)].map((p) => freeNear(p[0], p[1]));
places.skate = { x: r1(lot.x), z: r1(lot.z), rot: +lot.rot.toFixed(4), w: r1(lot.w), d: r1(lot.d), poly: flat(skatePoly), local: flat(skateLocal) };
places.oldSkate = ways.find((w) => (w.tags || {}).sport === 'skateboard') ? (() => {
  const o = obb(strip(G(ways.find((w) => (w.tags || {}).sport === 'skateboard'))));
  return { x: r1(o.x), z: r1(o.z), w: r1(o.w), d: r1(o.d), rot: r1((o.rot * 180) / Math.PI) };
})() : null;

// ---------- Salida ----------
const SHORT = {
  'Mª Teresa Jiménez Hernández': 'Farmacia', 'Escuela Municipal de Música Cobeña': 'Escuela de Música', 'Casa de Asociaciones de Cobeña': 'Casa de Asociaciones',
  'Cancha Deportiva Fuente de Arriba': 'Cancha Fuente de Arriba', 'Colegio de Educación Infantil, Primaria y Secundaria Villa de Cobeña': 'Colegio Villa de Cobeña',
  'Centro Privado de Educación Infantil, Primaria y Secundaria Norfolk': 'Colegio Norfolk', 'Escuela de Educación Infantil Carantoñas': 'Escuela Infantil Carantoñas',
  'VIAM - Centro de Conservación de Carreteras zona noreste.': 'Conservación de Carreteras', 'Azulejos y Pavimentos - Barroso e Hijos': 'Barroso e Hijos',
  'Estación Depuradora de Agua Residuales Lechos de Turba de Cobeña': 'Depuradora', 'Depósito Cobeña (Polígono Industrial Camponuevo)': 'Depósito',
};
const shortLabel = (n) => {
  let t = SHORT[n] || n;
  if (t.length > 26) t = t.slice(0, 27).replace(/\s+\S*$/, '');
  return t.toUpperCase();
};
const data = {
  scale: U,
  origin: [LAT0, LON0],
  bounds: [B.x0, B.z0, B.x1, B.z1],
  names,
  labels: labels.map(shortLabel),
  addrs,
  // [clase, ancho de calzada, ancho de acera, nombre, sentido único, puntos]
  roads: roads.map((r) => [r.cls, r1(r.half * 2), r1(r.sw), r.name, r.oneway ? 1 : 0, flat(r.pts)]),
  // x, z, ancho, fondo, giro (grados), plantas, tipo, fachada, cartel, grupo, caras libres (bits)
  buildings: buildings.flatMap((b) => [r1(b.x), r1(b.z), r1(b.w), r1(b.d), r1((b.rot * 180) / Math.PI), b.levels, b.kind, b.front, b.label, b.group, b.open]),
  walls: walls.map((w) => w),
  pools,
  pitches,
  greens: greens.map((g) => [g.type, g.name, flat(g.pts)]),
  urban: urbanPolys.map(flat),
  paved: paved.map((p) => [p.type, p.name, flat(p.pts)]),
  water: water.map(flat),
  streams: streams.map(flat),
  lamps: clearPads(lamps, 4),
  trees: clearPads(trees, 3),
  props: clearPads(props, 4, 1),
  studs: clearPads(studs, 3),
  deliveries,
  cars,
  peds,
  race,
  playgrounds,
  places,
};
const json = JSON.stringify(data);
fs.writeFileSync(OUT, '// Generado por tools/osm-cobena.mjs a partir de OpenStreetMap. No editar a mano.\n// Datos © colaboradores de OpenStreetMap (ODbL).\nexport default ' + json + ';\n');
console.log(`calles ${roads.length} · edificios ${buildings.length} (eliminados ${dropped}) · vallas ${wallN} · piscinas ${pools.length / 5} · zonas verdes ${greens.length}`);
console.log(`farolas ${data.lamps.length / 4} · árboles ${data.trees.length / 3} · mobiliario ${data.props.length / 4} · studs ${data.studs.length / 3} · portales ${deliveries.length / 3}`);
console.log(`coches ${cars.length} circuitos · peatones ${peds.length} paseos · carrera ${race ? race.gates.length + ' controles, ' + race.length + ' u' : 'NO'} · parques infantiles ${playgrounds.length}`);
console.log(`skatepark: centro ${r1(lot.x)},${r1(lot.z)} giro ${((lot.rot * 180) / Math.PI).toFixed(1)}° ${r1(lot.w)}x${r1(lot.d)} · salidas ${Object.values(places.homes).map((h) => `${h.name} ${h.spawn.x},${h.spawn.z}`).join(' · ')}`);
console.log(`${OUT} → ${(json.length / 1024).toFixed(0)} KB`);
