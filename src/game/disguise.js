import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';

const SKIN = 0x7ddc1f;
const SPIES = 3; // disfrazados que se cuelan cada día
const DISCOUNT = 2; // marcianos que le quita a la oleada de esa noche cada uno que eches
const GREEN = '#8dff6a';
const STATES = ['hidden', 'run', 'gone', 'back']; // en red, lo que ha sido de cada uno

// Marcianos disfrazados: de día, a unos pocos vecinos de los que pasean les asoma una antena por
// encima del pelo. Embistiéndolos se les cae el disfraz y el marciano que iba debajo sale
// corriendo (el estado «bolt» de aliens.js): hay que echarlo de un culetazo antes de que se esfume.
// Cada uno que eches es gente que le falta a la oleada de esa noche. Ojo, que atropellar a un
// vecino de verdad sigue contando para el municipal.
// En red los elige el anfitrión y son los mismos en todas las pantallas (van en la `foto`). Quien
// embiste a uno se lo dice al anfitrión (`disfraz`), y el que lo echa se lleva los studs.
export class Disguise {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.day = false;
    this.total = 0;
    this.caught = 0;
    this.tipT = 0;
    this.led = false; // invitado de una partida en red: los disfrazados son los del anfitrión
    this.shown = null;
  }

  // Antena que asoma por la coronilla, torcida hacia un lado
  antenna() {
    const b = new Builder();
    b.cyl(0.09, 0.9, 0, 0.45, 0, SKIN, { seg: 8 });
    b.sphere(0.24, 0, 0.98, 0, C.red, { seg: 10, seg2: 8 });
    const m = b.mesh(plastic);
    m.position.set(0.28, 1.05, -0.1);
    m.rotation.z = -0.3;
    return m;
  }

  // Amanece: se cuelan otros, mejor entre los vecinos que pillan a mano a los jugadores
  pick(who) {
    this.clear();
    const d = (o) => Math.sqrt(Math.min(...who.map((p) => (o.x - p.pos.x) ** 2 + (o.z - p.pos.z) ** 2)));
    const peds = this.game.traffic.peds.filter((o) => !o.taken);
    for (let i = peds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [peds[i], peds[j]] = [peds[j], peds[i]];
    }
    const near = (o) => d(o) > 40 && d(o) < 260;
    for (const ped of [...peds.filter(near), ...peds.filter((o) => !near(o))].slice(0, SPIES)) this.add(ped);
    this.total = this.list.length;
    this.caught = 0;
    this.tipT = 6;
  }

  add(ped) {
    const mesh = this.antenna();
    ped.fig.head.add(mesh);
    const s = { ped, i: this.game.traffic.peds.indexOf(ped), mesh, alien: null, by: null, state: 'hidden', was: 'hidden', ph: Math.random() * 6 };
    this.list.push(s);
    return s;
  }

  // Se acabó el día (o empieza otro): los que queden se quitan la antena y vuelve cada vecino a su paseo
  clear() {
    for (const s of this.list) {
      s.ped.fig.head.remove(s.mesh);
      s.mesh.geometry.dispose();
      if (s.state === 'run' && !this.led) this.game.aliens.beamUp(s.alien);
      if (s.state === 'run' || s.state === 'gone') s.ped.taken = false;
    }
    this.list.length = 0;
  }

  // Lo llama el tráfico cuando el jugador de esta pantalla embiste a un peatón: si era un
  // disfrazado, se le cae el disfraz. En un invitado se le dice al anfitrión, que es quien lo decide
  unmask(ped, x, y, z) {
    const g = this.game;
    const s = this.list.find((o) => o.ped === ped && o.state === 'hidden');
    if (!s) return false;
    if (this.led) {
      g.party.tell('disfraz', s.i);
      return true;
    }
    return this.reveal(s, x, y, z, g.player);
  }

  // En el anfitrión: un invitado dice que ha embestido a ese vecino
  asked(k, v, r) {
    const s = this.list.find((o) => o.i === v && o.state === 'hidden');
    if (s) this.reveal(s, s.ped.x, this.game.terrain.height(s.ped.x, s.ped.z), s.ped.z, r);
  }

  reveal(s, x, y, z, by) {
    const g = this.game;
    const a = g.aliens.bolt(x, z, s.ped.fig.group.rotation.y);
    if (!a) return false;
    s.alien = a;
    s.state = 'run';
    s.ped.taken = true;
    g.to(by).hud.big('¡Era un marciano!', GREEN, 1.3, true);
    if (by !== g.player || !g.save.spies) g.to(by).hud.toast('👽 ¡Se le ha caído el disfraz! Que no se escape: dale un <b>culetazo</b> antes de que se esfume.');
    return true;
  }

  // Marcianos que le faltarán a la oleada de esta noche (aliens.js la cuenta al empezar)
  discount() {
    return this.caught * DISCOUNT;
  }

  // Ya no está: lo han echado o se ha esfumado. Los studs son para quien le dio el culetazo, y la
  // cuenta es de todos
  out(s, caught) {
    const g = this.game;
    s.state = 'gone';
    if (!caught) {
      g.all.hud.toast('💨 El marciano disfrazado se ha esfumado. Esta noche vendrá con los demás.');
      return;
    }
    this.caught++;
    const to = s.by ? g.to(s.by) : g.all;
    to.tally('spies');
    to.addStuds(150);
    const left = this.list.filter((o) => o.state === 'hidden').length;
    if (left) {
      g.all.hud.toast(`👽 ¡Marciano disfrazado fuera! Quedan <b>${left}</b> paseando por Cobeña.`, '¡Marciano disfrazado fuera!');
      return;
    }
    const all = this.caught === this.total;
    if (all) {
      g.all.addStuds(500);
      g.all.sfx.fanfare();
      g.all.confetti();
      g.all.hud.big('¡Ni un disfrazado!', GREEN, 2);
    }
    g.all.hud.toast(`${all ? '🏆 ¡Has echado a todos los disfrazados!' : '👽 Ya no quedan disfrazados por hoy.'} La oleada de esta noche llegará con <b>${this.discount()}</b> marcianos menos.`, all ? '¡Has echado a todos los disfrazados!' : 'Ya no quedan disfrazados por hoy.');
  }

  update(dt, p, time) {
    const g = this.game;
    const party = g.party;
    const led = !!party && !party.hosting && party.fed;
    // Al entrar en la partida de otro, o al acabarse, los de esta pantalla se quitan la antena
    if (led !== this.led) {
      this.clear();
      this.led = led;
      this.total = this.caught = 0;
      this.day = false;
    }
    if (!led) this.direct(g.crowd(p));
    // El marcador es de todos: sale de cuántos quedan
    const key = this.list.length ? `${this.caught}/${this.total}` : null;
    if (key !== this.shown) {
      this.shown = key;
      g.hud.setSpies(key ? this.caught : null, this.total);
    }
    if (!this.list.length) return;
    if (this.tipT > 0 && !g.missions.active) {
      this.tipT -= dt;
      if (this.tipT <= 0) g.hud.toast(`🥸 Dicen que hay <b>${this.total}</b> marcianos <b>disfrazados de vecino</b> paseando por Cobeña. Fíjate bien: les asoma una <b>antena</b>. Embístelos… pero no te equivoques de vecino.`, 'Dicen que hay marcianos disfrazados de vecino paseando por Cobeña. Fíjate bien: les asoma una antena. Embístelos… pero no te equivoques de vecino.');
    }
    for (const s of this.list) {
      const ped = s.ped;
      if (s.state !== s.was) {
        // Se le cae el disfraz: ladrillos de la ropa y del pelo del vecino por los suelos
        if (s.was === 'hidden' && s.state !== 'back') {
          ped.taken = true;
          ped.fig.group.visible = false;
          ped.fig.head.remove(s.mesh);
        }
        if (s.state === 'run') {
          const y = g.terrain.height(ped.x, ped.z);
          const near = g.here(ped.x, ped.z);
          near.bits.burst(ped.x, y + 2.5, ped.z, ped.fig.colors, 18, 10, y, 0.6);
          near.sfx.alienSpot();
          if (Math.hypot(ped.x - p.pos.x, ped.z - p.pos.z) < 12) g.camera3.addShake(0.3);
        } else if (s.state === 'back') ped.taken = false;
        s.was = s.state;
      }
      if (s.state !== 'hidden') continue;
      // La antena asoma y se esconde sola: no la saben tener quieta
      const k = Math.max(0, Math.sin(time * 1.7 + s.ph));
      s.mesh.position.y = 0.62 + k * k * 0.43;
      s.mesh.rotation.x = Math.sin(time * 5 + s.ph) * 0.12;
    }
  }

  // Quiénes son y qué ha sido de cada uno. Solo jugando solo o en el anfitrión
  direct(who) {
    const g = this.game;
    const day = g.env.target < 0.5;
    if (day !== this.day) {
      this.day = day;
      if (day) this.pick(who);
      else this.clear();
    }
    for (const s of this.list) {
      if (s.state === 'run') {
        const a = s.alien;
        if (a.by) s.by = a.by;
        // En los minijuegos (jugando solo, que en red la partida sigue) no pinta nada
        if (!g.party && g.missions.active && a.state === 'bolt') g.aliens.beamUp(a);
        else if (a.state === 'fly') this.out(s, true);
        else if (a.state === 'beamup') this.out(s, false);
        else if (a.state === 'off') this.out(s, true);
      } else if (s.state === 'gone' && s.alien.state === 'off' && g.nearest2(s.ped.x, s.ped.z) > 70 * 70) {
        // El vecino de verdad vuelve a su paseo cuando nadie mira
        s.state = 'back';
      }
    }
  }

  // ---------- En red ----------
  // Lo que viaja en cada `foto`: cuántos se han echado y, de cada uno, qué vecino es y qué ha sido de él
  get bytes() {
    return 2 + this.list.length * 2;
  }

  write(dv, o) {
    dv.setUint8(o, this.list.length);
    dv.setUint8(o + 1, this.caught);
    o += 2;
    for (const s of this.list) {
      dv.setUint8(o, s.i);
      dv.setUint8(o + 1, STATES.indexOf(s.state));
      o += 2;
    }
    return o;
  }

  // Invitado: los disfrazados del anfitrión
  read(a, b, o) {
    const n = a.getUint8(o);
    const peds = this.game.traffic.peds;
    this.caught = a.getUint8(o + 1);
    o += 2;
    // Otro día, otros vecinos
    let same = n === this.list.length;
    for (let i = 0; same && i < n; i++) same = this.list[i].i === a.getUint8(o + i * 2);
    if (!same) {
      this.clear();
      for (let i = 0; i < n; i++) {
        const ped = peds[a.getUint8(o + i * 2)];
        if (ped) this.add(ped);
      }
      this.total = this.list.length;
      this.tipT = this.total ? 6 : 0;
    }
    for (let i = 0; i < n; i++) {
      const s = this.list[i];
      if (s) s.state = STATES[a.getUint8(o + i * 2 + 1)] || 'hidden';
    }
    return o + n * 2;
  }
}
