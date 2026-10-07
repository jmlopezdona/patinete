// Terreno analítico: el suelo es el máximo de una lista de primitivas (cajas, rampas,
// quarter pipes, bowls...). Los edificios también son cajas: sus paredes bloquean
// porque el escalón es demasiado alto, y sus techos son pisables.

const NEG = -Infinity;

function local(p, x, z) {
  const dx = x - p.cx;
  const dz = z - p.cz;
  p.lx = dx * p.cos - dz * p.sin;
  p.lz = dx * p.sin + dz * p.cos;
}

const FN = {
  box(p, x, z) {
    local(p, x, z);
    return Math.abs(p.lx) <= p.hw && Math.abs(p.lz) <= p.hd ? p.top : NEG;
  },
  wedge(p, x, z) {
    local(p, x, z);
    if (Math.abs(p.lx) > p.hw || Math.abs(p.lz) > p.hd) return NEG;
    return p.lo + ((p.hi - p.lo) * (p.lz + p.hd)) / (2 * p.hd);
  },
  quarter(p, x, z) {
    local(p, x, z);
    if (Math.abs(p.lx) > p.hw || Math.abs(p.lz) > p.hd) return NEG;
    const s = p.lz + p.hd;
    return p.base + p.R - Math.sqrt(Math.max(0, p.R * p.R - s * s));
  },
  hump(p, x, z) {
    local(p, x, z);
    if (Math.abs(p.lx) > p.hw || Math.abs(p.lz) > p.hd) return NEG;
    const c = Math.cos((Math.PI * p.lz) / (2 * p.hd));
    return p.base + p.H * c * c;
  },
  pyramid(p, x, z) {
    local(p, x, z);
    const ax = Math.abs(p.lx);
    const az = Math.abs(p.lz);
    if (ax > p.hw || az > p.hd) return NEG;
    const k = Math.min((p.hw - ax) / (p.hw - p.thw), (p.hd - az) / (p.hd - p.thd), 1);
    return p.base + p.H * k;
  },
  cyl(p, x, z) {
    const dx = x - p.cx;
    const dz = z - p.cz;
    return dx * dx + dz * dz <= p.r * p.r ? p.top : NEG;
  },
  ring(p, x, z) {
    const r = Math.hypot(x - p.cx, z - p.cz);
    return r >= p.r0 && r <= p.r1 ? p.top : NEG;
  },
  bowl(p, x, z) {
    const r = Math.hypot(x - p.cx, z - p.cz);
    if (r < p.r0 || r > p.r0 + p.d) return NEG;
    const s = r - p.r0;
    return p.base + p.R - Math.sqrt(Math.max(0, p.R * p.R - s * s));
  },
  rcone(p, x, z) {
    const r = Math.hypot(x - p.cx, z - p.cz);
    if (r < p.r0 || r > p.r1) return NEG;
    return p.h0 + ((p.h1 - p.h0) * (r - p.r0)) / (p.r1 - p.r0);
  },
};

export class Terrain {
  constructor(islandHalf) {
    this.cells = new Map();
    this.cs = 20;
    this.rails = [];
    this.hit = null;
    this.islandHalf = islandHalf;
    this.waterY = -4;
  }

  _reg(p, ex, ez) {
    const cs = this.cs;
    const x0 = Math.floor((p.cx - ex) / cs);
    const x1 = Math.floor((p.cx + ex) / cs);
    const z0 = Math.floor((p.cz - ez) / cs);
    const z1 = Math.floor((p.cz + ez) / cs);
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const k = (i + 512) * 1024 + (j + 512);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(p);
      }
    }
    return p;
  }

  _obb(type, cx, cz, w, d, rot, extra) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const hw = w / 2;
    const hd = d / 2;
    const p = { f: FN[type], type, cx, cz, cos, sin, hw, hd, lx: 0, lz: 0, ...extra };
    return this._reg(p, Math.abs(cos) * hw + Math.abs(sin) * hd, Math.abs(sin) * hw + Math.abs(cos) * hd);
  }

  box(cx, cz, w, d, top, rot = 0) {
    return this._obb('box', cx, cz, w, d, rot, { top });
  }
  // Rampa recta: sube de lo a hi hacia +Z local.
  wedge(cx, cz, w, d, lo, hi, rot = 0) {
    return this._obb('wedge', cx, cz, w, d, rot, { lo, hi });
  }
  // Curva de radio R: empieza plana y sube hacia +Z local hasta el ángulo dado.
  quarter(cx, cz, w, R, angleDeg, rot = 0, base = 0) {
    const d = R * Math.sin((angleDeg * Math.PI) / 180);
    const lip = base + R * (1 - Math.cos((angleDeg * Math.PI) / 180));
    return this._obb('quarter', cx, cz, w, d, rot, { R, base, d, lip, vert: angleDeg >= 55 });
  }
  hump(cx, cz, w, d, H, rot = 0, base = 0) {
    return this._obb('hump', cx, cz, w, d, rot, { H, base });
  }
  pyramid(cx, cz, w, d, tw, td, H, rot = 0, base = 0) {
    return this._obb('pyramid', cx, cz, w, d, rot, { thw: tw / 2, thd: td / 2, H, base });
  }
  cyl(cx, cz, r, top) {
    return this._reg({ f: FN.cyl, type: 'cyl', cx, cz, r, top }, r, r);
  }
  ring(cx, cz, r0, r1, top) {
    return this._reg({ f: FN.ring, type: 'ring', cx, cz, r0, r1, top }, r1, r1);
  }
  bowl(cx, cz, r0, R, angleDeg, base = 0) {
    const d = R * Math.sin((angleDeg * Math.PI) / 180);
    const lip = base + R * (1 - Math.cos((angleDeg * Math.PI) / 180));
    return this._reg({ f: FN.bowl, type: 'bowl', cx, cz, r0, R, d, base, lip, vert: angleDeg >= 55 }, r0 + d, r0 + d);
  }
  rcone(cx, cz, r0, r1, h0, h1) {
    return this._reg({ f: FN.rcone, type: 'rcone', cx, cz, r0, r1, h0, h1 }, r1, r1);
  }
  rail(ax, az, bx, bz, ya, yb = ya) {
    const r = { ax, az, bx, bz, ya, yb, len: Math.hypot(bx - ax, bz - az) };
    this.rails.push(r);
    return r;
  }

  height(x, z) {
    let best = Math.abs(x) <= this.islandHalf && Math.abs(z) <= this.islandHalf ? 0 : this.waterY;
    let hit = null;
    const cs = this.cs;
    const cell = this.cells.get((Math.floor(x / cs) + 512) * 1024 + (Math.floor(z / cs) + 512));
    if (cell) {
      for (let i = 0; i < cell.length; i++) {
        const p = cell[i];
        const y = p.f(p, x, z);
        if (y > best) {
          best = y;
          hit = p;
        }
      }
    }
    this.hit = hit;
    return best;
  }
}
