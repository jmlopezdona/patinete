import * as THREE from 'three';
import { angDiff, damp, clamp } from '../core/rng.js';

const _d = new THREE.Vector3();
const _l = new THREE.Vector3();

// Cámara de persecución con suavizado, anticolisión y sensación de velocidad.
export class ChaseCamera {
  constructor(game) {
    this.game = game;
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.4, 1700);
    this.yaw = 0;
    this.snap = true;
    this.mode = 0;
    this.shake = 0;
    this.look = new THREE.Vector3();
    this.dist = 13;
  }

  addShake(a) {
    this.shake = Math.min(1.2, this.shake + a);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const T = g.terrain;
    const sp = p.speed;
    // Dirección objetivo: la de marcha (en el aire, la de la velocidad)
    let ty = p.heading;
    if (!p.grounded && !p.grind) {
      const vh = Math.hypot(p.vel.x, p.vel.z);
      ty = vh > 6 && !p.vertAir ? Math.atan2(p.vel.x, p.vel.z) : this.yaw;
    }
    if (this.snap) this.yaw = ty;
    else this.yaw += angDiff(this.yaw, ty) * (1 - Math.exp(-(p.grounded ? 3.6 : 1.6) * dt));

    const far = this.mode === 1;
    const k = clamp(sp / p.stats.vboost, 0, 1);
    const big = p.char.cam; // los vehículos grandes se ven desde un poco más lejos
    const distT = ((far ? 22 : 13.5) + k * 3.5) * big;
    const height = ((far ? 11 : 6.2) + k * 0.6) * (0.6 + 0.4 * big);
    this.dist = damp(this.dist, distT, 4, dt);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const px = p.root.position.x;
    const py = p.root.position.y;
    const pz = p.root.position.z;

    // Si un edificio tapa la vista, la cámara se acerca
    let s = 1;
    for (let i = 2; i <= 10; i++) {
      const t = i / 10;
      const x = px - fx * this.dist * t;
      const z = pz - fz * this.dist * t;
      const y = py + 2.6 + (height - 2.6) * t;
      if (T.height(x, z) > y - 0.6) {
        s = Math.max(0.22, (i - 1) / 10);
        break;
      }
    }
    _d.set(px - fx * this.dist * s, py + 2.6 + (height - 2.6) * Math.max(s, 0.55) + (1 - s) * 2.5, pz - fz * this.dist * s);
    const floor = T.height(_d.x, _d.z);
    if (floor < py + 30 && _d.y < floor + 1.2) _d.y = floor + 1.2;
    _l.set(px + fx * 4, py + 2.9, pz + fz * 4);

    if (this.snap) {
      this.cam.position.copy(_d);
      this.look.copy(_l);
      this.snap = false;
    } else {
      const a = 1 - Math.exp(-9 * dt);
      this.cam.position.x += (_d.x - this.cam.position.x) * a;
      this.cam.position.z += (_d.z - this.cam.position.z) * a;
      this.cam.position.y += (_d.y - this.cam.position.y) * (1 - Math.exp(-5 * dt));
      this.look.lerp(_l, 1 - Math.exp(-12 * dt));
    }
    if (this.shake > 0.001) {
      this.shake = damp(this.shake, 0, 6, dt);
      this.cam.position.x += (Math.random() - 0.5) * this.shake;
      this.cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.cam.lookAt(this.look);
    const fov = 60 + k * 15 + (p.boosting ? 5 : 0);
    this.cam.fov = damp(this.cam.fov, fov, 5, dt);
    this.cam.updateProjectionMatrix();
  }
}
