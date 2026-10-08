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
    // Las locuciones (core/voice.js) van por su cuenta: ni el modo foto ni la música las tapan
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.48;
    this.voiceBus.connect(this.master);
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
    this.eerie = false;
    this.eerieBus = ctx.createGain();
    this.eerieBus.gain.value = 0;
    this.eerieBus.connect(this.master);
    this._startMusic();
    this._startEerie();
    this._startDrums();
    this.jog = false;
    this.jogBus = ctx.createGain();
    this.jogBus.gain.value = 0;
    this.jogBus.connect(this.master);
    this._startJog();
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

  // El timbre del patinete eléctrico
  bell() {
    this.tone(1900, 0.22, 'triangle', 0.13);
    this.tone(2400, 0.3, 'triangle', 0.1, 0, 0.12);
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
    this.musicBus.gain.setTargetAtTime(on ? 0 : this._musicVol(), t, 0.03);
    this.drumBus.gain.setTargetAtTime(on ? 0 : this.drumVol * 0.85, t, 0.03);
    this.eerieBus.gain.setTargetAtTime(on ? 0 : this._eerieVol(), t, 0.03);
  }
  shutter() {
    this.noise(0.035, 0.5, 3200, 1.2, 'bandpass', 0, 0, this.master);
    this.noise(0.06, 0.4, 1400, 1, 'bandpass', 0.075, 0, this.master);
  }

  // ---------- Seguir a las mamás ----------
  // Calla el juego y pone la música del footing. Como en el modo foto, el reloj del audio sigue
  // andando aunque la partida esté en pausa.
  jogging(on) {
    if (!this.ctx || on === this.jog) return;
    this.jog = on;
    if (on) this.ctx.resume();
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(on ? 0 : 0.9, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this._musicVol(), t, 0.03);
    this.drumBus.gain.setTargetAtTime(on ? 0 : this.drumVol * 0.85, t, 0.03);
    this.eerieBus.gain.setTargetAtTime(this._eerieVol(), t, 0.03);
    this.jogBus.gain.setTargetAtTime(on ? 0.62 : 0, t, on ? 0.25 : 0.03);
  }

  // ---------- Marcianos ----------
  ufo(vol, tense) {
    if (!this.ctx) return;
    this.tense = tense;
    const t = this.ctx.currentTime;
    this.ufoL.g.gain.setTargetAtTime(vol * (tense ? 0.16 : 0.09), t, 0.12);
    this.ufoL.o.frequency.setTargetAtTime(tense ? 330 : 170, t, 0.15);
    this.ufoL.lfo.frequency.setTargetAtTime(tense ? 13 : 6, t, 0.15);
  }
  // Con los marcianos en Cobeña la musiquilla de día deja paso a la de la invasión
  invaded(on) {
    if (!this.ctx || on === this.eerie) return;
    this.eerie = on;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this._musicVol(), t, on ? 0.5 : 1.2);
    this.eerieBus.gain.setTargetAtTime(this._eerieVol(), t, on ? 1.2 : 0.5);
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
  // El platillo va a por un vecino
  sos() {
    [0, 0.16, 0.32].forEach((d) => this.tone(1180, 0.1, 'square', 0.06, 1, d));
    this.tone(700, 0.5, 'sine', 0.08, 1.6, 0.5);
  }
  // Salta la alarma de la plaza: se llevan la estatua
  heist() {
    for (let i = 0; i < 6; i++) this.tone(i % 2 ? 740 : 988, 0.2, 'square', 0.07, 1, i * 0.2);
    this.tone(147, 1.2, 'sawtooth', 0.08, 0.7, 0.1);
  }
  rescue() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.13, 1, i * 0.07));
    this.noise(0.25, 0.2, 2600, 1, 'bandpass', 0, 0.4);
  }
  // Objetos: recoger uno y el timbrazo que deja tontos a los marcianos
  pickup() {
    [988, 1319, 1976].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.13, 1, i * 0.06));
  }
  sonic() {
    [0, 0.09, 0.18, 0.27].forEach((d) => {
      this.tone(2100, 0.16, 'triangle', 0.16, 1, d);
      this.tone(2650, 0.2, 'triangle', 0.1, 1, d + 0.03);
    });
    this.tone(1300, 0.9, 'sine', 0.12, 0.35, 0.3);
    this.noise(0.6, 0.12, 5200, 3, 'bandpass', 0.3, 0.3);
  }
  // El gorro de aluminio cruje al ponérselo
  foil() {
    [0, 0.07, 0.13, 0.22].forEach((d, i) => this.noise(0.07, 0.16, 5200 + i * 700, 4, 'bandpass', d));
    this.tone(1568, 0.3, 'sine', 0.08, 1.5, 0.28);
  }
  rocket() {
    this.noise(1.1, 0.3, 420, 0.8, 'bandpass', 0, 6);
    this.tone(90, 1.0, 'sawtooth', 0.1, 4);
    this.tone(1400, 0.35, 'sine', 0.05, 0.3);
  }
  // Gravedad lunar: todo se vuelve ligero y sube flotando
  moon() {
    [392, 523, 659, 880].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.1, 1.5, i * 0.14));
    this.noise(1.2, 0.08, 900, 1.2, 'bandpass', 0, 4);
  }
  // Baba marciana: chof al pisarla y muelle al rebotar, más agudo a cada bote
  squelch(vol = 1) {
    this.noise(0.24, 0.3 * vol, 380, 2.5, 'bandpass', 0, 3);
    this.tone(210, 0.2, 'sine', 0.14 * vol, 0.45);
  }
  boing(n = 0) {
    this.tone(150 + n * 45, 0.42, 'sine', 0.3, 2.6);
    this.tone(300 + n * 90, 0.3, 'triangle', 0.1, 2.2, 0.03);
  }
  // Coscorrón al platillo: suena a cacerola
  ufoHit() {
    this.tone(260, 0.5, 'triangle', 0.3, 0.6);
    this.tone(784, 0.7, 'sine', 0.12, 0.97);
    this.tone(1175, 0.5, 'sine', 0.07, 0.97, 0.02);
    this.noise(0.08, 0.3, 2400, 1);
  }
  // La nave nodriza: llega con un trueno grave y su panza suena a campana gorda
  mothership() {
    this.tone(55, 2.8, 'sawtooth', 0.16, 0.6);
    this.tone(82, 2.8, 'sine', 0.22, 0.5, 0.1);
    this.noise(2.6, 0.22, 180, 0.7, 'lowpass', 0, 3);
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.5, 'square', 0.06, 0.94, 0.5 + i * 0.42));
  }
  bossHit() {
    this.tone(98, 0.9, 'triangle', 0.4, 0.5);
    this.tone(392, 1.1, 'sine', 0.14, 0.96);
    this.tone(587, 0.9, 'sine', 0.08, 0.96, 0.02);
    this.noise(0.14, 0.34, 1800, 1);
  }
  // Su escudo: zumba al levantarse, tintinea al chocar con él y se apaga con un suspiro
  shield(up) {
    this.tone(up ? 220 : 880, 0.5, 'sawtooth', 0.07, up ? 4 : 0.25);
    this.tone(up ? 330 : 1320, 0.5, 'sine', 0.08, up ? 4 : 0.25, 0.04);
  }
  shieldClang() {
    this.tone(1760, 0.3, 'sine', 0.1, 0.7);
    this.tone(2637, 0.22, 'triangle', 0.06, 0.8, 0.03);
    this.noise(0.1, 0.12, 6000, 3);
  }
  // Lluvia de meteoritos: el aviso, el silbido del que viene cayendo y el porrazo contra el suelo
  meteorAlarm() {
    for (let i = 0; i < 3; i++) this.tone(660, 0.22, 'square', 0.07, 1.5, i * 0.3);
    this.noise(2.4, 0.16, 140, 0.7, 'lowpass', 0, 2.2);
  }
  meteor(vol = 1) {
    this.tone(1900, 2.9, 'sine', 0.07 * vol, 0.16);
    this.noise(2.9, 0.12 * vol, 900, 1.2, 'bandpass', 0, 3);
  }
  meteorBoom(vol = 1) {
    this.noise(1.5, 0.6 * vol, 300, 0.6, 'lowpass', 0, 0.25);
    this.tone(58, 1.2, 'sine', 0.5 * vol, 0.45);
    this.tone(36, 1.5, 'sawtooth', 0.16 * vol, 0.6, 0.04);
    if (vol > 0.4) this.bricks(8);
  }
  // Bomba de baba que cae silbando
  bomb(vol = 1) {
    this.tone(1250, 1.1, 'sine', 0.06 * vol, 0.3);
  }
  // Tocada del todo: petardea, se tambalea... y revienta
  bossDown() {
    for (let i = 0; i < 6; i++) {
      this.noise(0.45, 0.3, 320 + i * 90, 0.8, 'lowpass', i * 0.5, 0.4);
      this.tone(118 - i * 9, 0.45, 'sawtooth', 0.12, 0.5, i * 0.5);
    }
  }
  bossBoom() {
    this.noise(1.8, 0.55, 260, 0.6, 'lowpass', 0, 0.3);
    this.tone(62, 1.5, 'sine', 0.5, 0.4);
    this.tone(40, 1.8, 'sawtooth', 0.18, 0.6, 0.05);
    this.bricks(12);
  }
  slurp() {
    this.tone(260, 0.24, 'sine', 0.14, 4.5);
    this.tone(1400, 0.08, 'triangle', 0.08, 1, 0.22);
  }
  moo() {
    this.tone(165, 0.3, 'sawtooth', 0.07, 0.85);
    this.tone(140, 0.7, 'sawtooth', 0.09, 0.7, 0.26);
  }

  // ---------- Nivel de búsqueda ----------
  // Las gallinas: cacareo tranquilo, el grito de la atropellada y el picotazo
  cluck(vol = 1) {
    if (vol < 0.05) return;
    this.tone(620, 0.05, 'square', 0.045 * vol, 1.5);
    this.tone(480, 0.09, 'square', 0.045 * vol, 0.7, 0.07);
  }
  squawk() {
    for (let i = 0; i < 4; i++) this.tone(700 + i * 130, 0.07, 'sawtooth', 0.07, 1.5, i * 0.06);
    this.tone(1250, 0.32, 'sawtooth', 0.08, 0.5, 0.24);
    this.noise(0.2, 0.08, 2600, 2, 'bandpass', 0.02);
  }
  peck() {
    this.tone(1500, 0.04, 'square', 0.08, 0.5);
    this.tone(520, 0.1, 'triangle', 0.1, 0.6, 0.03);
  }
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
    this.drumBus.gain.setTargetAtTime(this.jog ? 0 : vol * 0.85, t, 0.12);
    this.musicBus.gain.setTargetAtTime(this._musicVol(), t, 0.2);
    this.eerieBus.gain.setTargetAtTime(this._eerieVol(), t, 0.2);
  }

  _musicVol() {
    return this.eerie || this.jog ? 0 : 0.34 * (1 - this.drumVol * 0.9);
  }

  _eerieVol() {
    return this.eerie && !this.jog ? 0.3 * (1 - this.drumVol * 0.9) : 0;
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

  // Música del footing: una marimba saltarina en re mayor sobre un bajo que bota, palmas y
  // maracas, a 105 pulsos por minuto para que cada corchea caiga con una zancada
  _startJog() {
    const ctx = this.ctx;
    const step = 60 / 105 / 4;
    // Re, si menor, sol, la · re, si menor, mi menor, la
    const chords = [[50, 66, 69, 74], [47, 66, 71, 74], [43, 67, 71, 74], [45, 64, 69, 73], [50, 66, 69, 74], [47, 66, 71, 74], [52, 67, 71, 76], [45, 64, 69, 73]];
    // Una nota por corchea, ocho por compás
    const melody = [
      78, 81, 78, 74, 78, -1, 81, -1, 83, 81, 78, 74, 78, -1, 74, -1, 79, 83, 79, 74, 79, -1, 83, -1, 81, 79, 76, 73, 76, -1, 81, -1,
      78, 81, 86, 81, 78, -1, 81, -1, 83, 86, 83, 78, 83, -1, 78, -1, 79, 76, 79, 83, 79, -1, 76, -1, 81, 85, 88, 85, 81, 76, 73, -1,
    ];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let i = 0;
    let next = ctx.currentTime + 0.1;
    const play = (m, t, dur, type, vol, attack = 0.006) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = hz(m);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.jogBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const hit = (t, freq, dur, vol, type, q = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.jogBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    };
    const tick = () => {
      if (!this.jog || ctx.state !== 'running') {
        // Cada vez que se las sigue, la canción empieza por el principio
        next = ctx.currentTime + 0.12;
        i = 0;
        return;
      }
      while (next < ctx.currentTime + 0.25) {
        const s = i % 128;
        const b = s % 16;
        const ch = chords[s >> 4];
        const lap = Math.floor(i / 128);
        // Bajo que bota: fundamental en los pulsos y su octava a contratiempo
        if (b % 4 === 0) play(ch[0] - 12, next, step * 2.6, 'triangle', 0.3);
        if (b % 4 === 2) play(ch[0], next, step * 1.3, 'triangle', 0.16);
        // Acorde cortito a contratiempo, que es lo que da el trote
        if (b % 4 === 2) for (let k = 1; k < 4; k++) play(ch[k], next, step * 1.1, 'square', 0.014);
        // La vuelta de presentación va sin melodía los cuatro primeros compases
        const m = b % 2 === 0 ? melody[s >> 1] : -1;
        if (m > 0 && (lap > 0 || s >= 64)) {
          // Marimba: un golpe seco con su armónico. En las vueltas impares la dobla un silbido
          play(m, next, step * 2.4, 'sine', 0.19, 0.004);
          play(m + 12, next, step * 0.9, 'sine', 0.05, 0.003);
          if (lap % 2 === 1) play(m + 12, next, step * 1.9, 'triangle', 0.03, 0.03);
        }
        if (b % 8 === 0) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.setValueAtTime(130, next);
          o.frequency.exponentialRampToValueAtTime(48, next + 0.1);
          g.gain.setValueAtTime(0.38, next);
          g.gain.exponentialRampToValueAtTime(0.0001, next + 0.15);
          o.connect(g);
          g.connect(this.jogBus);
          o.start(next);
          o.stop(next + 0.18);
        }
        // Palmas en el 2 y el 4 (dos golpes muy juntos) y maracas en cada corchea
        if (b % 8 === 4) {
          hit(next, 1500, 0.07, 0.16, 'bandpass', 1.4);
          hit(next + 0.012, 1700, 0.09, 0.13, 'bandpass', 1.4);
        }
        if (b % 2 === 0) hit(next, 7500, b % 4 === 2 ? 0.05 : 0.03, b % 4 === 2 ? 0.06 : 0.035, 'highpass');
        next += step;
        i++;
      }
    };
    this.jogTimer = setInterval(tick, 80);
  }

  // Música de la invasión: bajo machacón que tropieza en el semitono, arpegio en menor,
  // theremín y una sirena que sube al final de la vuelta. Si el rayo te apunta, salta la alarma
  _startEerie() {
    const ctx = this.ctx;
    const step = 60 / 126 / 4;
    const roots = [50, 50, 53, 52, 50, 50, 46, 45];
    const arp = [12, 15, 19, 20, 19, 15, 12, 15];
    // Theremín: [paso, nota, pasos que dura]
    const lead = [[0, 69, 10], [12, 68, 4], [16, 69, 6], [24, 74, 8], [32, 77, 12], [46, 76, 2], [48, 76, 14], [64, 69, 10], [76, 68, 4], [80, 69, 6], [88, 74, 8], [96, 77, 8], [104, 78, 8], [112, 76, 8], [120, 73, 8]];
    const sparks = [86, 89, 93, 98];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let i = 0;
    let last = 69;
    let next = ctx.currentTime + 0.1;
    const play = (m, t, dur, type, vol, cut) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut;
      o.type = type;
      o.frequency.value = hz(m);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.eerieBus);
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
      g.connect(this.eerieBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    };
    // Tono que resbala de una frecuencia a otra: theremín (con vibrato), bombo y sirena
    const slide = (t, f0, f1, glide, dur, type, vol, vib) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + glide);
      if (vib) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 6;
        lg.gain.value = f1 * 0.014;
        lfo.connect(lg);
        lg.connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur + 0.02);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (vib ? 0.09 : 0.005));
      g.gain.setValueAtTime(vol, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.eerieBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const tick = () => {
      if (!this.eerie || ctx.state !== 'running') {
        // Cada invasión empieza por el principio
        i = 0;
        next = ctx.currentTime + 0.1;
        return;
      }
      while (next < ctx.currentTime + 0.25) {
        const s = i % 128;
        const bar = s >> 4;
        const b = s % 16;
        const root = roots[bar];
        // Bajo en semicorcheas que se va al semitono de arriba, como el tiburón
        const up = b === 6 || b === 14 ? 1 : 0;
        play(root + up, next, step * 0.95, 'sawtooth', b % 4 === 0 ? 0.26 : 0.15, 750);
        if (b % 4 === 0) play(root - 12, next, step * 2.4, 'triangle', 0.3, 400);
        if (b % 2 === 0) play(root + arp[b >> 1], next, step * 1.7, 'square', 0.06, 2000);
        // Trítono de metales a mitad y al final de la vuelta
        if (b === 0 && (bar === 3 || bar === 7)) {
          play(root + 12, next, step * 7, 'sawtooth', 0.09, 1100);
          play(root + 18, next, step * 7, 'sawtooth', 0.09, 1100);
        }
        // Los primeros compases van sin theremín, para que entre de sorpresa
        if (i >= 64) {
          for (const [at, m, len] of lead) {
            if (at !== s) continue;
            slide(next, hz(last), hz(m), 0.14, step * len, 'triangle', 0.17, true);
            last = m;
          }
        }
        if (b % 4 === 0) slide(next, 130, 44, 0.11, 0.2, 'sine', 0.55);
        if (b % 8 === 4) drum(next, 1700, 0.13, 0.22, 'bandpass');
        drum(next, 7500, 0.03, this.tense ? 0.1 : b % 4 === 2 ? 0.07 : 0.03, 'highpass');
        if (s === 112) slide(next, 220, 1760, step * 15, step * 16, 'sawtooth', 0.05);
        if (this.tense) play(root + 36 + (b & 1), next, step * 0.8, 'square', 0.045, 5000);
        else if (Math.random() < 0.05) play(sparks[(Math.random() * sparks.length) | 0], next, 0.5, 'sine', 0.04, 6000);
        next += step;
        i++;
      }
    };
    this.eerieTimer = setInterval(tick, 80);
  }
}
