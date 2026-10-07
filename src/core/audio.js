// Sonido 100 % sintetizado con WebAudio: efectos, rodadura y una musiquilla alegre.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.studN = 0;
    this.studT = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.34;
    this.musicBus.connect(this.master);
    // Ruido blanco reutilizable
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Bucles: rodadura, viento y grind
    this.roll = this._loop('lowpass', 300, 0.8);
    this.wind = this._loop('bandpass', 900, 0.6);
    this.grindL = this._loop('bandpass', 2600, 4);
    // Zumbido del platillo: un tono con vibrato que se acelera cuando te apunta el rayo
    const uo = ctx.createOscillator();
    uo.type = 'triangle';
    uo.frequency.value = 170;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = 36;
    lfo.connect(lg);
    lg.connect(uo.frequency);
    const ug = ctx.createGain();
    ug.gain.value = 0;
    uo.connect(ug);
    ug.connect(this.sfxBus);
    uo.start();
    lfo.start();
    this.ufoL = { o: uo, lfo, g: ug };
    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 0;
    this.drumBus.connect(this.master);
    this.drumVol = 0;
    this._startMusic();
    this._startDrums();
  }

  _loop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start();
    return { f, g };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // Estado continuo del patinete
  motion(speed, grounded, grinding) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, speed / 45);
    // Rodadura y viento van por debajo de la música, y parado no suena nada
    this.roll.g.gain.setTargetAtTime(grounded ? k * 0.06 : 0, t, 0.06);
    this.roll.f.frequency.setTargetAtTime(160 + k * 700, t, 0.08);
    this.wind.g.gain.setTargetAtTime(k * k * 0.027, t, 0.15);
    this.wind.f.frequency.setTargetAtTime(500 + k * 1500, t, 0.15);
    this.grindL.g.gain.setTargetAtTime(grinding ? 0.22 : 0, t, 0.03);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0, bus = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  noise(dur, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', delay = 0, slide = 0, bus = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.03);
  }

  stud(type = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.studT > 0.9) this.studN = 0;
    this.studT = now;
    const steps = [0, 2, 4, 7, 9, 12, 14, 16];
    const base = type === 2 ? 1320 : type === 1 ? 1100 : 990;
    const f = base * Math.pow(2, steps[this.studN % 8] / 12);
    this.studN++;
    this.tone(f, 0.12, 'triangle', 0.16);
    this.tone(f * 2, 0.18, 'sine', 0.08, 0, 0.03);
  }
  jump() {
    this.tone(260, 0.16, 'square', 0.07, 2.4);
    this.noise(0.1, 0.12, 900, 1);
  }
  land(power) {
    const k = Math.min(1, power / 28);
    this.tone(110, 0.16, 'sine', 0.2 + k * 0.3, 0.45);
    this.noise(0.12, 0.1 + k * 0.25, 500, 0.7, 'lowpass');
  }
  bump() {
    this.tone(90, 0.2, 'sine', 0.4, 0.5);
    this.noise(0.16, 0.3, 700, 0.8, 'lowpass');
  }
  crash() {
    this.noise(0.5, 0.5, 1200, 0.6, 'lowpass', 0, 0.2);
    this.tone(70, 0.4, 'sawtooth', 0.25, 0.4);
    this.bricks(10);
  }
  // Tintineo de ladrillos de plástico
  bricks(n = 6) {
    for (let i = 0; i < n; i++) {
      this.noise(0.035, 0.22, 1800 + Math.random() * 3200, 9, 'bandpass', i * 0.028 + Math.random() * 0.02);
    }
    this.tone(160, 0.1, 'triangle', 0.18, 0.6);
  }
  splash() {
    this.noise(0.7, 0.5, 1400, 0.5, 'lowpass', 0, 0.25);
    this.noise(0.4, 0.2, 3000, 1, 'highpass', 0.05);
  }
  whoosh() {
    this.noise(0.28, 0.2, 500, 1.2, 'bandpass', 0, 5);
  }
  boost() {
    this.noise(0.5, 0.22, 300, 1.2, 'bandpass', 0, 8);
    this.tone(180, 0.4, 'sawtooth', 0.06, 3);
  }
  grindStart() {
    this.noise(0.08, 0.3, 3000, 3);
  }
  grindStop() {}
  checkpoint() {
    this.tone(880, 0.1, 'square', 0.1);
    this.tone(1320, 0.2, 'square', 0.1, 0, 0.09);
  }
  countdown(go) {
    this.tone(go ? 1040 : 520, go ? 0.5 : 0.16, 'square', 0.14);
  }
  trick(mult = 1) {
    const b = 660 * Math.pow(2, Math.min(mult - 1, 6) / 12);
    this.tone(b, 0.09, 'square', 0.09);
    this.tone(b * 1.26, 0.09, 'square', 0.09, 0, 0.07);
    this.tone(b * 1.5, 0.2, 'square', 0.09, 0, 0.14);
  }
  fanfare() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, i === 6 ? 0.6 : 0.16, 'square', 0.12, 0, i * 0.11));
    [262, 330, 392].forEach((f) => this.tone(f, 0.9, 'triangle', 0.1, 0, 0.66));
  }
  fail() {
    [392, 370, 349, 262].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.09, 0, i * 0.2));
  }
  gold() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, 0, i * 0.08));
    this.tone(2093, 0.8, 'sine', 0.1, 0, 0.34);
  }
  honk() {
    this.tone(392, 0.22, 'square', 0.08);
    this.tone(494, 0.22, 'square', 0.08);
  }
  ouch() {
    this.tone(700, 0.18, 'triangle', 0.14, 0.5);
    this.tone(500, 0.12, 'triangle', 0.1, 1.4, 0.16);
  }
  kick() {
    this.tone(140, 0.14, 'sine', 0.4, 0.4);
    this.noise(0.06, 0.2, 2000, 1);
  }
  goal() {
    this.noise(1.2, 0.25, 1600, 0.4, 'bandpass');
    this.fanfare();
  }
  ui() {
    this.tone(880, 0.06, 'triangle', 0.1);
  }

  // ---------- Modo foto ----------
  // Calla el juego sin parar el reloj del audio, para que el obturador sí suene
  hush(on) {
    if (!this.ctx) return;
    if (on) this.ctx.resume();
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(on ? 0 : 0.9, t, 0.03);
    this.musicBus.gain.setTargetAtTime(on ? 0 : 0.34 * (1 - this.drumVol * 0.9), t, 0.03);
    this.drumBus.gain.setTargetAtTime(on ? 0 : this.drumVol * 0.85, t, 0.03);
  }
  shutter() {
    this.noise(0.035, 0.5, 3200, 1.2, 'bandpass', 0, 0, this.master);
    this.noise(0.06, 0.4, 1400, 1, 'bandpass', 0.075, 0, this.master);
  }

  // ---------- Marcianos ----------
  ufo(vol, tense) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ufoL.g.gain.setTargetAtTime(vol * (tense ? 0.16 : 0.09), t, 0.12);
    this.ufoL.o.frequency.setTargetAtTime(tense ? 330 : 170, t, 0.15);
    this.ufoL.lfo.frequency.setTargetAtTime(tense ? 13 : 6, t, 0.15);
  }
  invasion() {
    [220, 208, 196, 185, 175].forEach((f, i) => this.tone(f, 0.34, 'sawtooth', 0.1, 0.94, i * 0.26));
    this.tone(880, 1.4, 'sine', 0.08, 0.5, 0.1);
  }
  alienSpot() {
    this.tone(900, 0.08, 'square', 0.05, 1.6);
    this.tone(1350, 0.11, 'square', 0.05, 1.3, 0.08);
  }
  alienLand() {
    this.tone(520, 0.14, 'sine', 0.1, 0.4);
  }
  culetazo(turbo) {
    this.tone(turbo ? 110 : 140, 0.26, 'sine', 0.5, 3.4);
    this.noise(0.09, 0.32, 1700, 1);
    this.tone(1500, 0.42, 'triangle', 0.09, 0.3, 0.06);
    if (turbo) this.tone(2200, 0.5, 'sine', 0.06, 0.25, 0.1);
  }
  alienPop() {
    this.bricks(4);
    this.tone(480, 0.16, 'triangle', 0.1, 0.4);
  }
  zap() {
    this.tone(1300, 0.32, 'sawtooth', 0.12, 0.12);
    this.noise(0.28, 0.22, 3200, 2, 'bandpass', 0, 0.3);
    [660, 590, 520].forEach((f, i) => this.tone(f, 0.1, 'square', 0.06, 0.9, 0.36 + i * 0.11));
  }
  beamGrab() {
    this.tone(200, 0.7, 'sawtooth', 0.1, 4);
    this.tone(400, 0.7, 'sine', 0.1, 3, 0.05);
  }
  mash(k) {
    this.tone(500 + Math.min(1, k) * 700, 0.06, 'triangle', 0.1);
  }
  escape() {
    this.tone(520, 0.12, 'square', 0.09, 2);
    this.tone(1040, 0.26, 'square', 0.09, 1.5, 0.1);
  }
  abducted() {
    [300, 400, 533, 711, 948, 1264].forEach((f, i) => this.tone(f, 0.26, 'sine', 0.13, 1.5, i * 0.11));
  }

  // ---------- Nivel de búsqueda ----------
  wanted(stars) {
    for (let i = 0; i < stars; i++) this.tone(660 * Math.pow(2, i / 6), 0.1, 'square', 0.09, 0, i * 0.08);
    this.tone(110, 0.5, 'sawtooth', 0.07, 0.8);
  }
  // El pito del municipal
  whistle(vol = 1) {
    if (vol < 0.05) return;
    for (let i = 0; i < 9; i++) this.tone(i % 2 ? 2500 : 2250, 0.045, 'square', 0.06 * vol, 0, i * 0.04);
  }
  // Nino-nino del patinete oficial
  siren(vol = 1) {
    if (vol < 0.05) return;
    this.tone(740, 0.27, 'square', 0.04 * vol);
    this.tone(590, 0.27, 'square', 0.04 * vol, 0, 0.3);
  }
  fine() {
    this.tone(1568, 0.08, 'square', 0.09);
    this.tone(2093, 0.3, 'square', 0.09, 0, 0.08);
    [330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.08, 0, 0.42 + i * 0.18));
  }
  granny() {
    [196, 185, 196, 147].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.2, 'sawtooth', 0.12, 0, i * 0.2));
    this.tone(1200, 0.5, 'triangle', 0.07, 0.5, 0.75);
  }
  slipper() {
    this.tone(420, 0.4, 'triangle', 0.12, 2.4);
    this.noise(0.4, 0.14, 600, 1.4, 'bandpass', 0, 4);
  }
  slap() {
    this.noise(0.09, 0.6, 2600, 0.8, 'highpass');
    this.tone(170, 0.2, 'sine', 0.5, 0.4);
  }

  // ---------- Vecinos ----------
  bounce(vol = 1) {
    this.tone(170, 0.09, 'sine', 0.22 * vol, 0.5);
    this.noise(0.03, 0.08 * vol, 900, 1);
  }
  swish(vol = 1) {
    this.noise(0.22, 0.16 * vol, 4200, 1.5, 'bandpass', 0, 0.4);
  }
  clang(vol = 1) {
    this.tone(620, 0.16, 'square', 0.07 * vol, 0.9);
    this.tone(930, 0.2, 'triangle', 0.06 * vol, 0.95);
  }
  // Machaque: el golpe contra el aro, que se queda temblando
  dunk(vol = 1) {
    this.tone(95, 0.22, 'sine', 0.5 * vol, 0.5);
    this.noise(0.08, 0.3 * vol, 700, 0.9);
    this.tone(540, 0.34, 'square', 0.06 * vol, 0.92, 0.03);
    this.tone(810, 0.4, 'triangle', 0.05 * vol, 0.95, 0.03);
  }
  // El clic del móvil de Emma y el tintineo de la foto que le gusta
  selfie(vol = 1) {
    this.noise(0.03, 0.3 * vol, 3200, 1.2);
    this.noise(0.05, 0.22 * vol, 1500, 1, 'bandpass', 0.07);
    this.tone(1568, 0.14, 'sine', 0.07 * vol, 1.5, 0.12);
  }
  ole() {
    [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.1, 1.2, i * 0.07));
  }
  // Batería heavy: suena más cuanto más cerca estás (y tapa la musiquilla)
  drums(vol) {
    if (!this.ctx || Math.abs(vol - this.drumVol) < 0.01) return;
    this.drumVol = vol;
    const t = this.ctx.currentTime;
    this.drumBus.gain.setTargetAtTime(vol * 0.85, t, 0.12);
    this.musicBus.gain.setTargetAtTime(0.34 * (1 - vol * 0.9), t, 0.2);
  }

  _startDrums() {
    const ctx = this.ctx;
    const step = 60 / 168 / 4;
    let i = 0;
    let next = ctx.currentTime + 0.1;
    const hit = (t, freq, dur, vol, type) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.drumBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    };
    const thump = (t, f0, f1, dur, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.drumBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const tick = () => {
      if (this.drumVol < 0.01 || ctx.state !== 'running') {
        next = ctx.currentTime + 0.1;
        return;
      }
      while (next < ctx.currentTime + 0.25) {
        const b = i % 16;
        const bar = Math.floor(i / 16) % 4;
        if (bar === 3 && b >= 8) {
          // Redoble por los timbales para rematar la frase
          const f = [330, 330, 270, 270, 210, 210, 150, 150][b - 8];
          thump(next, f, f * 0.55, 0.16, 0.5);
          if (b % 2 === 0) thump(next, 150, 42, 0.11, 0.7);
        } else {
          if (b % 8 === 4) {
            hit(next, 1900, 0.14, 0.5, 'bandpass');
            thump(next, 220, 160, 0.08, 0.3);
          } else thump(next, 150, 42, 0.11, 0.75); // doble bombo sin descanso
          if (b % 2 === 0) hit(next, 8000, 0.04, 0.12, 'highpass');
        }
        if (b === 0 && bar === 0) hit(next, 5200, 0.9, 0.3, 'highpass');
        next += step;
        i++;
      }
    };
    this.drumTimer = setInterval(tick, 60);
  }

  // Música: secuenciador sencillo con bajo, arpegio y batería
  _startMusic() {
    const ctx = this.ctx;
    const step = 60 / 116 / 4;
    const chords = [
      [48, 52, 55, 60],
      [45, 52, 57, 60],
      [41, 53, 57, 60],
      [43, 50, 55, 59],
    ];
    const melody = [72, -1, 76, -1, 79, -1, 76, 79, 84, -1, 79, -1, 76, -1, 72, -1, 69, -1, 72, -1, 76, -1, 72, 76, 81, -1, 76, -1, 72, -1, 69, -1, 65, -1, 69, -1, 72, -1, 69, 72, 77, -1, 72, -1, 69, -1, 65, -1, 67, -1, 71, -1, 74, -1, 71, 74, 79, -1, 77, -1, 74, -1, 71, -1];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let i = 0;
    let next = ctx.currentTime + 0.1;
    const play = (m, t, dur, type, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = type === 'square' ? 1700 : 900;
      o.type = type;
      o.frequency.value = hz(m);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const drum = (t, freq, dur, vol, type) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    };
    const tick = () => {
      while (next < ctx.currentTime + 0.25) {
        const s = i % 64;
        const bar = Math.floor(s / 16);
        const ch = chords[bar];
        const b = s % 16;
        if (b % 4 === 0) play(ch[0] - 12, next, step * 3.4, 'triangle', 0.22);
        if (b % 4 === 2) play(ch[0], next, step * 1.6, 'triangle', 0.12);
        if (b % 2 === 1) play(ch[1 + ((b >> 1) % 3)] + 12, next, step * 1.5, 'square', 0.035);
        const phrase = Math.floor(i / 64) % 4;
        if (phrase !== 3 && melody[s] > 0) play(melody[s], next, step * 2.2, 'square', 0.05);
        if (b % 8 === 0) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.setValueAtTime(140, next);
          o.frequency.exponentialRampToValueAtTime(45, next + 0.12);
          g.gain.setValueAtTime(0.4, next);
          g.gain.exponentialRampToValueAtTime(0.0001, next + 0.16);
          o.connect(g);
          g.connect(this.musicBus);
          o.start(next);
          o.stop(next + 0.2);
        }
        if (b % 8 === 4) drum(next, 1800, 0.12, 0.16, 'bandpass');
        if (b % 2 === 0) drum(next, 7000, 0.03, 0.05, 'highpass');
        next += step;
        i++;
      }
    };
    this.musicTimer = setInterval(tick, 80);
  }
}
