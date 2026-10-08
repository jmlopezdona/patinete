import * as THREE from 'three';
import { C } from '../lego/colors.js';
import { BASE } from '../world/city.js';

const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

function iconTexture(emoji, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 160;
  const g = cv.getContext('2d');
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

// Minijuegos: carrera, trucos, bolos (de noche, marcianos), reparto de pizza y fútbol.
export class Missions {
  constructor(game) {
    this.game = game;
    const P = game.world.places;
    const sp = P.spawn;
    this.defs = [
      { id: 'race', name: 'Gran Premio de Cobeña', icon: '🏁', color: 0xffc61a, x: sp.x - Math.sin(sp.heading) * 14, z: sp.z - Math.cos(sp.heading) * 14, desc: 'Da la vuelta al barrio de los ríos lo más rápido que puedas.', lower: true, unit: (v) => fmt(v) },
      { id: 'tricks', name: 'Rey del Skatepark', icon: '🛹', color: 0xfe8a18, x: P.trick.marker.x, z: P.trick.marker.z, desc: '75 segundos para encadenar tus mejores trucos.', unit: (v) => `${Math.round(v)} pts` },
      { id: 'bowling', name: 'Bolos Gigantes', icon: '🎳', color: 0x2f7dff, x: P.bowling.x - 5.5, z: P.bowling.z + 1.5, desc: 'Tú eres la bola: derriba los 10 bolos en dos tiradas.', night: false, unit: (v) => `${v} bolos` },
      // De noche, en el mismo sitio, los bolos son marcianos
      { id: 'alienbowl', name: 'Bolos Marcianos', icon: '👽', color: 0x7ddc1f, x: P.bowling.x - 5.5, z: P.bowling.z + 1.5, desc: 'Los bolos son marcianos y se apartan: tumba los 10 en dos tiradas.', night: true, unit: (v) => `${v} marcianos` },
      { id: 'pizza', name: 'Pizza Exprés', icon: '🍕', color: 0xe23b2a, x: P.pizza.x, z: P.pizza.z, desc: 'Reparte 5 pizzas por las calles de Cobeña antes de que se enfríen.', lower: true, unit: (v) => fmt(v) },
      { id: 'soccer', name: 'Chut a Puerta', icon: '⚽', color: 0x4bbf5a, x: P.soccer.marker.x, z: P.soccer.marker.z, desc: 'Márcale a Teo todos los goles que puedas en 60 segundos.', unit: (v) => `${v} goles` },
    ];
    this.state = 'idle';
    this.cur = null;
    this.def = null;
    this.t = 0;
    this.time = 0;
    this.near = null;

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

  finish(stars, value, lines) {
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
    g.hud.results({ title: `${def.icon} ${def.name}`, stars, lines, record, reward, best: sv.best[def.id] != null ? def.unit(sv.best[def.id]) : null });
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
      d.hidden = d.night != null && d.night !== night;
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
      if (near !== this.near) {
        this.near = near;
        if (near) {
          const st = g.save.stars[near.id] || 0;
          const best = g.save.best[near.id];
          g.hud.prompt(`<kbd>E</kbd> <b>${near.icon} ${near.name}</b><span>${'★'.repeat(st)}${'☆'.repeat(3 - st)}${best != null ? ' · Récord: ' + near.unit(best) : ''}</span><small>${near.desc}</small>`);
        } else g.hud.prompt(null);
      }
      if (near && g.input.hit('action') && p.crashT <= 0) this.begin(near);
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
      if ((this.t > 0.8 && (g.input.hit('action') || g.input.hit('jump'))) || this.t > 12) {
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
      cleanup: () => pins.reset(),
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
    const g = this.game;
    const P = g.world.places.soccer;
    g.ball.reset();
    g.player.place(P.start.x, P.start.z, P.start.heading);
    g.player.boost = 1;
    this.goals = 0;
    return {
      update: () => {
        const left = 60 - this.time;
        g.hud.mission(`⚽ ${this.def.name}`, `${this.goals} ${this.goals === 1 ? 'gol' : 'goles'}`, `⏱ ${fmt(left)} · Portería del este (para ${g.ball.keeperName}) · Oro: 5 goles`);
        if (left <= 0) {
          const n = this.goals;
          const stars = n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
          this.finish(stars, n, [`Goles: <b>${n}</b>`, stars === 0 ? `Empuja el balón hacia la portería de ${g.ball.keeperName}.` : 'Golpea el balón de lado para que el portero no llegue.']);
        }
      },
      cleanup: () => g.ball.reset(),
    };
  }

  goal(side) {
    const g = this.game;
    if (this.state === 'run' && this.def.id === 'soccer') {
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
  }
}

export { fmt, C, BASE };
