import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { goldMetal, plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';

const SONIC_R = 46; // hasta dónde llega el timbrazo
const EVERY = 26; // segundos entre que se gasta un objeto y aparece el siguiente
const EVERY_DAY = 75; // de día, sin marcianos, salen mucho más de tarde en tarde
const FOIL_TIME = 20; // lo que el gorro de aluminio te esconde del rayo
const ROCKET_TIME = 10;
const MOON_TIME = 60;
const ORDER = ['bell', 'foil', 'rocket', 'moon']; // van saliendo por turnos, para que no repita
const foilMetal = new THREE.MeshStandardMaterial({ color: 0xd9dee6, roughness: 0.3, metalness: 0.95, flatShading: true });

function bellModel() {
  const b = new Builder();
  b.cyl(1.25, 0.3, 0, 0.15, 0, C.yellow, { seg: 20 });
  b.cyl(1.1, 1.1, 0, 0.85, 0, C.yellow, { seg: 20, r2: 0.6 });
  b.sphere(0.6, 0, 1.4, 0, C.yellow, { seg: 16, seg2: 10 });
  b.cyl(0.16, 0.5, 0, 2.1, 0, C.yellow, { seg: 8 });
  b.sphere(0.3, 0, -0.1, 0, C.red, { seg: 10, seg2: 8 });
  return b.mesh(goldMetal);
}

// Cucurucho arrugado de papel de aluminio: vale para la calle y para la cabeza del piloto
function foilModel() {
  const b = new Builder();
  b.cyl(1.05, 0.14, 0, 0.07, 0, C.white, { seg: 9, r2: 0.95 });
  b.cyl(0.95, 1.5, 0, 0.85, 0, C.white, { seg: 7, r2: 0.08, ry: 0.4 });
  b.sphere(0.16, 0.05, 1.62, 0, C.white, { seg: 5, seg2: 4 });
  return b.mesh(foilMetal);
}

// Cohete de feria tumbado, con el morro hacia +z (hacia donde mira el patinete)
function rocketModel() {
  const b = new Builder();
  b.cyl(0.42, 1.7, 0, 0, 0, C.red, { axis: 'z', seg: 14 });
  b.cyl(0.42, 0.8, 0, 0, 1.25, C.white, { axis: 'z', seg: 14, r2: 0.04 });
  b.cyl(0.3, 0.3, 0, 0, -0.98, C.yellow, { axis: 'z', seg: 12, r2: 0.36 });
  b.cyl(0.43, 0.2, 0, 0, 0.3, C.white, { axis: 'z', seg: 14 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.1, 0.62, 0.7, Math.sin(a) * 0.62, Math.cos(a) * 0.62, -0.6, C.yellow, { r: 0.03, rz: -a });
  }
  return b.mesh(plastic);
}

// Luna llena con sus cráteres
function moonModel() {
  const b = new Builder();
  b.sphere(1.05, 0, 0.9, 0, C.white, { seg: 18, seg2: 12 });
  for (const [a, e, r] of [[0.3, 0.5, 0.34], [2.1, -0.2, 0.26], [3.6, 0.7, 0.2], [4.6, 0.1, 0.3], [1.2, -0.7, 0.22], [5.5, -0.5, 0.18]]) {
    b.sphere(r, Math.cos(a) * Math.cos(e) * 0.9, 0.9 + Math.sin(e) * 0.9, Math.sin(a) * Math.cos(e) * 0.9, C.lgray, { seg: 8, seg2: 6 });
  }
  return b.mesh(plastic);
}

// Cada objeto: su icono, su nombre, cuándo aparece por la calle y qué hace al gastarlo.
// `use` devuelve false si no se ha gastado (y entonces se conserva). Los que tienen `dur` duran
// ese rato después de gastarlos: `start` y `end` lo abren y lo cierran, y `tick` va cada frame.
const KINDS = {
  bell: {
    icon: '🔔', name: 'Timbre sónico', night: true, model: bellModel,
    tip: 'Hazlo sonar con <b>Q</b> cuando tengas marcianos cerca: los deja tontos, y al platillo también.',
    use(items, p) {
      const g = items.game;
      g.sfx.sonic();
      items.ring(p.pos.x, p.pos.y, p.pos.z);
      g.party?.tell('timbre', 0);
      if (!g.aliens.active) {
        g.hud.toast('🔔 ¡Riiing! Aquí no hay marcianos a los que aturdir: guárdalo para esta noche.');
        return false;
      }
      const hit = g.aliens.sonic(p.pos.x, p.pos.z, SONIC_R);
      g.camera3.addShake(0.4);
      g.hud.big('¡Riiing!', '#ffd23a', 1, true);
      if (hit.boss) g.hud.toast('🔔 ¡El timbrazo le ha roto el <b>escudo</b> a la nave nodriza! Aprovecha y dale en la panza.');
      else if (hit.ufo) g.hud.toast('🔔 ¡El platillo se ha quedado <b>atontado</b> y pierde altura! Salta y dale un coscorrón.');
      else if (hit.n) g.hud.toast(`🔔 <b>${hit.n}</b> ${hit.n > 1 ? 'marcianos tontos' : 'marciano tonto'} perdido${hit.n > 1 ? 's' : ''}: ahora el culetazo vale por cualquier lado.`, hit.n > 1 ? 'Marcianos tontos perdidos: ahora el culetazo vale por cualquier lado.' : 'Marciano tonto perdido: ahora el culetazo vale por cualquier lado.');
      else g.hud.toast('🔔 ¡Riiing! No había ningún marciano lo bastante cerca.');
      return true;
    },
  },
  foil: {
    icon: '🎩', name: 'Gorro de aluminio', night: true, model: foilModel, dur: FOIL_TIME,
    tip: 'Póntelo con <b>Q</b> y el rayo del platillo deja de verte un buen rato.',
    use(items) {
      const g = items.game;
      if (!g.aliens.active) {
        g.hud.toast('🎩 Sin platillo a la vista no hace falta esconderse: guárdalo para esta noche.');
        return false;
      }
      g.sfx.foil();
      g.hud.big('¡Invisible!', '#d9dee6', 1, true);
      g.hud.toast(`🎩 Con el gorro puesto el rayo <b>no te detecta</b> durante ${FOIL_TIME} segundos. Los marcianos de a pie sí te ven.`);
      return true;
    },
    start(items, p) {
      p.foil = true;
      items.hat.visible = true;
    },
    end(items, p) {
      p.foil = false;
      items.hat.visible = false;
      if (items.game.aliens.active) items.game.hud.toast('🎩 El gorro se ha deshecho: el platillo vuelve a verte.');
    },
    tick(items, p) {
      // Va en la cabeza del piloto, que cambia al cambiar de personaje
      if (items.hat.parent !== p.rider.head) p.rider.head.add(items.hat);
      if (items.fx.t < 3) items.hat.visible = Math.floor(items.fx.t * 8) % 2 === 0;
    },
  },
  rocket: {
    icon: '🚀', name: 'Cohete', night: false, model: rocketModel, dur: ROCKET_TIME,
    tip: 'Enciéndelo con <b>Q</b>: turbo sin gastar durante 10 segundos. Solo se para frenando.',
    use(items, p) {
      const g = items.game;
      g.sfx.rocket();
      g.camera3.addShake(0.5);
      g.hud.big('¡Cohete!', '#ff7a1a', 1, true);
      g.hud.toast(`🚀 ¡Agárrate! <b>Turbo infinito</b> durante ${ROCKET_TIME} segundos.`);
      g.bits.burst(p.pos.x, p.pos.y + 1.5, p.pos.z, [0xffd23a, 0xff7a1a, 0xffffff], 18, 12, p.pos.y, 0.4);
      return true;
    },
    start(items, p) {
      p.rocket = true;
      items.rocket.visible = true;
    },
    end(items, p) {
      p.rocket = false;
      items.rocket.visible = false;
    },
    tick(items, p, dt) {
      // Va atado a la cola, que cambia de sitio con el vehículo de cada personaje
      const t = p.veh.tail + 0.1;
      items.rocket.position.set(0, 1.25, -t);
      // Chorro de fuego por la tobera, también en el aire
      items.fireT -= dt;
      if (items.fireT > 0 || !p.boosting || p.crashT > 0 || p.hidden) return;
      items.fireT = 0.02;
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      for (let i = 0; i < 2; i++) items.game.bits.spawn(p.pos.x - fx * (t + 1.2), p.pos.y + 1.25, p.pos.z - fz * (t + 1.2), -fx * 11 + (Math.random() - 0.5) * 5, (Math.random() - 0.3) * 4, -fz * 11 + (Math.random() - 0.5) * 5, [0xffd23a, 0xff7a1a, 0xffffff][Math.floor(Math.random() * 3)], 0.5, 0.35, p.pos.y);
    },
  },
  moon: {
    icon: '🌙', name: 'Gravedad lunar', art: 'la', night: false, model: moonModel, dur: MOON_TIME,
    tip: 'Actívala con <b>Q</b>: durante un minuto saltas como en la Luna.',
    use(items, p) {
      const g = items.game;
      g.sfx.moon();
      g.hud.big('¡Gravedad lunar!', '#cfd8ff', 1, true);
      g.hud.toast(`🌙 Durante ${MOON_TIME} segundos <b>los saltos son gigantes</b>: llegas al rayo, al platillo y a los tejados.`);
      g.bits.burst(p.pos.x, p.pos.y + 1.5, p.pos.z, [0xcfd8ff, 0xffffff, 0xa0a5a9], 16, 9, p.pos.y, 0.3);
      return true;
    },
    start(items, p) {
      p.moon = true;
      items.helmet.visible = true;
    },
    end(items, p) {
      p.moon = false;
      items.helmet.visible = false;
      items.game.hud.toast('🌙 Se acabó la gravedad lunar: vuelves a pesar lo de siempre.');
    },
    tick(items, p) {
      // La escafandra va en la cabeza del piloto, que cambia al cambiar de personaje
      if (items.helmet.parent !== p.rider.head) p.rider.head.add(items.helmet);
      if (items.fx.t < 3) items.helmet.visible = Math.floor(items.fx.t * 8) % 2 === 0;
    },
  },
};

// Objetos que aparecen por la calle: se recoge uno, se lleva encima y se gasta con Q.
//
// En red el de la calle es uno para todos y lo pone el anfitrión (`simulate`); va en cada `foto`
// (`write`, `read`). Cada jugador detecta en su pantalla que lo toca y lo pide (`coge`): se lo
// queda el primero cuyo aviso llegue al anfitrión, que se lo da (`give`). Lo que se lleva encima
// y lo que hace efecto son de cada uno.
export class Items {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.held = null; // el que se lleva encima
    this.fx = null; // el que está haciendo efecto: { kind, t }
    this.last = null; // el último que salió a la calle
    this.cd = 6;
    this.fireT = 0;
    this.blips = [];
    // Solo hay uno por la calle cada vez
    const g = (this.group = new THREE.Group());
    g.visible = false;
    game.scene.add(g);
    const halo = new THREE.CircleGeometry(2.6, 28);
    halo.rotateX(-Math.PI / 2);
    this.halo = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.position.y = 0.15;
    g.add(this.halo);
    // serial: cuántos han salido ya, para saber en red de cuál se habla
    this.drop = { kind: null, mesh: null, x: 0, y: 0, z: 0, t: 0, far: 0, serial: 0, blip: { x: 0, z: 0, icon: '' } };
    this.askT = 0;

    // El gorro que se le planta al piloto y el cohete que se le ata al patinete
    this.hat = foilModel();
    this.hat.position.y = 0.72;
    this.hat.scale.setScalar(1.1);
    this.rocket = rocketModel();
    this.hat.visible = this.rocket.visible = false;
    this.hat.castShadow = this.rocket.castShadow = true;
    game.player.model.add(this.rocket);
    // Y la escafandra de la gravedad lunar
    this.helmet = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false }));
    this.helmet.position.y = 0.3;
    this.helmet.visible = false;

    // Onda del timbrazo
    const ring = new THREE.RingGeometry(0.86, 1, 48);
    ring.rotateX(-Math.PI / 2);
    this.wave = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.wave.visible = this.wave.frustumCulled = false;
    game.scene.add(this.wave);
    this.waveT = 1;
  }

  // A cuál le toca salir: de día solo los que no necesitan marcianos
  pick(night) {
    const i = ORDER.indexOf(this.last);
    for (let k = 1; k <= ORDER.length; k++) {
      const kind = ORDER[(i + k) % ORDER.length];
      if (night || !KINDS[kind].night) return kind;
    }
    return null;
  }

  // Lo deja en una calle cercana, mejor por delante: los studs marcan por dónde se puede pasar
  spawn(kind, p) {
    const spots = this.game.world.studs;
    for (let k = 0; k < 40; k++) {
      const s = spots[Math.floor(Math.random() * spots.length)];
      const dx = s.x - p.pos.x;
      const dz = s.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 35 || d > 95) continue;
      if (k < 25 && dx * Math.sin(p.heading) + dz * Math.cos(p.heading) < 0) continue;
      const h = this.T.height(s.x, s.z);
      if (Math.abs(h) > 0.8 || s.y - h > 3) continue;
      this.last = kind;
      this.show(kind, s.x, h, s.z, (this.drop.serial + 1) & 255);
      return true;
    }
    return false;
  }

  // Pone en la calle el objeto que toca
  show(kind, x, y, z, serial) {
    const D = this.drop;
    if (D.mesh) {
      this.group.remove(D.mesh);
      D.mesh.geometry.dispose();
    }
    D.kind = kind;
    D.mesh = KINDS[kind].model();
    D.x = x;
    D.y = y;
    D.z = z;
    D.t = D.far = 0;
    D.serial = serial;
    D.blip.icon = KINDS[kind].icon;
    this.group.add(D.mesh);
    this.group.position.set(x, y, z);
    this.group.visible = true;
  }

  // Jugando solo o en el anfitrión: el de la calle es para `p`, y deja de estar para los demás
  give(p) {
    const g = this.game;
    this.group.visible = false;
    if (g.party) this.cd = g.aliens.active ? EVERY : EVERY_DAY;
    g.to(p).giveItem(this.drop.kind);
  }

  // En el anfitrión: un invitado dice que ha tocado el de la calle. Si sigue ahí, es suyo
  claim(serial, r) {
    if (r && this.group.visible && serial === this.drop.serial) this.give(r);
  }

  // Al jugador de esta pantalla le ha tocado un objeto
  take(kind) {
    const g = this.game;
    const p = g.player;
    const K = KINDS[kind];
    if (!K) return;
    this.held = kind;
    g.sfx.pickup();
    g.hud.setItem(K);
    g.hud.big(`¡${K.name}!`, '#ffd23a', 1.2, true);
    g.bits.burst(p.pos.x, p.pos.y + 2, p.pos.z, [0xffd23a, 0xfff27a, 0xffffff], 14, 9, this.T.height(p.pos.x, p.pos.z), 0.4);
    g.hud.toast(`${K.icon} Llevas ${K.art || 'el'} <b>${K.name.toLowerCase()}</b>. ${K.tip}`);
  }

  use(p) {
    const K = KINDS[this.held];
    if (!K.use(this, p)) return;
    const g = this.game;
    if (K.dur) {
      this.fx = { kind: this.held, t: K.dur };
      K.start(this, p);
      g.hud.setItem(K, K.dur);
    } else g.hud.setItem(null);
    this.held = null;
    // En red el siguiente no espera a que este se gaste: la cuenta empieza al cogerlo (`give`)
    if (!g.party) this.cd = g.aliens.active ? EVERY : EVERY_DAY;
  }

  // Se acaba (o se corta) el efecto del que estaba en marcha
  stop(p) {
    if (!this.fx) return;
    KINDS[this.fx.kind].end(this, p);
    this.fx = null;
    this.game.hud.setItem(null);
  }

  // Onda que se abre por el suelo desde donde suena el timbre
  ring(x, y, z) {
    this.wave.position.set(x, y + 0.6, z);
    this.wave.visible = true;
    this.waveT = 0;
    this.game.here(x, z).bits.burst(x, y + 3, z, [0xffd23a, 0xfff27a, 0xffffff], 16, 12, y, 0.35);
  }

  // En red: otro jugador (`r`) ha hecho sonar el timbre
  rang(r) {
    if (!r) return;
    this.ring(r.pos.x, r.pos.y, r.pos.z);
    this.game.here(r.pos.x, r.pos.z).sfx.sonic();
  }

  update(dt, p, time) {
    const g = this.game;
    const D = this.drop;
    const party = g.party;
    const led = !!party && !party.hosting && party.fed;
    if (!led) this.simulate(dt, p);
    this.blips.length = 0;
    if (this.group.visible) {
      D.t += dt;
      const k = Math.min(1, D.t * 3);
      D.mesh.position.y = 1.5 + Math.sin(time * 2.6) * 0.3;
      D.mesh.rotation.y = time * 2.2;
      D.mesh.rotation.z = Math.sin(time * 9) * 0.22;
      D.mesh.scale.setScalar(1.3 * k * (1 + Math.sin(k * Math.PI) * 0.3));
      this.halo.material.opacity = 0.3 + Math.sin(time * 5) * 0.12;
      D.blip.x = D.x;
      D.blip.z = D.z;
      this.blips.push(D.blip);
      // Lo toca el jugador de esta pantalla: es suyo, o lo pide si el que manda es el anfitrión
      this.askT -= dt;
      const d = Math.hypot(p.pos.x - D.x, p.pos.z - D.z);
      if (d < 3.4 && Math.abs(p.pos.y - D.y) < 4 && p.crashT <= 0 && !p.held && !this.fx && !this.held && !g.busy(p)) {
        if (!led) this.give(p);
        else if (this.askT <= 0) {
          this.askT = 0.5;
          party.tell('coge', D.serial);
        }
      }
    }
    if (this.held && g.input.hit('item') && p.crashT <= 0 && !p.held) this.use(p);
    if (this.fx) {
      const F = this.fx;
      const K = KINDS[F.kind];
      F.t -= dt;
      if (F.t <= 0) this.stop(p);
      else {
        if (K.tick) K.tick(this, p, dt);
        g.hud.itemTime(F.t);
      }
    }

    if (this.waveT < 1) {
      this.waveT = Math.min(1, this.waveT + dt / 0.7);
      const e = 1 - (1 - this.waveT) ** 2;
      this.wave.scale.setScalar(1 + e * (SONIC_R - 1));
      this.wave.material.opacity = (1 - this.waveT) * 0.8;
      if (this.waveT >= 1) this.wave.visible = false;
    }
  }

  // Cuándo sale uno a la calle y cuándo se quita: solo jugando solo o en el anfitrión
  simulate(dt, p) {
    const g = this.game;
    const D = this.drop;
    const night = g.aliens.active;
    if (!this.group.visible) {
      // Jugando solo no sale otro mientras llevas uno o te dura su efecto; en red, lo que lleva
      // cada uno es cosa suya y sale cerca de alguien que no esté a otra cosa
      const who = g.party ? g.crowd(p).filter((o) => !g.busy(o) && !o.held) : !this.held && !this.fx && !p.held && (night || !g.missions.active) ? [p] : [];
      if (!who.length) return;
      // De noche no se hacen esperar aunque el anterior se gastara de día
      this.cd = Math.min(this.cd, night ? EVERY : EVERY_DAY) - dt;
      if (this.cd <= 0) this.cd = this.spawn(this.pick(night), who[Math.floor(Math.random() * who.length)]) ? 0 : 0.3;
    } else if (KINDS[D.kind].night && !night) this.group.visible = false;
    else {
      // Si se queda muy atrás de todos, vuelve a aparecer más a mano
      D.far = g.nearest2(D.x, D.z) > 150 * 150 ? D.far + dt : 0;
      if (D.far > 4) {
        this.group.visible = false;
        this.cd = 1;
      }
    }
  }

  // ---------- En red ----------
  // Lo que viaja en cada `foto`: si hay objeto en la calle, cuál y dónde
  get bytes() {
    return 8;
  }

  write(dv, o) {
    const D = this.drop;
    dv.setUint8(o, this.group.visible ? ORDER.indexOf(D.kind) + 1 : 0);
    dv.setUint8(o + 1, D.serial);
    dv.setInt16(o + 2, Math.round(D.x * 10), true);
    dv.setInt16(o + 4, Math.round(D.z * 10), true);
    dv.setInt16(o + 6, Math.round(D.y * 100), true);
    return o + 8;
  }

  // Invitado: el objeto no se mueve, así que basta con la foto más antigua de las dos
  read(a, b, o) {
    const kind = ORDER[a.getUint8(o) - 1];
    const serial = a.getUint8(o + 1);
    if (!kind) this.group.visible = false;
    else if (!this.group.visible || serial !== this.drop.serial || kind !== this.drop.kind) this.show(kind, a.getInt16(o + 2, true) / 10, a.getInt16(o + 6, true) / 100, a.getInt16(o + 4, true) / 10, serial);
    return o + 8;
  }
}
