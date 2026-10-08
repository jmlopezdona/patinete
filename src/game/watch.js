import * as THREE from 'three';
import { angDiff, damp } from '../core/rng.js';

const $ = (id) => document.getElementById(id);
// Desde dónde se las mira: ángulo respecto a su marcha (0 = de frente), distancia y altura
const VIEWS = [
  { name: 'En diagonal', ang: 0.52, dist: 25, h: 5.4 },
  { name: 'De frente', ang: 0, dist: 24, h: 5 },
  { name: 'De lado', ang: 1.15, dist: 25, h: 5 },
  { name: 'Desde atrás', ang: 2.75, dist: 24, h: 7.5 },
];
const FOV = 50;
// La cámara juega con el zoom: un rato con ellas, se abre para enseñar por dónde van y vuelve.
// Segundos de cada tramo de la vuelta: cerca, abriéndose, lejos y cerrándose
const ZOOM = { near: 8, out: 3.5, far: 7, back: 3.5, dist: 58, h: 30, ahead: 9 };
const smooth = (k) => k * k * (3 - 2 * k);
const UP = 40; // a esta altura va el punto de vista: nadie lo atropella ni se frena por él

// Seguir a las mamás: la partida se queda como estaba, con el personaje parado, y la cámara corre
// con Ana, Cintia y Bea por delante de ellas, con su música. El pueblo sigue vivo alrededor
// (coches y vecinos), pero callado.
export class Watch {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.back = false;
    this.view = 0;
    this.yaw = 0;
    this.time = 0;
    this.snap = true;
    // El jugador de pega al que siguen el tráfico, los vecinos y la sombra: es el de verdad, pero
    // colocado donde corren ellas
    this.eye = Object.create(game.player);
    this.eye.pos = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.q = { x: 0, z: 0, ux: 0, uz: 1 };
    this.el = { root: $('watch'), view: $('w-view') };
    $('w-view').addEventListener('click', () => this.next());
    $('w-exit').addEventListener('click', () => this.close());
  }

  get can() {
    return !!this.game.folks.joggers;
  }

  open() {
    const g = this.game;
    // En red no: deja la partida parada mientras se mira
    if (this.on || g.state !== 'play' || !this.can || g.party) return;
    this.on = true;
    this.back = g.paused; // si se entra desde la pausa, al salir se vuelve a ella
    g.paused = true;
    $('pause').classList.add('hidden');
    g.hud.show(false);
    g.sfx.jogging(true);
    this.time = g.time;
    this.clock = 0;
    this.snap = true;
    this.sync();
    this.el.root.classList.remove('hidden');
    this.update(0.001);
  }

  close() {
    if (!this.on) return;
    const g = this.game;
    this.on = false;
    // Lo que han corrido mientras se las miraba no lo ha contado el reloj de la partida: se apunta
    // para que al volver sigan por donde iban
    g.folks.joggers.ahead += this.time - g.time;
    this.el.root.classList.add('hidden');
    g.hud.show(true);
    g.sfx.jogging(false);
    g.camera3.snap = true;
    g.camera3.update(0.001);
    g.setPaused(this.back);
  }

  next() {
    this.view = (this.view + 1) % VIEWS.length;
    this.clock = 0; // la vista nueva se enseña primero de cerca
    this.sync();
  }

  sync() {
    this.el.view.textContent = `🎥 ${VIEWS[this.view].name}`;
  }

  // Cuánto se ha abierto el plano: 0 con ellas, 1 desde lejos
  zoom(dt) {
    const Z = ZOOM;
    this.clock = (this.clock + dt) % (Z.near + Z.out + Z.far + Z.back);
    let t = this.clock - Z.near;
    if (t < 0) return 0;
    if (t < Z.out) return smooth(t / Z.out);
    t -= Z.out + Z.far;
    return t < 0 ? 1 : 1 - smooth(t / Z.back);
  }

  update(dt) {
    const g = this.game;
    const I = g.input;
    if (I.hit('pause')) return this.close();
    if (I.hit('camera')) this.next();
    if (I.hit('night')) g.env.toggle();
    if (I.hit('mute')) g.toggleMute();
    const F = g.folks;
    const R = F.joggers;
    const T = g.terrain;
    const q = this.q;
    this.time += dt;
    // El punto de vista se adelanta a donde van a estar, para que no se pierdan de vista
    F.pathAt(R.s + 8.6 * dt, q);
    this.eye.pos.set(q.x, UP, q.z);
    g.traffic.update(dt, this.eye, this.time);
    F.update(dt, this.eye, this.time, false);
    // El grupo va en línea con Ana en medio: se mira a ella, y la marcha la da el circuito
    const ana = R.list[0];
    F.pathAt(ana.s, q);
    const cx = ana.x;
    const cz = ana.z;
    const cy = Math.max(0, Math.min(1, T.height(cx, cz)));
    const hd = Math.atan2(q.ux, q.uz);
    // En las esquinas del circuito la cámara gira con calma en vez de dar el bandazo
    if (this.snap) this.yaw = hd;
    else this.yaw += angDiff(this.yaw, hd) * (1 - Math.exp(-2.2 * dt));
    const v = VIEWS[this.view];
    const k = this.zoom(dt);
    const dist = v.dist + (ZOOM.dist - v.dist) * k;
    const h = v.h + (ZOOM.h - v.h) * k;
    const fx = Math.sin(this.yaw + v.ang);
    const fz = Math.cos(this.yaw + v.ang);
    // Si un árbol o una casa tapan la vista, la cámara se acerca
    let s = 1;
    for (let i = 2; i <= 10; i++) {
      const t = i / 10;
      if (T.height(cx + fx * dist * t, cz + fz * dist * t) > cy + 2.6 + (h - 2.6) * t - 0.6) {
        s = Math.max(0.3, (i - 1) / 10);
        break;
      }
    }
    const to = this.to.set(cx + fx * dist * s, cy + h + (1 - s) * 2, cz + fz * dist * s);
    to.y = Math.max(to.y, T.height(to.x, to.z) + 1.2);
    const c3 = g.camera3;
    const cam = c3.cam;
    if (this.snap) {
      cam.position.copy(to);
      c3.look.set(cx, cy + 2.9, cz);
      this.snap = false;
    } else {
      // La cámara corre a su paso y solo el ajuste fino va con retardo: si no, se le echarían encima
      cam.position.x += q.ux * 8.6 * dt;
      cam.position.z += q.uz * 8.6 * dt;
      cam.position.lerp(to, 1 - Math.exp(-4 * dt));
      // Si aun así se mete en un árbol, salta al sitio despejado
      if (T.height(cam.position.x, cam.position.z) > cam.position.y - 0.6) cam.position.copy(to);
      // La mirada va clavada a ellas (con retardo se saldrían del encuadre al correr) y, de lejos,
      // se adelanta un poco para enseñar hacia dónde van
      c3.look.set(cx + q.ux * ZOOM.ahead * k, cy + 2.9, cz + q.uz * ZOOM.ahead * k);
    }
    cam.fov = damp(cam.fov, FOV, 5, dt);
    cam.updateProjectionMatrix();
  }
}
