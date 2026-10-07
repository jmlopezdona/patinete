import { createMinifig } from '../lego/minifig.js';
import { createMinivan, createSkates } from '../lego/vehicles.js';
import { C } from '../lego/colors.js';
import { COLORS } from './characters.js';
import { clamp, damp } from '../core/rng.js';
import { lift, grade } from '../world/relief.js';

const T_DRIVE = 4.4; // lo que tarda en llegar y dar la vuelta
const T_DOOR = 0.45;
const T_HOP = 0.6;
const SLIDE = 2.25; // lo que corre la puerta al abrirse

// Emma no vive en Cobeña: elegida en el menú, su padre la trae en coche hasta la puerta del parque,
// ella se baja y el coche espera allí hasta que empieza la partida. Entonces se despide y se va.
export class Dropoff {
  constructor(game) {
    this.game = game;
    this.state = 'off'; // off | drive | door | hop | wait | leave
    this.t = 0;
    this.s = 0;
    this.v = 0;
    this.x = this.z = this.heading = 0;
    const van = (this.van = createMinivan(C.medAzure));
    van.group.rotation.order = 'YXZ';
    van.group.traverse((o) => {
      if (o.isMesh && !o.material.transparent) o.castShadow = true;
    });
    const dad = (this.dad = createMinifig({ torso: 0x1d2f5a, arms: 0x1d2f5a, legs: C.dgray, hair: 'hair', hairColor: 0x1f1410, face: 'grin', brows: 0x1f1410, print: 'buttons', printColor: '#ffffff' }));
    const [dx, dy, dz] = van.seats.driver;
    dad.group.position.set(dx, dy - 1.75, dz);
    dad.legL.rotation.x = dad.legR.rotation.x = -1.5;
    van.group.add(dad.group);
    van.group.visible = false;
    game.scene.add(van.group);
    this.kid = null; // la doble de Emma que viaja en el coche hasta que se baja
  }

  get P() {
    return this.game.world.places.homes.emma?.drop;
  }

  // Sienta en el asiento de atrás a una Emma igual que la del jugador, con sus patines puestos
  seatKid() {
    this.dropKid();
    const p = this.game.player;
    const kid = (this.kid = createMinifig(p.char.look));
    kid.group.scale.setScalar(p.char.scale);
    const skates = createSkates(COLORS[p.colorIdx]);
    skates.wear(kid);
    this.kidY = skates.seatY * p.char.scale; // lo que la levantan los patines una vez en pie
    kid.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const [x, y, z] = this.van.seats.kid;
    kid.group.position.set(x, y - 1.75 * p.char.scale, z);
    kid.group.rotation.set(0, 0, 0);
    kid.legL.rotation.x = kid.legR.rotation.x = -1.5;
    this.van.group.add(kid.group);
  }

  dropKid() {
    if (!this.kid) return;
    this.kid.group.removeFromParent();
    this.kid.group.traverse((o) => o.isMesh && o.geometry.dispose());
    this.kid = null;
  }

  arrive() {
    if (!this.P) return;
    this.seatKid();
    this.game.player.hidden = true;
    this.state = 'drive';
    this.t = this.v = this.s = 0;
    this.van.door.position.set(0, 0, 0);
    this.van.group.scale.setScalar(1);
    this.van.group.visible = true;
    this.pose(0);
  }

  // El coche desaparece sin más (otro personaje, vuelta a casa...)
  cancel() {
    if (this.state === 'off') return;
    this.state = 'off';
    this.van.group.visible = false;
    this.dropKid();
    this.game.player.hidden = false;
  }

  // Empieza la partida: si Emma aún no se había bajado, ya está en la acera; el padre se despide y se va
  leave() {
    if (this.state === 'off' || this.state === 'leave') return;
    const P = this.P;
    this.dropKid();
    this.game.player.hidden = false;
    this.van.door.position.set(0, 0, 0);
    this.x = P.stop[0];
    this.z = P.stop[1];
    this.heading = P.heading + Math.PI;
    this.state = 'leave';
    this.t = this.v = 0;
    this.game.sfx.honk();
  }

  // Coloca el coche a `s` unidades de camino: recta de llegada, media vuelta y recta hasta parar
  pose(s) {
    const P = this.P;
    const ux = Math.sin(P.heading);
    const uz = Math.cos(P.heading);
    // Los carriles van a P.r del eje de la calle: el de llegada, a la derecha de la marcha (-uz, ux)
    const l0 = Math.sqrt(Math.max(0, (P.turn[0] - P.from[0]) ** 2 + (P.turn[1] - P.from[1]) ** 2 - P.r * P.r));
    const l2 = Math.PI * P.r;
    if (s < l0) {
      this.x = P.from[0] + ux * s;
      this.z = P.from[1] + uz * s;
      this.heading = P.heading;
    } else if (s < l0 + l2) {
      const a = (s - l0) / P.r;
      this.x = P.turn[0] + P.r * (-uz * Math.cos(a) + ux * Math.sin(a));
      this.z = P.turn[1] + P.r * (ux * Math.cos(a) + uz * Math.sin(a));
      this.heading = P.heading + a;
    } else {
      const k = s - l0 - l2;
      this.x = P.turn[0] + uz * P.r - ux * k;
      this.z = P.turn[1] - ux * P.r - uz * k;
      this.heading = P.heading + Math.PI;
    }
    this.total = l0 + l2 + Math.hypot(P.stop[0] - (P.turn[0] + uz * P.r), P.stop[1] - (P.turn[1] - ux * P.r));
  }

  update(dt, live) {
    if (this.state === 'off') return;
    const g = this.game;
    const p = g.player;
    const P = this.P;
    const van = this.van;
    const dad = this.dad;
    const time = g.time;
    let moved = 0;
    let brake = 0;
    this.t += dt;
    dad.armL.rotation.x = dad.armR.rotation.x = -1.25;
    dad.armR.rotation.z = 0;
    dad.head.rotation.y = 0;

    if (this.state === 'drive') {
      // Llega lanzado y va frenando: la media vuelta la da ya despacio
      const k = clamp(this.t / T_DRIVE, 0, 1);
      const s = this.total * (1 - (1 - k) ** 2.3);
      moved = s - this.s;
      brake = k > 0.15 && k < 1 ? (1 - k) * 0.05 : 0;
      this.pose(s);
      this.s = s;
      if (k >= 1) this.next('door');
    } else if (this.state === 'door') {
      van.door.position.z = -SLIDE * clamp(this.t / T_DOOR, 0, 1);
      if (this.t >= T_DOOR) {
        // Emma sale por su pie: deja de ir sentada en el coche
        const kid = this.kid;
        g.scene.add(kid.group);
        kid.group.rotation.y = this.heading;
        const c = Math.cos(this.heading);
        const s = Math.sin(this.heading);
        const [lx, , lz] = van.seats.kid;
        this.out = { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c, y: kid.group.position.y };
        kid.group.position.set(this.out.x, this.out.y, this.out.z);
        this.next('hop');
      }
    } else if (this.state === 'hop') {
      // Saltito del asiento a la acera, estirando las piernas
      const k = clamp(this.t / T_HOP, 0, 1);
      const e = k * k * (3 - 2 * k);
      const kid = this.kid;
      const o = this.out;
      const y0 = p.pos.y + this.kidY;
      kid.group.position.set(o.x + (p.pos.x - o.x) * e, o.y + (y0 - o.y) * e + Math.sin(k * Math.PI) * 1.1, o.z + (p.pos.z - o.z) * e);
      kid.legL.rotation.x = kid.legR.rotation.x = -1.5 * (1 - e);
      kid.armL.rotation.x = kid.armR.rotation.x = -2.4 * Math.sin(k * Math.PI);
      if (k >= 1) {
        this.dropKid();
        p.hidden = false;
        this.next('wait');
      }
    } else if (this.state === 'wait') {
      // El padre la mira y le dice adiós con la mano mientras cierra la puerta
      van.door.position.z = -SLIDE * (1 - clamp((this.t - 0.3) / T_DOOR, 0, 1));
      dad.head.rotation.y = damp(0, -1.0, 6, this.t);
      if (this.t % 5 < 1.6) {
        dad.armR.rotation.x = -2.7;
        dad.armR.rotation.z = -0.35 + Math.sin(this.t * 11) * 0.3;
      }
    } else if (this.state === 'leave') {
      // Calle abajo hasta el final, frenando si se le cruza alguien, y allí desaparece
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      let target = 15;
      const ahead = (x, z, y) => {
        const dx = x - this.x;
        const dz = z - this.z;
        const f = dx * fx + dz * fz;
        return y < 4 && f > 0 && f < van.len / 2 + 9 && Math.abs(dx * fz - dz * fx) < van.width / 2 + 1.6;
      };
      if (ahead(p.pos.x, p.pos.z, p.pos.y)) target = 0;
      for (const c of g.traffic.cars) if (ahead(c.x, c.z, 0)) target = Math.min(target, c.speed * 0.7);
      this.v += clamp(target - this.v, -26 * dt, 7 * dt);
      moved = this.v * dt;
      this.x += fx * moved;
      this.z += fz * moved;
      const left = (P.away[0] - this.x) * fx + (P.away[1] - this.z) * fz;
      if (this.t < 1.4) {
        dad.armR.rotation.x = -2.7;
        dad.armR.rotation.z = -0.35 + Math.sin(this.t * 11) * 0.3;
      }
      van.group.scale.setScalar(clamp(left / 8, 0, 1));
      if (left <= 0 || Math.hypot(p.pos.x - this.x, p.pos.z - this.z) > 320) {
        this.cancel();
        return;
      }
    }

    for (const w of van.wheels) w.rotation.x += moved / van.wheelR;
    van.group.position.set(this.x, 0, this.z);
    // Morro arriba o abajo según la cuesta, y hundido al frenar
    lift(this.x, this.z);
    van.group.rotation.set(-Math.atan(grade.x * Math.sin(this.heading) + grade.z * Math.cos(this.heading)) + brake, this.heading, 0);
    if (this.state === 'wait') van.group.position.y = Math.sin(time * 31) * 0.012; // al ralentí
    if (live) this.collide(p);
  }

  next(state) {
    this.state = state;
    this.t = 0;
  }

  // El patinete no atraviesa el coche: lo empuja fuera por el lado más corto
  collide(p) {
    if (p.crashT > 0 || p.pos.y > 5.6) return;
    const van = this.van;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const dx = p.pos.x - this.x;
    const dz = p.pos.z - this.z;
    const lx = dx * fz - dz * fx;
    const lz = dx * fx + dz * fz;
    const ox = van.width / 2 + 0.9 - Math.abs(lx);
    const oz = van.len / 2 + 0.9 - Math.abs(lz);
    if (ox <= 0 || oz <= 0) return;
    if (ox < oz) {
      const s = Math.sign(lx) || 1;
      p.bump(fz * s, -fx * s, ox + 0.05, 0.4);
    } else {
      const s = Math.sign(lz) || 1;
      p.bump(fx * s, fz * s, oz + 0.05, 0.4);
    }
  }
}
