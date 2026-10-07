// Teclado, mando y controles táctiles unificados.
const MAP = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  trick: ['KeyF', 'KeyJ'],
  action: ['KeyE', 'Enter'],
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  night: ['KeyN'],
  mute: ['KeyM'],
  camera: ['KeyC'],
  color: ['KeyV'],
};
const PAD = { jump: 0, boost: 1, trick: 2, action: 3, pause: 9, camera: 8 };

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touch = { steer: 0, throttle: 0, jump: false, boost: false, trick: false };
    this.touchPressed = new Set();
    this.padPrev = {};
    this.state = this._blank();
    this.neutral = this._blank();
    this.isTouch = false;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _blank() {
    return { steer: 0, throttle: 0, boost: false, jumpPressed: false, trickPressed: false, upPressed: false, downPressed: false };
  }

  held(a) {
    return MAP[a].some((k) => this.keys.has(k));
  }

  hit(a) {
    return MAP[a].some((k) => this.pressed.has(k)) || this.touchPressed.has(a) || this._padHit === a || (this._padHits && this._padHits.has(a));
  }

  bindTouch(root) {
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#knob');
    let id = null;
    let ox = 0;
    let oy = 0;
    const move = (t) => {
      const dx = t.clientX - ox;
      const dy = t.clientY - oy;
      const m = Math.min(1, Math.hypot(dx, dy) / 52);
      const a = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(a) * m * 46}px, ${Math.sin(a) * m * 46}px)`;
      this.touch.steer = Math.abs(dx) > 8 ? Math.max(-1, Math.min(1, dx / 46)) : 0;
      this.touch.throttle = dy < -12 ? 1 : dy > 22 ? -1 : 0;
    };
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isTouch = true;
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      move(t);
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) move(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          id = null;
          this.touch.steer = 0;
          this.touch.throttle = 0;
          knob.style.transform = '';
        }
      }
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);
    root.querySelectorAll('[data-act]').forEach((b) => {
      const a = b.dataset.act;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isTouch = true;
        this.touchPressed.add(a);
        if (a in this.touch) this.touch[a] = true;
        b.classList.add('on');
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        if (a in this.touch) this.touch[a] = false;
        b.classList.remove('on');
      };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
    });
  }

  update() {
    const s = this.state;
    let steer = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let throttle = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0);
    let boost = this.held('boost');
    this._padHits = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.18) steer = ax;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.1 || lt > 0.1) throttle = rt - lt;
      if (p.buttons[PAD.boost] && p.buttons[PAD.boost].pressed) boost = true;
      this._padHits = new Set();
      for (const a in PAD) {
        const down = !!(p.buttons[PAD[a]] && p.buttons[PAD[a]].pressed);
        if (down && !this.padPrev[a]) this._padHits.add(a);
        this.padPrev[a] = down;
      }
      break;
    }
    if (this.touch.steer) steer = this.touch.steer;
    if (this.touch.throttle) throttle = this.touch.throttle;
    if (this.touch.boost) {
      boost = true;
      if (!throttle) throttle = 1;
    }
    s.steer = steer;
    s.throttle = throttle;
    s.boost = boost;
    s.jumpPressed = this.hit('jump');
    s.trickPressed = this.hit('trick');
    s.upPressed = this.hit('up');
    s.downPressed = this.hit('down');
    return s;
  }

  endFrame() {
    this.pressed.clear();
    this.touchPressed.clear();
    this._padHits = null;
  }
}
