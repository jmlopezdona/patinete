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

const CHUNK = 320;

// Acumula miles de ladrillos (cajas) y los dibuja instanciados, troceados en sectores
// del mapa para que solo se pinten (y proyecten sombra) los que quedan a la vista.
export class BrickBatch {
  constructor() {
    this.chunks = new Map();
    this.n = 0;
    this.sm = [];
    this.sc = [];
    this.sn = 0;
  }

  _chunk(x, z) {
    const k = (Math.floor(x / CHUNK) + 512) * 1024 + Math.floor(z / CHUNK) + 512;
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = { mats: [], cols: [], flags: [] }));
    this.n++;
    return c;
  }

  // Caja con (x, z) en el centro e y en la base. rot = giro alrededor de Y.
  box(x, y, z, w, h, d, color, flags = 0, rot = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const k = this._chunk(x, z);
    k.mats.push(c * w, 0, -s * w, 0, 0, h, 0, 0, s * d, 0, c * d, 0, x, y + h / 2, z, 1);
    const l = lin(color);
    k.cols.push(l[0], l[1], l[2]);
    k.flags.push(flags);
  }

  // Caja con una matriz arbitraria (toldos inclinados, etc.)
  boxM(m, color, flags = 0) {
    const k = this._chunk(m.elements[12], m.elements[14]);
    for (let i = 0; i < 16; i++) k.mats.push(m.elements[i]);
    const l = lin(color);
    k.cols.push(l[0], l[1], l[2]);
    k.flags.push(flags);
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
    const base = new THREE.BoxGeometry(1, 1, 1);
    for (const k of this.chunks.values()) {
      const geo = base.clone();
      geo.setAttribute('aFlags', new THREE.InstancedBufferAttribute(new Float32Array(k.flags), 1));
      const mesh = new THREE.InstancedMesh(geo, material, k.flags.length);
      mesh.instanceMatrix.array.set(k.mats);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.cols), 3);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
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
    this.chunks = this.sm = this.sc = null;
    return group;
  }
}
