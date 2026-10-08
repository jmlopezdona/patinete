import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { plastic, createPlastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { DATA as D, BOUNDS } from '../world/cobena.js';
import { lift, grade } from '../world/relief.js';

const COUNT = 5; // meteoritos por lluvia
const MIN = 3; // si no caben al menos estos cerca, la lluvia se deja para más tarde
const FIRST = 80; // segundos hasta la primera lluvia
const EVERY = 170; // y de una a la siguiente
const WARN = 3.5; // del aviso al primer meteorito
const GAP = 2.3; // de un meteorito al siguiente
const FALL = 3; // lo que tarda en caer: el tiempo que hay para apartarse de la diana
const SKY = 230; // altura desde la que se le ve venir
const NEAR = 45; // caen como poco así de lejos del jugador...
const FAR = [150, 270]; // ...y como mucho así: primero se busca cerca y, si no hay sitio, más lejos
const CORE_LIFE = 150; // segundos que aguanta el meteorito en el fondo del cráter antes de deshacerse
const PRIZE = 150; // studs por cada meteorito recogido
const BONUS = 1000; // y por recogerlos todos
const HOT = 30; // segundos que tarda el fondo en dejar de estar al rojo
const ORANGE = '#ff9a3a';
const TAU = Math.PI * 2;
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();

// El cráter es un bowl con el borde levantado: fondo llano, pared curva, labio y talud de tierra
// por fuera. Las medidas son las del cráter de tamaño 1; cada uno sale algo mayor o menor.
const R0 = 5; // radio del fondo
const BR = 6.5; // radio de la curva de la pared
const ANG = 60;
const RIM = 1.4; // ancho del labio
const OUT = 6.5; // ancho del talud de fuera
const BD = BR * Math.sin((ANG * Math.PI) / 180);
const LIP = BR * (1 - Math.cos((ANG * Math.PI) / 180));
const RT = R0 + BD + RIM + OUT; // radio total
const SIZES = [0.82, 1.1];
const EARTH = { floor: 0x2a2522, wall: 0x6b4a2f, rim: 0x8f6b43, out: 0xb9925f };

function craterGeo() {
  const b = new Builder();
  const V = (r, y) => new THREE.Vector2(r, y);
  const wall = [];
  for (let i = 0; i <= 10; i++) {
    const s = (BD * i) / 10;
    wall.push(V(R0 + s, BR - Math.sqrt(BR * BR - s * s) + 0.04));
  }
  b.add(new THREE.LatheGeometry([V(0.01, 0.04), V(R0, 0.04)], 48), EARTH.floor);
  b.add(new THREE.LatheGeometry(wall, 48), EARTH.wall);
  b.add(new THREE.LatheGeometry([V(R0 + BD, LIP + 0.04), V(R0 + BD + RIM, LIP + 0.04)], 48), EARTH.rim);
  // El talud se hunde un poco bajo el suelo para que no asome ninguna rendija en las cuestas
  b.add(new THREE.LatheGeometry([V(R0 + BD + RIM, LIP + 0.04), V(RT, 0), V(RT + 1.2, -0.9)], 48), EARTH.out);
  // Pedruscos medio enterrados en el talud
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + (i % 3) * 0.23;
    const t = 0.25 + ((i * 7) % 5) * 0.14;
    const r = R0 + BD + RIM + OUT * t;
    const s = 0.9 + ((i * 5) % 4) * 0.28;
    b.box(s, s * 0.8, s * 1.1, Math.sin(a) * r, LIP * (1 - t) + s * 0.12, Math.cos(a) * r, i % 2 ? C.dgray : 0x4a4038, { r: 0.18, ry: a * 3, rx: 0.3 });
  }
  return b.geometry();
}

// Pedrusco chamuscado con vetas al rojo: es el que cae del cielo y el que queda en el fondo del cráter
function rockGeo() {
  const b = new Builder();
  b.box(1.5, 1.3, 1.4, 0, 0, 0, 0x3a3230, { r: 0.4 });
  b.box(1.1, 1.0, 1.2, 0.5, 0.3, 0.3, C.dgray, { r: 0.3, ry: 0.6 });
  b.box(1.0, 0.9, 1.0, -0.5, -0.2, -0.3, 0x2a2522, { r: 0.3, ry: -0.4 });
  b.box(0.9, 0.8, 0.9, -0.2, 0.5, -0.4, C.dgray, { r: 0.25, rz: 0.5 });
  for (const [x, y, z] of [[0.55, 0.62, 0.5], [-0.72, 0.2, 0.3], [0.1, -0.5, 0.68], [-0.3, 0.86, -0.3], [0.78, -0.1, -0.4]]) b.sphere(0.2, x, y, z, 0xff7a1a, { seg: 6, seg2: 5 });
  return b.geometry();
}

// Lluvia de meteoritos: de día, de tarde en tarde, caen unos cuantos en los descampados de
// alrededor. Cada uno avisa con una diana en el suelo, manda por los aires a quien pille debajo y
// deja un cráter que se patina como un bowl, con el meteorito en el fondo para quien baje a por él.
//
// En red la lluvia es la misma para todos, pero no viaja en la `foto`: una vez decidido dónde y
// cuándo cae cada uno, lo demás es cuestión de tiempo y cada pantalla lo lleva por su cuenta.
// - El anfitrión decide cuándo empieza y reparte las dianas (`start`), y lo cuenta entero (`lluvia`).
// - Cada pantalla hace caer los suyos, levanta los cráteres y manda por los aires a su jugador.
// - El meteorito del fondo es para el primero que baje: cada jugador lo pide (`meteorito`) y el
//   anfitrión lo da y lo dice (`cogido`). La cuenta de recogidos es de todos, y el premio final también.
// - A quien entra tarde se le cuenta cómo está todo (`dump` y `load`, en el `mundo`).
export class Meteors {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.cd = FIRST;
    this.state = 'idle'; // idle → warn → rain → idle
    this.t = 0;
    this.found = 0; // meteoritos recogidos de la última lluvia
    this.total = 0;
    this.blips = [];
    this.fxT = 0;
    this.grid = null;

    const scene = game.scene;
    const rock = rockGeo();
    const base = (this.base = craterGeo());
    const ringGeo = new THREE.RingGeometry(0.7, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 32);
    discGeo.rotateX(-Math.PI / 2);
    const haloGeo = new THREE.SphereGeometry(1, 14, 10);
    // De día la luz que se suma al cielo sale rosa: solo el fondo del cráter brilla así
    const fire = (color, add = false) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });

    // Los que caen: el pedrusco con su halo de fuego y la diana que marca dónde va a dar
    this.falls = [];
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(rock, plastic);
      const halo = new THREE.Mesh(haloGeo, fire(0xffa51f));
      halo.material.opacity = 0.42;
      halo.scale.setScalar(1.45);
      mesh.add(halo);
      mesh.scale.setScalar(2.6);
      const mark = new THREE.Mesh(ringGeo, fire(0xff3d1a));
      mesh.visible = mark.visible = false;
      mesh.frustumCulled = mark.frustumCulled = false;
      scene.add(mesh, mark);
      this.falls.push({ mesh, mark, on: false, wait: 0, t: 0, x: 0, z: 0, k: 1, sx: 0, sz: 0, blip: { x: 0, z: 0, icon: '☄️' } });
    }

    // Los cráteres: caben los de dos lluvias, para que los viejos duren hasta que llegan los nuevos.
    // El fondo va a ras de suelo: tiene que ganarle a todas sus capas (césped, tierra, aceras)
    const earth = createPlastic({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -20 });
    this.craters = [];
    for (let i = 0; i < COUNT * 2; i++) {
      const geo = base.clone();
      const mesh = new THREE.Mesh(geo, earth);
      mesh.userData.fixed = true; // sus vértices ya van a la cota del terreno, uno por uno
      mesh.receiveShadow = true;
      const glow = new THREE.Mesh(discGeo, fire(0xff8a2a, true));
      glow.material.polygonOffset = true;
      glow.material.polygonOffsetFactor = -6;
      glow.material.polygonOffsetUnits = -24;
      const core = new THREE.Mesh(rock, plastic);
      const halo = new THREE.Mesh(haloGeo, fire(0xffa51f));
      halo.scale.setScalar(1.5);
      core.add(halo);
      core.castShadow = true;
      mesh.visible = glow.visible = core.visible = false;
      scene.add(mesh, glow, core);
      this.craters.push({ mesh, glow, core, halo, on: false, x: 0, z: 0, k: 1, r: 0, age: 0, rise: 1, sink: 0, old: false, has: false, coreT: 0, askT: 0, prims: [], blip: { x: 0, z: 0, icon: '☄️' } });
    }
  }

  // ---------- Dónde puede caer uno ----------

  // Rejilla de lo que no se puede pisar: calles, caminos, arroyos, árboles, mobiliario, por donde
  // pasean los vecinos y todo lo que tiene studs, que es por donde se circula. Se hace una vez.
  occupancy() {
    const g = this.game;
    const W = g.world;
    const G = 8;
    const nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / G);
    const nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / G);
    const cells = new Uint8Array(nx * nz);
    const mark = (x, z, r) => {
      const i0 = Math.max(0, Math.floor((x - r - BOUNDS.x0) / G));
      const i1 = Math.min(nx - 1, Math.floor((x + r - BOUNDS.x0) / G));
      const j0 = Math.max(0, Math.floor((z - r - BOUNDS.z0) / G));
      const j1 = Math.min(nz - 1, Math.floor((z + r - BOUNDS.z0) / G));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i] = 1;
    };
    const line = (pts, r) => {
      for (let i = 2; i < pts.length; i += 2) {
        const dx = pts[i] - pts[i - 2];
        const dz = pts[i + 1] - pts[i - 1];
        const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / G));
        for (let k = 0; k <= n; k++) mark(pts[i - 2] + (dx * k) / n, pts[i - 1] + (dz * k) / n, r);
      }
    };
    for (const [, width, sw, , , pts] of D.roads) line(pts, width / 2 + sw + 2);
    for (const p of D.streams) line(p, 4);
    for (const p of W.pedPaths) line(p, 3);
    for (const p of D.water) line(p, 3);
    for (const s of W.studs) mark(s.x, s.z, 4);
    for (const s of W.bricks) mark(s.x, s.z, 6);
    for (const s of W.props) mark(s.x, s.z, 2);
    for (const s of W.lamps) mark(s.x, s.z, 2);
    for (const s of W.splash) mark(s.x, s.z, s.r + 2);
    for (let i = 0; i < D.trees.length; i += 3) mark(D.trees[i], D.trees[i + 1], 2);
    for (const [x, z, w, d] of D.pitches) mark(x, z, Math.hypot(w, d) / 2 + 3);
    for (const [x, z] of D.playgrounds) mark(x, z, 16);
    for (const m of g.markers) mark(m.x, m.z, 12);
    for (const h of Object.values(W.places.homes)) if (h.spawn) mark(h.spawn.x, h.spawn.z, 10);
    for (const c of g.cows.list) mark(c.x, c.z, 5);
    mark(g.hens.yard.x, g.hens.yard.z + 6, 20);
    // El skatepark entero y la carrerilla del Mega Salto, que no va por ninguna calle
    const sk = D.places.skate;
    mark(sk.x, sk.z, Math.hypot(sk.w, sk.d) / 2);
    const m = W.places.mega;
    line([m.x - 104, m.z - 75, m.x - 64, m.z, m.hole.x0, m.z], 9);
    return { cells, nx, nz, G };
  }

  // ¿Cabe ahí un cráter de radio r? Suelo llano y despejado en toda la huella
  clear(x, z, r) {
    if (x < BOUNDS.x0 + r + 30 || x > BOUNDS.x1 - r - 30 || z < BOUNDS.z0 + r + 30 || z > BOUNDS.z1 - r - 30) return false;
    const { cells, nx, G } = this.grid || (this.grid = this.occupancy());
    const i1 = Math.floor((x + r - BOUNDS.x0) / G);
    const j1 = Math.floor((z + r - BOUNDS.z0) / G);
    for (let j = Math.floor((z - r - BOUNDS.z0) / G); j <= j1; j++) {
      for (let i = Math.floor((x - r - BOUNDS.x0) / G); i <= i1; i++) if (cells[j * nx + i]) return false;
    }
    // Los cráteres que se van a tapar no estorban: donde había uno puede caer otro
    const T = this.T;
    const flat = (px, pz) => T.height(px, pz) === 0 || !!(T.hit && T.hit.crater && T.hit.crater.old);
    if (!flat(x, z)) return false;
    for (let q = 1; q <= 4; q++) {
      for (let a = 0; a < 14; a++) {
        const ang = (a / 14) * TAU + q;
        if (!flat(x + (Math.sin(ang) * r * q) / 4, z + (Math.cos(ang) * r * q) / 4)) return false;
      }
    }
    return true;
  }

  // Reparte las dianas de la lluvia alrededor del jugador. Devuelve cuántas ha podido colocar
  aim(p) {
    const spots = [];
    for (const far of FAR) {
      for (let k = 0; k < 260 && spots.length < COUNT; k++) {
        const a = Math.random() * TAU;
        const d = NEAR + Math.random() * (far - NEAR);
        const x = p.pos.x + Math.sin(a) * d;
        const z = p.pos.z + Math.cos(a) * d;
        const size = SIZES[0] + Math.random() * (SIZES[1] - SIZES[0]);
        const r = RT * size;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r + 8)) continue;
        if (this.craters.some((c) => c.on && !c.old && Math.hypot(c.x - x, c.z - z) < c.r + r + 8)) continue;
        if (this.clear(x, z, r + 3)) spots.push({ x, z, k: size, r });
      }
      if (spots.length >= MIN) break;
    }
    return spots.length >= MIN ? spots : null;
  }

  // ---------- La lluvia ----------

  // Empieza una lluvia si hay sitio cerca donde quepan los cráteres. Devuelve si ha empezado.
  // Solo jugando solo o en el anfitrión. p: alrededor de quién cae
  start(p = this.game.player) {
    const g = this.game;
    if (this.state !== 'idle') return false;
    // Los cráteres de la lluvia anterior se tapan, menos el que alguien esté patinando
    for (const c of this.craters) c.old = c.on && (c.sink > 0 || g.nearest2(c.x, c.z) > (c.r + 12) ** 2);
    const spots = this.aim(p);
    if (!spots) return false;
    spots.sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
    // Todo lo que hay que saber de la lluvia, en una ristra de números: qué cráteres se tapan y,
    // de cada meteorito, dónde cae, de qué tamaño, cuándo y de qué lado del cielo viene
    const rain = [this.craters.reduce((m, c, i) => m | (c.old ? 1 << i : 0), 0)];
    spots.forEach((s, i) => {
      const a = 0.9 + (Math.random() - 0.5) * 0.5;
      rain.push(s.x, s.z, s.k, WARN + i * GAP + Math.random() * 0.6, Math.sin(a) * SKY * 0.7, Math.cos(a) * SKY * 0.7);
    });
    this.rain(rain);
    g.party?.tell('lluvia', rain);
    return true;
  }

  // La lluvia que ha decidido `start`, aquí o en el anfitrión
  rain(list) {
    const g = this.game;
    const n = Math.min(COUNT, Math.floor((list.length - 1) / 6));
    if (n < 1) return;
    this.craters.forEach((c, i) => {
      c.old = c.on && !!(list[0] & (1 << i));
      if (c.old && !c.sink) this.fill(c);
    });
    this.falls.forEach((f, i) => {
      f.on = i < n;
      f.mesh.visible = f.mark.visible = false;
      if (f.on) this.target(f, ...list.slice(1 + i * 6, 7 + i * 6), 0);
    });
    this.state = 'warn';
    this.t = 0;
    this.found = 0;
    this.total = n;
    g.sfx.meteorAlarm();
    g.hud.big('¡Lluvia de meteoritos!', ORANGE, 2.2);
    g.hud.setMeteors(0, this.total);
    const news = '☄️ ¡Que vienen! Apártate de las <b>dianas</b>: cada meteorito deja un <b>cráter</b> que se patina como un bowl… y una piedra del espacio en el fondo.';
    g.hud.toast(news, g.told('lluvia de meteoritos') ? '' : news);
  }

  // Un meteorito con su diana: dónde cae, de qué tamaño, cuánto le falta y de qué lado viene
  target(f, x, z, k, wait, sx, sz, t) {
    f.x = f.blip.x = x;
    f.z = f.blip.z = z;
    f.k = k;
    f.wait = wait;
    f.t = t;
    f.sx = sx;
    f.sz = sz;
    // La diana, tumbada sobre la cuesta
    lift(x, z);
    f.mark.quaternion.setFromUnitVectors(_up, _n.set(-grade.x, 1, -grade.z).normalize());
  }

  // Levanta el cráter: las primitivas del terreno y su malla, tendida sobre la cuesta que haya
  dig(x, z, k, slot = this.craters.findIndex((o) => !o.on)) {
    const c = this.craters[slot];
    if (!c) return null;
    const T = this.T;
    c.on = true;
    c.x = c.blip.x = x;
    c.z = c.blip.z = z;
    c.k = k;
    c.r = RT * k;
    c.age = 0;
    c.rise = 0;
    c.sink = 0;
    c.has = true;
    c.coreT = CORE_LIFE;
    c.prims = [
      T.bowl(x, z, R0 * k, BR * k, ANG, 0),
      T.ring(x, z, (R0 + BD) * k, (R0 + BD + RIM) * k, LIP * k),
      T.rcone(x, z, (R0 + BD + RIM) * k, RT * k, LIP * k, 0),
    ];
    for (const q of c.prims) q.crater = c;
    c.old = false;
    const src = this.base.attributes.position;
    const pos = c.mesh.geometry.attributes.position;
    for (let i = 0; i < src.count; i++) {
      const vx = x + src.getX(i) * k;
      const vz = z + src.getZ(i) * k;
      pos.setXYZ(i, vx, src.getY(i) * k + lift(vx, vz), vz);
    }
    pos.needsUpdate = true;
    c.mesh.geometry.computeBoundingSphere();
    c.mesh.visible = true;
    // El fondo al rojo, tumbado sobre la cuesta
    lift(x, z);
    _n.set(-grade.x, 1, -grade.z).normalize();
    c.glow.quaternion.setFromUnitVectors(_up, _n);
    c.glow.position.set(x, 0.12 * k, z);
    c.glow.scale.setScalar(R0 * k * 0.94);
    c.glow.visible = true;
    c.core.position.set(x, 1.7, z);
    c.core.scale.setScalar(0.01);
    c.core.visible = true;
    return c;
  }

  // Tapa un cráter: deja de pisarse ya y la tierra se va hundiendo
  fill(c) {
    for (const p of c.prims) this.T.remove(p);
    c.prims.length = 0;
    c.has = false;
    c.core.visible = c.glow.visible = false;
    c.sink = 0.001;
  }

  impact(f) {
    const g = this.game;
    const p = g.player;
    const { x, z, k } = f;
    const dx = p.pos.x - x;
    const dz = p.pos.z - z;
    const d = Math.hypot(dx, dz);
    const c = this.dig(x, z, k);
    const vol = Math.max(0.12, 1 - d / 320);
    g.sfx.meteorBoom(vol);
    g.camera3.addShake(Math.max(0, 1.1 - d / 140));
    g.bits.burst(x, 1.5, z, [EARTH.out, EARTH.wall, EARTH.rim, 0xff7a1a, 0xffd23a, C.dgray], 60, 26, 0, 1.3);
    g.bits.burst(x, 3, z, [0xff7a1a, 0xffd23a, 0xffffff], 24, 14, 0, 0.6);
    if (!c) return;
    // A quien pille en la huella lo manda por los aires: el suelo acaba de cambiar bajo sus ruedas
    if (d < c.r + 2 && p.crashT <= 0 && !p.held) {
      const ux = d > 0.5 ? dx / d : Math.sin(p.heading);
      const uz = d > 0.5 ? dz / d : Math.cos(p.heading);
      const push = 9 + 9 * Math.min(1, d / c.r);
      p.grind = null;
      p.pos.y = Math.max(p.pos.y, this.T.height(p.pos.x, p.pos.z)) + 0.2;
      if (p.grounded) p.launch(ux * push, 27, uz * push, null);
      else p.vel.set(ux * push, Math.max(p.vel.y, 22), uz * push);
      p.invuln = Math.max(p.invuln, 1.2);
      g.hud.big('¡Por los aires!', ORANGE, 1.1, true);
    }
  }

  // Jugando solo o en el anfitrión: el meteorito de ese cráter es para `by`. El premio es suyo; el
  // de recogerlos todos, de toda la pandilla
  grant(i, by) {
    const g = this.game;
    const c = this.craters[i];
    if (!c || !by || !c.on || !c.has) return;
    this.collect(i);
    g.party?.tell('cogido', i);
    const to = g.to(by);
    to.sfx.gold();
    to.addStuds(PRIZE);
    if (this.found < this.total) {
      to.hud.big('¡Meteorito!', ORANGE, 1, true);
      return;
    }
    const all = g.all;
    all.addStuds(BONUS);
    all.sfx.fanfare();
    all.confetti();
    all.hud.big('¡Todos los meteoritos!', '#ffd23a', 1.8);
    all.hud.toast(`☄️ Has recogido los <b>${this.total}</b> meteoritos de esta lluvia: <b>+${BONUS}</b> studs. Los cráteres se quedan hasta la próxima.`, 'Has recogido todos los meteoritos de esta lluvia. Los cráteres se quedan hasta la próxima.');
  }

  // Lo que se ve en todas las pantallas cuando alguien se lleva uno
  collect(i) {
    const g = this.game;
    const c = this.craters[i];
    if (!c || !c.has) return;
    c.has = false;
    c.core.visible = false;
    this.found++;
    g.here(c.x, c.z).bits.burst(c.x, 2, c.z, [0xff7a1a, 0xffd23a, 0xffffff, C.dgray], 18, 10, 0, 0.5);
    g.hud.setMeteors(this.found, this.total);
  }

  // En red: cómo está la lluvia, para contárselo al que entra, y lo que hace él al saberlo
  dump() {
    return {
      s: this.state, t: this.t, f: this.found, n: this.total,
      falls: this.falls.filter((f) => f.on).map((f) => [f.x, f.z, f.k, f.wait, f.sx, f.sz, f.t]),
      craters: this.craters.map((c, i) => (c.on ? [i, c.x, c.z, c.k, c.age, c.has ? 1 : 0, c.coreT, c.old ? 1 : 0, c.sink] : null)).filter(Boolean),
    };
  }

  load(w) {
    const num = (v) => +v || 0;
    for (const c of this.craters) {
      for (const q of c.prims) this.T.remove(q);
      c.prims.length = 0;
      c.on = c.has = c.old = false;
      c.sink = 0;
      c.mesh.visible = c.glow.visible = c.core.visible = false;
      c.mesh.position.y = 0;
    }
    for (const e of Array.isArray(w.craters) ? w.craters : []) {
      const c = this.dig(num(e[1]), num(e[2]), num(e[3]), num(e[0]));
      if (!c) continue;
      c.age = num(e[4]);
      c.rise = 1;
      c.coreT = num(e[6]);
      c.old = !!e[7];
      c.has = c.core.visible = !!e[5];
      if (num(e[8]) > 0) {
        this.fill(c);
        c.sink = num(e[8]);
      }
    }
    const falls = Array.isArray(w.falls) ? w.falls : [];
    this.falls.forEach((f, i) => {
      const e = falls[i];
      f.on = !!e;
      if (e) this.target(f, ...e.slice(0, 7).map(num));
      f.mesh.visible = f.mark.visible = f.on && f.wait <= 0;
    });
    this.state = ['idle', 'warn', 'rain'].includes(w.s) ? w.s : 'idle';
    this.t = num(w.t);
    this.found = num(w.f);
    this.total = num(w.n);
    this.game.hud.setMeteors(...(this.total ? [this.found, this.total] : [null]));
  }

  update(dt, p, time) {
    const g = this.game;
    this.blips.length = 0;

    // De día y sin nada más entre manos, de tarde en tarde cae una. En red la decide el anfitrión,
    // y cae alrededor de alguno de los que no están a otra cosa
    const party = g.party;
    const led = !!party && !party.hosting;
    if (this.state === 'idle') {
      const who = led ? [] : party ? g.crowd(p).filter((o) => !g.busy(o) && !o.held) : !g.missions.active && !p.held ? [p] : [];
      if (!g.aliens.active && g.env.target < 0.5 && who.length) {
        this.cd -= dt;
        if (this.cd <= 0) this.cd = this.start(who[Math.floor(Math.random() * who.length)]) ? EVERY : 25;
      }
    } else {
      this.t += dt;
      let left = 0;
      for (const f of this.falls) {
        if (!f.on) continue;
        left++;
        this.blips.push(f.blip);
        f.wait -= dt;
        if (f.wait > 0) continue;
        if (f.t === 0) {
          f.mesh.visible = f.mark.visible = true;
          g.sfx.meteor(Math.max(0.1, 1 - Math.hypot(p.pos.x - f.x, p.pos.z - f.z) / 300));
        }
        f.t += dt;
        const e = Math.min(1, f.t / FALL);
        const q = 1 - e;
        f.mesh.position.set(f.x + f.sx * q, SKY * q + 1, f.z + f.sz * q);
        f.mesh.rotation.set(time * 5, time * 3.1, 0);
        // La diana se va cerrando sobre el punto del impacto
        const r = RT * f.k * (1.25 - 0.25 * e);
        f.mark.position.set(f.x, 0.3, f.z);
        f.mark.scale.setScalar(r);
        f.mark.material.opacity = 0.4 + 0.35 * e + Math.sin(time * 18) * 0.15;
        if (e >= 1) {
          f.on = false;
          f.mesh.visible = f.mark.visible = false;
          this.impact(f);
        }
      }
      if (this.state === 'warn' && this.t > WARN) this.state = 'rain';
      if (!left) this.state = 'idle';
    }

    // Estela de fuego de los que vienen cayendo
    this.fxT -= dt;
    const fx = this.fxT <= 0;
    if (fx) this.fxT = 0.03;
    for (const f of this.falls) {
      if (!fx || !f.mesh.visible) continue;
      const m = f.mesh.position;
      for (let i = 0; i < 3; i++) g.bits.spawn(m.x + (Math.random() - 0.5) * 2, m.y + (Math.random() - 0.5) * 2, m.z + (Math.random() - 0.5) * 2, f.sx * 0.05 + (Math.random() - 0.5) * 6, 8 + Math.random() * 8, f.sz * 0.05 + (Math.random() - 0.5) * 6, [0xffd23a, 0xff7a1a, 0xffffff, 0x8a8f96][Math.floor(Math.random() * 4)], 1.5, 0.6, 0);
    }

    let cores = 0;
    for (let i = 0; i < this.craters.length; i++) {
      const c = this.craters[i];
      c.askT -= dt;
      if (!c.on) continue;
      if (c.sink) {
        // Tapándose: la tierra se hunde y el hueco queda libre para otro
        c.sink += dt / 1.2;
        c.mesh.position.y = -(LIP * c.k + 1.2) * Math.min(1, c.sink) ** 2;
        if (c.sink >= 1) {
          c.on = false;
          c.mesh.visible = false;
          c.mesh.position.y = 0;
        }
        continue;
      }
      c.age += dt;
      // Sale de golpe de debajo de la tierra, tapado por la polvareda del impacto
      if (c.rise < 1) {
        c.rise = Math.min(1, c.rise + dt / 0.22);
        c.mesh.position.y = -(LIP * c.k + 1.2) * (1 - c.rise) ** 2;
      }
      const heat = Math.max(0, 1 - c.age / HOT);
      c.glow.visible = heat > 0;
      c.glow.material.opacity = heat * (0.5 + Math.sin(time * 7 + c.x) * 0.08);
      if (heat > 0.3 && fx && Math.random() < heat * 0.5) {
        const a = Math.random() * TAU;
        const r = Math.random() * R0 * c.k;
        g.bits.spawn(c.x + Math.sin(a) * r, 0.3, c.z + Math.cos(a) * r, (Math.random() - 0.5) * 2, 7 + Math.random() * 7, (Math.random() - 0.5) * 2, Math.random() < 0.6 ? 0xff7a1a : 0x8a8f96, 0.35, 0.7, 0);
      }
      if (!c.has) continue;
      c.coreT -= dt;
      if (c.coreT <= 0) {
        // Nadie ha bajado a por él: se deshace en ascuas
        c.has = false;
        c.core.visible = false;
        g.bits.burst(c.x, 1.5, c.z, [0xff7a1a, C.dgray, 0x2a2522], 12, 7, 0, 0.5);
        continue;
      }
      cores++;
      this.blips.push(c.blip);
      const pop = Math.min(1, Math.max(0, c.age - 0.5) * 2.5);
      c.core.scale.setScalar(1.25 * pop * (1 + Math.sin(pop * Math.PI) * 0.3) * (c.coreT < 8 && Math.floor(c.coreT * 6) % 2 ? 0.8 : 1));
      c.core.position.y = 1.8 + Math.sin(time * 2.4 + c.z) * 0.3;
      c.core.rotation.set(time * 1.3, time * 1.9, 0);
      c.halo.material.opacity = 0.3 + Math.sin(time * 6 + c.x) * 0.1;
      // Lo toca el jugador de esta pantalla: es suyo, o lo pide si el que manda es el anfitrión
      if (pop >= 1 && p.crashT <= 0 && !p.held && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 3.4 && p.pos.y < 5) {
        if (!led) this.grant(i, p);
        else if (c.askT <= 0) {
          c.askT = 0.5;
          party.tell('meteorito', i);
        }
      }
    }
    // El contador se esconde cuando ya no queda ninguno por recoger ni por caer
    if (this.state === 'idle' && !cores && this.total) {
      this.total = 0;
      g.hud.setMeteors(null);
    }
  }
}
