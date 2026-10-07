import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _col = new THREE.Color();

// Construye una pieza fusionando primitivas con color por vértice.
// Todas las piezas pequeñas (patinete, minifiguras, coches, mobiliario) salen de aquí.
export class Builder {
  constructor() {
    this.parts = [];
  }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _col.setHex(color);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _col.r;
      arr[i * 3 + 1] = _col.g;
      arr[i * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    }
    this.parts.push(g);
    return this;
  }

  // Caja centrada en (x, y, z). o.r = radio de redondeo de aristas.
  box(w, h, d, x, y, z, color, o = {}) {
    const geo = o.r ? new RoundedBoxGeometry(w, h, d, 2, Math.min(o.r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, color, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
  }

  // Cilindro centrado. o.axis: 'y' (por defecto), 'x' o 'z'. o.r2 = radio superior.
  cyl(r, h, x, y, z, color, o = {}) {
    const geo = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 16);
    let rx = o.rx || 0;
    let rz = o.rz || 0;
    if (o.axis === 'x') rz = Math.PI / 2;
    if (o.axis === 'z') rx = Math.PI / 2;
    return this.add(geo, color, x, y, z, rx, o.ry || 0, rz);
  }

  sphere(r, x, y, z, color, o = {}) {
    const geo = new THREE.SphereGeometry(r, o.seg || 16, o.seg2 || 12);
    if (o.sy) geo.scale(1, o.sy, 1);
    return this.add(geo, color, x, y, z);
  }

  stud(x, yTop, z, color) {
    return this.add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), color, x, yTop + 0.1, z);
  }

  studs(nx, nz, x, yTop, z, color) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) this.stud(x - nx / 2 + 0.5 + i, yTop, z - nz / 2 + 0.5 + j, color);
    }
    return this;
  }

  geometry() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }

  mesh(material) {
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

// Perfil 2D (s, y) extruido a lo ancho: s queda en Z local y la anchura en X local.
export function profileGeo(pts, width) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

// Tronco de pirámide (base w x d, techo tw x td, altura h) con la base en y = 0.
export function frustumGeo(w, d, tw, td, h) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? tw : w), top ? h : 0, p.getZ(i) * (top ? td : d));
  }
  g.computeVertexNormals();
  return g;
}
