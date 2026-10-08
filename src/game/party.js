import { CHARACTERS, characterById } from './characters.js';
import { RemotePlayer, readState } from './remote-player.js';
import { echo, play, run, NEAR } from './fx.js';
import { createTransport } from '../net/transport.js';
import { Session } from '../net/session.js';
import { blankState, F } from '../net/protocol.js';
import { VERSION } from '../core/update.js';

// Con la pestaña tapada el navegador deja de dar fotogramas y frena los temporizadores de la
// página, pero no los de un worker: este solo marca el paso, y el juego se calcula al oírlo
const TICK = 'setInterval(() => postMessage(0), 16);';

export const WHY = {
  'no-room': 'No hay ninguna partida con ese código',
  taken: 'Ya hay una partida con ese código',
  broker: 'No se llega al servicio de salas: comprueba tu conexión y vuelve a probar',
  blocked: 'Tu red y la del anfitrión no dejan conectar directamente: prueba con wifi',
  version: 'El anfitrión juega con otra versión: actualiza el juego',
  full: 'La partida está llena',
  host: 'El anfitrión se ha ido: se acabó la partida',
};

// Lo que un jugador le pide o le cuenta al anfitrión de la invasión, y el sistema que lo atiende
// (`asked(k, v, r)`, solo en el anfitrión)
const ASKS = {
  culetazo: 'aliens', pisoton: 'aliens', pillado: 'aliens', visto: 'aliens', rayo: 'aliens', suelto: 'aliens', dentro: 'aliens', fuera: 'aliens', coscorron: 'aliens', rescate: 'aliens',
  panza: 'boss', ladron: 'heist', disfraz: 'disguise',
};
// Lo que el anfitrión cuenta a todos una sola vez, y el sistema que lo apunta (`heard(k, v)`)
const NEWS = { baba: 'slime', bomba: 'boss' };
// Los avisos que llevan una ristra de números en vez de uno
const LISTS = new Set(['lluvia', 'culetazo', 'baba', 'bomba', 'ladron', 'sitio']);

// La pandilla: la partida en red vista desde el juego. Cuenta a los demás dónde está el jugador
// local y pinta a los que llegan. El mundo es el mismo para todos: lo que se mueve solo lo lleva
// el anfitrión y cada jugador avisa de lo que hace
export class Party {
  constructor(game, code, hosting, kind, relay) {
    this.game = game;
    this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.hosting = hosting;
    this.remotes = new Map();
    this.blips = [];
    this.state = blankState();
    this.tmp = blankState();
    // Lo que se mueve solo y viaja en cada `foto`: el anfitrión lo escribe (`write(dv, o)`) y los
    // invitados lo leen entre dos fotos (`read(a, b, o, k)`), cada sistema su trozo y en este orden
    this.shared = [game.traffic, game.wanted, game.items, game.hens, game.aliens, game.boss, game.heist, game.disguise, game.spots];
    // Lo que ocupa cambia de una foto a otra: hay sistemas que solo viajan cuando tienen algo que
    // contar. Por eso delante va lo que ocupa cada uno, y dos fotos solo se mezclan si coinciden
    const shared = this.shared;
    this.world = {
      time: 0, night: 0,
      get bytes() {
        return shared.reduce((n, s) => n + s.bytes, shared.length);
      },
      write: (dv, o) => {
        let at = o + shared.length;
        shared.forEach((s, i) => {
          const end = s.write(dv, at);
          dv.setUint8(o + i, end - at);
          at = end;
        });
        return at;
      },
    };
    this.snap = { a: null, b: null, k: 0 };
    this.carry = { a: null, b: null, k: 0 };
    this.fed = false; // invitado: ya le llega del anfitrión lo que se mueve solo
    this.crew = [];
    this.el = document.getElementById('net');
    const p = game.player;
    this.char = p.char.id;
    this.color = p.colorIdx;
    const S = (this.session = new Session(createTransport(kind, relay), { v: VERSION, char: this.char, color: this.color }, CHARACTERS.map((c) => c.id)));
    S.onJoin = (pl, fresh) => {
      this.remotes.set(pl.slot, new RemotePlayer(game, pl));
      if (fresh) this.say(pl, 'ha entrado en la partida');
      // Al que entra, cómo está lo que no viaja en la `foto`
      S.tell(pl.slot, 'mundo', { props: game.props.broken(), meteors: game.meteors.dump(), slime: game.slime.dump(), peds: game.traffic.lags() });
    };
    S.onLeave = (pl) => {
      this.remotes.get(pl.slot)?.dispose();
      this.remotes.delete(pl.slot);
      if (!S.closed) this.say(pl, 'se ha ido');
    };
    S.onChange = (pl) => this.remotes.get(pl.slot)?.setLook(pl.char, pl.color);
    // El personaje que pedía ya lo lleva otro: el anfitrión dice con cuál me quedo
    S.onMe = (char) => game.setCharacter((this.char = char), true);
    S.onSync = () => {
      const go = S.started && !this.started && !this.hosting && this.connected;
      this.started = S.started;
      this.connected = true;
      this.label();
      game.refreshAway();
      game.lobby.refresh();
      // El anfitrión da la salida: quien esperaba en la sala sale a la calle con él
      if (go && game.state === 'menu') game.start();
    };
    S.onAviso = (pl, k, v) => {
      if (Array.isArray(v) !== LISTS.has(k)) return;
      const r = this.remotes.get(pl.slot);
      if (ASKS[k]) {
        if (this.hosting && r) game[ASKS[k]].asked(k, v, r);
      } else if (NEWS[k]) {
        if (pl.slot === 0) game[NEWS[k]].heard(k, v);
      } else if (k === 'boing') game.slime.wear(v);
      else if (k === 'rompe') game.props.hit(v, this.remotes.get(pl.slot));
      else if (k === 'atropella') game.traffic.knock(v, false);
      // El lío con el municipal es de toda la pandilla y lo lleva el anfitrión
      else if (k === 'multa' || k === 'zapatillazo') {
        if (this.hosting) k === 'multa' ? game.wanted.caught(!!v) : game.wanted.slapped();
        this.say(pl, k === 'multa' ? 'se ha llevado una multa 👮' : 'se ha llevado un zapatillazo 👵');
      } else if (this.hosting && k === 'lio') game.wanted.stir(Math.max(0, Math.min(5, v)), this.remotes.get(pl.slot));
      else if (this.hosting && k === 'salto') game.wanted.hopped(v);
      else if (this.hosting && k === 'coge') game.items.claim(v, this.remotes.get(pl.slot));
      else if (k === 'timbre') game.items.rang(this.remotes.get(pl.slot));
      else if (this.hosting && k === 'gallina') game.hens.rammed(v, this.remotes.get(pl.slot));
      // La lluvia de meteoritos la decide el anfitrión, y él da el meteorito del fondo a quien lo pide
      else if (k === 'lluvia' && pl.slot === 0 && Array.isArray(v)) game.meteors.rain(v);
      else if (k === 'cogido' && pl.slot === 0) game.meteors.collect(v);
      else if (this.hosting && k === 'meteorito') game.meteors.grant(v, this.remotes.get(pl.slot));
      else if (k === 'arregla' && pl.slot === 0) game.props.fix(v);
      // La bolera y la pista las lleva quien juega en ellas: el anfitrión dice quién
      else if (k === 'sitio') {
        if (this.hosting && r) game.spots.asked(v, r);
      } else if (k === 'gol' && game.spots.scored()) this.say(pl, v ? 'ha marcado un gol ⚽' : 'ha marcado en propia puerta 🙈');
      if (k !== 'noche' && k !== 'alba') return;
      if (this.hosting) game.env.target = k === 'noche' && v ? 1 : 0;
      if (k === 'noche') this.say(pl, v ? 'ha hecho de noche 🌙' : 'ha hecho de día ☀️');
    };
    S.onTell = (m) => {
      if (m.t === 'efecto') play(game, m.s, m.m, m.a);
      else {
        if (Array.isArray(m.props)) game.props.restore(m.props);
        if (m.meteors && typeof m.meteors === 'object') game.meteors.load(m.meteors);
        if (Array.isArray(m.slime)) game.slime.load(m.slime);
        if (Array.isArray(m.peds)) game.traffic.late(m.peds);
      }
    };
    // Lo que es para todos: aquí y, si se es el anfitrión, en las demás pantallas
    this.all = echo((s, m, a) => {
      run(game, s, m, a);
      S.tell(null, 'efecto', { s, m, a });
    });
    S.onEnd = (why) => game.closeParty(why);
    this.onHide = () => {
      this.keepGoing(document.hidden);
      if (!document.hidden) this.awake(); // el navegador lo suelta al tapar la pestaña
    };
    this.awake();
    this.onLeave = () => S.close();
    window.addEventListener('pagehide', this.onLeave);
    document.addEventListener('visibilitychange', this.onHide);
    this.label('conectando…');
    // Se cumple con el motivo si no se ha podido abrir o entrar, y sin nada si ha ido bien
    this.opened = (hosting ? S.host(this.code) : S.join(this.code)).then(() => {
      if (hosting) S.onSync();
    }, (e) => e.message || 'broker');
  }

  say(pl, what) {
    const ch = characterById(pl.char);
    this.game.hud.toast(`${ch.icon} <b>${ch.name}</b> ${what}`);
  }

  // La pastilla de arriba: la sala y quién está, cada uno con el icono de su personaje. Sale
  // apagado quien aún no ha salido a la calle o está a otra cosa
  label(text) {
    const g = this.game;
    const icon = (ch, off) => `<i${off ? ' class="off"' : ''}>${ch.icon}</i>`;
    const crew = () => icon(g.player.char, g.state !== 'play') + [...this.remotes.values()].map((r) => icon(r.char, !r.seen || r.hidden || r.busy)).join('');
    this.el.classList.remove('hidden');
    this.el.classList.toggle('wait', !!this.stalled);
    this.el.innerHTML = `👥 Sala ${this.code} · ${text ?? (this.stalled ? 'el anfitrión está en pausa…' : this.remotes.size ? crew() : this.hosting ? 'esperando a los demás' : 'entrando…')}`;
  }

  // Que no se apague la pantalla con la partida en marcha: un anfitrión dormido para a todos
  async awake() {
    try {
      this.lock = await navigator.wakeLock?.request('screen');
    } catch {
      /* el navegador no lo permite (batería baja, pestaña tapada): se sigue sin ello */
    }
    if (this.session.closed) this.lock?.release();
  }

  // ¿Lleva ya otro jugador ese personaje?
  taken(id) {
    for (const pl of this.session.players.values()) if (pl.char === id) return true;
    return false;
  }

  // Día o noche para todos. Manda el anfitrión: el invitado se lo pide y el cambio le vuelve con
  // la `foto`. quiet: amanece solo, sin que nadie lo haya pedido, y no se dice de quién ha sido
  night(on, quiet) {
    const S = this.session;
    if (this.hosting || S.slot < 0) this.game.env.target = on;
    S.aviso(quiet ? 'alba' : 'noche', on);
  }

  // Los jugadores que andan por la calle: `p` (el de esta pantalla) y los amigos
  crowd(p) {
    this.crew.length = 0;
    this.crew.push(p);
    for (const r of this.remotes.values()) if (r.seen && !r.hidden) this.crew.push(r);
    return this.crew;
  }

  // El sitio en la sala de un jugador, sea el de esta pantalla o un amigo, y al revés
  slotOf(p) {
    return p === this.game.player ? this.session.slot : p.slot;
  }

  isMe(slot) {
    return slot === this.session.slot;
  }

  // Algo que ha hecho el jugador local y cambia el mundo de todos
  tell(k, v) {
    this.session.aviso(k, v);
  }

  // Lo que se ve y se oye, para otro jugador: solo el anfitrión decide por los demás
  to(r) {
    if (!this.hosting) return null;
    return (r.fx ??= echo((s, m, a) => this.session.tell(r.slot, 'efecto', { s, m, a })));
  }

  // Y en un sitio: aquí si queda cerca (`near`) y en las pantallas de los que estén cerca de allí
  at(x, z, near) {
    if (!this.hosting) return null;
    return echo((s, m, a) => {
      if (near) run(this.game, s, m, a);
      for (const r of this.remotes.values()) if (r.seen && !r.hidden && (r.pos.x - x) ** 2 + (r.pos.z - z) ** 2 < NEAR * NEAR) this.session.tell(r.slot, 'efecto', { s, m, a });
    });
  }

  // Anfitrión: lo que ha hecho uno (`p`), contado a los demás
  news(p, what) {
    if (!this.hosting) return;
    const text = `${p.char.icon} <b>${p.char.name}</b> ${what}`;
    if (p !== this.game.player) this.game.hud.toast(text);
    for (const r of this.remotes.values()) if (r !== p) this.session.tell(r.slot, 'efecto', { s: 'hud', m: 'toast', a: [text] });
  }

  // El jugador que ocupa ese sitio de la sala: el de esta pantalla o un amigo
  bySlot(slot) {
    return this.isMe(slot) ? this.game.player : this.remotes.get(slot) || null;
  }

  // Anfitrión: todos a la calle
  start() {
    if (this.hosting && !this.session.started) this.session.start();
  }

  close() {
    this.session.close();
    this.keepGoing(false);
    this.lock?.release();
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    window.removeEventListener('pagehide', this.onLeave);
    document.removeEventListener('visibilitychange', this.onHide);
    this.el.classList.add('hidden');
  }

  // Tapada, la partida sigue sin pintarse: si no, el mundo se pararía para los demás
  keepGoing(on) {
    this.ticker?.terminate();
    this.ticker = null;
    if (!on || this.session.closed) return;
    this.ticker = new Worker(URL.createObjectURL(new Blob([TICK], { type: 'text/javascript' })));
    this.ticker.onmessage = () => this.game.loop(performance.now(), true);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const S = this.session;
    if (p.char.id !== this.char || p.colorIdx !== this.color) S.setMe((this.char = p.char.id), (this.color = p.colorIdx));
    const now = performance.now();
    const playing = g.state === 'play';
    // En la pausa el personaje se ve quieto; en el menú o en la sala todavía no ha salido a la calle
    const live = playing && !g.paused && !p.frozen && !p.held && p.crashT <= 0;
    readState(p, live ? g.input.state : g.input.neutral, this.state);
    if (!playing) this.state.flags |= F.HIDDEN;
    else if (g.paused || g.missions.active || document.hidden) this.state.flags |= F.BUSY;
    if (playing && !g.paused && g.input.state.jump) this.state.flags |= F.KEY;
    if (this.hosting) {
      this.world.time = g.time;
      this.world.night = g.env.target > 0.5 ? 1 : 0;
    } else {
      // El reloj se acerca al del anfitrión poco a poco, para que las animaciones no den saltos
      const T = S.worldTime(now);
      if (T !== null) {
        const d = T - g.time;
        g.shiftTime(Math.abs(d) > 0.25 ? d : d * Math.min(1, dt * 4));
        g.env.target = S.world.night;
      }
      const w = S.moving(now, this.snap);
      this.fed = !!w;
      if (this.fed) {
        // Dos fotos en las que algún sistema no ocupa lo mismo no llevan lo mismo: no se mezclan,
        // vale la más antigua
        const n = this.shared.length;
        let same = w.a.byteLength === w.b.byteLength;
        for (let i = 0; same && i < n; i++) same = w.a.getUint8(i) === w.b.getUint8(i);
        this.shared.reduce((o, s) => s.read(w.a, same ? w.b : w.a, o, w.k), n);
      }
    }
    S.update(now, this.state, this.world, this.hosting ? null : g.spots.tail);
    this.blips.length = 0;
    for (const [slot, r] of this.remotes) {
      const s = S.sample(S.players.get(slot), now, this.tmp);
      if (!s) continue;
      r.apply(s, dt);
      if (this.hosting) g.spots.from(slot, S.players.get(slot).tail, S.carried(S.players.get(slot), now, this.carry));
      if (r.hidden) continue;
      // En el minimapa, cada amigo con el icono de su personaje, también cuando queda lejos
      r.blip ??= { x: 0, z: 0, icon: '' };
      r.blip.x = s.x;
      r.blip.z = s.z;
      r.blip.icon = r.char.icon;
      this.blips.push(r.blip);
    }
    if (this.hosting) g.spots.referee(dt);
    // Dos segundos sin saber del anfitrión: se le ha dormido el móvil o se ha cortado la red
    this.stalled = !this.hosting && S.heard > 0 && now - S.heard > 2000;
    // La pastilla solo se repinta cuando cambia algo de lo que enseña
    let sig = `${this.stalled}${playing}${p.char.id}`;
    for (const r of this.remotes.values()) sig += `${r.char.id}${r.seen && !r.hidden && !r.busy}`;
    if (sig !== this.sig && this.connected) {
      this.sig = sig;
      this.label();
    }
  }
}
