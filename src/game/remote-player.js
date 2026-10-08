import * as THREE from 'three';
import { Player } from './player.js';
import { characterById } from './characters.js';
import { nameTag } from '../lego/minifig.js';
import { F } from '../net/protocol.js';

const tmp = new THREE.Vector3();
// Lo que el mundo le hace a un jugador llamando a sus métodos. A uno remoto no se le puede hacer
// aquí: en el anfitrión viaja como `orden` y se cumple en la pantalla de su dueño
export const ORDERS = ['bump', 'place', 'crash', 'launch', 'skid'];

// Lo que hay que contar de un jugador para que otro lo pinte: justo lo que lee `Player.updateVisual`.
// Los giros viajan como se ven (con el coletazo de aterrizar ya sumado), no como los lleva la física
export function readState(p, inp, s) {
  s.x = p.pos.x;
  s.y = p.pos.y;
  s.z = p.pos.z;
  if (p.grind) tmp.set(p.grind.dx * p.grind.speed, 0, p.grind.dz * p.grind.speed);
  else p.velocity(tmp);
  s.vx = tmp.x;
  s.vy = tmp.y;
  s.vz = tmp.z;
  s.v = p.grounded ? p.v : p.speed;
  s.yaw = p.heading + p.visYaw + p.spin;
  s.flip = p.flip + p.visFlip;
  s.pitch = p.pitch;
  s.whip = Math.max(0, p.whipT);
  s.steer = inp.steer;
  s.throttle = inp.throttle;
  s.flags = (p.grounded ? F.GROUND : 0) | (p.grind ? F.GRIND : 0) | (p.boosting ? F.BOOST : 0) | (p.crashT > 0 ? F.CRASH : 0) | (p.sunk ? F.SUNK : 0) | (p.hidden ? F.HIDDEN : 0) | (p.invuln > 0 ? F.INVULN : 0) | (p.held ? F.HELD : 0) | (p.foil ? F.FOIL : 0);
  // Quién está a otra cosa y qué tiene pulsado lo sabe el juego, no el personaje: lo añade la pandilla (F.BUSY, F.KEY)
  return s;
}

// Otro jugador de la partida en red: el mismo muñeco que el local, pero sin física. Sus campos
// salen del estado que llega por la red y solo se pinta
export class RemotePlayer extends Player {
  constructor(game, info) {
    super(game);
    this.slot = info.slot;
    this.rail = { speed: 0 };
    this.inp = { steer: 0, throttle: 0 };
    this.down = false;
    this.seen = false;
    this.root.visible = false;
    game.scene.add(this.root);
    this.setLook(info.char, info.color);
  }

  setLook(char, color) {
    const ch = characterById(char);
    if (ch !== this.char || !this.tag) {
      this.dropTag();
      this.tag = nameTag(ch.name, '#ffd23a');
      this.tag.visible = this.seen;
      this.game.scene.add(this.tag);
    }
    this.setCharacter(ch.id, color);
    this.model.visible = !this.down;
  }

  apply(s, dt) {
    const f = s.flags;
    const down = !!(f & F.CRASH);
    // El paquete del castañazo ya trae la velocidad a cero: los trozos salen con la que llevaba
    if (down && !this.down && this.seen) f & F.SUNK ? this.sink() : this.shatter(this.vel.x * 0.45, this.vel.z * 0.45);
    this.down = down;
    this.crashT = down ? 1 : 0;
    this.time += dt;
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(s.vx, s.vy, s.vz);
    this.v = this.rail.speed = s.v;
    this.grounded = !!(f & F.GROUND);
    this.grind = f & F.GRIND ? this.rail : null;
    // `updateVisual` lleva el coletazo hacia donde ya está: el giro que se ve es el que ha llegado
    this.visYaw = this.grind ? Math.PI / 2 : 0;
    this.heading = s.yaw - this.visYaw;
    this.flip = s.flip;
    this.pitch = s.pitch;
    this.whipT = s.whip;
    this.boosting = !!(f & F.BOOST);
    this.hidden = !!(f & F.HIDDEN);
    this.held = !!(f & F.HELD);
    this.busy = !!(f & F.BUSY);
    this.foil = !!(f & F.FOIL);
    this.key = !!(f & F.KEY);
    this.invuln = f & F.INVULN ? 1 : 0;
    this.inp.steer = s.steer;
    this.inp.throttle = s.throttle;
    if (!this.seen) {
      this.seen = this.root.visible = this.tag.visible = true;
      this.visY = s.y;
    }
    this.updateVisual(dt, this.inp);
    this.tag.position.set(s.x, this.visY + 6.9 * this.char.scale, s.z);
    this.tag.visible = this.model.visible;
  }

  order(m, a) {
    this.game.party?.order(this, m, a);
  }

  dropTag() {
    if (!this.tag) return;
    this.tag.removeFromParent();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.tag = null;
  }

  dispose() {
    this.dropTag();
    this.root.removeFromParent();
    this.root.traverse((o) => o.isMesh && o.geometry.dispose());
  }
}

for (const m of ORDERS) {
  RemotePlayer.prototype[m] = function (...a) {
    this.order(m, a);
  };
}
