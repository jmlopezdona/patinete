import * as THREE from 'three';
import { createMinifig, nameTag } from '../lego/minifig.js';
import { createUnicycle } from '../lego/vehicles.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { characterById } from './characters.js';
import { DATA } from '../world/cobena.js';
import { angDiff, damp, clamp } from '../core/rng.js';

const TAU = Math.PI * 2;
const SEE = 260; // más lejos no se dibujan
const BLOND = 0xf0d27a;
const BPM = 168;

const shadows = (o) =>
  o.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });

// Vecinos con nombre propio: Yago y su monociclo en el skatepark, Adrián, el pequeño batería heavy
// de la calle Libertad, Jose en la canasta y Ana, Cintia y Bea haciendo footing por los parques.
export class Folks {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.markers = [];
    this.buildYago();
    this.buildDrummer();
    this.buildJose();
    this.buildJoggers();
  }

  // El personaje que lleva el jugador no puede estar a la vez en su sitio de siempre
  setPlayer(id) {
    this.away = id;
    const Y = this.yago;
    if (Y) {
      Y.marker.hidden = id === 'yago';
      if (id === 'yago') Y.root.visible = Y.tag.visible = false;
    }
    const D = this.drummer;
    if (D) D.fig.group.visible = D.tag.visible = id !== 'adrian';
  }

  update(dt, p, time, live) {
    if (this.yago && this.away !== 'yago') this.updateYago(dt, p, time, live);
    if (this.drummer) this.updateDrummer(dt, p, time, live);
    if (this.jose) this.updateJose(dt, p, time, live);
    if (this.joggers) this.updateJoggers(dt, p, time, live);
  }

  // ---------- Yago, el del monociclo ----------
  buildYago() {
    const P = this.game.world.places.yago;
    if (!P) return;
    const root = new THREE.Group();
    // Se inclina y da volteretas alrededor del eje de la rueda
    const tilt = new THREE.Group();
    tilt.position.y = 1.3;
    const body = new THREE.Group();
    body.position.y = -1.3;
    tilt.add(body);
    root.add(tilt);
    const uni = createUnicycle(C.red);
    const wheel = uni.wheel;
    body.add(uni.group);
    const fig = createMinifig({ torso: C.red, arms: C.white, legs: C.blue, hair: 'hair', hairColor: C.brown, face: 'grin', print: 'stripes', printColor: '#ffffff' });
    fig.group.scale.setScalar(0.8);
    fig.group.position.y = uni.seatY - 1.72 * 0.8;
    body.add(fig.group);
    // Las tres bolas de los malabares
    const balls = [C.yellow, C.azure, C.magenta].map((col) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }));
      root.add(m);
      return m;
    });
    shadows(root);
    const tag = nameTag('Yago', '#fe8a18');
    this.game.scene.add(root, tag);
    const marker = { x: P.x, z: P.z, icon: '🤹' };
    this.yago = { P, root, tilt, wheel, fig, balls, tag, marker, ang: 0, spin: 0, y: 0, vy: 0, air: false, flip: 0, x: P.x, z: P.z, cd: 0 };
    this.markers.push(marker);
  }

  updateYago(dt, p, time, live) {
    const Y = this.yago;
    const P = Y.P;
    const d = Math.hypot(p.pos.x - P.x, p.pos.z - P.z);
    const vis = d < SEE;
    Y.root.visible = Y.tag.visible = vis;
    if (!vis) return;
    const f = Y.fig;
    // Número de circo en bucle: vuelta con malabares, pirueta, marcha atrás, saltitos y reverencia
    const tt = time % 20;
    let w = 0;
    let juggle = false;
    let lean = 0;
    let hop = 0;
    let pedal = 0;
    f.armL.rotation.z = f.armR.rotation.z = 0;
    if (tt < 8) {
      w = 0.95;
      juggle = true;
      pedal = 1;
    } else if (tt < 11) {
      // Pirueta sobre la rueda con los brazos en cruz
      Y.spin += dt * 9;
      f.armL.rotation.z = 1.35;
      f.armR.rotation.z = -1.35;
      f.armL.rotation.x = f.armR.rotation.x = 0;
    } else if (tt < 15) {
      w = -0.8;
      pedal = -1;
      f.armL.rotation.z = 1.2 + Math.sin(time * 5) * 0.25;
      f.armR.rotation.z = -1.2 + Math.sin(time * 5) * 0.25;
      f.armL.rotation.x = f.armR.rotation.x = 0;
      lean = Math.sin(time * 5) * 0.08;
    } else if (tt < 18) {
      hop = Math.abs(Math.sin((tt - 15) * 5.2)) * 1.3;
      f.armL.rotation.x = f.armR.rotation.x = -2.8;
    } else {
      // Reverencia al público
      lean = Math.sin(((tt - 18) / 2) * Math.PI) * 0.6;
      f.armL.rotation.x = f.armR.rotation.x = 0.5;
      f.armL.rotation.z = 0.6;
      f.armR.rotation.z = -0.6;
    }
    if (tt < 8 || tt >= 11) Y.spin = damp(Y.spin, Math.round(Y.spin / TAU) * TAU, 6, dt);
    Y.ang += w * dt;
    Y.x = P.x + Math.sin(Y.ang) * P.r;
    Y.z = P.z + Math.cos(Y.ang) * P.r;
    Y.wheel.rotation.x += ((w * P.r) / 1.3) * dt;
    // Si el patinete se le echa encima, lo salta con una voltereta
    Y.cd -= dt;
    if (live && !Y.air && Y.cd <= 0 && p.crashT <= 0 && Math.hypot(p.pos.x - Y.x, p.pos.z - Y.z) < 6.5 && p.pos.y < P.y + 3 && p.speed > 4) {
      Y.air = true;
      Y.vy = 21;
      Y.flip = 0;
      this.game.sfx.ole();
    }
    if (Y.air) {
      Y.vy -= 40 * dt;
      Y.y += Y.vy * dt;
      Y.flip += dt * 6.2;
      if (Y.y <= 0) {
        Y.y = 0;
        Y.air = false;
        Y.flip = 0;
        Y.cd = 0.6;
      }
    }
    const heading = Y.ang + Math.PI / 2 + Y.spin;
    Y.root.position.set(Y.x, P.y + Y.y + hop, Y.z);
    Y.root.rotation.y = heading;
    Y.tilt.rotation.x = lean - Y.flip;
    const ph = Y.wheel.rotation.x;
    f.legL.rotation.x = -0.75 + Math.sin(ph) * 0.45 * Math.abs(pedal);
    f.legR.rotation.x = -0.75 - Math.sin(ph) * 0.45 * Math.abs(pedal);
    f.head.rotation.x = juggle ? -0.3 : 0;
    Y.balls.forEach((b, i) => {
      b.visible = juggle;
      if (!juggle) return;
      const a = time * 5.2 + (i * TAU) / 3;
      b.position.set(Math.sin(a) * 1.05, 6.2 + Math.abs(Math.cos(a)) * 1.9, 0.75);
    });
    if (juggle) {
      f.armL.rotation.x = -1.5 + Math.sin(time * 5.2) * 0.4;
      f.armR.rotation.x = -1.5 - Math.sin(time * 5.2) * 0.4;
    }
    Y.tag.position.set(Y.x, P.y + Y.y + hop + (juggle ? 9.4 : 7.4), Y.z);
  }

  // ---------- Adrián, el pequeño batería heavy de la calle Libertad, 17 ----------
  buildDrummer() {
    const P = this.game.world.places.drummer;
    if (!P) return;
    const root = new THREE.Group();
    root.position.set(P.x, P.y, P.z);
    root.rotation.y = P.rot;
    const DR = C.red;
    const b = new Builder();
    // Bombo
    b.cyl(1.05, 0.95, 0, 1.05, 0.95, DR, { axis: 'z', seg: 24 });
    b.cyl(0.92, 0.04, 0, 1.05, 1.44, C.white, { axis: 'z', seg: 24 });
    b.cyl(1.09, 0.1, 0, 1.05, 1.36, C.lgray, { axis: 'z', seg: 24 });
    // Timbales
    for (const sx of [-1, 1]) {
      b.cyl(0.46, 0.42, sx * 0.56, 2.42, 0.8, DR, { rx: 0.45, seg: 16 });
      b.cyl(0.42, 0.04, sx * 0.56, 2.62, 0.9, C.white, { rx: 0.45, seg: 16 });
    }
    b.cyl(0.07, 0.5, 0, 2.2, 0.85, C.dgray, { seg: 8 });
    // Caja y goliat
    b.cyl(0.52, 0.34, -1.25, 1.62, -0.25, C.lgray, { seg: 16 });
    b.cyl(0.48, 0.04, -1.25, 1.8, -0.25, C.white, { seg: 16 });
    b.cyl(0.06, 1.45, -1.25, 0.72, -0.25, C.dgray, { seg: 8 });
    b.cyl(0.62, 0.95, 1.35, 1.1, -0.3, DR, { seg: 18 });
    b.cyl(0.58, 0.04, 1.35, 1.58, -0.3, C.white, { seg: 18 });
    for (let i = 0; i < 3; i++) b.cyl(0.05, 0.7, 1.35 + Math.cos(i * 2.1) * 0.6, 0.35, -0.3 + Math.sin(i * 2.1) * 0.6, C.dgray, { seg: 6 });
    // Charles y pies de los platos
    b.cyl(0.05, 2.2, -2.05, 1.1, 0.35, C.dgray, { seg: 8 });
    b.cyl(0.56, 0.05, -2.05, 2.16, 0.35, C.gold, { seg: 20 });
    b.cyl(0.56, 0.05, -2.05, 2.28, 0.35, C.gold, { seg: 20 });
    b.cyl(0.05, 3.5, -1.55, 1.75, 1.15, C.dgray, { seg: 8 });
    b.cyl(0.05, 3.7, 1.7, 1.85, 1.0, C.dgray, { seg: 8 });
    // Taburete
    b.cyl(0.5, 0.2, 0, 1.9, -1.25, C.black, { seg: 14 });
    b.cyl(0.08, 1.8, 0, 0.9, -1.25, C.lgray, { seg: 8 });
    b.cyl(0.5, 0.08, 0, 0.04, -1.25, C.lgray, { seg: 12 });
    root.add(b.mesh(plastic));
    const cymbals = [[-1.55, 3.5, 1.15, 0.9], [1.7, 3.7, 1.0, 1.0]].map(([x, y, z, r]) => {
      const cb = new Builder();
      cb.cyl(r, 0.05, 0, 0, 0, C.gold, { seg: 24 });
      cb.cyl(0.18, 0.14, 0, 0.06, 0, C.gold, { seg: 10 });
      const m = cb.mesh(plastic);
      m.position.set(x, y, z);
      root.add(m);
      return m;
    });
    // El artista: pequeño, con su flequillo a tazón y cara de concierto
    const fig = createMinifig(characterById('adrian').look);
    const k = 0.68;
    fig.group.scale.setScalar(k);
    fig.group.position.set(0, 2.0 - 1.75 * k, -1.25);
    for (const [arm, sx] of [[fig.armL, 1], [fig.armR, -1]]) {
      const sb = new Builder();
      sb.cyl(0.07, 1.6, sx * 0.2, -2.2, 0.12, C.tan, { seg: 6 });
      arm.add(sb.mesh(plastic));
    }
    root.add(fig.group);
    shadows(root);
    const tag = nameTag('Adrián', '#e3000b');
    tag.position.set(P.x - Math.sin(P.rot) * 1.25, P.y + 6.4, P.z - Math.cos(P.rot) * 1.25);
    this.game.scene.add(root, tag);
    this.drummer = { P, root, fig, cymbals, tag, fx: 0 };
    this.markers.push({ x: P.x, z: P.z, icon: '🥁' });
  }

  updateDrummer(dt, p, time, live) {
    const D = this.drummer;
    const P = D.P;
    const g = this.game;
    const d = Math.hypot(p.pos.x - P.x, p.pos.z - P.z);
    const here = this.away !== 'adrian'; // si Adrián va de paseo, la batería se queda sola y callada
    D.root.visible = d < SEE;
    D.tag.visible = here && d < SEE;
    if (live) g.sfx.drums(here ? clamp(1 - (d - 14) / 80, 0, 1) ** 2 : 0);
    if (d >= SEE || !here) return;
    const f = D.fig;
    const beat = (time * BPM) / 60; // negras
    const s16 = Math.sin(beat * 4 * Math.PI);
    f.armL.rotation.x = -1.25 + s16 * 0.6;
    f.armR.rotation.x = -1.25 - s16 * 0.6;
    f.armL.rotation.z = 0.25;
    f.armR.rotation.z = -0.25;
    // Headbanging a negras y pisotones al doble bombo
    const bang = Math.abs(Math.sin(beat * Math.PI));
    f.head.rotation.x = 0.1 + bang * 0.75;
    f.group.rotation.x = 0.12 + bang * 0.14;
    f.legL.rotation.x = -0.9 + Math.max(0, s16) * 0.35;
    f.legR.rotation.x = -0.9 + Math.max(0, -s16) * 0.35;
    D.cymbals.forEach((c, i) => {
      c.rotation.z = Math.sin(time * 23 + i * 2) * 0.16;
      c.rotation.x = Math.cos(time * 19 + i) * 0.12;
    });
    // Chispas de puro heavy
    D.fx -= dt;
    if (live && D.fx <= 0 && d < 60) {
      D.fx = 0.09;
      const a = P.rot + (Math.random() - 0.5) * 2.4;
      g.bits.spawn(P.x + (Math.random() - 0.5) * 3, P.y + 3.4, P.z + (Math.random() - 0.5) * 3, Math.sin(a) * 5, 9 + Math.random() * 7, Math.cos(a) * 5, [0xffd23a, 0xe3000b, 0xffffff, 0xfe8a18][Math.floor(Math.random() * 4)], 0.3, 0.9, P.y);
    }
  }

  // ---------- Jose, tiros y entradas a canasta ----------
  buildJose() {
    const W = this.game.world;
    const home = W.places.home || W.places.spawn;
    // La canasta más cercana a casa
    let H = null;
    for (const h of W.places.hoops) if (!H || Math.hypot(h.x - home.x, h.z - home.z) < Math.hypot(H.x - home.x, H.z - home.z)) H = h;
    if (!H) return;
    const fig = createMinifig({ torso: C.white, arms: C.skin, legs: C.blue, hair: 'none', face: 'senor', print: '#23', printColor: '#c91a09' });
    shadows(fig.group);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8731a, roughness: 0.6 }));
    ball.castShadow = true;
    const tag = nameTag('Jose', '#e8731a');
    this.game.scene.add(fig.group, ball, tag);
    const J = (this.jose = {
      H, fig, ball, tag, tx: H.nz, tz: -H.nx, x: 0, z: 0, y: 0, heading: 0, state: 'go', then: 'aim', fast: false, t: 0, n: 0, walk: 0, drib: 0,
      target: null, layup: false, released: false, thud: false, made: 0,
      b: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, held: true, fly: null, t: 0 },
    });
    const s = this.spot(10, 0);
    J.x = s.x;
    J.z = s.z;
    J.heading = Math.atan2(-H.nx, -H.nz);
    J.target = this.spot(9, 3);
    J.marker = { x: H.x + H.nx * 8, z: H.z + H.nz * 8, icon: '🏀' };
    this.markers.push(J.marker);
  }

  // Punto de la pista a cierta distancia de la canasta y desplazado hacia un lado
  spot(dist, side) {
    const J = this.jose;
    const H = J.H;
    return { x: H.x + H.nx * dist + J.tx * side, z: H.z + H.nz * dist + J.tz * side };
  }

  updateJose(dt, p, time, live) {
    const J = this.jose;
    const H = J.H;
    const g = this.game;
    const f = J.fig;
    const b = J.b;
    const FLOOR = 0.16;
    const R = 0.56;
    const d = Math.hypot(p.pos.x - J.x, p.pos.z - J.z);
    const vis = d < SEE;
    f.group.visible = J.ball.visible = J.tag.visible = vis;
    if (!vis) return;
    const vol = live ? clamp(1 - d / 75, 0, 1) : 0;
    const toHoop = Math.atan2(H.x - J.x, H.z - J.z);
    const side = Math.min(H.half - 2.5, 6);
    let moving = false;
    let dribble = false;
    J.t += dt;

    const walkTo = (x, z, speed) => {
      const dx = x - J.x;
      const dz = z - J.z;
      const dd = Math.hypot(dx, dz);
      J.heading += angDiff(J.heading, Math.atan2(dx, dz)) * Math.min(1, 9 * dt);
      const st = Math.min(dd, speed * dt);
      if (dd > 0.01) {
        J.x += (dx / dd) * st;
        J.z += (dz / dd) * st;
      }
      J.walk += st * 0.75;
      moving = true;
      return dd < 0.35;
    };

    switch (J.state) {
      case 'go':
        dribble = true;
        if (walkTo(J.target.x, J.target.z, J.fast ? 13 : 6.5)) {
          if (J.then === 'drive') {
            // Entrada a canasta: carrera botando hasta debajo del aro
            J.target = this.spot(3, (Math.random() - 0.5) * 2);
            J.fast = true;
            J.then = 'layup';
          } else {
            J.layup = J.then === 'layup';
            J.state = J.layup ? 'jump' : 'aim';
            J.released = false;
            J.t = 0;
          }
        }
        break;
      case 'aim':
        dribble = J.t < 0.9;
        J.heading += angDiff(J.heading, toHoop) * Math.min(1, 8 * dt);
        if (J.t > 1.2) {
          J.state = 'jump';
          J.released = false;
          J.t = 0;
        }
        break;
      case 'jump': {
        J.heading += angDiff(J.heading, toHoop) * Math.min(1, 12 * dt);
        const dur = J.layup ? 0.7 : 0.6;
        J.y = Math.sin(Math.min(1, J.t / dur) * Math.PI) * (J.layup ? 2.6 : 1.3);
        if (J.layup) {
          J.x += Math.sin(J.heading) * 5 * dt * Math.max(0, 1 - J.t / dur);
          J.z += Math.cos(J.heading) * 5 * dt * Math.max(0, 1 - J.t / dur);
        }
        if (!J.released && J.t > (J.layup ? 0.34 : 0.3)) {
          J.released = true;
          b.held = false;
          const make = Math.random() < (J.layup ? 0.85 : 0.68);
          const miss = make ? 0 : 0.75;
          b.fly = {
            x0: b.x, y0: b.y, z0: b.z, x1: H.x + H.nx * miss, y1: H.y + (make ? 0.35 : 0.5), z1: H.z + H.nz * miss,
            T: J.layup ? 0.5 : 0.95, t: 0, apex: J.layup ? 1.1 : 3.4, make,
          };
          b.t = 0;
        }
        if (J.t > dur) {
          J.y = 0;
          J.state = 'watch';
          J.t = 0;
        }
        break;
      }
      case 'watch':
        J.heading += angDiff(J.heading, toHoop) * Math.min(1, 8 * dt);
        if (!b.fly && b.t > 1.5) {
          J.state = 'fetch';
          J.t = 0;
        }
        break;
      case 'fetch':
        if (walkTo(b.x, b.z, 8.5) || Math.hypot(b.x - J.x, b.z - J.z) < 1.3 || J.t > 8) {
          b.held = true;
          J.n++;
          J.fast = false;
          J.state = 'go';
          if (J.n % 3 === 2) {
            J.then = 'drive';
            J.target = this.spot(16, (Math.random() < 0.5 ? -1 : 1) * Math.min(side, 4));
          } else {
            J.then = 'aim';
            J.target = this.spot(8 + Math.random() * 4, (Math.random() - 0.5) * 2 * side);
          }
        }
        break;
      default:
        break;
    }

    // El patinete no le atraviesa
    if (live && d < 2.3 && p.pos.y < 4 && p.crashT <= 0) p.bump((p.pos.x - J.x) / (d || 1), (p.pos.z - J.z) / (d || 1), 0.25, 0.8);

    // Balón
    const fx = Math.sin(J.heading);
    const fz = Math.cos(J.heading);
    if (b.held) {
      if (J.state === 'jump') {
        b.x = J.x + fx * 0.5;
        b.y = FLOOR + J.y + 6.5;
        b.z = J.z + fz * 0.5;
      } else if (dribble) {
        J.drib += dt * 8.5;
        const k = Math.abs(Math.sin(J.drib));
        if (k < 0.12 && !J.thud) {
          J.thud = true;
          if (vol > 0.05) g.sfx.bounce(vol);
        } else if (k > 0.5) J.thud = false;
        b.x = J.x + fx * 0.9 - fz * 0.85;
        b.y = FLOOR + R + k * 2.1;
        b.z = J.z + fz * 0.9 + fx * 0.85;
      } else {
        b.x = J.x + fx * 0.9;
        b.y = FLOOR + 2.9;
        b.z = J.z + fz * 0.9;
      }
    } else if (b.fly) {
      const F = b.fly;
      F.t += dt;
      const k = Math.min(1, F.t / F.T);
      b.x = F.x0 + (F.x1 - F.x0) * k;
      b.z = F.z0 + (F.z1 - F.z0) * k;
      b.y = F.y0 + (F.y1 - F.y0) * k + 4 * F.apex * k * (1 - k);
      if (k >= 1) {
        b.fly = null;
        b.t = 0;
        if (F.make) {
          J.made++;
          b.vx = H.nx * 1.2;
          b.vz = H.nz * 1.2;
          b.vy = -7;
          if (vol > 0.05) g.sfx.swish(vol);
        } else {
          const a = (Math.random() - 0.5) * 7;
          b.vx = H.nx * (4 + Math.random() * 3) + J.tx * a;
          b.vz = H.nz * (4 + Math.random() * 3) + J.tz * a;
          b.vy = 6;
          if (vol > 0.05) g.sfx.clang(vol);
        }
      }
    } else {
      b.t += dt;
      b.vy -= 30 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y < FLOOR + R) {
        b.y = FLOOR + R;
        if (b.vy < -3) {
          b.vy *= -0.6;
          if (vol > 0.05) g.sfx.bounce(vol * 0.8);
        } else b.vy = 0;
        const fr = Math.max(0, 1 - 2.2 * dt);
        b.vx *= fr;
        b.vz *= fr;
      }
      // Que no se escape de la pista
      const along = (b.x - H.x) * H.nx + (b.z - H.z) * H.nz;
      const lat = (b.x - H.x) * J.tx + (b.z - H.z) * J.tz;
      if (along < 0.2 || along > H.len / 2) {
        const vn = b.vx * H.nx + b.vz * H.nz;
        if ((along < 0.2 && vn < 0) || (along > H.len / 2 && vn > 0)) {
          b.vx -= 1.7 * vn * H.nx;
          b.vz -= 1.7 * vn * H.nz;
        }
      }
      if (Math.abs(lat) > H.half - 1) {
        const vt = b.vx * J.tx + b.vz * J.tz;
        if (vt * lat > 0) {
          b.vx -= 1.7 * vt * J.tx;
          b.vz -= 1.7 * vt * J.tz;
        }
      }
    }
    J.ball.position.set(b.x, b.y, b.z);
    J.ball.rotation.x += dt * 5;

    // Animación
    const sw = moving ? Math.sin(J.walk) : 0;
    f.legL.rotation.x = sw * 0.75;
    f.legR.rotation.x = -sw * 0.75;
    f.armL.rotation.z = f.armR.rotation.z = 0;
    if (J.state === 'jump' || (J.state === 'watch' && J.t < 0.7)) {
      f.armL.rotation.x = f.armR.rotation.x = -2.95;
      f.legL.rotation.x = 0.25;
      f.legR.rotation.x = -0.35;
    } else if (b.held && dribble) {
      f.armR.rotation.x = -0.75 + Math.abs(Math.sin(J.drib)) * -0.55;
      f.armL.rotation.x = -sw * 0.5;
    } else if (b.held) {
      f.armL.rotation.x = f.armR.rotation.x = -1.2;
    } else {
      f.armL.rotation.x = -sw * 0.6;
      f.armR.rotation.x = sw * 0.6;
    }
    f.group.position.set(J.x, FLOOR + J.y, J.z);
    f.group.rotation.y = J.heading;
    J.tag.position.set(J.x, FLOOR + J.y + 6.7, J.z);
  }

  // ---------- Ana, Cintia y Bea, de footing por los parques de al lado de casa ----------
  buildJoggers() {
    const g = this.game;
    const T = this.T;
    const home = g.world.places.home || g.world.places.spawn;
    const clear = (x, z) => {
      const h = T.height(x, z);
      return h < 0.6 && h > -0.5;
    };
    const lineClear = (a, b) => {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5);
      for (let i = 0; i <= n; i++) if (!clear(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return false;
      return true;
    };
    // Circuito por dentro del borde de un parque
    const loop = (pts) => {
      const n = pts.length / 2;
      let cx = 0;
      let cz = 0;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        cx += pts[i * 2];
        cz += pts[i * 2 + 1];
        area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
      }
      cx /= n;
      cz /= n;
      const sg = area > 0 ? 1 : -1;
      const out = [];
      for (let i = 0; i < n; i++) {
        const h = (i + n - 1) % n;
        const j = (i + 1) % n;
        const a = [pts[i * 2] - pts[h * 2], pts[i * 2 + 1] - pts[h * 2 + 1]];
        const b = [pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]];
        const la = Math.hypot(a[0], a[1]) || 1;
        const lb = Math.hypot(b[0], b[1]) || 1;
        // Normal hacia dentro: media de las de los dos lados que se juntan en el vértice
        let nx = (-a[1] / la - b[1] / lb) * sg;
        let nz = (a[0] / la + b[0] / lb) * sg;
        const ln = Math.hypot(nx, nz) || 1;
        nx /= ln;
        nz /= ln;
        let q = null;
        for (const off of [7, 10, 14, 4]) {
          const c = [pts[i * 2] + nx * off, pts[i * 2 + 1] + nz * off];
          if (clear(c[0], c[1])) {
            q = c;
            break;
          }
        }
        if (!q) {
          const c = [pts[i * 2] + (cx - pts[i * 2]) * 0.25, pts[i * 2 + 1] + (cz - pts[i * 2 + 1]) * 0.25];
          if (clear(c[0], c[1])) q = c;
        }
        if (q && (!out.length || Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > 6)) out.push(q);
      }
      return { pts: out, cx, cz };
    };
    const parks = DATA.greens
      .filter(([type, , pts]) => type === 0 && pts.length >= 8)
      .map(([, , pts]) => loop(pts))
      .filter((l) => l.pts.length >= 4)
      .sort((a, b) => Math.hypot(a.cx - home.x, a.cz - home.z) - Math.hypot(b.cx - home.x, b.cz - home.z))
      .slice(0, 2);
    if (!parks.length) return;
    let route = [...parks[0].pts];
    if (parks[1]) {
      // Si hay paso libre entre los dos parques, la vuelta los recorre enteros
      let best = null;
      parks[0].pts.forEach((a, i) =>
        parks[1].pts.forEach((b, j) => {
          const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if ((!best || dd < best.d) && lineClear(a, b)) best = { d: dd, i, j };
        })
      );
      if (best) {
        const A = parks[0].pts;
        const B = parks[1].pts;
        route = [];
        for (let k = 0; k <= A.length; k++) route.push(A[(best.i + k) % A.length]);
        for (let k = 0; k <= B.length; k++) route.push(B[(best.j + k) % B.length]);
      }
    }
    // Polilínea cerrada con longitudes acumuladas
    const pts = [...route, route[0]];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1];
    if (len < 60) return;
    const LOOKS = [
      ['Ana', C.magenta, C.brown, 0],
      ['Cintia', C.turquoise, C.black, 1.5],
      ['Bea', C.orange, BLOND, -1.5],
    ];
    const list = LOOKS.map(([name, top, hair, off], i) => {
      const fig = createMinifig({ torso: top, arms: C.skin, legs: C.black, hips: C.black, hair: 'ponytail', hairColor: hair, face: 'lady', print: i === 1 ? 'star' : i === 2 ? 'bolt' : 'stripes', printColor: '#ffffff' });
      fig.group.rotation.order = 'YXZ';
      shadows(fig.group);
      const tag = nameTag(name, '#' + top.toString(16).padStart(6, '0'));
      g.scene.add(fig.group, tag);
      return { name, fig, tag, off, lag: i === 0 ? 0 : 2.8, s: 0, seg: 0, x: 0, z: 0, heading: 0, dodge: 0, fly: 0, vy: 0, y: 0, cd: 0, ph: i * 2.1, init: false };
    });
    this.joggers = { pts, cum, len, list, s: 0, marker: { x: pts[0][0], z: pts[0][1], icon: '🏃‍♀️' } };
    this.markers.push(this.joggers.marker);
  }

  pathAt(s, out) {
    const R = this.joggers;
    s = ((s % R.len) + R.len) % R.len;
    let i = 0;
    while (i < R.cum.length - 2 && s > R.cum[i + 1]) i++;
    const a = R.pts[i];
    const b = R.pts[i + 1];
    const l = R.cum[i + 1] - R.cum[i] || 1;
    const k = (s - R.cum[i]) / l;
    out.x = a[0] + (b[0] - a[0]) * k;
    out.z = a[1] + (b[1] - a[1]) * k;
    out.ux = (b[0] - a[0]) / l;
    out.uz = (b[1] - a[1]) / l;
    return out;
  }

  updateJoggers(dt, p, time, live) {
    const R = this.joggers;
    const T = this.T;
    const g = this.game;
    const q = (this._q ||= { x: 0, z: 0, ux: 0, uz: 1 });
    R.s = (R.s + 8.6 * dt) % R.len;
    this.pathAt(R.s, q);
    R.marker.x = q.x;
    R.marker.z = q.z;
    const far = Math.hypot(p.pos.x - q.x, p.pos.z - q.z) > SEE;
    for (const j of R.list) {
      const f = j.fig;
      f.group.visible = j.tag.visible = !far;
      if (far) {
        j.init = false;
        continue;
      }
      const want = R.s - j.lag;
      if (!j.init) {
        j.init = true;
        j.s = want;
      }
      if (j.fly > 0) {
        // Por los aires tras un atropello (sin daños: son de plástico)
        j.fly -= dt;
        j.vy -= 30 * dt;
        j.y += j.vy * dt;
        if (j.y <= 0) {
          j.y = 0;
          j.fly = 0;
        }
        f.group.rotation.x += dt * 12;
        f.armL.rotation.x = f.armR.rotation.x = -2.6;
        f.group.position.y = T.height(j.x, j.z) + j.y;
        j.tag.position.set(j.x, f.group.position.y + 6.6, j.z);
        continue;
      }
      // Si se quedó atrás, aprieta el paso hasta volver al grupo
      let gap = want - j.s;
      if (gap < -R.len / 2) gap += R.len;
      if (gap > R.len / 2) gap -= R.len;
      const speed = 8.6 + clamp(gap * 0.9, -3, 7);
      j.s += speed * dt;
      this.pathAt(j.s, q);
      // Esquiva árboles y bancos echándose a un lado
      const blocked = (lat) => T.height(q.x + q.ux * 1.3 - q.uz * lat, q.z + q.uz * 1.3 + q.ux * lat) > 0.6 || T.height(q.x + q.ux * 2.8 - q.uz * lat, q.z + q.uz * 2.8 + q.ux * lat) > 0.6;
      const side = blocked(j.off) ? (!blocked(j.off + 2.6) ? 2.6 : !blocked(j.off - 2.6) ? -2.6 : 0) : 0;
      j.dodge = damp(j.dodge, side, 7, dt);
      const lat = j.off + j.dodge;
      const nx = q.x - q.uz * lat;
      const nz = q.z + q.ux * lat;
      const hd = Math.atan2(nx - j.x, nz - j.z);
      if (Math.hypot(nx - j.x, nz - j.z) > 0.01) j.heading += angDiff(j.heading, hd) * Math.min(1, 10 * dt);
      j.x = nx;
      j.z = nz;
      const gy = Math.max(0, Math.min(1, T.height(nx, nz)));
      const w = time * 11 + j.ph;
      const sw = Math.sin(w);
      f.legL.rotation.x = sw * 0.95;
      f.legR.rotation.x = -sw * 0.95;
      f.armL.rotation.x = -0.6 - sw * 0.8;
      f.armR.rotation.x = -0.6 + sw * 0.8;
      f.head.rotation.y = j.off ? Math.sin(time * 0.9 + j.ph) * 0.5 * Math.sign(-j.off) : 0;
      f.group.position.set(nx, gy + Math.abs(Math.cos(w)) * 0.28, nz);
      f.group.rotation.set(0.14, j.heading, 0);
      j.tag.position.set(nx, gy + 6.6, nz);
      // Atropello
      j.cd -= dt;
      if (!live || j.cd > 0 || p.crashT > 0) continue;
      const dx = p.pos.x - nx;
      const dz = p.pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 3.4 && Math.abs(p.pos.y - gy) < 3) {
        if (p.speed > 7) {
          j.fly = 1.4;
          j.vy = 13;
          j.cd = 2;
          g.sfx.ouch();
          g.camera3.addShake(0.15);
        } else {
          const dd = Math.sqrt(d2) || 1;
          p.bump(dx / dd, dz / dd, 0.15, 0.9);
        }
      }
    }
  }
}
