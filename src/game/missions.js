import * as THREE from 'three';
import { C } from '../lego/colors.js';
import { BASE } from '../world/city.js';
import { lift } from '../world/relief.js';

const ALIEN_GOALS = [1, 2, 4]; // goles para bronce, plata y oro contra el portero marciano
const SHOTS = 12; // fotos de la sesión con Emma
const SELFIE = [1500, 3500, 6500]; // puntos para bronce, plata y oro
// Cómo te pilla el flash: nombre y puntos de más (el truco del personaje toma su nombre de él)
const POSES = { suelo: ['Posando', 0], air: ['Salto', 150], spin: ['Giro', 300], whip: ['', 300], flip: ['Voltereta', 450] };
const FRAME = 0.92; // hasta dónde del borde de la foto se sale entero
const REACH = [13, 21]; // hasta dónde de la cámara se sale bien y hasta dónde, sin más, se sale
const GUIDE = { near: 7.5, far: 19, nr: 4, na: 12 }; // el abanico del suelo que marca lo que coge la cámara

const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

function iconTexture(emoji, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 320;
  const g = cv.getContext('2d');
  // Dibujado sobre 160 y al doble de tamaño: de cerca el icono ocupa media pantalla
  g.scale(2, 2);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(80, 80, 72, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
  g.stroke();
  g.font = '84px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 80, 88);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beamMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

// Minijuegos: carrera, trucos, bolos, reparto de pizza, fútbol y la sesión de fotos con Emma; de noche, bolos y portero son marcianos.
export class Missions {
  constructor(game) {
    this.game = game;
    const P = game.world.places;
    const sp = P.spawn;
    this.defs = [
      { id: 'race', name: 'Gran Premio de Cobeña', icon: '🏁', color: 0xffc61a, x: sp.x - Math.sin(sp.heading) * 14, z: sp.z - Math.cos(sp.heading) * 14, desc: 'Da la vuelta al barrio de los ríos lo más rápido que puedas.', lower: true, unit: (v) => fmt(v) },
      { id: 'tricks', name: 'Rey del Skatepark', icon: '🛹', color: 0xfe8a18, x: P.trick.marker.x, z: P.trick.marker.z, desc: '75 segundos para encadenar tus mejores trucos.', unit: (v) => `${Math.round(v)} pts` },
      { id: 'bowling', name: 'Bolos Gigantes', icon: '🎳', color: 0x2f7dff, x: P.bowling.x - 5.5, z: P.bowling.z + 1.5, desc: 'Tú eres la bola: derriba los 10 bolos en dos tiradas.', night: false, spot: 0, unit: (v) => `${v} bolos` },
      // De noche, en el mismo sitio, los bolos son marcianos
      { id: 'alienbowl', name: 'Bolos Marcianos', icon: '👽', color: 0x7ddc1f, x: P.bowling.x - 5.5, z: P.bowling.z + 1.5, desc: 'Los bolos son marcianos y se apartan: tumba los 10 en dos tiradas.', night: true, spot: 0, unit: (v) => `${v} marcianos` },
      { id: 'pizza', name: 'Pizza Exprés', icon: '🍕', color: 0xe23b2a, x: P.pizza.x, z: P.pizza.z, desc: 'Reparte 5 pizzas por las calles de Cobeña antes de que se enfríen.', lower: true, unit: (v) => fmt(v) },
      { id: 'soccer', name: 'Chut a Puerta', icon: '⚽', color: 0x4bbf5a, x: P.soccer.marker.x, z: P.soccer.marker.z, desc: 'Márcale a Teo todos los goles que puedas en 60 segundos.', night: false, spot: 1, unit: (v) => `${v} goles` },
      // De noche Teo se toma la noche libre: para un marciano con cuatro brazos
      // Solo cuando Emma está de vecina en el parque; dónde, lo dice ella (ver place)
      { id: 'selfie', name: 'Selfie con Emma', icon: '🤳', color: 0xff5fa2, x: 0, z: 0, desc: `Cuélate en las ${SHOTS} fotos de Emma: sal bien de fondo y que el flash te pille haciendo un truco distinto cada vez.`, when: () => !!game.folks?.emma && !game.folks.away.has('emma'), linger: 180, unit: (v) => `${Math.round(v)} pts` },
      { id: 'aliensoccer', name: 'Chut Marciano', icon: '👾', color: 0x7ddc1f, x: P.soccer.marker.x, z: P.soccer.marker.z, desc: 'El portero es un marciano con cuatro brazos que no le quita ojo al balón: márcale en 60 segundos.', night: true, spot: 1, unit: (v) => `${v} goles` },
    ];
    this.state = 'idle';
    this.cur = null;
    this.def = null;
    this.t = 0;
    this.time = 0;
    this.near = null;
    this.who = null;

    // Marcadores en el mundo
    const ringGeo = new THREE.TorusGeometry(3.2, 0.28, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(2.9, 2.9, 16, 28, 1, true);
    beamGeo.translate(0, 8, 0);
    for (const d of this.defs) {
      d.hidden = !!d.night;
      const g = new THREE.Group();
      const y = game.terrain.height(d.x, d.z);
      g.position.set(d.x, y, d.z);
      d.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: d.color, fog: false }));
      d.ring.position.y = 0.4;
      d.beam = new THREE.Mesh(beamGeo, beamMaterial(d.color, 0.2));
      d.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(d.icon, d.color), depthWrite: false, fog: false }));
      d.sprite.scale.set(5, 5, 1);
      d.sprite.position.y = 8;
      g.add(d.ring, d.beam, d.sprite);
      d.group = g;
      game.scene.add(g);
    }

    // Ayudas visuales compartidas
    const gateGeo = new THREE.TorusGeometry(6.5, 0.55, 8, 36);
    this.gate = new THREE.Mesh(gateGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, fog: false }));
    this.gate2 = new THREE.Mesh(gateGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.3, fog: false }));
    this.target = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 60, 24, 1, true), beamMaterial(0x4dff88, 0.28));
    tb.position.y = 30;
    const tr = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x4dff88, fog: false }));
    tr.position.y = 0.5;
    this.target.add(tb, tr);
    const ag = new THREE.ConeGeometry(0.7, 2, 4);
    ag.rotateX(Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0x4dff88, fog: false }));
    for (const o of [this.gate, this.gate2, this.target, this.arrow]) {
      o.visible = false;
      game.scene.add(o);
    }
    this.goalPos = null;

    // Sesión de fotos: la cámara del móvil de Emma y, en el suelo, el abanico de lo que coge
    this.selfieCam = new THREE.PerspectiveCamera(64, 1, 0.5, 1700);
    this.selfieLook = new THREE.Vector3();
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((GUIDE.nr + 1) * (GUIDE.na + 1) * 3), 3));
    const idx = [];
    for (let i = 0; i < GUIDE.nr; i++) {
      for (let j = 0; j < GUIDE.na; j++) {
        const a = i * (GUIDE.na + 1) + j;
        const b = a + GUIDE.na + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    gg.setIndex(idx);
    this.guide = new THREE.Mesh(gg, beamMaterial(0xff5fa2, 0.2));
    this.guide.frustumCulled = false;
    this.guide.userData.fixed = true; // sus vértices ya van a la cota del terreno, uno por uno
    this.guide.visible = false;
    game.scene.add(this.guide);
    this._v = new THREE.Vector3();
    this._size = new THREE.Vector2();
  }

  // Algunas empiezan donde diga quien se construye después
  place(id, at) {
    if (!at) return;
    const d = this.defs.find((d) => d.id === id);
    d.x = at.x;
    d.z = at.z;
    d.group.position.set(at.x, this.game.terrain.height(at.x, at.z), at.z);
  }

  get active() {
    return this.state !== 'idle';
  }

  begin(def) {
    const g = this.game;
    this.def = def;
    this.state = 'countdown';
    this.t = 3.3;
    this.lastN = 4;
    this.time = 0;
    this.cur = this['_' + def.id]();
    g.player.frozen = true;
    g.camera3.snap = true;
    g.hud.prompt(null);
    g.hud.mission(`${def.icon} ${def.name}`, '', def.desc);
    g.sfx.ui();
  }

  abort() {
    if (this.state === 'idle') return;
    this._cleanup();
    this.game.hud.toast('Misión abandonada');
  }

  // En red: en ese sitio ya estaba jugando otro (ver game/spots.js)
  bounce() {
    if (this.state === 'idle') return;
    this._cleanup();
    this.game.hud.toast('Ahí ya hay alguien jugando: espera a que acabe');
  }

  _cleanup() {
    const g = this.game;
    if (this.cur && this.cur.cleanup) this.cur.cleanup();
    this.cur = null;
    this.state = 'idle';
    this.goalPos = null;
    this.gate.visible = this.gate2.visible = this.target.visible = this.arrow.visible = false;
    g.player.frozen = false;
    g.player.pizza.visible = false;
    g.hud.mission(null);
    g.hud.results(null);
  }

  // photos: las fotos de la sesión con Emma, para el álbum del resultado
  finish(stars, value, lines, photos = null) {
    const g = this.game;
    const def = this.def;
    const sv = g.save;
    const prevStars = sv.stars[def.id] || 0;
    const prevBest = sv.best[def.id];
    let record = false;
    if (stars > 0 && (prevBest == null || (def.lower ? value < prevBest : value > prevBest))) {
      sv.best[def.id] = value;
      record = true;
    }
    if (stars > prevStars) sv.stars[def.id] = stars;
    const reward = stars * 2500 + (record && stars ? 1000 : 0);
    if (this.cur && this.cur.cleanup) this.cur.cleanup();
    this.cur = null;
    this.goalPos = null;
    this.gate.visible = this.gate2.visible = this.target.visible = this.arrow.visible = false;
    g.player.pizza.visible = false;
    g.hud.mission(null);
    this.state = 'result';
    this.t = 0;
    g.addStuds(reward);
    g.saveGame();
    if (stars > 0) {
      g.sfx.fanfare();
      g.confetti();
    } else g.sfx.fail();
    g.hud.results({ title: `${def.icon} ${def.name}`, stars, lines, record, reward, best: sv.best[def.id] != null ? def.unit(sv.best[def.id]) : null, photos });
  }

  setGoal(x, z) {
    this.goalPos = { x, z };
  }

  update(dt, time) {
    const g = this.game;
    const p = g.player;
    const idle = this.state === 'idle';
    const night = g.env.target > 0.5;
    for (const d of this.defs) {
      // Los que son solo de día o solo de noche se relevan en el mismo sitio
      d.hidden = (d.night != null && d.night !== night) || (!!d.when && !d.when());
      d.group.visible = idle && !d.hidden;
      if (!d.group.visible) continue;
      d.ring.rotation.y = time * 1.5;
      d.ring.scale.setScalar(1 + Math.sin(time * 4) * 0.06);
      d.sprite.position.y = 8 + Math.sin(time * 2.2) * 0.5;
      d.beam.material.opacity = 0.16 + Math.sin(time * 3) * 0.05;
    }
    if (idle) {
      let near = null;
      for (const d of this.defs) if (!d.hidden && Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 5.5) near = d;
      // En red, la bolera y la pista son de quien esté jugando en ellas
      const who = near && near.spot != null ? g.spots.player(near.spot) : null;
      if (near !== this.near || who !== this.who) {
        this.near = near;
        this.who = who;
        if (who) g.hud.prompt(`<b>${near.icon} ${near.name}</b><small>${who.char.icon} ${who.char.name} está jugando: espera a que acabe</small>`);
        else if (near) {
          const st = g.save.stars[near.id] || 0;
          const best = g.save.best[near.id];
          g.hud.prompt(`<kbd>E</kbd> <b>${near.icon} ${near.name}</b><span>${'★'.repeat(st)}${'☆'.repeat(3 - st)}${best != null ? ' · Récord: ' + near.unit(best) : ''}</span><small>${near.desc}</small>`);
        } else g.hud.prompt(null);
      }
      if (near && !who && g.input.hit('action') && p.crashT <= 0) this.begin(near);
      return;
    }
    if (this.state === 'countdown') {
      this.t -= dt;
      const n = Math.ceil(this.t);
      if (n !== this.lastN && n >= 1 && n <= 3) {
        this.lastN = n;
        g.hud.big(String(n), '#ffd23a', 0.8);
        g.sfx.countdown(false);
      }
      if (this.t <= 0) {
        this.state = 'run';
        p.frozen = false;
        g.hud.big('¡YA!', '#4dff88', 0.9);
        g.sfx.countdown(true);
      }
    } else if (this.state === 'run') {
      this.time += dt;
      this.cur.update(dt, time);
    } else if (this.state === 'result') {
      this.t += dt;
      // Donde se acaba saltando, que el último salto no cierre el resultado sin querer
      if ((this.t > (this.def.linger ? 1.6 : 0.8) && (g.input.hit('action') || g.input.hit('jump'))) || this.t > (this.def.linger || 12)) {
        g.hud.results(null);
        this.state = 'idle';
        this.near = null;
      }
    }
    // Flecha hacia el objetivo
    if (this.goalPos && this.state !== 'result') {
      const a = Math.atan2(this.goalPos.x - p.pos.x, this.goalPos.z - p.pos.z);
      this.arrow.visible = true;
      this.arrow.position.set(p.pos.x + Math.sin(a) * 3.2, p.pos.y + 6.6 + Math.sin(time * 6) * 0.15, p.pos.z + Math.cos(a) * 3.2);
      this.arrow.rotation.y = a;
    } else this.arrow.visible = false;
  }

  // ---------- Carrera ----------
  _race() {
    const g = this.game;
    const R = g.world.places.race;
    const RACE = R.gates;
    const n = RACE.length;
    const gold = Math.round(R.length / 29);
    const silver = Math.round(R.length / 23);
    let idx = 0;
    g.player.place(R.start.x, R.start.z, R.start.heading);
    const place = () => {
      const c = RACE[idx];
      const prev = idx ? RACE[idx - 1] : [R.start.x, R.start.z];
      this.gate.position.set(c[0], 5.5, c[1]);
      this.gate.rotation.y = Math.atan2(c[0] - prev[0], c[1] - prev[1]);
      this.gate.visible = true;
      this.setGoal(c[0], c[1]);
      if (idx + 1 < n) {
        const c2 = RACE[idx + 1];
        this.gate2.position.set(c2[0], 5.5, c2[1]);
        this.gate2.rotation.y = Math.atan2(c2[0] - c[0], c2[1] - c[1]);
        this.gate2.visible = true;
      } else this.gate2.visible = false;
    };
    place();
    return {
      update: (dt, time) => {
        const p = g.player.pos;
        const c = RACE[idx];
        this.gate.scale.setScalar(1 + Math.sin(time * 6) * 0.05);
        g.hud.mission(`🏁 ${this.def.name}`, fmt(this.time), `Control ${idx}/${n} · Oro ${fmt(gold)} · Plata ${fmt(silver)}`);
        if (Math.hypot(p.x - c[0], p.z - c[1]) < 9.5) {
          idx++;
          g.sfx.checkpoint();
          g.player.boost = Math.min(1, g.player.boost + 0.12);
          if (idx >= n) {
            const t = this.time;
            const stars = t <= gold ? 3 : t <= silver ? 2 : 1;
            this.finish(stars, t, [`Tiempo: <b>${fmt(t)}</b>`, stars === 3 ? '¡Vuelta de oro!' : stars === 2 ? `Plata. El oro está en ${fmt(gold)}.` : `Bronce. La plata está en ${fmt(silver)}.`]);
          } else {
            g.hud.big(`${idx}/${n}`, '#ffd23a', 0.5, true);
            place();
          }
        }
      },
    };
  }

  // ---------- Trucos ----------
  _tricks() {
    const g = this.game;
    const P = g.world.places.trick;
    g.player.place(P.x, P.z, P.heading);
    g.player.boost = 1;
    this.score = 0;
    return {
      update: () => {
        const left = 75 - this.time;
        g.hud.mission(`🛹 ${this.def.name}`, `${this.score} pts`, `⏱ ${fmt(left)} · Oro 20000 · Plata 10000`);
        if (left <= 0) {
          const s = this.score;
          const stars = s >= 20000 ? 3 : s >= 10000 ? 2 : s >= 4000 ? 1 : 0;
          this.finish(stars, s, [`Puntuación: <b>${s}</b>`, stars === 0 ? 'Necesitas 4000 puntos. Gira en el aire (A/D), haz tailwhips (F) y volteretas (S).' : 'Encadena trucos sin parar para subir el multiplicador.']);
        }
      },
    };
  }

  trickScore(points) {
    if (this.state === 'run' && this.def.id === 'tricks') this.score += points;
  }

  // ---------- Bolos ----------
  _bowling() {
    return this._lane(this.game.pins, 'bolos');
  }

  // De noche los bolos son marcianos: se apartan, así que hay que entrar rápido y engañarlos
  _alienbowl() {
    return this._lane(this.game.alienPins, 'marcianos');
  }

  _lane(pins, what) {
    const g = this.game;
    const P = g.world.places.bowling;
    const alien = pins !== g.pins;
    g.spots.play(0);
    pins.reset();
    g.player.place(P.x, P.z, P.heading);
    g.player.boost = 1;
    let roll = 1;
    let phase = 'aim';
    let settle = 0;
    let aim = 0;
    let first = 0;
    return {
      update: (dt) => {
        const down = pins.downCount;
        g.hud.mission(`${this.def.icon} ${this.def.name}`, `${down}/10`, `Tirada ${roll} de 2 · ${alien ? '¡Con turbo no les da tiempo a apartarse!' : '¡Coge carrerilla y embiste!'}`);
        if (phase === 'aim') {
          aim += dt;
          const moved = pins.pins.some((p) => p.down && !p.gone);
          if (moved || aim > 25 || g.player.pos.z < P.backZ + 3) {
            phase = 'settle';
            settle = 0;
          }
        } else {
          settle += dt;
          if (settle > 3.2 && (!pins.moving || settle > 6)) {
            if (roll === 1) first = down;
            if (down === 10 || roll === 2) {
              const stars = first === 10 ? 3 : down === 10 ? 2 : down >= 6 ? 1 : 0;
              const tip = alien ? 'Entra con turbo y tuerce en el último momento: se apartan hacia donde no vas.' : 'No está mal. Entra más rápido y por el centro.';
              const msg = first === 10 ? '¡¡PLENO!! Todos de una tirada.' : down === 10 ? '¡Semipleno! Para el oro, tíralos todos a la primera.' : down >= 6 ? tip : `Necesitas al menos 6 ${what}.`;
              this.finish(stars, down + (first === 10 ? 1 : 0), [`${alien ? 'Marcianos' : 'Bolos'} derribados: <b>${down}/10</b>`, msg]);
            } else {
              roll = 2;
              phase = 'aim';
              aim = 0;
              pins.clearFallen();
              if (alien) {
                pins.taunt();
                g.player.boost = 1;
              }
              g.player.place(P.x, P.z, P.heading);
              g.camera3.snap = true;
              g.hud.big(`${down} ${what}`, alien ? '#8dff6a' : '#ffd23a', 1.2);
            }
          }
        }
      },
      cleanup: () => {
        pins.reset();
        g.spots.leave(0);
      },
    };
  }

  // ---------- Reparto de pizza ----------
  _pizza() {
    const g = this.game;
    const P = g.world.places.pizza;
    const doors = g.world.doors.filter((d) => Math.hypot(d.x - P.x, d.z - P.z) > 60);
    const rng = g.rng;
    const route = [];
    let cur = P;
    let total = 0;
    for (let i = 0; i < 5; i++) {
      let cands = doors.filter((d) => !route.includes(d) && Math.hypot(d.x - cur.x, d.z - cur.z) > 120 && Math.hypot(d.x - cur.x, d.z - cur.z) < 380);
      if (!cands.length) cands = doors.filter((d) => !route.includes(d));
      const d = cands[Math.floor(rng() * cands.length)];
      total += Math.abs(d.x - cur.x) + Math.abs(d.z - cur.z);
      route.push(d);
      cur = d;
    }
    const par = total / 27 + 10;
    const limit = par * 1.9;
    let k = 0;
    g.player.place(P.x + 1.5, P.z, Math.PI / 2);
    g.player.pizza.visible = true;
    g.player.boost = 1;
    const place = () => {
      const d = route[k];
      this.target.position.set(d.x, g.terrain.height(d.x, d.z), d.z);
      this.target.visible = true;
      this.setGoal(d.x, d.z);
    };
    place();
    return {
      update: (dt, time) => {
        const left = limit - this.time;
        const d = route[k];
        const dist = Math.hypot(g.player.pos.x - d.x, g.player.pos.z - d.z);
        g.hud.mission(`🍕 ${this.def.name}`, fmt(left), `Entrega ${k + 1}/5 → ${d.name} · a ${Math.round(dist)} m`);
        this.target.children[1].rotation.y = time * 2;
        if (dist < 6.5) {
          k++;
          g.sfx.checkpoint();
          g.studs.burst(d.x, g.player.pos.y + 1.5, d.z, 6, 1, g.terrain.height(d.x, d.z), 9);
          if (k >= 5) {
            const t = this.time;
            const stars = t <= par ? 3 : t <= par * 1.3 ? 2 : 1;
            this.finish(stars, t, [`Tiempo de reparto: <b>${fmt(t)}</b>`, `Oro: ${fmt(par)} · Plata: ${fmt(par * 1.3)}`]);
            return;
          }
          g.hud.big('¡Entregada!', '#4dff88', 0.9);
          place();
        } else if (left <= 0) {
          this.finish(0, this.time, [`Entregadas: <b>${k}/5</b>`, '¡Las pizzas se han enfriado! Usa el turbo (Mayús) en las rectas.']);
        }
      },
    };
  }

  // ---------- Fútbol ----------
  _soccer() {
    return this._pitch([1, 3, 5], 'Golpea el balón de lado para que el portero no llegue.');
  }

  // El portero marciano sigue el balón: hay que chutar fuerte y cruzado, o pillarlo a contrapié
  _aliensoccer() {
    return this._pitch(ALIEN_GOALS, 'Chuta con turbo y cruzado: llega a todo, pero no corre tanto.');
  }

  _pitch(need, tip) {
    const g = this.game;
    const P = g.world.places.soccer;
    g.spots.play(1);
    g.ball.reset();
    g.player.place(P.start.x, P.start.z, P.start.heading);
    g.player.boost = 1;
    this.goals = 0;
    return {
      soccer: true,
      update: () => {
        const left = 60 - this.time;
        g.hud.mission(`${this.def.icon} ${this.def.name}`, `${this.goals} ${this.goals === 1 ? 'gol' : 'goles'}`, `⏱ ${fmt(left)} · Portería del este (para ${g.ball.keeperName}) · Oro: ${need[2]} goles`);
        if (left <= 0) {
          const n = this.goals;
          const stars = n >= need[2] ? 3 : n >= need[1] ? 2 : n >= need[0] ? 1 : 0;
          this.finish(stars, n, [`Goles: <b>${n}</b>`, stars === 0 ? `Empuja el balón hacia la portería ${g.ball.keeperName.replace(/^el /, 'del ').replace(/^(?!del )/, 'de ')}.` : tip]);
        }
      },
      cleanup: () => {
        g.ball.reset();
        g.spots.leave(1);
      },
    };
  }

  // ---------- Selfie con Emma ----------
  // Ella sigue con su sesión de fotos, pero ya no se gira hacia ti: cambia de ángulo tras cada foto y
  // hay que recolocarse a su espalda, dentro del abanico, y que el flash te pille en el aire
  _selfie() {
    const g = this.game;
    const F = g.folks;
    const E = F.emma;
    const p = g.player;
    p.place(E.start.x, E.start.z, E.start.heading);
    p.boost = 1;
    this.score = 0;
    let n = 0;
    let seen = 0;
    let streak = 0;
    let last = null;
    const photos = [];
    let started = false;
    let end = 0;
    E.session = true;
    E.onShot = () => {
      if (this.state !== 'run' || !started || n >= SHOTS) return F.heart(E, 5);
      n++;
      const r = this.rate(E, last, streak);
      streak = r.streak;
      last = r.pose;
      this.score += r.pts;
      if (r.hearts) seen++;
      const cv = this.snap();
      photos.push({ cv, hearts: r.hearts, pts: r.pts });
      g.hud.selfie(cv, r.hearts);
      F.heart(E, [0, 3, 6, 11][r.hearts]);
      E.joy = [0, 0.4, 0.8, 1.3][r.hearts];
      g.hud.big(r.hearts ? `${'♥'.repeat(r.hearts)} ${r.name} +${r.pts}` : r.name, r.hearts ? '#ff8fc2' : '#ff6b5a', 1.3, true);
      if (r.hearts === 3) g.sfx.trick(Math.min(6, streak));
      else if (r.hearts) g.sfx.checkpoint();
      if (n >= SHOTS) end = 1.9;
    };
    this.guide.visible = true;
    g.hud.selfie(null);
    return {
      update: (dt) => {
        if (!started) {
          // La primera foto, enseguida y desde otro ángulo
          started = true;
          E.phase = 4;
          E.t = 0;
          E.want = E.heading + (Math.random() < 0.5 ? 1.3 : -1.3);
        }
        // El abanico marca ya el sitio de la foto siguiente, y se enciende según se acerca el flash
        this.frame(E, E.want);
        const k = E.phase === 0 ? E.t / 1.8 : E.phase === 1 ? (0.5 + E.t) / 1.8 : 0;
        this.guide.material.opacity = n >= SHOTS ? 0 : 0.14 + k * k * 0.34;
        const mult = 1 + Math.max(0, Math.min(4, streak - 1)) * 0.5;
        g.hud.mission(`🤳 ${this.def.name}`, `${this.score} pts`, `Foto ${Math.min(n + 1, SHOTS)}/${SHOTS}${mult > 1 ? ` · ×${mult}` : ''} · Oro ${SELFIE[2]} · Plata ${SELFIE[1]}`);
        if (end > 0 && (end -= dt) <= 0) {
          const s = this.score;
          const stars = s >= SELFIE[2] ? 3 : s >= SELFIE[1] ? 2 : s >= SELFIE[0] ? 1 : 0;
          const tip = stars === 3 ? '¡Menuda sesión! Emma las sube todas.' : stars === 0 ? `Necesitas ${SELFIE[0]} puntos. Colócate en el abanico rosa, a la espalda de Emma, y salta (Espacio) cuando levante el móvil.` : `Que el flash te pille en el aire girando (A/D), con un ${p.char.trick.toLowerCase()} (F) o una voltereta (S), y cambia de truco en cada foto para subir el multiplicador.`;
          const lines = [`Puntuación: <b>${s}</b> · Sales en <b>${seen}/${SHOTS}</b> fotos`, tip];
          // Todas llevan el sello del modo foto: en el álbum del resultado se guarda la que se quiera
          for (const f of photos) g.photo.stamp(f.cv.getContext('2d'), f.cv.width, f.cv.height);
          this.finish(stars, s, lines, photos);
        }
      },
      cleanup: () => {
        E.session = false;
        E.onShot = null;
        E.joy = 1;
        this.guide.visible = false;
        g.hud.selfie(null);
      },
    };
  }

  // Coloca la cámara donde Emma tiene el móvil (algo más lejos y más alta, como con palo de selfie),
  // mirando por encima de su hombro a lo que tiene detrás, y tiende el abanico por el suelo.
  // heading: hacia dónde mira Emma, o hacia dónde va a mirar en la foto siguiente
  frame(E, heading) {
    const T = this.game.terrain;
    const cam = this.selfieCam;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    cam.position.set(E.x + fx * 4.4 - fz * 1.5, E.y + 6.4, E.z + fz * 4.4 + fx * 1.5);
    this.selfieLook.set(E.x - fx * 7, E.y + 2.6, E.z - fz * 7);
    cam.lookAt(this.selfieLook);
    cam.updateMatrixWorld(true);
    const cx = cam.position.x;
    const cz = cam.position.z;
    const yaw = Math.atan2(this.selfieLook.x - cx, this.selfieLook.z - cz);
    const half = Math.atan(FRAME * Math.tan((cam.fov * Math.PI) / 360));
    const pos = this.guide.geometry.attributes.position;
    let i = 0;
    for (let r = 0; r <= GUIDE.nr; r++) {
      const d = GUIDE.near + ((GUIDE.far - GUIDE.near) * r) / GUIDE.nr;
      for (let a = 0; a <= GUIDE.na; a++) {
        const ang = yaw + half * ((2 * a) / GUIDE.na - 1);
        const x = cx + Math.sin(ang) * d;
        const z = cz + Math.cos(ang) * d;
        pos.setXYZ(i++, x, T.height(x, z) + lift(x, z) + 0.3, z);
      }
    }
    pos.needsUpdate = true;
  }

  // Cómo ha quedado la foto: si sales, cómo de centrado y de cerca, y en qué postura te pilla el flash
  rate(E, last, streak) {
    const p = this.game.player;
    const cam = this.selfieCam;
    this.frame(E, E.heading);
    const c = cam.position;
    const v = this._v.set(p.pos.x, p.pos.y + 2.4, p.pos.z);
    const dx = v.x - c.x;
    const dy = v.y - c.y;
    const dz = v.z - c.z;
    const dist = Math.hypot(dx, dy, dz);
    // ¿Te tapa Emma? Queda entre la cámara y tú, pegada a la línea que os une
    const ex = E.x - c.x;
    const ey = E.y + 2.8 - c.y;
    const ez = E.z - c.z;
    const k = (ex * dx + ey * dy + ez * dz) / (dist * dist || 1);
    const covered = k > 0 && k < 1 && Math.hypot(ex - dx * k, ey - dy * k, ez - dz * k) < 1.5;
    const ahead = dx * (this.selfieLook.x - c.x) + dz * (this.selfieLook.z - c.z) > 0;
    v.project(cam);
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    if (p.hidden || !ahead || off > FRAME) return { pose: null, streak: 0, hearts: 0, pts: 0, name: '¡No sales en la foto!' };
    if (dist > REACH[1]) return { pose: null, streak: 0, hearts: 0, pts: 0, name: '¡Sales muy lejos!' };
    if (covered) return { pose: null, streak: 0, hearts: 0, pts: 0, name: '¡Te tapa Emma!' };
    let pose = 'suelo';
    if (!p.grounded && p.crashT <= 0) pose = p.flipAbs > 0.8 ? 'flip' : p.whipT > 0 || p.whips > 0 ? 'whip' : p.spinAbs > 0.9 ? 'spin' : 'air';
    const trick = pose !== 'suelo';
    const again = trick && pose === last;
    // Truco distinto al de la foto anterior: sube el multiplicador; repetido o en el suelo, vuelta a empezar
    streak = trick && !again ? streak + 1 : 0;
    const mult = 1 + Math.max(0, Math.min(4, streak - 1)) * 0.5;
    const q = (1 - 0.5 * off) * (dist <= REACH[0] ? 1 : 1 - (0.5 * (dist - REACH[0])) / (REACH[1] - REACH[0]));
    const pts = Math.round(((100 + POSES[pose][1] * (again ? 0.5 : 1)) * (0.5 + 0.5 * q) * mult) / 10) * 10;
    const name = (POSES[pose][0] || p.char.trick) + (again ? ' repetido' : '') + (mult > 1 ? ` ×${mult}` : '');
    return { pose, streak, hearts: !trick ? 1 : again || pose === 'air' ? 2 : 3, pts, name };
  }

  // La foto de verdad: lo que ve el móvil, pintado en una esquina del lienzo y copiado antes de que
  // el fotograma de turno lo tape
  snap() {
    const g = this.game;
    const r = g.renderer;
    const E = g.folks.emma;
    const size = r.getSize(this._size);
    const s = Math.floor(Math.min(640, size.x, size.y));
    const px = Math.floor(s * r.getPixelRatio());
    const cv = document.createElement('canvas');
    cv.width = cv.height = 640;
    // Ni el móvil (la cámara va dentro), ni rótulos ni ayudas
    const hide = [E.phone, E.tag, this.guide, this.arrow].filter((o) => o.visible);
    for (const o of hide) o.visible = false;
    try {
      r.setRenderTarget(null);
      r.setViewport(0, 0, s, s);
      g.render(0, { cam: this.selfieCam, look: this.selfieLook });
      cv.getContext('2d').drawImage(g.canvas, 0, g.canvas.height - px, px, px, 0, 0, cv.width, cv.height);
    } finally {
      r.setViewport(0, 0, size.x, size.y);
      for (const o of hide) o.visible = true;
    }
    return cv;
  }

  goal(side) {
    const g = this.game;
    const playing = this.state === 'run' && this.cur.soccer;
    if (playing) {
      if (side === 'east') {
        this.goals++;
        g.hud.big('¡GOOOL!', '#4dff88', 1.4);
      } else g.hud.big('¡En propia puerta!', '#ff6b5a', 1.2);
    } else {
      g.hud.big('¡GOOOL!', '#4dff88', 1.2);
      g.addStuds(500);
    }
    g.sfx.goal();
    g.confetti(g.ball.pos.x, g.ball.pos.y + 2, g.ball.pos.z);
    // En red lo ven y lo oyen los que anden cerca
    g.party?.tell('gol', playing && side !== 'east' ? 0 : 1);
  }
}

export { fmt, C, BASE };
