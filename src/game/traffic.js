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

// Cómo viaja un coche por la red: sitio en décimas, rumbo en 16 bits y velocidad en octavos
const CAR = 7;
const POS = 10;
const ANG = 32767 / Math.PI;
const SPD = 8;

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
      const car = { mesh, kind, taken: false, path, idx, x: path[idx][0], z: path[idx][1], heading: 0, speed: 0, cruise: kind === 'bus' || kind === 'truck' ? 11 : rng.range(13, 17), hl: model.len / 2, hw: model.width / 2, honk: 0, away: false };
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
      const p = { fig, loop, s: rng() * loop.len, seg: 0, dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(2.2, 3.6), ph: rng() * 6, fly: 0, vy: 0, y: 0, x: 0, z: 0, off: rng.range(-0.7, 0.7), cd: 0, taken: false, lag: 0 };
      // Por dónde va a la hora cero: de ahí y del reloj sale por dónde va en cada momento
      p.u0 = p.dir > 0 ? p.s : 2 * loop.len - p.s;
      this.peds.push(p);
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

  // Coches y peatones son los mismos para todos los jugadores de una partida en red:
  // - Los coches los mueve el anfitrión (`simulate`), que frena ante cualquier jugador, y viajan en
  //   cada `foto` (`write` y `read`). Un invitado solo los pone donde le dicen.
  // - Los peatones no viajan: por dónde va cada uno sale del reloj del juego, que es común.
  // - Los choques los detecta cada jugador en su pantalla, contra lo que ve (`touch` y `walk`); el
  //   atropello de un peatón, que lo ven todos, se avisa (`atropella`).
  update(dt, player, time) {
    const party = this.game.party;
    const led = !!party && !party.hosting && party.fed;
    if (this.led && !led) this.rejoin();
    this.led = led;
    if (!led) this.simulate(dt, this.game.crowd(player));
    this.present(player);
    this.touch(player);
    this.walk(dt, player, time);
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

  // ---------- Coches ----------
  // Lo que decide por dónde van: solo jugando solo o en el anfitrión. who: los jugadores que hay por la calle
  simulate(dt, who) {
    for (const c of this.cars) {
      if (c.taken) continue; // en el rayo del platillo: lo mueve la invasión
      const fx = Math.sin(c.heading);
      const fz = Math.cos(c.heading);
      let target = c.cruise;
      // Frenar si un patinete u otro coche está delante
      let pita = null;
      for (const p of who) {
        const dxp = p.pos.x - c.x;
        const dzp = p.pos.z - c.z;
        const fwd = dxp * fx + dzp * fz;
        const lat = dxp * fz - dzp * fx;
        if (fwd > 0 && fwd < c.hl + 13 && Math.abs(lat) < c.hw + 1.4 && p.pos.y < 4) {
          target = 0;
          if (fwd < c.hl + 8) pita ??= p;
        }
      }
      if (target === 0) {
        c.honk -= dt;
        if (c.honk <= 0 && pita) {
          c.honk = 2.5;
          this.game.to(pita).sfx.honk();
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
    }
  }

  // Lo que se ve: cada coche en su sitio, estén donde estén decididos
  present(player) {
    for (const c of this.cars) {
      if (c.taken) continue;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      // Morro arriba o abajo según la cuesta
      lift(c.x, c.z);
      c.mesh.rotation.x = -Math.atan(grade.x * Math.sin(c.heading) + grade.z * Math.cos(c.heading));
      c.mesh.visible = !c.away && Math.abs(player.pos.x - c.x) + Math.abs(player.pos.z - c.z) <= 420;
    }
  }

  // Choque del jugador de esta pantalla con los coches, tal como los ve
  touch(player) {
    if (player.crashT > 0 || player.pos.y >= 4.4) return;
    for (const c of this.cars) {
      if (c.taken || c.away) continue;
      const fx = Math.sin(c.heading);
      const fz = Math.cos(c.heading);
      const dxp = player.pos.x - c.x;
      const dzp = player.pos.z - c.z;
      const lx = dxp * fz - dzp * fx;
      const lz = dxp * fx + dzp * fz;
      const ox = c.hw + 1.0 - Math.abs(lx);
      const oz = c.hl + 1.0 - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
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

  // En red, lo que viaja de los coches en cada `foto`: sitio, rumbo y velocidad de cada uno, y
  // cuáles tiene cogidos el platillo
  get bytes() {
    return this.cars.length * CAR + 2;
  }

  write(dv, o) {
    let taken = 0;
    this.cars.forEach((c, i) => {
      dv.setInt16(o, Math.round(c.x * POS), true);
      dv.setInt16(o + 2, Math.round(c.z * POS), true);
      dv.setInt16(o + 4, Math.round(angDiff(0, c.heading) * ANG), true);
      dv.setUint8(o + 6, Math.max(0, Math.min(255, Math.round(c.speed * SPD))));
      if (c.taken) taken |= 1 << i;
      o += CAR;
    });
    dv.setUint16(o, taken, true);
    return o + 2;
  }

  // Invitado: los coches, entre dos fotos del anfitrión (k de 0 a 1)
  read(a, b, o, k) {
    const taken = a.getUint16(o + this.cars.length * CAR, true);
    this.cars.forEach((c, i) => {
      // El que tiene cogido el platillo no se mueve de donde está: lo lleva la invasión (aliens.js),
      // que aquí se entera un momento después que el tráfico
      c.away = !c.taken && !!(taken & (1 << i));
      if (!c.taken) {
        const xa = a.getInt16(o, true) / POS;
        const za = a.getInt16(o + 2, true) / POS;
        const ha = a.getInt16(o + 4, true) / ANG;
        const sa = a.getUint8(o + 6) / SPD;
        c.x = xa + (b.getInt16(o, true) / POS - xa) * k;
        c.z = za + (b.getInt16(o + 2, true) / POS - za) * k;
        c.heading = ha + angDiff(ha, b.getInt16(o + 4, true) / ANG) * k;
        c.speed = sa + (b.getUint8(o + 6) / SPD - sa) * k;
      }
      o += CAR;
    });
    return o + 2;
  }

  // Al acabar la partida en red los coches vuelven a ser de esta pantalla: cada uno sigue su
  // circuito desde el tramo en el que lo ha dejado el anfitrión
  rejoin() {
    for (const c of this.cars) {
      c.away = false;
      let best = Infinity;
      const P = c.path;
      for (let i = 0; i < P.length; i++) {
        const n = P[(i + 1) % P.length];
        const ex = n[0] - P[i][0];
        const ez = n[1] - P[i][1];
        const t = Math.max(0, Math.min(1, ((c.x - P[i][0]) * ex + (c.z - P[i][1]) * ez) / (ex * ex + ez * ez || 1)));
        // Entre dos tramos igual de cerca (una calle de ida y vuelta), el que va hacia donde mira
        const d = Math.hypot(c.x - P[i][0] - ex * t, c.z - P[i][1] - ez * t) + (ex * Math.sin(c.heading) + ez * Math.cos(c.heading) < 0 ? 6 : 0);
        if (d < best) {
          best = d;
          c.idx = i;
        }
      }
    }
  }

  // ---------- Peatones ----------
  // En red: lo que lleva de retraso cada peatón al que el platillo ha tenido cogido, para quien entra tarde
  lags() {
    const out = [];
    this.peds.forEach((p, i) => p.lag && out.push(i, Math.round(p.lag * 100) / 100));
    return out;
  }

  late(list) {
    for (let i = 0; i + 1 < list.length; i += 2) {
      const p = this.peds[list[i] | 0];
      if (p && typeof list[i + 1] === 'number' && !p.taken) p.lag = list[i + 1];
    }
  }

  // Sale por los aires (sin daños: son de plástico). mine: lo ha atropellado el jugador de esta pantalla
  knock(i, mine) {
    const p = this.peds[i];
    if (!p || p.taken || p.fly > 0) return;
    p.fly = 1.4;
    p.vy = 13;
    const y = this.game.terrain.height(p.x, p.z);
    if (mine) {
      this.game.onPedHit(p, p.x, y, p.z);
      this.game.party?.tell('atropella', i);
    } else this.game.here(p.x, p.z).sfx.ouch();
  }

  walk(dt, player, time) {
    const px = player.pos.x;
    const pz = player.pos.z;
    const pAlive = player.crashT <= 0;
    const T = this.game.terrain;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      const L = p.loop;
      if (p.taken) {
        p.lag += dt; // cogido por el platillo o disfrazado: se queda donde estaba
        continue;
      }
      // Va y viene por su recorrido al paso del reloj del juego, que en red es el mismo para todos
      const u = (((p.u0 + p.speed * (time - p.lag)) % (2 * L.len)) + 2 * L.len) % (2 * L.len);
      p.dir = u <= L.len ? 1 : -1;
      p.s = u <= L.len ? u : 2 * L.len - u;
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
            p.cd = 2;
            // Si era un marciano disfrazado, lo que sale por los aires es el disfraz
            if (!this.game.disguise.unmask(p, x, gy, z)) this.knock(i, true);
          } else {
            const d = Math.sqrt(d2) || 1;
            player.bump(dx / d, dz / d, 0.15, 0.9);
          }
        }
      }
      g.position.set(x, gy + p.y, z);
    }
  }
}
