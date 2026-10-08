import { createMinifig } from '../lego/minifig.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { streetGraph } from '../world/streets.js';
import { damp, clamp, lerp, angDiff } from '../core/rng.js';

const SKIN = 0x7ddc1f;
const HITS = 3; // culetazos para que suelte la estatua
const FIRST = 35; // segundos de invasión antes de que se atreva a robarla
const STROLL = 6; // mientras no te ve se pasea tan pancho
const RUN = 20; // y en cuanto te ve sale por piernas, algo más deprisa con cada culetazo
const SEES = 70;
const SIZE = 1.2;
const HEAD = 5.4 * SIZE; // a qué altura lleva la estatua
const HOME_S = 2.1; // tamaño de la estatua en la fuente y a cuestas
const CARRY_S = 1.1;
const DAZE = 4.5;
const G = 34;
const TAU = Math.PI * 2;
const GOLD = '#ffd23a';
const BITS = [0xffc233, 0xfff27a, 0xffffff];
const HITTABLE = new Set(['run', 'dazed']);
// En red: cómo viajan en la `foto` el ladrón y la estatua
const STATES = ['off', 'drop', 'lift', 'hop', 'run', 'hit', 'dazed', 'fly', 'beamup'];
const WHERE = ['home', 'carried', 'flying', 'gone'];
const POS = 10;
const ALT = 20;
const TURN = 256 / TAU;

// El robo de la estatua dorada: en plena invasión un marciano con jersey de presidiario se
// descuelga sobre la fuente de la Plaza de la Villa, se echa la estatua del patinete a la cabeza y
// se larga con ella por las calles. Hay que alcanzarlo y darle tres culetazos antes de que se le
// acabe el tiempo y el platillo lo recoja con el botín.
// En red el ladrón es uno y lo lleva el anfitrión (`direct`): huye del jugador que tenga más cerca.
// Cada uno detecta en su pantalla el culetazo que le da (`touch`) y se lo cuenta; la estatua se la
// apunta quien le dé el tercero, y el premio es para todos.
export class Heist {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.statue = game.statue;
    this.base = this.statue.position.clone();
    this.where = 'home'; // la estatua: 'home', 'carried', 'flying' (de vuelta) o 'gone'
    this.fly = null;
    this.on = false; // hay un robo en marcha, o la estatua sigue en el platillo
    this.done = false; // en esta oleada ya lo han intentado
    this.wave = null;
    this.cd = FIRST;
    this.hits = 0;
    this.left = 0;
    this.warned = false;
    this.by = null; // quién le ha dado el último culetazo
    this.led = false; // invitado de una partida en red: el robo es el del anfitrión
    this.flown = false;
    this.blip = { x: 0, z: 0, icon: '🏆' };
    this.blips = [];

    const fig = createMinifig({ skin: SKIN, face: 'alien', hair: 'antenna', hairColor: C.yellow, torso: C.black, legs: C.black });
    // Rayas de presidiario, para que no se confunda con los demás
    const b = new Builder();
    for (const y of [2.42, 2.92, 3.42]) b.box(lerp(2.0, 1.52, (y - 2.12) / 1.6) + 0.05, 0.22, 1.05, 0, y, 0, C.white);
    fig.group.add(b.mesh(plastic));
    fig.group.rotation.order = 'YXZ';
    fig.group.scale.setScalar(SIZE);
    fig.group.visible = false;
    game.scene.add(fig.group);
    this.k = { fig, state: 'off', was: 'off', age: 0, mine: false, speed: 0, px: 0, pz: 0, x: 0, y: 0, z: 0, heading: 0, v: 0, t: 0, cd: 0, from: -1, to: 0, alarm: 0, turnCd: 0, slimeT: 0, walk: 0, hop: 0, fx: 0, loot: false, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, hx: 0, hz: 0, hy: 0 };
  }

  // La estatua está en su fuente (y entonces gira sobre el pedestal)
  get home() {
    return this.where === 'home';
  }

  // Por dónde sale de la plaza: el nudo del callejero más cercano al que se llega sin tropezar
  exit() {
    const { nodes, keep } = streetGraph();
    const H = this.base;
    const near = keep.map((i) => ({ i, d: Math.hypot(nodes[i].x - H.x, nodes[i].z - H.z) })).sort((a, b) => a.d - b.d).slice(0, 8);
    for (const { i, d } of near) {
      const ux = (nodes[i].x - H.x) / d;
      const uz = (nodes[i].z - H.z) / d;
      let ok = true;
      for (let r = 11; r < d && ok; r += 2) ok = Math.abs(this.T.height(H.x + ux * r, H.z + uz * r)) < 0.9;
      if (ok) return i;
    }
    return near[0].i;
  }

  // who: los jugadores que hay por la calle
  start(who) {
    const k = this.k;
    const H = this.base;
    this.on = this.done = true;
    this.hits = 0;
    this.warned = false;
    this.by = null;
    // El reloj cuenta con lo lejos de la plaza que pille al que esté más cerca
    this.left = 75 + Math.sqrt(Math.min(...who.map((p) => (p.pos.x - H.x) ** 2 + (p.pos.z - H.z) ** 2))) / 26;
    k.to = this.exit();
    k.from = -1;
    const N = streetGraph().nodes[k.to];
    k.heading = Math.atan2(N.x - H.x, N.z - H.z);
    k.x = H.x;
    k.z = H.z;
    k.y = H.y + 30;
    k.state = 'drop';
    k.t = k.cd = k.v = k.alarm = k.fx = k.hop = 0;
    k.loot = false;
  }

  // Timbre sónico: también deja tonto al ladrón. dry: solo se pregunta si lo cogería (un invitado)
  sonic(x, z, r, dry) {
    const k = this.k;
    if ((k.state !== 'run' && k.state !== 'hit') || Math.hypot(k.x - x, k.z - z) > r) return false;
    if (dry) return true;
    k.state = 'dazed';
    k.t = DAZE;
    return true;
  }

  // En el anfitrión: un invitado dice que le ha dado un culetazo
  asked(k, v, r) {
    if (HITTABLE.has(this.k.state)) this.hit(r, v[0] | 0);
  }

  // Un culetazo más: al tercero suelta la estatua. how: 0, embestido; 1, con el truco; 2, de un pisotón.
  // Lo que nota quien se lo da (el frenazo, el turbo, la sacudida) ya lo ha puesto su pantalla (`strike`)
  hit(p, how) {
    const g = this.game;
    const k = this.k;
    const turbo = p.boosting && p.grounded;
    this.hits++;
    this.by = p;
    g.at(k.x, k.z).bits.burst(k.x, k.y + 3, k.z, BITS, 12, 10, k.y, 0.45);
    const to = g.to(p);
    to.studs.burst(k.x, k.y + 1.5, k.z, 5, 1, k.y, 9);
    if (this.hits >= HITS) {
      // Sale volando por donde lo empujan
      p.velocity(g.tmpV);
      const sp = Math.max(14, Math.hypot(g.tmpV.x, g.tmpV.z));
      const a = sp > 14.5 ? Math.atan2(g.tmpV.x, g.tmpV.z) : p.heading;
      k.state = 'fly';
      k.t = k.rot = 0;
      k.vx = Math.sin(a) * (sp * 1.15 + 12);
      k.vz = Math.cos(a) * (sp * 1.15 + 12);
      k.vy = 13 + sp * 0.3;
      k.spin = 12;
      k.heading = a;
      k.y += 0.6;
      this.recover(p);
      return;
    }
    to.hud.trick(how === 1 ? p.char.alienTrick : how === 2 ? '¡Pisotón al ladrón!' : turbo ? '¡Superculetazo al ladrón!' : '¡Culetazo al ladrón!', 800 * this.hits, 1);
    to.addStuds(80 * this.hits);
    g.all.hud.big(this.hits === HITS - 1 ? '¡Uno más y la suelta!' : '¡Suelta la estatua!', GOLD, 1.1, true);
    k.state = 'hit';
    k.t = 0.9;
    // Del susto da media vuelta y tira por donde ha venido
    if (k.from >= 0) [k.from, k.to] = [k.to, k.from];
  }

  // La estatua se le escapa de las manos y vuelve volando a su fuente. Se la apunta quien le ha
  // dado el último culetazo, pero el premio es para todos
  recover(p) {
    const g = this.game;
    const k = this.k;
    const reward = 2000 + Math.round(this.left) * 20;
    this.on = false;
    this.send();
    g.to(p).tally('statues');
    g.all.addStuds(reward);
    g.all.hud.trick('¡Estatua recuperada!', reward * 10, 1);
    g.all.hud.big('¡Estatua recuperada!', GOLD, 2.2);
    g.all.sfx.fanfare();
    g.all.confetti(k.x, k.y, k.z);
    g.all.hud.toast(`🏆 ¡${g.party ? 'Le habéis' : 'Le has'} quitado la <b>estatua dorada</b> al ladrón! Vuelve volando a su fuente. Premio: <b>${reward.toLocaleString('es-ES')}</b> studs.`);
    if (!g.party) g.saveGame();
  }

  // Se acabó el tiempo: el platillo lo recoge con la estatua y todo
  escape() {
    const g = this.game;
    const k = this.k;
    k.state = 'beamup';
    k.t = 0;
    k.loot = true;
    g.all.sfx.abducted();
    g.all.hud.big('¡Se ha escapado!', '#ff6b5a', 1.6);
    g.all.hud.toast('👽 El ladrón se ha subido al platillo con la <b>estatua dorada</b>. Echa a los marcianos para que la devuelvan.');
  }

  // Los marcianos se van (amanece, se rechaza la oleada, empieza un minijuego...): la estatua, a su sitio
  abort() {
    const g = this.game;
    const k = this.k;
    this.on = false;
    if (k.state !== 'off' && k.state !== 'fly' && k.state !== 'beamup') {
      k.state = 'beamup';
      k.t = 0;
    }
    k.loot = false;
    if (this.where === 'gone') {
      this.send();
      g.all.hud.toast('🏆 El platillo suelta la <b>estatua dorada</b>, que vuelve a su fuente.');
    } else if (this.where === 'carried') {
      this.send();
      g.all.hud.toast('🏆 El ladrón suelta la <b>estatua dorada</b>, que vuelve volando a su fuente.');
      // No se llegó a decidir: puede volver a intentarlo esta misma noche
      this.done = false;
      this.cd = FIRST;
    }
  }

  // Manda la estatua por los aires desde donde esté hasta su pedestal
  send() {
    const st = this.statue;
    const H = this.base;
    if (this.where === 'gone') {
      // La suelta el platillo, desde lo alto
      st.visible = true;
      st.position.set(H.x, H.y + 70, H.z);
      st.scale.setScalar(CARRY_S);
    }
    const s = st.position;
    this.where = 'flying';
    this.fly = { x: s.x, y: s.y, z: s.z, s: st.scale.x, t: 0 };
  }

  update(dt, p, time, inp) {
    const g = this.game;
    const k = this.k;
    const party = g.party;
    const led = !!party && !party.hosting && party.fed;
    // Al entrar en la partida de otro, o al acabarse, el robo de esta pantalla se queda en nada
    if (led !== this.led) {
      this.led = led;
      this.on = this.done = false;
      this.wave = null;
      k.state = 'off';
      if (this.where !== 'home' && !this.fly) this.send();
    }
    this.blips.length = 0;
    k.cd -= dt;
    if (!led) this.direct(dt, g.crowd(p), time, inp);
    if (k.state !== k.was) this.changed();
    else k.age += dt;
    k.fig.group.visible = k.state !== 'off';
    const hunted = this.on && this.where === 'carried' && (HITTABLE.has(k.state) || k.state === 'hit');
    if (k.state !== 'off') {
      if (hunted && p.crashT <= 0 && !p.held && !g.busy(p)) this.touch(p);
      this.present(dt, time);
    }
    this.updateStatue(dt, time);
    // El marcador es de todos: sale de cómo va el robo
    g.hud.setHeist(this.on && this.where === 'carried' ? this.hits : null, HITS, this.left);
    if (!hunted) return;
    this.blip.x = k.x;
    this.blip.z = k.z;
    this.blips.push(this.blip);
  }

  // Cuándo se atreve y por dónde huye. Solo jugando solo o en el anfitrión
  direct(dt, who, time, inp) {
    const g = this.game;
    const A = g.aliens;
    const k = this.k;
    if (A.wave !== this.wave) {
      this.wave = A.wave;
      this.done = false;
      this.cd = FIRST;
    }
    if (!A.active) {
      if (this.on) this.abort();
    } else if (!this.done && this.home && k.state === 'off' && !g.boss.on) {
      this.cd -= dt;
      if (this.cd <= 0 && who.some((p) => !p.held)) this.start(who);
    }
    if (k.state !== 'off') this.updateThief(dt, who, inp);
  }

  updateThief(dt, who, inp) {
    const g = this.game;
    const T = this.T;
    const k = this.k;
    const H = this.base;
    const near = g.at(k.x, k.z);
    k.speed = 0;

    if (k.state === 'fly') {
      // Por los aires tras el último culetazo, hasta reventar
      k.t += dt;
      k.vy -= G * dt;
      const nx = k.x + k.vx * dt;
      const nz = k.z + k.vz * dt;
      if (T.height(nx, nz) - k.y > 1) {
        k.vx *= -0.35;
        k.vz *= -0.35;
      } else {
        k.x = nx;
        k.z = nz;
      }
      k.y += k.vy * dt;
      const fl = T.height(k.x, k.z);
      if ((k.y <= fl && k.vy < 0) || k.t > 6) {
        g.slime.splat(k.x, k.z);
        near.bits.burst(k.x, fl + 1.5, k.z, [SKIN, 0xb6ff5a, C.black, C.white], 20, 11, fl);
        near.sfx.alienPop();
        (this.by ? g.to(this.by) : g.all).studs.burst(k.x, fl + 1, k.z, 6, 1, fl, 8);
        k.state = 'off';
      }
      return;
    }
    if (k.state === 'beamup') {
      k.t += dt;
      k.y += 38 * dt;
      if (k.t > 0.7) {
        k.state = 'off';
        if (k.loot) {
          this.where = 'gone';
          this.statue.visible = false;
        }
      }
      return;
    }
    if (k.state === 'drop') {
      k.y -= 46 * dt;
      if (k.y <= H.y) {
        // Ya la tiene: salta la alarma
        k.y = H.y;
        k.state = 'lift';
        k.t = 0;
        this.where = 'carried';
        g.all.sfx.heist();
        g.all.hud.big('¡Al ladrón!', GOLD, 1.8);
        g.all.hud.toast(`🏆 ¡Un marciano se lleva la <b>estatua dorada</b> de la Plaza de la Villa! Búscalo en el minimapa y dale <b>${HITS} culetazos</b> antes de que se escape.`);
      }
      return;
    }
    if (k.state === 'lift') {
      k.t += dt;
      if (k.t > 0.8) {
        // De un brinco, del pedestal a la plaza
        const N = streetGraph().nodes[k.to];
        const l = Math.hypot(N.x - H.x, N.z - H.z) || 1;
        k.state = 'hop';
        k.t = 0;
        k.hx = H.x + ((N.x - H.x) / l) * 11.5;
        k.hz = H.z + ((N.z - H.z) / l) * 11.5;
        k.hy = Math.max(0, T.height(k.hx, k.hz));
      }
      return;
    }
    if (k.state === 'hop') {
      k.t += dt;
      const e = Math.min(1, k.t / 0.8);
      k.x = lerp(H.x, k.hx, e);
      k.z = lerp(H.z, k.hz, e);
      k.y = lerp(H.y, k.hy, e) + Math.sin(e * Math.PI) * 4;
      if (e >= 1) {
        k.state = 'run';
        near.sfx.alienLand();
      }
      return;
    }

    // Con la estatua a cuestas por las calles. Huye del jugador que tenga más cerca que no esté a
    // otra cosa; el reloj se para mientras el rayo tiene cogidos a todos
    const A = g.aliens;
    const rider = A.u.state === 'ride' ? A.cargo : null;
    let p = null;
    let best = Infinity;
    for (const o of who) {
      if (o.held || o.hidden || g.busy(o)) continue;
      const e = (o.pos.x - k.x) ** 2 + (o.pos.z - k.z) ** 2;
      if (e < best) {
        best = e;
        p = o;
      }
    }
    const pAlive = !!p && p.crashT <= 0;
    p ||= who[0];
    const dx = p.pos.x - k.x;
    const dz = p.pos.z - k.z;
    const d = Math.hypot(dx, dz) || 1;
    if (rider || who.some((o) => !o.held)) this.left -= dt;
    if (this.left <= 0) {
      this.escape();
      return;
    }
    if (!this.warned && this.left < 15) {
      this.warned = true;
      g.all.hud.toast('⏱️ ¡Al ladrón le quedan <b>15 segundos</b> para llegar al platillo con la estatua!');
    }
    // Desde el platillo robado basta con pasarle el rayo por encima
    if (rider && (rider === g.player ? inp.jump : rider.key) && A.u.beam > 0.5 && Math.hypot(A.u.x - k.x, A.u.z - k.z) < 6) {
      k.state = 'beamup';
      k.t = 0;
      k.loot = false;
      g.to(rider).sfx.slurp();
      this.recover(rider);
      return;
    }

    if (k.state === 'hit') {
      // Trompo del culetazo, agarrado a la estatua
      k.t -= dt;
      k.heading += dt * 15;
      if (k.t <= 0) {
        k.state = 'run';
        k.alarm = 6;
        const N = streetGraph().nodes[k.to];
        k.heading = Math.atan2(N.x - k.x, N.z - k.z);
        k.v = RUN;
      }
    } else if (k.state === 'dazed') {
      // Tonto perdido por el timbrazo, viendo las estrellas
      k.t -= dt;
      k.heading += dt * 1.2;
      if (k.t <= 0) {
        k.state = 'run';
        k.alarm = 6;
      }
    } else {
      const nodes = streetGraph().nodes;
      // Mientras no ve a nadie, se pasea; en cuanto lo ve, corre, y sigue corriendo un rato por si acaso
      k.alarm = pAlive && d < SEES ? 4 : k.alarm - dt;
      const scared = k.alarm > 0;
      k.v = damp(k.v, scared ? RUN + this.hits * 1.5 : STROLL, 4, dt);
      k.speed = k.v;
      // Si lo tiene delante, da media vuelta antes de echarse en sus brazos
      k.turnCd -= dt;
      let B = nodes[k.to];
      if (scared && pAlive && k.turnCd <= 0 && k.from >= 0 && d < 38) {
        const l = Math.hypot(B.x - k.x, B.z - k.z) || 1;
        if (((B.x - k.x) * dx + (B.z - k.z) * dz) / (l * d) > 0.55) {
          [k.from, k.to] = [k.to, k.from];
          k.turnCd = 2.5;
          B = nodes[k.to];
        }
      }
      let step = k.v * dt;
      for (let i = 0; i < 4 && step > 0; i++) {
        const l = Math.hypot(B.x - k.x, B.z - k.z);
        if (l > step) {
          k.x += ((B.x - k.x) / l) * step;
          k.z += ((B.z - k.z) / l) * step;
          break;
        }
        step -= l;
        k.x = B.x;
        k.z = B.z;
        const prev = k.from;
        k.from = k.to;
        k.to = this.next(k.from, prev, p, scared);
        B = nodes[k.to];
      }
      k.heading += angDiff(k.heading, Math.atan2(B.x - k.x, B.z - k.z)) * Math.min(1, 10 * dt);
      const h = T.height(k.x, k.z);
      if (h > -0.8 && h - k.y < 1.6) k.y = h;
      k.walk += k.v * dt * 0.8;
      // Va soltando baba para quien le pise los talones
      k.slimeT -= dt;
      if (scared && k.slimeT <= 0 && d < 45 && dx * Math.sin(k.heading) + dz * Math.cos(k.heading) < 0) {
        k.slimeT = 3.5;
        if (g.slime.splat(k.x, k.z, 2.4)) near.sfx.squelch(0.5);
      }
    }
  }

  // El ladrón ha cambiado de estado: lo que se oye en esta pantalla al pasar de uno a otro
  changed() {
    const k = this.k;
    // El culetazo de otro
    if ((k.state === 'hit' || k.state === 'fly') && !k.mine) this.game.here(k.x, k.z).sfx.culetazo(false);
    k.mine = false;
    k.was = k.state;
    k.age = 0;
    k.rot = 0;
  }

  // Lo que se ve del ladrón, esté donde esté decidido
  present(dt, time) {
    const g = this.game;
    const k = this.k;
    const f = k.fig;
    const grp = f.group;
    const st = k.state;
    if (this.led) {
      // En un invitado, el paso sale de lo que se ha movido
      const moved = Math.hypot(k.x - k.px, k.z - k.pz);
      k.speed = moved / dt > 1 ? 1 : 0;
      k.walk += moved * 0.8;
    }
    k.px = k.x;
    k.pz = k.z;
    k.hop = 0;
    let tilt = 0;
    let scale = SIZE;
    if (st === 'fly') {
      k.rot += 12 * dt;
      f.armL.rotation.x = f.armR.rotation.x = -2.7;
      f.legL.rotation.x = 0.6;
      f.legR.rotation.x = -0.6;
      grp.rotation.set(k.rot, k.heading, 0);
    } else if (st === 'beamup') {
      scale = SIZE * Math.max(0.05, 1 - k.age / 0.7);
      grp.rotation.set(0, k.heading + k.age * 14, 0);
    } else if (st === 'drop' || st === 'lift') {
      f.armL.rotation.x = f.armR.rotation.x = -2.8;
      grp.rotation.set(0, k.heading, 0);
    } else if (st === 'hop') {
      f.legL.rotation.x = 0.7;
      f.legR.rotation.x = -0.7;
      grp.rotation.set(0, k.heading, 0);
    } else {
      if (st === 'hit') k.hop = Math.abs(Math.sin(k.age * 7)) * 1.2;
      else if (st === 'dazed') {
        tilt = Math.sin(time * 6) * 0.22;
        k.fx -= dt;
        if (k.fx <= 0) {
          k.fx = 0.16;
          const s = time * 7;
          g.bits.spawn(k.x + Math.sin(s) * 1.1, k.y + HEAD - 0.6, k.z + Math.cos(s) * 1.1, Math.cos(s) * 2, 1.5, -Math.sin(s) * 2, 0xfff27a, 0.26, 0.45, k.y);
        }
      } else if (k.alarm > 0) tilt = 0.2;
      // Corre con los brazos en alto, sujetando la estatua
      const sw = k.speed > 0 ? Math.sin(k.walk) : 0;
      f.legL.rotation.x = sw * 0.75;
      f.legR.rotation.x = -sw * 0.75;
      f.armL.rotation.x = -2.9 + sw * 0.08;
      f.armR.rotation.x = -2.9 - sw * 0.08;
      f.head.rotation.y = st === 'dazed' ? Math.sin(time * 8) * 0.9 : k.alarm > 0 ? 0 : Math.sin(time * 1.3) * 0.6;
      grp.rotation.set(tilt, k.heading, 0);
    }
    grp.scale.setScalar(scale);
    grp.position.set(k.x, k.y + k.hop, k.z);
  }

  // Contacto del patinete de esta pantalla con el ladrón, tal como lo ve: con las manos ocupadas,
  // se le da por cualquier lado
  touch(p) {
    const g = this.game;
    const k = this.k;
    if (k.cd > 0 || !HITTABLE.has(k.state)) return;
    const dx = p.pos.x - k.x;
    const dz = p.pos.z - k.z;
    const d = Math.hypot(dx, dz) || 1;
    const dy = p.pos.y - k.y;
    if (!p.grounded && p.whipT > 0 && d < 4.4 && dy > -2 && dy < 6) {
      this.strike(p, 1);
      return;
    }
    if (!p.grounded && p.vel.y < -3 && d < 2.9 && dy > 2 && dy < 8) {
      p.vel.y = 17;
      this.strike(p, 2);
      return;
    }
    if (d > 3 || dy < -2 || dy > 3.4) return;
    p.velocity(g.tmpV);
    const sp = Math.hypot(g.tmpV.x, g.tmpV.z);
    if (sp > (k.state === 'dazed' ? 3 : 8) && g.tmpV.x * dx + g.tmpV.z * dz < 0) this.strike(p, 0);
    else {
      p.bump(dx / d, dz / d, 0.2, 0.7);
      k.cd = 0.4;
      if (!this.led) k.alarm = 4;
    }
  }

  // El culetazo, visto por quien lo da: lo nota al momento, y el ladrón se entera por el anfitrión
  strike(p, how) {
    const g = this.game;
    const k = this.k;
    const turbo = p.boosting && p.grounded;
    k.cd = 1.8;
    k.mine = true;
    g.camera3.addShake(turbo ? 0.5 : 0.35);
    g.sfx.culetazo(turbo);
    if (p.grounded) p.v *= 0.92;
    p.boost = Math.min(1, p.boost + 0.25);
    if (this.led) g.party.tell('ladron', [how]);
    else this.hit(p, how);
  }

  // Por dónde tira al llegar a un cruce: si ha visto a alguien, por la calle que más le aleje de él
  next(at, prev, p, scared) {
    const nodes = streetGraph().nodes;
    const n = nodes[at];
    let list = n.all.filter((e) => e.to !== prev);
    if (!list.length) list = n.all;
    if (!scared) return list[Math.floor(Math.random() * list.length)].to;
    const ax = n.x - p.pos.x;
    const az = n.z - p.pos.z;
    const al = Math.hypot(ax, az) || 1;
    let best = list[0].to;
    let top = -Infinity;
    for (const e of list) {
      const c = nodes[e.to];
      const l = Math.hypot(c.x - n.x, c.z - n.z) || 1;
      const sc = ((c.x - n.x) * ax + (c.z - n.z) * az) / (l * al) + Math.random() * 0.5;
      if (sc > top) {
        top = sc;
        best = e.to;
      }
    }
    return best;
  }

  updateStatue(dt, time) {
    const st = this.statue;
    const k = this.k;
    const H = this.base;
    if (this.where === 'carried') {
      // Sobre la cabeza del ladrón: encoge al cogerla y baila con cada zancada
      const s = k.state === 'lift' ? lerp(HOME_S, CARRY_S, clamp(k.age / 0.5, 0, 1)) : CARRY_S;
      const up = k.state === 'lift' ? lerp(0, HEAD, clamp(k.age / 0.5, 0, 1)) : HEAD;
      st.visible = true;
      st.scale.setScalar(k.state === 'beamup' ? CARRY_S * Math.max(0.05, 1 - k.age / 0.7) : s);
      st.position.set(k.x, k.y + k.hop + up, k.z);
      st.rotation.set(0, k.heading, Math.sin(k.walk) * 0.07 + (k.state === 'dazed' ? Math.sin(time * 6) * 0.2 : 0));
    } else if (this.where === 'flying') {
      const F = this.fly;
      F.t = Math.min(1, F.t + dt / 2.4);
      const e = F.t * F.t * (3 - 2 * F.t);
      st.position.set(lerp(F.x, H.x, e), lerp(F.y, H.y, e) + Math.sin(F.t * Math.PI) * 34, lerp(F.z, H.z, e));
      st.scale.setScalar(lerp(F.s, HOME_S, e));
      st.rotation.set(e * TAU * 3, st.rotation.y + dt * 6, 0);
      if (F.t >= 1) {
        this.where = 'home';
        this.fly = null;
        this.flown = true;
        st.position.copy(H);
        st.rotation.set(0, st.rotation.y, 0);
        st.scale.setScalar(HOME_S);
        const p = this.game.player.pos;
        this.game.bits.burst(H.x, H.y + 4, H.z, BITS, 22, 12, H.y, 0.5);
        if (Math.hypot(p.x - H.x, p.z - H.z) < 160) this.game.sfx.gold();
      }
    }
  }

  // ---------- En red ----------
  // Lo que viaja en cada `foto`: nada si no hay robo y la estatua está en su fuente; si no, el
  // ladrón, los culetazos que lleva, lo que le queda y dónde anda la estatua
  get bytes() {
    return this.k.state === 'off' && this.where === 'home' && !this.on ? 1 : 12;
  }

  write(dv, o) {
    const k = this.k;
    if (this.bytes === 1) {
      dv.setUint8(o, 0);
      return o + 1;
    }
    const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));
    dv.setUint8(o, 1 | (this.on ? 2 : 0) | (k.alarm > 0 ? 4 : 0));
    dv.setUint8(o + 1, STATES.indexOf(k.state) | (WHERE.indexOf(this.where) << 4));
    dv.setInt16(o + 2, i16(k.x * POS), true);
    dv.setInt16(o + 4, i16(k.z * POS), true);
    dv.setInt16(o + 6, i16(k.y * ALT), true);
    dv.setUint8(o + 8, Math.round(angDiff(0, k.heading) * TURN) & 255);
    dv.setUint8(o + 9, this.hits);
    dv.setUint16(o + 10, Math.max(0, Math.min(65535, Math.round(this.left * 10))), true);
    return o + 12;
  }

  // Invitado: el robo del anfitrión, entre dos fotos suyas (j de 0 a 1)
  read(a, b, o, j) {
    const k = this.k;
    const f = a.getUint8(o);
    if (!f) {
      this.on = false;
      k.state = 'off';
      this.settle('home');
      return o + 1;
    }
    const sb = a.getUint8(o + 1);
    this.on = !!(f & 2);
    k.alarm = f & 4 ? 1 : 0;
    k.state = STATES[sb & 15] || 'off';
    if (b.getUint8(o + 1) !== sb) j = 0;
    const i16 = (at) => a.getInt16(at, true) + (b.getInt16(at, true) - a.getInt16(at, true)) * j;
    k.x = i16(o + 2) / POS;
    k.z = i16(o + 4) / POS;
    k.y = i16(o + 6) / ALT;
    k.heading = (a.getUint8(o + 8) + ((((b.getUint8(o + 8) - a.getUint8(o + 8) + 384) & 255) - 128) * j)) / TURN;
    this.hits = a.getUint8(o + 9);
    this.left = a.getUint16(o + 10, true) / 10;
    this.settle(WHERE[sb >> 4] || 'home');
    return o + 12;
  }

  // Invitado: dónde dice el anfitrión que anda la estatua. El vuelo de vuelta lo lleva cada
  // pantalla, y no se corta ni se repite porque la del anfitrión acabe un poco antes o después
  settle(where) {
    const st = this.statue;
    if (where !== 'flying') this.flown = false;
    if (where === this.where || this.fly) return;
    if (where === 'flying') {
      if (!this.flown) this.send();
      return;
    }
    this.where = where;
    st.visible = where !== 'gone';
    if (where !== 'home') return;
    st.position.copy(this.base);
    st.rotation.set(0, st.rotation.y, 0);
    st.scale.setScalar(HOME_S);
  }
}
