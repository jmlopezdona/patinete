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
    this.game.sfx.tone(520 + Math.random() * 200, 0.12, 'triangle', 0.25, 0.5);
    this.game.sfx.noise(0.05, 0.3, 2400, 4);
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
      _a.set(p.dz, 0, -p.dx);
      _q.setFromAxisAngle(_a, p.tilt);
      p.mesh.quaternion.copy(_q);
      p.mesh.position.set(p.x, this.y + Math.sin(p.tilt) * 1.05 * PIN_S, p.z);
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
        this.pins.push({ fig, x0, z0, x: x0, y: 0, z: z0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, heading: 0, walk: n * 1.7, slow: 0.1 + (n % 3) * 0.07, side: n % 2 ? 1 : -1, seen: 0, down: false, gone: false });
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
      a.rot = a.seen = 0;
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

  // Revienta en ladrillos al caer
  pop(a) {
    const g = this.game;
    g.bits.burst(a.x, this.y + 1.5, a.z, [SKIN, 0xb6ff5a, C.white, C.red], 16, 10, this.y);
    g.studs.burst(a.x, this.y + 1, a.z, 2, 0, this.y, 7);
    g.sfx.alienPop();
    a.gone = true;
    a.fig.group.visible = false;
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
      const laugh = this.laugh > 0 && !run;
      const hop = laugh ? Math.abs(Math.sin(time * 9 + a.walk)) * 0.7 : run ? Math.abs(Math.sin(a.walk)) * 0.25 : 0;
      f.legL.rotation.x = moving ? Math.sin(a.walk) * 0.6 : 0;
      f.legR.rotation.x = -f.legL.rotation.x;
      f.armL.rotation.x = f.armR.rotation.x = run || laugh ? -2.8 : 0;
      f.group.position.set(a.x, this.y + hop, a.z);
      f.group.rotation.set(0, run ? Math.atan2(wx, wz) : Math.atan2(-dx, -dz), 0);
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
    let hop = Math.abs(Math.sin(time * 6)) * 0.25;
    if (this.alien) {
      const b = this.pos;
      this.cheer -= dt;
      const cheer = this.cheer > 0;
      // Cada parada la celebra un rato sin moverse
      if (!cheer) {
        let aim = pl.cz;
        if (this.wait <= 0 && b.x > pl.cx - 10) aim = this.vel.x > 3 ? b.z + (this.vel.z * (this.kx - b.x)) / this.vel.x : b.z;
        aim = Math.max(pl.cz - SPAN, Math.min(pl.cz + SPAN, aim));
        this.kz += Math.max(-KEEP * dt, Math.min(KEEP * dt, aim - this.kz));
      } else hop = Math.abs(Math.sin(time * 13)) * 1.1;
      this.keeper.arms.forEach((a, i) => (a.rotation.z = (i % 2 ? -1 : 1) * (cheer ? 2.7 - (i >> 1) * 0.5 : (i < 2 ? 1.75 : 0.95) + Math.sin(time * 7 + i) * 0.22)));
    } else this.kz = pl.cz + Math.sin(time * 1.7) * 4.4;
    this.keeper.group.position.set(this.kx, BASE + 0.1 + hop, this.kz);
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
    // Al marciano no se le atropella: con cuatro brazos te para a ti también
    if (this.alien && player.crashT <= 0 && player.pos.y < BASE + 5) {
      dx = player.pos.x - this.kx;
      dz = player.pos.z - this.kz;
      d = Math.hypot(dx, dz);
      if (d < 2.6) player.bump(dx / d, dz / d, 2.6 - d, 0.3);
    }
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
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.05) {
      _a.set(v.z / sp, 0, -v.x / sp);
      this.mesh.rotateOnWorldAxis(_a, (sp * dt) / r);
    }
    this.mesh.position.copy(p);
  }
}
