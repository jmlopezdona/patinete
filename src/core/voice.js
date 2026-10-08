// Voces grabadas: los avisos y rótulos que tienen locución en public/voz/ suenan al salir en pantalla.
// Las locuciones se generan aparte (ver voces/README.md); sin ellas el juego sigue mudo, como siempre.

// La clave de una frase son sus palabras: sin emojis, etiquetas, mayúsculas ni puntuación
export function voiceKey(text) {
  const words = text.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class Voice {
  constructor(sfx) {
    this.sfx = sfx;
    this.lines = new Set();
    this.buffers = new Map();
    this.queue = [];
    this.playing = false;
    this.src = this.current = this.stale = null;
    this.base = `${import.meta.env.BASE_URL}voz/`;
    fetch(`${this.base}index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((keys) => (this.lines = new Set(keys)))
      .catch(() => {});
  }

  // urgent: los rótulos grandes cuentan lo que acaba de pasar y se cuelan delante de los avisos
  // now: calla lo que esté sonando y lo que espere, para quien va pasando de una frase a otra
  say(text, urgent = false, now = false) {
    const key = voiceKey(text);
    if (!this.lines.has(key) || !this.sfx.ctx) return;
    if (now) this.shut();
    if (this.queue.includes(key)) return;
    if (urgent) this.queue.unshift(key);
    else this.queue.push(key);
    // Si se amontonan, se queda sin decir lo más viejo
    while (this.queue.length > 2) this.queue.splice(urgent ? 1 : 0, 1);
    this.next();
  }

  // Calla lo que esté sonando y lo que espere
  shut() {
    this.queue.length = 0;
    this.stale = this.current;
    this.src?.stop();
  }

  async next() {
    if (this.playing || !this.queue.length) return;
    this.playing = true;
    const key = (this.current = this.queue.shift());
    try {
      const ctx = this.sfx.ctx;
      let buf = this.buffers.get(key);
      if (!buf) {
        const res = await fetch(`${this.base}${key}.mp3`);
        buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(key, buf);
      }
      // Si la han callado mientras cargaba, ya no se dice
      if (this.stale !== key) {
        const src = (this.src = ctx.createBufferSource());
        src.buffer = buf;
        src.connect(this.sfx.voiceBus);
        await new Promise((done) => {
          src.onended = done;
          src.start();
        });
      }
    } catch (err) {
      // Una locución que no carga no para el juego
    }
    this.src = this.current = this.stale = null;
    this.playing = false;
    this.next();
  }
}
