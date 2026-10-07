import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { addPin, ballGeometry } from '../lego/models.js';
import { createMinifig, nameTag } from '../lego/minifig.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { BASE } from '../world/city.js';

const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _v = new THREE.Vector3();
const PIN_S = 1.12;

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
      p.mesh.visible = true;
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

// Balón de fútbol con portero.
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
    // Teo, el portero: rubio y con gafas. Si Teo sale a pasear, para un suplente.
    const teo = createMinifig({ torso: C.lime, arms: C.lime, legs: C.black, hair: 'hair', hairColor: 0xf0d27a, face: 'glasses', print: 'star', printColor: '#1b1d21' });
    teo.group.scale.setScalar(0.9);
    const tag = nameTag('Teo', '#a5ca18');
    tag.position.y = 6.9;
    teo.group.add(tag);
    const sub = createMinifig({ torso: C.orange, arms: C.orange, legs: C.black, hair: 'cap', hairColor: C.black, face: 'cool', print: 'star', printColor: '#1b1d21' });
    this.keepers = { teo, sub };
    for (const k of [teo, sub]) {
      k.group.rotation.y = -Math.PI / 2;
      k.armL.rotation.z = 1.3;
      k.armR.rotation.z = -1.3;
      game.scene.add(k.group);
    }
    this.setKeeper(true);
    this.kz = place.cz;
    this.kx = place.goalX - 1.6;
    this.reset();
  }

  setKeeper(teo) {
    this.keeperName = teo ? 'Teo' : 'el suplente';
    this.keeper = teo ? this.keepers.teo : this.keepers.sub;
    this.keepers.teo.group.visible = teo;
    this.keepers.sub.group.visible = !teo;
    this.keeper.group.position.copy((teo ? this.keepers.sub : this.keepers.teo).group.position);
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
    // Portero
    this.kz = pl.cz + Math.sin(time * 1.7) * 4.4;
    this.keeper.group.position.set(this.kx, BASE + 0.1 + Math.abs(Math.sin(time * 6)) * 0.25, this.kz);
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
    if (d < r + 1.2 && p.y < BASE + 6.5 && this.wait <= 0) {
      dx /= d;
      dz /= d;
      const vn = v.x * dx + v.z * dz;
      if (vn < 0) {
        v.x -= 1.8 * vn * dx;
        v.z -= 1.8 * vn * dz;
        this.game.sfx.kick();
      }
      p.x = this.kx + dx * (r + 1.2);
      p.z = this.kz + dz * (r + 1.2);
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
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.05) {
      _a.set(v.z / sp, 0, -v.x / sp);
      this.mesh.rotateOnWorldAxis(_a, (sp * dt) / r);
    }
    this.mesh.position.copy(p);
  }
}
