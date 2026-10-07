import { angDiff } from '../core/rng.js';

// Paso de un personaje a pie (marcianos, el municipal, la abuela...): gira hacia una dirección y
// avanza esquivando paredes y agua. Devuelve false si no puede pasar.
export function walk(T, a, dir, speed, turn, dt) {
  a.heading += angDiff(a.heading, dir) * Math.min(1, turn * dt);
  if (speed <= 0) return true;
  const sx = Math.sin(a.heading);
  const sz = Math.cos(a.heading);
  const step = speed * dt;
  const free = (x, z) => {
    const h = T.height(x, z);
    return h - a.y <= 1.1 && h > -0.8;
  };
  let nx = a.x + sx * step;
  let nz = a.z + sz * step;
  if (!free(a.x + sx * (step + 0.8), a.z + sz * (step + 0.8))) {
    if (free(a.x + Math.sign(sx) * (Math.abs(sx) * step + 0.8), a.z) && Math.abs(sx) > 0.2) nz = a.z;
    else if (free(a.x, a.z + Math.sign(sz) * (Math.abs(sz) * step + 0.8)) && Math.abs(sz) > 0.2) nx = a.x;
    else {
      a.stuck += dt;
      return false;
    }
    a.stuck += dt * 0.5;
  } else a.stuck = Math.max(0, a.stuck - dt);
  a.x = nx;
  a.z = nz;
  a.y = T.height(nx, nz);
  a.walk += step * 0.8;
  return true;
}
