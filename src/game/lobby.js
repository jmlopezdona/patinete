import { characterById } from './characters.js';
import { WHY } from './party.js';

// Sin vocales, para que no salgan palabras, ni letras que se confunden al dictarlas
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

// «Jugar con amigos»: el panel del menú para crear una partida en red o unirse a una, y la sala
// donde se espera a que el anfitrión dé la salida
export class Lobby {
  constructor(game) {
    this.game = game;
    this.error = null;
    const $ = (id) => document.getElementById(id);
    this.el = { panel: $('friends'), buttons: $('menu-buttons'), start: $('fr-start'), join: $('fr-join'), room: $('fr-room'), code: $('fr-code'), name: $('fr-name'), players: $('fr-players'), go: $('fr-go'), msg: $('fr-msg'), back: $('fr-back'), share: $('fr-share') };
    $('btn-friends').addEventListener('click', () => this.open());
    $('fr-create').addEventListener('click', () => this.create());
    $('fr-ask').addEventListener('click', () => this.ask());
    this.el.join.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.el.code.value.trim()) this.join(this.el.code.value);
    });
    this.el.go.addEventListener('click', () => {
      game.party.start();
      game.start();
    });
    this.el.share.addEventListener('click', () => this.share());
    this.el.back.addEventListener('click', () => (game.party ? game.closeParty() : this.asking ? this.open() : this.close()));
  }

  // Crear o unirse: el código no se pide hasta que se elige unirse
  open() {
    this.on = true;
    this.asking = false;
    this.error = null;
    this.refresh();
  }

  ask() {
    this.asking = true;
    this.error = null;
    this.refresh();
    this.el.code.focus();
  }

  close() {
    this.on = this.asking = false;
    this.error = null;
    this.refresh();
  }

  // Abre o entra, y si no se puede deja dicho por qué. Devuelve el motivo, o nada si ha ido bien
  async connect(code, hosting) {
    const party = this.game.openParty(code, hosting);
    const why = await party.opened;
    if (why && this.game.party === party) this.game.closeParty(why);
    if (!why) this.asking = false;
    return why;
  }

  // Si el código ya lo tiene otra partida, se prueba con otro
  async create() {
    for (let i = 0; i < 4; i++) if ((await this.connect(randomCode(), true)) !== 'taken') return;
  }

  join(code) {
    return this.connect(code, false);
  }

  link() {
    return `${location.origin}${location.pathname}?sala=${this.game.party.code}`;
  }

  async share() {
    const url = this.link();
    try {
      if (navigator.share) await navigator.share({ title: 'Cobeña', text: `¡Vente a patinar por Cobeña! Sala ${this.game.party.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        this.el.share.textContent = '✅ Enlace copiado';
        setTimeout(() => (this.el.share.textContent = '📤 Compartir enlace'), 2000);
      }
    } catch {
      /* compartir cancelado o portapapeles no disponible */
    }
  }

  // Pinta el panel según cómo esté la partida. La llaman el juego y la pandilla cada vez que algo cambia
  refresh() {
    const g = this.game;
    const party = g.party;
    const E = this.el;
    const on = this.on || !!party;
    E.panel.classList.toggle('hidden', !on);
    E.buttons.classList.toggle('hidden', on);
    E.start.classList.toggle('hidden', !!party || this.asking);
    E.join.classList.toggle('hidden', !!party || !this.asking);
    E.room.classList.toggle('hidden', !party);
    E.msg.textContent = this.error ? WHY[this.error] || WHY.broker : '';
    E.back.textContent = party ? '← Salir de la sala' : '← Volver';
    for (const b of document.querySelectorAll('.char-btn')) b.disabled = !!party && party.taken(b.dataset.id);
    if (!party) return;
    const S = party.session;
    E.name.textContent = party.code;
    const me = g.player.char;
    const chip = (ch, mine) => `<span${mine ? ' class="me"' : ''}><i>${ch.icon}</i>${ch.name}${mine ? ' (tú)' : ''}</span>`;
    E.players.innerHTML = chip(me, true) + [...S.players.values()].map((pl) => chip(characterById(pl.char), false)).join('');
    const ready = S.slot >= 0;
    E.go.disabled = !ready || (!party.hosting && !S.started);
    E.go.textContent = !ready ? 'Conectando…' : S.started ? '▶  Entrar' : party.hosting ? '▶  Empezar' : 'Esperando al anfitrión…';
  }
}
