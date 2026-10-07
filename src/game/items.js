import * as THREE from 'three';
import { Builder } from '../lego/builder.js';
import { goldMetal } from '../lego/materials.js';
import { C } from '../lego/colors.js';

const SONIC_R = 46; // hasta dónde llega el timbrazo
const EVERY = 26; // segundos entre que se gasta un objeto y aparece el siguiente

function bellModel() {
  const b = new Builder();
  b.cyl(1.25, 0.3, 0, 0.15, 0, C.yellow, { seg: 20 });
  b.cyl(1.1, 1.1, 0, 0.85, 0, C.yellow, { seg: 20, r2: 0.6 });
  b.sphere(0.6, 0, 1.4, 0, C.yellow, { seg: 16, seg2: 10 });
  b.cyl(0.16, 0.5, 0, 2.1, 0, C.yellow, { seg: 8 });
  b.sphere(0.3, 0, -0.1, 0, C.red, { seg: 10, seg2: 8 });
  return b.mesh(goldMetal);
}

// Cada objeto: su icono, su nombre, cuándo aparece por la calle y qué hace al gastarlo.
// `use` devuelve false si no se ha gastado (y entonces se conserva).
const KINDS = {
  bell: {
    icon: '🔔', name: 'Timbre sónico', night: true, model: bellModel,
    tip: 'Hazlo sonar con <b>Q</b> cuando tengas marcianos cerca: los deja tontos, y al platillo también.',
    use(items, p) {
      const g = items.game;
      g.sfx.sonic();
      items.ring(p.pos.x, p.pos.y, p.pos.z);
      if (!g.aliens.active) {
        g.hud.toast('🔔 ¡Riiing! Aquí no hay marcianos a los que aturdir: guárdalo para esta noche.');
        return false;
      }
      const hit = g.aliens.sonic(p.pos.x, p.pos.z, SONIC_R);
      g.camera3.addShake(0.4);
      g.hud.big('¡Riiing!', '#ffd23a', 1, true);
      if (hit.ufo) g.hud.toast('🔔 ¡El platillo se ha quedado <b>atontado</b> y pierde altura! Salta y dale un coscorrón.');
      else if (hit.n) g.hud.toast(`🔔 <b>${hit.n}</b> ${hit.n > 1 ? 'marcianos tontos' : 'marciano tonto'} perdido${hit.n > 1 ? 's' : ''}: ahora el culetazo vale por cualquier lado.`);
      else g.hud.toast('🔔 ¡Riiing! No había ningún marciano lo bastante cerca.');
      return true;
    },
  },
};

// Objetos que aparecen por la calle: se recoge uno, se lleva encima y se gasta con Q.
export class Items {
  constructor(game) {
    this.game = game;
    this.T = game.terrain;
    this.held = null; // el que se lleva encima
    this.cd = 6;
    this.blips = [];
    // Solo hay uno por la calle cada vez
    const g = (this.group = new THREE.Group());
    g.visible = false;
    game.scene.add(g);
    const halo = new THREE.CircleGeometry(2.6, 28);
    halo.rotateX(-Math.PI / 2);
    this.halo = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.position.y = 0.15;
    g.add(this.halo);
    this.drop = { kind: null, mesh: null, x: 0, y: 0, z: 0, t: 0, far: 0, blip: { x: 0, z: 0, icon: '' } };

    // Onda del timbrazo
    const ring = new THREE.RingGeometry(0.86, 1, 48);
    ring.rotateX(-Math.PI / 2);
    this.wave = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.wave.visible = this.wave.frustumCulled = false;
    game.scene.add(this.wave);
    this.waveT = 1;
  }

  // Lo deja en una calle cercana, mejor por delante: los studs marcan por dónde se puede pasar
  spawn(kind, p) {
    const spots = this.game.world.studs;
    for (let k = 0; k < 40; k++) {
      const s = spots[Math.floor(Math.random() * spots.length)];
      const dx = s.x - p.pos.x;
      const dz = s.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 35 || d > 95) continue;
      if (k < 25 && dx * Math.sin(p.heading) + dz * Math.cos(p.heading) < 0) continue;
      const h = this.T.height(s.x, s.z);
      if (Math.abs(h) > 0.8 || s.y - h > 3) continue;
      const D = this.drop;
      if (D.mesh) {
        this.group.remove(D.mesh);
        D.mesh.geometry.dispose();
      }
      D.kind = kind;
      D.mesh = KINDS[kind].model();
      D.x = s.x;
      D.y = h;
      D.z = s.z;
      D.t = D.far = 0;
      D.blip.icon = KINDS[kind].icon;
      this.group.add(D.mesh);
      this.group.position.set(s.x, h, s.z);
      this.group.visible = true;
      return true;
    }
    return false;
  }

  take(p) {
    const g = this.game;
    const K = KINDS[this.drop.kind];
    this.held = this.drop.kind;
    this.group.visible = false;
    g.sfx.pickup();
    g.hud.setItem(K);
    g.hud.big(`¡${K.name}!`, '#ffd23a', 1.2, true);
    g.bits.burst(this.drop.x, p.pos.y + 2, this.drop.z, [0xffd23a, 0xfff27a, 0xffffff], 14, 9, this.drop.y, 0.4);
    g.hud.toast(`${K.icon} Llevas el <b>${K.name.toLowerCase()}</b>. ${K.tip}`);
  }

  use(p) {
    if (!KINDS[this.held].use(this, p)) return;
    this.held = null;
    this.cd = EVERY;
    this.game.hud.setItem(null);
  }

  // Onda que se abre por el suelo desde donde suena el timbre
  ring(x, y, z) {
    this.wave.position.set(x, y + 0.6, z);
    this.wave.visible = true;
    this.waveT = 0;
    this.game.bits.burst(x, y + 3, z, [0xffd23a, 0xfff27a, 0xffffff], 16, 12, y, 0.35);
  }

  update(dt, p, time) {
    const g = this.game;
    const D = this.drop;
    const on = this.group.visible;
    const night = g.aliens.active;
    this.blips.length = 0;
    if (on && KINDS[D.kind].night && !night) this.group.visible = false;
    else if (on) {
      D.t += dt;
      const d = Math.hypot(p.pos.x - D.x, p.pos.z - D.z);
      const k = Math.min(1, D.t * 3);
      D.mesh.position.y = 1.5 + Math.sin(time * 2.6) * 0.3;
      D.mesh.rotation.y = time * 2.2;
      D.mesh.rotation.z = Math.sin(time * 9) * 0.22;
      D.mesh.scale.setScalar(1.3 * k * (1 + Math.sin(k * Math.PI) * 0.3));
      this.halo.material.opacity = 0.3 + Math.sin(time * 5) * 0.12;
      D.blip.x = D.x;
      D.blip.z = D.z;
      this.blips.push(D.blip);
      // Si se queda muy atrás, vuelve a aparecer más a mano
      D.far = d > 150 ? D.far + dt : 0;
      if (D.far > 4) {
        this.group.visible = false;
        this.cd = 1;
      } else if (d < 3.4 && Math.abs(p.pos.y - D.y) < 4 && p.crashT <= 0 && !p.held) this.take(p);
    } else if (!this.held && night && !p.held) {
      this.cd -= dt;
      if (this.cd <= 0) this.cd = this.spawn('bell', p) ? 0 : 1;
    }
    if (this.held && g.input.hit('item') && p.crashT <= 0 && !p.held) this.use(p);

    if (this.waveT < 1) {
      this.waveT = Math.min(1, this.waveT + dt / 0.7);
      const e = 1 - (1 - this.waveT) ** 2;
      this.wave.scale.setScalar(1 + e * (SONIC_R - 1));
      this.wave.material.opacity = (1 - this.waveT) * 0.8;
      if (this.waveT >= 1) this.wave.visible = false;
    }
  }
}
