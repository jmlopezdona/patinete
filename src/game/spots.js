import { PINS, BALL } from './minigames.js';

// De cada sitio viaja un byte y, si hay algo que contar, lo suyo detrás. En la `foto`: quién lo
// lleva (3 bits), si está jugando el minijuego (LOCK) y, en los 4 de arriba, cómo está. En la cola
// del `yo` de quien lo lleva, solo cómo está
const LOCK = 8;
const ALIEN = 1; // de noche: los bolos o el portero son marcianos
const LIVE = 2; // hay algo que contar: detrás va lo suyo
const EXTRA = 4; // los bolos marcianos se ríen, o el portero marciano celebra una parada
const REACH = 45; // hasta aquí de un sitio se anda «por allí»
const CLAIM = 1.5; // lo que se espera a que el anfitrión dé un sitio que se ha pedido
const MAX = 7; // sitios en la sala: lo que cabe en 3 bits

// La bolera: los bolos de siempre o, de noche, los marcianos
class Lane {
  constructor(game, P) {
    this.game = game;
    this.x = P.pinX;
    this.z = P.pinZ;
    this.size = PINS;
    this.dirty = false;
  }

  get set() {
    return this.flags & ALIEN ? this.game.alienPins : this.game.pins;
  }

  // mini: el minijuego que está jugando el jugador de esta pantalla
  run(dt, p, time, mini, night) {
    const g = this.game;
    // De noche los bolos son marcianos, salvo que se esté jugando a los de siempre
    const martian = mini === 'alienbowl' || (mini !== 'bowling' && night);
    g.pins.show(!martian);
    g.alienPins.show(martian);
    g.pins.update(dt, p, mini === 'bowling');
    g.alienPins.update(dt, p, mini === 'alienbowl', time);
  }

  state() {
    const a = this.game.alienPins;
    return a.shown ? ALIEN | (a.live ? LIVE : 0) | (a.laugh > 0 ? EXTRA : 0) : this.game.pins.live ? LIVE : 0;
  }

  paint(dt, p, time) {
    const g = this.game;
    const martian = !!(this.flags & ALIEN);
    g.pins.show(!martian);
    g.alienPins.show(martian);
    if (this.flags & LIVE) {
      this.set.paint(dt, time, !!(this.flags & EXTRA));
      this.dirty = true;
    } else if (this.dirty) {
      this.set.reset();
      this.dirty = false;
    }
  }

  put(dv, o) {
    return this.set.put(dv, o);
  }

  get(a, oa, b, ob, k) {
    this.set.get(a, oa, b, ob, k);
  }

  touch(p, push) {
    return this.set.touch(p, push);
  }
}

// La pista: el balón y el portero
class Pitch {
  constructor(game, P) {
    this.game = game;
    this.x = P.cx;
    this.z = P.cz;
    this.size = BALL;
  }

  run(dt, p, time, mini, night) {
    const g = this.game;
    // De noche para el marciano, salvo que se esté jugando al de siempre
    g.ball.setAlien(mini === 'aliensoccer' || (mini !== 'soccer' && night));
    g.ball.update(dt, p, time, (side) => g.missions.goal(side));
  }

  state() {
    const b = this.game.ball;
    return (b.alien ? ALIEN : 0) | (b.live ? LIVE : 0) | (b.alien && b.cheer > 0 ? EXTRA : 0);
  }

  paint(dt, p, time) {
    const b = this.game.ball;
    b.setAlien(!!(this.flags & ALIEN));
    if (!(this.flags & LIVE)) b.home();
    b.paint(dt, p, time, !!(this.flags & EXTRA));
  }

  put(dv, o) {
    return this.game.ball.put(dv, o);
  }

  get(a, oa, b, ob, k) {
    this.game.ball.get(a, oa, b, ob, k);
  }

  touch(p, push) {
    return this.game.ball.touch(p, push);
  }
}

// Los sitios del pueblo donde se juega con algo que se mueve: la bolera y la pista. Jugando solo los
// lleva este juego. En red cada uno lo lleva un jugador: el que está jugando el minijuego o, si no
// juega nadie, el último que ha tocado los bolos o el balón. Su pantalla lo calcula y lo cuenta en
// la cola de su `yo`; las demás lo pintan. Quién lo lleva lo dice el anfitrión, en cada `foto`
export class Spots {
  constructor(game) {
    this.game = game;
    const P = game.world.places;
    this.list = [new Lane(game, P.bowling), new Pitch(game, P.soccer)];
    this.list.forEach((s, i) => (s.i = i));
    this.tick = 0;
    this.clear();
    // Invitado: lo que cuenta de los sitios que lleva, detrás de su estado. Nada si no lleva ninguno
    const list = this.list;
    const mask = () => (game.state === 'play' ? list.reduce((m, s) => m | (s.mine ? 1 << s.i : 0), 0) : 0);
    this.tail = {
      get bytes() {
        const m = mask();
        return m ? list.reduce((n, s) => n + ((m >> s.i) & 1 ? 1 + (s.flags & LIVE ? s.size : 0) : 0), 1) : 0;
      },
      write: (dv, o) => {
        const m = mask();
        dv.setUint8(o++, m);
        for (const s of list) {
          if (!((m >> s.i) & 1)) continue;
          dv.setUint8(o++, s.flags);
          if (s.flags & LIVE) o = s.put(dv, o);
        }
        return o;
      },
    };
  }

  // Al abrir una partida, todo es del anfitrión hasta que él diga otra cosa
  clear() {
    for (const s of this.list) {
      s.owner = 0; // el sitio en la sala de quien lo lleva
      s.lock = false; // está jugando el minijuego: nadie más lo toca
      s.mine = true; // lo calcula esta pantalla
      s.wait = 0; // se ha pedido y el anfitrión aún no lo ha dado
      s.fed = false; // ha llegado algo que pintar de quien lo lleva
      s.flags = s.state();
      s.raw = null; // anfitrión: lo último que ha contado de él el invitado que lo lleva
      s.at = 0;
      s.fresh = 0; // anfitrión: lo acaba de pedir quien lo lleva
    }
  }

  // ¿Lo calcula esta pantalla?
  own(s) {
    const party = this.game.party;
    return !party || party.session.slot < 0 || s.wait > 0 || party.isMe(s.owner);
  }

  update(dt, p, time) {
    const g = this.game;
    const party = g.party;
    const mini = g.missions.active && g.missions.def ? g.missions.def.id : null;
    const night = g.env.target > 0.5;
    for (const s of this.list) {
      if (s.wait > 0) {
        s.wait -= dt;
        // No se lo han dado: otro estaba jugando ahí
        if (s.wait <= 0 && !party?.isMe(s.owner) && mini && g.missions.def.spot === s.i) g.missions.bounce();
      }
      s.mine = this.own(s);
      if (!s.mine) {
        if (s.fed) s.paint(dt, p, time);
        // Si toca los bolos o el balón, desde ahora los lleva su pantalla, sin esperar al
        // anfitrión. Con otro jugando el minijuego, no: solo se aparta
        if (!s.touch(p, s.lock) || s.lock || g.busy(p)) continue;
        this.take(s, false);
        s.mine = this.own(s);
        if (!s.mine) continue;
      }
      s.run(dt, p, time, mini, night);
      s.flags = s.state();
    }
  }

  // El jugador de esta pantalla quiere un sitio: lo lleva ya, y el anfitrión dirá si se lo queda.
  // lock: para jugar su minijuego
  take(s, lock) {
    const party = this.game.party;
    if (!party || party.session.slot < 0) return;
    if (party.hosting) {
      this.grant(s, 0, lock ? 1 : 0);
      if (s.owner !== 0) s.wait = 0.001; // el anfitrión se entera a la primera de que no
    } else {
      s.wait = CLAIM;
      party.tell('sitio', [s.i, lock ? 1 : 0]);
    }
  }

  // Empieza y acaba un minijuego en ese sitio (ver game/missions.js)
  play(i) {
    this.take(this.list[i], true);
  }

  leave(i) {
    const party = this.game.party;
    if (party?.hosting) this.grant(this.list[i], 0, 2);
    else party?.tell('sitio', [i, 2]);
  }

  // El amigo que está jugando el minijuego de ese sitio, si lo hay
  player(i) {
    const party = this.game.party;
    const s = this.list[i];
    return party && s.lock && s.wait <= 0 && !party.isMe(s.owner) ? party.bySlot(s.owner) : null;
  }

  // Un gol de otro: se ve y se oye si pilla cerca
  scored() {
    const g = this.game;
    const b = g.ball.pos;
    const h = g.here(b.x, b.z);
    h.sfx.goal();
    h.confetti(b.x, b.y + 2, b.z);
    return h === g;
  }

  // ---------- Anfitrión: quién lleva cada sitio ----------
  give(s, slot) {
    if (s.owner === slot) return;
    s.owner = slot;
    s.raw = null;
    s.fed = false;
  }

  // Uno pide un sitio porque ha tocado lo que hay en él (0) o para jugar su minijuego (1), o dice
  // que ha acabado de jugarlo (2)
  grant(s, slot, mode) {
    if (mode === 2) {
      if (s.owner === slot) s.lock = false;
    } else if (!s.lock || s.owner === slot) {
      this.give(s, slot);
      if (mode === 1) s.lock = true;
      s.fresh = 1;
    }
  }

  asked(v, r) {
    const s = this.list[v[0]];
    if (s && r.slot <= MAX) this.grant(s, r.slot, v[1] | 0);
  }

  // Que cada sitio lo lleve alguien que ande por allí: si quien lo llevaba se ha ido lejos, al
  // menú o de la partida, pasa al que quede más cerca, y si no hay nadie, al anfitrión
  referee(dt) {
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.5;
    const g = this.game;
    const party = g.party;
    const out = (p) => !p || (p === g.player ? g.state !== 'play' : !p.seen || p.hidden);
    const far2 = (p, s) => (p.pos.x - s.x) ** 2 + (p.pos.z - s.z) ** 2;
    for (const s of this.list) {
      const cur = party.bySlot(s.owner);
      const gone = out(cur);
      // A quien lo acaba de pedir se le da un momento: aquí aún se le ve llegando
      s.fresh -= 0.5;
      if (!gone && (s.lock || s.fresh > 0 || far2(cur, s) < REACH * REACH)) continue;
      let best = null;
      let d = REACH * REACH;
      for (const p of [g.player, ...party.remotes.values()]) {
        if (out(p) || far2(p, s) >= d) continue;
        d = far2(p, s);
        best = p;
      }
      if (!best && !gone) continue;
      s.lock = false;
      this.give(s, best ? party.slotOf(best) : 0);
    }
  }

  // Dónde empieza un sitio en la cola de un `yo`, o -1 si no lo trae
  find(dv, i) {
    if (!dv || !dv.byteLength) return -1;
    const m = dv.getUint8(0);
    let o = 1;
    for (let j = 0; j <= i; j++) {
      if (!((m >> j) & 1)) continue;
      if (o >= dv.byteLength) return -1;
      const end = o + 1 + (dv.getUint8(o) & LIVE ? this.list[j].size : 0);
      if (end > dv.byteLength) return -1;
      if (j === i) return o;
      o = end;
    }
    return -1;
  }

  // Lo que cuenta un invitado de los sitios que lleva. last: la cola de su último `yo`, que es lo
  // que se reparte tal cual; w: las dos entre las que toca pintarlo aquí ({ a, b, k })
  from(slot, last, w) {
    for (const s of this.list) {
      if (s.owner !== slot) continue;
      s.at = this.find(last, s.i);
      s.raw = s.at < 0 ? null : last;
      if (!w) continue;
      let oa = this.find(w.a, s.i);
      let ob = this.find(w.b, s.i);
      if (oa < 0 && ob < 0) continue;
      let [a, b] = [w.a, w.b];
      // Si una de las dos no lo trae, o lo trae de otra manera, vale la otra
      if (oa < 0 || (ob >= 0 && (b.getUint8(ob) ^ a.getUint8(oa)) & (ALIEN | LIVE))) [a, oa] = [b, ob];
      if (ob < 0 || a === b) [b, ob] = [a, oa];
      s.flags = a.getUint8(oa) & 7;
      if (s.flags & LIVE) s.get(a, oa + 1, b, ob + 1, w.k);
      s.fed = true;
    }
  }

  // ---------- Lo que viaja en la `foto` ----------
  // Del sitio que lleva un invitado se reparte lo que él cuenta; del resto, lo que hay en esta pantalla
  told(s) {
    return s.raw ? s.raw.getUint8(s.at) & 7 : s.flags;
  }

  get bytes() {
    return this.list.reduce((n, s) => n + 1 + (this.told(s) & LIVE ? s.size : 0), 0);
  }

  write(dv, o) {
    for (const s of this.list) {
      const f = this.told(s);
      dv.setUint8(o++, (f << 4) | (s.lock ? LOCK : 0) | s.owner);
      if (!(f & LIVE)) continue;
      if (s.raw) for (let i = 0; i < s.size; i++) dv.setUint8(o++, s.raw.getUint8(s.at + 1 + i));
      else o = s.put(dv, o);
    }
    return o;
  }

  read(a, b, o, k) {
    const party = this.game.party;
    for (const s of this.list) {
      const h = a.getUint8(o);
      const f = h >> 4;
      const size = f & LIVE ? s.size : 0;
      s.owner = h & 7;
      s.lock = !!(h & LOCK);
      const me = party.isMe(s.owner);
      if (me) s.wait = 0;
      // Lo que lleva esta pantalla no se pinta con lo que vuelve del anfitrión
      else if (s.wait <= 0) {
        s.flags = f;
        if (size) s.get(a, o + 1, b.getUint8(o) >> 4 === f ? b : a, o + 1, k);
        s.fed = true;
      }
      o += 1 + size;
    }
    return o;
  }
}
