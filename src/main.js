import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { makeRng } from './core/rng.js';
import { Input } from './core/input.js';
import { setupInstall } from './core/install.js';
import { Sfx } from './core/audio.js';
import { BrickBatch } from './lego/batch.js';
import { Builder } from './lego/builder.js';
import { createBrickMaterial, plastic, plasticDouble, goldMetal, textTexture } from './lego/materials.js';
import { createScooter } from './lego/scooter.js';
import { Terrain } from './world/terrain.js';
import { buildTown, zoneAt, BOUNDS } from './world/cobena.js';
import { buildLandmarks } from './world/landmarks.js';
import { lift } from './world/relief.js';
import { Player } from './game/player.js';
import { CHARACTERS, characterById } from './game/characters.js';
import { ChaseCamera } from './game/camera.js';
import { Bits } from './game/bits.js';
import { Studs, STUD_VALUE } from './game/studs.js';
import { Props } from './game/props.js';
import { Traffic } from './game/traffic.js';
import { Pins, Ball } from './game/minigames.js';
import { Missions } from './game/missions.js';
import { Environment } from './game/env.js';
import { Hud } from './game/hud.js';
import { Minimap } from './game/minimap.js';
import { Aliens } from './game/aliens.js';
import { Folks } from './game/folks.js';
import { Wanted } from './game/wanted.js';
import { Photo } from './game/photo.js';

const SAVE_KEY = 'cobena-patinete-v1';
const QUALITY_NAMES = ['Bajos', 'Medios', 'Altos'];
const TIPS = [
  '💨 Mantén <b>Mayús</b> para usar el turbo. Se recarga con studs y trucos.',
  '🗺️ Los iconos del minimapa son minijuegos: acércate y pulsa <b>E</b>.',
  '👽 Dicen que de noche pasan cosas muy raras en Cobeña… pulsa <b>N</b> si te atreves.',
  '🧱 Embiste bancos, papeleras y buzones: sueltan studs. Eso sí: si te pasas rompiendo, sale el <b>policía municipal</b>.',
  '🛹 En el aire: <b>A</b>/<b>D</b> giran, <b>F</b> hace el truco de tu personaje y <b>S</b> un backflip.',
  '🛹 El <b>skatepark</b> está al final de la calle Río Júcar, junto a la rotonda.',
  '🚀 Detrás del skatepark, en el campo, te espera el <b>Mega Salto</b> sobre la charca.',
  '⛲ Sube hasta la <b>Plaza de la Villa</b>: allí están la fuente, la iglesia y el ayuntamiento.',
  '🤹 Busca a los vecinos en el minimapa: <b>Yago</b> en el skatepark, <b>Jose</b> en la canasta, las corredoras del parque y <b>Adrián</b>, el batería de la calle Libertad.',
  '🌙 Pulsa <b>N</b> para cambiar entre día y noche, y <b>V</b> para pintar tu vehículo.',
  '🧑‍🤝‍🧑 En la pausa puedes cambiar de <b>personaje</b>: patinete, monopatín, monociclo o bici.',
  '📷 Pulsa <b>T</b> en pleno salto: el <b>modo foto</b> para el tiempo y te deja mover la cámara para sacar la foto.',
];
const params = new URLSearchParams(location.search);

// Pasada final: efecto maqueta (desenfoque en los bordes), viñeta y un poco de saturación.
// El modo foto mueve la saturación, el contraste, el tinte y la viñeta para sus filtros.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uBlur: { value: 1 },
    uSat: { value: 1.14 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: 0.26 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uBlur; varying vec2 vUv;
    uniform float uSat; uniform float uContrast; uniform vec3 uTint; uniform float uVig;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float d = abs(vUv.y - 0.44);
      float r = smoothstep(0.3, 0.58, d) * 2.2 * uBlur;
      if (r > 0.05) {
        vec2 px = r / uRes;
        vec3 s = c * 2.0;
        s += texture2D(tDiffuse, vUv + px * vec2(1.0, 0.0)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(-1.0, 0.0)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(0.0, 1.0)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(0.0, -1.0)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(0.7, 0.7)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(-0.7, 0.7)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(0.7, -0.7)).rgb;
        s += texture2D(tDiffuse, vUv + px * vec2(-0.7, -0.7)).rgb;
        c = s / 10.0;
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0) * uTint;
      vec2 q = vUv - 0.5;
      c *= mix(1.0 - uVig, 1.0, smoothstep(0.82, 0.32, length(q * vec2(1.0, 0.86))));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.state = 'menu';
    this.paused = false;
    this.time = 0;
    this.tmpV = new THREE.Vector3();
    this.lifted = [];
    this.rng = makeRng(20261007);
    this.save = this.loadSave();
    this.input = new Input();
    this.sfx = new Sfx();
    this.sfx.muted = !!this.save.muted;
    this.hud = new Hud();
    this.combo = 0;
    this.lastTrick = -99;
    this.fx = 0;
    this.frame = 0;
    this.perf = { t: 0, n: 0 };
    this.tipT = 9;
    this.tipI = 0;
    this.autoQuality = !params.has('q');
    this.quality = params.has('q') ? +params.get('q') : this.save.quality ?? 2;
  }

  loadSave() {
    const def = { studs: 0, bricks: [], stars: {}, best: {}, colors: {}, character: 'josemanuel', muted: false, aliens: 0, invasions: 0 };
    try {
      return { ...def, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
    } catch {
      return def;
    }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  async init() {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' }));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    try {
      await Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* se usa la fuente de reserva */
    }

    this.buildWorld();

    this.bits = new Bits(scene, 720);
    this.player = new Player(this);
    scene.add(this.player.root);
    const sp = this.home.spawn;
    this.player.place(sp.x, sp.z, sp.heading);
    this.camera3 = new ChaseCamera(this);
    this.studs = new Studs(this, this.world.studs, this.world.bricks);
    this.props = new Props(this, this.world.props);
    this.traffic = new Traffic(this, this.world.pedPaths);
    this.traffic.addStatic(this.world.spectators);
    this.pins = new Pins(this, this.world.places.bowling);
    this.ball = new Ball(this, this.world.places.soccer);
    this.missions = new Missions(this);
    this.env = new Environment(this, this.world.lamps);
    this.aliens = new Aliens(this);
    this.folks = new Folks(this);
    this.wanted = new Wanted(this);
    this.photo = new Photo(this);
    this.blips = [];
    this.minimap = new Minimap(document.getElementById('minimap'), this.world);
    this.markers = [...this.missions.defs, ...this.folks.markers];

    this.setupComposer();
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindUi();
    this.setCharacter(this.save.character, true);
    this.refreshHud(true);
    if (params.has('night')) {
      this.env.night = this.env.target = 1;
      this.env.apply();
    }

    this.last = performance.now();
    renderer.setAnimationLoop((t) => this.loop(t));
    const btn = document.getElementById('btn-play');
    btn.disabled = false;
    btn.textContent = this.save.studs > 0 ? '▶  Continuar' : '▶  Jugar';
    if (params.has('autostart')) this.start();
  }

  buildWorld() {
    const W = (this.world = {
      batch: new BrickBatch(), geo: new Builder(), terrain: new Terrain(), rng: this.rng,
      signs: [], props: [], lamps: [], doors: [], studs: [], bricks: [], pedPaths: [], extras: [], spectators: [], splash: [],
      places: { hoops: [] }, map: { blocks: [], buildings: [], circles: [], pitches: [] },
    });
    this.terrain = W.terrain;
    W.batch.lift = W.geo.lift = lift;
    buildTown(W);
    buildLandmarks(W);
    // El pueblo ya se construye sobre el relieve: no hay que subirlo al pintar
    const town = new THREE.Group();
    town.userData.fixed = true;
    this.scene.add(town);
    town.add(W.ground.build());
    this.brickMat = createBrickMaterial();
    const studMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    town.add(W.batch.build(this.brickMat, studMat));
    town.add(W.geo.mesh(plasticDouble));
    // Carteles
    for (const s of W.signs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: textTexture(s.text, { bg: s.bg, fg: s.fg, w: 512, h: Math.round((512 * s.h) / s.w) }) }));
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rot;
      town.add(m);
    }
    // Estatua dorada del patinete en la plaza
    for (const e of W.extras) {
      if (e.kind !== 'statue') continue;
      const st = createScooter();
      st.group.traverse((o) => {
        if (o.isMesh) {
          o.material = goldMetal;
          o.castShadow = true;
        }
      });
      st.group.scale.setScalar(2.1);
      st.group.position.set(e.x, e.y, e.z);
      this.scene.add(st.group);
      this.statue = st.group;
    }
  }

  setupComposer() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera3.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.55, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.env.apply();
  }

  applyQuality() {
    const q = this.quality;
    const sun = this.env.sun;
    sun.castShadow = q > 0;
    const size = q === 2 ? 4096 : 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    this.final.uniforms.uBlur.value = q === 2 ? 1 : 0;
    document.getElementById('p-quality').textContent = `Gráficos: ${QUALITY_NAMES[q]}`;
    this.resize();
  }

  // `scale` fuerza la densidad de píxeles: el modo foto la sube para sacar la imagen más grande que la pantalla
  resize(scale) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const pr = scale || (this.quality === 2 ? Math.min(dpr, 2) : this.quality === 1 ? Math.min(dpr, 1.25) : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w * pr, h * pr);
    this.camera3.cam.aspect = w / h;
    this.camera3.cam.updateProjectionMatrix();
  }

  bindUi() {
    const $ = (id) => document.getElementById(id);
    $('btn-play').addEventListener('click', () => this.start());
    $('btn-reset').addEventListener('click', () => {
      if (confirm('¿Borrar todo el progreso guardado?')) {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
      }
    });
    $('p-resume').addEventListener('click', () => this.setPaused(false));
    $('p-abort').addEventListener('click', () => {
      this.missions.abort();
      this.setPaused(false);
    });
    $('p-night').addEventListener('click', () => this.env.toggle());
    $('p-photo').addEventListener('click', () => this.photo.open());
    // Selector de personaje: tarjetas en el menú y botón que va rotando en la pausa
    const box = $('chars');
    for (const ch of CHARACTERS) {
      const b = document.createElement('button');
      b.className = 'char-btn';
      b.dataset.id = ch.id;
      b.innerHTML = `<i>${ch.icon}</i><b>${ch.name}</b><small>${ch.vehicle}</small>`;
      b.addEventListener('click', () => this.setCharacter(ch.id));
      box.appendChild(b);
    }
    $('p-char').addEventListener('click', () => {
      const i = CHARACTERS.indexOf(this.player.char);
      this.setCharacter(CHARACTERS[(i + 1) % CHARACTERS.length].id);
    });
    $('p-quality').addEventListener('click', () => {
      this.quality = (this.quality + 2) % 3;
      this.autoQuality = false;
      this.save.quality = this.quality;
      this.saveGame();
      this.applyQuality();
    });
    $('p-sound').addEventListener('click', () => this.toggleMute());
    $('p-respawn').addEventListener('click', () => {
      this.goHome();
      this.setPaused(false);
    });
    $('p-menu').addEventListener('click', () => {
      this.missions.abort();
      this.setPaused(false);
      this.sfx.ufo(0, false);
      this.sfx.drums(0);
      this.wanted.reset(true);
      this.state = 'menu';
      this.hud.show(false);
      $('menu').classList.remove('out');
    });
    this.input.bindTouch(document.getElementById('touch'));
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play' && !this.photo.on) this.setPaused(true);
    });
    $('p-sound').textContent = `Sonido: ${this.sfx.muted ? 'No' : 'Sí'}`;
    setupInstall($('btn-install'), $('install-hint'));
  }

  // La casa del personaje que se lleva, con su punto de salida a la calle
  get home() {
    return this.world.places.homes[this.player.char.id];
  }

  // Deja al jugador en la puerta de su casa, sin misión ni perseguidores
  goHome() {
    this.missions.abort();
    this.aliens.release(this.player);
    this.wanted.reset(true);
    const sp = this.home.spawn;
    this.player.place(sp.x, sp.z, sp.heading);
    this.camera3.snap = true;
  }

  // Elige quién sale a la calle: cambia piloto y vehículo, y su doble desaparece del pueblo
  setCharacter(id, silent = false) {
    const ch = characterById(id);
    const swap = ch !== this.player.char;
    this.player.setCharacter(ch.id, this.save.colors[ch.id]);
    this.minimap.home = this.home;
    // Elegido en el menú, cada uno empieza en su casa; en la pausa se cambia sobre la marcha
    if (swap && this.state === 'menu') this.goHome();
    this.folks.setPlayer(ch.id);
    this.ball.setKeeper(ch.id !== 'teo');
    this.missions.defs.find((d) => d.id === 'soccer').desc = `Márcale a ${this.ball.keeperName} todos los goles que puedas en 60 segundos.`;
    this.missions.near = null;
    for (const b of document.querySelectorAll('.char-btn')) b.classList.toggle('sel', b.dataset.id === ch.id);
    document.getElementById('char-blurb').textContent = ch.blurb;
    document.getElementById('p-char').textContent = `Personaje: ${ch.name} · ${ch.vehicle}`;
    if (silent) return;
    this.save.character = ch.id;
    this.saveGame();
    this.sfx.init();
    this.sfx.ui();
    if (this.state === 'play') this.hud.toast(`${ch.icon} Ahora llevas a <b>${ch.name}</b> con su <b>${ch.vehicle.toLowerCase()}</b>. ${ch.blurb}`);
  }

  start() {
    this.sfx.init();
    this.sfx.ui();
    this.state = 'play';
    this.camera3.snap = true;
    document.getElementById('menu').classList.add('out');
    this.hud.show(true);
    this.hud.toast(`¡Bienvenido a <b>Cobeña</b>! Sales de casa, en ${this.home.name}. Busca los iconos del mapa para jugar.`);
    if (this.env.target > 0.5) this.tipI = Math.max(this.tipI, 2);
    setTimeout(() => document.getElementById('keys').classList.add('fade'), 14000);
  }

  setPaused(p) {
    if (this.state !== 'play') return;
    this.paused = p;
    document.getElementById('pause').classList.toggle('hidden', !p);
    document.getElementById('p-abort').classList.toggle('hidden', !this.missions.active);
    if (this.sfx.ctx) {
      if (p) this.sfx.ctx.suspend();
      else this.sfx.ctx.resume();
    }
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this.save.muted = this.sfx.muted;
    this.saveGame();
    document.getElementById('p-sound').textContent = `Sonido: ${this.sfx.muted ? 'No' : 'Sí'}`;
  }

  refreshHud(instant = false) {
    this.hud.setStuds(this.save.studs, instant);
    this.hud.setBricks(this.save.bricks.length, this.world.bricks.length);
    this.hud.setStars(Object.values(this.save.stars).reduce((a, b) => a + b, 0), 15);
  }

  // ---------- Eventos de juego ----------
  addStuds(n) {
    if (n <= 0) return;
    this.save.studs += Math.round(n);
    this.hud.setStuds(this.save.studs);
    this.dirty = true;
  }

  onStud(type, x, y, z) {
    this.addStuds(STUD_VALUE[type]);
    this.sfx.stud(type);
    this.player.boost = Math.min(1, this.player.boost + 0.008 * (type * 3 + 1));
    this.bits.spawn(x, y, z, (Math.random() - 0.5) * 5, 6, (Math.random() - 0.5) * 5, type === 2 ? 0x7fb0ff : 0xffe680, 0.3, 0.5, y - 2);
  }

  onBrick(b) {
    this.save.bricks.push(b.id);
    this.sfx.gold();
    this.hud.big('¡Ladrillo dorado!', '#ffd23a', 1.8, true);
    this.confetti(b.x, b.y, b.z);
    this.addStuds(2000);
    this.refreshHud();
    this.saveGame();
    const n = this.save.bricks.length;
    const tot = this.world.bricks.length;
    this.hud.toast(n === tot ? '🏆 ¡Has encontrado <b>todos</b> los ladrillos dorados!' : `Ladrillos dorados: <b>${n}/${tot}</b>`);
  }

  onSmash() {
    this.sfx.bricks(5);
    this.camera3.addShake(0.12);
    this.wanted.add();
  }

  onBump(sp) {
    this.sfx.bump();
    this.camera3.addShake(Math.min(0.6, sp / 40));
  }

  onCrash() {
    this.sfx.crash();
    this.camera3.addShake(0.9);
    this.combo = 0;
    this.hud.big('¡Castañazo!', '#ff6b5a', 1.1, true);
  }

  onSplash() {
    this.sfx.splash();
    this.hud.big('¡Al agua!', '#7fc8f2', 1.1, true);
  }

  onPedHit(p, x, y, z) {
    this.sfx.ouch();
    this.studs.burst(x, y + 2, z, 2, 0, y, 7);
    this.camera3.addShake(0.15);
    this.wanted.add();
  }

  onLand(r) {
    this.sfx.land(r.impact);
    if (r.impact > 12) {
      this.camera3.addShake(Math.min(0.45, r.impact / 70));
      const p = this.player.pos;
      for (let i = 0; i < 6; i++) this.bits.spawn(p.x, p.y + 0.2, p.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 3, (Math.random() - 0.5) * 9, 0xd9dde0, 0.35, 0.5, p.y);
    }
    if (r.crashed || r.dropped) return;
    const parts = [];
    let pts = 0;
    if (r.spins >= 1) {
      parts.push(`${r.spins * 180}°`);
      pts += [0, 200, 500, 900, 1400, 2000, 2800, 3700][Math.min(r.spins, 7)];
    }
    if (r.flips) {
      const n = Math.abs(r.flips);
      parts.push((n === 2 ? 'Doble ' : n >= 3 ? 'Triple ' : '') + (r.flips > 0 ? 'Backflip' : 'Frontflip'));
      pts += 900 * n + 700 * (n - 1);
    }
    if (r.whips) {
      const name = this.player.char.trick;
      parts.push(r.whips > 1 ? `${name} ×${r.whips}` : name);
      pts += 400 * r.whips;
    }
    if (r.grind > 0.25) {
      parts.push('Grind');
      pts += Math.round(r.grind * 60) * 10;
    }
    if (r.height > 6.5 || r.air > 1.4) {
      parts.push('Gran salto');
      pts += Math.round(r.air * 15) * 10;
    }
    if (!parts.length) {
      if (r.air < 0.95) return;
      parts.push('Aéreo');
      pts = Math.round(r.air * 6) * 10;
    }
    if (r.sketchy) pts = Math.round(pts * 0.05) * 10;
    this.combo = this.time - this.lastTrick < 5 ? Math.min(8, this.combo + 1) : 0;
    this.lastTrick = this.time;
    const mult = 1 + this.combo * 0.5;
    const total = Math.round((pts * mult) / 10) * 10;
    this.hud.trick(parts.join(' + ') + (r.sketchy ? ' (torcido)' : ''), total, mult);
    this.sfx.trick(this.combo + 1);
    this.addStuds(total / 10);
    this.player.boost = Math.min(1, this.player.boost + total / 3500);
    this.missions.trickScore(total);
  }

  confetti(x, y, z) {
    const p = this.player.pos;
    this.bits.burst(x ?? p.x, (y ?? p.y) + 3, z ?? p.z, [0xe3000b, 0xffcf00, 0x1591d8, 0x00a650, 0xff7a1a, 0xffffff, 0xc870a0], 46, 15, this.terrain.height(x ?? p.x, z ?? p.z), 0.6);
  }

  zoneName(x, z) {
    const P = this.world.places;
    const m = P.megaHole;
    if (x > m.x0 - 16 && x < m.x1 + 4 && z > m.z0 - 4 && z < m.z1 + 4) return x > P.mega.islandX - 23 ? 'Isla del Tesoro' : 'Charca del Mega Salto';
    if (Math.hypot(x - P.trick.x0, z - P.trick.z0) < 130 && this.terrain.height(x, z) > 0.3) {
      const q = P.trick.poly;
      let c = false;
      for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
        if (q[i + 1] > z !== q[j + 1] > z && x < ((q[j] - q[i]) * (z - q[i + 1])) / (q[j + 1] - q[i + 1]) + q[i]) c = !c;
      }
      if (c) return 'Skatepark de Cobeña';
    }
    if (Math.abs(x - P.soccer.cx) < 35 && Math.abs(z - P.soccer.cz) < 23) return 'Pista Polideportiva';
    if (Math.abs(x - P.bowling.pinX) < 22 && Math.abs(z - P.bowling.z + 17) < 22) return 'Bolera del Recinto Ferial';
    return zoneAt(x, z);
  }

  // Menú: la cámara enseña al personaje elegido, a la derecha del panel, desde el lado más despejado
  menuCamera() {
    const c = this.camera3.cam;
    const p = this.player;
    const pp = p.pos;
    const want = 15 * p.char.cam;
    const clear = (a) => {
      for (let r = 3; r <= want; r += 1) if (this.terrain.height(pp.x + Math.sin(a) * r, pp.z + Math.cos(a) * r) > 2.5) return r - 1.5;
      return want;
    };
    const key = `${pp.x.toFixed(0)},${pp.z.toFixed(0)},${p.heading.toFixed(1)}`;
    if (key !== this.menuKey) {
      this.menuKey = key;
      let best = -Infinity;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        // Mejor de tres cuartos por delante, y con sitio para balancearse a los lados
        const d = Math.abs(((a - p.heading - 0.7 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const sc = Math.min(clear(a), clear(a - 0.3), clear(a + 0.3)) - d * 2.5;
        if (sc > best) {
          best = sc;
          this.menuAng = a;
        }
      }
    }
    const a = this.menuAng + Math.sin(this.time * 0.35) * 0.3;
    const R = Math.max(7, clear(a));
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const off = c.aspect > 1.25 ? R * 0.34 : 0;
    c.position.set(pp.x + sx * R, pp.y + 4.6 + (want - R) * 0.5, pp.z + sz * R);
    this.camera3.look.set(pp.x - sz * off, pp.y + 2.6, pp.z + sx * off);
    c.fov = 50;
    c.updateProjectionMatrix();
  }

  // ---------- Bucle principal ----------
  loop(t) {
    const dt = Math.min(0.05, Math.max(0.001, (t - this.last) / 1000));
    this.last = t;
    this.frame++;
    const inp = this.input.update();
    if (this.state === 'play') {
      if (this.photo.on) this.photo.update(dt);
      else {
        if (this.input.hit('pause')) this.setPaused(!this.paused);
        if (this.input.hit('photo')) this.photo.open();
        if (!this.paused) this.update(dt, inp);
      }
    } else {
      this.time += dt;
      this.menuCamera();
      this.player.updateVisual(dt, this.input.neutral);
      this.traffic.update(dt, this.player, this.time);
      this.folks.update(dt, this.player, this.time, false);
      this.studs.update(dt, this.player);
      this.missions.update(dt, this.time);
    }
    if (this.statue) this.statue.rotation.y += dt * 0.35;
    this.env.update(dt, this.player.pos, this.camera3.cam);
    this.render(dt);
    this.input.endFrame();

    // Calidad automática si el equipo va justo
    if (this.autoQuality && this.state === 'play' && !this.paused) {
      this.perf.t += dt;
      this.perf.n++;
      if (this.perf.n >= 150) {
        const avg = this.perf.t / this.perf.n;
        this.perf.t = this.perf.n = 0;
        if (avg > 1 / 36 && this.quality > 0) {
          this.quality--;
          this.applyQuality();
          this.hud.toast(`Gráficos ajustados a <b>${QUALITY_NAMES[this.quality]}</b> para ir más fluido`);
        }
      }
    }
  }

  // El juego calcula en plano, con las alturas medidas desde el suelo. Solo para pintar,
  // cada objeto (y la cámara) sube a la cota del terreno que tiene debajo.
  render(dt) {
    const L = this.lifted;
    const cam = this.camera3.cam;
    L.length = 0;
    L.push(cam, cam.position.y);
    for (const o of this.scene.children) if (!o.isInstancedMesh && !o.isLight && !o.userData.fixed) L.push(o, o.position.y);
    for (let i = 0; i < L.length; i += 2) L[i].position.y += lift(L[i].position.x, L[i].position.z);
    const look = this.camera3.look;
    cam.lookAt(look.x, look.y + lift(look.x, look.z), look.z);
    if (this.camera3.roll) cam.rotateZ(this.camera3.roll);
    // Los filtros del modo foto van en la pasada final: ahí se pinta siempre con ella
    if (this.quality > 0 || this.photo.on) this.composer.render(dt);
    else this.renderer.render(this.scene, cam);
    for (let i = 0; i < L.length; i += 2) L[i].position.y = L[i + 1];
  }

  update(dt, inp) {
    this.time += dt;
    const p = this.player;
    const input = this.input;
    if (input.hit('night')) this.env.toggle();
    if (input.hit('mute')) this.toggleMute();
    if (input.hit('camera')) this.camera3.mode = 1 - this.camera3.mode;
    if (input.hit('color')) {
      p.nextColor();
      this.save.colors[p.char.id] = p.colorIdx;
      this.dirty = true;
    }
    if (input.hit('reset') && p.crashT <= 0 && !p.held) {
      p.place(p.safe.x, p.safe.z, p.safe.heading);
      this.camera3.snap = true;
    }

    p.update(dt, inp);
    // Límite del mapa: más allá solo hay campos
    if (p.pos.x < BOUNDS.x0 + 6 || p.pos.x > BOUNDS.x1 - 6 || p.pos.z < BOUNDS.z0 + 6 || p.pos.z > BOUNDS.z1 - 6) {
      p.place(Math.min(BOUNDS.x1 - 14, Math.max(BOUNDS.x0 + 14, p.pos.x)), Math.min(BOUNDS.z1 - 14, Math.max(BOUNDS.z0 + 14, p.pos.z)), p.heading + Math.PI);
      this.camera3.snap = true;
      this.hud.toast('🌾 Por ahí se acaba Cobeña: solo quedan campos de cereal.');
    }
    this.props.update(dt, p);
    this.studs.update(dt, p);
    this.traffic.update(dt, p, this.time);
    this.aliens.update(dt, p, this.time);
    this.wanted.update(dt, p, this.time);
    this.folks.update(dt, p, this.time, true);
    const inBowl = this.missions.active && this.missions.def && this.missions.def.id === 'bowling';
    this.pins.update(dt, p, inBowl);
    this.ball.update(dt, p, this.time, (side) => this.missions.goal(side));
    this.missions.update(dt, this.time);
    this.bits.update(dt);

    // Efectos: llamas del turbo y salpicaduras del estanque
    this.fx -= dt;
    if (this.fx <= 0 && p.crashT <= 0) {
      this.fx = 0.03;
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      if (p.boosting && p.grounded) {
        this.bits.spawn(p.pos.x - fx * p.veh.tail, p.pos.y + 0.5, p.pos.z - fz * p.veh.tail, -fx * 6 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, -fz * 6 + (Math.random() - 0.5) * 4, Math.random() < 0.5 ? 0xffd23a : 0xff7a1a, 0.4, 0.4, p.pos.y);
      }
      if (p.grounded && p.speed > 5) {
        for (const s of this.world.splash) {
          if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r) {
            this.bits.spawn(p.pos.x, p.pos.y + 0.3, p.pos.z, (Math.random() - 0.5) * 8, 4 + Math.random() * 4, (Math.random() - 0.5) * 8, Math.random() < 0.5 ? 0x7fc8f2 : 0xffffff, 0.35, 0.6, p.pos.y);
          }
        }
      }
    }

    // Consejos para los primeros minutos
    this.tipT -= dt;
    if (this.tipT <= 0 && this.tipI < TIPS.length && !this.missions.active) {
      this.hud.toast(TIPS[this.tipI++]);
      this.tipT = 24;
    }

    this.camera3.update(dt);
    this.sfx.motion(p.speed, p.grounded && p.crashT <= 0 && !p.grind, !!p.grind);
    this.hud.update(dt, p.speed * 1.6, p.boost, p.boosting);
    if (this.frame % 2 === 0) {
      const m = this.missions;
      const blips = this.blips;
      blips.length = 0;
      for (const b of this.aliens.blips) blips.push(b);
      for (const b of this.wanted.blips) blips.push(b);
      this.minimap.draw(p.pos.x, p.pos.z, this.camera3.yaw, p.heading, m.active ? [] : this.markers, m.goalPos, blips);
    }
    if (this.frame % 20 === 0) {
      const z = this.zoneName(p.pos.x, p.pos.z);
      if (z !== this.zone) {
        this.zone = z;
        this.hud.zone(z);
      }
      if (this.dirty && this.frame % 300 === 0) {
        this.dirty = false;
        this.saveGame();
      }
      this.refreshStars();
    }
  }

  refreshStars() {
    const s = Object.values(this.save.stars).reduce((a, b) => a + b, 0);
    if (s !== this.starCount) {
      this.starCount = s;
      this.hud.setStars(s, 15);
    }
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  const b = document.getElementById('btn-play');
  b.textContent = 'Error al cargar :(';
});
