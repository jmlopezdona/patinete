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

const _v = new THREE.Vector3();

function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}

// La noche de los marcianos: al anochecer llega un platillo con su tropa.
// Los marcianos te persiguen de frente, pero por la espalda (o asustados por el turbo)
// se van de un culetazo. El rayo del platillo te abduce si te quedas debajo.
export class Aliens {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.wave = null;
    this.cleared = false;
    this.active = false;
    this.scareT = 0;
    this.spawnT = 0;
    this.grabCd = 0;
    this.combo = 0;
    this.lastKick = -99;
    this.dawnT = 0;
    this.esc = 0;
    this.carry = null;
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
    return { fig, i, state: 'off', x: 0, y: 0, z: 0, gy: 0, heading: 0, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, t: 0, cd: 0, far: 0, walk: i * 1.7, stuck: 0, detour: 0, detourDir: 0, dirT: 0, fx: 0, blip: { x: 0, z: 0 } };
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
    const pilot = createMinifig({ skin: SKIN, face: 'alien', hair: 'antenna', hairColor: C.red, torso: C.black, legs: C.black, print: 'star', printColor: '#f7d117' });
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
    this.u = { state: 'gone', x: 0, y: 0, z: 0, vx: 0, vz: 0, t: 0, dur: 6, sx: 1, sz: 0, beam: 0, meter: 0, blip: { x: 0, z: 0, icon: '🛸' } };
  }

  // ---------- Oleadas ----------
  startWave() {
    const g = this.game;
    const level = g.save.invasions || 0;
    this.wave = { level, goal: Math.min(28, 8 + level * 4), count: 0 };
    this.combo = 0;
    g.hud.big('¡Invasión!', GREEN, 1.8);
    g.sfx.invasion();
    this.hints = [
      [0.3, `🛸 ¡Los marcianos invaden Cobeña! Oleada <b>${level + 1}</b>: échalos a <b>culetazos</b>, embistiéndolos por la espalda.`],
      [7, '💨 Con el <b>turbo</b> se asustan y salen huyendo: ¡es el momento de darles en el culo!'],
      [14, '🔦 No te quedes bajo el <b>rayo del platillo</b>. Si te atrapa, machaca <b>Espacio</b> para soltarte.'],
    ];
  }

  resume(p) {
    const g = this.game;
    const u = this.u;
    // El platillo baja del cielo por el lado del campanario
    const bf = g.world.places.belfry || g.world.places.plaza;
    const dx = bf.x - p.pos.x;
    const dz = bf.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, 110 / d);
    u.x = p.pos.x + dx * k;
    u.z = p.pos.z + dz * k;
    u.y = HOVER + 110;
    u.vx = u.vz = 0;
    u.meter = 0;
    this.setUfo('arrive');
    this.ufo.visible = true;
    this.spawnT = 1.5;
    g.hud.setAliens(this.wave.count, this.wave.goal);
  }

  retreat(p) {
    const g = this.game;
    this.release(p);
    for (const a of this.aliens) this.beamUp(a);
    if (this.u.state !== 'gone' && this.u.state !== 'leave') this.setUfo('leave');
    g.hud.setAliens(null);
    g.hud.abduct(null);
    g.hud.beam(0);
  }

  victory() {
    const g = this.game;
    const W = this.wave;
    const reward = 3000 + W.level * 1000;
    this.cleared = true;
    this.dawnT = 4.5;
    g.save.invasions = W.level + 1;
    g.addStuds(reward);
    g.saveGame();
    g.hud.big('¡Cobeña salvada!', GREEN, 2.6);
    g.sfx.fanfare();
    g.confetti();
    g.hud.toast(`🏆 ¡Invasión rechazada! Premio: <b>${reward.toLocaleString('es-ES')}</b> studs. Volverán otra noche… con refuerzos.`);
  }

  setUfo(state) {
    const u = this.u;
    u.state = state;
    u.t = 0;
    if (state === 'rest') {
      const a = Math.random() * TAU;
      u.sx = Math.sin(a);
      u.sz = Math.cos(a);
      u.dur = 6;
    }
  }

  // ---------- Bucle ----------
  update(dt, p, time) {
    const g = this.game;
    const night = g.env.target > 0.5;
    if (!night) {
      if (this.wave && !this.cleared) g.hud.toast('☀️ Con la luz del día los marcianos se esconden… pero volverán esta noche.');
      this.wave = null;
      this.cleared = false;
    } else if (!this.wave && !g.missions.active) this.startWave();
    const on = night && !!this.wave && !this.cleared && !g.missions.active;
    if (on !== this.active) {
      this.active = on;
      if (on) this.resume(p);
      else this.retreat(p);
    }
    g.sfx.invaded(on);
    if (this.dawnT > 0) {
      this.dawnT -= dt;
      if (this.dawnT <= 0 && g.env.target > 0.5) g.env.toggle();
    }
    if (this.active && this.hints.length) {
      for (const h of this.hints) h[0] -= dt;
      if (this.hints[0][0] <= 0) g.hud.toast(this.hints.shift()[1]);
    }
    this.grabCd -= dt;
    this.updateUfo(dt, p, time);
    this.updateAliens(dt, p, time);

    this.blips.length = 0;
    for (const a of this.aliens) {
      if (a.state === 'off') continue;
      a.blip.x = a.x;
      a.blip.z = a.z;
      this.blips.push(a.blip);
    }
    if (this.u.state !== 'gone') {
      this.u.blip.x = this.u.x;
      this.u.blip.z = this.u.z;
      this.blips.push(this.u.blip);
    }
  }

  // ---------- Platillo ----------
  updateUfo(dt, p, time) {
    const u = this.u;
    const g = this.game;
    if (u.state === 'gone') return;
    u.t += dt;
    const lvl = this.wave ? this.wave.level : 0;
    const dx = p.pos.x - u.x;
    const dz = p.pos.z - u.z;
    const d = Math.hypot(dx, dz);
    let beamOn = false;
    let vmax = 0;
    let tx = u.x;
    let tz = u.z;
    let yT = HOVER;
    switch (u.state) {
      case 'arrive':
        if (u.t > 2.6) this.setUfo('hunt');
        break;
      case 'hunt':
        p.velocity(_v);
        tx = p.pos.x + _v.x * 0.45;
        tz = p.pos.z + _v.z * 0.45;
        vmax = d > 150 ? 48 : Math.min(27, 20.5 + lvl * 1.2);
        beamOn = d < 60;
        if (u.t > 13) this.setUfo('rest');
        break;
      case 'rest':
        // Se aparta un poco mientras recarga el rayo
        tx = p.pos.x + u.sx * 45;
        tz = p.pos.z + u.sz * 45;
        vmax = 30;
        yT = HOVER + 9;
        if (u.t > u.dur) this.setUfo('hunt');
        break;
      case 'stun':
        yT = HOVER + 4;
        if (u.t > 4.5) this.setUfo('rest');
        break;
      case 'abduct':
        beamOn = true;
        this.updateAbduct(dt, p, time, lvl);
        break;
      case 'carry':
        yT = HOVER + 14;
        this.updateCarry(dt, p);
        break;
      default:
        break;
    }
    if (u.state === 'leave') {
      u.y += (20 + u.t * 70) * dt;
      if (u.t > 3) {
        u.state = 'gone';
        u.beam = u.meter = 0;
        this.ufo.visible = this.beam.visible = this.spot.visible = false;
        this.light.intensity = 0;
        g.sfx.ufo(0, false);
        return;
      }
    }
    if (u.state !== 'carry') {
      const ex = tx - u.x;
      const ez = tz - u.z;
      const ed = Math.hypot(ex, ez) || 1;
      const sp = Math.min(vmax, ed * 1.4);
      u.vx = damp(u.vx, (ex / ed) * sp, 2.2, dt);
      u.vz = damp(u.vz, (ez / ed) * sp, 2.2, dt);
      u.x += u.vx * dt;
      u.z += u.vz * dt;
    }
    const roof = this.T.height(u.x, u.z);
    if (u.state !== 'leave') u.y = damp(u.y, Math.max(yT, roof + 9), 1.6, dt);

    // ¿Tiene al patinete bajo el rayo?
    if (u.state === 'hunt') {
      const inBeam = u.beam > 0.6 && d < BEAM_R && p.pos.y < u.y - 4 && p.crashT <= 0 && p.invuln <= 0 && !p.held;
      u.meter = clamp(u.meter + (inBeam ? dt / 0.85 : -dt * 1.1), 0, 1);
      if (u.meter >= 1) this.startAbduct(p);
    } else if (u.state !== 'abduct') u.meter = Math.max(0, u.meter - dt * 2);
    g.hud.beam(u.state === 'abduct' ? 1 : u.meter);

    // Aspecto
    u.beam = damp(u.beam, beamOn ? 1 : 0, 6, dt);
    const wob = u.state === 'stun' || u.state === 'leave' ? Math.sin(time * 15) * 0.2 : 0;
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
      this.beamMat.color.lerpColors(BEAM_COLD, BEAM_HOT, u.meter);
      this.beamMat.opacity = u.beam * (0.16 + u.meter * 0.12 + Math.sin(time * 9) * 0.025);
      this.spot.position.set(u.x, roof + 0.15, u.z);
      lift(u.x, u.z);
      this.spot.rotation.set(-Math.atan(grade.z), 0, Math.atan(grade.x));
      this.spotMat.color.copy(this.beamMat.color);
      this.spotMat.opacity = u.beam * (0.2 + u.meter * 0.2);
    }
    this.light.intensity = u.beam * 22;
    const near = clamp(1 - Math.hypot(d, u.y - p.pos.y) / 150, 0, 1);
    g.sfx.ufo(near, u.meter > 0.05 || u.state === 'abduct');
  }

  startAbduct(p) {
    const g = this.game;
    this.setUfo('abduct');
    p.held = true;
    p.grounded = false;
    p.grind = null;
    p.boosting = false;
    p.v = 0;
    p.vel.set(0, 0, 0);
    this.esc = 0.15;
    this.combo = 0;
    g.hud.big('¡El rayo!', GREEN, 0.9, true);
    g.hud.abduct(this.esc);
    g.sfx.beamGrab();
    g.camera3.addShake(0.3);
  }

  updateAbduct(dt, p, time, lvl) {
    const g = this.game;
    const u = this.u;
    if (!p.held) {
      // Lo han recolocado desde fuera (pausa, misión...)
      g.hud.abduct(null);
      this.setUfo('rest');
      return;
    }
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
    if (Math.random() < dt * 24) {
      const a = Math.random() * TAU;
      g.bits.spawn(u.x + Math.cos(a) * 3, p.pos.y - 2, u.z + Math.sin(a) * 3, 0, 9 + Math.random() * 6, 0, 0xb6ff5a, 0.3, 0.6, p.pos.y - 30);
    }
    g.hud.abduct(Math.min(1, this.esc));
    if (this.esc >= 1) {
      this.release(p);
      this.setUfo('stun');
      g.hud.big('¡Te has soltado!', '#ffd23a', 1.1, true);
      g.sfx.escape();
      g.camera3.addShake(0.3);
    } else if (p.pos.y > u.y - 4.2) this.take(p);
  }

  // Dentro del platillo: vuelo exprés a otra punta del pueblo
  take(p) {
    const g = this.game;
    const u = this.u;
    const sp = g.home.spawn;
    const drops = [...this.drops, { name: g.home.drop || g.home.roam || g.home.spot ? g.home.name : 'la puerta de casa', x: sp.x, z: sp.z }];
    let cands = drops.filter((d) => Math.hypot(d.x - p.pos.x, d.z - p.pos.z) > 130);
    if (!cands.length) cands = drops;
    const dest = cands[Math.floor(Math.random() * cands.length)];
    const stolen = Math.min(500, Math.floor((g.save.studs * 0.1) / 10) * 10);
    if (stolen > 0) {
      g.save.studs -= stolen;
      g.hud.setStuds(g.save.studs);
      g.dirty = true;
    }
    const dist = Math.hypot(dest.x - u.x, dest.z - u.z);
    this.carry = { x0: u.x, z0: u.z, dest, stolen, dur: clamp(dist / 140, 2.2, 4.5) };
    this.setUfo('carry');
    p.hidden = true;
    p.flip = 0;
    g.hud.abduct(null);
    g.hud.big('¡Abducido!', GREEN, 1.6);
    g.sfx.abducted();
  }

  updateCarry(dt, p) {
    const g = this.game;
    const u = this.u;
    const c = this.carry;
    if (!p.held) {
      p.hidden = false;
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
    p.pos.set(u.x, u.y - 3, u.z);
    p.vel.set(u.vx, 0, u.vz);
    p.heading = Math.atan2(c.dest.x - c.x0, c.dest.z - c.z0);
    if (k >= 1) {
      p.pos.set(c.dest.x, u.y - 4, c.dest.z);
      this.release(p);
      p.invuln = 2.5;
      u.vx = u.vz = 0;
      this.setUfo('rest');
      u.dur = 11;
      g.camera3.snap = true;
      g.sfx.escape();
      g.hud.toast(`👽 Te han soltado en <b>${c.dest.name}</b>${c.stolen ? ` y te han birlado <b>${c.stolen}</b> studs` : ''}. ¡Qué cara!`);
    }
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
      a.cd = 0;
      a.far = a.stuck = a.detour = 0;
      a.fig.group.scale.setScalar(1);
      a.fig.group.visible = true;
      return true;
    }
    return false;
  }

  beamUp(a) {
    if (a.state === 'off' || a.state === 'fly' || a.state === 'beamup') return;
    a.state = 'beamup';
    a.t = 0;
  }

  updateAliens(dt, p, time) {
    const g = this.game;
    const T = this.T;
    const W = this.wave;
    const lvl = W ? W.level : 0;
    const pAlive = p.crashT <= 0 && !p.held;
    this.scareT = p.boosting && pAlive ? 1.3 : this.scareT - dt;
    const scared = this.scareT > 0;
    let walking = 0;
    for (const a of this.aliens) {
      if (a.state === 'off') continue;
      const f = a.fig;
      const grp = f.group;
      const dx = p.pos.x - a.x;
      const dz = p.pos.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const toP = Math.atan2(dx, dz);
      a.cd -= dt;
      let tilt = 0;
      let hop = 0;
      let speed = 0;

      if (a.state === 'fly') {
        // Por los aires tras el culetazo
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
        a.rot += a.spin * dt;
        const fl = T.height(a.x, a.z);
        a.fx -= dt;
        if (a.fx <= 0) {
          a.fx = 0.04;
          g.bits.spawn(a.x, a.y + 2, a.z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, Math.random() < 0.5 ? SKIN : 0xfff27a, 0.32, 0.5, fl);
        }
        if ((a.y <= fl && a.vy < 0) || a.t > 6) {
          this.pop(a, fl, d);
          continue;
        }
        f.armL.rotation.x = f.armR.rotation.x = -2.7;
        f.legL.rotation.x = 0.6;
        f.legR.rotation.x = -0.6;
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(a.rot, a.heading, 0);
        continue;
      }
      if (a.state === 'beamup') {
        a.t += dt;
        a.y += 38 * dt;
        if (a.t > 0.7) {
          a.state = 'off';
          grp.visible = false;
          continue;
        }
        grp.scale.setScalar(Math.max(0.05, 1 - a.t / 0.7));
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(0, a.heading + a.t * 14, 0);
        continue;
      }
      walking++;
      if (a.state === 'drop') {
        a.y -= 46 * dt;
        f.armL.rotation.x = f.armR.rotation.x = -2.8;
        if (a.y <= a.gy) {
          a.y = a.gy;
          a.state = 'wander';
          a.t = 1;
          a.dirT = a.heading;
          for (let k = 0; k < 8; k++) g.bits.spawn(a.x, a.y + 0.4, a.z, (Math.random() - 0.5) * 10, 3 + Math.random() * 4, (Math.random() - 0.5) * 10, 0xb6ff5a, 0.3, 0.5, a.y);
          if (d < 80) g.sfx.alienLand();
        }
        grp.position.set(a.x, a.y, a.z);
        grp.rotation.set(0, a.heading, 0);
        continue;
      }

      // Se quedó atrás: el platillo lo recoge y lo suelta más cerca
      a.far = d > 80 ? a.far + dt : 0;
      if (a.far > 3) {
        this.beamUp(a);
        continue;
      }
      const afraid = scared && d < 55;
      let dir = a.heading;
      let turn = 5;
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
          else if (pAlive && d < 40 && Math.cos(toP - a.heading) > -0.25) {
            // Solo te ve si le entras por delante: por la espalda no se entera
            a.state = 'alert';
            a.t = 0.5;
            if (d < 60) g.sfx.alienSpot();
          }
          break;
        case 'alert':
          dir = toP;
          turn = 9;
          hop = Math.sin((1 - a.t / 0.5) * Math.PI) * 1.4;
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
          tilt = 0.5;
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
          } else dir = toP + Math.PI;
          turn = 10;
          speed = 19;
          tilt = 0.25;
          if (!afraid) {
            a.state = 'chase';
            a.t = 5 + Math.random() * 3;
          }
          break;
        case 'laugh':
          dir = toP;
          hop = Math.abs(Math.sin(a.t * 9)) * 0.9;
          a.t -= dt;
          if (a.t <= 0) {
            a.state = 'chase';
            a.t = 6;
          }
          break;
        default:
          break;
      }
      if (!walk(T, a, dir, speed, turn, dt)) {
        if (a.state === 'wander') a.t = 0;
        else if (a.stuck > 0.3) {
          a.stuck = 0;
          a.detour = 0.8;
          a.detourDir = a.heading + (Math.random() < 0.5 ? 1.7 : -1.7);
        }
      }

      // Animación
      const w = a.walk;
      const st = a.state;
      const sw = speed > 0 ? Math.sin(w) : 0;
      f.legL.rotation.x = sw * 0.7;
      f.legR.rotation.x = -sw * 0.7;
      if (st === 'chase') {
        // Brazos por delante, a lo zombi
        f.armL.rotation.x = -1.5 + sw * 0.2;
        f.armR.rotation.x = -1.5 - sw * 0.2;
      } else if (st === 'flee' || st === 'laugh' || st === 'alert') {
        f.armL.rotation.x = -2.7 + Math.sin(time * 18 + a.i) * 0.35;
        f.armR.rotation.x = -2.7 - Math.sin(time * 18 + a.i) * 0.35;
      } else if (st === 'tired') {
        f.armL.rotation.x = f.armR.rotation.x = 0.35;
        tilt += Math.sin(time * 7 + a.i) * 0.06;
      } else {
        f.armL.rotation.x = -sw * 0.5;
        f.armR.rotation.x = sw * 0.5;
      }
      f.head.rotation.y = st === 'wander' ? Math.sin(time * 1.3 + a.i) * 0.6 : 0;
      grp.position.set(a.x, a.y + hop, a.z);
      grp.rotation.set(tilt, a.heading, 0);

      // Contacto con el patinete
      if (!pAlive || a.cd > 0) continue;
      const dy = p.pos.y - a.y;
      if (!p.grounded && p.whipT > 0 && d < 4.2 && dy > -2 && dy < 5.5) {
        this.kick(a, p, time, p.char.alienTrick, 900);
        continue;
      }
      if (!p.grounded && p.vel.y < -3 && d < 2.6 && dy > 2 && dy < 7) {
        // Pisotón: aplastado desde arriba, y el patinete rebota
        p.vel.y = 17;
        this.pop(a, a.y, d);
        this.score(p, time, '¡Pisotón!', 700);
        g.camera3.addShake(0.25);
        continue;
      }
      if (d > 2.7 || dy < -2 || dy > 3.2) continue;
      p.velocity(_v);
      const sp = Math.hypot(_v.x, _v.z);
      const coming = _v.x * dx + _v.z * dz < 0;
      const behind = Math.cos(toP - a.heading) < 0.15;
      if (sp > 8 && coming && (behind || st === 'flee')) {
        this.kick(a, p, time, null, 500);
      } else if (st === 'chase' && p.invuln <= 0 && this.grabCd <= 0) {
        this.grab(a, p);
      } else {
        // Choque sin más: se da cuenta de que estás ahí
        p.bump(dx / d, dz / d, 0.2, 0.7);
        a.cd = 0.4;
        if (st === 'wander' || st === 'tired') {
          a.state = 'alert';
          a.t = 0.5;
          g.sfx.alienSpot();
        }
      }
    }

    // Que no se amontonen
    for (let i = 0; i < POOL; i++) {
      const a = this.aliens[i];
      if (a.state === 'off' || a.state === 'fly' || a.state === 'beamup' || a.state === 'drop') continue;
      for (let j = i + 1; j < POOL; j++) {
        const b = this.aliens[j];
        if (b.state === 'off' || b.state === 'fly' || b.state === 'beamup' || b.state === 'drop') continue;
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

    // Refuerzos
    if (this.active && W) {
      this.spawnT -= dt;
      const want = Math.min(POOL, 4 + lvl);
      if (this.spawnT <= 0 && walking < want && W.count + walking < W.goal && pAlive) {
        const a = this.aliens.find((o) => o.state === 'off');
        if (a && this.spawn(a, p)) this.spawnT = 0.9;
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
    a.state = 'fly';
    a.t = 0;
    a.vx = _v.x * (sp * 1.15 + 12);
    a.vz = _v.z * (sp * 1.15 + 12);
    a.vy = 13 + sp * 0.3;
    a.spin = 10 + Math.random() * 8;
    a.rot = 0;
    a.heading = Math.atan2(_v.x, _v.z);
    a.y += 0.6;
    if (p.grounded) p.v *= 0.92;
    g.bits.burst(a.x, a.y + 1.5, a.z, [0xfff27a, 0xffffff, SKIN], 8, 9, a.y, 0.5);
    g.camera3.addShake(turbo ? 0.5 : 0.3);
    g.sfx.culetazo(turbo);
    this.score(p, time, label || (turbo ? '¡Superculetazo!' : null), turbo && !label ? base + 300 : base);
  }

  // Revienta en ladrillos y suelta studs
  pop(a, floor, dist) {
    const g = this.game;
    g.bits.burst(a.x, floor + 1.5, a.z, [...BIT_COLORS, a.fig.colors[1]], 20, 11, floor);
    g.studs.burst(a.x, floor + 1, a.z, 4, 0, floor, 8);
    g.studs.burst(a.x, floor + 1, a.z, 1, 1, floor, 8);
    if (dist < 130) g.sfx.alienPop();
    a.state = 'off';
    a.fig.group.visible = false;
  }

  score(p, time, label, base) {
    const g = this.game;
    const W = this.wave;
    this.combo = time - this.lastKick < 5 ? Math.min(KICK_NAMES.length - 1, this.combo + 1) : 0;
    this.lastKick = time;
    const mult = 1 + this.combo;
    const pts = base * mult;
    g.hud.trick(label || KICK_NAMES[this.combo], pts, mult);
    if (this.combo >= 2) g.hud.big(KICK_NAMES[this.combo], GREEN, 0.9, true);
    g.addStuds(pts / 10);
    p.boost = Math.min(1, p.boost + 0.16);
    g.save.aliens = (g.save.aliens || 0) + 1;
    if (!W) return;
    W.count++;
    g.hud.setAliens(W.count, W.goal);
    if (W.count >= W.goal && !this.cleared) this.victory();
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
    a.state = 'laugh';
    a.t = 1.7;
    a.cd = 1.7;
    g.bits.burst(p.pos.x, p.pos.y + 2.5, p.pos.z, [0xb6ff5a, 0xfff27a, 0xffffff], 12, 9, fl, 0.45);
    g.camera3.addShake(0.5);
    g.sfx.zap();
    g.hud.big('¡Te han pillado!', '#ff6b5a', 1, true);
  }
}
