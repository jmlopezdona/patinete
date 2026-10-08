import * as THREE from 'three';
import { createMinifig } from '../lego/minifig.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { damp, clamp, lerp } from '../core/rng.js';

const SKIN = 0x7ddc1f;
const R = 30; // radio del casco
const BELLY_R = 23; // hasta dónde llega la panza: dentro de ese círculo vale el coscorrón
const BELLY = 6.6; // del centro de la nave a la panza
const REACH = 6.5; // lo que hay que subir por encima de las plataformas del half-pipe para tocarla
const HEAD = 4.4; // lo que mide el piloto: se le da con la cabeza
const HITS = 3; // coscorrones la primera noche; uno más cada vez, hasta cinco
const SHIELD = 6; // segundos de escudo después de cada coscorrón
const ARRIVE = 4.5;
const DIE = 3.4;
const NEAR = 75; // desde aquí te tiene a tiro de bomba
const BOMBS = 4;
const BOMB_R = 3.2;
const FALL = 1.5; // lo que tarda en caer una bomba: el círculo rojo avisa de dónde
const GOO_LIFE = 7; // sus charcos se secan enseguida: si no, el half-pipe acaba impracticable
const TAU = Math.PI * 2;
const GOLD = '#ffd23a';
const PINK = '#ff5ad1';
const SPARKS = [0xfff27a, 0xffffff, 0xd9dde0, 0x7dff9a];
const FIRE = [0xffd23a, 0xff7a1a, 0xffffff, 0x5c6168];
const GOO = [0x7ddc1f, 0xb6ff5a, 0x4b9f4a];
const CORE_COLD = new THREE.Color(0x7dff9a);
const CORE_WARM = new THREE.Color(0xfff27a);
const CORE_SHUT = new THREE.Color(0xff5ad1);
const CORE_DEAD = new THREE.Color(0xff7a1a);
const DOCKS = new Set(['arrive', 'hunt', 'rest', 'snatch', 'stun']); // estados en los que el platillo puede recogerse

const _v = new THREE.Vector3();

function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}

// Jefe final: la nave nodriza. Cuando ya no quedan marcianos de la oleada, baja y se planta sobre
// el half-pipe del skatepark. Su panza queda fuera del alcance de un salto normal: hay que coger
// carrerilla en la rampa y salir disparado hacia arriba para darle un coscorrón. Después de cada
// uno levanta el escudo un rato y suelta bombas de baba y refuerzos. Al último, revienta y se
// acaba la invasión.
export class Boss {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    const P = game.world.places.halfpipe;
    this.hitY = P.deck + REACH; // altura a la que el piloto toca la panza con la cabeza
    this.home = { x: P.x, z: P.z, y: this.hitY + HEAD + BELLY };
    this.minions = 0; // marcianos de refuerzo que quiere tener por el suelo
    this.blips = [];
    this.ceil = { x: P.x, z: P.z, r: R, y: 0 };
    this.m = { state: 'gone', x: P.x, y: 0, z: P.z, t: 0, hits: 0, need: HITS, shield: 0, veil: 0, cd: 0, bombT: 0, jolt: 0, fx: 0, seen: false, blip: { x: P.x, z: P.z, icon: '🛸' } };
    this.build();
    this.buildBombs();
  }

  // Está sobre el skatepark (llegando, peleando o cayéndose)
  get on() {
    const s = this.m.state;
    return s === 'arrive' || s === 'fight' || s === 'die';
  }

  get fighting() {
    return this.m.state === 'fight';
  }

  build() {
    const g = (this.group = new THREE.Group());
    const b = new Builder();
    b.sphere(R, 0, 0, 0, C.dgray, { seg: 44, seg2: 16, sy: 0.2 });
    b.cyl(R + 1.2, 1.4, 0, 0, 0, C.lgray, { seg: 48 });
    b.cyl(18, 3.2, 0, 5.6, 0, C.stone, { seg: 32, r2: 13 });
    // La panza, con la boca del núcleo en el centro
    b.cyl(BELLY_R, 3, 0, -4.4, 0, C.stone, { seg: 40, r2: BELLY_R + 4 });
    b.cyl(9.5, 0.8, 0, -6.1, 0, C.black, { seg: 28, r2: 11 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      b.sphere(3.4, Math.sin(a) * 25, -3.2, Math.cos(a) * 25, C.purple, { seg: 14, seg2: 10, sy: 0.7 });
      b.cyl(0.5, 5, Math.sin(a) * 22, 6.5, Math.cos(a) * 22, C.lgray, { seg: 8, r2: 0.15 });
    }
    g.add(b.mesh(plastic));
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(9, 28, 14, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, roughness: 0.08, metalness: 0.1 })
    );
    dome.position.y = 7.2;
    // El comandante, a los mandos bajo la cúpula
    const chief = (this.chief = createMinifig({ skin: SKIN, face: 'alien', hair: 'antenna', hairColor: C.yellow, torso: C.red, legs: C.black, print: 'star', printColor: '#f7d117' }));
    chief.group.scale.setScalar(1.9);
    chief.group.position.y = 5.4;
    g.add(chief.group, dome);
    // Luces giratorias: las del canto y, al revés, las de la panza
    const lb = new Builder();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      lb.sphere(1.3, Math.cos(a) * (R + 0.3), -1.1, Math.sin(a) * (R + 0.3), [0xfff27a, 0x7dff9a, 0xff5ad1][i % 3], { seg: 10, seg2: 8 });
    }
    const rb = new Builder();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      rb.sphere(0.9, Math.cos(a) * 17, -5.9, Math.sin(a) * 17, i % 2 ? 0x7dff9a : 0xfff27a, { seg: 8, seg2: 6 });
    }
    const lamp = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.lights = new THREE.Mesh(lb.geometry(), lamp);
    this.ring = new THREE.Mesh(rb.geometry(), lamp);
    g.add(this.lights, this.ring);
    // El núcleo: verde cuando se le puede dar, rosa con el escudo levantado
    const cg = new THREE.CircleGeometry(8.6, 36);
    cg.rotateX(Math.PI / 2);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a, fog: false });
    const core = new THREE.Mesh(cg, this.coreMat);
    core.position.y = -6.55;
    g.add(core);
    // El escudo: un casquete de luz por debajo de la panza
    const vg = new THREE.SphereGeometry(90, 40, 6, 0, TAU, Math.PI - 0.275, 0.275);
    this.veilMat = glowMaterial(0xff5ad1, 0);
    this.veilMat.side = THREE.DoubleSide;
    this.veil = new THREE.Mesh(vg, this.veilMat);
    this.veil.position.y = 82.6;
    this.veil.visible = false;
    g.add(this.veil);
    this.light = new THREE.PointLight(0x7dff9a, 0, 110, 1);
    this.light.position.y = -11;
    g.add(this.light);
    g.visible = false;
    this.game.scene.add(g);
  }

  // Bombas de baba, cada una con el círculo que avisa de dónde va a caer
  buildBombs() {
    const scene = this.game.scene;
    const geo = new THREE.SphereGeometry(1.25, 12, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6fe01a, roughness: 0.16, emissive: 0x2c7d08, emissiveIntensity: 1.2 });
    const rg = new THREE.RingGeometry(BOMB_R * 0.72, BOMB_R, 32);
    rg.rotateX(-Math.PI / 2);
    this.bombs = [];
    for (let i = 0; i < BOMBS; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const ringMat = glowMaterial(0xff4a4a, 0);
      ringMat.polygonOffset = true;
      ringMat.polygonOffsetFactor = ringMat.polygonOffsetUnits = -2;
      const ring = new THREE.Mesh(rg, ringMat);
      ring.renderOrder = 2;
      mesh.visible = ring.visible = false;
      scene.add(mesh, ring);
      this.bombs.push({ mesh, ring, ringMat, t: -1, x: 0, z: 0, gy: 0, x0: 0, y0: 0, z0: 0 });
    }
  }

  // ---------- Llegar y marcharse ----------
  arrive() {
    const g = this.game;
    const m = this.m;
    m.state = 'arrive';
    m.t = 0;
    m.hits = 0;
    m.need = Math.min(5, HITS + g.aliens.wave.level);
    m.shield = m.veil = m.cd = m.jolt = m.fx = 0;
    m.bombT = 3;
    m.seen = false;
    m.y = this.home.y + 150;
    this.minions = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
    g.hud.big('¡La nave nodriza!', PINK, 2.4);
    g.hud.setBoss(0, m.need, false);
    g.sfx.mothership();
    g.hud.toast('🛸 Ya no quedan marcianos de a pie… ¡y por eso baja la <b>nave nodriza</b>! Se planta sobre el <b>skatepark</b>: búscala en el minimapa.');
  }

  // Se va sin pelear (amanece, empieza un minijuego...)
  leave() {
    const m = this.m;
    m.state = 'leave';
    m.t = 0;
    m.shield = 0;
    this.minions = 0;
    this.game.hud.setBoss(null);
  }

  hide() {
    const g = this.game;
    this.m.state = 'gone';
    this.minions = 0;
    this.group.visible = false;
    this.light.intensity = 0;
    for (const b of this.bombs) {
      b.t = -1;
      b.mesh.visible = b.ring.visible = false;
    }
    g.camera3.ceil = null;
    g.hud.setBoss(null);
    if (g.aliens.u.state === 'gone') g.sfx.ufo(0, false);
  }

  // ---------- Bucle ----------
  update(dt, p, time) {
    const g = this.game;
    const A = g.aliens;
    const m = this.m;
    this.blips.length = 0;
    // Le toca cuando la oleada ya está echada y todavía no se ha dado por rechazada
    const due = A.active && !!A.wave && !A.cleared && A.wave.count >= A.wave.goal;
    if (m.state === 'gone') {
      if (!due) return;
      this.arrive();
    } else if (!due && m.state !== 'leave') this.leave();
    m.t += dt;
    const d = Math.hypot(p.pos.x - m.x, p.pos.z - m.z);
    // Con la nodriza encima el platillo no pinta nada: se recoge en cuanto puede
    if (m.state !== 'leave' && DOCKS.has(A.u.state)) A.dock();
    switch (m.state) {
      case 'arrive': {
        const k = Math.min(1, m.t / ARRIVE);
        m.y = this.home.y + 150 * (1 - k) ** 3;
        if (k >= 1) {
          m.state = 'fight';
          m.t = 0;
          m.jolt = 1;
          if (d < 160) g.camera3.addShake(0.7);
        }
        break;
      }
      case 'fight':
        this.fight(dt, p, d);
        break;
      case 'die':
        m.y += dt * 2.2;
        m.fx -= dt;
        if (m.fx <= 0) {
          // Petardazos por todo el casco
          m.fx = 0.14;
          const a = Math.random() * TAU;
          const r = Math.random() * R;
          g.bits.burst(m.x + Math.sin(a) * r, m.y - 3, m.z + Math.cos(a) * r, FIRE, 9, 13, this.T.height(m.x + Math.sin(a) * r, m.z + Math.cos(a) * r), 0.6);
        }
        if (m.t >= DIE) {
          this.boom(p, d);
          return;
        }
        break;
      default:
        m.y += (12 + m.t * 60) * dt;
        if (m.t > 3.2) {
          this.hide();
          return;
        }
        break;
    }
    this.updateBombs(dt, p, time);
    this.show(dt, p, time, d);
    this.blips.push(m.blip);
  }

  fight(dt, p, d) {
    const g = this.game;
    const m = this.m;
    const free = p.crashT <= 0 && !p.held;
    m.cd -= dt;
    if (m.shield > 0) {
      m.shield -= dt;
      if (m.shield <= 0) this.lower(d < NEAR);
    }
    if (!m.seen && d < NEAR) {
      m.seen = true;
      g.hud.toast(`🛹 Coge carrerilla en el <b>half-pipe</b> con el <b>turbo</b> y sal disparado hacia arriba: <b>${m.need} coscorrones</b> en la panza y la nodriza cae. Con <b>gravedad lunar</b> se llega de un salto desde lo alto de la rampa.`);
    }
    // Bombas de baba: llueven con el escudo levantado; sin él cae alguna suelta
    m.bombT -= dt;
    if (m.bombT <= 0 && d < NEAR && free) {
      this.bomb(p, d);
      m.bombT = m.shield > 0 ? 1.2 : Math.max(2.6, 4.6 - m.hits * 0.5);
    }
    // La panza hace de techo: quien llega hasta ella saltando le da con la cabeza
    if (p.grounded || !free || d > BELLY_R || p.pos.y < this.hitY || p.pos.y > this.hitY + 3) return;
    p.pos.y = this.hitY;
    if (p.vel.y > -6) p.vel.y = -6;
    if (m.cd > 0) return;
    m.cd = 0.9;
    if (m.shield > 0) this.clang(p);
    else this.hit(p);
  }

  hit(p) {
    const g = this.game;
    const m = this.m;
    const fl = this.T.height(p.pos.x, p.pos.z);
    m.hits++;
    m.jolt = 1;
    g.bits.burst(p.pos.x, p.pos.y + HEAD, p.pos.z, SPARKS, 22, 14, fl, 0.5);
    g.studs.burst(p.pos.x, p.pos.y + HEAD - 1.5, p.pos.z, 6, 1, fl, 10);
    g.camera3.addShake(0.7);
    g.sfx.bossHit();
    g.hud.trick('¡Coscorrón a la nodriza!', 2000 * m.hits, 1);
    g.addStuds(200 * m.hits);
    p.boost = 1;
    if (m.hits >= m.need) {
      this.down();
      return;
    }
    g.hud.big(m.hits === m.need - 1 ? '¡Uno más y cae!' : '¡En toda la panza!', GOLD, 1.2, true);
    // Del susto levanta el escudo, y mientras dura llueven bombas y bajan refuerzos
    m.shield = Math.min(8, SHIELD + g.aliens.wave.level * 0.5);
    m.bombT = 1.2;
    this.minions = Math.min(4, 1 + m.hits);
    g.sfx.shield(true);
    g.hud.setBoss(m.hits, m.need, true);
    if (m.hits === 1) g.hud.toast('🛡️ La nodriza levanta el <b>escudo</b> y suelta <b>bombas de baba</b> y refuerzos. Esquiva los círculos rojos y espera a que se apague… o rómpeselo de un <b>timbrazo</b>.');
  }

  // Con el escudo levantado no hay nada que hacer: se rebota y ya
  clang(p) {
    const g = this.game;
    g.bits.burst(p.pos.x, p.pos.y + HEAD, p.pos.z, [0xff5ad1, 0xffffff], 10, 9, this.T.height(p.pos.x, p.pos.z), 0.4);
    g.camera3.addShake(0.3);
    g.sfx.shieldClang();
    g.hud.big('¡Escudo!', PINK, 0.8, true);
  }

  lower(tell) {
    const g = this.game;
    const m = this.m;
    m.shield = 0;
    g.hud.setBoss(m.hits, m.need, false);
    if (!tell) return;
    g.sfx.shield(false);
    g.hud.big('¡Sin escudo!', GOLD, 1, true);
  }

  // Timbre sónico: si suena cerca, el escudo se viene abajo
  sonic(x, z, r) {
    const m = this.m;
    if (m.state !== 'fight' || m.shield <= 0 || Math.hypot(m.x - x, m.z - z) > r + BELLY_R) return false;
    this.lower(true);
    return true;
  }

  // Tocada del todo: se tambalea, petardea y a los pocos segundos revienta
  down() {
    const g = this.game;
    const m = this.m;
    m.state = 'die';
    m.t = m.fx = m.shield = 0;
    this.minions = 0;
    g.aliens.rout();
    g.hud.setBoss(m.need, m.need, false);
    g.hud.big('¡Nodriza derribada!', GOLD, 2.4);
    g.sfx.bossDown();
  }

  boom(p, d) {
    const g = this.game;
    const A = g.aliens;
    const m = this.m;
    const reward = 4000 + A.wave.level * 1500;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * TAU;
      const r = i < 6 ? R * 0.6 : 0;
      const x = m.x + Math.sin(a) * r;
      const z = m.z + Math.cos(a) * r;
      const fl = this.T.height(x, z);
      g.bits.burst(x, m.y, z, i % 2 ? FIRE : [C.dgray, C.lgray, C.stone, C.purple, 0xfff27a], 26, 22, fl, 1.1);
      g.studs.burst(x, m.y - 4, z, 5, i % 3 === 0 ? 2 : 1, fl, 16);
    }
    // El comandante sale por los aires, como cualquier otro
    A.eject(m.x, m.y + 6, m.z);
    if (d < 260) g.camera3.addShake(1.1);
    g.sfx.bossBoom();
    this.hide();
    g.save.motherships = (g.save.motherships || 0) + 1;
    g.addStuds(reward);
    g.hud.toast(`🛸 ¡Has derribado la <b>nave nodriza</b>! Premio extra: <b>${reward.toLocaleString('es-ES')}</b> studs.`);
    A.victory();
  }

  // ---------- Bombas de baba ----------
  bomb(p, d) {
    const b = this.bombs.find((o) => o.t < 0);
    if (!b) return;
    const m = this.m;
    // Apunta un poco por delante de ti, con algo de mala puntería
    p.velocity(_v);
    const lead = Math.min(0.35, 9 / (Math.hypot(_v.x, _v.z) || 1));
    const a = Math.random() * TAU;
    const r = Math.random() * 4.5;
    const x = p.pos.x + _v.x * lead + Math.sin(a) * r;
    const z = p.pos.z + _v.z * lead + Math.cos(a) * r;
    const gy = this.T.height(x, z);
    if (gy > this.hitY - 3) return; // un tejado: ahí no llega
    const ox = x - m.x;
    const oz = z - m.z;
    const k = Math.min(1, 20 / (Math.hypot(ox, oz) || 1));
    b.x = x;
    b.z = z;
    b.gy = gy;
    b.x0 = m.x + ox * k;
    b.z0 = m.z + oz * k;
    b.y0 = m.y - BELLY;
    b.t = 0;
    b.mesh.visible = b.ring.visible = true;
    this.game.sfx.bomb(d < 40 ? 1 : 0.5);
  }

  updateBombs(dt, p, time) {
    for (const b of this.bombs) {
      if (b.t < 0) continue;
      b.t += dt;
      const k = b.t / FALL;
      if (k >= 1) {
        this.splash(b, p);
        continue;
      }
      const s = 1 + Math.sin(time * 22 + b.x) * 0.14;
      b.mesh.position.set(lerp(b.x0, b.x, k), lerp(b.y0, b.gy + 1, k * k), lerp(b.z0, b.z, k));
      b.mesh.scale.set(s, 2 - s, s);
      b.ring.position.set(b.x, b.gy + 0.18, b.z);
      b.ring.scale.setScalar(1.5 - 0.5 * k);
      b.ringMat.opacity = 0.25 + 0.5 * k + Math.sin(time * 26) * 0.1;
    }
  }

  splash(b, p) {
    const g = this.game;
    b.t = -1;
    b.mesh.visible = b.ring.visible = false;
    g.bits.burst(b.x, b.gy + 0.6, b.z, GOO, 16, 10, b.gy, 0.45);
    const goo = g.slime.splat(b.x, b.z, 2.4);
    if (goo) goo.t = Math.min(goo.t, GOO_LIFE);
    const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
    if (d < 90) g.sfx.squelch(d < 30 ? 1 : 0.5);
    if (d > BOMB_R || p.crashT > 0 || p.held || p.invuln > 0 || Math.abs(p.pos.y - b.gy) > 3.5) return;
    // Bombazo: pringado de arriba abajo, frenazo y unos cuantos studs por los suelos
    const lost = Math.min(100, Math.floor(g.save.studs / 10) * 10);
    if (lost > 0) {
      g.save.studs -= lost;
      g.hud.setStuds(g.save.studs);
      g.dirty = true;
      g.studs.burst(p.pos.x, p.pos.y + 2, p.pos.z, Math.min(6, lost / 10), 0, b.gy, 15);
    }
    if (p.grounded) p.v *= 0.3;
    else {
      p.vel.x *= 0.4;
      p.vel.z *= 0.4;
    }
    p.invuln = 1.8;
    g.camera3.addShake(0.5);
    g.sfx.zap();
    g.hud.big('¡Bombazo de baba!', '#ff6b5a', 1, true);
  }

  // ---------- Aspecto ----------
  show(dt, p, time, d) {
    const g = this.game;
    const m = this.m;
    const grp = this.group;
    const dying = m.state === 'die';
    const shut = m.shield > 0;
    m.jolt = damp(m.jolt, 0, 3, dt);
    const wob = dying ? 0.1 + m.t * 0.05 : m.jolt * 0.07;
    grp.position.set(m.x, m.y + Math.sin(time * 1.1) * 0.5, m.z);
    grp.rotation.x = Math.sin(time * (dying ? 9 : 14)) * wob;
    grp.rotation.z = Math.cos(time * (dying ? 7.3 : 11)) * wob;
    this.lights.rotation.y += dt * (dying ? 7 : shut ? 3 : 0.9);
    this.ring.rotation.y -= dt * (dying ? 9 : shut ? 4 : 1.2);
    m.veil = damp(m.veil, shut ? 1 : 0, 6, dt);
    this.veil.visible = m.veil > 0.02;
    this.veilMat.opacity = m.veil * (0.09 + Math.sin(time * 8) * 0.025);
    // El núcleo late en verde cuando se le puede dar
    const core = this.coreMat.color;
    if (dying) core.lerpColors(CORE_DEAD, CORE_WARM, Math.random());
    else if (shut) core.copy(CORE_SHUT);
    else core.lerpColors(CORE_COLD, CORE_WARM, 0.5 + Math.sin(time * 5) * 0.5);
    this.light.color.copy(core);
    this.light.intensity = (dying ? 8 + Math.random() * 16 : 11) * clamp(1 - (m.y - this.home.y) / 60, 0, 1);
    // El comandante no te quita ojo: a los mandos, o agitando los puños si le has dado
    const f = this.chief;
    const angry = shut || dying;
    const s = Math.sin(time * (dying ? 22 : 15));
    f.group.rotation.y = Math.atan2(p.pos.x - m.x, p.pos.z - m.z);
    f.armL.rotation.x = angry ? -2.7 + s * 0.35 : -1.2;
    f.armR.rotation.x = angry ? -2.7 - s * 0.35 : -1.2;
    // La cámara, por debajo de la panza: que no se cuele dentro del casco
    this.ceil.y = m.y - BELLY - 1.2;
    g.camera3.ceil = this.ceil;
    // Mientras el platillo siga por ahí el zumbido es el suyo
    if (g.aliens.u.state === 'gone') g.sfx.ufo(clamp(1 - Math.hypot(d, m.y - p.pos.y) / 220, 0, 1) * 1.3, angry);
  }
}
