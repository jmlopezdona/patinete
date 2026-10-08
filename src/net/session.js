// Sesión de una partida en red: quién está en la sala, quién manda y el ir y venir de estados.
// No sabe nada del juego: recibe el estado del jugador local ya relleno y devuelve el de los demás.
import { RATE_YO, RATE_FOTO, packYo, packFoto, unpack, newer, mixState } from './protocol.js';

// Los demás se pintan con este retraso, entre los dos últimos estados recibidos: es lo que evita
// los tirones cuando un paquete llega tarde
const DELAY = 100;
const KEEP = 12;
// Si el anfitrión deja de mandar, su reloj no se da por avanzado más que esto: el mundo se para con él
const AHEAD = 250;
// Lo que el anfitrión les dice a los invitados y la sesión entrega sin mirar
const TOLD = ['mundo', 'efecto', 'orden'];

export class Session {
  // me: { v, char, color }. chars: los personajes que hay; no se repiten, así que caben tantos como haya
  constructor(transport, me, chars) {
    this.tr = transport;
    this.me = me;
    this.chars = chars;
    this.started = false; // el anfitrión ya ha dado la salida
    this.hosting = false;
    this.slot = -1; // mi sitio en la sala: 0 es el anfitrión; -1, todavía fuera
    this.players = new Map(); // los demás, por sitio: { slot, char, color, peer, buf, off, seq, last }
    this.seq = 0;
    this.fotoSeq = -1;
    this.heard = 0;
    this.next = 0;
    this.world = null; // invitado: lo último que ha dicho el anfitrión del mundo: { t, time, night }
    this.worlds = []; // y sus últimas fotos, para pintar lo que se mueve solo entre dos de ellas
    this.sent = 0; // anfitrión: lo que ocupa la última foto enviada
    this.off = null; // y la diferencia entre su reloj y el mío
    // onMe: el anfitrión me ha puesto otro personaje. onSync: ha cambiado algo de la sala.
    // onAviso(pl, k, v): otro jugador ha hecho algo. onTell(m): el anfitrión dice algo (`TOLD`)
    this.onJoin = this.onLeave = this.onChange = this.onEnd = this.onMe = this.onSync = this.onAviso = this.onTell = () => {};
    transport.onData = (id, data) => (typeof data === 'string' ? this.text(id, data) : this.binary(id, data));
    transport.onClose = (id) => this.gone(id);
  }

  async host(code) {
    this.hosting = true;
    await this.tr.host(code);
    this.slot = 0;
  }

  async join(code) {
    this.hostId = await this.tr.join(code);
    this.hello();
  }

  // Cambio de personaje o de color con la partida empezada
  setMe(char, color) {
    this.me.char = char;
    this.me.color = color;
    if (this.slot < 0) return;
    if (this.hosting) this.roster();
    else this.hello();
  }

  // Anfitrión: da la salida. Quien entre después ya se encuentra la partida en marcha
  start() {
    this.started = true;
    this.roster();
  }

  // ¿Lleva ya alguien ese personaje? (sin contar a `except`)
  taken(char, except) {
    if (this.slot >= 0 && except !== this && this.me.char === char) return true;
    for (const pl of this.players.values()) if (pl !== except && pl.char === char) return true;
    return false;
  }

  hello() {
    this.tr.send(this.hostId, JSON.stringify({ t: 'hola', ...this.me }));
  }

  // Algo que ha hecho el jugador local y tienen que saber los demás (k: qué, v: un número o una ristra de ellos). Pasa
  // siempre por el anfitrión, que es quien lo reparte
  aviso(k, v) {
    if (this.slot < 0 || this.closed) return;
    if (this.hosting) this.relay(0, k, v);
    else this.tr.send(this.hostId, JSON.stringify({ t: 'aviso', k, v }));
  }

  relay(from, k, v) {
    const msg = JSON.stringify({ t: 'aviso', from, k, v });
    for (const pl of this.players.values()) if (pl.slot !== from) this.tr.send(pl.peer, msg);
  }

  // Anfitrión: le dice algo a un invitado, o a todos si no se dice a cuál. t: uno de `TOLD`
  tell(slot, t, body) {
    if (!this.hosting || this.closed) return;
    const msg = JSON.stringify({ ...body, t });
    for (const pl of this.players.values()) if (slot === null || pl.slot === slot) this.tr.send(pl.peer, msg);
  }

  close(why = this.hosting ? 'host' : 'bye') {
    if (this.closed) return;
    this.closed = true;
    const bye = JSON.stringify({ t: 'adios', why });
    if (this.hosting) for (const pl of this.players.values()) this.tr.send(pl.peer, bye);
    else if (this.hostId) this.tr.send(this.hostId, bye);
    this.tr.close();
  }

  byPeer(id) {
    for (const pl of this.players.values()) if (pl.peer === id) return pl;
    return null;
  }

  add(slot, char, color, peer, fresh) {
    const pl = { slot, char, color, peer, buf: [], off: null, seq: -1, last: null };
    this.players.set(slot, pl);
    this.onJoin(pl, fresh);
    return pl;
  }

  drop(pl) {
    this.players.delete(pl.slot);
    this.onLeave(pl);
  }

  // ---------- Canal fiable ----------
  text(id, data) {
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (this.hosting) {
      if (m.t === 'hola') this.greet(id, m);
      else if (m.t === 'aviso') this.told(this.byPeer(id), m, true);
      else if (m.t === 'adios') this.gone(id);
    } else if (id === this.hostId) {
      if (m.t === 'sala') this.sync(m);
      else if (m.t === 'aviso') this.told(this.players.get(m.from), m, false);
      else if (TOLD.includes(m.t)) this.onTell(m);
      else if (m.t === 'adios') this.end(m.why);
    }
  }

  told(pl, m, pass) {
    if (!pl) return;
    const k = String(m.k);
    const v = Array.isArray(m.v) ? m.v.slice(0, 64).map((n) => +n || 0) : +m.v || 0;
    this.onAviso(pl, k, v);
    if (pass) this.relay(pl.slot, k, v);
  }

  // Anfitrión: alguien entra, o uno que ya estaba cambia de personaje
  greet(id, m) {
    const known = this.byPeer(id);
    const char = String(m.char);
    if (known) {
      // Si el personaje que pide ya lo lleva otro, se queda con el que tenía: la sala que recibe se lo dice
      if (this.chars.includes(char) && !this.taken(char, known)) known.char = char;
      known.color = m.color | 0;
      this.onChange(known);
      this.roster();
      return;
    }
    let slot = 1;
    while (this.players.has(slot)) slot++;
    const free = this.chars.filter((c) => !this.taken(c));
    const why = m.v !== this.me.v ? 'version' : !free.length ? 'full' : null;
    if (why) {
      this.tr.send(id, JSON.stringify({ t: 'adios', why }));
      return;
    }
    this.add(slot, free.includes(char) ? char : free[0], m.color | 0, id, true);
    this.roster();
  }

  // Anfitrión: reparte a cada uno quién hay en la sala y cuál es su sitio
  roster() {
    const players = [{ slot: 0, char: this.me.char, color: this.me.color }];
    for (const pl of this.players.values()) players.push({ slot: pl.slot, char: pl.char, color: pl.color });
    for (const pl of this.players.values()) this.tr.send(pl.peer, JSON.stringify({ t: 'sala', you: pl.slot, on: this.started, players }));
    this.onSync();
  }

  // Invitado: la sala según el anfitrión
  sync(m) {
    const fresh = this.slot >= 0;
    this.slot = m.you;
    const seen = new Set();
    this.started = !!m.on;
    for (const e of m.players) {
      if (e.slot === m.you) {
        if (e.char !== this.me.char) this.onMe((this.me.char = e.char));
        continue;
      }
      seen.add(e.slot);
      const pl = this.players.get(e.slot);
      if (!pl) this.add(e.slot, e.char, e.color, this.hostId, fresh);
      else if (pl.char !== e.char || pl.color !== e.color) {
        pl.char = e.char;
        pl.color = e.color;
        this.onChange(pl);
      }
    }
    for (const pl of [...this.players.values()]) if (!seen.has(pl.slot)) this.drop(pl);
    this.onSync();
  }

  gone(id) {
    if (!this.hosting) {
      if (id === this.hostId) this.end('host');
      return;
    }
    const pl = this.byPeer(id);
    if (!pl) return;
    this.drop(pl);
    this.roster();
  }

  // Invitado: se acabó la partida (el anfitrión se ha ido o no nos deja entrar)
  end(why) {
    if (this.closed) return;
    this.closed = true;
    for (const pl of [...this.players.values()]) this.drop(pl);
    this.slot = -1;
    this.tr.close();
    this.onEnd(why);
  }

  // ---------- Canal sin garantías ----------
  binary(id, data) {
    const m = unpack(data);
    if (!m) return;
    const now = performance.now();
    if (m.type === 'yo' && this.hosting) {
      const pl = this.byPeer(id);
      if (pl && this.inOrder(pl, m.seq)) this.push(pl, m.t, m.state, now);
    } else if (m.type === 'foto' && id === this.hostId) {
      if (!this.inOrder(this, m.seq, 'fotoSeq')) return;
      this.heard = now; // la última vez que se supo del anfitrión
      this.off = this.lag(this.off, now - m.t);
      this.world = m;
      this.worlds.push(m);
      if (this.worlds.length > KEEP) this.worlds.shift();
      for (const e of m.players) {
        const pl = this.players.get(e.slot);
        if (pl) this.push(pl, m.t, e.state, now);
      }
    }
  }

  // Los paquetes pueden llegar desordenados: el que es más viejo que el último visto se tira
  inOrder(who, seq, key = 'seq') {
    if (who[key] >= 0 && !newer(seq, who[key])) return false;
    who[key] = seq;
    return true;
  }

  // Diferencia entre su reloj y el mío: manda el paquete que menos ha tardado, y se deja llevar
  // despacio por si los relojes se separan
  lag(off, d) {
    return off === null || d < off ? d : off + (d - off) * 0.02;
  }

  // Invitado: la hora del mundo ahora mismo según el anfitrión, o null si aún no ha dicho nada
  worldTime(now) {
    const w = this.world;
    return w ? w.time + Math.min(AHEAD, now - this.off - w.t) / 1000 : null;
  }

  // Invitado: las dos fotos entre las que cae el momento que toca pintar (con el mismo retraso
  // que los jugadores) y cuánto de cada una. Deja en `out` { a, b, k }, con lo que se mueve solo
  // de cada foto, o devuelve null si aún no ha llegado ninguna
  moving(now, out) {
    const B = this.worlds;
    if (!B.length) return null;
    const t = now - this.off - DELAY;
    let i = B.length - 1;
    while (i > 0 && B[i].t > t) i--;
    const b = B[i + 1];
    out.a = B[i].moving;
    out.b = b && t > B[i].t ? b.moving : out.a;
    out.k = out.b === out.a ? 0 : (t - B[i].t) / (b.t - B[i].t);
    return out;
  }

  push(pl, t, state, now) {
    pl.off = this.lag(pl.off, now - t);
    pl.last = state;
    pl.buf.push({ t, s: state });
    if (pl.buf.length > KEEP) pl.buf.shift();
  }

  // Estado de otro jugador para pintarlo ahora, o null si aún no ha llegado nada suyo
  sample(pl, now, out) {
    const B = pl.buf;
    if (!B.length) return null;
    const t = now - pl.off - DELAY;
    let i = B.length - 1;
    while (i > 0 && B[i].t > t) i--;
    const a = B[i];
    const b = B[i + 1];
    if (!b || t <= a.t) return Object.assign(out, a.s);
    return mixState(a.s, b.s, (t - a.t) / (b.t - a.t), out);
  }

  // Una vez por fotograma, con el estado del jugador local y, en el anfitrión, el del mundo
  // ({ time, night, bytes, write }). Los envíos llevan su propia cadencia
  update(now, state, world) {
    if (this.slot < 0 || this.closed || now < this.next) return;
    this.next = Math.max(now, this.next) + 1000 / (this.hosting ? RATE_FOTO : RATE_YO);
    this.seq = (this.seq + 1) & 0xffff;
    if (!this.hosting) {
      this.tr.send(this.hostId, packYo(this.seq, now, state));
      return;
    }
    // A cada invitado, el anfitrión y los demás invitados de los que ya se sabe algo
    const all = [{ slot: 0, state }];
    for (const pl of this.players.values()) if (pl.last) all.push({ slot: pl.slot, state: pl.last });
    for (const pl of this.players.values()) {
      const foto = packFoto(this.seq, now, world, all.filter((e) => e.slot !== pl.slot));
      this.sent = foto.byteLength;
      this.tr.send(pl.peer, foto);
    }
  }
}
