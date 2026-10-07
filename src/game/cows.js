import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { plastic } from '../lego/materials.js';
import { C } from '../lego/colors.js';
import { damp } from '../core/rng.js';

const SEE = 260; // más lejos no se dibujan
// Dónde pastan, medido desde el centro de la pista de tierra del Mega Salto: x, z y hacia dónde miran
const SPOTS = [
  [-44, 17, 0.7],
  [-6, -16, 2.5],
  [38, 19, -1.1],
];

function cowParts() {
  const b = new Builder();
  b.box(1.9, 1.9, 4.2, 0, 2.3, 0, C.white, { r: 0.35 });
  // Manchas
  b.box(1.96, 1.2, 1.3, 0, 2.62, -0.9, C.black, { r: 0.3 });
  b.box(1.0, 0.9, 1.1, 0.5, 2.82, 0.95, C.black, { r: 0.25 });
  b.box(0.9, 0.8, 0.9, -0.55, 1.9, 0.3, C.black, { r: 0.25 });
  for (const sx of [-0.62, 0.62]) {
    for (const sz of [-1.6, 1.6]) {
      b.box(0.5, 1.2, 0.5, sx, 0.9, sz, C.white);
      b.box(0.54, 0.3, 0.54, sx, 0.15, sz, C.black);
    }
  }
  b.sphere(0.5, 0, 1.3, -1.0, C.pink, { seg: 12, seg2: 8 });
  b.box(0.14, 1.3, 0.14, 0, 2.4, -2.16, C.white);
  b.box(0.24, 0.34, 0.24, 0, 1.64, -2.16, C.black);
  const body = b.geometry();
  // La cabeza va aparte para que pueda bajarla a pastar; gira por el cuello
  b.box(1.2, 1.15, 1.5, 0, 0.1, 0.75, C.white, { r: 0.25 });
  b.box(1.04, 0.62, 0.5, 0, -0.16, 1.62, C.pink, { r: 0.2 });
  for (const s of [-1, 1]) {
    b.box(0.16, 0.2, 0.1, s * 0.34, 0.3, 1.5, C.black);
    b.box(0.5, 0.3, 0.14, s * 0.82, 0.42, 0.42, C.black, { rz: s * 0.4 });
    b.cyl(0.11, 0.5, s * 0.4, 0.86, 0.5, C.tan, { r2: 0.04, seg: 8 });
  }
  return { body, head: b.geometry() };
}

// Las vacas del campo del Mega Salto. De día solo pastan; de noche el platillo les tiene echado el ojo.
export class Cows {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.mooCd = 0;
    const m = game.world.places.mega;
    const geo = cowParts();
    for (const [dx, dz, heading] of SPOTS) {
      const x = m.x + dx;
      const z = m.z + dz;
      if (Math.abs(game.terrain.height(x, z)) > 0.3) continue;
      const group = new THREE.Group();
      const body = new THREE.Mesh(geo.body, plastic);
      const head = new THREE.Mesh(geo.head, plastic);
      body.castShadow = head.castShadow = true;
      head.position.set(0, 2.75, 1.9);
      group.add(body, head);
      group.position.set(x, 0, z);
      group.rotation.y = heading;
      game.scene.add(group);
      this.list.push({ group, head, x, z, heading, ph: this.list.length * 2.1, taken: false });
    }
  }

  update(dt, p, time) {
    this.mooCd -= dt;
    for (const c of this.list) {
      if (c.taken) continue; // en el rayo del platillo: la mueve la invasión
      const dx = p.pos.x - c.x;
      const dz = p.pos.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      c.group.visible = d < SEE;
      if (d > SEE) continue;
      // Pasta con la cabeza gacha y la levanta para mirarte cuando te acercas
      const graze = d < 16 ? -0.15 : 0.85 + Math.sin(time * 5 + c.ph) * 0.07 * (Math.sin(time * 0.4 + c.ph) > 0 ? 1 : 0);
      c.head.rotation.x = damp(c.head.rotation.x, graze, 5, dt);
      if (d < 2.9 && p.pos.y < 3.5 && p.crashT <= 0) {
        p.bump(dx / d, dz / d, 2.9 - d, 0.6);
        this.moo(d);
      }
    }
  }

  moo(dist) {
    if (this.mooCd > 0 || dist > 90) return;
    this.mooCd = 2.5;
    this.game.sfx.moo();
  }
}
