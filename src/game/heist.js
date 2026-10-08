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

// El robo de la estatua dorada: en plena invasión un marciano con jersey de presidiario se
// descuelga sobre la fuente de la Plaza de la Villa, se echa la estatua del patinete a la cabeza y
// se larga con ella por las calles. Hay que alcanzarlo y darle tres culetazos antes de que se le
// acabe el tiempo y el platillo lo recoja con el botín.
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
    this.k = { fig, state: 'off', x: 0, y: 0, z: 0, heading: 0, v: 0, t: 0, cd: 0, from: -1, to: 0, alarm: 0, turnCd: 0, slimeT: 0, walk: 0, hop: 0, fx: 0, loot: false, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, hx: 0, hz: 0, hy: 0 };
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

  start(p) {
    const k = this.k;
    const H = this.base;
    this.on = this.done = true;
    this.hits = 0;
    this.warned = false;
    // El reloj cuenta con lo lejos que te pille de la plaza
    this.left = 75 + Math.hypot(p.pos.x - H.x, p.pos.z - H.z) / 26;
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
    k.fig.group.scale.setScalar(SIZE);
    k.fig.group.visible = true;
  }

  // Timbre sónico: también deja tonto al ladrón
  sonic(x, z, r) {
    const k = this.k;
    if ((k.state !== 'run' && k.state !== 'hit') || Math.hypot(k.x - x, k.z - z) > r) return false;
    k.state = 'dazed';
    k.t = DAZE;
    k.fx = 0;
    return true;
  }

  // Un culetazo más: al tercero suelta la estatua
  hit(p, label) {
    const g = this.game;
    const k = this.k;
    const turbo = p.boosting && p.grounded;
    this.hits++;
    if (p.grounded) p.v *= 0.92;
    p.boost = Math.min(1, p.boost + 0.25);
    g.bits.burst(k.x, k.y + 3, k.z, BITS, 12, 10, k.y, 0.45);
    g.studs.burst(k.x, k.y + 1.5, k.z, 5, 1, k.y, 9);
    g.camera3.addShake(turbo ? 0.5 : 0.35);
    g.sfx.culetazo(turbo);
    if (this.hits >= HITS) {
      // Sale volando por donde lo empujas
      p.velocity(g.tmpV);
      const sp = Math.max(14, Math.hypot(g.tmpV.x, g.tmpV.z));
      const a = sp > 14.5 ? Math.atan2(g.tmpV.x, g.tmpV.z) : p.heading;
      k.state = 'fly';
      k.t = k.rot = k.fx = 0;
      k.vx = Math.sin(a) * (sp * 1.15 + 12);
      k.vz = Math.cos(a) * (sp * 1.15 + 12);
      k.vy = 13 + sp * 0.3;
      k.spin = 12;
      k.heading = a;
      k.y += 0.6;
      this.recover(p);
      return;
    }
    g.hud.setHeist(this.hits, HITS, this.left);
    g.hud.trick(label || (turbo ? '¡Superculetazo al ladrón!' : '¡Culetazo al ladrón!'), 800 * this.hits, 1);
    g.addStuds(80 * this.hits);
    g.hud.big(this.hits === HITS - 1 ? '¡Uno más y la suelta!' : '¡Suelta la estatua!', GOLD, 1.1, true);
    k.state = 'hit';
    k.t = 0.9;
    k.cd = 1.8;
    // Del susto da media vuelta y tira por donde ha venido
    if (k.from >= 0) [k.from, k.to] = [k.to, k.from];
  }

  // La estatua se le escapa de las manos y vuelve volando a su fuente
  recover(p) {
    const g = this.game;
    const k = this.k;
    const reward = 2000 + Math.round(this.left) * 20;
    this.on = false;
    this.send();
    g.save.statues = (g.save.statues || 0) + 1;
    g.addStuds(reward);
    g.saveGame();
    g.hud.setHeist(null);
    g.hud.trick('¡Estatua recuperada!', reward * 10, 1);
    g.hud.big('¡Estatua recuperada!', GOLD, 2.2);
    g.sfx.fanfare();
    g.confetti(k.x, k.y, k.z);
    g.hud.toast(`🏆 ¡Le has quitado la <b>estatua dorada</b> al ladrón! Vuelve volando a su fuente. Premio: <b>${reward.toLocaleString('es-ES')}</b> studs.`, '¡Le has quitado la estatua dorada al ladrón! Vuelve volando a su fuente.');
  }

  // Se acabó el tiempo: el platillo lo recoge con la estatua y todo
  escape() {
    const g = this.game;
    const k = this.k;
    k.state = 'beamup';
    k.t = 0;
    k.loot = true;
    g.hud.setHeist(null);
    g.sfx.abducted();
    g.hud.big('¡Se ha escapado!', '#ff6b5a', 1.6);
    g.hud.toast('👽 El ladrón se ha subido al platillo con la <b>estatua dorada</b>. Echa a los marcianos para que la devuelvan.');
  }

  // Los marcianos se van (amanece, se rechaza la oleada, empieza un minijuego...): la estatua, a su sitio
  abort() {
    const g = this.game;
    const k = this.k;
    const H = this.base;
    this.on = false;
    if (k.state !== 'off' && k.state !== 'fly' && k.state !== 'beamup') {
      k.state = 'beamup';
      k.t = 0;
      k.loot = false;
    }
    k.loot = false;
    g.hud.setHeist(null);
    if (this.where === 'gone') {
      this.statue.visible = true;
      this.statue.position.set(H.x, H.y + 70, H.z);
      this.statue.scale.setScalar(CARRY_S);
      this.send();
      g.hud.toast('🏆 El platillo suelta la <b>estatua dorada</b>, que vuelve a su fuente.');
    } else if (this.where === 'carried') {
      this.send();
      g.hud.toast('🏆 El ladrón suelta la <b>estatua dorada</b>, que vuelve volando a su fuente.');
      // No se llegó a decidir: puede volver a intentarlo esta misma noche
      this.done = false;
      this.cd = FIRST;
    }
  }

  // Manda la estatua por los aires desde donde esté hasta su pedestal
  send() {
    const s = this.statue.position;
    this.where = 'flying';
    this.fly = { x: s.x, y: s.y, z: s.z, s: this.statue.scale.x, t: 0 };
  }

  update(dt, p, time, inp) {
    const g = this.game;
    const A = g.aliens;
    const k = this.k;
    this.blips.length = 0;
    if (A.wave !== this.wave) {
      this.wave = A.wave;
      this.done = false;
      this.cd = FIRST;
    }
    if (!A.active) {
      if (this.on) this.abort();
    } else if (!this.done && this.home && k.state === 'off' && !g.boss.on) {
      this.cd -= dt;
      if (this.cd <= 0 && !p.held) this.start(p);
    }
    if (k.state !== 'off') this.updateThief(dt, p, time, inp);
    this.updateStatue(dt, time);
  }

  updateThief(dt, p, time, inp) {
    const g = this.game;
    const T = this.T;
    const k = this.k;
    const f = k.fig;
    const grp = f.group;
    const H = this.base;
    const dx = p.pos.x - k.x;
    const dz = p.pos.z - k.z;
    const d = Math.hypot(dx, dz) || 1;
    const pAlive = p.crashT <= 0 && !p.held;
    let hop = 0;
    let tilt = 0;
    k.cd -= dt;

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
      k.rot += k.spin * dt;
      const fl = T.height(k.x, k.z);
      if ((k.y <= fl && k.vy < 0) || k.t > 6) {
        g.slime.splat(k.x, k.z);
        g.bits.burst(k.x, fl + 1.5, k.z, [SKIN, 0xb6ff5a, C.black, C.white], 20, 11, fl);
        g.studs.burst(k.x, fl + 1, k.z, 6, 1, fl, 8);
        if (d < 130) g.sfx.alienPop();
        k.state = 'off';
        grp.visible = false;
        return;
      }
      f.armL.rotation.x = f.armR.rotation.x = -2.7;
      f.legL.rotation.x = 0.6;
      f.legR.rotation.x = -0.6;
      grp.position.set(k.x, k.y, k.z);
      grp.rotation.set(k.rot, k.heading, 0);
      return;
    }
    if (k.state === 'beamup') {
      k.t += dt;
      k.y += 38 * dt;
      if (k.t > 0.7) {
        k.state = 'off';
        grp.visible = false;
        if (k.loot) {
          this.where = 'gone';
          this.statue.visible = false;
        }
        return;
      }
      grp.scale.setScalar(SIZE * Math.max(0.05, 1 - k.t / 0.7));
      grp.position.set(k.x, k.y, k.z);
      grp.rotation.set(0, k.heading + k.t * 14, 0);
      return;
    }
    if (k.state === 'drop') {
      k.y -= 46 * dt;
      f.armL.rotation.x = f.armR.rotation.x = -2.8;
      if (k.y <= H.y) {
        // Ya la tiene: salta la alarma
        k.y = H.y;
        k.state = 'lift';
        k.t = 0;
        this.where = 'carried';
        g.sfx.heist();
        g.hud.big('¡Al ladrón!', GOLD, 1.8);
        g.hud.setHeist(0, HITS, this.left);
        g.hud.toast(`🏆 ¡Un marciano se lleva la <b>estatua dorada</b> de la Plaza de la Villa! Búscalo en el minimapa y dale <b>${HITS} culetazos</b> antes de que se escape.`);
      }
      grp.position.set(k.x, k.y, k.z);
      grp.rotation.set(0, k.heading, 0);
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
      grp.position.set(k.x, k.y, k.z);
      grp.rotation.set(0, k.heading, 0);
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
        g.sfx.alienLand();
      }
      f.legL.rotation.x = 0.7;
      f.legR.rotation.x = -0.7;
      grp.position.set(k.x, k.y, k.z);
      grp.rotation.set(0, k.heading, 0);
      return;
    }

    // Con la estatua a cuestas por las calles. El reloj se para mientras el rayo te tiene cogido
    const riding = g.aliens.u.state === 'ride';
    if (!p.held || riding) this.left -= dt;
    if (this.left <= 0) {
      this.escape();
      return;
    }
    if (!this.warned && this.left < 15) {
      this.warned = true;
      g.hud.toast('⏱️ ¡Al ladrón le quedan <b>15 segundos</b> para llegar al platillo con la estatua!');
    }
    g.hud.setHeist(this.hits, HITS, this.left);
    this.blip.x = k.x;
    this.blip.z = k.z;
    this.blips.push(this.blip);
    // En tu platillo robado basta con pasarle el rayo por encima
    if (riding && inp.jump && g.aliens.u.beam > 0.5 && Math.hypot(g.aliens.u.x - k.x, g.aliens.u.z - k.z) < 6) {
      k.state = 'beamup';
      k.t = 0;
      k.loot = false;
      g.sfx.slurp();
      this.recover(p);
      return;
    }

    let speed = 0;
    if (k.state === 'hit') {
      // Trompo del culetazo, agarrado a la estatua
      k.t -= dt;
      k.heading += dt * 15;
      hop = Math.abs(Math.sin(k.t * 7)) * 1.2;
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
      tilt = Math.sin(time * 6) * 0.22;
      k.fx -= dt;
      if (k.fx <= 0) {
        k.fx = 0.16;
        const s = time * 7;
        g.bits.spawn(k.x + Math.sin(s) * 1.1, k.y + HEAD - 0.6, k.z + Math.cos(s) * 1.1, Math.cos(s) * 2, 1.5, -Math.sin(s) * 2, 0xfff27a, 0.26, 0.45, k.y);
      }
      if (k.t <= 0) {
        k.state = 'run';
        k.alarm = 6;
      }
    } else {
      const nodes = streetGraph().nodes;
      // Mientras no te ve, se pasea; en cuanto te ve, corre, y sigue corriendo un rato por si acaso
      k.alarm = pAlive && d < SEES ? 4 : k.alarm - dt;
      const scared = k.alarm > 0;
      k.v = damp(k.v, scared ? RUN + this.hits * 1.5 : STROLL, 4, dt);
      speed = k.v;
      // Si te tiene delante, da media vuelta antes de echarse en tus brazos
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
      tilt = scared ? 0.2 : 0;
      // Va soltando baba para quien le pise los talones
      k.slimeT -= dt;
      if (scared && k.slimeT <= 0 && d < 45 && dx * Math.sin(k.heading) + dz * Math.cos(k.heading) < 0) {
        k.slimeT = 3.5;
        if (g.slime.splat(k.x, k.z, 2.4)) g.sfx.squelch(0.5);
      }
    }

    // Animación: corre con los brazos en alto, sujetando la estatua
    const sw = speed > 0 ? Math.sin(k.walk) : 0;
    f.legL.rotation.x = sw * 0.75;
    f.legR.rotation.x = -sw * 0.75;
    f.armL.rotation.x = -2.9 + sw * 0.08;
    f.armR.rotation.x = -2.9 - sw * 0.08;
    f.head.rotation.y = k.state === 'dazed' ? Math.sin(time * 8) * 0.9 : k.alarm > 0 ? 0 : Math.sin(time * 1.3) * 0.6;
    grp.position.set(k.x, k.y + hop, k.z);
    grp.rotation.set(tilt, k.heading, 0);
    k.hop = hop;

    // Contacto con el patinete: al ladrón, con las manos ocupadas, se le da por cualquier lado
    if (!pAlive || k.cd > 0 || !HITTABLE.has(k.state)) return;
    const dy = p.pos.y - k.y;
    if (!p.grounded && p.whipT > 0 && d < 4.4 && dy > -2 && dy < 6) {
      this.hit(p, p.char.alienTrick);
      return;
    }
    if (!p.grounded && p.vel.y < -3 && d < 2.9 && dy > 2 && dy < 8) {
      p.vel.y = 17;
      this.hit(p, '¡Pisotón al ladrón!');
      return;
    }
    if (d > 3 || dy < -2 || dy > 3.4) return;
    p.velocity(g.tmpV);
    const sp = Math.hypot(g.tmpV.x, g.tmpV.z);
    if (sp > (k.state === 'dazed' ? 3 : 8) && g.tmpV.x * dx + g.tmpV.z * dz < 0) this.hit(p);
    else {
      p.bump(dx / d, dz / d, 0.2, 0.7);
      k.cd = 0.4;
      k.alarm = 4;
    }
  }

  // Por dónde tira al llegar a un cruce: si te ha visto, por la calle que más le aleje de ti
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
      const s = k.state === 'lift' ? lerp(HOME_S, CARRY_S, clamp(k.t / 0.5, 0, 1)) : CARRY_S;
      const up = k.state === 'lift' ? lerp(0, HEAD, clamp(k.t / 0.5, 0, 1)) : HEAD;
      st.scale.setScalar(k.state === 'beamup' ? CARRY_S * Math.max(0.05, 1 - k.t / 0.7) : s);
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
        st.position.copy(H);
        st.rotation.set(0, st.rotation.y, 0);
        st.scale.setScalar(HOME_S);
        const p = this.game.player.pos;
        this.game.bits.burst(H.x, H.y + 4, H.z, BITS, 22, 12, H.y, 0.5);
        if (Math.hypot(p.x - H.x, p.z - H.z) < 160) this.game.sfx.gold();
      }
    }
  }
}
