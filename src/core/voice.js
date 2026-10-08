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
    this.base = `${import.meta.env.BASE_URL}voz/`;
    fetch(`${this.base}index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((keys) => (this.lines = new Set(keys)))
      .catch(() => {});
  }

  // urgent: los rótulos grandes cuentan lo que acaba de pasar y se cuelan delante de los avisos
  say(text, urgent = false) {
    const key = voiceKey(text);
    if (!this.lines.has(key) || !this.sfx.ctx || this.queue.includes(key)) return;
    if (urgent) this.queue.unshift(key);
    else this.queue.push(key);
    // Si se amontonan, se queda sin decir lo más viejo
    while (this.queue.length > 2) this.queue.splice(urgent ? 1 : 0, 1);
    this.next();
  }

  async next() {
    if (this.playing || !this.queue.length) return;
    this.playing = true;
    const key = this.queue.shift();
    try {
      const ctx = this.sfx.ctx;
      let buf = this.buffers.get(key);
      if (!buf) {
        const res = await fetch(`${this.base}${key}.mp3`);
        buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(key, buf);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfx.voiceBus);
      await new Promise((done) => {
        src.onended = done;
        src.start();
      });
    } catch (err) {
      // Una locución que no carga no para el juego
    }
    this.playing = false;
    this.next();
  }
}
