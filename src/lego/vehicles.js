import * as THREE from 'three';
import { Builder, profileGeo } from './builder.js';
import { C } from './colors.js';
import { plastic, rubber, textTexture } from './materials.js';
import { createScooter, WHEEL_R, STEER_Z, DECK_Y } from './scooter.js';

// Vehículos del jugador. Todos miran hacia +Z con el origen en el suelo y comparten interfaz:
//   group    malla completa
//   kind     'scooter' | 'unicycle' | 'bike' | 'car'
//   wheelR   radio de rueda (para que giren a la velocidad justa)
//   steerZ   eje vertical sobre el que pivota el vehículo en los trucos
//   seatY/Z  dónde va sentado (o de pie) el piloto
//   cargo    dónde se apilan las pizzas del reparto
//   tail     distancia del centro a la cola (llamas del turbo)

const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8f2, transparent: true, opacity: 0.34, roughness: 0.06, metalness: 0.2, side: THREE.DoubleSide });

// Tubo entre dos puntos del plano YZ (cuadros de bici)
function tube(b, r, x, y0, z0, y1, z1, color) {
  const dy = y1 - y0;
  const dz = z1 - z0;
  b.add(new THREE.CylinderGeometry(r, r, Math.hypot(dy, dz), 10), color, x, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(dz, dy), 0, 0);
}

function spokeWheel(r, tubeR, spokes, hub = C.lgray) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r, tubeR, 8, 28), rubber);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  const b = new Builder();
  b.cyl(0.2, 0.5, 0, 0, 0, hub, { axis: 'x', seg: 10 });
  for (let i = 0; i < spokes; i++) b.box(0.06, r * 2, 0.06, 0, 0, 0, hub, { rx: (i * Math.PI) / spokes });
  g.add(tire, b.mesh(plastic));
  return g;
}

export function scooterVehicle(color, scale = 1) {
  const s = createScooter(color);
  s.group.scale.setScalar(scale);
  return { ...s, kind: 'scooter', wheelR: WHEEL_R * scale, steerZ: STEER_Z * scale, seatY: DECK_Y * scale, seatZ: -0.5 * scale, cargo: [0, 1.5 * scale, -2.2 * scale], tail: 2.8 * scale, lean: 1 };
}

// Monociclo de circo: rueda con radios y pedales, horquilla y sillín
export function createUnicycle(color = C.red) {
  const group = new THREE.Group();
  const wheel = spokeWheel(1.14, 0.17, 4);
  wheel.position.y = 1.3;
  const wb = new Builder();
  for (const sx of [-1, 1]) {
    wb.box(0.1, 0.62, 0.14, sx * 0.3, sx * 0.3, 0, C.dgray);
    wb.box(0.42, 0.1, 0.3, sx * 0.52, sx * 0.6, 0, C.yellow);
  }
  wheel.add(wb.mesh(plastic));
  const fb = new Builder();
  for (const sx of [-1, 1]) fb.cyl(0.08, 1.5, sx * 0.27, 2.05, 0, color, { seg: 8 });
  fb.box(0.7, 0.12, 0.2, 0, 2.8, 0, color);
  fb.cyl(0.09, 0.4, 0, 3.0, 0, C.lgray, { seg: 8 });
  fb.box(0.8, 0.26, 1.3, 0, 3.3, 0, C.black, { r: 0.1 });
  group.add(wheel, fb.mesh(plastic));
  return { group, wheel, kind: 'unicycle', wheelR: 1.31, steerZ: 0, seatY: 3.43, seatZ: 0, cargo: [0, 3.5, -1.5], tail: 1.6, lean: 1 };
}

// Bici de saltos: cuadro de tubos, horquilla y manillar que giran, bielas y pedales
export function createBike(color = C.lime) {
  const group = new THREE.Group();
  const R = 0.88;
  const WR = R + 0.18;
  const ZR = -1.95;
  const ZF = 1.95;
  const SZ = 1.4;
  const BB = [1.0, -0.15]; // pedalier (y, z)
  const SEAT = [2.95, -0.85];
  const HT = [3.15, 1.25]; // parte alta del tubo de dirección
  const HB = [2.3, 1.42];
  const b = new Builder();
  tube(b, 0.11, 0, BB[0], BB[1], SEAT[0], SEAT[1], color);
  tube(b, 0.11, 0, SEAT[0] - 0.25, SEAT[1] + 0.08, HT[0] - 0.1, HT[1], color);
  tube(b, 0.12, 0, BB[0], BB[1], HB[0], HB[1], color);
  tube(b, 0.15, 0, HB[0] - 0.1, HB[1] + 0.02, HT[0] + 0.1, HT[1] - 0.02, C.white);
  for (const sx of [-1, 1]) {
    tube(b, 0.07, sx * 0.24, BB[0], BB[1], WR, ZR, color);
    tube(b, 0.07, sx * 0.24, SEAT[0] - 0.3, SEAT[1] + 0.1, WR, ZR, color);
  }
  b.cyl(0.07, 0.5, 0, SEAT[0] + 0.2, SEAT[1] - 0.06, C.lgray, { seg: 8 });
  b.box(0.7, 0.24, 1.25, 0, SEAT[0] + 0.5, SEAT[1] - 0.12, C.black, { r: 0.1 });
  b.cyl(0.36, 0.1, 0.2, BB[0], BB[1], C.dgray, { axis: 'x', seg: 16 });
  b.cyl(0.09, 0.9, 0, WR, ZR, C.lgray, { axis: 'x', seg: 8 });
  group.add(b.mesh(plastic));

  // Dirección: horquilla, potencia, manillar y rueda delantera
  const steer = new THREE.Group();
  steer.position.set(0, 0, SZ);
  const s = new Builder();
  for (const sx of [-1, 1]) tube(s, 0.08, sx * 0.25, HB[0], HB[1] - SZ, WR, ZF - SZ, C.white);
  s.box(0.66, 0.14, 0.24, 0, HB[0], HB[1] - SZ, C.white);
  tube(s, 0.09, 0, HT[0], HT[1] - SZ, 3.75, 1.12 - SZ, C.lgray);
  s.cyl(0.09, 2.4, 0, 3.78, 1.12 - SZ, C.lgray, { axis: 'x', seg: 10 });
  for (const sx of [-1, 1]) s.cyl(0.14, 0.5, sx * 1.0, 3.78, 1.12 - SZ, C.black, { axis: 'x', seg: 10 });
  s.cyl(0.09, 0.9, 0, WR, ZF - SZ, C.lgray, { axis: 'x', seg: 8 });
  steer.add(s.mesh(plastic));
  const front = spokeWheel(R, 0.18, 5);
  front.position.set(0, WR, ZF - SZ);
  steer.add(front);
  const rear = spokeWheel(R, 0.18, 5);
  rear.position.set(0, WR, ZR);
  const cranks = new THREE.Group();
  cranks.position.set(0, BB[0], BB[1]);
  const cb = new Builder();
  for (const sx of [-1, 1]) {
    cb.box(0.1, 0.62, 0.14, sx * 0.36, sx * 0.3, 0, C.dgray);
    cb.box(0.5, 0.1, 0.34, sx * 0.62, sx * 0.6, 0, C.yellow);
  }
  cranks.add(cb.mesh(plastic));
  group.add(steer, rear, cranks);
  return { group, steer, front, rear, cranks, kind: 'bike', wheelR: WR, steerZ: SZ, seatY: SEAT[0] + 0.62, seatZ: SEAT[1] - 0.1, barY: 3.78, cargo: [0, 2.35, -2.3], tail: 3.0, lean: 1.15 };
}

// Tesla Model X de juguete: morro bajo, techo de cristal y puertas de ala de halcón
export function createTesla(color = C.white, plate = 'JOSE') {
  if (color === C.white) color = 0xdde3e8; // blanco perla: el blanco puro se quema al sol
  const group = new THREE.Group();
  const W = 4.0;
  const body = new Builder();
  // Carrocería: perfil lateral extruido a lo ancho
  body.add(profileGeo([[-4.1, 0.75], [-4.1, 2.25], [-3.75, 2.6], [1.9, 2.42], [3.55, 1.95], [4.1, 1.55], [4.1, 0.75]], W), color);
  // Columna central del techo, de la que cuelgan las puertas
  body.add(profileGeo([[-3.55, 2.62], [-2.35, 3.74], [-0.4, 4.02], [0.75, 3.95], [0.75, 3.83], [-0.4, 3.9], [-2.3, 3.62], [-3.45, 2.56]], 0.8), color);
  // Pilares y marco del parabrisas
  for (const sx of [-1, 1]) body.add(profileGeo([[0.62, 3.92], [0.8, 3.92], [2.38, 2.42], [2.2, 2.42]], 0.16), color, sx * 1.72, 0, 0);
  // Bajos, pasos de rueda, faros y pilotos
  body.box(W + 0.08, 0.5, 8.0, 0, 0.82, 0, C.black, { r: 0.1 });
  for (const sx of [-1, 1]) {
    for (const wz of [-2.55, 2.55]) body.cyl(1.12, 0.24, sx * (W / 2 - 0.06), 0.98, wz, C.black, { axis: 'x', seg: 20 });
    body.box(1.0, 0.24, 0.14, sx * 1.35, 1.95, 4.06, 0xfff7d6, { r: 0.05 });
    body.box(0.5, 0.12, 1.1, sx * 2.03, 2.05, -1.2, C.lgray, { r: 0.04 });
  }
  body.box(W - 0.3, 0.24, 0.12, 0, 2.3, -4.12, C.red, { r: 0.05 });
  body.box(W - 0.6, 0.12, 0.5, 0, 2.66, -3.72, color, { r: 0.05 });
  body.box(1.8, 0.4, 0.1, 0, 1.2, 4.12, C.black, { r: 0.05 });
  // Asientos, volante y pantallón
  body.box(1.5, 1.7, 0.5, 0, 1.85, -0.45, C.cream, { r: 0.15, rx: -0.12 });
  body.box(3.2, 1.2, 0.5, 0, 1.6, -2.3, C.cream, { r: 0.15 });
  body.cyl(0.07, 0.9, 0, 2.5, 1.45, C.black, { rx: 1.0, seg: 8 });
  body.add(new THREE.TorusGeometry(0.42, 0.08, 6, 18), C.black, 0, 2.7, 1.12, -0.4, 0, 0);
  body.box(0.9, 0.7, 0.08, 1.05, 2.75, 1.6, C.black, { rx: -0.5 });
  group.add(body.mesh(plastic));

  // Lunas: una sola pieza transparente con el mismo perfil del habitáculo
  const cabin = new THREE.Mesh(profileGeo([[-3.5, 2.6], [-2.32, 3.68], [-0.4, 3.96], [0.72, 3.88], [2.3, 2.44]], W - 0.5), glass);
  group.add(cabin);

  // Matrícula
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.48), new THREE.MeshBasicMaterial({ map: textTexture(plate, { bg: '#ffffff', fg: '#12202e', w: 256, h: 82, border: '#12202e' }) }));
  pl.position.set(0, 1.5, -4.13);
  pl.rotation.y = Math.PI;
  group.add(pl);

  // Puertas de ala de halcón: bisagra en la columna del techo
  const doors = [-1, 1].map((sx) => {
    const d = new THREE.Group();
    d.position.set(sx * 0.42, 3.86, 0);
    const db = new Builder();
    db.box(1.36, 0.1, 2.3, sx * 0.7, -0.06, -1.25, color, { rz: -sx * 0.1 });
    db.box(0.1, 1.2, 2.3, sx * 1.42, -0.72, -1.25, color);
    d.add(db.mesh(plastic));
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 1.8), glass);
    win.position.set(sx * 1.49, -0.72, -1.25);
    d.add(win);
    group.add(d);
    return d;
  });

  // Ruedas con llanta de turbina; las delanteras giran con la dirección
  const wb = new Builder();
  wb.cyl(0.9, 0.62, 0, 0, 0, C.black, { axis: 'x', seg: 20 });
  wb.cyl(0.58, 0.66, 0, 0, 0, C.lgray, { axis: 'x', seg: 14 });
  for (let i = 0; i < 5; i++) wb.box(0.7, 0.16, 1.1, 0, 0, 0, C.dgray, { rx: (i * Math.PI) / 5 });
  const wgeo = wb.geometry();
  const wheels = [];
  const frontPivots = [];
  for (const sx of [-1, 1]) {
    for (const wz of [-2.55, 2.55]) {
      const w = new THREE.Mesh(wgeo, plastic);
      w.castShadow = true;
      if (wz > 0) {
        const pv = new THREE.Group();
        pv.position.set(sx * (W / 2 - 0.36), 0.9, wz);
        pv.add(w);
        group.add(pv);
        frontPivots.push(pv);
      } else {
        w.position.set(sx * (W / 2 - 0.36), 0.9, wz);
        group.add(w);
      }
      wheels.push(w);
    }
  }
  // El coche va algo retrasado respecto al punto que usa la física, para que el morro no atraviese las paredes
  const shift = -1.1;
  return { group, wheels, frontPivots, doors, kind: 'car', wheelR: 0.9, steerZ: 0, shift, seatY: 0.9, seatZ: 0.25 + shift, cargo: [0, 4.1, -1.2 + shift], tail: 5.4, lean: -0.22 };
}
