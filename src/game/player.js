import * as THREE from 'three';
import { createMinifig } from '../lego/minifig.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { clamp, damp, angDiff } from '../core/rng.js';
import { CHARACTERS, COLORS, characterById } from './characters.js';
import { lift, grade } from '../world/relief.js';

const G = 42;
const V_REV = 9;
const BRAKE = 40;
const STEP = 1.0;
const TAU = Math.PI * 2;
// Cuestas del pueblo: la gravedad tira un poco más de la cuenta para que se noten (HILL), cuesta
// arriba se pierde velocidad punta (HILL_SLOW) y, por empinada que sea la calle, empuja como
// mucho como una del 18 % (HILL_MAX), para que siempre se pueda subir
const HILL = 0.6;
const HILL_SLOW = 2.5;
const HILL_MAX = 0.18;


export class Player {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.v = 0;
    this.gvy = 0;
    this.pitch = 0;
    this.grade = 0; // pendiente del terreno en el sentido de la marcha
    this.ramp = 0; // pendiente de la rampa u obstáculo que se pisa
    this.grounded = true;
    this.groundPrim = null;
    this.airTime = 0;
    this.spin = 0;
    this.flip = 0;
    this.flipDir = 0;
    this.spinAbs = 0;
    this.flipAbs = 0;
    this.whips = 0;
    this.whipT = 0;
    this.grindTime = 0;
    this.grind = null;
    this.launchY = 0;
    this.maxY = 0;
    this.boost = 1;
    this.boosting = false;
    this.crashT = 0;
    this.sunk = false;
    this.invuln = 0;
    this.frozen = false;
    this.held = false; // en manos del rayo abductor: la posición la mueve el platillo
    this.hidden = false;
    this.dropped = false; // caída desde el platillo: no cuenta como truco
    this.respawnAt = null; // dónde reaparecer tras el próximo castañazo (castigado a casa)
    this.safe = { x: 0, z: 0, heading: 0 };
    this.safeT = 0;
    this.free = { x: 0, z: 0 };
    this.bumpCd = 0;
    this.time = 0;
    this.colorIdx = 0;
    this.char = CHARACTERS[0];
    this.stats = this.char.stats;
    this.doorVis = 0;

    // Jerarquía visual
    this.root = new THREE.Group();
    this.slope = new THREE.Group();
    this.flipPivot = new THREE.Group();
    this.flipPivot.position.y = 2.2;
    this.model = new THREE.Group();
    this.model.position.y = -2.2;
    this.scooterPivot = new THREE.Group();
    this.root.add(this.slope);
    this.slope.add(this.flipPivot);
    this.flipPivot.add(this.model);
    this.model.add(this.scooterPivot);

    // Cajas de pizza para el reparto
    const pb = new Builder();
    for (let i = 0; i < 3; i++) {
      pb.box(1.9, 0.32, 1.9, 0, 0.16 + i * 0.36, 0, i % 2 ? C.white : C.red, { r: 0.04 });
    }
    this.pizza = pb.mesh(plastic);
    this.pizza.visible = false;
    this.model.add(this.pizza);
    this.setCharacter(this.char.id);

    this.visY = 0;
    this.visYaw = 0;
    this.visPitch = 0;
    this.visRoll = 0;
    this.visFlip = 0;
    this.steerVis = 0;
    this.kick = 0;
    this.squash = 0;
  }

  // Cambia de personaje: piloto, vehículo y forma de moverse
  setCharacter(id, colorIdx) {
    const ch = (this.char = characterById(id));
    this.stats = ch.stats;
    if (this.rider) {
      this.model.remove(this.rider.group);
      this.rider.group.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    this.rider = createMinifig(ch.look);
    this.rider.group.scale.setScalar(ch.scale);
    this.rider.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.model.add(this.rider.group);
    this.colorIdx = (colorIdx ?? ch.color) % COLORS.length;
    this.buildVehicle();
    this.kick = 0;
    this.doorVis = 0;
    this.stance = 1;
  }

  buildVehicle() {
    if (this.veh) {
      for (const b of this.veh.boots || []) {
        b.removeFromParent();
        b.geometry.dispose();
      }
      this.scooterPivot.remove(this.veh.group);
      this.veh.group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        if (o.material.map) {
          o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    const v = (this.veh = this.char.build(COLORS[this.colorIdx]));
    this.scooterPivot.position.z = v.steerZ;
    this.scooterPivot.rotation.y = 0;
    v.group.position.z = -v.steerZ + (v.shift || 0);
    this.scooterPivot.add(v.group);
    if (v.wear) v.wear(this.rider);
    this.pizza.position.set(...v.cargo);
  }

  nextColor() {
    this.colorIdx = (this.colorIdx + 1) % COLORS.length;
    this.buildVehicle();
  }

  place(x, z, heading) {
    this.pos.set(x, this.terrain.height(x, z), z);
    this.heading = heading;
    this.v = 0;
    this.gvy = 0;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.grind = null;
    this.spin = this.flip = this.visYaw = this.visFlip = 0;
    this.crashT = 0;
    this.sunk = false;
    this.held = false;
    this.hidden = false;
    this.respawnAt = null;
    this.model.visible = true;
    this.visY = this.pos.y;
    this.safe = { x, z, heading };
    this.free = { x, z };
  }

  get speed() {
    return this.grounded ? Math.abs(this.v) : this.grind ? this.grind.speed : Math.hypot(this.vel.x, this.vel.z);
  }

  // Velocidad horizontal actual (para empujar balones, bolos...)
  velocity(out) {
    if (this.grounded && !this.grind) {
      const c = Math.cos(this.pitch) * this.v;
      return out.set(Math.sin(this.heading) * c, 0, Math.cos(this.heading) * c);
    }
    return out.copy(this.vel);
  }

  update(dt, inp) {
    this.time += dt;
    this.bumpCd -= dt;
    this.invuln -= dt;
    if (this.crashT > 0) {
      this.crashT -= dt;
      if (this.crashT <= 0) this.recover();
      this.updateVisual(dt, inp);
      return;
    }
    if (this.held) {
      this.updateVisual(dt, this.game.input.neutral);
      return;
    }
    if (this.frozen) inp = this.game.input.neutral;
    this.boost = Math.min(1, this.boost + dt * 0.035);
    this.jumpReq = inp.jumpPressed;
    if (this.whipT > 0) this.whipT -= dt;
    if (inp.trickPressed && !this.grounded && !this.grind && this.airTime > 0.08 && this.whipT <= 0) {
      this.whipT = 0.45;
      this.whips++;
      this.game.sfx.whoosh();
    }
    const sp = Math.max(Math.abs(this.v), this.vel.length());
    const n = clamp(Math.ceil((sp * dt) / 0.25), 1, 14);
    const h = dt / n;
    for (let i = 0; i < n && this.crashT <= 0; i++) {
      if (this.grind) this.stepGrind(h, inp);
      else if (this.grounded) this.stepGround(h, inp);
      else this.stepAir(h, inp);
    }
    if (this.pos.y < -1.7 && this.crashT <= 0) this.splash();
    // Posición segura para reaparecer
    this.safeT -= dt;
    if (this.safeT <= 0 && this.grounded && this.crashT <= 0) {
      this.safeT = 0.4;
      if (this.pos.y < 1.2 && this.terrain.height(this.pos.x + 3, this.pos.z) > -1 && this.terrain.height(this.pos.x - 3, this.pos.z) > -1) {
        this.safe = { x: this.pos.x, z: this.pos.z, heading: this.heading };
      }
    }
    this.updateVisual(dt, inp);
  }

  // ¿Hay un escalón (discontinuidad de altura) entre dos puntos? Se busca por bisección:
  // en una rampa el desnivel se reduce al acortar el tramo; en un escalón, no.
  hasStep(x0, z0, h0, x1, z1, h1) {
    const T = this.terrain;
    const len = Math.hypot(x1 - x0, z1 - z0);
    let a = 0;
    let b = 1;
    let ha = h0;
    let hb = h1;
    for (let i = 0; i < 7; i++) {
      const d = Math.abs(hb - ha);
      if (d < 0.03) return false;
      if (d > 0.03 + (b - a) * len * 4.5) return true;
      const m = (a + b) / 2;
      const hm = T.height(x0 + (x1 - x0) * m, z0 + (z1 - z0) * m);
      if (Math.abs(hm - ha) > Math.abs(hb - hm)) {
        b = m;
        hb = hm;
      } else {
        a = m;
        ha = hm;
      }
    }
    return Math.abs(hb - ha) > 0.03 + (b - a) * len * 4.5;
  }

  // Pendiente a lo largo de la dirección de marcha (rampas más relieve), ignorando escalones
  slopeAt(x, z, fx, fz) {
    const T = this.terrain;
    const e = 0.3;
    const h0 = T.height(x, z);
    let sum = 0;
    let cnt = 0;
    const hf = T.height(x + fx * e, z + fz * e);
    if (!this.hasStep(x, z, h0, x + fx * e, z + fz * e, hf)) {
      sum += (hf - h0) / e;
      cnt++;
    }
    const hb = T.height(x - fx * e, z - fz * e);
    if (!this.hasStep(x, z, h0, x - fx * e, z - fz * e, hb)) {
      sum += (h0 - hb) / e;
      cnt++;
    }
    lift(x, z);
    this.grade = grade.x * fx + grade.z * fz;
    this.ramp = cnt ? sum / cnt : 0;
    return Math.atan(this.ramp + this.grade);
  }

  stepGround(h, inp) {
    const T = this.terrain;
    const x = this.pos.x;
    const z = this.pos.z;
    let y = this.pos.y;
    const h0 = T.height(x, z);
    const prim0 = T.hit;
    if (h0 - y > STEP + 0.2) {
      // Dentro de un obstáculo (empujado por algo): volver al último sitio libre
      this.pos.x = this.free.x;
      this.pos.z = this.free.z;
      this.pos.y = T.height(this.free.x, this.free.z);
      this.v *= 0.3;
      return;
    }
    if (y - h0 > 0.5) {
      const c = Math.cos(this.pitch) * this.v;
      this.launch(Math.sin(this.heading) * c, 0, Math.cos(this.heading) * c, null);
      return;
    }
    y = h0;
    this.free.x = x;
    this.free.z = z;

    // Acelerador, freno y turbo
    // Agotado, el turbo no vuelve a entrar hasta que se recarga un poco: si no, con la tecla
    // pulsada entraría y saldría a cada instante, petardeando
    const boosting = inp.boost && inp.throttle >= 0 && this.boost > (this.boosting ? 0.02 : 0.15);
    if (boosting && !this.boosting) this.game.sfx.boost();
    this.boosting = boosting;
    const S = this.stats;
    const maxV = (boosting ? S.vboost : S.vmax) * (1 - clamp(this.grade * HILL_SLOW, 0, 0.3));
    if (boosting) this.boost = Math.max(0, this.boost - h / 3.6);
    if (inp.throttle > 0 || boosting) {
      // En rampas empinadas el empuje casi desaparece: manda la inercia
      const grip = Math.max(0.12, Math.cos(Math.min(Math.PI / 2, Math.abs(this.pitch) * 2.2)));
      const a = (boosting ? S.acc * 1.9 : S.acc * inp.throttle) * grip;
      if (this.v < maxV) this.v = Math.min(maxV, this.v + a * h);
      else this.v -= (this.v - maxV) * 1.2 * h;
    } else if (inp.throttle < 0) {
      if (this.v > 0.5) this.v = Math.max(0, this.v - BRAKE * h);
      else this.v = Math.max(-V_REV, this.v - 12 * h);
    } else {
      const f = (2.0 + Math.abs(this.v) * 0.1) * h;
      this.v = Math.abs(this.v) <= f ? 0 : this.v - Math.sign(this.v) * f;
      if (this.grade < 0 && this.v > S.vmax) this.v -= (this.v - S.vmax) * 1.2 * h; // cuesta abajo, sin desbocarse
    }
    const sp = Math.abs(this.v);
    const turn = S.turn * Math.min(1, 0.3 + sp / 9) * (1 - 0.36 * Math.min(1, sp / S.vboost));
    this.heading -= inp.steer * turn * h * (this.v < -0.5 ? -1 : 1);
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);

    const pitch = this.slopeAt(x, z, fx, fz);
    const cp = Math.cos(pitch);
    this.pitch = pitch;
    const hill = clamp(this.grade, -HILL_MAX, HILL_MAX);
    this.v -= G * (Math.sin(Math.atan(this.ramp + hill)) + HILL * hill) * h;
    // Parado en una calle en cuesta se aguanta con el pie: no se va solo
    if (hill !== 0 && this.ramp === 0 && inp.throttle === 0 && !boosting && Math.abs(this.v) < 0.5) this.v = 0;

    // Si rueda marcha atrás cuesta abajo, se da la vuelta solo
    if (this.v < -2.5 && inp.throttle >= 0 && Math.abs(pitch) > (this.ramp === 0 ? 0.03 : 0.12)) {
      this.heading += Math.PI;
      this.visYaw -= Math.PI;
      this.v = -this.v;
      this.pitch = -pitch;
      this.gvy = -this.gvy;
      return;
    }

    // Velocidad vertical real: la pendiente del tramo que acabamos de recorrer
    const spd = Math.abs(this.v);
    const sg = this.v >= 0 ? 1 : -1;
    const bkx = x - fx * sg * 0.25;
    const bkz = z - fz * sg * 0.25;
    const hbk = T.height(bkx, bkz);
    const primB = T.hit;
    const aB = this.hasStep(x, z, y, bkx, bkz, hbk) ? 0 : Math.atan((y - hbk) / 0.25);
    const vyB = spd * Math.sin(aB);
    const hsB = spd * Math.cos(aB) * sg;

    if (this.jumpReq) {
      this.jumpReq = false;
      this.game.sfx.jump();
      this.squash = 1;
      this.launch(fx * hsB, Math.max(0, vyB) + S.jump, fz * hsB, null);
      return;
    }

    const dx = fx * this.v * cp * h;
    const dz = fz * this.v * cp * h;
    let nx = x + dx;
    let nz = z + dz;
    let hn = T.height(nx, nz);
    let prim = T.hit;

    if (hn - y > STEP) {
      // Pared: intentar deslizar a lo largo
      const hx = T.height(nx, z);
      const hz = T.height(x, nz);
      const okx = hx - y <= STEP;
      const okz = hz - y <= STEP;
      const tot = Math.abs(dx) + Math.abs(dz) + 1e-6;
      let lost = 1;
      if (okx && (!okz || Math.abs(dx) > Math.abs(dz))) {
        nz = z;
        hn = hx;
        lost = Math.abs(dz) / tot;
      } else if (okz) {
        nx = x;
        hn = hz;
        lost = Math.abs(dx) / tot;
      } else {
        nx = x;
        nz = z;
        hn = y;
      }
      if (lost > 0.72) {
        if (sp > S.vmax + 6 && this.invuln <= 0) {
          this.crash();
          return;
        }
        if (sp > 6) this.game.onBump(sp);
        this.v = -this.v * 0.28;
        nx = x;
        nz = z;
        hn = y;
      } else {
        this.v *= 1 - Math.min(0.9, lost * 5 * h);
        const target = Math.atan2((nx - x) * Math.sign(this.v || 1), (nz - z) * Math.sign(this.v || 1));
        if (nx !== x || nz !== z) this.heading += angDiff(this.heading, target) * Math.min(1, 7 * h);
      }
      this.pos.set(nx, Math.abs(hn - y) <= STEP ? hn : y, nz);
      this.gvy = 0;
      return;
    }

    if (this.hasStep(x, z, y, nx, nz, hn)) {
      if (hn > y - 0.6) {
        // Bordillo: se sube o se baja sin salir despedido
        this.pos.set(nx, hn, nz);
        this.gvy = 0;
        this.groundPrim = prim;
      } else {
        this.pos.set(nx, y, nz);
        this.launch(fx * hsB, Math.max(0, vyB), fz * hsB, null);
      }
      return;
    }
    // Ajuste para que lo recorrido sobre la rampa sea exactamente v·h (longitud de arco)
    const dd = Math.hypot(dx, dz);
    if (dd > 1e-5 && Math.abs(hn - y) > 0.004) {
      const k = (spd * h) / Math.hypot(dd, hn - y);
      const ax = x + dx * k;
      const az = z + dz * k;
      const ah = T.height(ax, az);
      const ap = T.hit;
      if (ah - y <= STEP && !this.hasStep(x, z, y, ax, az, ah)) {
        nx = ax;
        nz = az;
        hn = ah;
        prim = ap;
      }
    }
    const yb = y + vyB * h - 0.5 * G * h * h;
    if (hn < yb - 0.03) {
      // Despegue: el suelo se aleja más rápido de lo que cae el patinete
      this.pos.set(nx, yb, nz);
      this.launch(fx * hsB, vyB, fz * hsB, primB || prim0, x, z);
    } else {
      this.pos.set(nx, hn, nz);
      this.groundPrim = prim;
    }
  }

  launch(vx, vy, vz, prim, x0 = 0, z0 = 0, keep = false) {
    this.grounded = false;
    this.airTime = 0;
    this.vel.set(vx, vy, vz);
    if (!keep) {
      this.spin = 0;
      this.flip = 0;
      this.spinAbs = 0;
      this.flipAbs = 0;
      this.whips = 0;
      this.grindTime = 0;
      this.launchY = this.pos.y;
      this.maxY = this.pos.y;
    }
    this.flipDir = 0;
    // Aire vertical: en quarter pipes y bowls se vuelve a caer dentro de la rampa
    if (prim && prim.vert && vy > 7) {
      let ux;
      let uz;
      if (prim.type === 'bowl') {
        const d = Math.hypot(x0 - prim.cx, z0 - prim.cz) || 1;
        ux = (x0 - prim.cx) / d;
        uz = (z0 - prim.cz) / d;
      } else {
        ux = prim.sin;
        uz = prim.cos;
      }
      const a = vx * ux + vz * uz;
      if (a > 0 && vy > a * 0.85) {
        const back = Math.max(1.1, vy * 0.075);
        this.vel.x = vx - (a + back) * ux;
        this.vel.z = vz - (a + back) * uz;
        this.vel.y = Math.hypot(vy, a);
        const fx = Math.sin(this.heading);
        const fz = Math.cos(this.heading);
        const af = fx * ux + fz * uz;
        const nh = Math.atan2(fx - 2 * af * ux, fz - 2 * af * uz);
        this.visYaw += angDiff(nh, this.heading);
        this.heading = nh;
        this.vertAir = true;
      }
    }
  }

  stepAir(h, inp) {
    const T = this.terrain;
    this.airTime += h;
    if (this.airTime > 0.12) {
      const ds = -inp.steer * this.stats.spin * h;
      this.spin += ds;
      this.spinAbs += Math.abs(ds);
      if (inp.downPressed) this.flipDir = 1;
      if (inp.upPressed) this.flipDir = -1;
      if ((this.flipDir > 0 && inp.throttle >= 0) || (this.flipDir < 0 && inp.throttle <= 0)) this.flipDir = 0;
      if (this.flipDir) {
        this.flip += this.flipDir * 7.4 * h;
        this.flipAbs += 7.4 * h;
      }
    } else if (this.jumpReq) {
      // Margen de cortesía para saltar justo al salir de un borde
      this.jumpReq = false;
      if (this.vel.y < this.stats.jump * 0.6) {
        this.vel.y = this.stats.jump;
        this.game.sfx.jump();
      }
    }
    this.vel.y -= G * h;
    const x = this.pos.x;
    const y = this.pos.y;
    const z = this.pos.z;
    const nx = x + this.vel.x * h;
    const nz = z + this.vel.z * h;
    const ny = y + this.vel.y * h;
    const hn = T.height(nx, nz);
    if (ny <= hn) {
      if (hn - y > 0.7) {
        // Choque lateral en el aire
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 8) this.game.onBump(sp);
        this.vel.x *= -0.25;
        this.vel.z *= -0.25;
        const h0 = T.height(x, z);
        if (ny <= h0) {
          this.pos.y = h0;
          this.land();
        } else this.pos.y = ny;
      } else {
        this.pos.set(nx, hn, nz);
        this.land();
      }
    } else {
      this.pos.set(nx, ny, nz);
      if (ny > this.maxY) this.maxY = ny;
      if (this.vel.y < 4 && this.airTime > 0.12) this.tryGrind();
    }
  }

  land() {
    const T = this.terrain;
    T.height(this.pos.x, this.pos.z);
    this.groundPrim = T.hit;
    this.grounded = true;
    this.vertAir = false;
    const air = this.airTime;
    const spinTotal = this.spinAbs;
    let sketchy = false;
    // Los giros en el aire pasan a ser la nueva dirección
    this.heading += this.spin;
    this.spin = 0;
    const rem = angDiff(0, this.flip);
    const crashed = Math.abs(rem) > 1.25;
    this.visFlip = rem;
    const flips = Math.round(this.flip / TAU);
    this.flip = 0;
    this.flipDir = 0;

    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let pitch = this.slopeAt(this.pos.x, this.pos.z, fx, fz);
    let v = (this.vel.x * fx + this.vel.z * fz) * Math.cos(pitch) + this.vel.y * Math.sin(pitch);
    const vh = Math.hypot(this.vel.x, this.vel.z);
    if (vh > 5) {
      const cosA = (this.vel.x * fx + this.vel.z * fz) / vh;
      if (cosA < -0.5) {
        // Aterrizaje de espaldas: se revierte
        this.heading += Math.PI;
        this.visYaw -= Math.PI;
        v = -v;
        pitch = -pitch;
      } else if (cosA < 0.5) {
        sketchy = true;
        const nh = Math.atan2(this.vel.x, this.vel.z);
        this.visYaw += angDiff(nh, this.heading);
        this.heading = nh;
        fx = Math.sin(nh);
        fz = Math.cos(nh);
        pitch = this.slopeAt(this.pos.x, this.pos.z, fx, fz);
        v = vh * 0.6;
      }
    }
    if (this.whipT > 0.18) sketchy = true;
    this.whipT = 0;
    const impact = -this.vel.y;
    this.v = clamp(v, -this.stats.vboost, this.stats.vboost * 1.25);
    this.pitch = pitch;
    this.gvy = this.v * Math.sin(pitch);
    this.visYaw = angDiff(0, this.visYaw);
    if (air > 0.22) {
      this.squash = Math.min(1, impact / 22);
      this.game.onLand({
        air,
        impact,
        spins: Math.round(spinTotal / Math.PI),
        flips,
        whips: this.whips,
        grind: this.grindTime,
        height: this.maxY - Math.min(this.launchY, this.pos.y),
        sketchy,
        crashed,
        dropped: this.dropped,
      });
    }
    this.dropped = false;
    this.whips = 0;
    this.grindTime = 0;
    this.spinAbs = 0;
    if (crashed && this.invuln <= 0) this.crash();
  }

  tryGrind() {
    const p = this.pos;
    for (const r of this.terrain.rails) {
      const abx = r.bx - r.ax;
      const abz = r.bz - r.az;
      const t = ((p.x - r.ax) * abx + (p.z - r.az) * abz) / (r.len * r.len);
      if (t < 0.02 || t > 0.98) continue;
      const px = r.ax + abx * t;
      const pz = r.az + abz * t;
      const ry = r.ya + (r.yb - r.ya) * t;
      if (p.y < ry - 0.5 || p.y > ry + 0.9) continue;
      if (Math.hypot(p.x - px, p.z - pz) > 1.25) continue;
      const dx = abx / r.len;
      const dz = abz / r.len;
      const along = this.vel.x * dx + this.vel.z * dz;
      if (Math.abs(along) < 4) continue;
      const dir = Math.sign(along);
      this.grind = { r, t, dir, speed: Math.max(Math.abs(along), 13), dx: dx * dir, dz: dz * dir, spark: 0 };
      const vis = this.heading + this.visYaw + this.spin;
      this.heading = Math.atan2(dx * dir, dz * dir);
      this.spin = 0;
      this.visYaw = angDiff(this.heading, vis);
      this.pos.set(px, ry, pz);
      this.vel.set(0, 0, 0);
      this.game.sfx.grindStart();
      return true;
    }
    return false;
  }

  stepGrind(h, inp) {
    const g = this.grind;
    const r = g.r;
    g.speed = Math.max(9, g.speed - 2.5 * h + (inp.throttle > 0 ? 3 * h : 0));
    g.t += (g.dir * g.speed * h) / r.len;
    this.grindTime += h;
    this.airTime += h;
    const t = clamp(g.t, 0, 1);
    this.pos.set(r.ax + (r.bx - r.ax) * t, r.ya + (r.yb - r.ya) * t, r.az + (r.bz - r.az) * t);
    g.spark -= h;
    if (g.spark <= 0) {
      g.spark = 0.025;
      this.game.bits.spawn(this.pos.x, this.pos.y + 0.1, this.pos.z, -g.dx * 6 + (Math.random() - 0.5) * 8, 4 + Math.random() * 6, -g.dz * 6 + (Math.random() - 0.5) * 8, Math.random() < 0.5 ? 0xffe066 : 0xfe8a18, 0.28, 0.45, this.pos.y - 3);
    }
    if (this.jumpReq) {
      this.jumpReq = false;
      this.grind = null;
      this.game.sfx.jump();
      this.launch(g.dx * g.speed, this.stats.jump * 0.92, g.dz * g.speed, null, 0, 0, true);
    } else if (g.t <= 0 || g.t >= 1) {
      this.grind = null;
      this.launch(g.dx * g.speed, 3.5, g.dz * g.speed, null, 0, 0, true);
    }
    if (!this.grind) this.game.sfx.grindStop();
  }

  // Empujón externo (coches, peatones...)
  bump(nx, nz, push, slow = 0.5) {
    this.pos.x += nx * push;
    this.pos.z += nz * push;
    if (this.grounded) {
      const into = -(Math.sin(this.heading) * nx + Math.cos(this.heading) * nz) * Math.sign(this.v || 1);
      if (into > 0.2) this.v *= slow;
    } else {
      this.vel.x = this.vel.x * slow + nx * 6;
      this.vel.z = this.vel.z * slow + nz * 6;
    }
  }

  crash() {
    if (this.crashT > 0) return;
    this.crashT = 1.25;
    this.sunk = false;
    this.grind = null;
    const cols = [...this.rider.colors, COLORS[this.colorIdx], C.white, C.lgray, C.black];
    const vx = this.grounded ? Math.sin(this.heading) * this.v * 0.4 : this.vel.x * 0.5;
    const vz = this.grounded ? Math.cos(this.heading) * this.v * 0.4 : this.vel.z * 0.5;
    this.game.bits.burst(this.pos.x, this.pos.y + 2, this.pos.z, cols, 34, 13, this.terrain.height(this.pos.x, this.pos.z), 1, vx, vz);
    this.model.visible = false;
    this.v = 0;
    this.vel.set(0, 0, 0);
    this.game.onCrash();
  }

  splash() {
    this.crashT = 1.0;
    this.sunk = true;
    this.grind = null;
    this.game.bits.burst(this.pos.x, -1.2, this.pos.z, [0x7fc8f2, 0xffffff, C.water], 40, 14, -1.4, 0.8);
    this.model.visible = false;
    this.v = 0;
    this.vel.set(0, 0, 0);
    this.game.onSplash();
  }

  recover() {
    const T = this.terrain;
    let x = this.pos.x;
    let z = this.pos.z;
    if (this.respawnAt) {
      ({ x, z } = this.respawnAt);
      this.heading = this.respawnAt.heading;
      this.respawnAt = null;
    } else if (this.sunk || T.height(x, z) < -1) {
      x = this.safe.x;
      z = this.safe.z;
      this.heading = this.safe.heading;
    }
    this.pos.set(x, T.height(x, z), z);
    this.grounded = true;
    this.v = 0;
    this.gvy = 0;
    this.vel.set(0, 0, 0);
    this.spin = this.flip = this.visYaw = this.visFlip = 0;
    this.sunk = false;
    this.model.visible = true;
    this.invuln = 1.6;
    this.visY = this.pos.y;
    this.game.camera3.snap = true;
  }

  updateVisual(dt, inp) {
    const air = !this.grounded || this.grind;
    this.visY = air ? this.pos.y : damp(this.visY, this.pos.y, 30, dt);
    if (Math.abs(this.visY - this.pos.y) > 1.5) this.visY = this.pos.y;
    this.root.position.set(this.pos.x, this.visY, this.pos.z);
    this.visYaw = damp(this.visYaw, this.grind ? Math.PI / 2 : 0, this.grind ? 12 : 5.5, dt);
    this.root.rotation.y = this.heading + this.visYaw + this.spin;

    let tp = this.pitch;
    if (air && !this.grind) tp = clamp(Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z) + 6) * 0.45, -0.5, 0.5);
    if (this.grind) tp = 0;
    this.visPitch = damp(this.visPitch, tp, air ? 6 : 16, dt);
    const lean = air ? 0 : inp.steer * Math.min(1, Math.abs(this.v) / 18) * 0.3 * this.veh.lean;
    this.visRoll = damp(this.visRoll, lean, 8, dt);
    this.slope.rotation.x = -this.visPitch;
    this.slope.rotation.z = this.visRoll;
    this.visFlip = this.grounded ? damp(this.visFlip, 0, 10, dt) : 0;
    this.flipPivot.rotation.x = -(this.flip + this.visFlip);

    this.steerVis = damp(this.steerVis, -inp.steer * 0.5, 10, dt);
    const v = this.veh;
    const kind = v.kind;
    const k = this.char.scale;
    let whip = 0;
    if (this.whipT > 0) whip = (1 - this.whipT / 0.45) * TAU;
    const roll = ((this.grounded ? this.v : this.speed) * dt) / v.wheelR;
    const r = this.rider;
    this.squash = damp(this.squash, 0, 7, dt);
    const hop = whip && kind !== 'car' ? Math.sin((whip / TAU) * Math.PI) * 0.9 : 0;
    const driving = this.grounded && !this.grind && (inp.throttle > 0 || this.boosting);
    this.scooterPivot.rotation.y = kind === 'car' || kind === 'skate' ? 0 : whip;
    r.armL.rotation.z = r.armR.rotation.z = this.steerVis * 0.25;
    r.head.rotation.y = -inp.steer * 0.35;
    r.group.rotation.z = this.visRoll * 0.5;

    if (kind === 'scooter') {
      v.steer.rotation.y = this.steerVis - whip;
      v.front.rotation.y = this.steerVis * 0.6;
      v.rear.rotation.x += roll;
      v.front.rotation.x += roll;
      // Empujones con el pie mientras coge velocidad
      const pushing = driving && inp.throttle > 0 && this.v < 20 && this.v > -1 && !this.boosting;
      this.kick = pushing ? this.kick + dt * (6 + this.v * 0.25) : damp(this.kick, Math.round(this.kick / TAU) * TAU, 10, dt);
      const kp = Math.max(0, Math.sin(this.kick));
      r.group.position.set(-kp * 0.05, v.seatY - this.squash * 0.28 + hop, v.seatZ);
      r.group.rotation.x = 0.25 + this.squash * 0.2 + (this.boosting ? 0.1 : 0);
      r.legR.rotation.x = kp * 0.95 + (whip ? 0.5 : 0);
      r.legL.rotation.x = air && !this.grind ? -0.25 : whip ? 0.5 : 0;
      r.armL.rotation.x = r.armR.rotation.x = -1.72 + this.squash * 0.15;
      r.head.rotation.x = -0.2;
    } else if (kind === 'skate') {
      // De frente mientras se impulsa con el pie; de lado, en postura de surf, cuando ya rueda
      for (const w of v.wheels) w.rotation.x += roll;
      v.board.rotation.z = whip; // kickflip: la tabla da la vuelta sobre su eje largo
      const pushing = driving && inp.throttle > 0 && this.v < 17 && this.v > -1 && !this.boosting;
      this.kick = pushing ? this.kick + dt * (6 + this.v * 0.25) : damp(this.kick, Math.round(this.kick / TAU) * TAU, 10, dt);
      const kp = Math.max(0, Math.sin(this.kick));
      this.stance = damp(this.stance, pushing ? 0.2 : 1, 6, dt);
      const st = this.stance;
      r.group.position.set(0, v.seatY - this.squash * 0.3 + hop, v.seatZ);
      r.group.rotation.y = -1.25 * st;
      r.group.rotation.x = 0.16 * (1 - st) + this.squash * 0.1;
      r.legR.rotation.x = kp * 0.95 * (1 - st) - 0.34 * st - (whip ? 0.4 : 0);
      r.legL.rotation.x = 0.34 * st + (whip ? 0.4 : 0);
      const up = air && !this.grind ? 0.7 : 0;
      r.armL.rotation.x = r.armR.rotation.x = -0.25 - up;
      r.armL.rotation.z = (0.85 + up * 0.5) * st + Math.sin(this.time * 6) * 0.06;
      r.armR.rotation.z = -(0.85 + up * 0.5) * st + Math.sin(this.time * 6) * 0.06;
      r.head.rotation.x = -0.1;
      r.head.rotation.y = 1.1 * st - inp.steer * 0.3;
    } else if (kind === 'skates') {
      // Zancadas de patinadora: la pierna que empuja se abre hacia fuera y los brazos van cruzados.
      // Con turbo o dejándose llevar se agacha con las manos a la espalda; el truco es un espagat.
      // El cuerpo se echa adelante desde la cadera: las piernas siguen a plomo y los patines, planos
      const moving = Math.min(1, this.speed / 6);
      const striding = driving && inp.throttle > 0 && this.v > -1 && !this.boosting;
      this.kick = striding ? this.kick + dt * (5.5 + this.v * 0.16) : damp(this.kick, Math.round(this.kick / Math.PI) * Math.PI, 8, dt);
      this.stance = damp(this.stance, striding ? 1 : 0, 7, dt);
      const st = this.stance;
      const s = Math.sin(this.kick);
      const flying = air && !this.grind;
      const split = whip ? Math.sin((whip / TAU) * Math.PI) : 0;
      const tuck = (1 - st) * moving * (this.boosting ? 1 : 0.45);
      const braking = this.grounded && inp.throttle < 0 && this.v > 2 ? 1 : 0;
      const lean = 0.06 + 0.2 * st + 0.42 * tuck - braking * 0.28 + this.squash * 0.15;
      r.group.position.set(s * 0.12 * st, (v.seatY + 1.75 * (1 - Math.cos(lean))) * k - this.squash * 0.2, v.seatZ);
      r.group.rotation.x = lean;
      r.group.rotation.z += s * 0.09 * st;
      r.legL.rotation.x = (flying ? -0.55 - split * 0.95 : s * 0.5 * st - 0.14 * tuck) - lean;
      r.legR.rotation.x = (flying ? -0.2 + split * 1.5 : -s * 0.5 * st + 0.2 * tuck + braking * 0.45) - lean;
      r.legL.rotation.z = Math.max(0, -s) * 0.3 * st;
      r.legR.rotation.z = -Math.max(0, s) * 0.3 * st;
      r.armL.rotation.x = flying ? -2.5 : -s * 0.85 * st + 0.95 * tuck - braking * 0.6;
      r.armR.rotation.x = flying ? -2.5 : s * 0.85 * st + 0.95 * tuck - braking * 0.6;
      r.armL.rotation.z += (flying ? 0.5 + split * 0.6 : 0.12) + braking * 0.5;
      r.armR.rotation.z -= (flying ? 0.5 + split * 0.6 : 0.12) + braking * 0.5;
      r.head.rotation.x = -0.12 - 0.3 * tuck;
    } else if (kind === 'unicycle') {
      // Sentado en el sillín, pedaleando con la rueda y los brazos en cruz
      v.wheel.rotation.x += roll;
      const ph = v.wheel.rotation.x;
      const sp = Math.min(1, this.speed / 12);
      r.group.position.set(0, v.seatY - 1.72 * k - this.squash * 0.2 + hop, v.seatZ);
      r.group.rotation.x = 0.1 + this.squash * 0.2 + (this.boosting ? 0.2 : 0);
      r.legL.rotation.x = -0.75 + Math.sin(ph) * 0.45 * sp;
      r.legR.rotation.x = -0.75 - Math.sin(ph) * 0.45 * sp;
      const wob = Math.sin(this.time * 7) * 0.14 * (0.4 + sp);
      r.armL.rotation.x = r.armR.rotation.x = air && !this.grind ? -2.5 : 0;
      r.armL.rotation.z = 1.15 + wob - this.visRoll;
      r.armR.rotation.z = -1.15 + wob - this.visRoll;
      r.head.rotation.x = 0;
    } else if (kind === 'bike') {
      v.steer.rotation.y = this.steerVis * 0.8 - whip;
      v.rear.rotation.x += roll;
      v.front.rotation.x += roll;
      // Pedalea solo cuando acelera; cuesta abajo o en el aire deja las bielas quietas
      if (driving) this.kick += dt * (4 + Math.abs(this.v) * 0.32);
      v.cranks.rotation.x = this.kick;
      const stand = air && !this.grind ? 0.5 : 0;
      r.group.position.set(0, v.seatY - 1.72 * k - this.squash * 0.2 + hop + stand, v.seatZ + stand * 0.6);
      r.group.rotation.x = 0.52 + this.squash * 0.15 - stand * 0.3;
      r.legL.rotation.x = -0.6 + Math.sin(this.kick) * 0.5;
      r.legR.rotation.x = -0.6 - Math.sin(this.kick) * 0.5;
      r.armL.rotation.x = r.armR.rotation.x = -1.3 + stand * 0.3;
      r.head.rotation.x = -0.5;
    } else {
      // Coche: ruedas, dirección y puertas de ala de halcón en vez de tailwhip
      for (const w of v.wheels) w.rotation.x += roll;
      for (const pv of v.frontPivots) pv.rotation.y = this.steerVis * 0.9;
      this.doorVis = damp(this.doorVis, this.whipT > 0 ? 1 : 0, this.whipT > 0 ? 22 : 7, dt);
      v.doors[0].rotation.z = -this.doorVis * 1.2;
      v.doors[1].rotation.z = this.doorVis * 1.2;
      r.group.position.set(0, v.seatY - 1.72 * k, v.seatZ);
      r.group.rotation.x = 0;
      r.group.rotation.z = 0;
      r.legL.rotation.x = r.legR.rotation.x = -1.5;
      r.armL.rotation.x = -1.25 + this.steerVis * 0.5;
      r.armR.rotation.x = -1.25 - this.steerVis * 0.5;
      r.armL.rotation.z = r.armR.rotation.z = 0;
      r.head.rotation.x = 0;
    }
    // Parpadeo al reaparecer
    if (this.crashT <= 0) this.model.visible = !this.hidden && (this.invuln > 0 ? Math.floor(this.time * 14) % 2 === 0 : true);
  }
}
