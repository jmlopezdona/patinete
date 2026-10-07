import * as THREE from 'three';
import { Builder } from './builder.js';
import { C, hexCss } from './colors.js';
import { plastic } from './materials.js';

const faceCache = new Map();
const printCache = new Map();
let headGeo = null;

function faceTexture(kind) {
  if (faceCache.has(kind)) return faceCache.get(kind);
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = hexCss(C.skin);
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#16181c';
  g.strokeStyle = '#16181c';
  g.lineCap = 'round';
  const eye = (x, y) => {
    g.beginPath();
    g.ellipse(x, y, 10, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x + 3, y - 6, 3.2, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16181c';
  };
  if (kind === 'cool') {
    g.beginPath();
    g.roundRect(256 - 52, 96, 44, 34, 8);
    g.roundRect(256 + 8, 96, 44, 34, 8);
    g.fill();
    g.fillRect(256 - 12, 104, 24, 7);
  } else if (kind === 'wink') {
    eye(256 - 27, 114);
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(256 + 16, 116);
    g.lineTo(256 + 38, 112);
    g.stroke();
  } else {
    eye(256 - 27, 114);
    eye(256 + 27, 114);
  }
  g.lineWidth = 7;
  if (kind === 'grin') {
    g.beginPath();
    g.ellipse(256, 152, 30, 32, 0, 0, Math.PI);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(256 - 22, 153, 44, 9);
  } else {
    g.beginPath();
    g.ellipse(256, 136, 31, 42, 0, Math.PI * 0.14, Math.PI * 0.86);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(kind, tex);
  return tex;
}

function printTexture(kind, color) {
  const key = kind + color;
  if (printCache.has(key)) return printCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.lineJoin = 'round';
  if (kind === 'bolt') {
    g.beginPath();
    g.moveTo(74, 12);
    g.lineTo(36, 70);
    g.lineTo(60, 70);
    g.lineTo(50, 116);
    g.lineTo(94, 52);
    g.lineTo(68, 52);
    g.closePath();
    g.fill();
  } else if (kind === 'tie') {
    g.beginPath();
    g.moveTo(54, 6);
    g.lineTo(74, 6);
    g.lineTo(70, 26);
    g.lineTo(80, 96);
    g.lineTo(64, 116);
    g.lineTo(48, 96);
    g.lineTo(58, 26);
    g.closePath();
    g.fill();
  } else if (kind === 'stripes') {
    for (let i = 0; i < 4; i++) g.fillRect(4, 14 + i * 28, 120, 13);
  } else if (kind === 'buttons') {
    g.fillRect(61, 4, 6, 120);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(82, 26 + i * 36, 7, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'star') {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 20 : 46;
      g.lineTo(64 + Math.cos(a) * r, 60 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (kind === 'pizza') {
    g.beginPath();
    g.moveTo(64, 112);
    g.lineTo(22, 26);
    g.quadraticCurveTo(64, 4, 106, 26);
    g.closePath();
    g.fill();
    g.fillStyle = '#c91a09';
    for (const [x, y] of [[52, 44], [76, 50], [62, 74]]) {
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  printCache.set(key, tex);
  return tex;
}

function getHeadGeo() {
  if (headGeo) return headGeo;
  const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.62, 0.12)];
  for (let i = 1; i <= 8; i++) pts.push(new THREE.Vector2(0.62, 0.12 + (0.81 * i) / 8));
  pts.push(new THREE.Vector2(0.5, 1.05), new THREE.Vector2(0.001, 1.05));
  headGeo = new THREE.LatheGeometry(pts, 24);
  return headGeo;
}

// Minifigura articulada. Los pies están en y = 0 y mira hacia +Z. Mide unas 5 unidades.
export function createMinifig(o = {}) {
  const legs = o.legs ?? C.blue;
  const torso = o.torso ?? C.red;
  const arms = o.arms ?? torso;
  const hairType = o.hair ?? 'hair';
  const hairColor = o.hairColor ?? C.brown;
  const group = new THREE.Group();

  const mkLeg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.5, 1.75, 0);
    const b = new Builder();
    b.box(0.94, 1.75, 1.0, 0, -0.875, 0, legs, { r: 0.08 });
    b.box(0.94, 0.5, 0.4, 0, -1.5, 0.62, legs, { r: 0.08 });
    g.add(b.mesh(plastic));
    group.add(g);
    return g;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  const body = new Builder();
  body.box(2.0, 0.42, 1.0, 0, 1.93, 0, o.hips ?? legs, { r: 0.06 });
  const tg = new THREE.BoxGeometry(2.0, 1.6, 1.0);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0) tp.setX(i, tp.getX(i) * 0.76);
  tg.computeVertexNormals();
  body.add(tg, torso, 0, 2.92, 0);
  body.cyl(0.33, 0.2, 0, 3.78, 0, C.skin, { seg: 12 });
  const bodyMesh = body.mesh(plastic);
  group.add(bodyMesh);

  if (o.print) {
    const pm = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.3),
      new THREE.MeshStandardMaterial({ map: printTexture(o.print, o.printColor ?? '#ffffff'), transparent: true, roughness: 0.4 })
    );
    pm.position.set(0, 2.92, 0.507);
    group.add(pm);
  }

  const head = new THREE.Group();
  head.position.set(0, 3.86, 0);
  const hm = new THREE.Mesh(getHeadGeo(), new THREE.MeshStandardMaterial({ map: faceTexture(o.face ?? 'smile'), roughness: 0.5 }));
  hm.rotation.y = Math.PI;
  hm.castShadow = true;
  head.add(hm);
  const hb = new Builder();
  if (hairType === 'helmet') {
    hb.add(new THREE.SphereGeometry(0.76, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.74, 0);
    hb.cyl(0.78, 0.12, 0, 0.74, 0, hairColor, { seg: 20 });
    hb.box(0.9, 0.1, 0.45, 0, 0.77, 0.66, hairColor, { r: 0.04 });
    hb.box(0.16, 0.06, 1.2, 0, 1.45, -0.05, C.white, { r: 0.02 });
  } else if (hairType === 'cap') {
    hb.add(new THREE.SphereGeometry(0.68, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.82, 0);
    hb.box(1.0, 0.09, 0.7, 0, 0.86, 0.72, hairColor, { r: 0.04 });
  } else if (hairType === 'hair') {
    hb.add(new THREE.SphereGeometry(0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.76, 0);
    hb.box(1.3, 0.72, 0.42, 0, 0.52, -0.5, hairColor, { r: 0.18 });
  } else {
    hb.stud(0, 1.05, 0, C.skin);
  }
  head.add(hb.mesh(plastic));
  group.add(head);

  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.98, 3.32, 0);
    const b = new Builder();
    b.sphere(0.3, 0, 0, 0, arms);
    b.cyl(0.25, 1.15, sx * 0.1, -0.55, 0, arms, { rz: sx * 0.17, seg: 12 });
    b.cyl(0.2, 0.36, sx * 0.2, -1.22, 0, C.skin, { seg: 10 });
    b.cyl(0.25, 0.3, sx * 0.2, -1.46, 0.02, C.skin, { axis: 'x', seg: 12 });
    g.add(b.mesh(plastic));
    group.add(g);
    return g;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  return { group, legL, legR, armL, armR, head, colors: [legs, torso, C.skin, hairColor, arms] };
}
