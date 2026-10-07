import * as THREE from 'three';
import { createMinifig, nameTag } from '../lego/minifig.js';
import { createScooter, DECK_Y, BAR_Y, WHEEL_R } from '../lego/scooter.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { BOUNDS } from '../world/cobena.js';
import { angDiff, damp, clamp } from '../core/rng.js';
import { walk } from './walker.js';

const TAU = Math.PI * 2;
const STARS = [5, 9, 13, 17, 21]; // destrozos acumulados que cuesta cada estrella
const COOL = 0.1; // sin estrellas, los destrozos se van olvidando (por segundo)
const LOSE = 70; // más lejos que esto, te han perdido de vista
const COP_SPEED = [0, 0.56, 0.66, 0.88, 0.97, 0.97]; // del municipal, respecto a la punta del jugador
const COP_CUTS = [0, 0, 0, 1, 2, 3]; // veces que puede atajar por otra calle
const GRANNY_SPEED = 1.04;
const SLIP_SPEED = 1.45;
const SLIP_TURN = 2.4; // lo que corrige el rumbo la zapatilla (rad/s)
const SLIP_H = 2.3; // altura a la que vuela
const OVER = 1.5; // con las ruedas más altas que esto, les pasas por encima
const CRUMBS = 64; // migas del rastro que se recuerdan
const CRUMB = 5; // una miga cada tantas unidades
const NAVY = 0x1a2a52;
const BLUE = '#5aa2ff';
const PINK = '#ff8ad1';

const _v = new THREE.Vector3();

// Nivel de búsqueda: romper mobiliario (o atropellar vecinos) calienta el ambiente. Con la primera
// estrella sale el policía municipal a ponerte una multa; con la tercera saca su patinete oficial
// y con la quinta llega la abuela con la zapatilla. Se quita dándoles esquinazo... o pagando.
export class Wanted {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.heat = 0;
    this.stars = 0;
    this.lost = 0; // segundos que llevan sin verte
    this.spawnT = 0;
    this.blips = [];
    // El rastro del patinete: si te pierden de vista, van por donde has pasado tú
    this.trail = [];
    this.trailN = 0;
    this.cop = this.makeCop();
    this.granny = this.makeGranny();
    this.chasers = [this.cop, this.granny];

    // La zapatilla voladora
    const mesh = slipper();
    mesh.scale.setScalar(1.5);
    mesh.visible = false;
    game.scene.add(mesh);
    this.slip = { mesh, state: 'hand', x: 0, y: 0, z: 0, base: 0, h: 0, dir: 0, v: 0, t: 0, passed: false, fx: 0 };

    // Hueco libre delante de la Policía Local, para los que acaban en el cuartelillo
    const P = game.world.places.police;
    this.station = null;
    for (let i = 0; P && !this.station && i < 24; i++) {
      const r = 2 + Math.floor(i / 8) * 4;
      const a = P.heading + (i % 8) * (TAU / 8);
      const x = P.x + (i ? Math.sin(a) * r : 0);
      const z = P.z + (i ? Math.cos(a) * r : 0);
      const h = this.T.height(x, z);
      if (h < 0.6 && h > -0.5) this.station = { x, z, heading: P.heading };
    }
  }

  chaser(fig, name, color, icon) {
    const root = new THREE.Group();
    root.add(fig.group);
    root.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    root.visible = false;
    const tag = nameTag(name, color);
    tag.visible = false;
    this.game.scene.add(root, tag);
    return {
      root, fig, tag, state: 'off', t: 0, wait: 0, rest: 0, pop: 0, x: 0, y: 0, z: 0, d: 0, heading: 0, walk: 0, kick: 0, stuck: 0, detour: 0, detourDir: 0,
      far: 0, cuts: 0, sfxT: 0, riding: false, throwCd: 0, swing: 0, see: false, seeT: 0, crumb: 0, hopCd: 0, blip: { x: 0, z: 0, icon },
    };
  }

  makeCop() {
    const fig = createMinifig({ torso: NAVY, arms: NAVY, legs: NAVY, hair: 'cap', hairColor: NAVY, face: 'cool', print: 'police', printColor: '#e8f24a' });
    const c = this.chaser(fig, 'Municipal', BLUE, '👮');
    // Su patinete oficial, con rotativo azul en el manillar
    const sc = (c.scooter = createScooter(C.blue));
    c.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2f7dff, fog: false }));
    c.beacon.position.set(0, BAR_Y + 0.5, 0);
    sc.steer.add(c.beacon);
    sc.group.traverse((m) => {
      if (m.isMesh && m !== c.beacon) m.castShadow = true;
    });
    sc.group.visible = false;
    c.root.add(sc.group);
    return c;
  }

  makeGranny() {
    const BATA = C.lavender;
    const fig = createMinifig({ torso: BATA, arms: BATA, legs: BATA, hips: BATA, hair: 'bun', hairColor: 0xe4e6ea, face: 'abuela', print: 'buttons', printColor: '#ffffff' });
    const c = this.chaser(fig, 'La abuela', PINK, '👵');
    // La zapatilla, en alto y lista
    this.hand = slipper();
    this.hand.position.set(-0.2, -2.4, 0);
    this.hand.rotation.set(Math.PI / 2, 0, Math.PI);
    fig.armR.add(this.hand);
    return c;
  }

  // ---------- Estrellas ----------
  // Cada destrozo suma; romper algo con el municipal buscándote le dice por dónde andas
  add(n = 1) {
    const g = this.game;
    if (g.missions.active) return;
    this.heat += n;
    if (this.stars) this.lost = 0;
    let s = 0;
    while (s < STARS.length && this.heat >= STARS[s]) s++;
    if (s > this.stars) this.raise(s);
  }

  raise(s) {
    const g = this.game;
    const first = !this.stars;
    this.stars = s;
    this.lost = 0;
    this.cop.cuts = Math.max(this.cop.cuts, COP_CUTS[s]);
    if (first) this.spawnT = 1.2;
    g.sfx.wanted(s);
    if (s === 5) {
      this.spawnT = 1;
      g.hud.big('¡La abuela!', PINK, 2);
      g.sfx.granny();
      g.hud.toast('👵 ¡Cinco estrellas! Han avisado a <b>tu abuela</b>, que viene con la zapatilla. Cuando la lance, <b>salta</b> o haz un quiebro.');
    } else if (s === 4) {
      g.hud.toast('🚨 Cuatro estrellas. Rompe algo más… y llaman a <b>tu abuela</b>.');
    } else if (s === 3) {
      g.hud.big('¡Patinete oficial!', BLUE, 1.2, true);
      g.hud.toast(`🚨 Tres estrellas: el municipal saca su <b>patinete oficial</b> y ya corre casi tanto como tú.${this.station ? ' Si te pilla, acabas en la Policía Local.' : ''}`);
    } else if (s === 2) {
      g.hud.toast('👮 Dos estrellas: el municipal aprieta el paso y la multa engorda.');
    }
    if (first) {
      g.hud.big('¡Alto ahí!', BLUE, 1.4);
      g.hud.toast('👮 Tanto destrozo ha hecho salir al <b>policía municipal</b>. Dale esquinazo o <b>sáltalo</b>: si te toca, multa.');
    }
  }

  // Se acabó la persecución. Por las buenas se van andando; por las malas desaparecen sin más
  reset(hard = false) {
    this.heat = 0;
    this.stars = 0;
    this.lost = 0;
    for (const c of this.chasers) {
      if (c.state === 'off') continue;
      if (hard) this.off(c);
      else if (c.state !== 'gloat' && c.state !== 'leave') this.setState(c, 'leave');
    }
    const s = this.slip;
    if (s.state !== 'hand') {
      if (hard) {
        s.state = 'hand';
        s.mesh.visible = false;
      } else s.state = 'back';
    }
    this.hud(Infinity);
  }

  hud(near) {
    const h = this.game.hud;
    h.setWanted(this.stars, this.lost > 0.6);
    h.cop(this.stars ? clamp(1 - (near - 8) / 26, 0, 1) : 0);
  }

  escaped() {
    const g = this.game;
    const s = this.stars;
    const prize = 100 * s * s;
    g.addStuds(prize);
    g.hud.big('¡Esquinazo!', '#4dff88', 1.4);
    g.sfx.escape();
    g.hud.toast(`💨 ${s >= 5 ? 'Les has dado esquinazo al municipal y a la abuela' : 'Le has dado esquinazo al municipal'}. Premio: <b>${prize.toLocaleString('es-ES')}</b> studs… y a portarse bien.`);
    this.reset();
  }

  take(n) {
    const g = this.game;
    const lost = Math.min(n, Math.floor(g.save.studs / 10) * 10);
    if (lost > 0) {
      g.save.studs -= lost;
      g.hud.setStuds(g.save.studs);
      g.dirty = true;
    }
    return lost;
  }

  // Te ha pillado el municipal: multa, y los más buscados acaban en la Policía Local
  fine(c, p) {
    const g = this.game;
    const s = this.stars;
    const lost = this.take(200 * s);
    const jail = s >= 3 && this.station;
    const paid = lost ? `Multa de <b>${lost.toLocaleString('es-ES')}</b> studs por destrozar el mobiliario` : 'No llevas ni un stud, así que te libras con una bronca';
    if (p.grounded) p.v = 0;
    else p.vel.x = p.vel.z = 0;
    p.boosting = false;
    p.invuln = 2.5;
    g.combo = 0;
    g.camera3.addShake(0.4);
    g.sfx.fine();
    g.hud.big('¡Multa!', '#ff6b5a', 1.4);
    if (jail) {
      p.place(this.station.x, this.station.z, this.station.heading);
      g.camera3.snap = true;
      g.hud.toast(`🚓 ${paid}… y derechito a la <b>Policía Local</b>.`);
      this.reset(true);
    } else {
      g.hud.toast(`👮 ${paid}. ¡Y que no se repita!`);
      this.setState(c, 'gloat');
      this.reset();
    }
  }

  // Zapatillazo: castañazo, paga requisada y castigado a casa
  slap(p) {
    const g = this.game;
    const G = this.granny;
    const lost = this.take(500);
    const sp = g.home.spawn;
    g.bits.burst(p.pos.x, p.pos.y + 2.5, p.pos.z, [0xff8ad1, 0xffffff, C.darkRed], 10, 9, this.T.height(p.pos.x, p.pos.z), 0.5);
    p.crash();
    p.respawnAt = { x: sp.x, z: sp.z, heading: sp.heading };
    g.sfx.slap();
    g.hud.big('¡Zapatillazo!', PINK, 1.6);
    g.hud.toast(`👵 La abuela te manda <b>${g.home.drop || g.home.roam || g.home.spot ? `de vuelta a ${g.home.name}` : 'castigado a casa'}</b>${lost ? ` y te requisa <b>${lost.toLocaleString('es-ES')}</b> studs de la paga` : ''}.`);
    if (G.state !== 'off') this.setState(G, 'gloat');
    this.reset();
  }

  // ---------- Perseguidores ----------
  setState(c, state) {
    c.state = state;
    c.t = 0;
  }

  // Sin fuelle (o burlado): se queda un rato resoplando
  tire(c, secs) {
    this.setState(c, 'tired');
    c.rest = secs;
  }

  enter(c, wait) {
    this.setState(c, 'enter');
    c.wait = wait;
    c.stuck = c.detour = c.far = c.seeT = 0;
    c.see = false;
    c.crumb = this.trailN;
    c.root.visible = c.tag.visible = true;
  }

  // ¿Hay camino recto y despejado hasta ese punto?
  sees(c, x, z) {
    const T = this.T;
    const dx = x - c.x;
    const dz = z - c.z;
    const n = Math.ceil(Math.hypot(dx, dz) / 1.5);
    if (n > 60) return false;
    let prev = c.y;
    for (let i = 1; i < n; i++) {
      const h = T.height(c.x + (dx * i) / n, c.z + (dz * i) / n);
      if (h - prev > 1.1 || h < -0.8) return false;
      prev = h;
    }
    return true;
  }

  // Hacia dónde correr: derecho al patinete si lo ve; si no, siguiendo su rastro miga a miga
  aim(c, p, dx, dz, d, dt, lead) {
    c.seeT -= dt;
    if (c.seeT <= 0) {
      c.seeT = 0.25;
      const see = this.sees(c, p.pos.x, p.pos.z);
      if (c.see && !see) c.crumb = this.trailN - 1; // la última vez que lo vio estaba ahí
      c.see = see;
    }
    if (!c.see) {
      c.crumb = Math.max(c.crumb, this.trailN - CRUMBS);
      while (c.crumb < this.trailN) {
        const m = this.trail[c.crumb % CRUMBS];
        if (Math.hypot(m.x - c.x, m.z - c.z) > 3.5) return Math.atan2(m.x - c.x, m.z - c.z);
        c.crumb++;
      }
    }
    if (!lead) return Math.atan2(dx, dz);
    // Los rápidos apuntan a donde vas a estar
    p.velocity(_v);
    const k = clamp(d / 70, 0, 0.6);
    return Math.atan2(dx + _v.x * k, dz + _v.z * k);
  }

  off(c) {
    c.state = 'off';
    c.root.visible = c.tag.visible = false;
    if (c.riding) {
      c.riding = false;
      c.scooter.group.visible = false;
    }
  }

  // Busca suelo libre cerca del patinete: por detrás para darle ventaja o por delante para cortarle el paso
  place(c, p, ahead) {
    const T = this.T;
    p.velocity(_v);
    const base = (Math.hypot(_v.x, _v.z) > 4 ? Math.atan2(_v.x, _v.z) : p.heading) + (ahead ? 0 : Math.PI);
    for (let k = 0; k < 18; k++) {
      const any = k >= 12;
      const ang = any ? Math.random() * TAU : base + (Math.random() - 0.5) * (ahead ? 1.4 : 2.4);
      const r = ahead || any ? 56 + Math.random() * 10 : 38 + Math.random() * 16;
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const x = p.pos.x + sx * r;
      const z = p.pos.z + sz * r;
      if (x < BOUNDS.x0 + 10 || x > BOUNDS.x1 - 10 || z < BOUNDS.z0 + 10 || z > BOUNDS.z1 - 10) continue;
      const h = T.height(x, z);
      if (h > 0.8 || h < -0.5) continue;
      // Con paso franco hacia el patinete: nada de aparecer encerrado en un jardín
      let prev = h;
      let ok = true;
      for (let i = 1; i <= 6 && ok; i++) {
        const hh = T.height(x - sx * i * 2.5, z - sz * i * 2.5);
        ok = hh - prev <= 1.1 && hh > -0.8;
        prev = hh;
      }
      if (!ok) continue;
      c.x = x;
      c.z = z;
      c.y = h;
      c.heading = ang + Math.PI;
      return true;
    }
    return false;
  }

  // El municipal se sube al patinete oficial
  mount(c) {
    c.riding = true;
    c.scooter.group.visible = true;
    c.sfxT = 0;
    this.game.bits.burst(c.x, c.y + 1.5, c.z, [0x2f7dff, 0xffffff, NAVY], 10, 8, c.y, 0.5);
  }

  update(dt, p, time) {
    const g = this.game;
    // Durante los minijuegos hay tregua
    if (g.missions.active) {
      if (this.stars || this.heat || this.chasers.some((c) => c.state !== 'off')) this.reset(true);
      return;
    }
    if (!this.stars) this.heat = Math.max(0, this.heat - COOL * dt);
    const pAlive = p.crashT <= 0 && !p.held;
    const cop = this.cop;
    if (this.stars) {
      const last = this.trailN ? this.trail[(this.trailN - 1) % CRUMBS] : null;
      if (!last || Math.hypot(p.pos.x - last.x, p.pos.z - last.z) > CRUMB) {
        const m = (this.trail[this.trailN % CRUMBS] ||= { x: 0, z: 0 });
        m.x = p.pos.x;
        m.z = p.pos.z;
        this.trailN++;
      }
    }

    // Quién tiene que estar en la calle
    this.spawnT -= dt;
    let missing = false;
    for (const c of this.chasers) {
      if (this.stars < (c === cop ? 1 : 5)) continue;
      if (c.state === 'leave' || c.state === 'gloat') this.enter(c, 0.6);
      else if (c.state === 'off') {
        missing = true;
        // El municipal te sale al paso dando el alto; la abuela llega pisándote los talones
        if (this.spawnT > 0 || !pAlive || !this.place(c, p, c === cop)) continue;
        c.pop = 0;
        c.cuts = c === cop ? COP_CUTS[this.stars] : 2;
        c.throwCd = 1.5;
        this.enter(c, c === cop ? 0.9 : 0.5);
        if (c === cop) g.sfx.whistle();
      }
    }
    if (cop.state !== 'off' && this.stars >= 3 && !cop.riding) this.mount(cop);

    let near = Infinity;
    for (const c of this.chasers) {
      if (c.state === 'off') continue;
      this.updateChaser(c, dt, p, time, pAlive);
      if (c.state === 'chase' || c.state === 'tired' || c.state === 'enter' || c.state === 'windup') near = Math.min(near, c.d);
    }
    this.updateSlipper(dt, p, pAlive);

    // Que no corran uno encima del otro
    const G = this.granny;
    if (cop.state !== 'off' && G.state !== 'off') {
      const ex = G.x - cop.x;
      const ez = G.z - cop.z;
      const e = Math.hypot(ex, ez);
      if (e < 2.6 && e > 0.001) {
        const k = ((2.6 - e) * 0.5) / e;
        if (this.T.height(cop.x - ex * k, cop.z - ez * k) - cop.y < 1) {
          cop.x -= ex * k;
          cop.z -= ez * k;
        }
        if (this.T.height(G.x + ex * k, G.z + ez * k) - G.y < 1) {
          G.x += ex * k;
          G.z += ez * k;
        }
      }
    }

    // Esquinazo: un rato sin que te vean y se dan por vencidos
    if (this.stars) {
      this.lost = near > LOSE && pAlive && !missing ? this.lost + dt : 0;
      if (this.lost >= 5 + this.stars) this.escaped();
    }
    this.hud(near);

    this.blips.length = 0;
    for (const c of this.chasers) {
      if (c.state === 'off') continue;
      c.blip.x = c.x;
      c.blip.z = c.z;
      this.blips.push(c.blip);
    }
  }

  updateChaser(c, dt, p, time, pAlive) {
    const g = this.game;
    const isCop = c === this.cop;
    const dx = p.pos.x - c.x;
    const dz = p.pos.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    const toP = Math.atan2(dx, dz);
    c.d = d;
    c.t += dt;
    c.sfxT -= dt;
    c.throwCd -= dt;
    c.swing -= dt;
    c.hopCd -= dt;
    let dir = toP;
    let speed = 0;
    const turn = c.riding ? 3.2 : 7; // en patinete no se gira en una baldosa

    switch (c.state) {
      case 'enter':
        // Aparece dando el alto
        c.pop = Math.min(1, c.pop + dt / 0.3);
        if (c.t > c.wait) this.setState(c, 'chase');
        break;
      case 'chase': {
        if (c.detour > 0) {
          c.detour -= dt;
          dir = c.detourDir;
        } else dir = this.aim(c, p, dx, dz, d, dt, c.riding || !isCop);
        speed = pAlive ? p.stats.vmax * (isCop ? COP_SPEED[Math.max(1, this.stars)] : GRANNY_SPEED) : 0;
        if (isCop) {
          // A pie se queda sin fuelle; en patinete, no
          if (!c.riding && c.t > (this.stars > 1 ? 11 : 8)) this.tire(c, this.stars > 1 ? 1.6 : 2.2);
          if (c.sfxT <= 0 && d < 95) {
            const vol = clamp(1.15 - d / 95, 0, 1);
            if (c.riding) {
              c.sfxT = 0.6;
              g.sfx.siren(vol);
            } else {
              c.sfxT = 2.4 + Math.random() * 1.4;
              g.sfx.whistle(vol);
            }
          }
        } else if (c.t > 7) this.tire(c, 2.6);
        else if (this.slip.state === 'hand' && c.throwCd <= 0 && pAlive && p.invuln <= 0 && d > 9 && d < 44 && Math.abs(angDiff(c.heading, toP)) < 0.5) {
          this.setState(c, 'windup');
          g.hud.big('¡Zapatilla va!', PINK, 0.7, true);
          g.sfx.slipper();
        }
        break;
      }
      case 'windup':
        // Coge impulso un instante antes de lanzarla: es el aviso para esquivar
        speed = pAlive ? p.stats.vmax * 0.35 : 0;
        if (!pAlive) this.setState(c, 'chase');
        else if (c.t > 0.45) {
          this.throwSlipper(c, p);
          this.setState(c, 'chase');
          c.swing = 0.3;
        }
        break;
      case 'tired':
        if (c.t > c.rest) this.setState(c, 'chase');
        break;
      case 'gloat':
        // Rellenando la multa, o riñendo zapatilla en mano
        if (c.t > 2.4) this.setState(c, 'leave');
        break;
      case 'leave':
        dir = toP + Math.PI;
        speed = c.riding ? 15 : 7;
        if (c.t > 1.6) {
          c.pop -= dt / 0.35;
          if (c.pop <= 0) {
            this.off(c);
            return;
          }
        }
        break;
      default:
        break;
    }

    // Te ha perdido: si le quedan atajos, sale por otra calle cortándote el paso
    if (c.state === 'chase' || c.state === 'tired') {
      c.far = d > LOSE ? c.far + dt : 0;
      if (c.far > 2.5 && c.cuts > 0 && pAlive && this.place(c, p, true)) {
        c.cuts--;
        c.pop = 0;
        this.lost = 0;
        this.enter(c, 1.2);
        if (isCop) g.sfx.whistle();
        else g.sfx.granny();
        g.hud.toast(isCop ? '👮 ¡El municipal ha atajado por otra calle y te corta el paso!' : '👵 A la abuela no se le escapa nadie: ¡sale por la otra esquina!');
        return;
      }
    }

    if (!walk(this.T, c, dir, speed, turn, dt) && c.stuck > 0.3) {
      c.stuck = 0;
      c.detour = 0.8;
      c.detourDir = c.heading + (Math.random() < 0.5 ? 1.7 : -1.7);
    }
    this.pose(c, time, speed, dt);

    // Contacto con el patinete
    const dy = p.pos.y - c.y;
    const hunting = c.state === 'chase' || c.state === 'windup';
    if (!pAlive || d > 2.7 || dy < -2) return;
    if (dy > OVER) {
      // Por encima no llegan: saltarlos tiene premio y los deja un momento descolocados
      if (hunting && !p.grounded && c.hopCd <= 0) {
        c.hopCd = 2.5;
        this.tire(c, 1.3);
        g.hud.trick(isCop ? '¡Salto del municipal!' : '¡Salto de la abuela!', 500, 1);
        g.addStuds(50);
        g.sfx.ole();
      }
    } else if (hunting && p.invuln <= 0) {
      if (isCop) this.fine(c, p);
      else this.slap(p);
    } else p.bump(dx / d, dz / d, 0.2, 0.7);
  }

  pose(c, time, speed, dt) {
    const f = c.fig;
    const st = c.state;
    const isCop = c === this.cop;
    const sw = speed > 0 ? Math.sin(c.walk) : 0;
    let tilt = 0;
    let hop = 0;
    f.legL.rotation.x = sw * 0.8;
    f.legR.rotation.x = -sw * 0.8;
    f.armL.rotation.x = -sw * 0.6;
    f.armR.rotation.x = sw * 0.6;
    f.armL.rotation.z = 0;
    f.head.rotation.x = 0;
    f.group.position.set(0, 0, 0);
    if (st === 'enter') hop = Math.abs(Math.sin(c.t * 10)) * 0.5;

    if (isCop && c.riding) {
      // En el patinete oficial, dándose impulso con el pie
      const sc = c.scooter;
      const roll = (speed * dt) / WHEEL_R;
      sc.rear.rotation.x += roll;
      sc.front.rotation.x += roll;
      c.beacon.material.color.setHex(Math.floor(time * 7) % 2 ? 0x2f7dff : 0x16305e);
      if (speed > 0) c.kick += dt * 9;
      f.group.position.set(0, DECK_Y, -0.5);
      tilt = 0.25;
      f.legL.rotation.x = 0;
      f.legR.rotation.x = speed > 0 ? Math.max(0, Math.sin(c.kick)) * 0.95 : 0;
      f.armL.rotation.x = f.armR.rotation.x = -1.72;
      f.head.rotation.x = -0.2;
      if (st === 'gloat') f.armR.rotation.x = -1.3 + Math.sin(time * 22) * 0.18;
    } else if (isCop) {
      if (st === 'chase' || st === 'enter') f.armR.rotation.x = -2.9 + Math.sin(time * 12) * 0.12; // ¡alto!
      else if (st === 'tired') {
        tilt = 0.5 + Math.sin(time * 7) * 0.06;
        f.armL.rotation.x = f.armR.rotation.x = 0.35;
      } else if (st === 'gloat') {
        // Libreta en una mano y boli en la otra
        f.armL.rotation.x = -1.2;
        f.armR.rotation.x = -1.3 + Math.sin(time * 22) * 0.18;
        f.head.rotation.x = 0.35;
      }
    } else if (st === 'windup') {
      tilt = -0.15;
      f.armR.rotation.x = -2.75 - (c.t / 0.45) * 1.1;
    } else if (c.swing > 0) {
      tilt = 0.3;
      f.armR.rotation.x = -0.8;
    } else if (st === 'chase' || st === 'enter') {
      tilt = 0.22;
      f.armR.rotation.x = -2.75 + Math.sin(time * 16) * 0.3;
    } else if (st === 'tired') {
      // Ay, la cadera
      tilt = 0.45 + Math.sin(time * 7) * 0.05;
      f.armL.rotation.z = 0.5;
      f.armR.rotation.x = 0.3;
    } else if (st === 'gloat') {
      hop = Math.abs(Math.sin(time * 9)) * 0.4;
      f.armR.rotation.x = -2.3 + Math.sin(time * 13) * 0.5;
    }
    f.group.rotation.x = tilt;
    c.root.position.set(c.x, c.y + hop, c.z);
    c.root.rotation.y = c.heading;
    const k = Math.max(0.01, c.pop) * (isCop ? 1 : 0.92);
    c.root.scale.setScalar(k);
    c.tag.position.set(c.x, c.y + hop + (isCop && c.riding ? 7.7 : 6.7) * k, c.z);
  }

  // ---------- La zapatilla ----------
  throwSlipper(c, p) {
    const s = this.slip;
    s.v = p.stats.vmax * SLIP_SPEED;
    p.velocity(_v);
    const lead = c.d / s.v;
    s.x = c.x;
    s.z = c.z;
    s.base = c.y;
    s.h = 5;
    s.y = c.y + s.h;
    s.dir = Math.atan2(p.pos.x + _v.x * lead - c.x, p.pos.z + _v.z * lead - c.z);
    s.t = 0;
    s.passed = false;
    s.state = 'fly';
    s.mesh.visible = true;
    this.game.sfx.whoosh();
  }

  updateSlipper(dt, p, pAlive) {
    const s = this.slip;
    const G = this.granny;
    this.hand.visible = s.state === 'hand';
    if (s.state === 'hand') return;
    const g = this.game;
    const T = this.T;
    s.t += dt;
    if (s.state === 'fly') {
      // Teledirigida, pero gira poco: un quiebro o un salto a tiempo la esquivan
      if (!s.passed) {
        const want = Math.atan2(p.pos.x - s.x, p.pos.z - s.z);
        if (Math.cos(want - s.dir) < 0) s.passed = true;
        else s.dir += clamp(angDiff(s.dir, want), -SLIP_TURN * dt, SLIP_TURN * dt);
      }
      s.x += Math.sin(s.dir) * s.v * dt;
      s.z += Math.cos(s.dir) * s.v * dt;
      const fl = T.height(s.x, s.z);
      if (fl - s.base > 1.6) {
        // Contra una pared
        g.bits.burst(s.x, s.y, s.z, [0xff8ad1, 0xffffff], 5, 6, s.base, 0.4);
        s.state = 'back';
      } else if (s.t > 1.5) s.state = 'back';
      else {
        s.base = fl;
        s.h = damp(s.h, SLIP_H, 8, dt);
        s.y = s.base + s.h;
        const hit = Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 2.1 && p.pos.y < s.y - 0.7 && p.pos.y > s.y - 5;
        if (hit && pAlive && p.invuln <= 0) {
          this.slap(p);
          return;
        }
      }
    } else {
      // Vuelve a la mano, como un bumerán
      const bx = G.x - s.x;
      const by = G.y + 4.5 - s.y;
      const bz = G.z - s.z;
      const bd = Math.hypot(bx, by, bz) || 1;
      const step = 62 * dt;
      if (G.state === 'off' || bd < step + 1.5) {
        s.state = 'hand';
        s.mesh.visible = false;
        G.throwCd = 2;
        return;
      }
      s.x += (bx / bd) * step;
      s.y += (by / bd) * step;
      s.z += (bz / bd) * step;
    }
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.y += dt * 22;
    s.fx -= dt;
    if (s.fx <= 0) {
      s.fx = 0.04;
      g.bits.spawn(s.x, s.y, s.z, (Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3, Math.random() < 0.5 ? 0xff8ad1 : 0xffffff, 0.26, 0.4, s.base);
    }
  }
}

// Zapatilla de andar por casa, de cuadros y con pompón. La punta mira a +Z.
function slipper() {
  const b = new Builder();
  b.box(0.8, 0.16, 1.9, 0, 0.08, 0, C.darkTan, { r: 0.07 });
  b.box(0.84, 0.5, 1.05, 0, 0.4, 0.42, C.darkRed, { r: 0.2 });
  b.box(0.86, 0.14, 0.16, 0, 0.56, -0.08, C.cream, { r: 0.06 });
  b.sphere(0.17, 0, 0.72, 0.5, C.cream, { seg: 8, seg2: 6 });
  return b.mesh(plastic);
}
