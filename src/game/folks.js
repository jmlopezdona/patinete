import * as THREE from 'three';
import { createMinifig, nameTag } from '../lego/minifig.js';
import { createUnicycle, createSkates } from '../lego/vehicles.js';
import { streetGraph, nextEdge, laneOf, randomSpot } from '../world/streets.js';
import { lift, grade } from '../world/relief.js';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { characterById, COLORS } from './characters.js';
import { DATA } from '../world/cobena.js';
import { frame } from '../world/city.js';
import { angDiff, damp, clamp } from '../core/rng.js';

const TAU = Math.PI * 2;
const SEE = 260; // más lejos no se dibujan
const TEE = 0xf3cad6;
const BPM = 168;
// Los tiros de la canasta: lo que dura el salto y lo que sube, cuándo suelta el balón, cuántos entran
// y el vuelo del balón hasta el aro. La entrada, además, se hace a la carrera.
const SHOTS = {
  tiro: { dur: 0.6, h: 1.3, rel: 0.3, pct: 0.68, T: 0.95, apex: 3.4 },
  triple: { dur: 0.66, h: 1.5, rel: 0.32, pct: 0.5, T: 1.25, apex: 5 },
  entrada: { dur: 0.7, h: 2.6, rel: 0.34, pct: 0.85, T: 0.5, apex: 1.1, run: 5 },
};

const shadows = (o) =>
  o.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });

// Vecinos con nombre propio: Yago y su monociclo en el skatepark, Adrián, el pequeño batería heavy
// de la Escuela de Música, Jose y su padre en la canasta, Ana, Cintia y Bea haciendo footing
// por los parques, Emma, de visita, haciéndose selfies en El Palmeral, Iker, que no para de dar
// vueltas por el pueblo con su patinete eléctrico, y Leo, de blanco, que pelotea en la pista de tenis.
export class Folks {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.markers = [];
    this.buildYago();
    this.buildDrummer();
    this.buildJose();
    this.buildJoggers();
    this.buildEmma();
    this.buildIker();
    this.buildLeo();
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
    // Sin Jose, su padre se queda tirando solo
    const J = this.jose;
    if (J && J.kid.away !== (id === 'jose')) {
      J.kid.away = id === 'jose';
      J.kid.fig.group.visible = J.kid.tag.visible = false;
      this.resetJose();
    }
    const E = this.emma;
    if (E && id === 'emma') E.fig.group.visible = E.tag.visible = E.fx.visible = false;
    const K = this.iker;
    if (K) {
      K.marker.hidden = id === 'iker';
      if (id === 'iker') K.root.visible = K.tag.visible = false;
    }
    const L = this.leo;
    if (L) {
      L.marker.hidden = id === 'leo';
      if (id === 'leo') L.fig.group.visible = L.machine.visible = L.ball.visible = L.tag.visible = false;
    }
  }

  update(dt, p, time, live) {
    if (this.yago && this.away !== 'yago') this.updateYago(dt, p, time, live);
    if (this.drummer) this.updateDrummer(dt, p, time, live);
    if (this.jose) this.updateJose(dt, p, time, live);
    if (this.joggers) this.updateJoggers(dt, p, time, live);
    if (this.emma && this.away !== 'emma') this.updateEmma(dt, p, time, live);
    if (this.iker && this.away !== 'iker') this.updateIker(dt, p, time, live);
    if (this.leo && this.away !== 'leo') this.updateLeo(dt, p, time, live);
  }

  // ---------- Leo, de blanco, peloteando en la pista de tenis contra la máquina lanzapelotas ----------
  buildLeo() {
    const P = this.game.world.places.tennis;
    if (!P) return;
    const F = frame(P.x, P.z, P.rot); // X local: a lo largo de la pista; la red, en X = 0
    const ch = characterById('leo');
    const fig = createMinifig(ch.look);
    fig.group.scale.setScalar(ch.scale);
    // La raqueta, en la mano derecha
    const rb = new Builder();
    rb.cyl(0.09, 1.0, 0, 0.5, 0, C.black, { seg: 8 });
    rb.add(new THREE.TorusGeometry(0.56, 0.07, 6, 20), C.red, 0, 1.6, 0);
    for (let i = -2; i <= 2; i++) {
      rb.box(0.025, Math.sqrt(0.3 - i * i * 0.04) * 2, 0.025, i * 0.2, 1.6, 0, C.white);
      rb.box(Math.sqrt(0.3 - i * i * 0.04) * 2, 0.025, 0.025, 0, 1.6 + i * 0.2, 0, C.white);
    }
    const racket = rb.mesh(plastic);
    racket.scale.y = 1.15;
    racket.position.set(0, -1.5, 0.15);
    racket.rotation.x = 2.1;
    fig.armR.add(racket);
    shadows(fig.group);
    // La máquina: un cajón con ruedas, el cañón apuntando por encima de la red y el cesto de pelotas
    const BALL = 0xd8f23a;
    const mb = new Builder();
    mb.box(1.9, 1.5, 2.3, 0, 1.25, 0, C.azure, { r: 0.16 });
    mb.box(1.5, 0.5, 0.08, 0, 1.3, 1.17, C.white, { r: 0.04 });
    mb.box(1.6, 0.9, 1.7, 0, 2.45, -0.15, C.dgray, { r: 0.1 });
    mb.box(1.36, 0.06, 1.46, 0, 2.9, -0.15, C.black);
    mb.cyl(0.36, 1.5, 0, 2.0, 1.25, C.black, { rx: 1.15, seg: 14 });
    mb.cyl(0.4, 0.14, 0, 2.3, 1.92, C.lgray, { rx: 1.15, seg: 14 });
    for (const sx of [-1, 1]) {
      mb.cyl(0.5, 0.26, sx * 1.05, 0.5, -0.5, C.black, { axis: 'x', seg: 16 });
      mb.cyl(0.2, 0.3, sx * 1.05, 0.5, -0.5, C.lgray, { axis: 'x', seg: 10 });
      mb.box(0.12, 1.3, 0.12, sx * 0.6, 0.6, 0.85, C.lgray, { rx: 0.25 });
    }
    mb.box(0.1, 1.7, 0.1, 0, 2.6, -1.25, C.lgray, { rx: -0.35 });
    mb.cyl(0.07, 1.3, 0, 3.4, -1.55, C.black, { axis: 'x', seg: 8 });
    for (const [bx, bz] of [[-0.4, -0.5], [0.1, -0.6], [0.45, -0.2], [-0.3, 0.1], [0.2, 0.3], [-0.05, -0.15]]) mb.sphere(0.24, bx, 2.98, bz, BALL, { seg: 8, seg2: 6 });
    const machine = mb.mesh(plastic);
    const [mx, mz] = F.p(...P.machine);
    machine.position.set(mx, 0.16, mz);
    machine.rotation.y = Math.atan2(F.c, -F.s);
    shadows(machine);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: BALL, roughness: 0.6 }));
    ball.castShadow = true;
    ball.visible = false;
    const tag = nameTag(ch.name, '#ffffff');
    this.game.scene.add(fig.group, machine, ball, tag);
    const marker = { x: P.x, z: P.z, icon: '🎾' };
    this.markers.push(marker);
    this.leo = { P, F, fig, machine, ball, tag, marker, heading: Math.atan2(-F.c, F.s), lx: P.w / 2 - 7, lz: 0, x: P.x, z: P.z, phase: 0, t: 0, hit: 9, run: 0, from: [0, 0, 0], to: [0, 0, 0], H: 0, T: 1, cd: 0 };
  }

  updateLeo(dt, p, time, live) {
    const L = this.leo;
    const { P, F } = L;
    const vis = Math.hypot(p.pos.x - P.x, p.pos.z - P.z) < SEE;
    L.fig.group.visible = L.machine.visible = L.tag.visible = vis;
    if (!vis) {
      L.ball.visible = false;
      return;
    }
    const FLOOR = 0.16;
    const MOUTH = [P.machine[0] + 2, FLOOR + 2.4, P.machine[1]];
    // La pelota va por tramos: de la máquina al bote, del bote a la raqueta, la devolución y su bote
    const leg = (from, to, H, T) => Object.assign(L, { from, to, H, T, t: 0 });
    L.t += dt;
    L.hit += dt;
    if (L.t >= L.T) {
      L.phase = (L.phase + 1) % 5;
      if (L.phase === 0) leg(MOUTH, MOUTH, 0, 0.9); // la máquina recarga
      else if (L.phase === 1) leg(MOUTH, [L.lx - 6, FLOOR + 0.26, (Math.random() * 2 - 1) * (P.d / 2 - 6)], 3, 0.9);
      else if (L.phase === 2) leg(L.to, [L.lx - 0.9, FLOOR + 2.5, L.to[2]], 1.1, 0.42);
      else if (L.phase === 3) {
        // Casi todas pasan la red; alguna se le queda en ella
        L.hit = 0;
        L.net = Math.random() < 0.15;
        leg(L.to, L.net ? [0.5, FLOOR + 1.1, L.to[2] * 0.8] : [-P.w / 2 + 6 + Math.random() * 9, FLOOR + 0.26, (Math.random() * 2 - 1) * (P.d / 2 - 5)], L.net ? 0.5 : 2.6, L.net ? 0.5 : 1);
      } else {
        const [ax, , az] = L.from;
        const [bx, , bz] = L.to;
        leg(L.to, L.net ? [bx, FLOOR + 0.26, bz] : [bx + (bx - ax) * 0.4, FLOOR + 0.26, bz + (bz - az) * 0.4], L.net ? 0 : 1.3, 0.6);
      }
    }
    const k = Math.min(1, L.t / L.T);
    const bl = [0, 1, 2].map((i) => L.from[i] + (L.to[i] - L.from[i]) * k);
    const [wx, wz] = F.p(bl[0], bl[2]);
    L.ball.visible = L.phase > 0;
    L.ball.position.set(wx, bl[1] + 4 * L.H * k * (1 - k), wz);
    L.machine.rotation.x = L.phase === 1 ? -0.1 * Math.max(0, 1 - L.t * 5) : 0; // el culatazo del disparo
    // Leo corre a ponerse de lado a la pelota, que le llegue por la derecha, y luego vuelve al centro
    const want = L.phase === 1 || L.phase === 2 ? L.to[2] + 1.3 : L.lz * 0.5;
    const step = clamp(want - L.lz, -13 * dt, 13 * dt) * (L.phase === 1 || L.phase === 2 ? 1 : 0.35);
    L.lz += step;
    L.run = damp(L.run, Math.min(1, Math.abs(step) / dt / 6), 10, dt);
    const [x, z] = F.p(L.lx, L.lz);
    L.x = L.marker.x = x;
    L.z = L.marker.z = z;
    const f = L.fig;
    const w = time * 13;
    const sw = Math.sin(w) * L.run;
    f.legL.rotation.x = sw * 0.8;
    f.legR.rotation.x = -sw * 0.8;
    f.armL.rotation.x = -0.5 - sw * 0.5;
    // El golpe de derecha: arma el brazo atrás mientras llega la pelota y lo suelta hacia delante
    const back = L.phase === 2 ? Math.min(1, L.t / 0.25) : L.phase === 1 ? 0.3 : 0;
    const swing = L.hit < 0.5 ? Math.sin(Math.min(1, L.hit / 0.22) * Math.PI * 0.5) * (1 - Math.max(0, L.hit - 0.3) / 0.2) : 0;
    f.armR.rotation.x = -0.4 + back * 1.5 - swing * 2.3;
    f.armR.rotation.z = -(back + swing) * 0.5;
    f.head.rotation.y = clamp((bl[2] - L.lz) * 0.08, -0.6, 0.6) * (L.phase ? 1 : 0);
    f.group.position.set(x, FLOOR + Math.abs(Math.cos(w)) * 0.22 * L.run, z);
    f.group.rotation.set(0.1, L.heading - back * 0.6 + swing * 0.7, 0);
    L.tag.position.set(x, FLOOR + 6.6, z);
    // Si se le echan encima, aparta al que viene
    L.cd -= dt;
    const dx = p.pos.x - x;
    const dz = p.pos.z - z;
    const d2 = dx * dx + dz * dz;
    if (live && p.crashT <= 0 && d2 < 5 && p.pos.y < 3.5) {
      const d = Math.sqrt(d2) || 1;
      p.bump(dx / d, dz / d, 0.25, 0.8);
      if (L.cd <= 0) {
        L.cd = 1.2;
        this.game.sfx.bump();
      }
    }
  }

  // ---------- Iker, dando vueltas por el pueblo en su patinete eléctrico ----------
  buildIker() {
    const ch = characterById('iker');
    const veh = ch.build(COLORS[ch.color]);
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const fig = createMinifig(ch.look);
    fig.group.scale.setScalar(ch.scale);
    // De pie en la tabla y agarrado al manillar, como cuando lo lleva el jugador
    fig.group.position.set(0, veh.seatY, veh.seatZ);
    fig.group.rotation.x = 0.25;
    fig.armL.rotation.x = fig.armR.rotation.x = -1.72;
    fig.head.rotation.x = -0.2;
    root.add(veh.group, fig.group);
    shadows(root);
    const tag = nameTag(ch.name, '#f7d117');
    this.game.scene.add(root, tag);
    const marker = { x: 0, z: 0, icon: ch.icon };
    this.markers.push(marker);
    // Empieza en una calle cualquiera y va eligiendo por dónde tirar en cada cruce
    const s = randomSpot();
    const N = streetGraph().nodes;
    const edge = N[s.node].all.find((e) => e.to === s.to);
    this.iker = { root, veh, fig, tag, marker, from: s.node, edge, next: nextEdge(s.to, s.node), s: 0, x: N[s.node].x, z: N[s.node].z, heading: s.heading, speed: 0, lane: laneOf(edge), lean: 0, cd: 0, bell: 0 };
  }

  updateIker(dt, p, time, live) {
    const K = this.iker;
    const N = streetGraph().nodes;
    let A = N[K.from];
    let B = N[K.edge.to];
    let len = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    // Levanta el puño en las curvas cerradas que le vienen y frena si tiene al jugador delante
    const C2 = N[K.next.to];
    const turn = Math.abs(angDiff(Math.atan2(B.x - A.x, B.z - A.z), Math.atan2(C2.x - B.x, C2.z - B.z)));
    let target = 25 * (len - K.s < 12 ? 1 - 0.6 * Math.min(1, turn / 1.6) : 1);
    const fx = Math.sin(K.heading);
    const fz = Math.cos(K.heading);
    const dx = p.pos.x - K.x;
    const dz = p.pos.z - K.z;
    const fwd = dx * fx + dz * fz;
    const lat = dx * fz - dz * fx;
    K.bell -= dt;
    if (live && p.crashT <= 0 && fwd > 0 && fwd < 11 && Math.abs(lat) < 2.2 && p.pos.y < 4) {
      target = Math.min(target, Math.max(0, p.v * (Math.sin(p.heading) * fx + Math.cos(p.heading) * fz) * 0.8));
      if (K.bell <= 0) {
        K.bell = 2.5;
        this.game.sfx.bell();
      }
    }
    K.speed += clamp(target - K.speed, -34 * dt, 13 * dt);
    K.s += K.speed * dt;
    while (K.s >= len) {
      K.s -= len;
      K.from = K.edge.to;
      K.edge = K.next;
      K.next = nextEdge(K.edge.to, K.from);
      A = B;
      B = N[K.edge.to];
      len = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    }
    const ux = (B.x - A.x) / len;
    const uz = (B.z - A.z) / len;
    // El morro gira con suavidad hacia la calle y el patinete se queda por su derecha
    const da = angDiff(K.heading, Math.atan2(ux, uz));
    K.heading += da * Math.min(1, 7 * dt);
    K.lane = damp(K.lane, laneOf(K.edge), 2.5, dt);
    K.x = A.x + ux * K.s - Math.cos(K.heading) * K.lane;
    K.z = A.z + uz * K.s + Math.sin(K.heading) * K.lane;
    K.marker.x = K.x;
    K.marker.z = K.z;
    const far = Math.hypot(p.pos.x - K.x, p.pos.z - K.z) > SEE;
    K.root.visible = K.tag.visible = !far;
    if (far) return;
    const v = K.veh;
    const roll = (K.speed * dt) / v.wheelR;
    v.rear.rotation.x += roll;
    v.front.rotation.x += roll;
    const st = clamp(da * 1.4, -0.5, 0.5);
    v.steer.rotation.y = st;
    v.front.rotation.y = st * 0.6;
    K.lean = damp(K.lean, clamp(-da * K.speed * 0.05, -0.35, 0.35), 8, dt);
    K.fig.head.rotation.y = st * 0.8;
    const y = Math.max(0, Math.min(1, this.T.height(K.x, K.z)));
    lift(K.x, K.z);
    K.root.position.set(K.x, y, K.z);
    K.root.rotation.set(-Math.atan(grade.x * fx + grade.z * fz), K.heading, K.lean);
    K.tag.position.set(K.x, y + 7.3, K.z);
    // Si se le echan encima, se aparta al que viene sin caerse del patinete
    K.cd -= dt;
    const d2 = dx * dx + dz * dz;
    if (live && p.crashT <= 0 && d2 < 6.5 && Math.abs(p.pos.y - y) < 3) {
      const d = Math.sqrt(d2) || 1;
      p.bump(dx / d, dz / d, 0.25, 0.8);
      if (K.cd <= 0) {
        K.cd = 1.2;
        K.speed *= 0.5;
        this.game.sfx.bump();
      }
    }
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
    const fig = createMinifig(characterById('yago').look);
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

  // ---------- Adrián, el pequeño batería heavy, a la puerta de la Escuela de Música ----------
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

  // ---------- Jose y su padre en la canasta ----------
  buildJose() {
    const W = this.game.world;
    const home = W.places.home || W.places.spawn;
    // La canasta más cercana a casa
    let H = null;
    for (const h of W.places.hoops) if (!H || Math.hypot(h.x - home.x, h.z - home.z) < Math.hypot(H.x - home.x, H.z - home.z)) H = h;
    if (!H) return;
    const baller = (name, look, scale, color) => {
      const fig = createMinifig(look);
      fig.group.scale.setScalar(scale);
      shadows(fig.group);
      const tag = nameTag(name, color);
      this.game.scene.add(fig.group, tag);
      return { name, fig, tag, k: scale, x: 0, z: 0, y: 0, heading: 0, walk: 0, drib: 0, thud: false, moving: false, to: null, speed: 0, look: null, bounce: false, jump: null, follow: 0, push: 0, cheer: 0, away: false };
    };
    const ch = characterById('jose');
    const dad = baller('Padre de Jose', { torso: C.white, arms: C.skin, legs: C.blue, hair: 'none', face: 'senor', print: '#23', printColor: '#c91a09' }, 1, '#e8731a');
    const kid = baller(ch.name, ch.look, ch.scale, '#' + COLORS[ch.color].toString(16).padStart(6, '0'));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8731a, roughness: 0.6 }));
    ball.castShadow = true;
    this.game.scene.add(ball);
    const J = (this.jose = {
      H, dad, kid, ball, tx: H.nz, tz: -H.nx, t: 0, n: 0, made: 0, steps: null, i: 0, play: '', bag: [], seen: {}, fetcher: null,
      b: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, held: dad, fly: null, t: 0 },
    });
    J.marker = { x: H.x + H.nx * 8, z: H.z + H.nz * 8, icon: '🏀' };
    this.markers.push(J.marker);
    this.resetJose();
  }

  // Punto de la pista a cierta distancia de la canasta y desplazado hacia un lado
  spot(dist, side) {
    const J = this.jose;
    const H = J.H;
    return { x: H.x + H.nx * dist + J.tx * side, z: H.z + H.nz * dist + J.tz * side };
  }

  // Saque de fondo: cada uno a su sitio y el balón a las manos del padre de Jose. Al empezar, y cuando
  // Jose se va de paseo o vuelve a la pista.
  resetJose() {
    const J = this.jose;
    for (const [P, side] of [[J.dad, -3], [J.kid, 4]]) {
      Object.assign(P, this.spot(10, side), { y: 0, heading: Math.atan2(-J.H.nx, -J.H.nz), to: null, look: null, bounce: false, jump: null, follow: 0, push: 0, cheer: 0 });
    }
    J.b.held = J.dad;
    J.b.fly = null;
    J.steps = null;
  }

  // La siguiente jugada: una lista de pasos, y cada paso se repite en cada fotograma hasta que
  // devuelve true. Los pasos solo dicen adónde va cada uno, a quién mira y cuándo sale el balón.
  nextPlay() {
    const J = this.jose;
    const H = J.H;
    const b = J.b;
    const a = b.held || J.dad; // el que tiene el balón
    const m = J.kid.away ? null : a === J.dad ? J.kid : J.dad; // y su compañero, si lo hay
    const team = m ? [a, m] : [a];
    for (const P of team) P.look = H;
    const side = Math.min(H.half - 2.5, 6);
    const wide = H.half - 3.5;
    const rnd = Math.random;
    const s = rnd() < 0.5 ? -1 : 1;
    const go = (P, pt, speed) => {
      P.to = pt;
      P.speed = speed;
    };
    const at = (P) => !P.to || Math.hypot(P.to.x - P.x, P.to.z - P.z) < 0.4;
    const along = (P) => (P.x - H.x) * H.nx + (P.z - H.z) * H.nz;
    const pass = (from, to, kind) => {
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      b.held = null;
      b.fly = {
        x0: b.x, y0: b.y, z0: b.z, x1: b.x, y1: b.y, z1: b.z, rcv: to, kind, t: 0,
        T: kind === 'globo' ? 0.62 : clamp(dist / (kind === 'bote' ? 19 : 24), 0.28, 0.9),
        apex: kind === 'globo' ? 2 : kind === 'bote' ? 0 : 0.4 + dist * 0.03,
      };
      from.push = 0.28;
      from.bounce = false;
      return true;
    };
    const shoot = (P, kind) => {
      const lat = (P.x - H.x) * J.tx + (P.z - H.z) * J.tz;
      // El mate acaba colgado del aro; si el balón viene por el aire, llega cuando está arriba
      P.jump = { kind, t: 0, done: false, x0: P.x, z0: P.z, ...(kind === 'mate' ? this.spot(1.5, clamp(lat, -0.4, 0.4)) : null) };
      if (b.fly && b.fly.rcv === P) b.fly.T = b.fly.t + 0.36;
      P.to = null;
      P.bounce = false;
      return true;
    };

    // Tiro en suspensión, de media distancia o de lejos. El compañero espera el rebote bajo el aro.
    const jumper = (far) => {
      const from = far ? this.spot(Math.min(H.len / 2 - 2.5, 17) - rnd() * 2.5, (rnd() - 0.5) * 2 * side) : this.spot(8 + rnd() * 4, (rnd() - 0.5) * 2 * side);
      const under = this.spot(3.6, s * 3.4);
      return [
        () => {
          go(a, from, 6.5);
          a.look = H;
          if (m) {
            go(m, under, 7.5);
            m.look = a;
          }
          return at(a);
        },
        (t) => {
          a.bounce = t < 0.9;
          return t > 1.2;
        },
        () => shoot(a, far ? 'triple' : 'tiro'),
        () => !a.jump,
      ];
    };
    // Carrera botando hasta debajo del aro, para dejarla en bandeja o machacarla
    const drive = (kind) => {
      const start = this.spot(16, s * Math.min(side, 4));
      const end = kind === 'mate' ? this.spot(3.8, (rnd() - 0.5) * 1.2) : this.spot(3, (rnd() - 0.5) * 2);
      const wing = this.spot(9.5, -s * 7.5);
      return [
        () => {
          go(a, start, 6.5);
          if (m) {
            go(m, wing, 7.5);
            m.look = a;
          }
          return at(a);
        },
        () => {
          go(a, end, 13);
          return at(a);
        },
        () => shoot(a, kind),
        () => !a.jump,
      ];
    };
    // Rueda de pases, de pecho y picados, cambiando de sitio después de cada uno; el último tira
    const passing = () => {
      const n = 4 + Math.floor(rnd() * 2);
      const pos = (sg) => this.spot(7 + rnd() * 7, sg * (3.5 + rnd() * (wide - 3.5)));
      const pa = pos(s);
      const pm = pos(-s);
      const st = [
        () => {
          go(a, pa, 6.5);
          go(m, pm, 7.5);
          a.look = m;
          m.look = a;
          return at(a) && at(m);
        },
      ];
      for (let i = 0; i < n; i++) {
        const [from, to, sg] = i % 2 ? [m, a, -s] : [a, m, s];
        st.push(
          (t) => {
            from.bounce = t < 0.45;
            from.look = to;
            to.look = from;
            return t > 0.75 && at(to);
          },
          () => pass(from, to, i % 2 ? 'bote' : 'pecho'),
          () => {
            if (b.held !== to) return false;
            go(from, pos(sg), 8);
            return true;
          }
        );
      }
      const last = n % 2 ? m : a;
      st.push(
        (t) => {
          last.look = H;
          last.bounce = t < 0.5;
          return t > 0.8;
        },
        () => shoot(last, along(last) > 12.5 ? 'triple' : 'tiro'),
        () => !last.jump
      );
      return st;
    };
    // Pase y corte: la suelta al alero, corta hacia el aro y se la devuelven picada a la carrera
    const giveAndGo = () => {
      const top = this.spot(15.5, -s * 2);
      const wing = this.spot(9, s * 8);
      const rim = this.spot(3.5, -s * 1.3);
      const kind = rnd() < 0.4 ? 'mate' : 'entrada';
      return [
        () => {
          go(a, top, 6.5);
          go(m, wing, 7.5);
          a.look = m;
          m.look = a;
          return at(a) && at(m);
        },
        (t) => {
          a.bounce = t < 0.4;
          return t > 0.7;
        },
        () => pass(a, m, 'pecho'),
        () => {
          if (b.held !== m) return false;
          go(a, rim, 13);
          a.look = H;
          return true;
        },
        () => along(a) < 9.5,
        () => pass(m, a, 'bote'),
        () => b.held === a && at(a),
        () => shoot(a, kind),
        () => !a.jump,
      ];
    };
    // Alley-oop: el compañero corta desde lejos y el balón le llega por arriba, para machacarlo en el aire
    const alleyOop = () => {
      const wing = this.spot(10.5, s * 7.5);
      const top = this.spot(15, -s * 4);
      const rim = this.spot(3.9, -s * 0.8);
      return [
        () => {
          go(a, wing, 6.5);
          go(m, top, 7.5);
          a.look = m;
          m.look = a;
          return at(a) && at(m);
        },
        (t) => {
          a.bounce = t < 0.5;
          return t > 0.8;
        },
        () => {
          go(m, rim, 13);
          m.look = H;
          return along(m) < 6.5;
        },
        () => pass(a, m, 'globo'),
        () => at(m),
        () => shoot(m, 'mate'),
        () => !m.jump,
      ];
    };

    const book = { tiro: () => jumper(false), triple: () => jumper(true), entrada: () => drive('entrada'), mate: () => drive('mate'), pases: passing, corte: giveAndGo, alleyoop: alleyOop };
    let name;
    if (m) {
      // Entre los dos van pasando por todo el repertorio, cada vez en un orden
      if (!J.bag.length) J.bag = Object.keys(book).sort(() => rnd() - 0.5);
      name = J.bag.pop();
    } else name = J.n % 3 === 2 ? 'entrada' : 'tiro';
    J.play = name;
    J.seen[name] = (J.seen[name] || 0) + 1;
    J.fetcher = null;
    J.steps = book[name]();
    // Y toda jugada acaba igual: el que queda más cerca va a por el balón
    J.steps.push((t) => {
      if (b.held) return true;
      for (const P of team) P.look = b;
      if (b.fly || b.t < (m ? 0.6 : 1.5) || team.some((P) => P.cheer > 0)) return false;
      if (!J.fetcher) J.fetcher = team.reduce((F, P) => (Math.hypot(P.x - b.x, P.z - b.z) < Math.hypot(F.x - b.x, F.z - b.z) ? P : F));
      const F = J.fetcher;
      go(F, b, 8.5);
      if (Math.hypot(b.x - F.x, b.z - F.z) < 1.3 || t > 9) {
        b.held = F;
        F.to = null;
        F.drib = Math.PI / 2;
      }
      return false;
    });
    J.i = 0;
    J.t = 0;
  }

  updateJose(dt, p, time, live) {
    const J = this.jose;
    const H = J.H;
    const g = this.game;
    const b = J.b;
    const FLOOR = 0.16;
    const R = 0.56;
    const team = J.kid.away ? [J.dad] : [J.dad, J.kid];
    const vis = Math.hypot(p.pos.x - H.x - H.nx * 10, p.pos.z - H.z - H.nz * 10) < SEE;
    J.dad.fig.group.visible = J.dad.tag.visible = J.ball.visible = vis;
    J.kid.fig.group.visible = J.kid.tag.visible = vis && !J.kid.away;
    if (!vis) return;
    const vol = live ? clamp(1 - Math.hypot(p.pos.x - b.x, p.pos.z - b.z) / 75, 0, 1) : 0;

    // La jugada, paso a paso
    if (!J.steps) this.nextPlay();
    J.t += dt;
    if (J.steps[J.i](J.t)) {
      J.t = 0;
      if (++J.i >= J.steps.length) {
        J.steps = null;
        J.n++;
      }
    }

    // Las piernas: cada uno corre a su sitio o salta, y parado mira adonde le toca
    for (const P of team) {
      const S = P.jump;
      const toHoop = Math.atan2(H.x - P.x, H.z - P.z);
      P.moving = false;
      if (S) {
        S.t += dt;
        P.heading += angDiff(P.heading, toHoop) * Math.min(1, 12 * dt);
        if (S.kind === 'mate') {
          // Vuela hasta el aro, hunde el balón desde arriba y se queda colgado un momento
          const HANG = 1.3;
          const r = Math.min(1, S.t / 0.42);
          const e = r * r * (3 - 2 * r);
          P.x = S.x0 + (S.x - S.x0) * e;
          P.z = S.z0 + (S.z - S.z0) * e;
          P.y = S.t < 0.42 ? Math.sin((r * Math.PI) / 2) * 2.3 : S.t < 0.54 ? 2.3 - ((S.t - 0.42) / 0.12) * (2.3 - HANG) : S.t < 0.88 ? HANG : HANG * Math.max(0, 1 - (S.t - 0.88) / 0.16);
          if (!S.done && S.t >= 0.54) {
            S.done = true;
            if (b.fly && b.fly.rcv === P) b.held = P;
            if (b.held === P) {
              b.held = b.fly = null;
              b.t = 0;
              b.x = H.x;
              b.y = H.y + 0.1;
              b.z = H.z;
              b.vx = H.nx * 0.8;
              b.vz = H.nz * 0.8;
              b.vy = -11;
              J.made++;
              for (const Q of team) Q.cheer = Q === P ? 0.8 : 1.3;
              if (vol > 0.05) g.sfx.dunk(vol);
            }
          }
          if (S.t > 1.04) {
            P.y = 0;
            P.jump = null;
          }
        } else {
          const q = SHOTS[S.kind];
          P.y = Math.sin(Math.min(1, S.t / q.dur) * Math.PI) * q.h;
          if (q.run) {
            P.x += Math.sin(P.heading) * q.run * dt * Math.max(0, 1 - S.t / q.dur);
            P.z += Math.cos(P.heading) * q.run * dt * Math.max(0, 1 - S.t / q.dur);
          }
          if (!S.done && S.t > q.rel) {
            S.done = true;
            b.held = null;
            const make = Math.random() < q.pct;
            const miss = make ? 0 : 0.75;
            b.fly = { x0: b.x, y0: b.y, z0: b.z, x1: H.x + H.nx * miss, y1: H.y + (make ? 0.35 : 0.5), z1: H.z + H.nz * miss, T: q.T, t: 0, apex: q.apex, make, kind: S.kind };
          }
          if (S.t > q.dur) {
            P.y = 0;
            P.jump = null;
            P.follow = 0.7;
          }
        }
        continue;
      }
      const dx = P.to ? P.to.x - P.x : 0;
      const dz = P.to ? P.to.z - P.z : 0;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.05) {
        P.heading += angDiff(P.heading, Math.atan2(dx, dz)) * Math.min(1, 9 * dt);
        const st = Math.min(dd, P.speed * dt);
        P.x += (dx / dd) * st;
        P.z += (dz / dd) * st;
        P.walk += st * 0.75;
        P.moving = dd > 0.4;
      }
      if (!P.moving && P.look) P.heading += angDiff(P.heading, Math.atan2(P.look.x - P.x, P.look.z - P.z)) * Math.min(1, 8 * dt);
    }
    // Que no se pisen
    if (team.length > 1 && !J.dad.jump && !J.kid.jump) {
      const dx = J.kid.x - J.dad.x;
      const dz = J.kid.z - J.dad.z;
      const dd = Math.hypot(dx, dz) || 1;
      if (dd < 2.2) {
        const k = (2.2 - dd) / 2 / dd;
        J.kid.x += dx * k;
        J.kid.z += dz * k;
        J.dad.x -= dx * k;
        J.dad.z -= dz * k;
      }
    }

    // Balón: en las manos, botando, por el aire o suelto por la pista
    const hands = (P, out, key) => {
      const fx = Math.sin(P.heading);
      const fz = Math.cos(P.heading);
      const up = !!P.jump;
      out['x' + key] = P.x + fx * (up ? 0.5 : 0.9);
      out['y' + key] = FLOOR + (up ? P.y + 6.5 * P.k : 2.9 * P.k);
      out['z' + key] = P.z + fz * (up ? 0.5 : 0.9);
    };
    const P = b.held;
    if (P) {
      hands(P, b, '');
      const S = P.jump;
      if (S && S.kind === 'mate' && S.t > 0.42) {
        // El machaque: de encima de la cabeza al aro
        const k = Math.min(1, (S.t - 0.42) / 0.12);
        b.x += (H.x - b.x) * k;
        b.y += (H.y + 0.7 - b.y) * k;
        b.z += (H.z - b.z) * k;
      } else if (!S && (P.moving || P.bounce)) {
        P.drib += dt * 8.5;
        const k = Math.abs(Math.sin(P.drib));
        if (k < 0.12 && !P.thud) {
          P.thud = true;
          if (vol > 0.05) g.sfx.bounce(vol);
        } else if (k > 0.5) P.thud = false;
        // Lo bota con la derecha, un poco apartado del cuerpo
        b.x -= Math.cos(P.heading) * 0.85;
        b.y = FLOOR + R + k * 2.1 * P.k;
        b.z += Math.sin(P.heading) * 0.85;
      }
    } else if (b.fly) {
      const F = b.fly;
      const k0 = F.t / F.T;
      F.t += dt;
      const k = Math.min(1, F.t / F.T);
      // Un pase persigue las manos del que lo espera, aunque vaya corriendo o saltando
      if (F.rcv) hands(F.rcv, F, '1');
      b.x = F.x0 + (F.x1 - F.x0) * k;
      b.z = F.z0 + (F.z1 - F.z0) * k;
      if (F.kind === 'bote') {
        // Pase picado: toca el suelo pasada la mitad del camino
        const KB = 0.6;
        const u = (k - KB) / (1 - KB);
        b.y = k < KB ? F.y0 + (FLOOR + R - F.y0) * (k / KB) : FLOOR + R + (F.y1 - FLOOR - R) * (1 - (1 - u) * (1 - u));
        if (k0 < KB && k >= KB && vol > 0.05) g.sfx.bounce(vol);
      } else b.y = F.y0 + (F.y1 - F.y0) * k + 4 * F.apex * k * (1 - k);
      if (k >= 1) {
        b.fly = null;
        b.t = 0;
        if (F.rcv) {
          b.held = F.rcv;
          F.rcv.drib = Math.PI / 2;
        } else if (F.make) {
          J.made++;
          b.vx = H.nx * 1.2;
          b.vz = H.nz * 1.2;
          b.vy = -7;
          if (F.kind === 'triple') for (const Q of team) Q.cheer = 1.3;
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
    const ka = 1 - Math.exp(-22 * dt);
    for (const P of team) {
      const f = P.fig;
      const S = P.jump;
      const has = b.held === P;
      const sw = P.moving ? Math.sin(P.walk) : 0;
      let legL = sw * 0.75;
      let legR = -sw * 0.75;
      let armL = -sw * 0.6;
      let armR = sw * 0.6;
      let open = 0;
      let hop = 0;
      P.follow -= dt;
      P.push -= dt;
      if (S && S.kind === 'mate') {
        // Brazos arriba en el vuelo; colgado del aro, las piernas se le van hacia delante
        const hang = S.t > 0.5;
        armL = armR = hang ? -2.3 : -2.95;
        legL = hang ? -0.5 + Math.sin(S.t * 14) * 0.2 : 0.25;
        legR = hang ? -0.5 - Math.sin(S.t * 14) * 0.2 : -0.35;
      } else if (S || P.follow > 0) {
        armL = armR = -2.95;
        if (S) {
          legL = 0.25;
          legR = -0.35;
        }
      } else if (P.cheer > 0) {
        // Canastón: brazos al cielo y saltitos
        P.cheer -= dt;
        armL = armR = -2.8 + Math.sin(time * 15) * 0.22;
        open = 0.4;
        hop = Math.abs(Math.sin(time * 9)) * 0.5;
      } else if (P.push > 0) armL = armR = -1.6;
      else if (has && (P.moving || P.bounce)) {
        armR = -0.75 - Math.abs(Math.sin(P.drib)) * 0.55;
        armL = -sw * 0.5;
      } else if (has) armL = armR = -1.2;
      else if (b.fly && b.fly.rcv === P) {
        // Manos preparadas para recibir
        armL = armR = -1.35;
        open = 0.2;
      }
      f.legL.rotation.x = legL;
      f.legR.rotation.x = legR;
      f.armL.rotation.x += (armL - f.armL.rotation.x) * ka;
      f.armR.rotation.x += (armR - f.armR.rotation.x) * ka;
      f.armL.rotation.z = open;
      f.armR.rotation.z = -open;
      // Sin balón, no le quita ojo
      f.head.rotation.y = damp(f.head.rotation.y, has || S ? 0 : clamp(angDiff(P.heading, Math.atan2(b.x - P.x, b.z - P.z)), -1, 1), 8, dt);
      f.group.position.set(P.x, FLOOR + P.y + hop, P.z);
      f.group.rotation.y = P.heading;
      P.tag.position.set(P.x, FLOOR + P.y + hop + 6.7 * P.k, P.z);
      // El patinete no les atraviesa
      const d = Math.hypot(p.pos.x - P.x, p.pos.z - P.z);
      if (live && d < 2.3 && p.pos.y < 4 && p.crashT <= 0) p.bump((p.pos.x - P.x) / (d || 1), (p.pos.z - P.z) / (d || 1), 0.25, 0.8);
    }
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
    // Las tres con la camiseta rosa de su Camino de Santiago, y cada una con su pelo. Corren en
    // fila de a tres, hombro con hombro: Ana en medio (con el nombre más alto, para que no se
    // pisen los tres) y las otras dos a cada lado.
    const LOOKS = [
      ['Ana', 0, { legs: C.black, hair: 'curls', hairColor: 0x2a1b14, hairTips: 0x4a3021, face: 'grin', brows: 0x2a1b14, earrings: C.lgray }],
      ['Cintia', 2.6, { legs: 0x4a262b, hair: 'mane', hairColor: 0xb8935a, hairTips: 0xe8cb8a, face: 'grin', brows: 0x8a6a3e }],
      ['Bea', -2.6, { legs: C.black, hair: 'bob', hairColor: 0x1d1512, face: 'smile', brows: 0x1d1512, earrings: C.white }],
    ];
    const list = LOOKS.map(([name, off, look], i) => {
      const fig = createMinifig({ torso: TEE, arms: TEE, lashes: true, shirt: { front: 'camino', long: true }, ...look });
      fig.group.rotation.order = 'YXZ';
      shadows(fig.group);
      const tag = nameTag(name, '#f3a9c2');
      g.scene.add(fig.group, tag);
      return { name, fig, tag, off, tagY: off ? 6.6 : 7.8, s: 0, seg: 0, x: 0, z: 0, heading: 0, dodge: 0, fly: 0, vy: 0, y: 0, cd: 0, ph: i * 2.1, init: false };
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
      const want = R.s;
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
        j.tag.position.set(j.x, f.group.position.y + j.tagY, j.z);
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
      j.tag.position.set(nx, gy + j.tagY, nz);
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

  // ---------- Emma, de visita: selfies y corazones en el parque El Palmeral ----------
  buildEmma() {
    const g = this.game;
    const T = this.T;
    const gate = g.world.places.homes.emma;
    if (!gate) return;
    // Pasada la puerta, en un claro del parque por el que no pasen las corredoras
    const ux = Math.sin(gate.rot);
    const uz = Math.cos(gate.rot);
    const R = this.joggers;
    const crowded = (x, z) => {
      if (!R) return false;
      for (let i = 1; i < R.pts.length; i++) {
        const [ax, az] = R.pts[i - 1];
        const dx = R.pts[i][0] - ax;
        const dz = R.pts[i][1] - az;
        const k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        if (Math.hypot(x - ax - dx * k, z - az - dz * k) < 8) return true;
      }
      return false;
    };
    const clear = (x, z) => {
      for (let a = 0; a < 8; a++) {
        const h = T.height(x + Math.cos(a * 0.8) * (a ? 3 : 0), z + Math.sin(a * 0.8) * (a ? 3 : 0));
        if (h > 0.3 || h < -0.3) return false;
      }
      return !crowded(x, z);
    };
    let spot = null;
    for (const dist of [24, 30, 18, 38, 46]) {
      for (const side of [0, 8, -8, 16, -16]) {
        const x = gate.x + ux * dist + uz * side;
        const z = gate.z + uz * dist - ux * side;
        if (!spot && clear(x, z)) spot = { x, z };
      }
    }
    if (!spot) return;
    const ch = characterById('emma');
    const fig = createMinifig(ch.look);
    fig.group.scale.setScalar(ch.scale);
    const skates = createSkates(COLORS[ch.color]);
    skates.wear(fig);
    // El móvil, en la mano derecha: queda derecho cuando levanta el brazo para la foto
    const pb = new Builder();
    pb.box(0.52, 0.9, 0.1, 0, 0.28, 0, 0xff5fa2, { r: 0.04 });
    pb.box(0.42, 0.78, 0.03, 0, 0.28, -0.06, 0x9fd8f2);
    pb.cyl(0.07, 0.04, 0.13, 0.56, 0.06, C.black, { axis: 'z', seg: 8 });
    const phone = pb.mesh(plastic);
    phone.position.set(-0.2, -1.56, 0.2);
    phone.rotation.x = 1.9;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    flash.position.set(0, 0.3, 0);
    flash.visible = false;
    phone.add(flash);
    fig.armR.add(phone);
    shadows(fig.group);
    // Corazones de plástico que suben a su alrededor
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.5);
    sh.bezierCurveTo(-1.0, 0.1, -0.55, 0.8, 0, 0.3);
    sh.bezierCurveTo(0.55, 0.8, 1.0, 0.1, 0, -0.5);
    const hgeo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 8 });
    hgeo.translate(0, 0, -0.1);
    const mats = [[0xff2f5f, 0x7a0c26], [0xff7ab8, 0x7a2450], [0xe3000b, 0x5c0005]].map(([color, emissive]) => new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.3 }));
    const fx = new THREE.Group();
    const hearts = Array.from({ length: 14 }, (_, i) => {
      const m = new THREE.Mesh(hgeo, mats[i % mats.length]);
      m.visible = false;
      fx.add(m);
      return { m, t: 0, life: 1, vx: 0, vy: 0, vz: 0, s: 1, w: 0 };
    });
    const y = T.height(spot.x, spot.z);
    fig.group.position.set(spot.x, y + skates.seatY * ch.scale, spot.z);
    fx.position.set(spot.x, y, spot.z);
    const tag = nameTag('Emma', '#ff5fa2');
    tag.position.set(spot.x, y + 7.2, spot.z);
    g.scene.add(fig.group, fx, tag);
    // Empieza de espaldas a la puerta, que salga de fondo en la primera foto
    const heading = Math.atan2(ux, uz);
    // En el minimapa la señala su misión, «Selfie con Emma», que empieza a su espalda
    const start = { x: spot.x - ux * 9, z: spot.z - uz * 9, heading };
    this.emma = { ...spot, y, fig, phone, flash, fx, hearts, tag, start, heading, want: heading, t: 0, phase: 0, n: 0, heart: 0, pop: 0, cursor: 0, session: false, onShot: null, joy: 1 };
  }

  // Un corazón nuevo alrededor de Emma (o varios de golpe con cada foto)
  heart(E, n = 1) {
    for (let i = 0; i < n; i++) {
      const h = E.hearts[E.cursor++ % E.hearts.length];
      const a = Math.random() * TAU;
      const r = 1.7 + Math.random() * 1.5;
      h.m.position.set(Math.cos(a) * r, 2.4 + Math.random() * 2.8, Math.sin(a) * r);
      h.vx = Math.cos(a) * 0.5;
      h.vz = Math.sin(a) * 0.5;
      h.vy = 1.5 + Math.random() * 1.4;
      h.s = 0.36 + Math.random() * 0.34;
      h.w = (Math.random() - 0.5) * 5;
      h.t = h.life = 1.5 + Math.random() * 0.8;
      h.m.rotation.y = a;
    }
  }

  updateEmma(dt, p, time, live) {
    const E = this.emma;
    const g = this.game;
    const f = E.fig;
    const dx = p.pos.x - E.x;
    const dz = p.pos.z - E.z;
    const d = Math.hypot(dx, dz);
    // En plena sesión sigue disparando aunque te vayas lejos: la misión no se queda esperándote
    const vis = d < SEE || E.session;
    f.group.visible = E.tag.visible = E.fx.visible = vis;
    if (!vis) return;
    const near = live && d < 13 && Math.abs(p.pos.y - E.y) < 4 && !p.hidden;
    // Sesión de fotos en bucle: apunta, posa, dispara, mira cómo ha quedado y cambia de ángulo
    const POSES = [
      { arm: [-2.75, 0.5], tilt: 0.28, leg: 0 }, // victoria
      { arm: [0.25, 0.85], tilt: -0.26, leg: -0.6 }, // brazo suelto y un patín adelante
      { arm: [-1.5, 1.3], tilt: 0.2, leg: 0 }, // brazo en cruz
    ];
    const DUR = [0.5, 1.3, 0.4, 1.5, 0.8];
    const pose = POSES[E.n % POSES.length];
    E.t += dt;
    if (E.t >= DUR[E.phase]) {
      E.t = 0;
      E.phase = (E.phase + 1) % DUR.length;
      if (E.phase === 2) {
        // ¡Foto!
        E.pop = 1;
        // En plena sesión es la misión quien dice cómo ha quedado la foto
        if (E.onShot) E.onShot();
        else this.heart(E, 5);
        // Y ya tiene pensado el ángulo siguiente, uno distinto de verdad y a cualquier lado: da tiempo a recolocarse
        if (E.session) E.want = E.heading + (1.1 + Math.random() * 1.2) * (Math.random() < 0.5 ? 1 : -1);
        const vol = live ? clamp(1 - d / 45, 0, 1) : 0;
        if (vol > 0.05) g.sfx.selfie(vol);
      } else if (E.phase === 4) {
        E.n++;
        if (!E.session) E.want += (0.7 + Math.random() * 0.9) * (E.n % 2 ? 1 : -1);
      }
    }
    // Si te acercas, se gira para sacarte de fondo en la foto; en la sesión, quien se coloca eres tú
    const turn = near && !E.session;
    if (turn) E.want = Math.atan2(-dx, -dz);
    E.heading += angDiff(E.heading, E.want) * Math.min(1, (E.phase === 4 || turn ? 5 : 0) * dt);
    const posing = E.phase < 3;
    const k = Math.min(1, 12 * dt);
    const to = (o, key, v) => {
      o.rotation[key] += (v - o.rotation[key]) * k;
    };
    const sway = Math.sin(time * 2.4) * 0.05;
    to(f.armR, 'x', posing ? -1.9 + sway : E.phase === 3 ? -1.1 : -0.6);
    to(f.armR, 'z', posing ? -0.4 : -0.1);
    to(f.armL, 'x', posing ? pose.arm[0] : 0.1);
    to(f.armL, 'z', posing ? pose.arm[1] + sway : 0.15);
    to(f.head, 'x', posing ? -0.12 : E.phase === 3 ? 0.5 : 0);
    to(f.head, 'y', posing ? -0.32 : E.phase === 3 ? -0.15 : 0);
    to(f.head, 'z', posing ? pose.tilt : 0);
    to(f.legL, 'x', posing ? pose.leg : 0);
    to(f.group, 'x', posing ? -0.08 : 0);
    // Saltito de alegría cuando la foto ha quedado bien
    const hop = E.phase === 3 && E.t > 0.55 ? Math.abs(Math.sin((E.t - 0.55) * 7)) * Math.max(0, 1 - (E.t - 0.55) / 0.9) * 0.55 * E.joy : 0;
    f.group.position.y = E.y + f.group.scale.y * 0.48 + hop;
    f.group.rotation.y = E.heading;
    E.pop = Math.max(0, E.pop - dt * 7);
    E.flash.visible = E.pop > 0.02;
    E.flash.scale.setScalar(0.4 + E.pop * 3.2);

    E.heart -= dt;
    if (E.heart <= 0) {
      E.heart = (posing ? 0.3 : 0.55) * (near ? 0.5 : 1);
      this.heart(E);
    }
    for (const h of E.hearts) {
      if (h.t <= 0) continue;
      h.t -= dt;
      const m = h.m;
      m.visible = h.t > 0;
      const age = h.life - h.t;
      m.position.x += (h.vx + Math.sin(time * 3 + h.w) * 0.35) * dt;
      m.position.y += h.vy * dt;
      m.position.z += h.vz * dt;
      m.rotation.y += h.w * dt;
      m.scale.setScalar(h.s * Math.min(1, age / 0.18) * Math.min(1, h.t / 0.4));
    }
    // El patinete no la atraviesa
    if (live && d < 2.3 && Math.abs(p.pos.y - E.y) < 4 && p.crashT <= 0) p.bump(dx / (d || 1), dz / (d || 1), 0.25, 0.8);
  }
}
