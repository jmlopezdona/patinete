import * as THREE from 'three';
import { lift, grade } from '../world/relief.js';

const POOL = 8; // charcos a la vez: si hacen falta más, se recicla el más seco
const LIFE = 26; // segundos que tarda en secarse
const SLIP_V = 7; // más despacio se cruza sin resbalar
const BOUNCES = 3; // rebotes que aguanta antes de deshacerse
const GREEN = '#8dff6a';
const COLORS = [0x7ddc1f, 0xb6ff5a, 0x4b9f4a];
const TAU = Math.PI * 2;
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();

// Mancha de borde irregular y radio 1, algo abombada por el centro
function blob(seed) {
  const N = 30;
  const pos = [0, 0.2, 0];
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const r = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2.3) + 0.06 * Math.sin(a * 8 + seed * 4.1);
    pos.push(Math.sin(a) * r * 0.6, 0.16, Math.cos(a) * r * 0.6, Math.sin(a) * r, 0, Math.cos(a) * r);
    const j = (i + 1) % N;
    idx.push(0, 1 + 2 * i, 1 + 2 * j, 1 + 2 * i, 2 + 2 * i, 2 + 2 * j, 1 + 2 * i, 2 + 2 * j, 1 + 2 * j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Baba verde: los charcos que dejan los marcianos al caer del platillo y al reventar. Rodando por
// encima se derrapa, cayendo encima se rebota, y a ellos también les hace resbalar.
// En red los charcos los pone el anfitrión, que cuenta cada uno una vez (`baba`); como no se mueven,
// resbalar y rebotar lo detecta cada jugador en su pantalla, y si lo gasta de un bote, lo avisa (`boing`).
export class Slime {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.fxT = 0;
    // Brilla un poco por sí sola: de noche tiene que verse desde lejos
    const mat = new THREE.MeshStandardMaterial({ color: 0x6fe01a, roughness: 0.16, emissive: 0x2c7d08, emissiveIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shapes = [0.4, 2.1, 4.6].map(blob);
    this.list = [];
    for (let i = 0; i < POOL; i++) {
      // Cada charco es un objeto suelto de la escena: así sube a la cota del terreno al pintar
      const mesh = new THREE.Mesh(shapes[i % shapes.length], mat);
      mesh.visible = false;
      mesh.receiveShadow = true;
      game.scene.add(mesh);
      this.list.push({ mesh, x: 0, y: 0, z: 0, r: 0, r0: 0, t: 0, k: 0, left: 0 });
    }
  }

  // ¿Los charcos son los del anfitrión de la partida en red?
  get led() {
    const party = this.game.party;
    return !!party && !party.hosting && party.fed;
  }

  // Deja un charco en el suelo, si es que ahí hay suelo llano donde quepa. life: lo que tarda en secarse
  splat(x, z, r = 3.2, life = LIFE) {
    if (this.led) return null;
    const T = this.T;
    const h = T.height(x, z);
    if (h < -0.4 || h > 0.8) return null;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      if (Math.abs(T.height(x + Math.sin(a) * r * 0.8, z + Math.cos(a) * r * 0.8) - h) > 0.45) return null;
    }
    let s = null;
    for (const o of this.list) {
      if (o.t <= 0) {
        if (!s || s.t > 0) s = o;
        continue;
      }
      // Encima de otro no se amontonan: el que ya había vuelve a estar fresco
      if (Math.hypot(o.x - x, o.z - z) < o.r + r * 0.6) {
        o.t = Math.max(o.t, life);
        o.left = BOUNCES;
        o.r = o.r0;
        this.tell(o);
        return o;
      }
      if (!s || (s.t > 0 && o.t < s.t)) s = o;
    }
    this.put(s, x, z, r, life, BOUNCES);
    this.tell(s);
    return s;
  }

  put(s, x, z, r, life, left) {
    const h = this.T.height(x, z);
    // El mismo charco, que vuelve a estar fresco, no se extiende otra vez
    if (s.t <= 0 || Math.abs(s.x - x) + Math.abs(s.z - z) > 0.2) {
      s.k = 0;
      // Tumbado sobre la cuesta de la calle, para que ni flote ni se hunda
      lift(x, z);
      _n.set(-grade.x, 1, -grade.z).normalize();
      s.mesh.quaternion.setFromUnitVectors(_up, _n);
      s.mesh.rotateY(Math.random() * TAU);
      s.mesh.position.set(x, h + 0.07, z);
      s.mesh.scale.setScalar(0.01);
    }
    s.x = x;
    s.y = h;
    s.z = z;
    s.r = s.r0 = r;
    s.t = life;
    s.left = left;
    s.mesh.visible = true;
  }

  // ---------- En red ----------
  // Anfitrión: un charco nuevo, o uno que vuelve a estar fresco
  tell(s) {
    this.game.party?.tell('baba', [this.list.indexOf(s), s.x, s.z, s.r0, s.t]);
  }

  heard(k, v) {
    const s = this.list[v[0] | 0];
    if (s && this.led && v[3] > 0 && v[4] > 0) this.put(s, v[1], v[2], Math.min(8, v[3]), Math.min(LIFE, v[4]), BOUNCES);
  }

  // Otro jugador ha rebotado en ese charco
  wear(i) {
    const s = this.list[i | 0];
    if (!s || s.t <= 0) return;
    s.left--;
    s.r *= 0.86;
    if (s.left <= 0) s.t = Math.min(s.t, 0.35);
  }

  // Los charcos que hay, para quien entra tarde
  dump() {
    const out = [];
    this.list.forEach((s, i) => s.t > 0.5 && out.push(i, s.x, s.z, s.r0, s.t, s.left));
    return out;
  }

  load(list) {
    for (let i = 0; i + 5 < list.length; i += 6) {
      const s = this.list[list[i] | 0];
      if (s && list.slice(i, i + 6).every((n) => typeof n === 'number') && list[i + 3] > 0) this.put(s, list[i + 1], list[i + 2], Math.min(8, list[i + 3]), Math.min(LIFE, list[i + 4]), list[i + 5] | 0);
    }
  }

  // El charco que hay bajo ese punto, si lo hay
  at(x, z, y) {
    for (const s of this.list) {
      if (s.t > 0 && s.k > 0.5 && Math.abs(y - s.y) < 1 && Math.hypot(s.x - x, s.z - z) < s.r) return s;
    }
    return null;
  }

  // El patinete ha caído encima y sale rebotado: el charco aguanta unos pocos y se deshace
  boing(p, s) {
    const g = this.game;
    this.wear(this.list.indexOf(s));
    g.party?.tell('boing', this.list.indexOf(s));
    p.squash = 1;
    g.sfx.boing(BOUNCES - 1 - s.left);
    g.camera3.addShake(0.2);
    g.hud.big('¡Boing!', GREEN, 0.7, true);
    g.bits.burst(p.pos.x, s.y + 0.6, p.pos.z, COLORS, 14, 10, s.y, 0.4);
  }

  // Un marciano ha resbalado
  slipped(a) {
    const g = this.game.at(a.x, a.z);
    g.sfx.squelch(0.7);
    g.bits.burst(a.x, a.y + 0.5, a.z, COLORS, 8, 7, a.y, 0.35);
  }

  // Se secan todos de golpe (amanece o se van los marcianos)
  clear() {
    for (const s of this.list) s.t = Math.min(s.t, 1);
  }

  update(dt, p, time) {
    const g = this.game;
    if (!g.aliens.active) this.clear();
    let near = null;
    for (const s of this.list) {
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t <= 0) {
        s.mesh.visible = false;
        continue;
      }
      // Se extiende de golpe al caer y encoge al secarse
      s.k = Math.min(1, s.k + dt * 4);
      const e = 1 - (1 - s.k) ** 3;
      const k = s.r * Math.min(e, s.t) * (1 + Math.sin(time * 3 + s.x) * 0.03);
      s.mesh.scale.set(k, Math.min(1, s.t) * (1 + Math.sin(time * 4.3 + s.z) * 0.25), k);
      if (!near && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 70) near = s;
    }

    // Rodando por encima se pierde el manillar
    if (p.grounded && !p.grind && !p.held && !p.frozen && p.crashT <= 0 && p.speed > SLIP_V) {
      const s = this.at(p.pos.x, p.pos.z, p.pos.y);
      if (s && p.skid()) {
        g.sfx.squelch();
        g.camera3.addShake(0.25);
        g.hud.big('¡Resbalón!', GREEN, 0.8, true);
        g.bits.burst(p.pos.x, s.y + 0.5, p.pos.z, COLORS, 12, 9, s.y, 0.4);
      }
    }
    // Salpica mientras se patina por ella, y los charcos cercanos burbujean
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.05;
    if (p.slip > 0 && p.grounded && p.crashT <= 0) g.bits.spawn(p.pos.x, p.pos.y + 0.3, p.pos.z, (Math.random() - 0.5) * 9, 3 + Math.random() * 4, (Math.random() - 0.5) * 9, COLORS[Math.floor(Math.random() * 3)], 0.3, 0.5, p.pos.y);
    if (near && Math.random() < 0.3) {
      const a = Math.random() * TAU;
      const r = Math.random() * near.r * 0.7;
      g.bits.spawn(near.x + Math.sin(a) * r, near.y + 0.3, near.z + Math.cos(a) * r, 0, 2.5 + Math.random() * 2, 0, COLORS[1], 0.22, 0.5, near.y);
    }
  }
}
