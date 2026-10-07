import * as THREE from 'three';
import { carModel } from '../lego/models.js';
import { createMinifig } from '../lego/minifig.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { DATA } from '../world/cobena.js';
import { angDiff, damp } from '../core/rng.js';
import { lift, grade } from '../world/relief.js';

const KINDS = [
  ['car', C.red], ['taxi', C.yellow], ['bus', C.red], ['car', C.medAzure], ['police', C.white], ['truck', C.orange],
  ['icecream', C.pink], ['car', C.lime], ['car', C.sandBlue], ['bus', C.green], ['taxi', C.yellow], ['car', C.magenta],
];

// Paseo de ida y vuelta por una polilínea (puntos x, z seguidos)
function walkPath(pts) {
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

export class Traffic {
  constructor(game, pedPaths) {
    this.game = game;
    this.cars = [];
    const rng = game.rng;
    // Dos coches por cada circuito de calles reales
    const loops = DATA.cars.map((f) => {
      const path = [];
      for (let i = 0; i < f.length; i += 2) path.push([f[i], f[i + 1]]);
      return path;
    });
    const slots = loops.flatMap((path) => [[path, 0], [path, 0.5]]);
    slots.forEach(([path, at], i) => {
      const [kind, color] = KINDS[i % KINDS.length];
      const model = carModel(kind, color);
      const mesh = new THREE.Mesh(model.geo, plastic);
      mesh.castShadow = true;
      mesh.rotation.order = 'YXZ';
      const idx = Math.floor((at + rng() * 0.3) * path.length) % path.length;
      const car = { mesh, kind, taken: false, path, idx, x: path[idx][0], z: path[idx][1], heading: 0, speed: 0, cruise: kind === 'bus' || kind === 'truck' ? 11 : rng.range(13, 17), hl: model.len / 2, hw: model.width / 2, honk: 0 };
      const nx = path[(idx + 1) % path.length];
      car.heading = Math.atan2(nx[0] - car.x, nx[1] - car.z);
      game.scene.add(mesh);
      this.cars.push(car);
    });

    // Peatones
    this.peds = [];
    const torsoC = [C.red, C.blue, C.green, C.white, C.orange, C.magenta, C.turquoise, C.yellow, C.lavender, C.black];
    const legC = [C.blue, C.black, C.dgray, C.brown, C.sandBlue, C.darkRed, C.green, C.tan];
    const hairC = [C.brown, C.black, C.yellow, C.orange, C.dgray, C.darkRed, C.white];
    const paths = pedPaths.map(walkPath).filter((p) => p.len > 20);
    const count = Math.min(64, paths.length * 2);
    for (let i = 0; i < count; i++) {
      const loop = paths[i % paths.length];
      const fig = createMinifig({
        torso: rng.pick(torsoC), legs: rng.pick(legC), hair: rng.pick(['hair', 'hair', 'cap', 'none']), hairColor: rng.pick(hairC),
        face: rng.pick(['smile', 'smile', 'grin', 'cool', 'wink']), print: rng.pick([null, 'tie', 'stripes', 'buttons', 'star']), printColor: rng.pick(['#ffffff', '#1b1d21', '#f7d117']),
      });
      game.scene.add(fig.group);
      this.peds.push({ fig, loop, s: rng() * loop.len, seg: 0, dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(2.2, 3.6), ph: rng() * 6, fly: 0, vy: 0, y: 0, x: 0, z: 0, off: rng.range(-0.7, 0.7), cd: 0, taken: false });
    }
  }

  // Minifiguras quietas (espectadores)
  addStatic(list) {
    const rng = this.game.rng;
    this.statics = list.map((s) => {
      const fig = createMinifig({ torso: rng.pick([C.lime, C.magenta, C.azure, C.yellow]), legs: rng.pick([C.black, C.blue]), hair: 'cap', hairColor: rng.pick([C.red, C.blue, C.black]), face: rng.pick(['grin', 'cool']) });
      fig.group.position.set(s.x, s.y, s.z);
      fig.group.rotation.y = s.rot;
      this.game.scene.add(fig.group);
      return { fig, ph: rng() * 6 };
    });
  }

  update(dt, player, time) {
    const px = player.pos.x;
    const pz = player.pos.z;
    const pAlive = player.crashT <= 0;
    // --- Coches ---
    for (const c of this.cars) {
      if (c.taken) continue; // en el rayo del platillo: lo mueve la invasión
      const fx = Math.sin(c.heading);
      const fz = Math.cos(c.heading);
      let target = c.cruise;
      // Frenar si el patinete u otro coche está delante
      const dxp = px - c.x;
      const dzp = pz - c.z;
      const fwd = dxp * fx + dzp * fz;
      const lat = dxp * fz - dzp * fx;
      if (fwd > 0 && fwd < c.hl + 13 && Math.abs(lat) < c.hw + 1.4 && player.pos.y < 4) {
        target = 0;
        c.honk -= dt;
        if (c.honk <= 0 && fwd < c.hl + 8) {
          c.honk = 2.5;
          this.game.sfx.honk();
        }
      }
      for (const o of this.cars) {
        if (o === c || o.taken) continue;
        const dx = o.x - c.x;
        const dz = o.z - c.z;
        const f = dx * fx + dz * fz;
        if (f > 0 && f < c.hl + o.hl + 7 && Math.abs(dx * fz - dz * fx) < 4 && Math.sin(o.heading) * fx + Math.cos(o.heading) * fz > 0.3) {
          target = Math.min(target, o.speed * 0.8);
        }
      }
      c.speed += Math.max(-26 * dt, Math.min(8 * dt, target - c.speed));
      let move = c.speed * dt;
      while (move > 0) {
        const n = c.path[(c.idx + 1) % c.path.length];
        const dx = n[0] - c.x;
        const dz = n[1] - c.z;
        const d = Math.hypot(dx, dz);
        if (d <= move) {
          c.x = n[0];
          c.z = n[1];
          c.idx = (c.idx + 1) % c.path.length;
          move -= d;
        } else {
          c.x += (dx / d) * move;
          c.z += (dz / d) * move;
          move = 0;
        }
      }
      const n2 = c.path[(c.idx + 2) % c.path.length];
      const th = Math.atan2(n2[0] - c.x, n2[1] - c.z);
      c.heading += angDiff(c.heading, th) * Math.min(1, 6 * dt);
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      // Morro arriba o abajo según la cuesta
      lift(c.x, c.z);
      c.mesh.rotation.x = -Math.atan(grade.x * fx + grade.z * fz);
      const far = Math.abs(dxp) + Math.abs(dzp) > 420;
      c.mesh.visible = !far;
      // Choque con el patinete
      if (pAlive && player.pos.y < 4.4) {
        const lx = dxp * fz - dzp * fx;
        const lz = dxp * fx + dzp * fz;
        const ox = c.hw + 1.0 - Math.abs(lx);
        const oz = c.hl + 1.0 - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          let nx;
          let nz;
          let pen;
          if (ox < oz) {
            const s = Math.sign(lx) || 1;
            nx = fz * s;
            nz = -fx * s;
            pen = ox;
          } else {
            const s = Math.sign(lz) || 1;
            nx = fx * s;
            nz = fz * s;
            pen = oz;
          }
          const hard = player.speed > 14 || c.speed > 8;
          player.bump(nx, nz, pen + 0.05, 0.35);
          if (hard && player.bumpCd <= 0) {
            player.bumpCd = 0.6;
            if (player.grounded) player.v = -Math.abs(player.v) * 0.3 - c.speed * 0.2;
            this.game.onBump(20);
          }
        }
      }
    }

    // --- Peatones ---
    const T = this.game.terrain;
    for (const p of this.peds) {
      if (p.taken) continue;
      const L = p.loop;
      if (p.fly <= 0) {
        p.s += p.dir * p.speed * dt;
        if (p.s >= L.len) {
          p.s = L.len;
          p.dir = -1;
        } else if (p.s <= 0) {
          p.s = 0;
          p.dir = 1;
        }
      }
      while (p.seg < L.cum.length - 2 && p.s > L.cum[p.seg + 1]) p.seg++;
      while (p.seg > 0 && p.s < L.cum[p.seg]) p.seg--;
      const i2 = p.seg * 2;
      const sl = L.cum[p.seg + 1] - L.cum[p.seg] || 1;
      const ux = (L.pts[i2 + 2] - L.pts[i2]) / sl;
      const uz = (L.pts[i2 + 3] - L.pts[i2 + 1]) / sl;
      const t = p.s - L.cum[p.seg];
      const x = L.pts[i2] + ux * t - uz * p.off;
      const z = L.pts[i2 + 1] + uz * t + ux * p.off;
      let hd = Math.atan2(ux, uz);
      if (p.dir < 0) hd += Math.PI;
      p.x = x;
      p.z = z;
      const dx = px - x;
      const dz = pz - z;
      const d2 = dx * dx + dz * dz;
      const g = p.fig.group;
      if (d2 > 170 * 170) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const gy = T.height(x, z);
      const f = p.fig;
      if (p.fly > 0) {
        // Por los aires tras un atropello (sin daños: son de plástico)
        p.fly -= dt;
        p.vy -= 30 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0;
          p.fly = 0;
        }
        g.rotation.x += dt * 12;
        f.armL.rotation.x = f.armR.rotation.x = -2.6;
        f.legL.rotation.x = 0.5;
        f.legR.rotation.x = -0.5;
      } else {
        g.rotation.x = 0;
        const w = time * p.speed * 2.6 + p.ph;
        f.legL.rotation.x = Math.sin(w) * 0.55;
        f.legR.rotation.x = -Math.sin(w) * 0.55;
        f.armL.rotation.x = -Math.sin(w) * 0.5;
        f.armR.rotation.x = Math.sin(w) * 0.5;
        g.rotation.y = damp(g.rotation.y, g.rotation.y + angDiff(g.rotation.y, hd), 8, dt);
        p.cd -= dt;
        if (pAlive && d2 < 3.4 && Math.abs(player.pos.y - gy) < 3 && p.cd <= 0) {
          if (player.speed > 7) {
            p.fly = 1.4;
            p.vy = 13;
            p.cd = 2;
            this.game.onPedHit(p, x, gy, z);
          } else {
            const d = Math.sqrt(d2) || 1;
            player.bump(dx / d, dz / d, 0.15, 0.9);
          }
        }
      }
      g.position.set(x, gy + p.y, z);
    }
    if (this.statics) {
      for (const s of this.statics) {
        const k = Math.max(0, Math.sin(time * 5 + s.ph));
        s.fig.group.position.y += 0; // quietos, solo animan los brazos
        s.fig.armL.rotation.x = -2.6 - k * 0.4;
        s.fig.armR.rotation.x = -2.6 + k * 0.4 - 0.4;
        s.fig.head.rotation.y = Math.sin(time * 0.8 + s.ph) * 0.5;
      }
    }
  }
}
