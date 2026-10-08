import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { damp } from '../core/rng.js';
import { walk } from './walker.js';

const SEE = 260; // más lejos del corral no se dibujan
const YARD = 11; // radio del corral por el que picotean
const SIZE = 1.5;
const FEATHERS = [C.white, 0xb5713a, C.white, C.tan, C.white, 0xb5713a, C.white];
const RAGE = 30; // segundos que les dura el enfado
const RAGE_SPEED = [0.78, 0.93]; // de la más lenta a la más rápida, respecto a la punta del jugador
const LOSE = 40; // más lejos que esto, las has dejado atrás
const PECK = 20; // studs que cuesta cada picotazo
const PRIZE = 300;
const REACH = 2.3; // a esta distancia llega el pico (y el patinete a la gallina)
const OVER = 1.5; // con las ruedas más altas que esto, les pasas por encima
const ORANGE = '#ffb347';
// Cómo viajan por la red: el estado de cada una va como su número aquí
const STATES = ['peck', 'scare', 'fly', 'angry', 'back', 'in'];
const HEN = 8;
const POS = 10;
const TURN = 256 / (Math.PI * 2);

// El pico mira a +Z. La cabeza y las alas van aparte: una picotea y las otras aletean
function henParts(color) {
  const b = new Builder();
  b.box(1.1, 1.0, 1.5, 0, 1.05, 0, color, { r: 0.4 });
  b.box(0.5, 0.8, 0.3, 0, 1.6, -0.78, color, { r: 0.12, rx: -0.4 });
  for (const s of [-1, 1]) {
    b.cyl(0.07, 0.6, s * 0.25, 0.3, 0, C.orange, { seg: 6 });
    b.box(0.3, 0.08, 0.42, s * 0.25, 0.04, 0.1, C.orange);
  }
  const body = b.geometry();
  b.box(0.6, 0.8, 0.6, 0, 0.35, 0.1, color, { r: 0.2 });
  b.box(0.14, 0.3, 0.46, 0, 0.86, 0.1, C.red, { r: 0.06 });
  b.box(0.22, 0.16, 0.32, 0, 0.36, 0.52, C.yellow);
  b.box(0.14, 0.24, 0.1, 0, 0.1, 0.44, C.red);
  for (const s of [-1, 1]) b.box(0.08, 0.1, 0.08, s * 0.3, 0.5, 0.26, C.black);
  const head = b.geometry();
  b.box(0.14, 0.62, 1.0, 0, -0.26, -0.05, color, { r: 0.06 });
  return { body, head, wing: b.geometry() };
}

// Las gallinas del gallinero, junto al Mega Salto. De día picotean por el corral y se apartan si
// pasas cerca; de noche duermen dentro. Si atropellas a una, te persiguen todas a picotazos (cada
// uno, unos studs por los suelos) hasta que les das esquinazo o se cansan.
//
// En red las mueve el anfitrión (`simulate`) y viajan en la `foto` (`write`, `read`), pero solo
// mientras hay alguien cerca del corral o están enfadadas. El enfado tiene dueño (`owner`): van a
// por quien atropelló a una, y solo a él le quitan studs. Cada jugador detecta en su pantalla que
// atropella a una (y lo avisa: `gallina`) o que le dan un picotazo (`touch`).
export class Hens {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.yard = game.world.places.hens;
    this.list = [];
    this.blips = [];
    this.day = true;
    this.rage = 0; // segundos de enfado que les quedan
    this.owner = null; // con quién están enfadadas
    this.mine = false; // ¿es con el jugador de esta pantalla?
    this.idle = false; // sin nadie cerca y sin bronca, ni se mueven ni se pintan
    this.shown = null; // lo que enseña el HUD
    this.lost = 0; // segundos que llevan sin tenerte cerca
    this.truce = 0; // recién calmadas, un momento en el que no cuenta llevárselas por delante
    this.cluckCd = 0;
    this.peckCd = 0;
    const geos = new Map();
    for (let i = 0; i < FEATHERS.length; i++) {
      const color = FEATHERS[i];
      if (!geos.has(color)) geos.set(color, henParts(color));
      const geo = geos.get(color);
      const group = new THREE.Group();
      const body = new THREE.Mesh(geo.body, plastic);
      const head = new THREE.Mesh(geo.head, plastic);
      const wingL = new THREE.Mesh(geo.wing, plastic);
      const wingR = new THREE.Mesh(geo.wing, plastic);
      body.castShadow = head.castShadow = true;
      head.position.set(0, 1.45, 0.6);
      wingL.position.set(0.6, 1.4, 0);
      wingR.position.set(-0.6, 1.4, 0);
      group.add(body, head, wingL, wingR);
      group.scale.setScalar(SIZE);
      game.scene.add(group);
      const h = {
        group, head, wingL, wingR, color, state: 'peck', t: 0, x: 0, y: 0, z: 0, heading: i * 2.3, walk: i, stuck: 0, detour: 0, detourDir: 0,
        hx: 0, hz: 0, tx: 0, tz: 0, gx: 0, gz: 0, wait: 0, up: 0, vy: 0, cd: 0, ph: i * 1.9, speed: 0, pecking: false, was: 'peck', ramCd: 0,
        k: RAGE_SPEED[0] + ((RAGE_SPEED[1] - RAGE_SPEED[0]) * i) / (FEATHERS.length - 1), blip: { x: 0, z: 0, color: '#ffffff' },
      };
      this.spot(h);
      h.hx = h.tx;
      h.hz = h.tz;
      this.put(h, h.hx, h.hz);
      this.pose(h, 0, 0, 0, false, false);
      this.list.push(h);
    }
  }

  // Un sitio libre del corral al que ir a picotear
  spot(h) {
    const Y = this.yard;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * (YARD - 2);
      h.tx = Y.x + Math.sin(a) * r;
      h.tz = Y.z + Math.cos(a) * r;
      if (Math.abs(this.T.height(h.tx, h.tz)) < 0.3) break;
    }
    h.wait = 1.5 + Math.random() * 3.5;
    h.stuck = 0;
  }

  put(h, x, z) {
    h.x = x;
    h.z = z;
    h.y = this.T.height(x, z);
    h.up = h.stuck = h.detour = 0;
    h.group.rotation.x = 0;
  }

  setState(h, state) {
    h.state = state;
    h.t = 0;
  }

  // A su sitio del corral, o adentro si ya es de noche
  home(h) {
    const D = this.yard.door;
    [h.gx, h.gz] = this.day ? [h.hx, h.hz] : [D.x, D.z];
    this.setState(h, 'back');
  }

  arrive(h) {
    this.put(h, h.gx, h.gz);
    if (this.day) {
      this.setState(h, 'peck');
      this.spot(h);
    } else h.state = 'in';
  }

  cluck(dist) {
    if (this.cluckCd > 0 || dist > 60) return;
    this.cluckCd = 0.5 + Math.random() * 0.6;
    this.game.sfx.cluck(1 - dist / 60);
  }

  // Atropellada: sale por los aires (sin daños: es de plástico) y se enfadan todas con quien ha
  // sido (`by`). Las plumas y el graznido los pone cada pantalla al verla volar (`present`)
  hit(h, by) {
    const g = this.game;
    this.setState(h, 'fly');
    h.vy = 13;
    h.up = 0.01;
    if ((by === g.player && g.missions.active) || g.busy(by) || !this.day) return;
    const first = this.rage <= 0;
    this.rage = RAGE;
    this.lost = 0;
    for (const o of this.list) if (o.state === 'peck' || o.state === 'scare' || o.state === 'back') this.setState(o, 'angry');
    if (!first) return;
    this.owner = by;
    g.to(by).hud.big('¡Las gallinas!', ORANGE, 1.4);
    g.to(by).hud.toast('🐔 Has atropellado a una gallina y ahora te persiguen <b>todas</b>. Cada <b>picotazo</b> te quita studs: dales esquinazo o aguanta hasta que se cansen.');
  }

  // En el anfitrión: un invitado dice que ha atropellado a una
  rammed(i, by) {
    const h = this.list[i];
    if (h && by && !this.idle && this.truce <= 0 && (h.state === 'peck' || h.state === 'scare' || h.state === 'back')) this.hit(h, by);
  }

  // Picotazo al jugador de esta pantalla, que es con quien están enfadadas
  peck(h, p) {
    const g = this.game;
    h.cd = 1.4;
    this.peckCd = 0.35;
    const lost = Math.min(PECK, g.save.studs);
    if (lost > 0) {
      g.save.studs -= lost;
      g.hud.setStuds(g.save.studs);
      g.dirty = true;
      g.studs.burst(p.pos.x, p.pos.y + 2, p.pos.z, Math.ceil(lost / 20), 0, this.T.height(p.pos.x, p.pos.z), 9);
    }
    if (p.grounded) p.v *= 0.8;
    g.combo = 0;
    g.camera3.addShake(0.2);
    g.sfx.peck();
    g.hud.big('¡Picotazo!', ORANGE, 0.6, true);
  }

  // Se acabó el enfado: cada una a su sitio. Por las malas, sin el paseo de vuelta
  calm(hard = false) {
    if (this.rage > 0) this.truce = 4;
    this.rage = this.lost = 0;
    for (const h of this.list) {
      if (h.state === 'angry') this.home(h);
      if (hard && h.state !== 'in' && h.state !== 'peck') {
        this.home(h);
        this.arrive(h);
      }
    }
    this.owner = null;
    this.mine = false;
    this.shown = null;
    this.game.hud.setHens(null);
  }

  // El premio es para quien las llevaba detrás
  escaped() {
    const g = this.game.to(this.owner);
    g.addStuds(PRIZE);
    g.tally('hens');
    g.hud.big('¡Esquinazo!', '#4dff88', 1.4);
    g.sfx.escape();
    g.hud.toast(`💨 Les has dado esquinazo a las gallinas. Premio: <b>${PRIZE}</b> studs… y a mirar por dónde pisas.`);
    this.calm();
  }

  update(dt, p, time) {
    const g = this.game;
    const party = g.party;
    const led = !!party && !party.hosting && party.fed;
    if (this.led && !led) this.calm(true); // se acabó la partida en red
    this.led = led;
    this.truce -= dt;
    this.cluckCd -= dt;
    this.peckCd -= dt;
    // Antes de que se muevan: al apartarse de debajo del patinete quedan justo fuera de su alcance
    this.touch(p);
    if (led) this.day = g.env.target < 0.5;
    else {
      this.simulate(dt, g.crowd(p));
      this.mine = this.rage > 0 && this.owner === g.player;
    }
    this.present(dt, p, time);
  }

  // Lo que deciden las gallinas: solo jugando solo o en el anfitrión. who: los jugadores que hay por la calle
  simulate(dt, who) {
    const g = this.game;
    const Y = this.yard;
    const day = g.env.target < 0.5;
    if (day !== this.day) {
      this.day = day;
      // Al anochecer se recogen; por la mañana salen por la puerta, cada una a su sitio
      if (!day) this.calm();
      for (const h of this.list) {
        if (h.state === 'in') this.put(h, Y.door.x, Y.door.z);
        if (h.state !== 'fly') this.home(h);
      }
    }
    // Durante los minijuegos hay tregua, y también si aquel con quien iban se ha ido o está a otra cosa
    const T = this.owner;
    if (this.rage > 0 && (!who.includes(T) || g.busy(T) || (T === g.player && g.missions.active))) this.calm(true);
    // Con los patinetes lejos y sin bronca no hay nada que ver: cada una donde le toca
    this.idle = this.rage <= 0 && g.nearest2(Y.x, Y.z) > SEE * SEE;
    if (this.idle) {
      this.rest();
      return;
    }

    const tAlive = !!T && T.crashT <= 0 && !T.held;
    let near = Infinity;
    for (const h of this.list) {
      if (h.state === 'in') continue;
      h.t += dt;
      // Las enfadadas van a por quien atropelló a una; las demás se apartan del que tengan más cerca
      let p = T;
      if (h.state !== 'angry' || !p) {
        let best = Infinity;
        for (const o of who) {
          const e = (o.pos.x - h.x) ** 2 + (o.pos.z - h.z) ** 2;
          if (e < best) {
            best = e;
            p = o;
          }
        }
      }
      const pAlive = p.crashT <= 0 && !p.held;
      const dx = p.pos.x - h.x;
      const dz = p.pos.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      const dy = p.pos.y - h.y;
      let dir = h.heading;
      let speed = 0;
      h.pecking = false;

      switch (h.state) {
        case 'peck': {
          if (pAlive && d < 7 && p.speed > 4) {
            // Se aparta cacareando
            this.setState(h, 'scare');
            break;
          }
          const ex = h.tx - h.x;
          const ez = h.tz - h.z;
          if (Math.hypot(ex, ez) > 0.7) {
            dir = Math.atan2(ex, ez);
            speed = 2.4;
            if (h.stuck > 0.5) this.spot(h);
          } else {
            h.pecking = true;
            h.wait -= dt;
            if (h.wait <= 0) this.spot(h);
          }
          break;
        }
        case 'scare':
          dir = Math.atan2(-dx, -dz);
          speed = 9;
          if (h.t > 0.9 && (d > 10 || h.t > 2)) {
            this.setState(h, 'peck');
            this.spot(h);
          }
          break;
        case 'fly':
          h.vy -= 30 * dt;
          h.up += h.vy * dt;
          if (h.up <= 0) {
            h.up = 0;
            if (this.rage > 0) this.setState(h, 'angry');
            else this.home(h);
          }
          break;
        case 'angry':
          near = Math.min(near, d);
          if (h.detour > 0) {
            h.detour -= dt;
            dir = h.detourDir;
          } else dir = Math.atan2(dx, dz);
          speed = pAlive && d > 1.9 ? p.stats.vmax * h.k : 0;
          break;
        case 'back': {
          const ex = h.gx - h.x;
          const ez = h.gz - h.z;
          dir = Math.atan2(ex, ez);
          speed = 6.5;
          // Si no encuentra el camino de vuelta, aparece en su sitio cuando nadie mira
          if (Math.hypot(ex, ez) < 1 || h.stuck > 2 || h.t > 40) this.arrive(h);
          break;
        }
        default:
          break;
      }
      h.speed = speed;
      if (h.state === 'in' || h.state === 'fly') continue;

      if (!walk(this.T, h, dir, speed, 9, dt) && h.state === 'angry' && h.stuck > 0.3) {
        h.stuck = 0;
        h.detour = 0.7;
        h.detourDir = h.heading + (Math.random() < 0.5 ? 1.7 : -1.7);
      }
      // Debajo del patinete no caben
      if (pAlive && d < REACH && dy > -2) {
        const out = (h.state === 'angry' ? 1.8 : REACH) - d;
        if (out > 0 && dy < 2.5 && Math.abs(this.T.height(h.x - (dx / d) * out, h.z - (dz / d) * out) - h.y) < 0.5) {
          h.x -= (dx / d) * out;
          h.z -= (dz / d) * out;
        }
      }
    }

    // Que no corran unas encima de otras
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (a.state !== 'angry') continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (b.state !== 'angry') continue;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const e = Math.hypot(ex, ez);
        if (e > 2 || e < 0.001) continue;
        const k = ((2 - e) * 0.5) / e;
        if (Math.abs(this.T.height(a.x - ex * k, a.z - ez * k) - a.y) < 0.5) {
          a.x -= ex * k;
          a.z -= ez * k;
        }
        if (Math.abs(this.T.height(b.x + ex * k, b.z + ez * k) - b.y) < 0.5) {
          b.x += ex * k;
          b.z += ez * k;
        }
      }
    }

    if (this.rage <= 0) return;
    // Esquinazo: un rato sin tenerlas cerca. Si no, acaban cansándose ellas
    if (tAlive) this.rage -= dt;
    this.lost = near > LOSE && tAlive ? this.lost + dt : 0;
    if (this.lost > 2.5) this.escaped();
    else if (this.rage <= 0) {
      g.to(T).hud.toast('🐔 Las gallinas se han cansado de correr y se vuelven al gallinero.');
      this.calm();
    }
  }

  // Sin nada que hacer: cada una donde le toca
  rest() {
    for (const h of this.list) {
      if (h.state !== 'in' && h.state !== 'peck') {
        this.home(h);
        this.arrive(h);
      }
    }
  }

  // Lo que se ve y se oye en esta pantalla, estén donde estén decididas
  present(dt, p, time) {
    const g = this.game;
    this.blips.length = 0;
    // La cuenta atrás del enfado solo le sale a quien persiguen
    const left = this.mine && this.rage > 0 ? this.rage : null;
    if (left !== this.shown) g.hud.setHens((this.shown = left));
    for (const h of this.list) {
      const on = !this.idle && h.state !== 'in';
      h.group.visible = on;
      if (!on) {
        h.was = h.state;
        continue;
      }
      h.cd -= dt;
      h.ramCd -= dt;
      const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
      if (h.state !== h.was) {
        if (h.state === 'fly') {
          // Sale por los aires entre plumas
          g.here(h.x, h.z).bits.burst(h.x, h.y + 1.5, h.z, [C.white, h.color, C.white], 14, 8, h.y, 0.35);
          g.here(h.x, h.z).sfx.squawk();
        } else if (h.state === 'scare') this.cluck(d);
        h.was = h.state;
      }
      if (h.state === 'angry') {
        this.cluck(d);
        h.blip.x = h.x;
        h.blip.z = h.z;
        this.blips.push(h.blip);
      }
      if (this.led) {
        // En un invitado no anda con `walk()`: la altura del suelo y el paso se llevan aquí
        h.y = this.T.height(h.x, h.z);
        h.walk += h.speed * dt * 0.8;
      }
      h.group.rotation.x = h.state === 'fly' ? h.group.rotation.x + dt * 12 : 0;
      this.pose(h, time, h.speed, dt, h.pecking, h.state === 'angry' || h.state === 'scare' || h.state === 'fly');
    }
  }

  // Lo que le pasa al jugador de esta pantalla al tocarlas, tal como las ve
  touch(p) {
    const g = this.game;
    if (this.idle || p.crashT > 0 || p.held) return;
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (h.state === 'in' || h.state === 'fly') continue;
      const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
      const dy = p.pos.y - h.y;
      if (d >= REACH || dy <= -2) continue;
      if (h.state === 'angry') {
        if (this.mine && dy <= OVER && p.invuln <= 0 && h.cd <= 0 && this.peckCd <= 0) this.peck(h, p);
      } else if (dy < 2.5 && p.speed > 7) {
        // Atropellada. En un invitado se le dice al anfitrión, que es quien la manda por los aires
        if (!this.led) {
          if (this.truce > 0) continue;
          g.camera3.addShake(0.15);
          this.hit(h, p);
        } else if (h.ramCd <= 0) {
          h.ramCd = 1;
          g.camera3.addShake(0.15);
          g.party.tell('gallina', i);
        }
      }
    }
  }

  // ---------- En red ----------
  // Lo que viaja en cada `foto`: nada si no hay nada que ver; si no, el enfado, con quién es y cada gallina
  get bytes() {
    return this.idle ? 1 : 3 + this.list.length * HEN;
  }

  write(dv, o) {
    if (this.idle) {
      dv.setUint8(o, 0);
      return o + 1;
    }
    dv.setUint8(o, this.list.length);
    dv.setUint8(o + 1, Math.min(255, Math.ceil(Math.max(0, this.rage))));
    dv.setUint8(o + 2, this.rage > 0 && this.owner ? this.game.party.slotOf(this.owner) : 255);
    o += 3;
    for (const h of this.list) {
      dv.setUint8(o, STATES.indexOf(h.state) | (h.pecking ? 128 : 0));
      dv.setInt16(o + 1, Math.round(h.x * POS), true);
      dv.setInt16(o + 3, Math.round(h.z * POS), true);
      dv.setUint8(o + 5, Math.round(h.heading * TURN) & 255);
      dv.setUint8(o + 6, Math.min(255, Math.round(h.up * 40)));
      dv.setUint8(o + 7, Math.min(255, Math.round(h.speed * 4)));
      o += HEN;
    }
    return o;
  }

  // Invitado: las gallinas, entre dos fotos del anfitrión (k de 0 a 1)
  read(a, b, o, k) {
    const n = a.getUint8(o);
    if (!n) {
      if (!this.idle) this.rest();
      this.idle = true;
      this.rage = 0;
      this.mine = false;
      return o + 1;
    }
    this.idle = false;
    this.rage = a.getUint8(o + 1);
    this.mine = this.rage > 0 && this.game.party.isMe(a.getUint8(o + 2));
    o += 3;
    for (const h of this.list) {
      const st = a.getUint8(o);
      h.state = STATES[st & 7] || 'peck';
      h.pecking = !!(st & 128);
      // Si en la foto siguiente está en otra cosa, no se mezclan
      const j = (b.getUint8(o) & 7) === (st & 7) ? k : 0;
      const mix = (at) => a.getInt16(o + at, true) + (b.getInt16(o + at, true) - a.getInt16(o + at, true)) * j;
      h.x = mix(1) / POS;
      h.z = mix(3) / POS;
      const turn = ((b.getUint8(o + 5) - a.getUint8(o + 5) + 384) & 255) - 128;
      h.heading = (a.getUint8(o + 5) + turn * j) / TURN;
      h.up = (a.getUint8(o + 6) + (b.getUint8(o + 6) - a.getUint8(o + 6)) * j) / 40;
      h.speed = a.getUint8(o + 7) / 4;
      o += HEN;
    }
    return o;
  }

  pose(h, time, speed, dt, pecking, flap) {
    const step = speed > 0 ? Math.sin(h.walk * 2.6) : 0;
    h.group.position.set(h.x, h.y + h.up + (flap && speed > 0 ? Math.abs(step) * 0.35 : 0), h.z);
    h.group.rotation.y = h.heading;
    h.group.rotation.z = step * 0.13; // andares de gallina
    const nod = pecking ? 1.0 + Math.sin(time * 9 + h.ph) * 0.4 : flap ? 0.3 : step * 0.18;
    h.head.rotation.x = damp(h.head.rotation.x, nod, 14, dt);
    const w = flap ? 0.95 + Math.sin(time * 34 + h.ph) * 0.65 : 0;
    h.wingL.rotation.z = w;
    h.wingR.rotation.z = -w;
  }
}
