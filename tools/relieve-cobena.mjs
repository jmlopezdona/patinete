// Herramienta de desarrollo: convierte el relieve de Cobeña (MDT05 del IGN, LiDAR de 5 m) en la
// rejilla de cotas que usa el juego (src/world/cobena-relieve.js). La descarga se guarda en tools/.cache.
// Uso: node tools/relieve-cobena.mjs [--descargar]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import D from '../src/world/cobena-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools/.cache/cobena-mdt.asc');
const OUT = path.join(ROOT, 'src/world/cobena-relieve.js');

// La misma proyección que tools/osm-cobena.mjs
const U = D.scale;
const [LAT0, LON0] = D.origin;
const MX = 84703 * U;
const MZ = 111046 * U;
const STEP = 40; // una cota cada 20 m
const MARGIN = 1320; // campos de alrededor, hasta donde llega la niebla
const SIGMA = 14; // suavizado: quita bordillos, taludes y ruido del LiDAR
const snap = (v, up) => (up ? Math.ceil(v / (STEP * 2)) : Math.floor(v / (STEP * 2))) * STEP * 2; // número par de celdas
const X0 = snap(D.bounds[0] - MARGIN, false);
const Z0 = snap(D.bounds[1] - MARGIN, false);
const X1 = snap(D.bounds[2] + MARGIN, true);
const Z1 = snap(D.bounds[3] + MARGIN, true);

if (!fs.existsSync(CACHE) || process.argv.includes('--descargar')) {
  console.log('Descargando del IGN…');
  const pad = 0.0012;
  const lat = [LAT0 - Z1 / MZ - pad, LAT0 - Z0 / MZ + pad].map((v) => v.toFixed(5));
  const lon = [LON0 + X0 / MX - pad, LON0 + X1 / MX + pad].map((v) => v.toFixed(5));
  const url = `https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion4258_5&SUBSET=Lat(${lat})&SUBSET=Long(${lon})&FORMAT=application/asc`;
  const res = await fetch(url, { headers: { 'User-Agent': 'juego-patinete-dev/1.0' } });
  if (!res.ok) throw new Error('El IGN respondió ' + res.status);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, await res.text());
}

// ---------- Lectura de la rejilla ASCII (viene envuelta en un multipart) ----------
const raw = fs.readFileSync(CACHE, 'utf8');
const at = raw.indexOf('ncols');
if (at < 0) throw new Error('La descarga no es una rejilla ASCII: ' + raw.slice(0, 200));
const lines = raw.slice(at).split('\n');
const head = {};
let li = 0;
for (; li < lines.length && /^[a-z_]+\s/i.test(lines[li]); li++) {
  const [k, v] = lines[li].trim().split(/\s+/);
  head[k.toLowerCase()] = +v;
}
const { ncols, nrows, xllcorner, yllcorner, cellsize } = head;
const nodata = head.nodata_value ?? -9999;
const dem = new Float32Array(ncols * nrows);
let n = 0;
for (; li < lines.length && n < dem.length; li++) {
  if (lines[li].startsWith('--')) break;
  for (const t of lines[li].trim().split(/\s+/)) if (t !== '' && n < dem.length) dem[n++] = +t;
}
if (n !== dem.length) throw new Error(`Rejilla incompleta: ${n} de ${dem.length} cotas`);

// Cota suavizada (metros) en un punto del juego: media gaussiana de las celdas de alrededor
const mLon = cellsize * MX; // tamaño de una celda en unidades de juego
const mLat = cellsize * MZ;
function height(x, z) {
  const c = (LON0 + x / MX - xllcorner) / cellsize - 0.5;
  const r = nrows - (LAT0 - z / MZ - yllcorner) / cellsize - 0.5;
  const rc = Math.ceil((SIGMA * 2.5) / mLon);
  const rr = Math.ceil((SIGMA * 2.5) / mLat);
  let sum = 0;
  let wsum = 0;
  for (let j = Math.round(r) - rr; j <= Math.round(r) + rr; j++) {
    for (let i = Math.round(c) - rc; i <= Math.round(c) + rc; i++) {
      const v = dem[Math.max(0, Math.min(nrows - 1, j)) * ncols + Math.max(0, Math.min(ncols - 1, i))];
      if (v === nodata) continue;
      const dx = (i - c) * mLon;
      const dz = (j - r) * mLat;
      const w = Math.exp(-(dx * dx + dz * dz) / (2 * SIGMA * SIGMA));
      sum += v * w;
      wsum += w;
    }
  }
  if (!wsum) throw new Error(`Sin datos de relieve en ${x}, ${z}`);
  return sum / wsum;
}

// ---------- Salida: décimas de unidad de juego, con el cero en la puerta de casa ----------
const sp = D.places.spawn;
const zero = height(sp.x, sp.z);
const nx = (X1 - X0) / STEP + 1;
const nz = (Z1 - Z0) / STEP + 1;
const h = [];
let lo = Infinity;
let hi = -Infinity;
for (let j = 0; j < nz; j++) {
  for (let i = 0; i < nx; i++) {
    const x = X0 + i * STEP;
    const z = Z0 + j * STEP;
    const m = height(x, z);
    if (x >= D.bounds[0] && x <= D.bounds[2] && z >= D.bounds[1] && z <= D.bounds[3]) {
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
    }
    h.push(Math.round((m - zero) * U * 10));
  }
}
const data = { step: STEP, x0: X0, z0: Z0, nx, nz, zero: Math.round(zero * 10) / 10, h };
const json = JSON.stringify(data);
fs.writeFileSync(OUT, '// Generado por tools/relieve-cobena.mjs a partir del MDT05 del IGN. No editar a mano.\n// Modelo Digital del Terreno MDT05 2015-2021 CC-BY 4.0 scne.es\nexport default ' + json + ';\n');
console.log(`relieve ${nx}x${nz} cotas cada ${STEP / U} m · casa a ${zero.toFixed(1)} m · pueblo entre ${lo.toFixed(0)} y ${hi.toFixed(0)} m`);
console.log(`${OUT} → ${(json.length / 1024).toFixed(0)} KB`);
