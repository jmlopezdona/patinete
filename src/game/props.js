import * as THREE from 'three';
import { propModel } from '../lego/models.js';
import { plastic } from '../lego/materials.js';
import { lift } from '../world/relief.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Mobiliario urbano que revienta en ladrillos al embestirlo y se reconstruye solo.
export class Props {
  constructor(game, list) {
    this.game = game;
    this.items = [];
    const byType = new Map();
    for (const p of list) {
      if (!byType.has(p.type)) byType.set(p.type, []);
      byType.get(p.type).push(p);
    }
    for (const [type, arr] of byType) {
      const model = propModel(type);
      const mesh = new THREE.InstancedMesh(model.geo, plastic, arr.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      arr.forEach((p, idx) => {
        const it = { ...p, idx, mesh, model, alive: true, t: 0, pop: 1 };
        this.items.push(it);
        this._set(it, 1);
      });
      game.scene.add(mesh);
    }
  }

  _set(it, scale) {
    _q.setFromAxisAngle(_up, it.rot);
    _m.compose(_p.set(it.x, it.y + lift(it.x, it.z), it.z), _q, _s.set(scale, scale, scale));
    it.mesh.setMatrixAt(it.idx, _m);
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  smash(it, vx = 0, vz = 0) {
    it.alive = false;
    it.t = 40;
    this._set(it, 0);
    this.game.bits.burst(it.x, it.y + 0.6, it.z, it.model.colors, 12, 9, it.y, 1, vx * 0.5, vz * 0.5);
    this.game.studs.burst(it.x, it.y + 0.8, it.z, it.model.reward, 0, it.y, 8);
    this.game.onSmash(it);
  }

  update(dt, player) {
    const px = player.pos.x;
    const pz = player.pos.z;
    const py = player.pos.y;
    const sp = player.speed;
    const active = player.crashT <= 0;
    for (const it of this.items) {
      const dx = px - it.x;
      const dz = pz - it.z;
      if (!it.alive) {
        it.t -= dt;
        if (it.t <= 0 && dx * dx + dz * dz > 900) {
          it.alive = true;
          it.pop = 0;
        }
        continue;
      }
      if (it.pop < 1) {
        it.pop = Math.min(1, it.pop + dt * 3);
        const k = it.pop;
        this._set(it, 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k));
      }
      if (!active) continue;
      const r = it.model.r + 1.0;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && py - it.y < 2.4 && py - it.y > -1.5) {
        if (sp > 5) {
          const v = this.game.tmpV;
          player.velocity(v);
          this.smash(it, v.x, v.z);
          if (player.grounded) player.v *= 0.93;
        } else {
          const d = Math.sqrt(d2) || 1;
          player.bump(dx / d, dz / d, (r - d) * 0.6, 0.8);
        }
      }
    }
  }
}
