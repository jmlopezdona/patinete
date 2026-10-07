const X0 = -300;
const Z0 = -300;
const S = 1.5; // píxeles por unidad en el mapa base

// Minimapa circular que gira con la cámara.
export class Minimap {
  constructor(canvas, world) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = 190;
    canvas.width = canvas.height = this.size * dpr;
    this.dpr = dpr;
    const b = (this.base = document.createElement('canvas'));
    b.width = (360 - X0) * S;
    b.height = (300 - Z0) * S;
    const g = b.getContext('2d');
    const R = (x, z, w, d, c) => {
      g.fillStyle = c;
      g.fillRect((x - w / 2 - X0) * S, (z - d / 2 - Z0) * S, w * S, d * S);
    };
    g.fillStyle = '#2f8fd6';
    g.fillRect(0, 0, b.width, b.height);
    R(0, 0, 472, 472, '#e9d6a6');
    R(0, 0, 420, 420, '#59606a');
    for (const k of world.map.blocks) R(k.x, k.z, k.w, k.d, k.color);
    for (const k of world.map.buildings) R(k.x, k.z, k.w, k.d, '#8d949b');
    for (const c of world.map.circles) {
      g.fillStyle = c.color;
      g.beginPath();
      g.arc((c.x - X0) * S, (c.z - Z0) * S, c.r * S, 0, Math.PI * 2);
      g.fill();
    }
  }

  draw(px, pz, yaw, playerYaw, markers, goal) {
    const g = this.ctx;
    const sz = this.size;
    const zoom = 0.82;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, sz, sz);
    g.save();
    g.beginPath();
    g.arc(sz / 2, sz / 2, sz / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2f8fd6';
    g.fillRect(0, 0, sz, sz);
    g.translate(sz / 2, sz / 2);
    g.rotate(yaw - Math.PI);
    g.scale(zoom / S, zoom / S);
    g.translate(-(px - X0) * S, -(pz - Z0) * S);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0);
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
