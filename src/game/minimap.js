import { DATA, BOUNDS } from '../world/cobena.js';

const X0 = BOUNDS.x0;
const Z0 = BOUNDS.z0;
const S = 0.6; // píxeles por unidad en el mapa base
const FIELD = '#d8c47a';
const ROAD = ['#4b5057', '#4b5057', '#4b5057', '#4b5057', '#6a6f75', '#e6d8b4', '#c9a577', '#b9925f', '#8a8f95'];
const BUILDING = ['#b5653a', '#a8552f', '#7d8a96', '#d9a92f', '#8a5a2b', '#9a9488', '#c9cdd1', '#a0a5a9', '#8a5a2b'];

// Minimapa circular que gira con la cámara. El plano base se dibuja una vez con el callejero.
export class Minimap {
  constructor(canvas, world) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = 190;
    canvas.width = canvas.height = this.size * dpr;
    this.dpr = dpr;
    const b = (this.base = document.createElement('canvas'));
    b.width = Math.round((BOUNDS.x1 - X0) * S);
    b.height = Math.round((BOUNDS.z1 - Z0) * S);
    const g = b.getContext('2d');
    g.fillStyle = FIELD;
    g.fillRect(0, 0, b.width, b.height);
    g.setTransform(S, 0, 0, S, -X0 * S, -Z0 * S);
    const path = (pts, close) => {
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      if (close) g.closePath();
    };
    const fill = (pts, color) => {
      g.fillStyle = color;
      path(pts, true);
      g.fill();
    };
    const rect = (r, color) => {
      g.save();
      g.translate(r.x, r.z);
      g.rotate(-(r.rot || 0));
      g.fillStyle = color;
      g.fillRect(-r.w / 2, -r.d / 2, r.w, r.d);
      g.restore();
    };
    for (const p of DATA.urban) fill(p, '#d6ccb0');
    for (const [type, , pts] of DATA.greens) fill(pts, type === 1 ? '#4f9a55' : type === 2 ? '#9fc36a' : '#6bbf6a');
    for (const p of DATA.water) fill(p, '#3a9be0');
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = '#3a9be0';
    g.lineWidth = 5;
    for (const p of DATA.streams) {
      path(p);
      g.stroke();
    }
    for (const [type, , pts] of DATA.paved) fill(pts, type === 0 ? '#e6d8b4' : '#6a6f75');
    g.strokeStyle = '#c3c7ca';
    for (const [, w, sw, , , pts] of DATA.roads) {
      if (sw <= 0) continue;
      g.lineWidth = w + sw * 2;
      path(pts);
      g.stroke();
    }
    for (const [cls, w, , , , pts] of DATA.roads) {
      g.strokeStyle = ROAD[cls];
      g.lineWidth = Math.max(w, 5);
      path(pts);
      g.stroke();
    }
    for (let i = 0; i < DATA.pools.length; i += 5) rect({ x: DATA.pools[i], z: DATA.pools[i + 1], w: DATA.pools[i + 2], d: DATA.pools[i + 3], rot: (DATA.pools[i + 4] * Math.PI) / 180 }, '#4fb4f0');
    for (const k of world.map.pitches) rect(k, k.color);
    for (const k of world.map.buildings) rect(k, BUILDING[k.kind] || BUILDING[0]);
    fill(DATA.places.skate.poly, '#f2a65a');
    for (const k of world.map.blocks) rect(k, k.color);
    for (const c of world.map.circles) {
      g.fillStyle = c.color;
      g.beginPath();
      g.arc(c.x, c.z, c.r, 0, Math.PI * 2);
      g.fill();
    }
    this.home = null; // la casa del personaje que se lleva
  }

  draw(px, pz, yaw, playerYaw, markers, goal, blips = []) {
    const g = this.ctx;
    const sz = this.size;
    const zoom = 0.82;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, sz, sz);
    g.save();
    g.beginPath();
    g.arc(sz / 2, sz / 2, sz / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = FIELD;
    g.fillRect(0, 0, sz, sz);
    g.translate(sz / 2, sz / 2);
    g.rotate(yaw - Math.PI);
    g.scale(zoom / S, zoom / S);
    g.translate(-(px - X0) * S, -(pz - Z0) * S);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0);
    // La casa de salida, bien visible
    const h = this.home;
    if (h) {
      g.scale(S, S);
      g.translate(-X0, -Z0);
      g.fillStyle = '#ff3d8b';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(h.x, h.z, 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();

    // Marcadores (sin girar el icono)
    const c = Math.cos(yaw - Math.PI);
    const s = Math.sin(yaw - Math.PI);
    const R = sz / 2 - 13;
    const put = (x, z, draw) => {
      const dx = (x - px) * zoom;
      const dz = (z - pz) * zoom;
      let mx = dx * c - dz * s;
      let my = dx * s + dz * c;
      const d = Math.hypot(mx, my);
      const out = d > R;
      if (out) {
        mx *= R / d;
        my *= R / d;
      }
      draw(sz / 2 + mx, sz / 2 + my, out);
    };
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const m of markers) {
      if (m.hidden) continue;
      put(m.x, m.z, (x, y, out) => {
        g.globalAlpha = out ? 0.75 : 1;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(x, y, 10, 0, Math.PI * 2);
        g.fill();
        g.font = '13px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
        g.fillText(m.icon, x, y + 1);
        g.globalAlpha = 1;
      });
    }
    // Marcianos (puntos verdes), gallinas enfadadas (blancos) y los que llevan icono: el platillo, el municipal, la abuela
    for (const b of blips) {
      put(b.x, b.z, (x, y, out) => {
        if (b.icon) {
          g.globalAlpha = out ? 0.8 : 1;
          g.fillStyle = '#12202e';
          g.beginPath();
          g.arc(x, y, 9, 0, Math.PI * 2);
          g.fill();
          g.font = '12px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
          g.fillText(b.icon, x, y + 1);
          g.globalAlpha = 1;
        } else if (!out) {
          g.fillStyle = b.color || '#8dff6a';
          g.strokeStyle = '#12202e';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, 3.6, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
      });
    }
    if (goal) {
      put(goal.x, goal.z, (x, y) => {
        g.fillStyle = '#35e07a';
        g.strokeStyle = '#0b3d20';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      });
    }
    // Jugador
    g.save();
    g.translate(sz / 2, sz / 2);
    g.rotate(yaw - playerYaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#12202e';
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }
}
