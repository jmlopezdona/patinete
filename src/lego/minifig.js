import * as THREE from 'three';
import { Builder } from './builder.js';
import { C, hexCss } from './colors.js';
import { plastic } from './materials.js';

const faceCache = new Map();
const printCache = new Map();
const shirtCache = new Map();
const shirtGeos = {};
let headGeo = null;

// Estrella de cinco puntas centrada en (x, y)
function starPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? r * 0.435 : r;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
}

// glasses: 'square' o 'round' le pone gafas negras a cualquier cara; brows: color de unas cejas pobladas;
// lashes: pestañas, con la boca que toque
function faceTexture(kind, skin = C.skin, glasses = null, brows = null, lashes = false) {
  const key = [kind, skin, glasses, brows, lashes].join();
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = hexCss(skin);
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
  if (kind === 'alien') {
    // Ojos almendrados enormes y boquita de marciano
    for (const sx of [-1, 1]) {
      g.fillStyle = '#16181c';
      g.beginPath();
      g.ellipse(256 + sx * 31, 110, 23, 34, sx * 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(256 + sx * 25, 94, 6, 9, sx * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#16181c';
  } else if (kind === 'cool') {
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
  const pasta = kind === 'senor' || kind === 'abuela';
  const frame = glasses ?? (pasta ? 'square' : null);
  if (frame) {
    // Gafas redondas o rectangulares: de pasta gris las de los mayores, negras y gordas las de los chavales
    g.lineWidth = pasta ? 6 : 8;
    g.strokeStyle = pasta ? '#3a3f47' : '#16181c';
    for (const sx of [-1, 1]) {
      g.beginPath();
      if (frame === 'square') g.roundRect(256 + sx * 30 - 25, 91, 50, 42, 9);
      else g.ellipse(256 + sx * 30, 115, 23, 31, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(256 + sx * 56, 106);
      g.lineTo(256 + sx * 118, 100);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(256 - 5, 108);
    g.lineTo(256 + 5, 108);
    g.stroke();
    g.strokeStyle = '#16181c';
  }
  if (pasta || kind === 'rock') {
    // Cejas: canosas y tranquilas, de roquero enfadado o de abuela con muy malas pulgas
    g.lineWidth = 7;
    g.strokeStyle = pasta ? '#8a8f95' : '#16181c';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(256 + sx * 46, kind === 'senor' ? 78 : kind === 'abuela' ? 68 : 76);
      g.lineTo(256 + sx * 14, kind === 'senor' ? 74 : kind === 'abuela' ? 86 : 92);
      g.stroke();
    }
    g.strokeStyle = '#16181c';
  } else if (brows != null) {
    g.lineWidth = 9;
    g.strokeStyle = hexCss(brows);
    const by = frame === 'square' ? 82 : 76;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(256 + sx * 52, by);
      g.quadraticCurveTo(256 + sx * 32, by - 12, 256 + sx * 12, by - 2);
      g.stroke();
    }
    g.strokeStyle = '#16181c';
  }
  if (kind === 'lady' || lashes) {
    g.lineWidth = 4;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(256 + sx * (27 + i * 5), 101);
        g.lineTo(256 + sx * (31 + i * 8), 89 + i * 3);
        g.stroke();
      }
    }
  }
  g.lineWidth = 7;
  if (kind === 'alien') {
    g.beginPath();
    g.ellipse(256, 166, 11, 7, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'lady') {
    g.strokeStyle = '#c91a09';
    g.lineWidth = 9;
    g.beginPath();
    g.ellipse(256, 138, 27, 38, 0, Math.PI * 0.18, Math.PI * 0.82);
    g.stroke();
  } else if (kind === 'abuela') {
    // Boca torcida hacia abajo
    g.beginPath();
    g.ellipse(256, 178, 27, 24, 0, Math.PI * 1.16, Math.PI * 1.84);
    g.stroke();
  } else if (kind === 'grin' || kind === 'rock') {
    g.beginPath();
    g.ellipse(256, 152, 30, 32, 0, 0, Math.PI);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(256 - 22, 153, 44, 9);
  } else if (kind === 'serious') {
    // Boca recta, de no hacerle ni pizca de gracia la foto
    g.beginPath();
    g.moveTo(256 - 22, 168);
    g.lineTo(256 + 22, 168);
    g.stroke();
  } else if (kind === 'smirk') {
    // Media sonrisa de lado
    g.beginPath();
    g.moveTo(256 - 28, 164);
    g.quadraticCurveTo(256 + 6, 184, 256 + 30, 154);
    g.stroke();
  } else {
    g.beginPath();
    g.ellipse(256, 136, 31, 42, 0, Math.PI * 0.14, Math.PI * 0.86);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}

function printTexture(kind, color) {
  const key = kind + color;
  if (printCache.has(key)) return printCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  // Los dibujos están medidos sobre 128: el lienzo va al doble para que el estampado no se vea borroso de cerca
  g.scale(2, 2);
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
    starPath(g, 64, 60, 46);
    g.fill();
  } else if (kind === 'police') {
    // Banda de cuadros reflectantes y placa
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(i * 16, 74 + j * 14, 16, 14);
    g.beginPath();
    g.moveTo(82, 16);
    g.lineTo(108, 16);
    g.lineTo(108, 38);
    g.lineTo(95, 52);
    g.lineTo(82, 38);
    g.closePath();
    g.fill();
  } else if (kind[0] === '#') {
    // Dorsal
    g.font = '800 86px Fredoka, "Arial Rounded MT Bold", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(kind.slice(1), 64, 68);
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
  tex.anisotropy = 8;
  printCache.set(key, tex);
  return tex;
}

// Camiseta de la selección argentina: rayas albicelestes y, por delante, el escudo con sus tres estrellas
function argentinaShirt(front) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = hexCss(C.celeste);
  for (const x of [0, 102, 204]) g.fillRect(x, 0, 52, 256);
  g.strokeStyle = '#1d2f5a';
  g.lineWidth = 9;
  g.lineJoin = 'round';
  g.beginPath();
  if (front) {
    g.moveTo(92, -4);
    g.lineTo(128, 30);
    g.lineTo(164, -4);
  } else {
    g.moveTo(88, 2);
    g.lineTo(168, 2);
  }
  g.stroke();
  if (front) {
    g.lineWidth = 6;
    g.strokeStyle = '#a3760c';
    g.beginPath();
    g.moveTo(155, 88);
    g.lineTo(205, 88);
    g.lineTo(205, 122);
    g.quadraticCurveTo(205, 146, 180, 158);
    g.quadraticCurveTo(155, 146, 155, 122);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = hexCss(C.celeste);
    g.fillRect(155, 88, 17, 80);
    g.fillRect(188, 88, 17, 80);
    g.restore();
    g.stroke();
    g.fillStyle = '#f5b921';
    g.lineWidth = 4;
    for (const [x, y] of [[154, 68], [180, 58], [206, 68]]) {
      starPath(g, x, y, 13);
      g.stroke();
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Camiseta blanca de la selección española: cuello de pico granate con ribete dorado, tres tiras
// granates por los hombros y, por delante, el escudo con sus dos estrellas
function espanaShirt(front) {
  const GRANATE = '#7b1f38';
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#f6f4ee';
  g.fillRect(0, 0, 256, 256);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Tiras de los hombros, que bajan hacia las mangas
  g.strokeStyle = GRANATE;
  g.lineWidth = 6;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(128 + sx * (62 + i * 11), -4);
      g.lineTo(128 + sx * (118 + i * 11), 44);
      g.stroke();
    }
  }
  const neck = () => {
    g.beginPath();
    if (front) {
      g.moveTo(88, -6);
      g.lineTo(128, 40);
      g.lineTo(168, -6);
    } else {
      g.moveTo(88, 3);
      g.lineTo(168, 3);
    }
    g.stroke();
  };
  g.lineWidth = 15;
  neck();
  g.strokeStyle = '#e2b53a';
  g.lineWidth = 4;
  neck();
  if (front) {
    // Escudo a la izquierda del pecho (derecha de la imagen) y marca de tres hojas al otro lado
    g.fillStyle = '#f5b921';
    g.strokeStyle = GRANATE;
    g.lineWidth = 3;
    for (const x of [171, 189]) {
      starPath(g, x, 76, 8);
      g.stroke();
      g.fill();
    }
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(160, 90);
    g.lineTo(200, 90);
    g.lineTo(200, 118);
    g.quadraticCurveTo(200, 138, 180, 148);
    g.quadraticCurveTo(160, 138, 160, 118);
    g.closePath();
    g.fillStyle = '#c8102e';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#f5b921';
    g.fillRect(160, 106, 40, 16);
    g.restore();
    g.stroke();
    g.fillStyle = GRANATE;
    for (const a of [-0.55, 0, 0.55]) {
      g.beginPath();
      g.ellipse(76 + Math.sin(a) * 13, 112 - Math.cos(a) * 13, 7, 15, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(58, 122, 36, 5);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const DRAWN_SHIRTS = {
  argentina: () => argentinaShirt(true), 'argentina-atras': () => argentinaShirt(false),
  espana: () => espanaShirt(true), 'espana-atras': () => espanaShirt(false),
};

// Camiseta para pegar en el torso: la foto de una de verdad (public/camisetas), recortada en cuadrado,
// o una de las pintadas a mano
function shirtTexture(name) {
  if (shirtCache.has(name)) return shirtCache.get(name);
  const tex = DRAWN_SHIRTS[name] ? DRAWN_SHIRTS[name]() : new THREE.TextureLoader().load(`camisetas/${name}.jpg`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  shirtCache.set(name, tex);
  return tex;
}

// Panel con la silueta del torso (y de la cadera si la camiseta va por fuera) para pegarle la foto.
// La foto se pega sin deformar: se ajusta al alto y lo que sobra por los lados queda fuera.
function shirtGeo(long) {
  const key = long ? 'long' : 'short';
  if (shirtGeos[key]) return shirtGeos[key];
  const rows = long ? [[1.76, 0.96], [2.12, 1], [3.72, 0.76]] : [[2.12, 1], [3.72, 0.76]];
  const y0 = rows[0][0];
  const h = 3.72 - y0;
  const pos = [];
  const uv = [];
  const idx = [];
  rows.forEach(([y, hw], i) => {
    for (const sx of [-1, 1]) {
      pos.push(sx * hw, y, 0);
      uv.push(0.5 + (sx * hw) / h, (y - y0) / h);
    }
    if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  shirtGeos[key] = g;
  return g;
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
  const skin = o.skin ?? C.skin;
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
  body.box(2.0, 0.42, 1.0, 0, 1.93, 0, o.hips ?? (o.shirt?.long ? torso : legs), { r: 0.06 });
  const tg = new THREE.BoxGeometry(2.0, 1.6, 1.0);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0) tp.setX(i, tp.getX(i) * 0.76);
  tg.computeVertexNormals();
  body.add(tg, torso, 0, 2.92, 0);
  body.cyl(0.33, 0.2, 0, 3.78, 0, skin, { seg: 12 });
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

  if (o.shirt) {
    // Camiseta de foto: el pecho por delante y, si la hay, la espalda por detrás
    for (const [name, back] of [[o.shirt.front, false], [o.shirt.back, true]]) {
      if (!name) continue;
      const sm = new THREE.Mesh(shirtGeo(o.shirt.long), new THREE.MeshStandardMaterial({ map: shirtTexture(name), roughness: 0.5 }));
      sm.position.z = back ? -0.507 : 0.507;
      if (back) sm.rotation.y = Math.PI;
      sm.receiveShadow = true;
      group.add(sm);
    }
  }

  const head = new THREE.Group();
  head.position.set(0, 3.86, 0);
  const hm = new THREE.Mesh(getHeadGeo(), new THREE.MeshStandardMaterial({ map: faceTexture(o.face ?? 'smile', skin, o.glasses, o.brows, o.lashes), roughness: 0.5 }));
  hm.rotation.y = Math.PI;
  hm.castShadow = true;
  head.add(hm);
  const hb = new Builder();
  // Pelo muy corto pegado a los lados y a la nuca, por debajo del peinado
  const shortSides = (color, y0, y1) => hb.add(new THREE.CylinderGeometry(0.64, 0.64, y1 - y0, 20, 1, true, 1.3, Math.PI * 2 - 2.6), color, 0, (y0 + y1) / 2, 0);
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
  } else if (hairType === 'ponytail') {
    hb.add(new THREE.SphereGeometry(0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.76, 0);
    hb.box(1.3, 0.5, 0.42, 0, 0.62, -0.5, hairColor, { r: 0.18 });
    hb.sphere(0.3, 0, 0.92, -0.86, hairColor, { seg: 10, seg2: 8 });
    hb.box(0.34, 1.05, 0.3, 0, 0.38, -1.02, hairColor, { r: 0.14, rx: 0.25 });
  } else if (hairType === 'bun') {
    // Moño de abuela
    hb.add(new THREE.SphereGeometry(0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.76, 0);
    hb.box(1.3, 0.5, 0.42, 0, 0.62, -0.5, hairColor, { r: 0.18 });
    hb.sphere(0.42, 0, 1.5, -0.22, hairColor, { seg: 12, seg2: 10 });
  } else if (hairType === 'long') {
    // Melena heavy hasta los hombros
    hb.add(new THREE.SphereGeometry(0.74, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.76, 0);
    hb.box(1.44, 1.7, 0.46, 0, 0.1, -0.5, hairColor, { r: 0.2 });
    for (const sx of [-1, 1]) hb.box(0.3, 1.5, 0.9, sx * 0.68, 0.16, -0.12, hairColor, { r: 0.14 });
  } else if (hairType === 'mane') {
    // Media melena ondulada con la raya en medio: cae a los dos lados de la cara hasta los hombros y se aclara hacia las puntas
    const tips = o.hairTips ?? hairColor;
    hb.add(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.78, 0);
    hb.box(1.4, 1.3, 0.44, 0, 0.22, -0.5, hairColor, { r: 0.2 });
    hb.box(0.05, 0.05, 0.9, 0, 1.52, 0.1, tips, { r: 0.02 });
    // Cada mechón: ángulo alrededor de la cabeza (0 es la cara) y hasta dónde baja
    for (const a of [0.98, 1.3, 1.68, 2.1, 2.55, 2.98]) {
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          const b = sx * (a + 0.1 * Math.sin(t * Math.PI * 2.5 + a * 3));
          const R = 0.69 + 0.12 * Math.sin(t * Math.PI * 0.8);
          hb.sphere(0.25 - 0.06 * t, R * Math.sin(b), 1.12 - 1.5 * t, R * Math.cos(b), t > 0.45 && i % 2 ? tips : hairColor, { seg: 8, seg2: 6 });
        }
      }
    }
  } else if (hairType === 'curls') {
    // Melena de rizos con mucho volumen: una nube de bucles que se ensancha hacia los hombros y deja la cara despejada
    const tips = o.hairTips ?? hairColor;
    hb.add(new THREE.SphereGeometry(0.76, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.8, 0);
    hb.box(1.3, 1.2, 0.4, 0, 0.2, -0.52, hairColor, { r: 0.18 });
    let n = 0;
    for (let row = 0; row < 9; row++) {
      const y = 1.42 - row * 0.23;
      const R = row < 2 ? 0.34 + row * 0.3 : 0.8 + 0.22 * Math.sin(((row - 2) / 6) * Math.PI * 0.75);
      const count = row < 2 ? 5 + row * 4 : 13;
      for (let i = 0; i < count; i++) {
        const a = ((i + (row % 2) * 0.5) / count) * Math.PI * 2;
        // De la frente para abajo, nada por delante de la cara
        if (row >= 2 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.66 + (row > 5 ? 0.12 : 0)) continue;
        const r = 0.22 + ((n * 7) % 5) * 0.014;
        hb.sphere(r, R * Math.sin(a), y + ((n * 5) % 3) * 0.03, R * Math.cos(a) - 0.04, n++ % 3 ? hairColor : tips, { seg: 8, seg2: 6 });
      }
    }
  } else if (hairType === 'bob') {
    // Melena lisa hasta los hombros, con la raya a un lado y un mechón que cruza la frente
    hb.add(new THREE.SphereGeometry(0.74, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.78, 0);
    hb.box(1.44, 1.4, 0.46, 0, 0.24, -0.5, hairColor, { r: 0.2 });
    for (const sx of [-1, 1]) hb.box(0.3, 1.36, 1.0, sx * 0.68, 0.26, -0.1, hairColor, { r: 0.14 });
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const b = -0.5 + 1.35 * t;
      hb.sphere(0.19 - 0.03 * t, 0.66 * Math.sin(b), 1.22 - 0.26 * t, 0.66 * Math.cos(b), hairColor, { seg: 8, seg2: 6, sy: 0.7 });
    }
  } else if (hairType === 'messy') {
    // Pelo revuelto y con volumen: mechones por arriba y flequillo despeinado sobre la frente
    hb.add(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.78, 0);
    hb.box(1.36, 0.8, 0.46, 0, 0.5, -0.5, hairColor, { r: 0.2 });
    for (const sx of [-1, 1]) hb.box(0.26, 0.5, 0.74, sx * 0.63, 0.66, -0.14, hairColor, { r: 0.12 });
    for (const [x, y, z, r] of [[-0.3, 1.2, 0.28, 0.4], [0.32, 1.24, 0.2, 0.42], [0, 1.3, -0.14, 0.44], [-0.44, 1.1, -0.24, 0.38], [0.46, 1.08, -0.28, 0.38], [0.04, 1.14, -0.5, 0.4]]) {
      hb.sphere(r, x, y, z, hairColor, { seg: 12, seg2: 10, sy: 0.7 });
    }
    for (const [x, h, rz] of [[-0.56, 0.4, 0.42], [-0.4, 0.5, 0.26], [-0.2, 0.42, 0.34], [-0.02, 0.52, -0.12], [0.18, 0.4, -0.36], [0.36, 0.5, -0.2], [0.55, 0.4, -0.44]]) {
      hb.cyl(0.03, h, x, 1.3 - h / 2, Math.sqrt(0.5 - x * x), hairColor, { r2: 0.2, rz, seg: 8 });
    }
  } else if (hairType === 'curly') {
    // Rizos apelotonados arriba, que caen sobre la frente, y los lados cortos
    const curl = o.hairTips ?? hairColor;
    hb.add(new THREE.SphereGeometry(0.68, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.8, 0);
    shortSides(hairColor, 0.44, 0.86);
    for (let i = 0; i < 30; i++) {
      const pol = Math.acos(1 - (i + 0.5) / 30) * 0.98;
      const a = i * 2.4;
      const r = 0.2 + ((i * 7) % 5) * 0.015;
      hb.sphere(r, 0.6 * Math.sin(pol) * Math.cos(a), 1 + 0.42 * Math.cos(pol), 0.04 + 0.62 * Math.sin(pol) * Math.sin(a), i % 3 ? hairColor : curl, { seg: 8, seg2: 6 });
    }
  } else if (hairType === 'wavy') {
    // Ondas con volumen arriba, los lados cortos y un flequillo de mechones revueltos que cae hasta las cejas
    const tips = o.hairTips ?? hairColor;
    hb.add(new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.8, 0);
    shortSides(hairColor, 0.4, 0.86);
    for (const [x, y, z, r] of [[-0.3, 1.2, 0.3, 0.36], [0.28, 1.24, 0.26, 0.38], [0.02, 1.3, 0.02, 0.4], [-0.38, 1.12, -0.2, 0.36], [0.4, 1.1, -0.24, 0.36], [0.02, 1.14, -0.42, 0.38]]) {
      hb.sphere(r, x, y, z, hairColor, { seg: 12, seg2: 10, sy: 0.62 });
    }
    // Cada mechón: ángulo sobre la frente, altura hasta la que baja y cuánto se riza por el camino
    for (const [a, low, wave] of [[-1.0, 1.06, 0.2], [-0.62, 0.96, 0.24], [-0.3, 0.86, 0.2], [-0.04, 0.77, 0.12], [0.3, 0.9, -0.22], [0.66, 1.0, -0.24], [1.02, 1.08, -0.16]]) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const b = a + wave * Math.sin(t * Math.PI);
        const R = 0.66 - 0.04 * t;
        hb.sphere(0.17 - 0.06 * t, R * Math.sin(b), 1.24 + (low - 1.24) * t, R * Math.cos(b), i % 2 ? tips : hairColor, { seg: 8, seg2: 6 });
      }
    }
  } else if (hairType === 'crop') {
    // Corte a capas: mechones lisos echados hacia delante, flequillo corto y recto sobre la frente y los lados rapados
    const sides = o.hairTips ?? hairColor;
    hb.add(new THREE.SphereGeometry(0.71, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.8, 0);
    shortSides(sides, 0.42, 0.84);
    for (const [x, y, z, r] of [[-0.3, 1.22, 0.24, 0.36], [0.3, 1.22, 0.24, 0.36], [0, 1.3, 0, 0.4], [-0.36, 1.14, -0.24, 0.36], [0.36, 1.14, -0.24, 0.36], [0, 1.16, -0.42, 0.38]]) {
      hb.sphere(r, x, y, z, hairColor, { seg: 12, seg2: 10, sy: 0.55 });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.23;
      const h = 0.36 + (i % 2) * 0.06 + (i === 3 ? 0.05 : 0);
      hb.box(0.19, h, 0.16, 0.66 * Math.sin(a), 1.2 - h / 2, 0.66 * Math.cos(a), hairColor, { r: 0.05, ry: a, rx: -0.12 });
    }
  } else if (hairType === 'swept') {
    // Mata de pelo revuelto, con volumen, y el flequillo largo peinado de lado: los mechones cruzan la frente en diagonal
    const tips = o.hairTips ?? hairColor;
    hb.add(new THREE.SphereGeometry(0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairColor, 0, 0.8, 0);
    shortSides(hairColor, 0.42, 0.86);
    for (const [x, y, z, r] of [[-0.34, 1.22, 0.26, 0.4], [0.26, 1.28, 0.24, 0.42], [0, 1.34, -0.02, 0.42], [-0.4, 1.12, -0.22, 0.38], [0.42, 1.12, -0.24, 0.38], [0, 1.16, -0.44, 0.4]]) {
      hb.sphere(r, x, y, z, hairColor, { seg: 12, seg2: 10, sy: 0.58 });
    }
    // Cada mechón: de qué ángulo de la frente sale y hasta qué altura baja, siempre hacia el mismo lado
    for (const [a, low] of [[-1.3, 1.0], [-0.96, 0.95], [-0.62, 0.9], [-0.3, 0.85], [0.02, 0.82], [0.34, 0.86], [0.66, 0.95]]) {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const b = a + 0.44 * t;
        const R = 0.67 - 0.03 * t;
        hb.sphere(0.18 - 0.06 * t, R * Math.sin(b), 1.26 + (low - 1.26) * t, R * Math.cos(b), i % 2 ? tips : hairColor, { seg: 8, seg2: 6 });
      }
    }
  } else if (hairType === 'bowl') {
    // Corte a tazón: flequillo recto y desfilado, que se va aclarando hacia las puntas, y rapado por debajo en un tono intermedio
    const tips = o.hairTips ?? hairColor;
    const R = 0.75;
    const bowl = new THREE.SphereGeometry(R, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).toNonIndexed();
    const bp = bowl.attributes.position;
    const fade = [];
    for (let i = 0; i < bp.count; i++) {
      fade.push(THREE.MathUtils.smoothstep(0.5 - bp.getY(i) / R, 0, 0.5));
      if (bp.getY(i) < 1e-4 && Math.round((Math.atan2(bp.getX(i), bp.getZ(i)) / Math.PI) * 12) & 1) bp.setY(i, -0.08);
    }
    hb.add(bowl, hairColor, 0, 0.62, 0, -0.2, 0, 0.06);
    const bc = hb.parts.at(-1).attributes.color;
    const dark = new THREE.Color(hairColor);
    const light = new THREE.Color(tips);
    fade.forEach((t, i) => bc.setXYZ(i, ...dark.clone().lerp(light, t)));
    hb.cyl(R - 0.01, 0.06, 0, 0.62, 0, tips, { rx: -0.2, rz: 0.06, seg: 24 });
    shortSides(dark.clone().lerp(light, 0.55).getHex(), 0.42, 0.7);
  } else if (hairType === 'antenna') {
    for (const sx of [-1, 1]) {
      hb.cyl(0.07, 1.0, sx * 0.42, 1.5, 0, skin, { rz: -sx * 0.3, seg: 8 });
      hb.sphere(0.2, sx * 0.57, 2.02, 0, hairColor, { seg: 10, seg2: 8 });
    }
  } else {
    hb.stud(0, 1.05, 0, skin);
  }
  // Pendientes: una bolita a cada lado de la cabeza
  if (o.earrings != null) for (const sx of [-1, 1]) hb.sphere(0.1, sx * 0.64, 0.36, 0.06, o.earrings, { seg: 8, seg2: 6 });
  head.add(hb.mesh(plastic));
  group.add(head);

  const mkArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.98, 3.32, 0);
    const b = new Builder();
    b.sphere(0.3, 0, 0, 0, arms);
    b.cyl(0.25, 1.15, sx * 0.1, -0.55, 0, arms, { rz: sx * 0.17, seg: 12 });
    b.cyl(0.2, 0.36, sx * 0.2, -1.22, 0, skin, { seg: 10 });
    b.cyl(0.25, 0.3, sx * 0.2, -1.46, 0.02, skin, { axis: 'x', seg: 12 });
    g.add(b.mesh(plastic));
    group.add(g);
    return g;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  return { group, legL, legR, armL, armR, head, colors: [legs, torso, skin, hairColor, arms] };
}

// Cartelito con el nombre que flota sobre la cabeza de los vecinos
export function nameTag(name, color = '#ffd23a') {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 160;
  const g = cv.getContext('2d');
  g.scale(2, 2); // dibujado sobre 256 × 80 y al doble, para que el nombre se lea limpio de cerca
  g.fillStyle = 'rgba(14, 26, 40, 0.84)';
  g.beginPath();
  g.roundRect(5, 8, 246, 64, 32);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = color;
  g.stroke();
  g.font = '700 42px Fredoka, "Arial Rounded MT Bold", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(name, 128, 43, 212);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  sp.scale.set(4.6, 1.44, 1);
  return sp;
}
