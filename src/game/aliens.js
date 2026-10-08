import * as THREE from 'three';
import { createMinifig } from '../lego/minifig.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { BOUNDS } from '../world/cobena.js';
import { lift, grade } from '../world/relief.js';
import { damp, clamp, lerp } from '../core/rng.js';
import { walk } from './walker.js';

const SKIN = 0x7ddc1f;
const POOL = 9;
const HOVER = 27; // altura de crucero del platillo
const BEAM_R = 5.5;
const RISE = 5.6;
const G = 34;
const TAU = Math.PI * 2;
const GREEN = '#8dff6a';
const BIT_COLORS = [SKIN, 0xb6ff5a, 0x4b9f4a, C.purple, C.white];
const KICK_NAMES = ['¡Culetazo!', '¡Doble culetazo!', '¡Triple culetazo!', '¡Lluvia de marcianos!', '¡Culetazo galáctico!'];
const BEAM_COLD = new THREE.Color(0x7dff9a);
const BEAM_HOT = new THREE.Color(0xff5ad1);
const SNATCH_EVERY = 24; // segundos entre un intento de llevarse a un vecino y el siguiente
const LOW = 8; // atontado, el platillo baja hasta aquí: se le llega de un salto
const UFO_HITS = 3; // coscorrones para quitárselo al piloto
const RIDE_TIME = 40; // segundos que dura el paseo en el platillo robado
const RIDE_H = 17;
const RIG = { dist: 36, height: 17 };
const DAZE = 5.5; // lo que dura el aturdimiento del timbre sónico
const SLIDE = 2.5; // y lo que dura el de resbalar en su propia baba
const BOLT = 14; // segundos que corre un marciano desenmascarado de día antes de esfumarse
const AFOOT = new Set(['wander', 'alert', 'chase', 'tired', 'flee', 'laugh', 'dazed', 'bolt']);
const HOLDS = new Set(['abduct', 'carry', 'board', 'ride']); // estados en los que el platillo tiene a un jugador
// En red: cómo viajan en la `foto` los marcianos, el platillo y lo que este lleva colgando
const STATES = ['off', 'drop', 'wander', 'alert', 'chase', 'tired', 'flee', 'laugh', 'dazed', 'bolt', 'fly', 'beamup', 'sucked'];
const UFO_STATES = ['gone', 'arrive', 'hunt', 'rest', 'snatch', 'stun', 'board', 'ride', 'abduct', 'carry', 'leave'];
const KINDS = ['ped', 'car', 'cow'];
const POS = 10;
const ALT = 20;
const TURN = 256 / TAU;
const HEAD = 5 + 14 + 8 + 7 + 1; // oleada, platillo, a quién sube, quién cae y cuántos lleva dentro
const ALIEN = 8;
const CAR_NAMES = { car: 'un coche', taxi: 'un taxi', bus: 'el autobús', police: 'el coche patrulla', truck: 'un camión', icecream: 'el camión de los helados' };

const _v = new THREE.Vector3();

function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}

// La noche de los marcianos: al anochecer llega un platillo con su tropa.
// Los marcianos te persiguen de frente, pero por la espalda (o asustados por el turbo)
// se van de un culetazo. El rayo del platillo te abduce si te quedas debajo, y cuando no va
// a por ti se lleva a un vecino, un coche o una vaca: se les suelta cruzando el rayo de un salto.
// Cuando el platillo se queda atontado baja mucho: con tres coscorrones el piloto sale por los
// aires y el platillo es tuyo un rato, con su rayo y todo. El ladrón de la estatua va aparte, en
// heist.js, y la nave nodriza que baja cuando ya no quedan marcianos de la oleada, en boss.js.
// De día algunos se pasean disfrazados de vecino (disguise.js): al caérseles el disfraz salen de aquí.
//
// En red la invasión es una sola y cooperativa:
// - El anfitrión decide la oleada y mueve marcianos y platillo (`updateUfo`, `updateRescue`,
//   `updateAliens`); los invitados los pintan entre dos fotos suyas (`read`). Cada marciano va a por
//   el jugador que tenga más cerca que no esté a otra cosa, y el platillo elige a quién ronda.
// - Lo que le pasa a un jugador lo detecta su pantalla, contra lo que ve (`mine`): el culetazo, el
//   pisotón, que lo pillen, el rayo, el coscorrón al platillo y el rescate. Lo que cambia algo de
//   todos se lo pide al anfitrión con un `aviso` (`asked`); el combo y los studs son de cada uno.
// - Mientras el platillo tiene a un jugador (en el rayo, dentro o a los mandos), a su personaje lo
//   sigue moviendo su pantalla; a los mandos, además, el platillo va donde vaya él.
export class Aliens {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.wave = null;
    this.cleared = false;
    this.active = false;
    this.spawnT = 0;
    this.grabCd = 0;
    this.combo = 0;
    this.lastKick = -99;
    this.dawnT = 0;
    this.esc = 0;
    this.carry = null;
    this.cargo = null; // el jugador que tiene el platillo: en el rayo, dentro o a los mandos
    this.mode = null; // lo que el platillo le está haciendo al jugador de esta pantalla (uno de `HOLDS`)
    this.lagT = 0;
    this.sure = false; // el anfitrión ya lo ha dado por cogido
    this.quitT = 0;
    this.meter = 0; // lo que le falta al rayo para coger al jugador de esta pantalla
    this.stolen = 0;
    this.bonkCd = 0;
    this.saveCd = 0;
    this.led = false; // invitado de una partida en red: la invasión es la del anfitrión
    this.quiet = true; // no hay nada que contar en la `foto`
    this.whoSlot = 255; // invitado: a quién ronda o tiene el platillo, cuánto queda de paseo y dónde lo suelta
    this.rideK = 0;
    this.di = 255;
    this.kept = new Map(); // invitado: lo que tiene cogido el platillo del anfitrión, por su número
    this.seen = new Set();
    this.mateOf = null;
    this.shown = null;
    this.shownHits = null;
    this.humming = false;
    this.vic = null; // a quién se está llevando el platillo
    this.falling = null; // el que cae tras soltarlo
    this.lost = []; // los que ya tiene dentro
    this.ride = null; // el paseo en el platillo robado
    this.mate = null; // tu doble a los mandos
    this.snatchCd = 0;
    this.hints = [];
    this.blips = [];

    this.aliens = [];
    for (let i = 0; i < POOL; i++) this.aliens.push(this.makeAlien(i));
    this.buildUfo();

    // Sitios absurdos donde te suelta el platillo
    const P = game.world.places;
    this.drops = [
      { name: 'la Isla del Tesoro', x: P.mega.islandX - 6, z: P.mega.z + 4 },
      { name: 'la fuente de la Plaza de la Villa', x: P.plaza.x + 6, z: P.plaza.z },
      { name: 'la Pista Polideportiva', x: P.soccer.cx, z: P.soccer.cz },
      { name: 'la bolera del Recinto Ferial', x: P.bowling.x, z: P.bowling.z - 6 },
      { name: 'el skatepark', x: P.trick.x, z: P.trick.z },
    ].filter((d) => {
      const h = this.T.height(d.x, d.z);
      return h > -1 && h < 6;
    });
  }

  makeAlien(i) {
    const fig = createMinifig({
      skin: SKIN, face: 'alien', hair: 'antenna', hairColor: [C.red, C.yellow, C.pink][i % 3],
      torso: [C.purple, C.magenta, C.turquoise, C.orange, C.azure, C.lgray][i % 6], legs: i % 2 ? C.dgray : C.black,
      print: i % 3 === 0 ? 'star' : i % 3 === 1 ? 'bolt' : null, printColor: '#f7d117',
    });
    // Diana en el culo: ahí es donde hay que dar
    const b = new Builder();
    b.cyl(0.62, 0.08, 0, 1.75, -0.54, C.white, { axis: 'z', seg: 18 });
    b.cyl(0.42, 0.1, 0, 1.75, -0.56, C.red, { axis: 'z', seg: 18 });
    b.cyl(0.18, 0.12, 0, 1.75, -0.58, C.white, { axis: 'z', seg: 12 });
    fig.group.add(b.mesh(plastic));
    fig.group.rotation.order = 'YXZ';
    fig.group.visible = false;
    this.game.scene.add(fig.group);
    // by: quién lo ha mandado por los aires. own: invitado, lo lleva esta pantalla hasta que el anfitrión se entere
    return { fig, i, state: 'off', was: 'off', from: 'off', age: 0, spy: false, x: 0, y: 0, z: 0, px: 0, pz: 0, gy: 0, heading: 0, speed: 0, vx: 0, vy: 0, vz: 0, spin: 12, rot: 0, t: 0, cd: 0, far: 0, walk: i * 1.7, stuck: 0, detour: 0, detourDir: 0, dirT: 0, fx: 0, slick: 0, prey: null, preyT: 0, by: null, mine: false, own: null, ownT: 0, ownSeen: false, blip: { x: 0, z: 0 } };
  }

  buildUfo() {
    const scene = this.game.scene;
    const g = (this.ufo = new THREE.Group());
    const b = new Builder();
    b.sphere(7.6, 0, 0, 0, C.lgray, { seg: 28, seg2: 14, sy: 0.22 });
    b.cyl(8.0, 0.45, 0, 0, 0, C.dgray, { seg: 32 });
    b.cyl(4.2, 0.7, 0, 1.45, 0, C.stone, { seg: 24, r2: 3.5 });
    b.cyl(2.2, 0.9, 0, -1.7, 0, C.dgray, { seg: 20, r2: 3.4 });
    g.add(b.mesh(plastic));
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.3, 24, 12, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, roughness: 0.08, metalness: 0.1 })
    );
    dome.position.y = 1.7;
    const pilot = (this.pilot = createMinifig({ skin: SKIN, face: 'alien', hair: 'antenna', hairColor: C.red, torso: C.black, legs: C.black, print: 'star', printColor: '#f7d117' }));
    pilot.group.scale.setScalar(0.75);
    pilot.group.position.y = -0.3;
    pilot.armL.rotation.x = pilot.armR.rotation.x = -1.2;
    g.add(pilot.group, dome);
    // Luces giratorias del borde
    const lb = new Builder();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      lb.sphere(0.55, Math.cos(a) * 6.6, -0.75, Math.sin(a) * 6.6, [0xfff27a, 0x7dff9a, 0xff5ad1][i % 3], { seg: 10, seg2: 8 });
    }
    this.lights = new THREE.Mesh(lb.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    g.add(this.lights);
    this.light = new THREE.PointLight(0x7dff9a, 0, 70, 1);
    this.light.position.y = -8;
    g.add(this.light);
    g.visible = false;
    scene.add(g);

    // Rayo abductor y su círculo de luz en el suelo
    const bg = new THREE.CylinderGeometry(1.8, BEAM_R, 1, 28, 1, true);
    bg.translate(0, -0.5, 0);
    this.beamMat = glowMaterial(0x7dff9a, 0);
    this.beam = new THREE.Mesh(bg, this.beamMat);
    const sg = new THREE.CircleGeometry(BEAM_R, 32);
    sg.rotateX(-Math.PI / 2);
    this.spotMat = glowMaterial(0x7dff9a, 0);
    this.spotMat.polygonOffset = true;
    this.spotMat.polygonOffsetFactor = this.spotMat.polygonOffsetUnits = -2;
    this.spot = new THREE.Mesh(sg, this.spotMat);
    this.spot.renderOrder = 2;
    for (const m of [this.beam, this.spot]) {
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.u = { state: 'gone', x: 0, y: 0, z: 0, px: 0, pz: 0, lx: 0, lz: 0, vx: 0, vz: 0, t: 0, dur: 6, sx: 1, sz: 0, beam: 0, meter: 0, hits: 0, heading: 0, prey: null, preyT: 0, blip: { x: 0, z: 0, icon: '🛸' } };
  }

  // ---------- Oleadas ----------
  // who: los jugadores que hay por la calle. En red la oleada crece con ellos
  startWave(who) {
    const g = this.game;
    const level = g.save.invasions || 0;
    const crew = Math.max(1, who.length);
    // Los disfrazados que hayas echado de día ya no bajan esta noche
    const full = Math.min(28, 8 + level * 4);
    const base = Math.max(4, full - g.disguise.discount());
    this.wave = { level, goal: Math.round(base * (1 + (crew - 1) * 0.5)), count: 0, saved: 0, cut: full - base, crew };
    this.combo = 0;
    g.all.hud.big('¡Invasión!', GREEN, 1.8);
    g.all.sfx.invasion();
    this.hints = this.tips();
  }

  // Los consejos de la oleada, que cada pantalla va soltando a su ritmo
  tips() {
    const W = this.wave;
    return [
      [0.3, `🛸 ¡Los marcianos invaden Cobeña! Oleada <b>${W.level + 1}</b>${W.cut ? `, con <b>${W.cut}</b> menos por los disfrazados que echaste de día` : ''}: échalos a <b>culetazos</b>, embistiéndolos por la espalda.`, '¡Los marcianos invaden Cobeña! Échalos a culetazos, embistiéndolos por la espalda.'],
      [7, '💨 Con el <b>turbo</b> se asustan y salen huyendo: ¡es el momento de darles en el culo!'],
      [14, '🔦 No te quedes bajo el <b>rayo del platillo</b>. Si te atrapa, machaca <b>Espacio</b> para soltarte.'],
      [22, '🛸 Cuando el platillo se queda <b>atontado</b> (al soltarte del rayo o al rescatar a alguien) baja mucho: <b>salta</b> y dale un coscorrón. ¡Al tercero es tuyo!'],
      [30, '🟢 Ojo con la <b>baba verde</b> que dejan los marcianos: rodando por encima <b>derrapas</b>, pero si caes encima de un salto, <b>rebotas</b>. A ellos también les hace resbalar.'],
    ];
  }

  resume(who) {
    const g = this.game;
    const u = this.u;
    this.spawnT = 1.5;
    this.snatchCd = 14;
    // Con la oleada ya echada solo queda la nodriza: el platillo no vuelve
    if (this.wave.count >= this.wave.goal) return;
    // El platillo baja del cielo por el lado del campanario
    const p = this.anyone(who) || who[0];
    const bf = g.world.places.belfry || g.world.places.plaza;
    const dx = bf.x - p.pos.x;
    const dz = bf.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, 110 / d);
    u.x = p.pos.x + dx * k;
    u.z = p.pos.z + dz * k;
    u.y = HOVER + 110;
    u.vx = u.vz = 0;
    u.meter = u.hits = 0;
    this.setUfo('arrive');
  }

  retreat() {
    const u = this.u;
    this.endRide();
    for (const a of this.aliens) this.beamUp(a);
    if (u.state !== 'gone' && u.state !== 'leave') this.setUfo('leave');
    this.giveBack();
  }

  // El premio es para todos; el nivel de la siguiente, el mayor que haya superado cada uno
  victory() {
    const g = this.game;
    const W = this.wave;
    const reward = 3000 + W.level * 1000 + W.saved * 500;
    this.cleared = true;
    this.dawnT = 4.5;
    g.all.beat(W.level, reward);
    g.all.hud.big('¡Cobeña salvada!', GREEN, 2.6);
    g.all.sfx.fanfare();
    g.all.confetti();
    g.all.hud.toast(`🏆 ¡Invasión rechazada! Premio: <b>${reward.toLocaleString('es-ES')}</b> studs${W.saved ? `, con <b>${W.saved * 500}</b> por los rescates` : ''}. Volverán otra noche… con refuerzos y otra nodriza más dura.`, '¡Invasión rechazada! Volverán otra noche… con refuerzos y otra nodriza más dura.');
  }

  setUfo(state) {
    const u = this.u;
    u.state = state;
    u.t = 0;
    if (!HOLDS.has(state)) this.cargo = null;
    // Cada pasada puede ir a por otro
    if (state === 'hunt') u.prey = null;
    if (state === 'rest') {
      const a = Math.random() * TAU;
      u.sx = Math.sin(a);
      u.sz = Math.cos(a);
      u.dur = 6;
    }
  }

  // ---------- Bucle ----------
  update(dt, p, time, inp) {
    const g = this.game;
    const party = g.party;
    const led = !!party && !party.hosting && party.fed;
    // Al entrar en la partida de otro, o al acabarse, lo que hubiera a medias en esta pantalla se deja como estaba
    if (led !== this.led) this.reset(p, led);
    const who = g.crowd(p);
    if (led) this.u.t += dt;
    else this.direct(dt, who);
    g.sfx.invaded(this.active);
    if (this.active && this.hints.length) {
      for (const h of this.hints) h[0] -= dt;
      if (this.hints[0][0] <= 0) g.hud.toast(...this.hints.shift().slice(1));
    }
    this.grabCd -= dt;
    this.bonkCd -= dt;
    this.saveCd -= dt;
    this.quitT -= dt;
    for (const a of this.aliens) a.cd -= dt;
    if (!led) {
      this.updateUfo(dt, who, time, inp);
      this.updateRescue(dt, time);
      this.updateAliens(dt, who, time);
    }
    this.mine(dt, p, time, inp);
    this.present(dt, p, time, inp);
  }

  // La oleada: cuándo empieza, cuándo se esconden y cuándo amanece. Solo jugando solo o en el anfitrión
  direct(dt, who) {
    const g = this.game;
    const night = g.env.target > 0.5;
    // En red no hay tregua mientras alguien juega un minijuego: la invasión sigue y a él no le hacen caso
    const truce = !g.party && !!g.missions.active;
    if (!night) {
      if (this.wave && !this.cleared) g.all.hud.toast('☀️ Con la luz del día los marcianos se esconden… pero volverán esta noche.');
      this.wave = null;
      this.cleared = false;
    } else if (!this.wave && !truce) this.startWave(who);
    const on = night && !!this.wave && !this.cleared && !truce;
    if (on !== this.active) {
      this.active = on;
      if (on) this.resume(who);
      else this.retreat();
    }
    if (this.dawnT > 0) {
      this.dawnT -= dt;
      if (this.dawnT <= 0 && g.env.target > 0.5) g.env.toggle(true);
    }
  }

  // Deja la invasión de esta pantalla en blanco: la que venga después es otra (la del anfitrión, o
  // la propia al acabarse la partida en red)
  reset(p, led) {
    const g = this.game;
    const u = this.u;
    this.led = led;
    for (const v of new Set([this.vic, this.falling, ...this.lost, ...this.kept.values()])) if (v && v.lifting) this.restore(v);
    this.vic = this.falling = null;
    this.lost.length = 0;
    this.kept.clear();
    if (this.mode) {
      this.mode = null;
      this.release(p);
      g.camera3.rig = null;
      g.hud.ride(null);
      g.hud.abduct(null);
    }
    this.ride = this.cargo = this.wave = null;
    this.active = this.cleared = false;
    this.quiet = true;
    this.hints = [];
    this.meter = this.dawnT = 0;
    for (const a of this.aliens) {
      a.state = 'off';
      a.own = a.by = a.prey = null;
    }
    u.state = 'gone';
    u.beam = u.meter = u.hits = 0;
    u.prey = null;
  }

  // Un jugador cualquiera de los que pueden ser el blanco de algo: ni a otra cosa, ni cogido, ni por los suelos
  anyone(who) {
    const g = this.game;
    const list = who.filter((pl) => !g.busy(pl) && !pl.held && !pl.hidden && pl.crashT <= 0);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  // ¿Sigue en la partida? (los que van dentro del platillo no cuentan como «por la calle»)
  around(pl) {
    const g = this.game;
    return pl === g.player || (!!g.party && g.party.remotes.get(pl.slot) === pl);
  }

  // A quién ronda o tiene el platillo, visto desde esta pantalla
  who() {
    return this.led ? this.game.party.bySlot(this.whoSlot) : this.cargo || this.u.prey;
  }

  // ¿Tiene el platillo a ese jugador (en el rayo, dentro o a los mandos)?
  has(p) {
    return this.led ? HOLDS.has(this.u.state) && this.game.party.isMe(this.whoSlot) : this.cargo === p;
  }

  // ---------- Platillo ----------
  // A quién ronda: el que tenga más cerca que no esté a otra cosa, y de una pasada a otra cambia si hay varios a mano
  mark(who, dt) {
    const g = this.game;
    const u = this.u;
    u.preyT -= dt;
    const ok = (pl) => !g.busy(pl) && !pl.hidden;
    if (u.prey && u.preyT > 0 && who.includes(u.prey) && ok(u.prey)) return u.prey;
    let best = null;
    let near = Infinity;
    const close = [];
    for (const pl of who) {
      if (!ok(pl)) continue;
      const d = (pl.pos.x - u.x) ** 2 + (pl.pos.z - u.z) ** 2;
      if (d < near) {
        near = d;
        best = pl;
      }
      if (d < 220 * 220) close.push(pl);
    }
    if (!u.prey && close.length > 1) best = close[Math.floor(Math.random() * close.length)];
    u.prey = best;
    u.preyT = 8;
    return best;
  }

  // ¿Se ha quedado el platillo sin el jugador que tenía? (lo han recolocado, se ha ido de la partida...)
  lostCargo() {
    const c = this.cargo;
    if (!c) return true;
    if (c === this.game.player) return !c.held;
    // El de otra pantalla tarda un momento en enterarse de que lo tiene
    return !this.around(c) || (this.u.t > 1.2 && !c.held);
  }

  // Por dónde vuela y qué hace con el rayo. Solo jugando solo o en el anfitrión
  updateUfo(dt, who, time, inp) {
    const u = this.u;
    const g = this.game;
    if (u.state === 'gone') return;
    u.t += dt;
    const lvl = this.wave ? this.wave.level : 0;
    const c = this.cargo;
    const prey = c || this.mark(who, dt);
    // Sin nadie a por quien ir, se queda donde esté
    const p = prey || who[0];
    const dx = p.pos.x - u.x;
    const dz = p.pos.z - u.z;
    const d = Math.hypot(dx, dz);
    let beamOn = false;
    let vmax = 0;
    let gain = 1.4;
    let tx = u.x;
    let tz = u.z;
    let yT = HOVER;
    if (!p.foil) {
      u.lx = p.pos.x;
      u.lz = p.pos.z;
    }
    switch (u.state) {
      case 'arrive':
        if (u.t > 2.6) this.setUfo('hunt');
        break;
      case 'hunt':
        if (!prey) break;
        if (p.foil) {
          // Con el gorro de aluminio te pierde: barre con el rayo por donde te vio la última vez
          tx = u.lx + Math.sin(time * 0.9) * 16;
          tz = u.lz + Math.cos(time * 0.7) * 16;
          vmax = 15;
          beamOn = true;
        } else {
          p.velocity(_v);
          tx = p.pos.x + _v.x * 0.45;
          tz = p.pos.z + _v.z * 0.45;
          vmax = d > 150 ? 48 : Math.min(27, 20.5 + lvl * 1.2);
          beamOn = d < 60;
        }
        if (u.t > 13) this.setUfo('rest');
        break;
      case 'rest':
        // Se aparta un poco mientras recarga el rayo
        tx = p.pos.x + u.sx * 45;
        tz = p.pos.z + u.sz * 45;
        vmax = 30;
        yT = HOVER + 9;
        if (u.t > u.dur) this.setUfo(this.pickVictim(p) ? 'snatch' : 'hunt');
        break;
      case 'snatch':
        if (!this.vic) {
          this.setUfo('hunt');
          break;
        }
        // Se pega a su presa (más apretado que a ti, o a un coche no lo alcanza nunca)
        tx = this.vic.x;
        tz = this.vic.z;
        vmax = 38;
        gain = 4;
        beamOn = this.vic.lifting || Math.hypot(tx - u.x, tz - u.z) < 25;
        break;
      case 'stun':
        // Atontado pierde altura y se tambalea hacia ti: es el momento de saltar y darle
        tx = p.pos.x;
        tz = p.pos.z;
        vmax = 7;
        if (u.t > 6) this.setUfo('rest');
        break;
      case 'board':
        // Sin piloto: su propio rayo sube a los mandos al que se lo ha quitado
        beamOn = true;
        if (this.lostCargo()) {
          this.endRide();
          this.setUfo('rest');
        } else if (u.t > 1.1) this.takeSeat(c);
        break;
      case 'ride':
        yT = RIDE_H;
        beamOn = this.updateRide(dt, c, inp);
        break;
      case 'abduct':
        beamOn = true;
        // Si el de otra pantalla no llega arriba ni se suelta (se ha vuelto al menú), no lo espera más
        if (this.lostCargo() || (c !== g.player && u.t > 9)) this.setUfo('rest');
        break;
      case 'carry':
        yT = HOVER + 14;
        this.updateCarry(dt);
        break;
      default:
        break;
    }
    if (u.state === 'leave') {
      u.y += (20 + u.t * 70) * dt;
      if (u.t > 3) {
        u.state = 'gone';
        u.beam = u.meter = 0;
        return;
      }
    }
    if (u.state !== 'carry' && u.state !== 'ride') {
      const ex = tx - u.x;
      const ez = tz - u.z;
      const ed = Math.hypot(ex, ez) || 1;
      const sp = Math.min(vmax, ed * gain);
      u.vx = damp(u.vx, (ex / ed) * sp, 2.2, dt);
      u.vz = damp(u.vz, (ez / ed) * sp, 2.2, dt);
      u.x += u.vx * dt;
      u.z += u.vz * dt;
    }
    const roof = this.T.height(u.x, u.z);
    const low = u.state === 'stun' || u.state === 'board';
    if (u.state !== 'leave') u.y = damp(u.y, low ? roof + LOW : Math.max(yT, roof + 9), low ? 2.6 : 1.6, dt);

    // Cuánto le falta al rayo para coger a quien ronda. Con el jugador de esta pantalla lo lleva
    // `mine`; con el de otra, que es quien dirá si lo ha cogido, aquí solo se calcula para que se vea
    if (u.state === 'hunt' && prey) {
      if (p === g.player) u.meter = this.meter;
      else {
        const inBeam = u.beam > 0.6 && d < BEAM_R && p.pos.y < u.y - 4 && p.crashT <= 0 && p.invuln <= 0 && !p.held && !p.foil;
        u.meter = clamp(u.meter + (inBeam ? dt / 0.85 : -dt * 1.1), 0, 1);
      }
    } else if (u.state !== 'abduct') u.meter = Math.max(0, u.meter - dt * 2);
    u.beam = damp(u.beam, beamOn ? 1 : 0, 6, dt);
  }

  // Dentro del platillo: vuelo exprés a otra punta del pueblo
  take(p) {
    const g = this.game;
    const u = this.u;
    const home = g.world.places.homes[p.char.id];
    const spots = [...this.drops.map((d, i) => ({ ...d, i })), { name: this.doorstep(home), x: home.spawn.x, z: home.spawn.z, i: -1 }];
    let cands = spots.filter((d) => Math.hypot(d.x - p.pos.x, d.z - p.pos.z) > 130);
    if (!cands.length) cands = spots;
    const dest = cands[Math.floor(Math.random() * cands.length)];
    const dist = Math.hypot(dest.x - u.x, dest.z - u.z);
    this.carry = { x0: u.x, z0: u.z, dest, dur: clamp(dist / 140, 2.2, 4.5) };
    this.setUfo('carry');
    this.cargo = p;
  }

  // Cómo se llama el sitio de donde sale cada uno
  doorstep(home) {
    return home.drop || home.roam || home.spot ? home.name : 'la puerta de casa';
  }

  updateCarry(dt) {
    const u = this.u;
    const c = this.carry;
    if (this.lostCargo()) {
      this.setUfo('rest');
      return;
    }
    const k = Math.min(1, u.t / c.dur);
    const e = k * k * (3 - 2 * k);
    const nx = lerp(c.x0, c.dest.x, e);
    const nz = lerp(c.z0, c.dest.z, e);
    u.vx = (nx - u.x) / dt;
    u.vz = (nz - u.z) / dt;
    u.x = nx;
    u.z = nz;
    if (k < 1) return;
    // Ha llegado: quien iba dentro se da por soltado al verlo (`quit`)
    u.vx = u.vz = 0;
    this.setUfo('rest');
    u.dur = 11;
  }

  // El platillo se queda sin el jugador que tenía, que se ha ido a otra parte
  dropCargo() {
    this.endRide();
    if (HOLDS.has(this.u.state)) this.setUfo('rest');
  }

  // Suelta al patinete esté donde esté
  release(p) {
    if (!p.held) return;
    p.held = false;
    p.hidden = false;
    p.flip = 0;
    p.dropped = true;
    p.launch(0, 3, 0, null);
    p.invuln = 2.2;
  }

  // ---------- Robarle el platillo ----------
  // Timbre sónico: deja tontos a los marcianos de alrededor, y al platillo si anda cerca. En un
  // invitado solo cuenta a cuántos coge: quien los aturde es el anfitrión, al enterarse del timbrazo
  sonic(x, z, r) {
    const u = this.u;
    const dry = this.led;
    let n = 0;
    for (const a of this.aliens) {
      if (!AFOOT.has(a.state) || a.own || Math.hypot(a.x - x, a.z - z) > r) continue;
      n++;
      if (dry) continue;
      a.state = 'dazed';
      a.t = DAZE;
      a.cd = a.fx = 0;
    }
    if (this.game.heist.sonic(x, z, r, dry)) n++;
    const ufo = (u.state === 'hunt' || u.state === 'rest' || u.state === 'snatch') && Math.hypot(u.x - x, u.z - z) < r * 1.4;
    if (ufo && !dry) this.setUfo('stun');
    return { n, ufo, boss: this.game.boss.sonic(x, z, r, dry) };
  }

  // Coscorrón al platillo atontado. El bote y la sacudida ya se los ha llevado quien lo da (`mine`)
  hitUfo(p) {
    const g = this.game;
    const u = this.u;
    if (u.state !== 'stun' || u.t < 0.3) return;
    u.hits++;
    const near = g.at(u.x, u.z);
    near.bits.burst(u.x, u.y - 2.4, u.z, [0xfff27a, 0xffffff, 0xd9dde0], 16, 12, this.T.height(u.x, u.z), 0.45);
    near.sfx.ufoHit();
    const to = g.to(p);
    to.hud.trick('¡Coscorrón al platillo!', 1000 * u.hits, 1);
    to.addStuds(100 * u.hits);
    if (u.hits >= UFO_HITS) {
      this.steal(p);
      return;
    }
    to.hud.big(u.hits === UFO_HITS - 1 ? '¡Uno más y es tuyo!' : '¡Coscorrón!', '#ffd23a', 1.1, true);
    u.y += 2;
    this.setUfo('rest');
    u.dur = 5;
  }

  // Al tercer coscorrón el piloto sale por los aires y el rayo sube a quien se lo ha dado
  steal(p) {
    const g = this.game;
    const u = this.u;
    this.eject(u.x, u.y + 2, u.z);
    this.ride = { t: RIDE_TIME };
    this.setUfo('board');
    this.cargo = p;
    if (p === g.player) {
      this.hold(p);
      this.setMode('board');
    }
    const to = g.to(p);
    to.hud.big('¡El platillo es tuyo!', '#ffd23a', 2.2);
    to.sfx.fanfare();
    to.confetti(u.x, u.y, u.z);
    g.party?.news(p, 'ha robado el platillo 🛸');
  }

  // Un marciano sale por los aires desde ahí arriba (el piloto del platillo, el comandante de la nodriza)
  eject(x, y, z) {
    const a = this.aliens.find((o) => o.state === 'off');
    if (!a) return;
    const ang = Math.random() * TAU;
    a.x = x;
    a.z = z;
    a.y = y;
    a.state = 'fly';
    a.spy = false;
    a.by = null;
    a.t = a.rot = a.fx = 0;
    a.vx = Math.sin(ang) * 16;
    a.vz = Math.cos(ang) * 16;
    a.vy = 24;
    a.spin = 14;
    a.heading = ang;
  }

  // Llega la nodriza: el platillo suelta lo que lleve y se recoge
  dock() {
    this.setUfo('leave');
    this.giveBack();
  }

  takeSeat(p) {
    // A los mandos, el platillo mira hacia donde mire él
    if (p !== this.game.player) this.u.heading = p.heading;
    this.giveBack();
    this.setUfo('ride');
  }

  // Con un jugador a los mandos: el reloj del paseo y el rayo. Por dónde va lo lleva la pantalla de
  // quien pilota (`drive`); si es de otra, el platillo está donde esté él. Devuelve si el rayo va encendido
  updateRide(dt, p, inp) {
    const g = this.game;
    const u = this.u;
    const r = this.ride;
    if (this.lostCargo()) {
      this.endRide();
      this.setUfo('rest');
      return false;
    }
    r.t -= dt;
    if (r.t <= 0) {
      this.endRide();
      this.setUfo('rest');
      u.dur = 10;
      g.to(p).sfx.escape();
      g.to(p).hud.toast('🛸 Se acabó el paseo: otro marciano se ha colado en el platillo y te ha echado. Con otros tres coscorrones vuelve a ser tuyo.');
      return false;
    }
    const mine = p === g.player;
    if (!mine) {
      u.x = p.pos.x;
      u.z = p.pos.z;
      u.vx = p.vel.x;
      u.vz = p.vel.z;
      u.heading = p.heading;
    }
    const beam = mine ? inp.jump : p.key;
    if (beam && u.beam > 0.5) this.suck(p);
    else if (!beam && this.vic) {
      // Apagar el rayo deja caer lo que estuviera subiendo
      this.vic.vy = 0;
      this.falling = this.vic;
      this.vic = null;
    }
    return beam;
  }

  // El rayo, en manos de un jugador: se lleva a los marcianos que pilla debajo y, de paso, lo que haya
  suck(p) {
    const g = this.game;
    const u = this.u;
    for (const a of this.aliens) {
      if (!AFOOT.has(a.state) || Math.hypot(a.x - u.x, a.z - u.z) > BEAM_R + 0.5) continue;
      a.state = 'sucked';
      a.t = 0;
    }
    if (this.vic || this.falling) return;
    const under = (o, r) => !o.taken && Math.hypot(o.x - u.x, o.z - u.z) < r;
    let kind = 'cow';
    let ref = g.cows.list.find((o) => under(o, BEAM_R));
    if (!ref) {
      kind = 'car';
      ref = g.traffic.cars.find((o) => under(o, BEAM_R + 1));
    }
    if (!ref) {
      kind = 'ped';
      ref = g.traffic.peds.find((o) => under(o, BEAM_R) && o.fly <= 0);
    }
    if (!ref) return;
    this.vic = this.victim(kind, ref, 10);
    this.lift(this.vic);
    g.to(p).sfx.beamGrab();
  }

  // Lo que sube por el rayo del que pilota se queda a bordo hasta que se acaba el paseo
  gulp(v) {
    const to = this.game.to(this.cargo || this.game.player);
    this.vic = null;
    v.obj.visible = false;
    this.lost.push(v);
    to.sfx.slurp();
    if (v.kind === 'cow') to.sfx.moo();
    to.hud.trick(v.kind === 'cow' ? '¡Vaca a bordo!' : v.kind === 'car' ? '¡Coche a bordo!' : '¡Vecino a bordo!', 300, 1);
    to.addStuds(30);
  }

  // Se acabó el paseo (o no llegó a empezar): el platillo vuelve a tener piloto
  endRide() {
    if (!this.ride) return;
    this.ride = null;
    this.u.hits = 0;
    this.giveBack();
  }

  // ---------- Rescate de vecinos ----------
  // Elige a quién llevarse: alguien a quien al jugador que ronda le dé tiempo a llegar. Las vacas le pierden.
  pickVictim(p) {
    if (this.snatchCd > 0 || this.falling) return false;
    const g = this.game;
    const near = (o) => {
      const d = Math.hypot(o.x - p.pos.x, o.z - p.pos.z);
      return !o.taken && d > 30 && d < 220;
    };
    const cows = g.cows.list.filter(near);
    const cars = g.traffic.cars.filter(near);
    const peds = g.traffic.peds.filter((o) => near(o) && o.fly <= 0 && Math.abs(this.T.height(o.x, o.z)) < 0.8);
    let kind = 'ped';
    let from = peds;
    if (cows.length && Math.random() < 0.6) [kind, from] = ['cow', cows];
    else if (cars.length && (!peds.length || Math.random() < 0.3)) [kind, from] = ['car', cars];
    else if (!peds.length) [kind, from] = ['cow', cows];
    if (!from.length) return false;
    const ref = from[Math.floor(Math.random() * from.length)];
    const lvl = this.wave ? this.wave.level : 0;
    this.vic = this.victim(kind, ref, Math.min(3.4, 2.3 + lvl * 0.15));
    this.snatchCd = SNATCH_EVERY;
    g.all.sfx.sos();
    g.all.hud.toast(g.save.rescues
      ? `🆘 ¡El platillo va a por <b>${this.vic.name}</b>!`
      : `🆘 ¡El platillo va a por <b>${this.vic.name}</b>! <b>Salta</b> y cruza el rayo por el aire para cortarlo.`, '¡El platillo va a por un vecino!');
    return true;
  }

  victim(kind, ref, rise) {
    const g = this.game;
    const list = kind === 'ped' ? g.traffic.peds : kind === 'car' ? g.traffic.cars : g.cows.list;
    return {
      kind, ref, id: (KINDS.indexOf(kind) << 6) | (list.indexOf(ref) & 63), obj: kind === 'ped' ? ref.fig.group : kind === 'car' ? ref.mesh : ref.group,
      name: kind === 'ped' ? 'un vecino' : kind === 'car' ? CAR_NAMES[ref.kind] : 'una vaca',
      x: ref.x, z: ref.z, gy: 0, h: 0, vy: 0, k: 0, heading: 0, spin: 0, lifting: false, rise, blip: { x: ref.x, z: ref.z, icon: '🆘' },
    };
  }

  // El rayo lo despega del suelo
  lift(v) {
    v.ref.taken = true;
    v.lifting = true;
    v.gy = v.kind === 'ped' ? this.T.height(v.x, v.z) : 0;
    v.heading = v.obj.rotation.y;
  }

  // Lo que sube por el rayo y lo que cae al cortarlo. Solo jugando solo o en el anfitrión
  updateRescue(dt, time) {
    const g = this.game;
    const u = this.u;
    const v = this.vic;
    this.snatchCd -= dt;
    if (v && u.state !== 'snatch' && u.state !== 'ride') {
      // El platillo se va (amanece, empieza un minijuego...): lo que tuviera en el rayo, al suelo
      this.vic = null;
      if (v.lifting) this.falling = v;
    } else if (v && !v.lifting) {
      const r = v.ref;
      v.x = r.x;
      v.z = r.z;
      if (u.t > 12 || (v.kind === 'ped' && r.fly > 0)) {
        this.vic = null;
        this.setUfo('hunt');
      } else if (Math.hypot(u.x - v.x, u.z - v.z) < (v.kind === 'car' ? 5 : 3)) {
        this.lift(v);
        g.all.hud.big('¡Socorro!', '#ffd23a', 1.1, true);
        g.at(v.x, v.z).sfx.beamGrab();
      }
    } else if (v) {
      v.h += v.rise * dt;
      v.k = clamp(v.h / (u.y - 4.5 - v.gy), 0, 1);
      v.x = damp(v.x, u.x, 4, dt);
      v.z = damp(v.z, u.z, 4, dt);
      // Mientras sube a otro el rayo no coge a nadie: cruzarlo por el aire lo corta (`mine`)
      if (v.k >= 1 && this.ride) this.gulp(v);
      else if (v.k >= 1) this.swallow(v);
    }

    const f = this.falling;
    if (!f) return;
    f.vy -= G * dt;
    f.h += f.vy * dt;
    f.k = damp(f.k, 0, 5, dt);
    f.x = damp(f.x, f.ref.x, 5, dt);
    f.z = damp(f.z, f.ref.z, 5, dt);
    if (f.h > 0) return;
    this.falling = null;
    this.restore(f);
    const near = g.at(f.x, f.z);
    near.bits.burst(f.x, f.gy + 0.8, f.z, [0xb6ff5a, 0xffffff, 0xd9dde0], 12, 8, f.gy, 0.4);
    if (f.kind === 'ped') near.sfx.land(9);
    else near.sfx.bump();
    if (f.kind === 'cow') near.sfx.moo();
  }

  // Colgando del rayo: gira, patalea y encoge al entrar en el platillo
  pose(v, time) {
    const o = v.obj;
    o.visible = true;
    o.scale.setScalar(v.k > 0.8 ? lerp(1, 0.3, (v.k - 0.8) / 0.2) : 1);
    o.position.set(v.x, v.gy + v.h, v.z);
    o.rotation.set(Math.sin(time * 3) * 0.25, v.heading + v.spin, Math.cos(time * 2.3) * 0.25);
    if (v.kind !== 'ped') return;
    const f = v.ref.fig;
    const s = Math.sin(time * 16);
    f.armL.rotation.x = -2.7 + s * 0.4;
    f.armR.rotation.x = -2.7 - s * 0.4;
    f.legL.rotation.x = s * 0.6;
    f.legR.rotation.x = -s * 0.6;
  }

  // Un jugador ha cruzado el rayo por el aire y lo ha cortado: el premio es suyo
  rescue(p, v, high) {
    const g = this.game;
    const pts = high ? 2500 : 1500;
    this.vic = null;
    this.falling = v;
    v.vy = 0;
    if (this.wave) this.wave.saved++;
    const to = g.to(p);
    to.tally('rescues');
    to.addStuds(pts / 10);
    to.hud.trick(high ? '¡Rescate aéreo!' : '¡Rescate!', pts, 1);
    to.hud.big(v.kind === 'cow' ? '¡Vaca a salvo!' : v.kind === 'car' ? '¡A salvo!' : '¡Vecino a salvo!', '#ffd23a', 1.2, true);
    to.sfx.rescue();
    g.at(p.pos.x, p.pos.z).bits.burst(p.pos.x, p.pos.y + 1.5, p.pos.z, [0xb6ff5a, 0xfff27a, 0xffffff], 18, 12, v.gy, 0.5);
    this.setUfo('stun');
  }

  // Tarde: ya está dentro del platillo, y ahí se queda hasta que se marche
  swallow(v) {
    const g = this.game;
    this.vic = null;
    v.obj.visible = false;
    this.lost.push(v);
    g.all.sfx.abducted();
    g.all.hud.toast(`👽 ¡Tarde! <b>${v.name[0].toUpperCase()}${v.name.slice(1)}</b> ya va dentro del platillo. Echa a los marcianos para que suelte su botín.`, '¡Tarde! Ya va dentro del platillo. Echa a los marcianos para que suelte su botín.');
    this.setUfo('rest');
  }

  restore(v) {
    v.ref.taken = false;
    v.lifting = false;
    v.obj.visible = true;
    v.obj.scale.setScalar(1);
    v.obj.position.set(v.ref.x, v.gy, v.ref.z);
    v.obj.rotation.set(0, v.heading, 0);
  }

  // Al irse, el platillo deja a todos donde los cogió
  giveBack() {
    const n = this.lost.length;
    if (!n) return;
    for (const v of this.lost) this.restore(v);
    this.lost.length = 0;
    this.game.all.hud.toast(n > 1 ? `🛸 El platillo suelta a los <b>${n}</b> que se había llevado.` : '🛸 El platillo suelta al que se había llevado.');
  }

  // ---------- Marcianos a pie ----------
  spawn(a, p) {
    const T = this.T;
    for (let k = 0; k < 14; k++) {
      // Casi siempre por delante, para que se crucen en tu camino
      const ang = k < 8 ? p.heading + (Math.random() - 0.5) * 2.4 : Math.random() * TAU;
      const r = 50 + Math.random() * 35;
      const x = p.pos.x + Math.sin(ang) * r;
      const z = p.pos.z + Math.cos(ang) * r;
      if (x < BOUNDS.x0 + 10 || x > BOUNDS.x1 - 10 || z < BOUNDS.z0 + 10 || z > BOUNDS.z1 - 10) continue;
      const h = T.height(x, z);
      if (h > 0.8 || h < -0.5) continue;
      a.x = x;
      a.z = z;
      a.gy = h;
      a.y = h + 30;
      a.heading = Math.random() * TAU;
      a.state = 'drop';
      a.spy = false;
      a.cd = 0;
      a.far = a.stuck = a.detour = a.slick = 0;
      a.by = null;
      // Baja a por ese
      a.prey = p;
      a.preyT = 3;
      return true;
    }
    return false;
  }

  // A un vecino se le ha caído el disfraz (disguise.js): el marciano que iba debajo pega un bote
  // del susto y echa a correr. Devuelve null si no queda ninguno libre.
  bolt(x, z, heading) {
    const a = this.aliens.find((o) => o.state === 'off');
    if (!a) return null;
    a.x = x;
    a.z = z;
    a.y = a.gy = this.T.height(x, z);
    a.heading = heading;
    a.state = 'bolt';
    a.spy = true;
    a.t = BOLT;
    a.cd = 0.6;
    a.far = a.stuck = a.detour = a.slick = a.fx = 0;
    a.by = a.prey = null;
    return a;
  }

  beamUp(a) {
    if (a.state === 'off' || a.state === 'fly' || a.state === 'beamup' || a.state === 'sucked') return;
    a.state = 'beamup';
    a.t = 0;
  }

  // A por quién va cada uno: el jugador que tenga más cerca que no esté a otra cosa ni en el rayo.
  // Lo revisa de vez en cuando, que mirarlo cada fotograma lo haría bailar entre dos
  target(a, who, dt) {
    const g = this.game;
    a.preyT -= dt;
    const ok = (pl) => !g.busy(pl) && !pl.held && !pl.hidden;
    if (a.prey && a.preyT > 0 && who.includes(a.prey) && ok(a.prey)) return a.prey;
    let best = null;
    let near = Infinity;
    for (const pl of who) {
      if (!ok(pl)) continue;
      const d = (pl.pos.x - a.x) ** 2 + (pl.pos.z - a.z) ** 2;
      if (d < near) {
        near = d;
        best = pl;
      }
    }
    a.prey = best;
    a.preyT = 0.6 + Math.random() * 0.4;
    return best;
  }

  // Por los aires tras el culetazo. Devuelve la altura del suelo al caer, o null si sigue volando
  flight(a, dt) {
    const T = this.T;
    a.t += dt;
    a.vy -= G * dt;
    const nx = a.x + a.vx * dt;
    const nz = a.z + a.vz * dt;
    if (T.height(nx, nz) - a.y > 1) {
      a.vx *= -0.35;
      a.vz *= -0.35;
    } else {
      a.x = nx;
      a.z = nz;
    }
    a.y += a.vy * dt;
    const fl = T.height(a.x, a.z);
    return (a.y <= fl && a.vy < 0) || a.t > 6 ? fl : null;
  }

  // Lo que hace cada marciano. Solo jugando solo o en el anfitrión. who: los jugadores que hay por la calle
  updateAliens(dt, who, time) {
    const g = this.game;
    const T = this.T;
    const W = this.wave;
    const lvl = W ? W.level : 0;
    const u = this.u;
    const rider = u.state === 'ride' ? this.cargo : null;
    // Les asusta el turbo... y ver su platillo en manos de un jugador
    for (const pl of who) pl.scare = pl.boosting && pl.crashT <= 0 && !pl.held ? 1.3 : (pl.scare || 0) - dt;
    if (rider) rider.scare = 1.3;
    let walking = 0;
    for (const a of this.aliens) {
      if (a.state === 'off') continue;
      a.speed = 0;
      if (a.state === 'fly') {
        const fl = this.flight(a, dt);
        if (fl !== null) this.pop(a, fl);
        continue;
      }
      if (a.state === 'beamup') {
        a.t += dt;
        a.y += 38 * dt;
        if (a.t > 0.7) a.state = 'off';
        continue;
      }
      if (a.state === 'sucked') {
        // Por el rayo arriba, al platillo que ahora lleva un jugador
        a.t += dt;
        a.x = damp(a.x, u.x, 6, dt);
        a.z = damp(a.z, u.z, 6, dt);
        a.y += 26 * dt;
        if (a.y > u.y - 3 || a.t > 1.6) {
          a.state = 'off';
          if (rider) {
            g.to(rider).sfx.slurp();
            this.score(rider, time, '¡Marciano abducido!', 600);
          }
        }
        continue;
      }
      walking++;
      if (a.state === 'drop') {
        a.y -= 46 * dt;
        if (a.y <= a.gy) {
          a.y = a.gy;
          a.state = 'wander';
          a.t = 1;
          a.dirT = a.heading;
          // Donde aterriza queda un charco de baba
          g.slime.splat(a.x, a.z, 2.6);
        }
        continue;
      }

      const prey = this.target(a, who, dt);
      const p = prey || who[0];
      const dx = p.pos.x - a.x;
      const dz = p.pos.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const toP = Math.atan2(dx, dz);
      const pAlive = !!prey && p.crashT <= 0;
      // Se quedó atrás: el platillo lo recoge y lo suelta más cerca
      a.far = d > 80 ? a.far + dt : 0;
      if (a.far > 3 || (a.state === 'bolt' && a.t <= 0)) {
        this.beamUp(a);
        continue;
      }
      // ¿Tiene cerca a alguien que le dé miedo? De ese es de quien huye
      let fear = rider && Math.hypot(rider.pos.x - a.x, rider.pos.z - a.z) < 55 ? rider : null;
      let fd = 55;
      for (const pl of who) {
        if (!(pl.scare > 0)) continue;
        const e = Math.hypot(pl.pos.x - a.x, pl.pos.z - a.z);
        if (e < fd) {
          fd = e;
          fear = pl;
        }
      }
      const afraid = !!fear;
      const away = fear ? Math.atan2(a.x - fear.pos.x, a.z - fear.pos.z) : toP + Math.PI;
      let dir = a.heading;
      let turn = 5;
      let speed = 0;
      switch (a.state) {
        case 'wander':
          a.t -= dt;
          if (a.t <= 0) {
            a.dirT = Math.random() * TAU;
            a.t = 1.5 + Math.random() * 2.5;
          }
          dir = a.dirT;
          speed = 4.5;
          if (afraid) a.state = 'flee';
          // Solo te ve si le entras por delante: por la espalda no se entera
          else if (pAlive && d < 40 && Math.cos(toP - a.heading) > -0.25) this.notice(a);
          break;
        case 'alert':
          dir = toP;
          turn = 9;
          a.t -= dt;
          if (a.t <= 0) {
            a.state = 'chase';
            a.t = 7 + Math.random() * 4;
          }
          break;
        case 'chase':
          if (afraid) {
            a.state = 'flee';
            break;
          }
          if (a.detour > 0) {
            a.detour -= dt;
            dir = a.detourDir;
          } else dir = toP;
          speed = pAlive ? Math.min(21, 15 + lvl * 0.8 + (a.i % 3) * 0.7) : 0;
          a.t -= dt;
          if (a.t <= 0) {
            a.state = 'tired';
            a.t = 2.6;
          }
          break;
        case 'tired':
          a.t -= dt;
          if (afraid) a.state = 'flee';
          else if (a.t <= 0) {
            a.state = 'chase';
            a.t = 7 + Math.random() * 4;
          }
          break;
        case 'flee':
          if (a.detour > 0) {
            a.detour -= dt;
            dir = a.detourDir;
          } else dir = away;
          turn = 10;
          speed = 19;
          if (!afraid) {
            a.state = 'chase';
            a.t = 5 + Math.random() * 3;
          }
          break;
        case 'dazed':
          // Tonto perdido por el timbrazo: da vueltas sobre sí mismo viendo las estrellas
          dir = a.heading + 1.2;
          turn = 2.5;
          a.t -= dt;
          if (a.t <= 0) this.recover(a);
          break;
        case 'bolt':
          // Desenmascarado de día y sin platillo que lo ampare: solo sabe correr, y si aguanta se esfuma
          if (a.detour > 0) {
            a.detour -= dt;
            dir = a.detourDir;
          } else dir = toP + Math.PI;
          turn = 10;
          a.t -= dt;
          if (a.t <= BOLT - 0.5) speed = 17;
          break;
        case 'laugh':
          dir = toP;
          a.t -= dt;
          if (a.t <= 0) {
            a.state = 'chase';
            a.t = 6;
          }
          break;
        default:
          break;
      }
      a.speed = speed;
      if (!walk(T, a, dir, speed, turn, dt)) {
        if (a.state === 'wander') a.t = 0;
        else if (a.stuck > 0.3) {
          a.stuck = 0;
          a.detour = 0.8;
          a.detourDir = a.heading + (Math.random() < 0.5 ? 1.7 : -1.7);
        }
      }

      // Corriendo sobre la baba resbalan y se quedan un momento tontos: culetazo por cualquier lado
      a.slick -= dt;
      if (speed > 10 && a.slick <= 0 && g.slime.at(a.x, a.z, a.y)) {
        a.state = 'dazed';
        a.t = SLIDE;
        a.slick = SLIDE + 3;
        g.slime.slipped(a);
      }
    }

    // Que no se amontonen
    for (let i = 0; i < POOL; i++) {
      const a = this.aliens[i];
      if (!AFOOT.has(a.state)) continue;
      for (let j = i + 1; j < POOL; j++) {
        const b = this.aliens[j];
        if (!AFOOT.has(b.state)) continue;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const e = Math.hypot(ex, ez);
        if (e > 2.4 || e < 0.001) continue;
        const k = ((2.4 - e) * 0.5) / e;
        if (T.height(a.x - ex * k, a.z - ez * k) - a.y < 1) {
          a.x -= ex * k;
          a.z -= ez * k;
        }
        if (T.height(b.x + ex * k, b.z + ez * k) - b.y < 1) {
          b.x += ex * k;
          b.z += ez * k;
        }
      }
    }

    // Refuerzos: bajan cerca de un jugador cualquiera, y con más gente en la calle, más a la vez
    if (this.active && W) {
      this.spawnT -= dt;
      const want = Math.min(POOL, 4 + lvl + (who.length - 1));
      // Echada la oleada solo bajan los refuerzos que mande la nodriza
      const room = g.boss.fighting ? walking < g.boss.minions : walking < want && W.count + walking < W.goal;
      if (this.spawnT <= 0 && room) {
        const p = rider || this.anyone(who);
        const a = this.aliens.find((o) => o.state === 'off');
        if (p && a && this.spawn(a, p)) this.spawnT = 0.9;
      }
    }
  }

  // Se da cuenta de que tiene a alguien delante
  notice(a) {
    a.state = 'alert';
    a.t = 0.5;
  }

  // Risas marcianas después de pillar a alguien
  laugh(a) {
    a.state = 'laugh';
    a.t = 1.7;
  }

  // Se le pasa el mareo: el de la oleada vuelve a por ti, el desenmascarado sigue huyendo
  recover(a) {
    a.state = a.spy ? 'bolt' : 'chase';
    a.t = 6;
  }

  // Sale por los aires. by: quién le ha dado, que es para quien saltan los studs al reventar
  launch(a, vx, vz, vy, by) {
    a.state = 'fly';
    a.t = 0;
    a.vx = vx;
    a.vz = vz;
    a.vy = vy;
    a.spin = 10 + Math.random() * 8;
    a.rot = 0;
    a.heading = Math.atan2(vx, vz);
    a.y += 0.6;
    a.by = by;
  }

  // Cae la nodriza: los que queden por el suelo revientan todos a la vez
  rout() {
    for (const a of this.aliens) if (AFOOT.has(a.state)) this.pop(a, a.y);
  }

  // Revienta en ladrillos, suelta studs (para quien lo echó, o para todos si no ha sido nadie) y
  // deja el suelo perdido de baba
  pop(a, floor) {
    const g = this.game;
    g.slime.splat(a.x, a.z);
    const near = g.at(a.x, a.z);
    near.bits.burst(a.x, floor + 1.5, a.z, [...BIT_COLORS, a.fig.colors[1]], 20, 11, floor);
    near.sfx.alienPop();
    const to = a.by ? g.to(a.by) : g.all;
    to.studs.burst(a.x, floor + 1, a.z, 4, 0, floor, 8);
    to.studs.burst(a.x, floor + 1, a.z, 1, 1, floor, 8);
    a.state = 'off';
    a.by = null;
  }

  // Uno menos para la oleada, que es de todos. Echado el último baja la nodriza (boss.js): sus
  // refuerzos ya no cuentan
  count() {
    const W = this.wave;
    if (W && W.count < W.goal) W.count++;
  }

  // Anfitrión: un marciano que se apunta un jugador sin haberlo tocado él (los que sube el rayo de su platillo)
  score(p, time, label, base) {
    if (p === this.game.player) this.reward(p, time, label, base);
    else this.game.to(p).kicked(label, base);
    this.count();
  }

  // Lo que se lleva el jugador de esta pantalla por echar a uno: el combo es suyo
  reward(p, time, label, base) {
    const g = this.game;
    this.combo = time - this.lastKick < 5 ? Math.min(KICK_NAMES.length - 1, this.combo + 1) : 0;
    this.lastKick = time;
    const mult = 1 + this.combo;
    const pts = base * mult;
    g.hud.trick(label || KICK_NAMES[this.combo], pts, mult);
    if (this.combo >= 2) g.hud.big(KICK_NAMES[this.combo], GREEN, 0.9, true);
    g.addStuds(pts / 10);
    p.boost = Math.min(1, p.boost + 0.16);
    g.save.aliens = (g.save.aliens || 0) + 1;
  }

  // ---------- El jugador de esta pantalla ----------
  // Lo que le pasa con la invasión, tal como la ve: el rayo y el viaje en el platillo, el coscorrón,
  // el rescate y los marcianos con los que se cruza. Lo que es de todos se le pide al anfitrión
  mine(dt, p, time, inp) {
    const g = this.game;
    const u = this.u;
    // ¿Lo tiene el platillo? En red lo dice el anfitrión, y puede tardar un momento en enterarse o en contarlo
    const st = this.has(p) ? u.state : null;
    if (this.mode) {
      if (st === this.mode) {
        this.lagT = 0;
        this.sure = true;
      } else this.lagT += dt;
      if (!p.held) this.quit(p, true);
      else if (this.mode === 'board' && st === 'ride') this.seat(p);
      // Si el anfitrión ya lo había dado por cogido, lo suelta en cuanto lo diga; si no, se le da un
      // momento para enterarse
      else if (st !== this.mode && (this.sure || this.lagT > (this.led ? 1.5 : 0))) this.quit(p, false);
    } else if ((st === 'board' || st === 'ride') && this.quitT <= 0 && !p.held && p.crashT <= 0) {
      // Le ha dado el tercer coscorrón desde otra pantalla: lo ha dicho el anfitrión
      this.hold(p);
      this.setMode('board');
    }
    switch (this.mode) {
      case 'abduct':
        this.struggle(dt, p, time);
        break;
      case 'carry':
        p.pos.set(u.x, u.y - 3, u.z);
        p.vel.set(u.vx, 0, u.vz);
        if (Math.abs(u.vx) + Math.abs(u.vz) > 1) p.heading = Math.atan2(u.vx, u.vz);
        break;
      case 'board':
        p.pos.x = damp(p.pos.x, u.x, 6, dt);
        p.pos.z = damp(p.pos.z, u.z, 6, dt);
        p.pos.y = Math.min(u.y - 3.5, p.pos.y + 7 * dt);
        p.heading += dt * 9;
        break;
      case 'ride':
        this.drive(dt, p, inp);
        break;
      default:
        break;
    }

    const d = Math.hypot(p.pos.x - u.x, p.pos.z - u.z);
    const free = p.crashT <= 0 && !p.held && !g.busy(p);
    // ¿Lo tiene el platillo bajo el rayo?
    if (u.state === 'hunt' && (this.led ? g.party.isMe(this.whoSlot) : u.prey === p)) {
      const inBeam = free && u.beam > 0.6 && d < BEAM_R && p.pos.y < u.y - 4 && p.invuln <= 0 && !p.foil;
      this.meter = clamp(this.meter + (inBeam ? dt / 0.85 : -dt * 1.1), 0, 1);
      if (this.meter >= 1) this.startAbduct(p);
    } else if (this.mode !== 'abduct') this.meter = Math.max(0, this.meter - dt * 2);
    g.hud.beam(this.mode === 'abduct' ? 1 : this.meter);
    if (!free) return;

    // Coscorrón: hay que darle saltando desde abajo, no vale caerle encima al soltarse del rayo
    if (u.state === 'stun' && u.t > 0.4 && this.bonkCd <= 0 && !p.grounded && !p.dropped && p.vel.y > 0 && d < 7 && p.pos.y > u.y - 7.2 && p.pos.y < u.y) {
      this.bonkCd = 0.6;
      p.vel.y = -5;
      g.camera3.addShake(0.5);
      if (this.led) g.party.tell('coscorron', 0);
      else this.hitUfo(p);
    }
    // Rescate: mientras sube a otro el rayo no te coge, y cruzarlo por el aire lo corta
    const v = this.vic;
    if (v && v.lifting && u.state === 'snatch' && this.saveCd <= 0 && !p.grounded && d < BEAM_R && p.pos.y > v.gy + 1 && p.pos.y < u.y - 2) {
      const high = p.pos.y - v.gy > 6;
      this.saveCd = 1;
      p.boost = 1;
      g.camera3.addShake(0.35);
      if (this.led) g.party.tell('rescate', high ? 1 : 0);
      else this.rescue(p, v, high);
    }
    this.touch(p, time);
  }

  // Lo que el platillo le hace al jugador de esta pantalla, que aún tiene que confirmar el anfitrión
  setMode(mode) {
    this.mode = mode;
    this.lagT = 0;
    this.sure = false;
  }

  hold(p) {
    p.held = true;
    p.grounded = false;
    p.grind = null;
    p.boosting = false;
    p.v = 0;
    p.vel.set(0, 0, 0);
  }

  startAbduct(p) {
    const g = this.game;
    this.hold(p);
    this.setMode('abduct');
    this.esc = 0.15;
    this.combo = 0;
    g.hud.big('¡El rayo!', GREEN, 0.9, true);
    g.hud.abduct(this.esc);
    g.sfx.beamGrab();
    g.camera3.addShake(0.3);
    if (this.led) g.party.tell('rayo', 0);
    else {
      this.setUfo('abduct');
      this.cargo = p;
      this.u.meter = 1;
    }
  }

  // En el rayo: sube girando, y machacando el salto se suelta
  struggle(dt, p, time) {
    const g = this.game;
    const u = this.u;
    const lvl = this.wave ? this.wave.level : 0;
    if (g.input.hit('jump')) {
      this.esc += Math.max(0.1, 0.17 - lvl * 0.01);
      g.sfx.mash(this.esc);
    }
    this.esc = Math.max(0, this.esc - dt * 0.2);
    p.pos.x = damp(p.pos.x, u.x, 4, dt);
    p.pos.z = damp(p.pos.z, u.z, 4, dt);
    p.pos.y += RISE * dt;
    p.heading += dt * 4.5;
    p.flip = Math.sin(time * 5) * 0.3;
    g.hud.abduct(Math.min(1, this.esc));
    if (this.esc >= 1) {
      this.mode = null;
      this.quitT = 1;
      this.release(p);
      g.hud.abduct(null);
      g.hud.big('¡Te has soltado!', '#ffd23a', 1.1, true);
      g.sfx.escape();
      g.camera3.addShake(0.3);
      if (this.led) g.party.tell('suelto', 0);
      else this.setUfo('stun');
    } else if (p.pos.y > u.y - 4.2) this.enter(p);
  }

  // Dentro del platillo, que de paso le birla unos studs
  enter(p) {
    const g = this.game;
    this.stolen = Math.min(500, Math.floor((g.save.studs * 0.1) / 10) * 10);
    if (this.stolen > 0) {
      g.save.studs -= this.stolen;
      g.hud.setStuds(g.save.studs);
      g.dirty = true;
    }
    this.setMode('carry');
    p.hidden = true;
    p.flip = 0;
    g.hud.abduct(null);
    g.hud.big('¡Abducido!', GREEN, 1.6);
    g.sfx.abducted();
    if (this.led) g.party.tell('dentro', 0);
    else this.take(p);
  }

  // Ya está a los mandos del platillo que ha robado
  seat(p) {
    const g = this.game;
    this.setMode('ride');
    p.hidden = true;
    p.flip = 0;
    this.u.heading = p.heading;
    g.camera3.rig = RIG;
    g.tally('ufos');
    g.hud.ride(1);
    g.hud.toast('🛸 ¡Has robado el platillo! Se conduce igual que el patinete. Mantén <b>Espacio</b> para encender el rayo y pasa por encima de los marcianos.');
  }

  // A los mandos: el platillo va donde lo lleve quien lo pilota
  drive(dt, p, inp) {
    const g = this.game;
    const u = this.u;
    u.heading -= inp.steer * 2.3 * dt;
    const sp = inp.throttle > 0 ? (inp.boost ? 54 : 38) : inp.throttle * 20;
    u.vx = damp(u.vx, Math.sin(u.heading) * sp, 2.6, dt);
    u.vz = damp(u.vz, Math.cos(u.heading) * sp, 2.6, dt);
    u.x = clamp(u.x + u.vx * dt, BOUNDS.x0 + 16, BOUNDS.x1 - 16);
    u.z = clamp(u.z + u.vz * dt, BOUNDS.z0 + 16, BOUNDS.z1 - 16);
    // La altura, en un invitado, tampoco espera al anfitrión
    if (this.led) u.y = damp(u.y, Math.max(RIDE_H, this.T.height(u.x, u.z) + 9), 1.6, dt);
    p.pos.set(u.x, u.y - 3, u.z);
    p.vel.set(u.vx, 0, u.vz);
    p.heading = u.heading;
    g.hud.ride(this.led ? this.rideK : this.ride ? this.ride.t / RIDE_TIME : 0);
  }

  // El platillo ya no tiene al jugador de esta pantalla. moved: porque lo han recolocado desde fuera
  // (volver a casa, un minijuego...), y entonces es el platillo el que tiene que enterarse
  quit(p, moved) {
    const g = this.game;
    const u = this.u;
    const was = this.mode;
    this.mode = null;
    this.quitT = 1;
    g.hud.abduct(null);
    if (was === 'ride' || was === 'board') {
      g.camera3.rig = null;
      g.hud.ride(null);
    }
    if (moved) {
      p.hidden = false;
      if (this.led) g.party.tell('fuera', 0);
      else this.dropCargo();
      return;
    }
    if (was !== 'carry' || u.state !== 'rest') {
      this.release(p);
      return;
    }
    // Fin del viaje: lo suelta donde le ha dado la gana
    const di = this.led ? (this.di === 254 ? -1 : this.di) : this.carry.dest.i;
    const name = this.drops[di] ? this.drops[di].name : this.doorstep(g.home);
    p.pos.set(u.x, u.y - 4, u.z);
    this.release(p);
    p.invuln = 2.5;
    g.camera3.snap = true;
    g.sfx.escape();
    g.hud.toast(`👽 Te han soltado en <b>${name}</b>${this.stolen ? ` y te han birlado <b>${this.stolen}</b> studs` : ''}. ¡Qué cara!`, 'Te han soltado donde les ha dado la gana. ¡Qué cara!');
  }

  // Contacto del patinete con los marcianos que tiene delante
  touch(p, time) {
    const g = this.game;
    for (let i = 0; i < POOL; i++) {
      const a = this.aliens[i];
      if (a.own || a.cd > 0 || !AFOOT.has(a.state)) continue;
      const dx = p.pos.x - a.x;
      const dz = p.pos.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const dy = p.pos.y - a.y;
      const st = a.state;
      if (!p.grounded && p.whipT > 0 && d < 4.2 && dy > -2 && dy < 5.5) {
        this.kick(a, p, time, p.char.alienTrick, 900);
        continue;
      }
      if (!p.grounded && p.vel.y < -3 && d < 2.6 && dy > 2 && dy < 7) {
        // Pisotón: aplastado desde arriba, y el patinete rebota
        p.vel.y = 17;
        this.stomp(a, p, time);
        continue;
      }
      if (d > 2.7 || dy < -2 || dy > 3.2) continue;
      p.velocity(_v);
      const sp = Math.hypot(_v.x, _v.z);
      const coming = _v.x * dx + _v.z * dz < 0;
      const behind = Math.cos(Math.atan2(dx, dz) - a.heading) < 0.15;
      const dazed = st === 'dazed';
      if (sp > (dazed ? 3 : 8) && coming && (behind || dazed || st === 'flee' || st === 'bolt')) {
        this.kick(a, p, time, null, 500);
      } else if (st === 'chase' && p.invuln <= 0 && this.grabCd <= 0) {
        this.grab(a, p);
      } else {
        // Choque sin más: se da cuenta de que estás ahí
        p.bump(dx / d, dz / d, 0.2, 0.7);
        a.cd = 0.4;
        if (st !== 'wander' && st !== 'tired') continue;
        if (this.led) g.party.tell('visto', i);
        else this.notice(a);
      }
    }
  }

  kick(a, p, time, label, base) {
    const g = this.game;
    p.velocity(_v);
    _v.y = 0;
    let sp = _v.length();
    if (sp < 4) _v.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    else _v.multiplyScalar(1 / sp);
    sp = Math.max(sp, 14);
    const turbo = p.boosting && p.grounded;
    const vx = _v.x * (sp * 1.15 + 12);
    const vz = _v.z * (sp * 1.15 + 12);
    const vy = 13 + sp * 0.3;
    if (p.grounded) p.v *= 0.92;
    g.bits.burst(a.x, a.y + 1.5, a.z, [0xfff27a, 0xffffff, SKIN], 8, 9, a.y, 0.5);
    g.camera3.addShake(turbo ? 0.5 : 0.3);
    g.sfx.culetazo(turbo);
    this.reward(p, time, label || (turbo ? '¡Superculetazo!' : null), turbo && !label ? base + 300 : base);
    // Lo que se ve y se oye del culetazo ya lo ha hecho esta pantalla
    a.mine = true;
    this.launch(a, vx, vz, vy, p);
    if (this.led) {
      // En un invitado sale volando ya, sin esperar a que el anfitrión se entere
      this.own(a, 'fly');
      g.party.tell('culetazo', [a.i, vx, vz, vy]);
    } else this.count();
  }

  stomp(a, p, time) {
    const g = this.game;
    this.reward(p, time, '¡Pisotón!', 700);
    g.camera3.addShake(0.25);
    if (this.led) {
      this.own(a, 'done');
      a.state = 'off';
      g.party.tell('pisoton', a.i);
      return;
    }
    a.by = p;
    this.pop(a, a.y);
    this.count();
  }

  // Invitado: ese marciano lo lleva esta pantalla hasta que el anfitrión diga qué ha sido de él
  own(a, how) {
    a.own = how;
    a.ownT = 0;
    a.ownSeen = false;
  }

  // Te pillan de frente: calambrazo, studs por los suelos y risas marcianas
  grab(a, p) {
    const g = this.game;
    const fl = this.T.height(p.pos.x, p.pos.z);
    const lost = Math.min(100, Math.floor(g.save.studs / 10) * 10);
    if (lost > 0) {
      g.save.studs -= lost;
      g.hud.setStuds(g.save.studs);
      g.dirty = true;
      g.studs.burst(p.pos.x, p.pos.y + 2, p.pos.z, Math.min(6, lost / 10), 0, fl, 15);
    }
    if (p.grounded) p.v = -Math.abs(p.v) * 0.35 - 5;
    else {
      p.vel.x *= -0.4;
      p.vel.z *= -0.4;
    }
    p.invuln = 1.8;
    this.grabCd = 3;
    this.combo = 0;
    a.cd = 1.7;
    if (this.led) g.party.tell('pillado', a.i);
    else this.laugh(a);
    g.bits.burst(p.pos.x, p.pos.y + 2.5, p.pos.z, [0xb6ff5a, 0xfff27a, 0xffffff], 12, 9, fl, 0.45);
    g.camera3.addShake(0.5);
    g.sfx.zap();
    g.hud.big('¡Te han pillado!', '#ff6b5a', 1, true);
  }

  // ---------- En red ----------
  // Anfitrión: lo que un invitado (`r`) dice que le ha pasado con la invasión en su pantalla
  asked(k, v, r) {
    const u = this.u;
    const a = this.aliens[(Array.isArray(v) ? v[0] : v) | 0];
    const afoot = !!a && AFOOT.has(a.state);
    switch (k) {
      case 'culetazo':
        if (!afoot) break;
        this.launch(a, clamp(+v[1] || 0, -90, 90), clamp(+v[2] || 0, -90, 90), clamp(+v[3] || 13, 5, 45), r);
        this.count();
        break;
      case 'pisoton':
        if (!afoot) break;
        a.by = r;
        this.pop(a, a.y);
        this.count();
        break;
      case 'pillado':
        if (afoot && a.state === 'chase') this.laugh(a);
        break;
      case 'visto':
        if (afoot && (a.state === 'wander' || a.state === 'tired')) this.notice(a);
        break;
      case 'rayo':
        // Lo ha cogido el rayo: el platillo se para a subirlo, si no tiene ya a otro
        if (this.cargo || !(u.state === 'hunt' || (u.state === 'rest' && u.t < 1))) break;
        this.setUfo('abduct');
        this.cargo = r;
        u.meter = 1;
        break;
      case 'suelto':
        if (this.cargo === r && u.state === 'abduct') this.setUfo('stun');
        break;
      case 'dentro':
        if (this.cargo === r && u.state === 'abduct') this.take(r);
        break;
      case 'fuera':
        if (this.cargo === r) this.dropCargo();
        break;
      case 'coscorron':
        this.hitUfo(r);
        break;
      case 'rescate':
        if (this.vic && this.vic.lifting && u.state === 'snatch') this.rescue(r, this.vic, !!v);
        break;
      default:
        break;
    }
  }

  // Lo que viaja en cada `foto`: nada si no hay invasión ni marcianos sueltos; si no, la oleada, el
  // platillo, lo que tiene cogido y cada marciano
  get bytes() {
    const idle = !this.wave && this.u.state === 'gone' && !this.vic && !this.falling && !this.lost.length && this.aliens.every((a) => a.state === 'off');
    return idle ? 1 : HEAD + Math.min(64, this.lost.length) + POOL * ALIEN;
  }

  write(dv, o) {
    if (this.bytes === 1) {
      dv.setUint8(o, 0);
      return o + 1;
    }
    const g = this.game;
    const W = this.wave;
    const u = this.u;
    const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));
    dv.setUint8(o, 1 | (this.active ? 2 : 0) | (W ? 4 : 0) | (this.cleared ? 8 : 0));
    dv.setUint8(o + 1, byte(W ? W.level : 0));
    dv.setUint8(o + 2, byte(W ? W.goal : 0));
    dv.setUint8(o + 3, byte(W ? W.count : 0));
    dv.setUint8(o + 4, byte(W ? W.cut : 0));
    o += 5;
    const who = this.cargo || u.prey;
    dv.setUint8(o, UFO_STATES.indexOf(u.state));
    dv.setUint8(o + 1, who && this.around(who) ? g.party.slotOf(who) : 255);
    dv.setInt16(o + 2, i16(u.x * POS), true);
    dv.setInt16(o + 4, i16(u.z * POS), true);
    dv.setInt16(o + 6, i16(u.y * ALT), true);
    dv.setUint8(o + 8, byte(u.beam * 255));
    dv.setUint8(o + 9, byte(u.meter * 255));
    dv.setUint8(o + 10, byte(u.hits));
    dv.setUint8(o + 11, Math.round(u.heading * TURN) & 255);
    dv.setUint8(o + 12, byte(this.ride ? (this.ride.t / RIDE_TIME) * 255 : 0));
    dv.setUint8(o + 13, u.state === 'carry' ? (this.carry.dest.i < 0 ? 254 : this.carry.dest.i) : 255);
    o += 14;
    const v = this.vic;
    dv.setUint8(o, v ? (v.lifting ? 2 : 1) : 0);
    dv.setUint8(o + 1, v ? v.id : 255);
    dv.setInt16(o + 2, i16(v ? v.x * POS : 0), true);
    dv.setInt16(o + 4, i16(v ? v.z * POS : 0), true);
    dv.setUint16(o + 6, Math.max(0, Math.min(65535, Math.round(v ? v.h * ALT : 0))), true);
    o += 8;
    const f = this.falling;
    dv.setUint8(o, f ? f.id : 255);
    dv.setInt16(o + 1, i16(f ? f.x * POS : 0), true);
    dv.setInt16(o + 3, i16(f ? f.z * POS : 0), true);
    dv.setUint16(o + 5, Math.max(0, Math.min(65535, Math.round(f ? f.h * ALT : 0))), true);
    o += 7;
    const n = Math.min(64, this.lost.length);
    dv.setUint8(o++, n);
    for (let i = 0; i < n; i++) dv.setUint8(o++, this.lost[i].id);
    for (const a of this.aliens) {
      dv.setUint8(o, STATES.indexOf(a.state) | (a.spy ? 128 : 0));
      dv.setInt16(o + 1, i16(a.x * POS), true);
      dv.setInt16(o + 3, i16(a.z * POS), true);
      dv.setInt16(o + 5, i16(a.y * ALT), true);
      dv.setUint8(o + 7, Math.round(a.heading * TURN) & 255);
      o += ALIEN;
    }
    return o;
  }

  // Invitado: la invasión del anfitrión, entre dos fotos suyas (k de 0 a 1)
  read(a, b, o, k) {
    const g = this.game;
    const u = this.u;
    const f = a.getUint8(o);
    if (!f) {
      if (!this.quiet) this.reset(g.player, this.led);
      return o + 1;
    }
    this.quiet = false;
    const i16 = (at, j) => a.getInt16(at, true) + (b.getInt16(at, true) - a.getInt16(at, true)) * j;
    const u16 = (at, j) => a.getUint16(at, true) + (b.getUint16(at, true) - a.getUint16(at, true)) * j;
    const turn = (at, j) => (a.getUint8(at) + ((((b.getUint8(at) - a.getUint8(at) + 384) & 255) - 128) * j)) / TURN;
    this.active = !!(f & 2);
    this.cleared = !!(f & 8);
    if (f & 4) {
      const level = a.getUint8(o + 1);
      if (!this.wave || this.wave.level !== level) {
        // Otra oleada: los consejos, cada pantalla los suyos
        this.wave = { level, goal: 0, count: 0, saved: 0, cut: a.getUint8(o + 4), crew: 1 };
        this.hints = this.tips();
      }
      this.wave.goal = a.getUint8(o + 2);
      this.wave.count = a.getUint8(o + 3);
    } else this.wave = null;
    o += 5;

    // El platillo. A los mandos, por dónde va lo lleva esta pantalla
    const us = UFO_STATES[a.getUint8(o)] || 'gone';
    let j = b.getUint8(o) === a.getUint8(o) ? k : 0;
    if (us !== u.state) {
      u.state = us;
      u.t = 0;
    }
    this.whoSlot = a.getUint8(o + 1);
    if (this.mode !== 'ride') {
      u.x = i16(o + 2, j) / POS;
      u.z = i16(o + 4, j) / POS;
      u.y = i16(o + 6, j) / ALT;
      u.heading = turn(o + 11, j);
    }
    u.beam = a.getUint8(o + 8) / 255;
    u.meter = a.getUint8(o + 9) / 255;
    u.hits = a.getUint8(o + 10);
    this.rideK = a.getUint8(o + 12) / 255;
    if (a.getUint8(o + 13) !== 255) this.di = a.getUint8(o + 13);
    o += 14;

    // Lo que tiene cogido: a quién sube, quién cae y cuántos lleva dentro
    const seen = this.seen;
    seen.clear();
    const mode = a.getUint8(o);
    let v = mode ? this.keep(a.getUint8(o + 1)) : null;
    if (v) {
      j = b.getUint8(o) === mode && b.getUint8(o + 1) === a.getUint8(o + 1) ? k : 0;
      v.x = i16(o + 2, j) / POS;
      v.z = i16(o + 4, j) / POS;
      if (mode === 2 && !v.lifting) this.lift(v);
      v.h = u16(o + 6, j) / ALT;
      v.k = v.lifting ? clamp(v.h / (u.y - 4.5 - v.gy), 0, 1) : 0;
    }
    this.vic = v;
    o += 8;
    v = a.getUint8(o) !== 255 ? this.keep(a.getUint8(o)) : null;
    if (v) {
      j = b.getUint8(o) === a.getUint8(o) ? k : 0;
      if (!v.lifting) this.lift(v);
      v.x = i16(o + 1, j) / POS;
      v.z = i16(o + 3, j) / POS;
      v.h = u16(o + 5, j) / ALT;
    }
    this.falling = v;
    o += 7;
    const n = a.getUint8(o++);
    this.lost.length = 0;
    for (let i = 0; i < n; i++) {
      v = this.keep(a.getUint8(o++));
      if (!v) continue;
      if (!v.lifting) this.lift(v);
      v.obj.visible = false;
      this.lost.push(v);
    }
    // Lo que ya no tiene vuelve a su sitio
    for (const [id, old] of this.kept) {
      if (seen.has(id)) continue;
      if (old.lifting) this.restore(old);
      this.kept.delete(id);
    }

    for (const al of this.aliens) {
      const sb = a.getUint8(o);
      const st = STATES[sb & 15] || 'off';
      const at = o;
      o += ALIEN;
      if (al.own) {
        // El que ha echado esta pantalla sigue siendo suyo hasta que el anfitrión lo dé por echado
        // (o hasta ver que no se ha enterado)
        if (st === 'fly') al.ownSeen = true;
        const gone = st === 'off' || st === 'drop' || st === 'beamup';
        if ((gone && (al.ownSeen || al.own === 'done')) || (!al.ownSeen && al.ownT > 0.8) || al.ownT > 6) al.own = null;
        else continue;
      }
      j = (b.getUint8(at) & 15) === (sb & 15) ? k : 0;
      al.state = st;
      al.spy = !!(sb & 128);
      al.x = i16(at + 1, j) / POS;
      al.z = i16(at + 3, j) / POS;
      al.y = i16(at + 5, j) / ALT;
      al.heading = turn(at + 7, j);
    }
    return o;
  }

  // Invitado: lo que el platillo del anfitrión tiene cogido, por su número
  keep(id) {
    this.seen.add(id);
    let v = this.kept.get(id);
    if (v) return v;
    const g = this.game;
    const kind = KINDS[id >> 6];
    const ref = (kind === 'ped' ? g.traffic.peds : kind === 'car' ? g.traffic.cars : kind === 'cow' ? g.cows.list : [])[id & 63];
    if (!ref) return null;
    v = this.victim(kind, ref, 0);
    this.kept.set(id, v);
    return v;
  }

  // ---------- Lo que se ve y se oye en esta pantalla ----------
  present(dt, p, time, inp) {
    const g = this.game;
    const u = this.u;
    this.blips.length = 0;
    for (const a of this.aliens) {
      const f = a.fig;
      const grp = f.group;
      if (a.own) {
        a.ownT += dt;
        if (a.own === 'fly' && this.flight(a, dt) !== null) {
          a.state = 'off';
          a.own = 'done';
        }
      }
      const st = a.state;
      if (st !== a.was) this.changed(a, st, p);
      else a.age += dt;
      grp.visible = st !== 'off';
      if (st === 'off') continue;
      a.blip.x = a.x;
      a.blip.z = a.z;
      this.blips.push(a.blip);
      if (this.led && !a.own) {
        // En un invitado no anda con `walk()`: el paso sale de lo que se ha movido
        a.speed = Math.hypot(a.x - a.px, a.z - a.pz) / dt > 1 ? 1 : 0;
        a.walk += Math.hypot(a.x - a.px, a.z - a.pz) * 0.8;
      }
      a.px = a.x;
      a.pz = a.z;
      let scale = 1;
      let tilt = 0;
      let hop = 0;
      if (st === 'fly') {
        // Por los aires tras el culetazo
        a.rot += a.spin * dt;
        a.fx -= dt;
        if (a.fx <= 0) {
          a.fx = 0.04;
          g.bits.spawn(a.x, a.y + 2, a.z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, Math.random() < 0.5 ? SKIN : 0xfff27a, 0.32, 0.5, this.T.height(a.x, a.z));
        }
        f.armL.rotation.x = f.armR.rotation.x = -2.7;
        f.legL.rotation.x = 0.6;
        f.legR.rotation.x = -0.6;
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(a.rot, a.heading, 0);
      } else if (st === 'beamup') {
        scale = Math.max(0.05, 1 - a.age / 0.7);
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(0, a.heading + a.age * 14, 0);
      } else if (st === 'sucked') {
        // Por el rayo arriba, al platillo que ahora lleva un jugador
        f.armL.rotation.x = f.armR.rotation.x = -2.8;
        f.legL.rotation.x = Math.sin(time * 16) * 0.6;
        f.legR.rotation.x = -f.legL.rotation.x;
        scale = lerp(1, 0.3, clamp(1 - (u.y - 3 - a.y) / 5, 0, 1));
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(Math.sin(time * 3) * 0.25, a.heading + a.age * 9, 0);
      } else if (st === 'drop') {
        f.armL.rotation.x = f.armR.rotation.x = -2.8;
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(0, a.heading, 0);
      } else {
        const sw = a.speed > 0 ? Math.sin(a.walk) : 0;
        f.legL.rotation.x = sw * 0.7;
        f.legR.rotation.x = -sw * 0.7;
        if (st === 'chase') {
          // Brazos por delante, a lo zombi
          f.armL.rotation.x = -1.5 + sw * 0.2;
          f.armR.rotation.x = -1.5 - sw * 0.2;
        } else if (st === 'flee' || st === 'laugh' || st === 'alert' || st === 'bolt') {
          f.armL.rotation.x = -2.7 + Math.sin(time * 18 + a.i) * 0.35;
          f.armR.rotation.x = -2.7 - Math.sin(time * 18 + a.i) * 0.35;
          if (st === 'alert') hop = Math.sin(Math.min(1, a.age / 0.5) * Math.PI) * 1.4;
          else if (st === 'laugh') hop = Math.abs(Math.sin(a.age * 9)) * 0.9;
          else {
            tilt = 0.25;
            // El bote del susto, al caérsele el disfraz
            if (st === 'bolt' && a.from === 'off' && a.age < 0.5) hop = Math.sin((a.age / 0.5) * Math.PI) * 1.6;
          }
        } else if (st === 'tired') {
          f.armL.rotation.x = f.armR.rotation.x = 0.35;
          tilt = 0.5 + Math.sin(time * 7 + a.i) * 0.06;
        } else if (st === 'dazed') {
          // Tonto perdido: da vueltas sobre sí mismo viendo las estrellas
          f.armL.rotation.x = Math.sin(time * 5 + a.i) * 0.6;
          f.armR.rotation.x = -f.armL.rotation.x;
          tilt = Math.sin(time * 6 + a.i) * 0.22;
          a.fx -= dt;
          if (a.fx <= 0) {
            a.fx = 0.16;
            const s = time * 7 + a.i;
            g.bits.spawn(a.x + Math.sin(s) * 0.9, a.y + 4.7, a.z + Math.cos(s) * 0.9, Math.cos(s) * 2, 1.5, -Math.sin(s) * 2, 0xfff27a, 0.26, 0.45, a.y);
          }
        } else {
          f.armL.rotation.x = -sw * 0.5;
          f.armR.rotation.x = sw * 0.5;
        }
        f.head.rotation.y = st === 'wander' ? Math.sin(time * 1.3 + a.i) * 0.6 : st === 'dazed' ? Math.sin(time * 8 + a.i) * 0.9 : 0;
        grp.position.set(a.x, a.y + hop, a.z);
        grp.rotation.set(tilt, a.heading, 0);
      }
      grp.scale.setScalar(scale);
    }

    // Lo que cuelga del rayo y lo que cae
    const v = this.vic;
    if (v && v.lifting) {
      v.spin += dt * (1.5 + v.k * 5);
      this.pose(v, time);
      if (Math.random() < dt * 20) {
        const a = Math.random() * TAU;
        g.bits.spawn(u.x + Math.cos(a) * 3, v.gy + v.h, u.z + Math.sin(a) * 3, 0, 9 + Math.random() * 6, 0, 0xb6ff5a, 0.3, 0.6, v.gy);
      }
    }
    const fall = this.falling;
    if (fall && fall.h > 0) {
      if (this.led) fall.k = damp(fall.k, 0, 5, dt);
      fall.spin += dt * 7;
      this.pose(fall, time);
    }

    // Marcadores: son los mismos para todos, así que salen de cómo está la invasión
    const W = this.active ? this.wave : null;
    const key = W ? `${W.count}/${W.goal}` : null;
    if (key !== this.shown) {
      this.shown = key;
      g.hud.setAliens(W ? W.count : null, W ? W.goal : 0);
    }
    const hits = this.active && u.state !== 'gone' && u.state !== 'leave' && u.state !== 'ride' ? u.hits : null;
    if (hits !== this.shownHits) {
      this.shownHits = hits;
      g.hud.setUfo(hits, UFO_HITS);
    }

    this.presentUfo(dt, p, time, inp);
    if (u.state !== 'gone') {
      u.blip.x = u.x;
      u.blip.z = u.z;
      this.blips.push(u.blip);
    }
    if (v && u.state !== 'ride') {
      v.blip.x = v.x;
      v.blip.z = v.z;
      this.blips.push(v.blip);
    }
  }

  // Un marciano ha cambiado de estado: lo que se ve y se oye al pasar de uno a otro
  changed(a, st, p) {
    const g = this.game;
    const d = Math.hypot(p.pos.x - a.x, p.pos.z - a.z);
    if (st === 'wander' && a.was === 'drop') {
      for (let k = 0; k < 8; k++) g.bits.spawn(a.x, a.y + 0.4, a.z, (Math.random() - 0.5) * 10, 3 + Math.random() * 4, (Math.random() - 0.5) * 10, 0xb6ff5a, 0.3, 0.5, a.y);
      if (d < 80) g.sfx.alienLand();
    } else if (st === 'alert' && d < 60) g.sfx.alienSpot();
    else if (st === 'fly' && !a.mine && a.was !== 'off') {
      // El culetazo de otro
      const near = g.here(a.x, a.z);
      near.bits.burst(a.x, a.y + 1.5, a.z, [0xfff27a, 0xffffff, SKIN], 8, 9, a.y, 0.5);
      near.sfx.culetazo(false);
    }
    if (st !== 'fly') a.mine = false;
    if (this.led) {
      // Lo que el anfitrión apunta al cambiarlo de estado y aquí hace falta para los choques
      if (st === 'bolt' && a.was === 'off') a.cd = 0.6;
      else if (st === 'dazed') a.cd = 0;
      if (st !== 'off') a.fx = 0;
    }
    a.from = a.was;
    a.was = st;
    a.age = 0;
  }

  presentUfo(dt, p, time, inp) {
    const g = this.game;
    const u = this.u;
    if (u.state === 'gone') {
      this.ufo.visible = this.beam.visible = this.spot.visible = false;
      this.light.intensity = 0;
      if (this.humming) g.sfx.ufo(0, false);
      this.humming = false;
      this.crew(null);
      return;
    }
    if (this.led && this.mode !== 'ride') {
      // En un invitado, lo que se inclina sale de lo que se mueve
      u.vx = damp(u.vx, (u.x - u.px) / dt, 6, dt);
      u.vz = damp(u.vz, (u.z - u.pz) / dt, 6, dt);
    }
    u.px = u.x;
    u.pz = u.z;
    const roof = this.T.height(u.x, u.z);
    const who = this.who();
    // El rayo sube a un jugador entre chispas
    if (u.state === 'abduct' && who && Math.random() < dt * 24) {
      const a = Math.random() * TAU;
      g.bits.spawn(u.x + Math.cos(a) * 3, who.pos.y - 2, u.z + Math.sin(a) * 3, 0, 9 + Math.random() * 6, 0, 0xb6ff5a, 0.3, 0.6, who.pos.y - 30);
    }
    // A los mandos va el doble de quien lo ha robado, y el piloto, por los aires
    const rider = u.state === 'ride' ? who : null;
    this.crew(rider);
    this.pilot.group.visible = u.state !== 'board' && u.state !== 'ride';
    if (this.mate) {
      const steer = rider === p ? inp.steer : rider.inp ? rider.inp.steer : 0;
      this.mate.group.rotation.y = u.heading;
      this.mate.armL.rotation.x = -1.2 + steer * 0.4;
      this.mate.armR.rotation.x = -1.2 - steer * 0.4;
    }
    // El rayo se pone al rojo según va cogiendo a un jugador o subiendo a su presa
    const v = this.vic;
    const heat = Math.max(u.meter, this.meter, v && v.lifting ? v.k : 0);
    const wob = u.state === 'stun' || u.state === 'leave' ? Math.sin(time * 15) * 0.2 : 0;
    this.ufo.visible = true;
    this.ufo.position.set(u.x, u.y + Math.sin(time * 2.1) * 0.5, u.z);
    this.ufo.rotation.x = clamp(u.vz * 0.009, -0.3, 0.3) + wob * 0.6;
    this.ufo.rotation.z = clamp(-u.vx * 0.009, -0.3, 0.3) + wob;
    this.lights.rotation.y += dt * (u.state === 'abduct' ? 8 : 2.4);
    const lit = u.beam > 0.02;
    this.beam.visible = this.spot.visible = lit;
    if (lit) {
      const top = u.y - 2;
      this.beam.position.set(u.x, top, u.z);
      this.beam.scale.set(1, Math.max(1, top - roof), 1);
      this.beamMat.color.lerpColors(BEAM_COLD, BEAM_HOT, heat);
      this.beamMat.opacity = u.beam * (0.16 + heat * 0.12 + Math.sin(time * 9) * 0.025);
      this.spot.position.set(u.x, roof + 0.15, u.z);
      lift(u.x, u.z);
      this.spot.rotation.set(-Math.atan(grade.z), 0, Math.atan(grade.x));
      this.spotMat.color.copy(this.beamMat.color);
      this.spotMat.opacity = u.beam * (0.2 + heat * 0.2);
    }
    this.light.intensity = u.beam * 22;
    const near = clamp(1 - Math.hypot(p.pos.x - u.x, p.pos.z - u.z, u.y - p.pos.y) / 150, 0, 1);
    this.humming = true;
    g.sfx.ufo(near, heat > 0.05 || u.state === 'abduct');
  }

  // Quién va a los mandos: su doble se sienta donde iba el piloto
  crew(rider) {
    if (rider === this.mateOf && (!rider || rider.char === this.mateChar)) return;
    if (this.mate) {
      this.ufo.remove(this.mate.group);
      this.mate.group.traverse((o) => o.isMesh && o.geometry.dispose());
      this.mate = null;
    }
    this.mateOf = rider;
    if (!rider) return;
    this.mateChar = rider.char;
    const m = (this.mate = createMinifig(rider.char.look));
    m.group.scale.setScalar(0.75);
    m.group.position.y = -0.3;
    m.armL.rotation.x = m.armR.rotation.x = -1.2;
    this.ufo.add(m.group);
  }
}
