import * as THREE from 'three';
import { bitGeometry } from '../lego/models.js';
import { lift } from '../world/relief.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Escombros y partículas: todo son ladrillitos 1x1 con física sencilla.
export class Bits {
  constructor(scene, max = 700) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(bitGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.35 }), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.d = new Float32Array(max * 16); // px py pz vx vy vz rx ry rz wx wy wz life max size floor
    this.cursor = 0;
    this.alive = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, _m);
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, color, size = 1, life = 2.5, floor = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const d = this.d;
    const o = i * 16;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = vx;
    d[o + 4] = vy;
    d[o + 5] = vz;
    d[o + 6] = Math.random() * 6;
    d[o + 7] = Math.random() * 6;
    d[o + 8] = Math.random() * 6;
    d[o + 9] = (Math.random() - 0.5) * 16;
    d[o + 10] = (Math.random() - 0.5) * 16;
    d[o + 11] = (Math.random() - 0.5) * 16;
    d[o + 12] = life;
    d[o + 13] = life;
    d[o + 14] = size;
    d[o + 15] = floor;
    _c.setHex(color);
    this.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(x, y, z, colors, count, power, floor = 0, size = 1, bvx = 0, bvz = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * power;
      this.spawn(
        x + (Math.random() - 0.5) * 1.4, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.4,
        Math.cos(a) * r + bvx, power * (0.45 + Math.random() * 0.75), Math.sin(a) * r + bvz,
        colors[i % colors.length], size * (0.7 + Math.random() * 0.6), 2 + Math.random() * 1.6, floor
      );
    }
  }

  update(dt) {
    const d = this.d;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const o = i * 16;
      if (d[o + 12] <= 0) continue;
      any = true;
      d[o + 12] -= dt;
      if (d[o + 12] <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      d[o + 4] -= 38 * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      const fl = d[o + 15] + 0.3 * d[o + 14];
      if (d[o + 1] < fl) {
        d[o + 1] = fl;
        if (d[o + 4] < -4) {
          d[o + 4] *= -0.42;
          d[o + 3] *= 0.7;
          d[o + 5] *= 0.7;
        } else {
          d[o + 4] = 0;
          const f = Math.max(0, 1 - 6 * dt);
          d[o + 3] *= f;
          d[o + 5] *= f;
          d[o + 9] *= f;
          d[o + 10] *= f;
          d[o + 11] *= f;
        }
      }
      d[o + 6] += d[o + 9] * dt;
      d[o + 7] += d[o + 10] * dt;
      d[o + 8] += d[o + 11] * dt;
      const k = Math.min(1, d[o + 12] / 0.35) * d[o + 14];
      _e.set(d[o + 6], d[o + 7], d[o + 8]);
      _q.setFromEuler(_e);
      _m.compose(_p.set(d[o], d[o + 1] + lift(d[o], d[o + 2]), d[o + 2]), _q, _s.set(k, k, k));
      this.mesh.setMatrixAt(i, _m);
    }
    if (any || this.wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasAny = any;
  }
}
