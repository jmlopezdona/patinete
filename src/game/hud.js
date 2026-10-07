const $ = (id) => document.getElementById(id);

// Interfaz en pantalla (DOM sobre el canvas).
export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), studs: $('studs'), bricks: $('bricks'), stars: $('stars'), kmh: $('kmh'), boost: $('boostfill'), speedo: $('speedo'),
      prompt: $('prompt'), mission: $('mission'), mTitle: $('m-title'), mMain: $('m-main'), mSub: $('m-sub'), big: $('big'), toasts: $('toasts'),
      trick: $('trick'), results: $('results'), zone: $('zone'), studBox: $('studbox'),
      alienBox: $('alienbox'), aliens: $('aliens'), abduct: $('abduct'), abductFill: $('abductfill'), beam: $('beamwarn'),
    };
    this.lastBeam = 0;
    this.lastAbduct = null;
    this.shown = 0;
    this.targetStuds = 0;
    this.bigT = 0;
    this.trickT = 0;
    this.lastKmh = -1;
    this.lastMission = '';
  }

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  setStuds(n, instant = false) {
    this.targetStuds = n;
    if (instant) {
      this.shown = n;
      this.el.studs.textContent = n.toLocaleString('es-ES');
    } else {
      this.el.studBox.classList.remove('pop');
      void this.el.studBox.offsetWidth;
      this.el.studBox.classList.add('pop');
    }
  }
  setBricks(n, total) {
    this.el.bricks.textContent = `${n}/${total}`;
  }
  setStars(n, total) {
    this.el.stars.textContent = `${n}/${total}`;
  }

  // Contador de la invasión (null lo esconde)
  setAliens(n, total) {
    const b = this.el.alienBox;
    b.classList.toggle('hidden', n == null);
    if (n == null) return;
    this.el.aliens.textContent = `${n}/${total}`;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  }

  // Barra para soltarse del rayo abductor (null la esconde)
  abduct(k) {
    if (k === this.lastAbduct) return;
    this.lastAbduct = k;
    this.el.abduct.classList.toggle('hidden', k == null);
    if (k != null) this.el.abductFill.style.transform = `scaleX(${k.toFixed(3)})`;
  }

  // Aviso en los bordes de la pantalla cuando el rayo te está cogiendo
  beam(k) {
    k = Math.round(k * 20) / 20;
    if (k === this.lastBeam) return;
    this.lastBeam = k;
    this.el.beam.style.opacity = k;
  }

  prompt(html) {
    this.el.prompt.classList.toggle('hidden', !html);
    if (html) this.el.prompt.innerHTML = html;
  }

  mission(title, main = '', sub = '') {
    if (!title) {
      this.el.mission.classList.add('hidden');
      this.lastMission = '';
      return;
    }
    const key = title + main + sub;
    if (key === this.lastMission) return;
    this.lastMission = key;
    this.el.mission.classList.remove('hidden');
    this.el.mTitle.textContent = title;
    this.el.mMain.textContent = main;
    this.el.mSub.textContent = sub;
  }

  big(text, color = '#ffffff', dur = 1, small = false) {
    const b = this.el.big;
    b.textContent = text;
    b.style.color = color;
    b.className = small ? 'small' : '';
    void b.offsetWidth;
    b.classList.add('show');
    this.bigT = dur;
  }

  toast(text) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 4600);
    setTimeout(() => d.remove(), 5100);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  trick(name, points, mult) {
    const t = this.el.trick;
    t.innerHTML = `<span class="tn">${name}</span><span class="tp">+${points.toLocaleString('es-ES')}</span>${mult > 1 ? `<span class="tm">×${mult}</span>` : ''}`;
    t.className = '';
    void t.offsetWidth;
    t.classList.add('show');
    this.trickT = 2.4;
  }

  zone(name) {
    this.el.zone.textContent = name;
  }

  results(r) {
    const e = this.el.results;
    if (!r) {
      e.classList.add('hidden');
      return;
    }
    e.innerHTML = `
      <div class="card">
        <h2>${r.title}</h2>
        <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${i * 0.22}s">★</span>`).join('')}</div>
        <h3>${r.stars === 0 ? 'Inténtalo otra vez' : r.stars === 3 ? '¡Medalla de oro!' : r.stars === 2 ? '¡Medalla de plata!' : '¡Medalla de bronce!'}</h3>
        ${r.lines.map((l) => `<p>${l}</p>`).join('')}
        ${r.record ? '<p class="record">★ ¡Nuevo récord! ★</p>' : r.best ? `<p class="dim">Tu récord: ${r.best}</p>` : ''}
        ${r.reward ? `<p class="reward"><i class="coin"></i> +${r.reward.toLocaleString('es-ES')}</p>` : ''}
        <div class="hint"><kbd>E</kbd> Continuar</div>
      </div>`;
    e.classList.remove('hidden');
  }

  update(dt, kmh, boost, boosting) {
    if (this.shown !== this.targetStuds) {
      const d = this.targetStuds - this.shown;
      this.shown += Math.abs(d) < 3 ? d : Math.sign(d) * Math.ceil(Math.abs(d) * Math.min(1, dt * 9));
      this.el.studs.textContent = Math.round(this.shown).toLocaleString('es-ES');
    }
    const k = Math.round(kmh);
    if (k !== this.lastKmh) {
      this.lastKmh = k;
      this.el.kmh.textContent = k;
    }
    this.el.boost.style.transform = `scaleX(${boost.toFixed(3)})`;
    this.el.speedo.classList.toggle('boosting', boosting);
    if (this.bigT > 0) {
      this.bigT -= dt;
      if (this.bigT <= 0) this.el.big.classList.remove('show');
    }
    if (this.trickT > 0) {
      this.trickT -= dt;
      if (this.trickT <= 0) this.el.trick.classList.remove('show');
    }
  }
}
