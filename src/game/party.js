import { CHARACTERS, characterById } from './characters.js';
import { RemotePlayer, readState } from './remote-player.js';
import { createTransport } from '../net/transport.js';
import { Session } from '../net/session.js';
import { blankState } from '../net/protocol.js';
import { VERSION } from '../core/update.js';

// Con la pestaña tapada el navegador deja de dar fotogramas y frena los temporizadores de la
// página, pero no los de un worker: este solo marca el paso, y el juego se calcula al oírlo
const TICK = 'setInterval(() => postMessage(0), 16);';

const WHY = {
  'no-room': 'No hay ninguna partida con ese código',
  taken: 'Ya hay una partida con ese código',
  timeout: 'No se ha podido conectar: prueba con otra red',
  network: 'No se ha podido conectar: prueba con otra red',
  version: 'El anfitrión juega con otra versión: actualiza el juego',
  full: 'La partida está llena',
  host: 'El anfitrión se ha ido: se acabó la partida',
};

// La pandilla: la partida en red vista desde el juego. Cuenta a los demás dónde está el jugador
// local y pinta a los que llegan. El mundo (tráfico, marcianos, municipal) va todavía por libre
// en cada pantalla
export class Party {
  constructor(game, code, hosting, kind) {
    this.game = game;
    this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.hosting = hosting;
    this.remotes = new Map();
    this.blips = [];
    this.state = blankState();
    this.tmp = blankState();
    this.el = document.getElementById('net');
    const p = game.player;
    this.char = p.char.id;
    this.color = p.colorIdx;
    const S = (this.session = new Session(createTransport(kind), { v: VERSION, char: this.char, color: this.color }, CHARACTERS.length));
    S.onJoin = (pl, fresh) => {
      this.remotes.set(pl.slot, new RemotePlayer(game, pl));
      if (fresh) this.say(pl, 'ha entrado en la partida');
      this.label();
    };
    S.onLeave = (pl) => {
      this.remotes.get(pl.slot)?.dispose();
      this.remotes.delete(pl.slot);
      if (!S.closed) this.say(pl, 'se ha ido');
      this.label();
    };
    S.onChange = (pl) => this.remotes.get(pl.slot)?.setLook(pl.char, pl.color);
    S.onEnd = (why) => this.fail(why);
    window.addEventListener('pagehide', () => S.close());
    document.addEventListener('visibilitychange', () => this.keepGoing(document.hidden));
    this.label('conectando…');
    (hosting ? S.host(this.code) : S.join(this.code)).then(() => this.label(), (e) => this.fail(e.message));
  }

  say(pl, what) {
    const ch = characterById(pl.char);
    this.game.hud.toast(`${ch.icon} <b>${ch.name}</b> ${what}`);
  }

  label(text) {
    this.el.classList.remove('hidden', 'bad');
    this.el.textContent = `👥 Sala ${this.code} · ${text ?? (this.remotes.size ? `${this.remotes.size + 1} jugadores` : this.hosting ? 'esperando a los demás' : 'entrando…')}`;
  }

  fail(why) {
    this.error = why;
    this.label(WHY[why] || WHY.network);
    this.el.classList.add('bad');
    this.game.hud.toast(`👥 ${WHY[why] || WHY.network}`);
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
    // Fuera de la partida (menú, pausa) el personaje se ve quieto
    const live = g.state === 'play' && !g.paused && !p.frozen && !p.held && p.crashT <= 0;
    S.update(now, readState(p, live ? g.input.state : g.input.neutral, this.state));
    this.blips.length = 0;
    for (const [slot, r] of this.remotes) {
      const s = S.sample(S.players.get(slot), now, this.tmp);
      if (!s) continue;
      r.apply(s, dt);
      // En el minimapa, cada amigo con el icono de su personaje, también cuando queda lejos
      r.blip ??= { x: 0, z: 0, icon: '' };
      r.blip.x = s.x;
      r.blip.z = s.z;
      r.blip.icon = r.char.icon;
      this.blips.push(r.blip);
    }
  }
}
