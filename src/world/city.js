import { C } from '../lego/colors.js';
import { F } from '../lego/batch.js';
import { lift } from './relief.js';

// Piezas comunes del mundo: árboles, farolas, carteles y sistemas de coordenadas locales.
export const BASE = 0.4; // altura de las plataformas (skatepark, pistas...)
export const SIDEWALK_COLOR = 0xc3c7ca;

// Sistema local girado. Como en batch.box: X local -> (cos, -sin), Z local -> (sin, cos).
export function frame(x, z, rot = 0) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x, z, rot, c, s,
    p: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c],
    inv: (wx, wz) => [(wx - x) * c - (wz - z) * s, (wx - x) * s + (wz - z) * c],
    sub(lx, lz, r = 0) {
      const q = this.p(lx, lz);
      return frame(q[0], q[1], rot + r);
    },
  };
}

// Caja en coordenadas de un sistema local (y = base)
export function fbox(batch, f, lx, y, lz, w, h, d, color, flags = 0, r = 0) {
  const q = f.p(lx, lz);
  batch.box(q[0], y, q[1], w, h, d, color, flags, f.rot + r);
}

export function tree(W, x, z, base = 0, kind = null) {
  const { batch, rng, terrain } = W;
  kind = kind ?? rng.pick(['round', 'round', 'round', 'pine', 'pink']);
  const th = rng.range(3.4, 4.8);
  const rot = rng.pick([0, 0, Math.PI / 4]);
  batch.box(x, base, z, 1, th, 1, C.brown, 0, rot);
  const pal = kind === 'pink' ? [C.pink, C.magenta] : kind === 'pine' ? [C.green, 0x1c6a39] : kind === 'olive' ? [C.olive, C.sandGreen] : rng.pick([[C.brightGreen, C.green], [C.lime, C.brightGreen]]);
  const layers = kind === 'pine' ? [5, 5, 3, 3, 1] : [3, 5, 5, 3];
  let y = base + th;
  layers.forEach((s, i) => {
    batch.box(x, y, z, s, 1.2, s, pal[i % 2], F.STUDS, rot);
    y += 1.2;
  });
  terrain.cyl(x, z, 0.75, y);
}

// Farola con el brazo apuntando hacia (dx, dz)
export function lamp(W, x, z, dx, dz, base = 0) {
  const { batch } = W;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const rot = Math.atan2(-dz, dx);
  const level = batch.level;
  batch.level ??= lift(x, z); // el brazo y el farol, a la cota del poste
  batch.box(x, base, z, 0.9, 0.4, 0.9, C.dgray, 0, rot);
  batch.box(x, base, z, 0.36, 8, 0.36, C.black, 0, rot);
  batch.box(x + dx * 1.1, base + 7.8, z + dz * 1.1, 2.5, 0.3, 0.3, C.black, 0, rot);
  const lx = x + dx * 2.1;
  const lz = z + dz * 2.1;
  batch.box(lx, base + 7.3, lz, 1.1, 0.5, 1.1, 0xfff0b8, F.GLOW, rot);
  batch.level = level;
  W.lamps.push({ x: lx, y: base + 7.3, z: lz });
}

// Cartel a la altura y sobre el terreno (o sobre el edificio que se esté construyendo)
export function addSign(W, text, x, y, z, rot, w, h, bg = '#c91a09', fg = '#ffffff') {
  W.signs.push({ text, x, y: y + (W.batch.level ?? lift(x, z)), z, rot, w, h, bg, fg });
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
