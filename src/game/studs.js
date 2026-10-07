import * as THREE from 'three';
import { studGeometry, goldBrickGeometry } from '../lego/models.js';
import { goldMetal } from '../lego/materials.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export const STUD_VALUE = [10, 100, 1000];
const STUD_COLOR = [0xe3e9ef, 0xffbe0b, 0x2f7dff];

// Studs coleccionables (plata 10, oro 100, azul 1000) y ladrillos dorados.
export class Studs {
  constructor(game, spots, bricks) {
    this.game = game;
    this.items = [];
    this.max = spots.length + 220;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.75 });
    this.mesh = new THREE.InstancedMesh(studGeometry(), mat, this.max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; // son muchos: sin sombra se dibujan la mitad de triángulos
    for (const s of spots) this._add(s.x, s.y, s.z, s.type, false);
    this.nStatic = this.items.length;
    for (let i = this.nStatic; i < this.max; i++) this._add(0, -99, 0, 0, true);
    this.cursor = this.nStatic;
    game.scene.add(this.mesh);

    // Ladrillos dorados
    this.bricks = bricks.map((b, id) => {
      const m = new THREE.Mesh(BRICK_GEO || (BRICK_GEO = goldBrickGeometry()), goldMetal);
      m.position.set(b.x, b.y, b.z);
      m.castShadow = true;
      const taken = game.save.bricks.includes(id);
      m.visible = !taken;
      game.scene.add(m);
      return { ...b, id, mesh: m, taken };
    });
    this.t = 0;
  }

  _add(x, y, z, type, dyn) {
    const i = this.items.length;
    this.items.push({ x, y, z, by: y, type, dyn, alive: !dyn, vx: 0, vy: 0, vz: 0, life: 0, t: 0, floor: 0, ph: (x * 0.37 + z * 0.23) % 6.28 });
    _c.setHex(STUD_COLOR[type]);
    this.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
  }

  // Studs que saltan al romper algo
  burst(x, y, z, n, type = 0, floor = 0, power = 9) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor++;
      if (this.cursor >= this.max) this.cursor = this.nStatic;
      const it = this.items[i];
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * power * 0.6;
      it.x = x;
      it.y = y + 0.5;
      it.z = z;
      it.vx = Math.cos(a) * r;
      it.vz = Math.sin(a) * r;
      it.vy = power * (0.7 + Math.random() * 0.6);
      it.type = type;
      it.alive = true;
      it.life = 11;
      it.t = 0;
      it.floor = floor;
      _c.setHex(STUD_COLOR[type]);
      this.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, player) {
    this.t += dt;
    const px = player.pos.x;
    const py = player.pos.y + 1.6;
    const pz = player.pos.z;
    const can = player.crashT <= 0;
    const spin = this.t * 3.2;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it.alive) {
        if (!it.dyn && it.t > 0) {
          it.t -= dt;
          if (it.t <= 0 && Math.hypot(it.x - px, it.z - pz) > 25) {
            it.alive = true;
            it.y = it.by;
          } else if (it.t <= 0) it.t = 2;
        }
        if (!it.hidden) {
          _m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, _m);
          it.hidden = true;
        }
        continue;
      }
      it.hidden = false;
      const dx = px - it.x;
      const dz = pz - it.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 220 * 220 && !it.dyn && it.placed) continue;
      it.placed = true;
      let scale = 1;
      if (it.dyn) {
        it.t += dt;
        it.life -= dt;
        if (it.life <= 0) {
          it.alive = false;
          continue;
        }
        it.vy -= 34 * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.z += it.vz * dt;
        if (it.y < it.floor + 0.9) {
          it.y = it.floor + 0.9;
          it.vy = it.vy < -3 ? -it.vy * 0.5 : 0;
          it.vx *= 0.8;
          it.vz *= 0.8;
        }
        if (it.life < 3) scale = Math.floor(it.life * 8) % 2 ? 1 : 0.55;
      }
      const dy = py - it.y;
      const d3 = d2 + dy * dy;
      if (can && (!it.dyn || it.t > 0.4)) {
        if (d3 < 7.5) {
          it.alive = false;
          if (!it.dyn) it.t = 70;
          this.game.onStud(it.type, it.x, it.y, it.z);
          continue;
        }
        if (d3 < 60) {
          // Imán: los studs cercanos vuelan hacia el patinete
          const d = Math.sqrt(d3);
          const sp = (26 * (1 - d / 8) + 10 + player.speed * 0.6) * dt;
          it.x += (dx / d) * sp;
          it.y += (dy / d) * sp;
          it.z += (dz / d) * sp;
        }
      }
      const bob = it.dyn ? 0 : Math.sin(this.t * 2.4 + it.ph) * 0.18;
      _q.setFromAxisAngle(_up, spin + it.ph);
      _m.compose(_p.set(it.x, it.y + bob, it.z), _q, _s.set(scale, scale, scale));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (const b of this.bricks) {
      if (b.taken) continue;
      b.mesh.rotation.y = this.t * 1.4;
      b.mesh.position.y = b.y + Math.sin(this.t * 2 + b.id) * 0.3;
      if (can && Math.hypot(b.x - px, b.z - pz) < 3 && Math.abs(b.mesh.position.y - py) < 3.2) {
        b.taken = true;
        b.mesh.visible = false;
        this.game.onBrick(b);
      }
    }
  }
}

let BRICK_GEO = null;
