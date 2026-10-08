import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';

const SKIN = 0x7ddc1f;
const SPIES = 3; // disfrazados que se cuelan cada día
const DISCOUNT = 2; // marcianos que le quita a la oleada de esa noche cada uno que eches
const GREEN = '#8dff6a';

// Marcianos disfrazados: de día, a unos pocos vecinos de los que pasean les asoma una antena por
// encima del pelo. Embistiéndolos se les cae el disfraz y el marciano que iba debajo sale
// corriendo (el estado «bolt» de aliens.js): hay que echarlo de un culetazo antes de que se esfume.
// Cada uno que eches es gente que le falta a la oleada de esa noche. Ojo, que atropellar a un
// vecino de verdad sigue contando para el municipal.
export class Disguise {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.day = false;
    this.total = 0;
    this.caught = 0;
    this.tipT = 0;
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

  // Amanece: se cuelan otros, mejor entre los vecinos que te pillan a mano
  pick(p) {
    this.clear();
    const d = (o) => Math.hypot(o.x - p.pos.x, o.z - p.pos.z);
    const peds = this.game.traffic.peds.filter((o) => !o.taken);
    for (let i = peds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [peds[i], peds[j]] = [peds[j], peds[i]];
    }
    const near = (o) => d(o) > 40 && d(o) < 260;
    const from = [...peds.filter(near), ...peds.filter((o) => !near(o))].slice(0, SPIES);
    for (const ped of from) {
      const mesh = this.antenna();
      ped.fig.head.add(mesh);
      this.list.push({ ped, mesh, alien: null, state: 'hidden', ph: Math.random() * 6 });
    }
    this.total = this.list.length;
    this.caught = 0;
    this.tipT = 6;
    this.game.hud.setSpies(0, this.total);
  }

  // Se acabó el día (o empieza otro): los que queden se quitan la antena y vuelve cada vecino a su paseo
  clear() {
    for (const s of this.list) {
      s.ped.fig.head.remove(s.mesh);
      s.mesh.geometry.dispose();
      if (s.state === 'run') this.game.aliens.beamUp(s.alien);
      if (s.state === 'run' || s.state === 'gone') s.ped.taken = false;
    }
    this.list.length = 0;
    this.game.hud.setSpies(null);
  }

  // Lo llama el tráfico al embestir a un peatón: si era un disfrazado, se le cae el disfraz
  unmask(ped, x, y, z) {
    const g = this.game;
    const s = this.list.find((o) => o.ped === ped && o.state === 'hidden');
    if (!s) return false;
    const a = g.aliens.bolt(x, z, ped.fig.group.rotation.y);
    if (!a) return false;
    s.alien = a;
    s.state = 'run';
    ped.taken = true;
    ped.fig.group.visible = false;
    ped.fig.head.remove(s.mesh);
    // El disfraz, por los suelos: ladrillos de la ropa y del pelo del vecino
    g.bits.burst(x, y + 2.5, z, ped.fig.colors, 18, 10, y, 0.6);
    g.camera3.addShake(0.3);
    g.sfx.alienSpot();
    g.hud.big('¡Era un marciano!', GREEN, 1.3, true);
    if (!g.save.spies) g.hud.toast('👽 ¡Se le ha caído el disfraz! Que no se escape: dale un <b>culetazo</b> antes de que se esfume.');
    return true;
  }

  // Marcianos que le faltarán a la oleada de esta noche (aliens.js la cuenta al empezar)
  discount() {
    return this.caught * DISCOUNT;
  }

  out(s, caught) {
    const g = this.game;
    s.state = 'gone';
    if (!caught) {
      g.hud.toast('💨 El marciano disfrazado se ha esfumado. Esta noche vendrá con los demás.');
      return;
    }
    this.caught++;
    g.save.spies = (g.save.spies || 0) + 1;
    g.addStuds(150);
    g.hud.setSpies(this.caught, this.total);
    const left = this.list.filter((o) => o.state === 'hidden').length;
    if (left) {
      g.hud.toast(`👽 ¡Marciano disfrazado fuera! Quedan <b>${left}</b> paseando por Cobeña.`);
      return;
    }
    const all = this.caught === this.total;
    if (all) {
      g.addStuds(500);
      g.sfx.fanfare();
      g.confetti();
      g.hud.big('¡Ni un disfrazado!', GREEN, 2);
    }
    g.hud.toast(`${all ? '🏆 ¡Has echado a todos los disfrazados!' : '👽 Ya no quedan disfrazados por hoy.'} La oleada de esta noche llegará con <b>${this.discount()}</b> marcianos menos.`);
  }

  update(dt, p, time) {
    const g = this.game;
    const day = g.env.target < 0.5;
    if (day !== this.day) {
      this.day = day;
      if (day) this.pick(p);
      else this.clear();
    }
    if (!this.list.length) return;
    if (this.tipT > 0 && !g.missions.active) {
      this.tipT -= dt;
      if (this.tipT <= 0) g.hud.toast(`🥸 Dicen que hay <b>${this.total}</b> marcianos <b>disfrazados de vecino</b> paseando por Cobeña. Fíjate bien: les asoma una <b>antena</b>. Embístelos… pero no te equivoques de vecino.`);
    }
    for (const s of this.list) {
      if (s.state === 'hidden') {
        // La antena asoma y se esconde sola: no la saben tener quieta
        const k = Math.max(0, Math.sin(time * 1.7 + s.ph));
        s.mesh.position.y = 0.62 + k * k * 0.43;
        s.mesh.rotation.x = Math.sin(time * 5 + s.ph) * 0.12;
        continue;
      }
      if (s.state === 'run') {
        const st = s.alien.state;
        // En los minijuegos no pinta nada
        if (g.missions.active && st === 'bolt') g.aliens.beamUp(s.alien);
        else if (st === 'fly') this.out(s, true);
        else if (st === 'beamup') this.out(s, false);
        else if (st === 'off') this.out(s, true);
        continue;
      }
      // El vecino de verdad vuelve a su paseo cuando no miras
      if (s.state === 'gone' && s.alien.state === 'off' && Math.hypot(s.ped.x - p.pos.x, s.ped.z - p.pos.z) > 70) {
        s.ped.taken = false;
        s.state = 'back';
      }
    }
  }
}
