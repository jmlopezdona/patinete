import * as THREE from 'three';
import { angDiff, clamp, damp } from '../core/rng.js';

const $ = (id) => document.getElementById(id);
const FILTERS = [
  { name: 'Normal', sat: 1.14, con: 1, tint: [1, 1, 1] },
  { name: 'Vivo', sat: 1.6, con: 1.1, tint: [1, 1, 1] },
  { name: 'Blanco y negro', sat: 0, con: 1.2, tint: [1, 1, 1] },
  { name: 'Sepia', sat: 0, con: 1.05, tint: [1.12, 0.97, 0.76] },
  { name: 'Retro', sat: 0.78, con: 0.9, tint: [1.07, 1, 0.86] },
];
const LOGO = [['C', '#e3000b'], ['O', '#ffcf00'], ['B', '#1591d8'], ['E', '#00a650'], ['Ñ', '#ff7a1a'], ['A', '#1591d8']];
const FOV = 50;
const BLUR = 1;
const VIG = 0.26;
const REACH = 70; // hasta dónde se aleja del personaje el punto al que mira la cámara
const FONT = 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

// Modo foto: la partida se congela y la cámara queda libre para encuadrar, retocar y guardar la imagen.
export class Photo {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.back = false;
    this.want = false;
    this.preview = false;
    this.home = new THREE.Vector3(); // el personaje: de él no se aleja mucho la cámara
    this.aim = new THREE.Vector3(); // punto al que se quiere mirar, y a su alrededor gira la cámara
    this.focus = new THREE.Vector3(); // el mismo, suavizado
    this.orbit = { yaw: 0, pitch: 0, dist: 12 };
    this.cur = { yaw: 0, pitch: 0, dist: 12 };
    this.start = { yaw: 0, pitch: 0, dist: 12 };
    this.fov = FOV;
    this.roll = 0;
    this.blur = BLUR;
    this.vig = VIG;
    this.filter = 0;
    this.showChar = true;
    this.logo = true;
    this.night = null;
    this.url = null;
    this.file = null;
    this.el = {
      root: $('photo'), pad: $('ph-pad'), zoom: $('ph-zoom'), roll: $('ph-roll'), blur: $('ph-blur'), vig: $('ph-vig'),
      filter: $('ph-filter'), night: $('ph-night'), char: $('ph-char'), logo: $('ph-logo'), flash: $('ph-flash'),
      preview: $('ph-preview'), img: $('ph-img'), save: $('ph-save'), share: $('ph-share'),
    };
    this.bind();
  }

  bind() {
    const E = this.el;
    // Tras tocar un control se le quita el foco, para que el teclado siga moviendo la cámara
    const slider = (el, set) => {
      el.addEventListener('input', () => set(+el.value));
      el.addEventListener('change', () => el.blur());
    };
    const button = (id, fn) => $(id).addEventListener('click', (e) => {
      e.currentTarget.blur();
      fn();
    });
    slider(E.zoom, (v) => (this.fov = 100 - v));
    slider(E.roll, (v) => (this.roll = (v * Math.PI) / 180));
    slider(E.blur, (v) => (this.blur = v));
    slider(E.vig, (v) => (this.vig = v));
    button('ph-filter', () => {
      this.filter = (this.filter + 1) % FILTERS.length;
      this.sync();
    });
    button('ph-night', () => this.game.env.toggle());
    button('ph-char', () => {
      this.showChar = !this.showChar;
      this.sync();
    });
    button('ph-logo', () => {
      this.logo = !this.logo;
      this.sync();
    });
    button('ph-shot', () => (this.want = true));
    button('ph-reset', () => this.reset());
    button('ph-hide', () => this.bare(true));
    button('ph-exit', () => this.close());
    button('ph-again', () => this.closePreview());
    button('ph-share', () => {
      navigator.share({ files: [this.file], title: 'Cobeña · Los Panacotas' }).catch(() => {});
    });

    // Arrastrar gira; con dos dedos (o el botón derecho) se acerca y se desplaza
    const pts = new Map();
    let moved = 0;
    const pad = E.pad;
    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId);
      if (!pts.size) moved = 0;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    pad.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (e.buttons & 2 || e.shiftKey) this.pan(dx, dy);
        else this.turn(dx, dy);
      } else if (pts.size === 2) {
        let o = null;
        for (const [id, q] of pts) if (id !== e.pointerId) o = q;
        const d0 = Math.hypot(p.x - o.x, p.y - o.y);
        const d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        if (d0 > 8 && d1 > 8) this.dolly(d0 / d1);
        this.pan(dx / 2, dy / 2);
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e) => {
      if (!pts.delete(e.pointerId)) return;
      // Con los controles escondidos, un toque los devuelve
      if (!pts.size && moved < 8) this.bare(false);
    };
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    pad.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dolly(Math.exp(clamp(e.deltaY, -240, 240) * 0.0015));
    }, { passive: false });
  }

  turn(dx, dy) {
    const o = this.orbit;
    o.yaw -= dx * 0.006;
    o.pitch = clamp(o.pitch + dy * 0.006, -0.9, 1.5);
  }

  dolly(k) {
    this.orbit.dist = clamp(this.orbit.dist * k, 2.5, 90);
  }

  // Desplaza el encuadre en el plano de la pantalla: la escena sigue al dedo
  pan(dx, dy) {
    const c = this.cur;
    const k = (2 * c.dist * Math.tan((this.fov * Math.PI) / 360)) / window.innerHeight;
    const sy = Math.sin(c.yaw);
    const cy = Math.cos(c.yaw);
    const sp = Math.sin(c.pitch);
    this.move((-cy * dx - sp * sy * dy) * k, Math.cos(c.pitch) * dy * k, (sy * dx - sp * cy * dy) * k);
  }

  move(x, y, z) {
    const a = this.aim;
    const h = this.home;
    a.x += x;
    a.z += z;
    const d = Math.hypot(a.x - h.x, a.z - h.z);
    if (d > REACH) {
      a.x = h.x + ((a.x - h.x) * REACH) / d;
      a.z = h.z + ((a.z - h.z) * REACH) / d;
    }
    a.y = clamp(a.y + y, this.game.terrain.height(a.x, a.z) + 0.3, h.y + 50);
  }

  bare(v) {
    this.el.root.classList.toggle('bare', v);
  }

  open() {
    const g = this.game;
    if (this.on || g.state !== 'play') return;
    this.on = true;
    this.back = g.paused; // si se entra desde la pausa, al salir se vuelve a ella
    g.paused = true;
    $('pause').classList.add('hidden');
    g.hud.show(false);
    g.sfx.hush(true);
    const c3 = g.camera3;
    const cam = c3.cam;
    const p = g.player;
    this.saved = { pos: cam.position.clone(), look: c3.look.clone(), fov: cam.fov, vis: p.model.visible };
    // Hecho pedazos no hay a quién enseñar; si solo parpadeaba, sale entero
    this.canShow = p.crashT > 0 ? p.model.visible : !p.hidden;
    // La cámara arranca donde estaba y se vuelve hacia el personaje
    this.home.set(p.root.position.x, p.root.position.y + 2.4, p.root.position.z);
    this.polar(this.cur, cam.position, c3.look);
    this.polar(this.start, cam.position, this.home);
    this.focus.copy(c3.look);
    this.fov = FOV;
    this.roll = 0;
    this.showChar = true;
    this.want = false;
    this.pose();
    this.sync();
    this.bare(false);
    this.el.root.classList.remove('hidden');
  }

  close() {
    if (!this.on) return;
    const g = this.game;
    this.closePreview();
    this.on = false;
    const c3 = g.camera3;
    c3.cam.position.copy(this.saved.pos);
    c3.look.copy(this.saved.look);
    c3.cam.fov = this.saved.fov;
    c3.cam.updateProjectionMatrix();
    c3.roll = 0;
    g.player.model.visible = this.saved.vis;
    g.env.head.visible = true;
    this.grade(FILTERS[0], VIG);
    g.applyQuality();
    this.el.root.classList.add('hidden');
    g.hud.show(true);
    g.sfx.hush(false);
    g.setPaused(this.back);
  }

  // Ángulos y distancia desde los que `from` mira a `to`
  polar(out, from, to) {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const dz = from.z - to.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    out.yaw = Math.atan2(dx, dz);
    out.pitch = Math.asin(clamp(dy / d, -1, 1));
    out.dist = clamp(d, 2.5, 90);
  }

  // Vuelve al encuadre de partida
  pose() {
    Object.assign(this.orbit, this.start);
    this.aim.copy(this.home);
  }

  reset() {
    this.pose();
    this.fov = FOV;
    this.roll = 0;
    this.blur = BLUR;
    this.vig = VIG;
    this.filter = 0;
    this.showChar = true;
    this.sync();
  }

  // Deja los controles como dicen los ajustes
  sync() {
    const E = this.el;
    E.zoom.value = 100 - this.fov;
    E.roll.value = Math.round((this.roll * 180) / Math.PI);
    E.blur.value = this.blur;
    E.vig.value = this.vig;
    E.filter.textContent = `Filtro: ${FILTERS[this.filter].name}`;
    E.char.classList.toggle('on', this.showChar);
    E.logo.classList.toggle('on', this.logo);
  }

  grade(f, vig) {
    const U = this.game.final.uniforms;
    U.uSat.value = f.sat;
    U.uContrast.value = f.con;
    U.uTint.value.fromArray(f.tint);
    U.uVig.value = vig;
  }

  update(dt) {
    const g = this.game;
    const I = g.input;
    const exit = I.hit('pause') || I.hit('photo');
    if (this.preview) {
      if (exit) this.closePreview();
      else if (I.hit('jump') || I.pressed.has('Enter')) {
        this.el.save.click();
        this.closePreview();
      }
      return;
    }
    if (exit) return this.close();
    if (I.hit('hide')) this.el.root.classList.toggle('bare');
    if (I.hit('reset')) this.reset();
    if (I.hit('night')) g.env.toggle();
    if (I.hit('jump') || I.pressed.has('Enter')) this.want = true;

    // Teclado: adelante/atrás y a los lados según mira la cámara, y arriba/abajo
    const c = this.cur;
    const o = this.orbit;
    const f = (I.held('up') ? 1 : 0) - (I.held('down') ? 1 : 0);
    const s = (I.held('right') ? 1 : 0) - (I.held('left') ? 1 : 0);
    const v = (I.held('rise') ? 1 : 0) - (I.held('sink') ? 1 : 0);
    if (f || s || v) {
      const k = (5 + c.dist * 0.5) * (I.held('boost') ? 3 : 1) * dt;
      const sy = Math.sin(c.yaw);
      const cy = Math.cos(c.yaw);
      this.move((cy * s - sy * f) * k, v * k, (-sy * s - cy * f) * k);
    }

    const a = 1 - Math.exp(-14 * dt);
    this.focus.lerp(this.aim, a);
    c.yaw += angDiff(c.yaw, o.yaw) * a;
    c.pitch += (o.pitch - c.pitch) * a;
    c.dist += (o.dist - c.dist) * a;
    const c3 = g.camera3;
    const cam = c3.cam;
    const cp = Math.cos(c.pitch);
    cam.position.set(this.focus.x + Math.sin(c.yaw) * cp * c.dist, this.focus.y + Math.sin(c.pitch) * c.dist, this.focus.z + Math.cos(c.yaw) * cp * c.dist);
    // Ni bajo tierra ni dentro de las casas: como mucho, encima
    const floor = g.terrain.height(cam.position.x, cam.position.z) + 0.5;
    if (cam.position.y < floor) cam.position.y = floor;
    c3.look.copy(this.focus);
    c3.roll = this.roll;
    cam.fov = damp(cam.fov, this.fov, 10, dt);
    cam.updateProjectionMatrix();

    g.player.model.visible = g.env.head.visible = this.canShow && this.showChar; // sin piloto tampoco hay faro
    this.grade(FILTERS[this.filter], this.vig);
    g.final.uniforms.uBlur.value = this.blur;
    const night = g.env.target > 0.5;
    if (night !== this.night) {
      this.night = night;
      this.el.night.classList.toggle('on', night);
    }
    if (this.want) this.shoot();
  }

  // Pinta la escena más grande que la pantalla, la copia y le pone el sello
  shoot() {
    const g = this.game;
    this.want = false;
    const base = g.renderer.getPixelRatio();
    const long = matchMedia('(pointer: coarse)').matches ? 1920 : 2560;
    const pr = clamp(long / Math.max(window.innerWidth, window.innerHeight), base, 3);
    const blur = g.final.uniforms.uBlur;
    const cv = document.createElement('canvas');
    try {
      g.resize(pr);
      blur.value = (this.blur * pr) / base; // el desenfoque se mide en píxeles
      g.render(0);
      cv.width = g.canvas.width;
      cv.height = g.canvas.height;
      const c = cv.getContext('2d');
      c.drawImage(g.canvas, 0, 0);
      if (this.logo) this.stamp(c, cv.width, cv.height);
    } finally {
      blur.value = this.blur;
      g.resize();
    }
    g.sfx.shutter();
    const fl = this.el.flash;
    fl.classList.remove('go');
    void fl.offsetWidth;
    fl.classList.add('go');
    this.el.preview.style.setProperty('--ar', cv.width / cv.height);
    cv.toBlob((blob) => blob && this.on && this.show(blob), 'image/jpeg', 0.92);
  }

  // Sello de la foto: el logo en una esquina y el nombre del sitio en la otra
  stamp(c, W, H) {
    const g = this.game;
    const u = Math.min(W, H) / 100;
    const m = u * 3.4;
    const s = u * 5;
    const gap = u * 0.7;
    const sub = u * 3.3;
    const y = H - m - sub - u * 1.3 - s;
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    LOGO.forEach(([ch, col], i) => {
      const x = m + i * (s + gap);
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      c.beginPath();
      c.roundRect(x, y + u * 0.6, s, s, u * 0.8);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(x + s * 0.22, y - u * 0.9, s * 0.56, u * 1.6, u * 0.4);
      c.roundRect(x, y, s, s, u * 0.8);
      c.fill();
      c.fillStyle = 'rgba(0, 0, 0, 0.2)';
      c.beginPath();
      c.roundRect(x, y + s * 0.86, s, s * 0.14, [0, 0, u * 0.8, u * 0.8]);
      c.fill();
      c.fillStyle = '#fff';
      c.font = `700 ${s * 0.7}px ${FONT}`;
      c.textAlign = 'center';
      c.fillText(ch, x + s / 2, y + s * 0.47);
    });
    const text = (t, x, size, color, align) => {
      c.font = `700 ${size}px ${FONT}`;
      c.textAlign = align;
      c.lineWidth = size * 0.26;
      c.strokeStyle = '#12202e';
      c.strokeText(t, x, H - m - size / 2);
      c.fillStyle = color;
      c.fillText(t, x, H - m - size / 2);
    };
    c.letterSpacing = `${sub * 0.2}px`;
    text('LOS PANACOTAS', m, sub, '#ffd23a', 'left');
    c.letterSpacing = '0px';
    text(g.zoneName(g.player.pos.x, g.player.pos.z), W - m, u * 3.6, '#fff', 'right');
  }

  show(blob) {
    const E = this.el;
    const d = new Date();
    const n = (v) => String(v).padStart(2, '0');
    const name = `cobena-${d.getFullYear()}${n(d.getMonth() + 1)}${n(d.getDate())}-${n(d.getHours())}${n(d.getMinutes())}${n(d.getSeconds())}.jpg`;
    this.shot = blob;
    this.file = new File([blob], name, { type: blob.type });
    this.url = URL.createObjectURL(blob);
    E.img.src = this.url;
    E.save.href = this.url;
    E.save.download = name;
    E.share.classList.toggle('hidden', !(navigator.canShare && navigator.canShare({ files: [this.file] })));
    E.preview.classList.remove('hidden');
    this.preview = true;
  }

  closePreview() {
    if (!this.preview) return;
    this.preview = false;
    this.el.preview.classList.add('hidden');
    // La descarga puede seguir en marcha: la dirección se suelta más tarde
    const url = this.url;
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
