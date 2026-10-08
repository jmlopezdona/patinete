// Protocolo de la partida en red: qué mensajes hay y cómo se empaquetan. No sabe nada del juego.
//
// Por el canal fiable va JSON, que son pocos mensajes y se depuran a simple vista:
//   hola   invitado → anfitrión   { t, v, char, color }       al entrar y cada vez que cambia de personaje o color
//   sala   anfitrión → invitado   { t, you, on, players: [{ slot, char, color }] }   on: la partida ya ha empezado
//   aviso  jugador → anfitrión → los demás   { t, k, v } y, ya repartido, { t, from, k, v }: algo que ha hecho uno
//                                            (v: un número o una ristra de números)
//   mundo  anfitrión → invitado   { t, … }            al entrar: cómo está lo que no viaja en la `foto`
//   efecto anfitrión → invitado   { t, s, m, a }      algo que se ve o se oye: sistema, método y argumentos
//   orden  anfitrión → invitado   { t, m, a }         algo que el mundo le hace a su personaje
//   adios  cualquiera             { t, why }
// Por el canal sin garantías va binario, que caduca enseguida:
//   yo     invitado → anfitrión   el estado de su personaje
//   foto   anfitrión → invitado   el reloj del mundo, si es de noche, lo que se mueve solo (que aquí no se
//                                 mira: lo escribe y lo lee el juego) y el estado de todos los demás
const T_YO = 1;
const T_FOTO = 2;

export const RATE_YO = 20;
export const RATE_FOTO = 15;

// Bits de `flags` en el estado de un jugador
// BUSY: está a otra cosa (pausa, minijuego, modo foto, pestaña tapada) y el mundo no debe ir a por él
export const F = { GROUND: 1, GRIND: 2, BOOST: 4, CRASH: 8, SUNK: 16, HIDDEN: 32, INVULN: 64, HELD: 128, BUSY: 256 };

const HEAD = 7; // tipo (1) + número de orden (2) + reloj del que envía en ms (4)
const STATE = 31;
const WORLD = 7; // reloj del mundo en ms (4) + noche (1) + cuánto ocupa lo que se mueve solo (2)
const TAU = Math.PI * 2;
const ANG = 32767 / Math.PI;
const WHIP = 255 / 0.45;

export const blankState = () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, v: 0, yaw: 0, flip: 0, pitch: 0, whip: 0, steer: 0, throttle: 0, flags: F.GROUND });

const wrap = (a) => a - Math.round(a / TAU) * TAU;
const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));

// Posición en coma flotante de 32 bits; velocidades en centésimas y ángulos en 16 bits
function putState(dv, o, s) {
  dv.setFloat32(o, s.x, true);
  dv.setFloat32(o + 4, s.y, true);
  dv.setFloat32(o + 8, s.z, true);
  dv.setInt16(o + 12, i16(s.vx * 100), true);
  dv.setInt16(o + 14, i16(s.vy * 100), true);
  dv.setInt16(o + 16, i16(s.vz * 100), true);
  dv.setInt16(o + 18, i16(s.v * 100), true);
  dv.setInt16(o + 20, i16(wrap(s.yaw) * ANG), true);
  dv.setInt16(o + 22, i16(wrap(s.flip) * ANG), true);
  dv.setInt16(o + 24, i16(wrap(s.pitch) * ANG), true);
  dv.setUint8(o + 26, Math.max(0, Math.min(255, Math.round(s.whip * WHIP))));
  dv.setInt8(o + 27, Math.round(Math.max(-1, Math.min(1, s.steer)) * 127));
  dv.setInt8(o + 28, Math.round(Math.max(-1, Math.min(1, s.throttle)) * 127));
  dv.setUint16(o + 29, s.flags, true);
}

function getState(dv, o) {
  return {
    x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true), z: dv.getFloat32(o + 8, true),
    vx: dv.getInt16(o + 12, true) / 100, vy: dv.getInt16(o + 14, true) / 100, vz: dv.getInt16(o + 16, true) / 100,
    v: dv.getInt16(o + 18, true) / 100,
    yaw: dv.getInt16(o + 20, true) / ANG, flip: dv.getInt16(o + 22, true) / ANG, pitch: dv.getInt16(o + 24, true) / ANG,
    whip: dv.getUint8(o + 26) / WHIP, steer: dv.getInt8(o + 27) / 127, throttle: dv.getInt8(o + 28) / 127,
    flags: dv.getUint16(o + 29, true),
  };
}

function head(type, seq, t, size) {
  const dv = new DataView(new ArrayBuffer(size));
  dv.setUint8(0, type);
  dv.setUint16(1, seq & 0xffff, true);
  dv.setUint32(3, t >>> 0, true);
  return dv;
}

export function packYo(seq, t, state) {
  const dv = head(T_YO, seq, t, HEAD + STATE);
  putState(dv, HEAD, state);
  return dv.buffer;
}

// world: { time, night, bytes, write }, la hora del mundo en segundos, si es de noche y lo que se
// mueve solo: cuánto ocupa y quién lo escribe (`write(dv, o)`). list: [{ slot, state }]
export function packFoto(seq, t, world, list) {
  const dv = head(T_FOTO, seq, t, HEAD + WORLD + world.bytes + 1 + list.length * (1 + STATE));
  dv.setUint32(HEAD, (world.time * 1000) >>> 0, true);
  dv.setUint8(HEAD + 4, world.night ? 1 : 0);
  dv.setUint16(HEAD + 5, world.bytes, true);
  if (world.bytes) world.write(dv, HEAD + WORLD);
  let o = HEAD + WORLD + world.bytes;
  dv.setUint8(o++, list.length);
  for (const e of list) {
    dv.setUint8(o, e.slot);
    putState(dv, o + 1, e.state);
    o += 1 + STATE;
  }
  return dv.buffer;
}

// Devuelve { type: 'yo', seq, t, state }, { type: 'foto', seq, t, time, night, moving, players } o null si el
// paquete no cuadra. moving: un `DataView` con lo que se mueve solo
export function unpack(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < HEAD) return null;
  const type = dv.getUint8(0);
  const seq = dv.getUint16(1, true);
  const t = dv.getUint32(3, true);
  if (type === T_YO && dv.byteLength === HEAD + STATE) return { type: 'yo', seq, t, state: getState(dv, HEAD) };
  if (type === T_FOTO && dv.byteLength > HEAD + WORLD) {
    const size = dv.getUint16(HEAD + 5, true);
    const at = HEAD + WORLD + size;
    if (dv.byteLength <= at) return null;
    const n = dv.getUint8(at);
    if (dv.byteLength !== at + 1 + n * (1 + STATE)) return null;
    const players = [];
    for (let i = 0, o = at + 1; i < n; i++, o += 1 + STATE) players.push({ slot: dv.getUint8(o), state: getState(dv, o + 1) });
    return { type: 'foto', seq, t, time: dv.getUint32(HEAD, true) / 1000, night: dv.getUint8(HEAD + 4), moving: new DataView(buf, HEAD + WORLD, size), players };
  }
  return null;
}

// ¿Es `seq` posterior a `last`? Los números de orden dan la vuelta en 65 536
export const newer = (seq, last) => seq !== last && ((seq - last) & 0xffff) < 0x8000;

const mix = (a, b, k) => a + (b - a) * k;
const mixAng = (a, b, k) => a + wrap(b - a) * k;
const JUMP = 20; // más lejos que esto entre dos paquetes no es patinar: es reaparecer en otro sitio

// Estado intermedio entre dos recibidos (k de 0 a 1). Lo que es sí o no se queda con el más antiguo
export function mixState(a, b, k, out) {
  if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > JUMP) return Object.assign(out, k < 1 ? a : b);
  out.x = mix(a.x, b.x, k);
  out.y = mix(a.y, b.y, k);
  out.z = mix(a.z, b.z, k);
  out.vx = mix(a.vx, b.vx, k);
  out.vy = mix(a.vy, b.vy, k);
  out.vz = mix(a.vz, b.vz, k);
  out.v = mix(a.v, b.v, k);
  out.yaw = mixAng(a.yaw, b.yaw, k);
  out.flip = mixAng(a.flip, b.flip, k);
  out.pitch = mixAng(a.pitch, b.pitch, k);
  // El truco va de 0,45 a 0: si sube es que ha empezado otro, y no se mezcla con el anterior
  out.whip = b.whip > 0 && b.whip < a.whip ? mix(a.whip, b.whip, k) : a.whip;
  out.steer = mix(a.steer, b.steer, k);
  out.throttle = mix(a.throttle, b.throttle, k);
  out.flags = a.flags;
  return out;
}
