import * as THREE from 'three';

// Banderas por pieza interpretadas por el shader de ladrillos.
export const F = { STUDS: 1, SEAMS: 2, WINDOW: 4, GLOW: 8, LIT: 16 };

const _c = new THREE.Color();
const cache = new Map();
function lin(hex) {
  let v = cache.get(hex);
  if (!v) {
    _c.setHex(hex);
    v = [_c.r, _c.g, _c.b];
    cache.set(hex, v);
  }
  return v;
}

// Acumula miles de ladrillos (cajas) y los dibuja con un único InstancedMesh.
export class BrickBatch {
  constructor() {
    this.mats = [];
    this.cols = [];
    this.flags = [];
    this.n = 0;
    this.sm = [];
    this.sc = [];
    this.sn = 0;
  }

  // Caja con (x, z) en el centro e y en la base. rot = giro alrededor de Y.
  box(x, y, z, w, h, d, color, flags = 0, rot = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    this.mats.push(c * w, 0, -s * w, 0, 0, h, 0, 0, s * d, 0, c * d, 0, x, y + h / 2, z, 1);
    const l = lin(color);
    this.cols.push(l[0], l[1], l[2]);
    this.flags.push(flags);
    this.n++;
  }

  // Caja con una matriz arbitraria (toldos inclinados, etc.)
  boxM(m, color, flags = 0) {
    for (let i = 0; i < 16; i++) this.mats.push(m.elements[i]);
    const l = lin(color);
    this.cols.push(l[0], l[1], l[2]);
    this.flags.push(flags);
    this.n++;
  }

  // Rejilla de studs con geometría real (para piezas que se ven de cerca).
  studs(x, yTop, z, w, d, color, rot = 0) {
    const nx = Math.max(1, Math.round(w));
    const nz = Math.max(1, Math.round(d));
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const l = lin(color);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const lx = -nx / 2 + 0.5 + i;
        const lz = -nz / 2 + 0.5 + j;
        this.sm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x + lx * c + lz * s, yTop, z - lx * s + lz * c, 1);
        this.sc.push(l[0], l[1], l[2]);
        this.sn++;
      }
    }
  }

  build(material, studMaterial) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('aFlags', new THREE.InstancedBufferAttribute(new Float32Array(this.flags), 1));
    const mesh = new THREE.InstancedMesh(geo, material, this.n);
    mesh.instanceMatrix.array.set(this.mats);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cols), 3);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    if (this.sn > 0) {
      const sg = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
      sg.translate(0, 0.1, 0);
      const sm = new THREE.InstancedMesh(sg, studMaterial, this.sn);
      sm.instanceMatrix.array.set(this.sm);
      sm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.sc), 3);
      sm.castShadow = false;
      sm.receiveShadow = true;
      sm.frustumCulled = false;
      group.add(sm);
    }
    this.mats = this.cols = this.flags = this.sm = this.sc = null;
    return group;
  }
}
