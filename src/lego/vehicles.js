import * as THREE from 'three';
import { Builder, profileGeo } from './builder.js';
import { C } from './colors.js';
import { plastic, rubber, textTexture } from './materials.js';
import { createScooter, WHEEL_R, STEER_Z, DECK_Y, BAR_Y } from './scooter.js';

// Vehículos del jugador. Todos miran hacia +Z con el origen en el suelo y comparten interfaz:
//   group    malla completa
//   kind     'scooter' | 'skate' | 'skates' | 'unicycle' | 'bike' | 'car'
//   wheelR   radio de rueda (para que giren a la velocidad justa)
//   steerZ   eje vertical sobre el que pivota el vehículo en los trucos
//   seatY/Z  dónde va sentado (o de pie) el piloto
//   cargo    dónde se apilan las pizzas del reparto
//   tail     distancia del centro a la cola (llamas del turbo)

const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe9a0, emissiveIntensity: 1.6, roughness: 0.3 });
const taillight = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xc01208, emissiveIntensity: 1.2, roughness: 0.3 });
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

// Patinete eléctrico: tabla ancha y negra con la batería dentro, ruedas gordas con el motor en el
// buje de delante, guardabarros, columna alta con la pantalla en el manillar, faro y piloto trasero.
// Mismas medidas que el patinete de siempre, así el piloto va igual de colocado.
export function createEScooter(color = C.yellow) {
  const group = new THREE.Group();
  const WZ_R = -2.35;
  const WZ_F = 2.45;
  const b = new Builder();
  // Tabla con la batería, lija por encima y un filo de color a cada lado
  b.box(1.5, 0.46, 3.5, 0, DECK_Y - 0.26, -0.25, C.black, { r: 0.12 });
  b.box(1.24, 0.05, 3.0, 0, DECK_Y - 0.02, -0.25, C.dgray);
  for (const sx of [-1, 1]) {
    b.box(0.1, 0.16, 3.2, sx * 0.76, DECK_Y - 0.2, -0.25, color, { r: 0.04 });
    // Horquilla trasera y delantera
    b.box(0.16, 0.36, 1.25, sx * 0.5, WHEEL_R + 0.02, WZ_R + 0.38, C.black, { r: 0.06 });
    b.box(0.16, 1.5, 0.3, sx * 0.48, WHEEL_R + 0.62, WZ_F - 0.1, C.black, { r: 0.06, rx: -0.2 });
  }
  // Guardabarros trasero (también hace de freno) con el piloto, y el delantero
  b.box(0.62, 0.12, 1.5, 0, WHEEL_R + 0.84, WZ_R - 0.12, color, { r: 0.05, rx: 0.34 });
  b.box(0.62, 0.12, 0.7, 0, WHEEL_R + 0.44, WZ_R - 0.98, color, { r: 0.05, rx: 1.0 });
  b.box(0.62, 0.12, 1.2, 0, WHEEL_R + 0.86, WZ_F + 0.1, color, { r: 0.05, rx: -0.2 });
  // Cuello que sube de la tabla a la dirección, con la bisagra de plegado
  b.box(0.5, 0.5, 1.5, 0, DECK_Y + 0.28, STEER_Z - 0.42, C.black, { r: 0.12, rx: -0.62 });
  b.box(0.62, 0.5, 0.62, 0, 1.72, STEER_Z, C.dgray, { r: 0.12 });
  b.cyl(0.12, 0.74, 0, 1.72, STEER_Z, color, { axis: 'x', seg: 10 });
  // Pata de cabra recogida
  b.box(0.1, 0.1, 0.9, -0.72, DECK_Y - 0.5, -0.5, C.lgray, { r: 0.04 });
  group.add(b.mesh(plastic));

  // Dirección: columna negra con un anillo de color, manillar con puños, pantalla y faro
  const steer = new THREE.Group();
  steer.position.set(0, 0, STEER_Z);
  const s = new Builder();
  s.cyl(0.21, BAR_Y - 1.9, 0, (BAR_Y + 1.9) / 2, 0, C.black, { seg: 14 });
  s.cyl(0.24, 0.3, 0, 2.5, 0, color, { seg: 14 });
  s.cyl(0.11, 3.0, 0, BAR_Y, 0, C.black, { axis: 'x', seg: 10 });
  for (const sx of [-1, 1]) {
    s.cyl(0.18, 0.72, sx * 1.2, BAR_Y, 0, C.dgray, { axis: 'x', seg: 12 });
    s.cyl(0.21, 0.08, sx * 1.58, BAR_Y, 0, color, { axis: 'x', seg: 12 });
  }
  // Maneta de freno y gatillo del acelerador
  s.box(0.7, 0.07, 0.07, -1.05, BAR_Y + 0.04, 0.26, C.lgray, { ry: 0.2 });
  s.box(0.2, 0.22, 0.3, 0.72, BAR_Y - 0.1, 0.12, color, { r: 0.05 });
  // Pantalla
  s.box(0.7, 0.16, 0.56, 0, BAR_Y + 0.12, 0, C.black, { r: 0.06 });
  s.box(0.46, 0.03, 0.3, 0, BAR_Y + 0.21, 0, C.lime);
  s.box(0.42, 0.44, 0.3, 0, BAR_Y - 0.62, 0.26, C.black, { r: 0.08 });
  steer.add(s.mesh(plastic));
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14), headlight);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, BAR_Y - 0.62, 0.43);
  steer.add(lamp);
  group.add(steer);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.08), taillight);
  tail.position.set(0, WHEEL_R + 0.3, WZ_R - 1.3);
  tail.rotation.x = 1.0;
  group.add(tail);

  const wheel = (motor) => {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.26, 12, 28), rubber);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    const w = new Builder();
    w.cyl(motor ? 0.44 : 0.36, motor ? 0.6 : 0.46, 0, 0, 0, C.black, { axis: 'x', seg: 20 });
    w.cyl(0.2, motor ? 0.66 : 0.52, 0, 0, 0, color, { axis: 'x', seg: 12 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      w.box(motor ? 0.62 : 0.48, 0.08, 0.2, 0, Math.sin(a) * 0.28, Math.cos(a) * 0.28, C.lgray, { rx: -a });
    }
    g.add(tire, w.mesh(plastic));
    return g;
  };
  const rear = wheel(false);
  rear.position.set(0, WHEEL_R, WZ_R);
  const front = wheel(true);
  front.position.set(0, WHEEL_R, WZ_F);
  group.add(rear, front);
  return { group, steer, rear, front, kind: 'scooter', electric: true, wheelR: WHEEL_R, steerZ: STEER_Z, seatY: DECK_Y, seatZ: -0.5, cargo: [0, 1.5, -2.2], tail: 2.8, lean: 0.9 };
}

// Patinete de calle, de los de toda la vida: tabla baja y estrecha con su lija, dos ruedas pequeñas,
// el freno de pisar sobre la de atrás, columna de aluminio y manillar en T con puños de goma.
export function createKickScooter(color = C.lime) {
  const group = new THREE.Group();
  const R = 0.55;
  const DECK = 0.64; // la tabla va más baja que la del patinete de Jose Manuel, y el manillar con ella
  const BAR = BAR_Y - (DECK_Y - DECK);
  const WZ_R = -2.3;
  const WZ_F = STEER_Z + 0.45;
  const b = new Builder();
  b.box(1.0, 0.16, 3.2, 0, DECK - 0.08, -0.3, color, { r: 0.06 });
  b.box(0.86, 0.03, 2.8, 0, DECK + 0.01, -0.3, C.black);
  for (const sx of [-1, 1]) b.box(0.08, 0.3, 1.1, sx * 0.3, R + 0.02, WZ_R + 0.3, color, { r: 0.03 });
  // Freno de pisar
  b.box(0.46, 0.06, 1.0, 0, R * 2 + 0.12, WZ_R - 0.05, C.lgray, { r: 0.02, rx: 0.22 });
  // Cuello que sube de la tabla a la pipa de la dirección
  b.box(0.3, 0.26, 1.1, 0, DECK + 0.36, STEER_Z - 0.42, color, { r: 0.08, rx: -0.75 });
  b.cyl(0.21, 0.7, 0, 1.5, STEER_Z, color, { seg: 12 });
  group.add(b.mesh(plastic));

  const steer = new THREE.Group();
  steer.position.set(0, 0, STEER_Z);
  const s = new Builder();
  for (const sx of [-1, 1]) s.box(0.08, 1.0, 0.16, sx * 0.3, 0.92, 0.24, C.lgray, { r: 0.03, rx: 0.42 });
  s.box(0.68, 0.14, 0.3, 0, 1.2, 0.05, C.lgray, { r: 0.05 });
  s.cyl(0.13, BAR - 1.1, 0, (BAR + 1.1) / 2, 0, C.lgray, { seg: 12 });
  s.cyl(0.18, 0.34, 0, 2.0, 0, C.black, { seg: 12 });
  s.cyl(0.1, 2.5, 0, BAR, 0, C.lgray, { axis: 'x', seg: 10 });
  for (const sx of [-1, 1]) s.cyl(0.15, 0.62, sx * 1.0, BAR, 0, C.black, { axis: 'x', seg: 12 });
  steer.add(s.mesh(plastic));
  group.add(steer);

  const wheel = () => {
    const w = new Builder();
    w.cyl(R, 0.26, 0, 0, 0, C.black, { axis: 'x', seg: 24 });
    w.cyl(R * 0.68, 0.28, 0, 0, 0, color, { axis: 'x', seg: 20 });
    w.cyl(0.13, 0.3, 0, 0, 0, C.lgray, { axis: 'x', seg: 10 });
    for (let i = 0; i < 3; i++) w.box(0.3, R * 1.2, 0.09, 0, 0, 0, C.white, { rx: (i / 3) * Math.PI });
    return w.mesh(plastic);
  };
  const rear = wheel();
  rear.position.set(0, R, WZ_R);
  const front = wheel();
  front.position.set(0, R, WZ_F);
  group.add(rear, front);
  return { group, steer, rear, front, kind: 'scooter', wheelR: R, steerZ: STEER_Z, seatY: DECK, seatZ: -0.5, cargo: [0, 1.2, -2.0], tail: 2.7, lean: 1 };
}

// Monopatín: tabla con las puntas levantadas, lija negra, ejes y cuatro ruedecitas.
// La tabla va en un grupo aparte para poder voltearla en los kickflips.
export function createSkateboard(color = C.red) {
  const group = new THREE.Group();
  const R = 0.3;
  const DECK = 2 * R + 0.24;
  const board = new THREE.Group();
  board.position.y = DECK;
  const b = new Builder();
  b.box(1.36, 0.14, 3.1, 0, 0, 0, color, { r: 0.06 });
  b.box(1.26, 0.03, 3.0, 0, 0.08, 0, C.black);
  for (const sz of [-1, 1]) {
    b.box(1.36, 0.14, 0.95, 0, 0.14, sz * 1.92, color, { r: 0.06, rx: -sz * 0.34 });
    b.cyl(0.68, 0.14, 0, 0.29, sz * 2.34, color, { rx: -sz * 0.34, seg: 20 });
    b.box(1.26, 0.03, 0.9, 0, 0.22, sz * 1.9, C.black, { rx: -sz * 0.34 });
    // Ejes
    b.box(0.5, 0.2, 0.42, 0, -0.16, sz * 1.25, C.lgray, { r: 0.06 });
    b.cyl(0.07, 1.5, 0, -0.24, sz * 1.25, C.lgray, { axis: 'x', seg: 8 });
  }
  board.add(b.mesh(plastic));
  const wb = new Builder();
  wb.cyl(R, 0.3, 0, 0, 0, C.cream, { axis: 'x', seg: 16 });
  wb.cyl(R * 0.45, 0.32, 0, 0, 0, color, { axis: 'x', seg: 10 });
  const wgeo = wb.geometry();
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wgeo, plastic);
      w.castShadow = true;
      w.position.set(sx * 0.68, -0.24, sz * 1.25);
      board.add(w);
      wheels.push(w);
    }
  }
  group.add(board);
  return { group, board, wheels, kind: 'skate', wheelR: R, steerZ: 0, seatY: DECK + 0.1, seatZ: 0, cargo: [0, DECK + 0.25, 1.75], tail: 2.4, lean: 1.25 };
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

// Patines en línea: no son un vehículo aparte sino dos botas que se calzan en las piernas de la
// minifigura (wear), así que siguen cada zancada. El grupo va vacío y seatY es lo que levantan del suelo.
export function createSkates(color = C.magenta) {
  const R = 0.24;
  const H = 2 * R; // de la suela al suelo
  const b = new Builder();
  b.box(0.98, 0.66, 1.46, 0, -1.44, 0.17, C.white, { r: 0.12 });
  b.box(0.98, 0.62, 1.08, 0, -0.9, 0, C.white, { r: 0.1 });
  // Cierre de la caña, hebilla del empeine y guía con sus cuatro ruedas
  b.box(1.02, 0.2, 1.12, 0, -0.72, 0, color, { r: 0.06 });
  b.box(1.02, 0.16, 0.5, 0, -1.26, 0.52, color, { r: 0.05 });
  b.box(0.26, 0.22, 1.86, 0, -1.84, 0.15, C.dgray, { r: 0.05 });
  for (let i = 0; i < 4; i++) {
    b.cyl(R, 0.2, 0, -1.75 - H + R, -0.56 + i * 0.47, color, { axis: 'x', seg: 14 });
    b.cyl(R * 0.42, 0.24, 0, -1.75 - H + R, -0.56 + i * 0.47, C.lgray, { axis: 'x', seg: 8 });
  }
  const geo = b.geometry();
  const boots = [0, 1].map(() => {
    const m = new THREE.Mesh(geo, plastic);
    m.castShadow = true;
    return m;
  });
  const wear = (fig) => {
    fig.legL.add(boots[0]);
    fig.legR.add(boots[1]);
  };
  return { group: new THREE.Group(), boots, wear, kind: 'skates', wheelR: R, steerZ: 0, seatY: H, seatZ: 0, cargo: [0, 2.2, -1.6], tail: 1, lean: 1.3 };
}

// Monovolumen familiar: lunas transparentes para que se vea quién va dentro y puerta corredera
// detrás, a la derecha. seats dice dónde van sentados el conductor y la niña (altura de la cadera).
export function createMinivan(color = C.medAzure, plate = 'PAPÁ') {
  const group = new THREE.Group();
  const W = 4.8;
  const L = 9.6;
  const BELT = 2.8;
  const ROOF = 5.3;
  const b = new Builder();
  b.box(W - 0.2, 0.5, L - 0.6, 0, 0.9, 0, C.black);
  b.box(W, BELT - 1.1, L, 0, (BELT + 1.1) / 2, 0, color, { r: 0.3 });
  b.box(W - 0.3, 0.3, 6.8, 0, ROOF + 0.15, -1.25, color, { r: 0.1 });
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.16);
    b.add(profileGeo([[2.85, BELT], [3.2, BELT], [2.25, ROOF], [1.9, ROOF]], 0.3), color, x, 0, 0);
    for (const z of [0.1, -2.5, -4.5]) b.box(0.3, ROOF - BELT, 0.34, x, (ROOF + BELT) / 2, z, color);
    b.box(0.5, 0.12, 6.2, sx * 1.5, ROOF + 0.4, -1.3, C.lgray, { r: 0.05 }); // barras del techo
    b.box(1.0, 0.45, 0.16, sx * 1.6, 2.25, L / 2 + 0.02, 0xfff3b0, { r: 0.06 });
    b.box(0.7, 0.9, 0.16, sx * 1.9, 2.3, -L / 2 - 0.02, C.red, { r: 0.06 });
    b.box(0.2, 0.34, 0.5, sx * (W / 2 + 0.2), BELT + 0.2, 2.75, C.black, { r: 0.06 }); // retrovisores
    for (const wz of [-2.9, 2.9]) b.cyl(1.14, 0.3, sx * (W / 2 - 0.1), 1.0, wz, C.black, { axis: 'x', seg: 18 });
  }
  for (const sz of [-1, 1]) b.box(W + 0.2, 0.5, 0.5, 0, 1.25, sz * (L / 2 + 0.03), C.lgray, { r: 0.1 });
  b.box(2.0, 0.5, 0.12, 0, 2.2, L / 2 + 0.03, C.black, { r: 0.05 });
  // Hueco de la puerta corredera (solo se ve con ella abierta), asientos, salpicadero y volante
  b.box(0.08, BELT - 1.5, 2.2, -W / 2 - 0.01, (BELT + 1.3) / 2, -1.3, C.black);
  for (const [x, z] of [[1.15, 0.2], [-1.15, 0.2], [1.15, -2.3], [-1.15, -2.3]]) b.box(1.7, 1.9, 0.4, x, BELT + 0.5, z, C.cream, { r: 0.12, rx: -0.1 });
  b.box(W - 0.5, 0.5, 0.9, 0, BELT + 0.1, 2.6, C.dgray, { r: 0.1 });
  b.cyl(0.07, 0.8, 1.15, BELT + 0.4, 2.2, C.black, { rx: 1.0, seg: 8 });
  b.add(new THREE.TorusGeometry(0.42, 0.08, 6, 18), C.black, 1.15, BELT + 0.6, 1.88, -0.4, 0, 0);
  group.add(b.mesh(plastic));
  group.add(new THREE.Mesh(profileGeo([[3.05, BELT], [2.08, ROOF], [-4.6, ROOF], [-4.6, BELT]], W - 0.34), glass));

  for (const back of [false, true]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.48), new THREE.MeshBasicMaterial({ map: textTexture(plate, { bg: '#ffffff', fg: '#12202e', w: 256, h: 82, border: '#12202e' }) }));
    pl.position.set(0, 1.3, (back ? -1 : 1) * (L / 2 + 0.3));
    if (back) pl.rotation.y = Math.PI;
    group.add(pl);
  }

  const door = new THREE.Group();
  const db = new Builder();
  db.box(0.14, BELT - 1.4, 2.3, -W / 2 - 0.08, (BELT + 1.3) / 2, -1.3, color, { r: 0.05 });
  db.box(0.1, 0.14, 0.5, -W / 2 - 0.18, BELT - 0.35, -0.6, C.lgray, { r: 0.04 });
  door.add(db.mesh(plastic));
  group.add(door);

  const wb = new Builder();
  wb.cyl(0.95, 0.7, 0, 0, 0, C.black, { axis: 'x', seg: 18 });
  wb.cyl(0.52, 0.74, 0, 0, 0, C.lgray, { axis: 'x', seg: 12 });
  for (let i = 0; i < 3; i++) wb.box(0.76, 0.14, 0.9, 0, 0, 0, C.dgray, { rx: (i * Math.PI) / 3 });
  const wgeo = wb.geometry();
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const wz of [-2.9, 2.9]) {
      const w = new THREE.Mesh(wgeo, plastic);
      w.castShadow = true;
      w.position.set(sx * (W / 2 - 0.34), 0.95, wz);
      group.add(w);
      wheels.push(w);
    }
  }
  return { group, wheels, door, wheelR: 0.95, len: L, width: W, seats: { driver: [1.15, 1.6, 0.95], kid: [-1.15, 1.6, -1.55] }, doorZ: -1.3 };
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
