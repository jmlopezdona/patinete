import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { addPin, ballGeometry } from '../lego/models.js';
import { createMinifig, nameTag } from '../lego/minifig.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { BASE } from '../world/city.js';
import { characterById } from './characters.js';

const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _v = new THREE.Vector3();
const PIN_S = 1.12;
const SKIN = 0x7ddc1f;
const G = 34;
const SEE = 18; // desde aquí te ven venir los bolos marcianos
const DODGE = 6.5; // y esto es lo que corren apartándose
const CLEAR = 3.3; // el hueco que te dejan al pasar
const KEEP = 4; // lo que corre bajo los palos el portero marciano
const CHEER = 1.1; // lo que se pasa celebrando cada parada, sin moverse
const PUNCH = 26; // y con qué fuerza despeja el balón
const SPAN = 2.6; // y hasta dónde llega a cada lado del centro de la portería

// En red la bolera y la pista las lleva el juego de un jugador y los demás las pintan (ver
// game/spots.js). De cada bolo viaja qué le pasa (1 byte), dónde está en centésimas desde el
// triángulo (4), lo caído que está o lo alto que vuela (1) y hacia dónde (1)
const PIN = 7;
export const PINS = 10 * PIN;
// Del balón, dónde está en centésimas desde el centro del campo (6) y por dónde anda el portero marciano (1)
export const BALL = 7;
const DOWN = 1;
const GONE = 2;
const RUN = 4;
const TURN = 256 / (Math.PI * 2);
const SPIN = 14; // lo que gira por los aires un bolo marciano que lleva otro

function putPin(dv, o, f, x, z, h, ang) {
  dv.setUint8(o, f);
  dv.setInt16(o + 1, Math.round(x * 100), true);
  dv.setInt16(o + 3, Math.round(z * 100), true);
  dv.setUint8(o + 5, Math.max(0, Math.min(255, Math.round(h * 255))));
  dv.setUint8(o + 6, Math.round(ang * TURN) & 255);
  return o + PIN;
}

// Los diez bolos entre dos fotos, en `net` de cada uno. El que en la siguiente ya está en otra
// cosa (derribado, retirado) no se mezcla
function getPins(pins, x0, z0, a, oa, b, ob, k) {
  for (const p of pins) {
    const n = (p.net ??= { f: 0, x: 0, z: 0, h: 0, ang: 0 });
    n.f = a.getUint8(oa);
    const j = ((b.getUint8(ob) ^ n.f) & (DOWN | GONE)) === 0 ? k : 0;
    const mix = (at) => a.getInt16(oa + at, true) + (b.getInt16(ob + at, true) - a.getInt16(oa + at, true)) * j;
    n.x = x0 + mix(1) / 100;
    n.z = z0 + mix(3) / 100;
    n.h = (a.getUint8(oa + 5) + (b.getUint8(ob + 5) - a.getUint8(oa + 5)) * j) / 255;
    const turn = ((b.getUint8(ob + 6) - a.getUint8(oa + 6) + 384) & 255) - 128;
    n.ang = (a.getUint8(oa + 6) + turn * j) / TURN;
    oa += PIN;
    ob += PIN;
  }
}

// Lo que se ha movido de un fotograma a otro, hecho velocidad: por si toca seguir con ello. Un
// salto de golpe es que lo han recolocado
const speed = (to, from, dt) => (Math.abs(to - from) < 3 ? (to - from) / dt : 0);

// ¿Toca el jugador algún bolo en pie? push: además lo aparta, que no es quien juega
function touchPins(pins, y, player, push) {
  if (player.crashT > 0 || player.pos.y >= y + 5) return false;
  for (const p of pins) {
    if (p.down || p.gone) continue;
    const dx = p.x - player.pos.x;
    const dz = p.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d >= 2.25) continue;
    if (push) player.bump(-dx / (d || 1), -dz / (d || 1), 2.25 - d, 0.8);
    return true;
  }
  return false;
}

// Bolos gigantes: el patinete hace de bola.
export class Pins {
  constructor(game, place) {
    this.game = game;
    this.place = place;
    const geo = addPin(new Builder(), 0, 0, 0, PIN_S).geometry();
    this.pins = [];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i <= r; i++) {
        const mesh = new THREE.Mesh(geo, plastic);
        mesh.castShadow = true;
        game.scene.add(mesh);
        const x0 = place.pinX + (i - r / 2) * 2.9;
        const z0 = place.pinZ - r * 2.55;
        this.pins.push({ mesh, x0, z0, x: x0, z: z0, vx: 0, vz: 0, tilt: 0, dx: 0, dz: 1, down: false, gone: false });
      }
    }
    this.y = BASE + 0.1;
    this.idle = 0;
    this.shown = true;
    this.reset();
  }

  // De noche los bolos se guardan: se ponen los marcianos
  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    this.reset();
  }

  reset() {
    for (const p of this.pins) {
      p.x = p.x0;
      p.z = p.z0;
      p.vx = p.vz = 0;
      p.tilt = 0;
      p.down = false;
      p.gone = false;
      p.mesh.visible = this.shown;
      p.mesh.position.set(p.x, this.y, p.z);
      p.mesh.quaternion.identity();
    }
  }

  clearFallen() {
    for (const p of this.pins) {
      if (p.down) {
        p.gone = true;
        p.mesh.visible = false;
      }
    }
  }

  get downCount() {
    return this.pins.filter((p) => p.down).length;
  }

  knock(p, vx, vz) {
    const sp = Math.hypot(vx, vz) || 1;
    p.down = true;
    p.vx = vx;
    p.vz = vz;
    p.dx = vx / sp;
    p.dz = vz / sp;
    this.clack(this.game.sfx);
  }

  clack(sfx) {
    sfx.tone(520 + Math.random() * 200, 0.12, 'triangle', 0.25, 0.5);
    sfx.noise(0.05, 0.3, 2400, 4);
  }

  // El bolo, todo lo caído que esté hacia donde lo han tirado
  lay(p) {
    _a.set(p.dz, 0, -p.dx);
    _q.setFromAxisAngle(_a, p.tilt);
    p.mesh.quaternion.copy(_q);
    p.mesh.position.set(p.x, this.y + Math.sin(p.tilt) * 1.05 * PIN_S, p.z);
  }

  // ---------- En red (ver game/spots.js) ----------
  // ¿Hay algo que contar, o están todos en su sitio?
  get live() {
    return this.pins.some((p) => p.down || p.gone);
  }

  put(dv, o) {
    const pl = this.place;
    for (const p of this.pins) o = putPin(dv, o, (p.down ? DOWN : 0) | (p.gone ? GONE : 0), p.x - pl.pinX, p.z - pl.pinZ, p.tilt / (Math.PI / 2), Math.atan2(p.dx, p.dz));
    return o;
  }

  get(a, oa, b, ob, k) {
    getPins(this.pins, this.place.pinX, this.place.pinZ, a, oa, b, ob, k);
  }

  // Los bolos que lleva el juego de otro: cada uno donde dice, y suena el que cae
  paint(dt) {
    for (const p of this.pins) {
      const n = p.net;
      const down = !!(n.f & DOWN);
      if (down && !p.down) this.clack(this.game.here(n.x, n.z).sfx);
      p.vx = speed(n.x, p.x, dt);
      p.vz = speed(n.z, p.z, dt);
      p.x = n.x;
      p.z = n.z;
      p.down = down;
      p.gone = !!(n.f & GONE);
      p.tilt = down ? (n.h * Math.PI) / 2 : 0;
      p.dx = Math.sin(n.ang);
      p.dz = Math.cos(n.ang);
      p.mesh.visible = this.shown && !p.gone;
      this.lay(p);
    }
  }

  touch(player, push) {
    return this.shown && touchPins(this.pins, this.y, player, push);
  }

  update(dt, player, inMission) {
    if (!this.shown) return;
    const pl = this.place;
    const px = player.pos.x;
    const pz = player.pos.z;
    const near = Math.abs(px - pl.pinX) < 40 && Math.abs(pz - pl.pinZ) < 50;
    if (!near) {
      if (!inMission && this.pins.some((p) => p.down)) this.reset();
      return;
    }
    const pv = player.velocity(_v);
    const psp = Math.hypot(pv.x, pv.z);
    for (const p of this.pins) {
      if (p.gone) continue;
      if (!p.down) {
        const dx = p.x - px;
        const dz = p.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < 2.25 && player.pos.y < this.y + 5 && player.crashT <= 0) {
          if (psp > 4) {
            this.knock(p, pv.x * 0.85 + (dx / d) * 5, pv.z * 0.85 + (dz / d) * 5);
            if (player.grounded) player.v *= 0.94;
          } else player.bump(-dx / d, -dz / d, 2.25 - d, 0.8);
        }
        continue;
      }
      // Bolo derribado: se desliza y tumba a los demás
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const f = Math.max(0, 1 - 1.5 * dt);
      p.vx *= f;
      p.vz *= f;
      if (p.x < pl.laneX0 + 1.2) {
        p.x = pl.laneX0 + 1.2;
        p.vx = Math.abs(p.vx) * 0.5;
      } else if (p.x > pl.laneX1 - 1.2) {
        p.x = pl.laneX1 - 1.2;
        p.vx = -Math.abs(p.vx) * 0.5;
      }
      if (p.z < pl.backZ + 1.4) {
        p.z = pl.backZ + 1.4;
        p.vz = Math.abs(p.vz) * 0.4;
      }
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 2.5) {
        for (const o of this.pins) {
          if (o.down || o.gone) continue;
          const dx = o.x - p.x;
          const dz = o.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.3) {
            this.knock(o, p.vx * 0.72 + (dx / d) * 3.5, p.vz * 0.72 + (dz / d) * 3.5);
            p.vx *= 0.62;
            p.vz *= 0.62;
          }
        }
      }
      p.tilt = Math.min(Math.PI / 2, p.tilt + dt * 6.5);
      this.lay(p);
    }
    // En modo libre los bolos se recolocan al rato
    if (!inMission && this.pins.some((p) => p.down)) {
      this.idle += dt;
      if (this.idle > 9 && Math.hypot(px - pl.pinX, pz - pl.pinZ) > 14) {
        this.idle = 0;
        this.reset();
      }
    } else this.idle = 0;
  }

  get moving() {
    return this.pins.some((p) => p.down && !p.gone && Math.hypot(p.vx, p.vz) > 0.6);
  }
}

// Bolos marcianos: de noche los bolos son marcianos vestidos de bolo, y se apartan al verte venir.
export class AlienPins {
  constructor(game, place) {
    this.game = game;
    this.place = place;
    this.pins = [];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i <= r; i++) {
        const fig = createMinifig({ skin: SKIN, face: 'alien', hair: 'antenna', hairColor: C.red, torso: C.white, arms: C.white, legs: C.white, print: 'star', printColor: '#c91a09' });
        fig.group.rotation.order = 'YXZ';
        game.scene.add(fig.group);
        const n = this.pins.length;
        const x0 = place.pinX + (i - r / 2) * 2.9;
        const z0 = place.pinZ - r * 2.55;
        // Cada uno tarda lo suyo en reaccionar, y los del centro echan cada uno para un lado
        this.pins.push({ fig, x0, z0, x: x0, y: 0, z: z0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, heading: 0, walk: n * 1.7, slow: 0.1 + (n % 3) * 0.07, side: n % 2 ? 1 : -1, seen: 0, run: false, face: 0, down: false, gone: false });
      }
    }
    this.y = BASE + 0.1;
    this.idle = 0;
    this.laugh = 0;
    this.shown = false;
    this.reset();
  }

  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    this.reset();
  }

  reset() {
    this.laugh = 0;
    for (const a of this.pins) {
      a.x = a.x0;
      a.z = a.z0;
      a.y = this.y;
      a.vx = a.vy = a.vz = 0;
      a.rot = a.seen = a.face = 0;
      a.run = false;
      a.down = false;
      a.gone = false;
      a.fig.group.visible = this.shown;
      a.fig.group.position.set(a.x, a.y, a.z);
      a.fig.group.rotation.set(0, 0, 0);
    }
  }

  clearFallen() {
    for (const a of this.pins) {
      if (a.down) {
        a.gone = true;
        a.fig.group.visible = false;
      }
    }
  }

  get downCount() {
    return this.pins.filter((a) => a.down).length;
  }

  get moving() {
    return this.pins.some((a) => a.down && !a.gone);
  }

  // Los que siguen en pie se ríen de ti
  taunt() {
    this.laugh = 2.2;
  }

  knock(a, vx, vz) {
    a.down = true;
    a.vx = vx;
    a.vz = vz;
    a.vy = 9 + Math.hypot(vx, vz) * 0.12;
    a.spin = 10 + Math.random() * 8;
    a.heading = Math.atan2(vx, vz);
    a.y += 0.6;
    this.game.bits.burst(a.x, a.y + 1.5, a.z, [0xfff27a, 0xffffff, SKIN], 6, 8, this.y, 0.5);
  }

  // Revienta en ladrillos al caer. mine: lo ha tirado el jugador de esta pantalla, y los studs son suyos
  pop(a, mine = true) {
    const g = mine ? this.game : this.game.here(a.x, a.z);
    g.bits.burst(a.x, this.y + 1.5, a.z, [SKIN, 0xb6ff5a, C.white, C.red], 16, 10, this.y);
    if (mine) g.studs.burst(a.x, this.y + 1, a.z, 2, 0, this.y, 7);
    g.sfx.alienPop();
    a.gone = true;
    a.fig.group.visible = false;
  }

  // En pie: corre apartándose, se ríe de ti o se queda mirando
  stand(a, run, moving, time) {
    const f = a.fig;
    const laugh = this.laugh > 0 && !run;
    const hop = laugh ? Math.abs(Math.sin(time * 9 + a.walk)) * 0.7 : run ? Math.abs(Math.sin(a.walk)) * 0.25 : 0;
    f.legL.rotation.x = moving ? Math.sin(a.walk) * 0.6 : 0;
    f.legR.rotation.x = -f.legL.rotation.x;
    f.armL.rotation.x = f.armR.rotation.x = run || laugh ? -2.8 : 0;
    f.group.position.set(a.x, this.y + hop, a.z);
    f.group.rotation.set(0, a.face, 0);
  }

  // ---------- En red (ver game/spots.js) ----------
  get live() {
    return this.laugh > 0 || this.pins.some((a) => a.down || a.gone || Math.abs(a.x - a.x0) + Math.abs(a.z - a.z0) > 0.02);
  }

  put(dv, o) {
    const pl = this.place;
    for (const a of this.pins) o = putPin(dv, o, (a.down ? DOWN : 0) | (a.gone ? GONE : 0) | (a.run ? RUN : 0), a.x - pl.pinX, a.z - pl.pinZ, (a.y - this.y) / 10, a.down ? a.heading : a.face);
    return o;
  }

  get(a, oa, b, ob, k) {
    getPins(this.pins, this.place.pinX, this.place.pinZ, a, oa, b, ob, k);
  }

  // Los marcianos que lleva el juego de otro. laugh: los que quedan en pie se están riendo
  paint(dt, time, laugh) {
    this.laugh = laugh ? 1 : 0;
    for (const a of this.pins) {
      const n = a.net;
      const f = a.fig;
      const down = !!(n.f & DOWN);
      if (n.f & GONE) {
        // Solo revienta el que se ha visto volar: al resto los han retirado sin más
        if (!a.gone && a.down) this.pop(a, false);
        a.gone = true;
        a.down = down;
        f.group.visible = false;
        continue;
      }
      if (down && !a.down) this.game.here(n.x, n.z).bits.burst(n.x, a.y + 1.5, n.z, [0xfff27a, 0xffffff, SKIN], 6, 8, this.y, 0.5);
      const y = this.y + n.h * 10;
      const moving = Math.hypot(n.x - a.x, n.z - a.z) > 0.001;
      a.vx = speed(n.x, a.x, dt);
      a.vy = speed(y, a.y, dt);
      a.vz = speed(n.z, a.z, dt);
      a.x = n.x;
      a.y = y;
      a.z = n.z;
      a.down = down;
      a.gone = false;
      f.group.visible = this.shown;
      if (down) {
        a.spin = SPIN;
        a.rot += SPIN * dt;
        a.heading = n.ang;
        f.armL.rotation.x = f.armR.rotation.x = -2.8;
        f.group.position.set(a.x, a.y, a.z);
        f.group.rotation.set(a.rot, a.heading, 0);
        continue;
      }
      a.rot = 0;
      a.run = !!(n.f & RUN);
      a.face = n.ang;
      if (moving) a.walk += dt * (a.run ? 18 : 9);
      this.stand(a, a.run, moving, time);
    }
  }

  touch(player, push) {
    return this.shown && touchPins(this.pins, this.y, player, push);
  }

  update(dt, player, inMission, time) {
    if (!this.shown) return;
    const pl = this.place;
    const px = player.pos.x;
    const pz = player.pos.z;
    const near = Math.abs(px - pl.pinX) < 40 && Math.abs(pz - pl.pinZ) < 50;
    if (!near) {
      if (!inMission && this.pins.some((a) => a.down)) this.reset();
      return;
    }
    const pv = player.velocity(_v);
    const psp = Math.hypot(pv.x, pv.z);
    const coming = psp > 4 && player.crashT <= 0;
    const x0 = pl.laneX0 + 1.2;
    const x1 = pl.laneX1 - 1.2;
    this.laugh -= dt;
    for (const a of this.pins) {
      if (a.gone) continue;
      const f = a.fig;
      if (a.down) {
        // Por los aires: rebota en las bandas y se lleva por delante a los que pille
        a.vy -= G * dt;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.z += a.vz * dt;
        a.rot += a.spin * dt;
        if (a.x < x0) {
          a.x = x0;
          a.vx = Math.abs(a.vx) * 0.5;
        } else if (a.x > x1) {
          a.x = x1;
          a.vx = -Math.abs(a.vx) * 0.5;
        }
        if (a.z < pl.backZ + 1.4) {
          a.z = pl.backZ + 1.4;
          a.vz = Math.abs(a.vz) * 0.4;
        }
        if (Math.hypot(a.vx, a.vz) > 2.5 && a.y < this.y + 2.6) {
          for (const o of this.pins) {
            if (o.down || o.gone) continue;
            const dx = o.x - a.x;
            const dz = o.z - a.z;
            const d = Math.hypot(dx, dz);
            if (d < 2.3) {
              this.knock(o, a.vx * 0.6 + (dx / d) * 3.5, a.vz * 0.6 + (dz / d) * 3.5);
              this.game.sfx.culetazo(false);
              a.vx *= 0.62;
              a.vz *= 0.62;
            }
          }
        }
        if (a.y <= this.y && a.vy < 0) {
          this.pop(a);
          continue;
        }
        f.armL.rotation.x = f.armR.rotation.x = -2.8;
        f.group.position.set(a.x, a.y, a.z);
        f.group.rotation.set(a.rot, a.heading, 0);
        continue;
      }
      const dx = a.x - px;
      const dz = a.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 2.25 && player.pos.y < this.y + 5 && player.crashT <= 0) {
        if (psp > 4) {
          this.knock(a, pv.x * 0.85 + (dx / d) * 5, pv.z * 0.85 + (dz / d) * 5);
          this.game.sfx.culetazo(player.boosting);
          if (player.grounded) player.v *= 0.94;
          continue;
        }
        player.bump(-dx / d, -dz / d, 2.25 - d, 0.8);
      }
      // Te ve venir: calcula por dónde vas a pasar y se aparta hacia el lado que le pilla más cerca
      let wx = a.x0 - a.x;
      let wz = a.z0 - a.z;
      let run = false;
      const along = (dx * pv.x + dz * pv.z) / (psp || 1);
      if (coming && along > 0 && along < SEE) {
        const nx = pv.z / psp;
        const nz = -pv.x / psp;
        const off = dx * nx + dz * nz;
        wx = wz = 0;
        if (Math.abs(off) < CLEAR) {
          a.seen += dt;
          run = a.seen > a.slow;
          if (run) {
            const k = (Math.abs(off) < 0.3 ? a.side : Math.sign(off)) * CLEAR - off;
            wx = nx * k;
            wz = nz * k;
          }
        }
      } else a.seen = 0;
      const w = Math.hypot(wx, wz);
      const step = Math.min(w, (run ? DODGE : 2.5) * dt);
      const moving = step > 0.001;
      if (moving) {
        a.x = Math.max(x0, Math.min(x1, a.x + (wx / w) * step));
        a.z = Math.max(pl.backZ + 1.4, Math.min(pl.pinZ + 4, a.z + (wz / w) * step));
        a.walk += dt * (run ? 18 : 9);
      }
      a.run = run;
      a.face = run ? Math.atan2(wx, wz) : Math.atan2(-dx, -dz);
      this.stand(a, run, moving, time);
    }
    // En modo libre vuelven a formar al rato
    if (!inMission && this.pins.some((a) => a.down)) {
      this.idle += dt;
      if (this.idle > 9 && Math.hypot(px - pl.pinX, pz - pl.pinZ) > 14) {
        this.idle = 0;
        this.reset();
      }
    } else this.idle = 0;
  }
}

// Balón de fútbol con portero. De noche para un marciano con cuatro brazos, que sigue el balón.
export class Ball {
  constructor(game, place) {
    this.game = game;
    this.place = place;
    this.r = 1.6;
    this.mesh = new THREE.Mesh(ballGeometry(this.r), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, flatShading: true }));
    this.mesh.castShadow = true;
    game.scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.floor = BASE + 0.1 + this.r;
    this.wait = 0;
    // Teo, el portero: rizos, gafas redondas y la albiceleste. Si Teo sale a pasear, para un suplente.
    const teo = createMinifig(characterById('teo').look);
    teo.group.scale.setScalar(0.9);
    const tag = nameTag('Teo', '#74acdf');
    tag.position.y = 6.9;
    teo.group.add(tag);
    const sub = createMinifig({ torso: C.orange, arms: C.orange, legs: C.black, hair: 'cap', hairColor: C.black, face: 'cool', print: 'star', printColor: '#1b1d21' });
    // El marciano: más grande, con guantes y dos brazos de más
    const alien = createMinifig({ skin: SKIN, face: 'alien', hair: 'antenna', hairColor: C.red, torso: C.purple, arms: C.purple, legs: C.black, print: 'bolt', printColor: '#f7d117' });
    alien.group.scale.setScalar(1.12);
    alien.arms = [alien.armL, alien.armR];
    for (const a of [alien.armL, alien.armR]) {
      const low = a.clone();
      low.position.y -= 0.85;
      alien.group.add(low);
      alien.arms.push(low);
    }
    const atag = nameTag('Portero marciano', '#8dff6a');
    atag.position.y = 7.4;
    alien.group.add(atag);
    this.keepers = { teo, sub, alien };
    for (const k of [teo, sub, alien]) {
      k.group.rotation.y = -Math.PI / 2;
      k.armL.rotation.z = 1.3;
      k.armR.rotation.z = -1.3;
      game.scene.add(k.group);
    }
    this.teo = true;
    this.alien = false;
    this.cheer = 0;
    this.net = { x: 0, y: 0, z: 0, kz: 0 };
    this.pick();
    this.kz = place.cz;
    this.kx = place.goalX - 1.6;
    this.reset();
  }

  setKeeper(teo) {
    this.teo = teo;
    this.pick();
  }

  // De noche Teo se toma la noche libre y se pone el marciano
  setAlien(on) {
    if (on === this.alien) return;
    this.alien = on;
    this.pick();
  }

  pick() {
    const K = this.keepers;
    const k = this.alien ? K.alien : this.teo ? K.teo : K.sub;
    this.keeperName = this.alien ? 'el portero marciano' : this.teo ? 'Teo' : 'el suplente';
    if (this.keeper && this.keeper !== k) k.group.position.copy(this.keeper.group.position);
    for (const o of Object.values(K)) o.group.visible = o === k;
    this.keeper = k;
  }

  reset() {
    this.pos.set(this.place.cx, this.floor, this.place.cz);
    this.vel.set(0, 0, 0);
    this.wait = 0;
  }

  update(dt, player, time, onGoal) {
    const pl = this.place;
    const far = Math.abs(player.pos.x - pl.cx) > 120 || Math.abs(player.pos.z - pl.cz) > 120;
    if (far) return;
    // Portero: Teo y el suplente se pasean bajo los palos; el marciano va a por el balón
    if (this.alien) {
      const b = this.pos;
      this.cheer -= dt;
      // Cada parada la celebra un rato sin moverse
      if (this.cheer <= 0) {
        let aim = pl.cz;
        if (this.wait <= 0 && b.x > pl.cx - 10) aim = this.vel.x > 3 ? b.z + (this.vel.z * (this.kx - b.x)) / this.vel.x : b.z;
        aim = Math.max(pl.cz - SPAN, Math.min(pl.cz + SPAN, aim));
        this.kz += Math.max(-KEEP * dt, Math.min(KEEP * dt, aim - this.kz));
      }
    } else this.kz = pl.cz + Math.sin(time * 1.7) * 4.4;
    this.pose(time);
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.reset();
    }
    const p = this.pos;
    const v = this.vel;
    v.y -= 30 * dt;
    p.addScaledVector(v, dt);
    if (p.y < this.floor) {
      p.y = this.floor;
      if (v.y < -3) v.y *= -0.55;
      else v.y = 0;
      const f = Math.max(0, 1 - 0.55 * dt);
      v.x *= f;
      v.z *= f;
    }
    const r = this.r;
    const inGoalZ = p.z > pl.gz0 + 0.6 && p.z < pl.gz1 - 0.6 && p.y < BASE + 5.2;
    if (this.wait <= 0) {
      if (p.x > pl.goalX + 0.8 && inGoalZ) {
        this.wait = 1.8;
        onGoal('east');
      } else if (p.x < pl.westGoalX - 0.8 && inGoalZ) {
        this.wait = 1.8;
        onGoal('west');
      }
    }
    if (p.x < pl.x0 + r) {
      p.x = pl.x0 + r;
      v.x = Math.abs(v.x) * 0.7;
    } else if (p.x > pl.x1 - r) {
      p.x = pl.x1 - r;
      v.x = -Math.abs(v.x) * 0.7;
    }
    if (p.z < pl.z0 + r) {
      p.z = pl.z0 + r;
      v.z = Math.abs(v.z) * 0.7;
    } else if (p.z > pl.z1 - r) {
      p.z = pl.z1 - r;
      v.z = -Math.abs(v.z) * 0.7;
    }
    // Portero
    let dx = p.x - this.kx;
    let dz = p.z - this.kz;
    let d = Math.hypot(dx, dz);
    const reach = r + (this.alien ? 1.4 : 1.2);
    if (d < reach && p.y < BASE + 6.5 && this.wait <= 0) {
      dx /= d;
      dz /= d;
      const vn = v.x * dx + v.z * dz;
      if (vn < 0) {
        v.x -= 1.8 * vn * dx;
        v.z -= 1.8 * vn * dz;
        this.game.sfx.kick();
        // El marciano no la deja muerta: la despeja a cuatro puños, por encima de ti, y lo celebra
        if (this.alien && vn < -6) {
          v.x = dx * PUNCH;
          v.z = dz * PUNCH;
          v.y = 14;
          this.cheer = CHEER;
          this.game.sfx.boing(2);
        }
      }
      p.x = this.kx + dx * reach;
      p.z = this.kz + dz * reach;
    }
    this.block(player);
    // Patinete
    dx = p.x - player.pos.x;
    dz = p.z - player.pos.z;
    d = Math.hypot(dx, dz);
    if (d < r + 1.3 && player.crashT <= 0 && Math.abs(player.pos.y + 1.5 - p.y) < 3.2) {
      dx /= d || 1;
      dz /= d || 1;
      const pv = player.velocity(_v);
      const app = (pv.x - v.x) * dx + (pv.z - v.z) * dz;
      if (app > 0.5) {
        const sp = Math.hypot(pv.x, pv.z);
        v.x = pv.x * 1.12 + dx * (4 + app * 0.35);
        v.z = pv.z * 1.12 + dz * (4 + app * 0.35);
        v.y = 2 + sp * 0.2;
        this.game.sfx.kick();
      }
      p.x = player.pos.x + dx * (r + 1.3);
      p.z = player.pos.z + dz * (r + 1.3);
    }
    // Ni empujando se le cuela el balón por debajo
    if (this.alien && this.wait <= 0 && p.y < BASE + 6.5) {
      dx = p.x - this.kx;
      dz = p.z - this.kz;
      d = Math.hypot(dx, dz);
      if (d < reach) {
        p.x = this.kx + (dx / d) * reach;
        p.z = this.kz + (dz / d) * reach;
      }
    }
    this.roll(dt);
  }

  // El portero en su sitio: dando saltitos, y el marciano moviendo los cuatro brazos o celebrando la parada
  pose(time) {
    const cheer = this.alien && this.cheer > 0;
    if (this.alien) this.keeper.arms.forEach((a, i) => (a.rotation.z = (i % 2 ? -1 : 1) * (cheer ? 2.7 - (i >> 1) * 0.5 : (i < 2 ? 1.75 : 0.95) + Math.sin(time * 7 + i) * 0.22)));
    this.keeper.group.position.set(this.kx, BASE + 0.1 + (cheer ? Math.abs(Math.sin(time * 13)) * 1.1 : Math.abs(Math.sin(time * 6)) * 0.25), this.kz);
  }

  // Al marciano no se le atropella: con cuatro brazos te para a ti también
  block(player) {
    if (!this.alien || player.crashT > 0 || player.pos.y >= BASE + 5) return;
    const dx = player.pos.x - this.kx;
    const dz = player.pos.z - this.kz;
    const d = Math.hypot(dx, dz);
    if (d < 2.6) player.bump(dx / d, dz / d, 2.6 - d, 0.3);
  }

  // El balón rueda lo que avanza
  roll(dt) {
    const v = this.vel;
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.05) {
      _a.set(v.z / sp, 0, -v.x / sp);
      this.mesh.rotateOnWorldAxis(_a, (sp * dt) / this.r);
    }
    this.mesh.position.copy(this.pos);
  }

  // ---------- En red (ver game/spots.js) ----------
  // ¿Hay algo que contar, o el balón está en el centro y el portero en su sitio?
  get live() {
    const pl = this.place;
    const p = this.pos;
    return this.wait > 0 || Math.abs(p.x - pl.cx) + Math.abs(p.y - this.floor) + Math.abs(p.z - pl.cz) > 0.02 || (this.alien && (this.cheer > 0 || Math.abs(this.kz - pl.cz) > 0.05));
  }

  put(dv, o) {
    const pl = this.place;
    const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 100)));
    dv.setInt16(o, i16(this.pos.x - pl.cx), true);
    dv.setInt16(o + 2, i16(this.pos.y - this.floor), true);
    dv.setInt16(o + 4, i16(this.pos.z - pl.cz), true);
    dv.setInt8(o + 6, Math.max(-127, Math.min(127, Math.round((this.kz - pl.cz) * 40))));
    return o + BALL;
  }

  // El balón entre dos fotos, en `net`. Si de una a otra vuelve al centro, no cruza el campo volando
  get(a, oa, b, ob, k) {
    const pl = this.place;
    const far = Math.abs(b.getInt16(ob, true) - a.getInt16(oa, true)) + Math.abs(b.getInt16(ob + 4, true) - a.getInt16(oa + 4, true)) > 800;
    const mix = (at) => a.getInt16(oa + at, true) + (far ? 0 : (b.getInt16(ob + at, true) - a.getInt16(oa + at, true)) * k);
    this.net.x = pl.cx + mix(0) / 100;
    this.net.y = this.floor + mix(2) / 100;
    this.net.z = pl.cz + mix(4) / 100;
    this.net.kz = pl.cz + (a.getInt8(oa + 6) + (b.getInt8(ob + 6) - a.getInt8(oa + 6)) * k) / 40;
  }

  // En el centro y con el portero en su sitio: lo que hay cuando no llega nada que contar
  home() {
    this.net.x = this.place.cx;
    this.net.y = this.floor;
    this.net.z = this.place.cz;
    this.net.kz = this.place.cz;
  }

  // El balón que lleva el juego de otro: donde dice, con la velocidad que se le ve. cheer: el
  // portero marciano celebra una parada
  paint(dt, player, time, cheer) {
    const pl = this.place;
    const n = this.net;
    this.cheer = cheer ? 1 : 0;
    this.wait = 0;
    this.kz = this.alien ? n.kz : pl.cz + Math.sin(time * 1.7) * 4.4;
    this.pose(time);
    this.block(player);
    this.vel.set(speed(n.x, this.pos.x, dt), speed(n.y, this.pos.y, dt), speed(n.z, this.pos.z, dt));
    this.pos.set(n.x, n.y, n.z);
    this.roll(dt);
  }

  touch(player, push) {
    const dx = this.pos.x - player.pos.x;
    const dz = this.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    const reach = this.r + 1.3;
    if (d >= reach || player.crashT > 0 || Math.abs(player.pos.y + 1.5 - this.pos.y) >= 3.2) return false;
    if (push) player.bump(-dx / (d || 1), -dz / (d || 1), reach - d, 0.5);
    return true;
  }
}
