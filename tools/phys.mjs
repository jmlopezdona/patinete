// Herramienta de desarrollo: simula la física sin esperar al render y resume lo que pasa.
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:5173/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'], defaultViewport: { width: 800, height: 450 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(URL + '?autostart&q=0', { waitUntil: 'load' });
await page.waitForFunction('window.__game && window.__game.env', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));

const res = await page.evaluate(() => {
  const g = window.__game;
  g.paused = true;
  const p = g.player;
  const out = {};
  const events = [];
  const oLand = g.onLand.bind(g);
  g.onLand = (r) => { events.push({ t: 'land', air: +r.air.toFixed(2), spins: r.spins, flips: r.flips, whips: r.whips, grind: +r.grind.toFixed(2), h: +r.height.toFixed(1), sk: r.sketchy, cr: r.crashed }); oLand(r); };
  const oCrash = g.onCrash.bind(g);
  g.onCrash = () => { events.push({ t: 'crash', x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1) }); oCrash(); };
  const oSplash = g.onSplash.bind(g);
  g.onSplash = () => { events.push({ t: 'splash', x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1) }); oSplash(); };
  const oLaunch = p.launch.bind(p);
  p.launch = (vx, vy, vz, prim, x0, z0, keep) => { oLaunch(vx, vy, vz, prim, x0, z0, keep); events.push({ t: 'launch', in: [vx, vy, vz].map((n) => +n.toFixed(1)), prim: prim ? prim.type : null, out: [p.vel.x, p.vel.y, p.vel.z].map((n) => +n.toFixed(1)), y: +p.pos.y.toFixed(1) }); };
  const inp0 = { steer: 0, throttle: 0, boost: false, jumpPressed: false, trickPressed: false, upPressed: false, downPressed: false };
  function run(name, setup, secs, ctrl) {
    events.length = 0;
    setup();
    let maxY = -99, maxV = 0, airFrames = 0, grindFrames = 0;
    const trace = [];
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      const inp = { ...inp0, ...(ctrl ? ctrl(i / 60, p) : {}) };
      p.update(1 / 60, inp);
      g.bits.update(1 / 60);
      maxY = Math.max(maxY, p.pos.y); maxV = Math.max(maxV, p.speed);
      if (!p.grounded) airFrames++;
      if (p.grind) grindFrames++;
      if (i % 15 === 0) trace.push([+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1), +p.v.toFixed(1), p.grounded ? 'G' : p.grind ? 'R' : 'A'].join(' '));
    }
    out[name] = { end: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1)], v: +p.v.toFixed(1), maxY: +maxY.toFixed(2), maxV: +maxV.toFixed(1), airS: +(airFrames / 60).toFixed(2), grindS: +(grindFrames / 60).toFixed(2), events: JSON.parse(JSON.stringify(events)), trace: trace.join(' | ') };
  }
  const setV = (v) => { p.v = v; };
  const P = g.world.places;
  // Coordenadas locales del skatepark: X a lo largo de la parcela (hacia el este), Z hacia el sur
  const T = P.trick;
  const cs = Math.cos(T.rot), sn = Math.sin(T.rot);
  const E = Math.atan2(cs, -sn); // rumbo +X local
  const sk = (lx, lz, h, v) => { p.place(T.x0 + lx * cs + lz * sn, T.z0 - lx * sn + lz * cs, h); setV(v); };
  const sp = P.spawn;
  const mx = P.megaHole.x0;
  const mz = P.mega.z;
  run('A_accel', () => p.place(sp.x, sp.z, sp.heading), 3, () => ({ throttle: 1 }));
  run('A2_boost', () => p.place(sp.x, sp.z, sp.heading), 4, () => ({ throttle: 1, boost: true }));
  run('C_tabletop', () => sk(-98, -27, E, 30), 3, () => ({ throttle: 1 }));
  run('D_halfpipe', () => sk(-2, -19, E, 31), 10, () => ({ throttle: 1 }));
  run('E_bowl', () => sk(72, -4, E + 0.3, 28), 8, () => ({ throttle: 1 }));
  run('G_rail', () => sk(12, 29, E, 25), 3, (t, pl) => ({ throttle: 1, jumpPressed: pl.grounded && t > 0.3 && t < 0.36 }));
  run('H_mega', () => { p.place(mx - 116, mz, Math.PI / 2); setV(30); p.boost = 1; }, 7, (t, pl) => ({ throttle: pl.pos.x > mx + 64 ? -1 : 1, boost: pl.pos.x < mx + 54 }));
  run('H2_megaSlow', () => { p.place(mx - 36, mz, Math.PI / 2); setV(25); p.boost = 0; }, 5, () => ({ throttle: 1 }));
  run('I_spin360', () => sk(-98, -27, E, 31), 3, (t, pl) => ({ throttle: 1, steer: pl.grounded ? 0 : 1, trickPressed: !pl.grounded && pl.airTime > 0.1 && pl.airTime < 0.13 }));
  run('J_backflip', () => sk(-2, -19, E, 31), 4, (t, pl) => ({ throttle: pl.grounded ? 1 : -1, downPressed: !pl.grounded && pl.airTime > 0.13 && pl.airTime < 0.16 }));
  run('K_funbox', () => sk(-14, 18, E, 28), 3, () => ({ throttle: 1 }));
  run('L_rollers', () => sk(-76, 8, E, 22), 3, () => ({ throttle: 1 }));
  run('N_return', () => { p.place(mx + 99, mz + 13, -Math.PI / 2); p.boost = 1; }, 5, () => ({ throttle: 1, boost: true }));
  run('O_wall', () => { p.place(sp.x, sp.z, sp.heading + Math.PI / 2); setV(20); }, 2, () => ({ throttle: 1 }));
  // Vuelta completa al circuito de la carrera siguiendo la línea: comprueba que las calles son transitables
  {
    const R = P.race;
    const line = [];
    for (let i = 0; i < R.line.length; i += 2) line.push([R.line[i], R.line[i + 1]]);
    let k = 1;
    let bumps = 0;
    const oBump = g.onBump.bind(g);
    g.onBump = (s) => { bumps++; oBump(s); };
    p.place(R.start.x, R.start.z, R.start.heading);
    let t = 0;
    let stuck = 0;
    for (; t < 240 && k < line.length; t += 1 / 60) {
      let tx = line[k][0], tz = line[k][1];
      while (k < line.length - 1 && Math.hypot(tx - p.pos.x, tz - p.pos.z) < 10) { k++; tx = line[k][0]; tz = line[k][1]; }
      if (k === line.length - 1 && Math.hypot(tx - p.pos.x, tz - p.pos.z) < 10) break;
      let d = Math.atan2(tx - p.pos.x, tz - p.pos.z) - p.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      p.update(1 / 60, { ...inp0, throttle: Math.abs(d) > 0.6 && p.v > 14 ? -0.3 : 1, steer: d > 0.06 ? -1 : d < -0.06 ? 1 : 0 });
      stuck = p.speed < 1 ? stuck + 1 : 0;
      if (stuck > 240) break;
    }
    out.Z_race = { end: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1)], v: +p.v.toFixed(1), maxY: 0, maxV: 0, airS: 0, grindS: 0, events: [{ t: +t.toFixed(1), k, n: line.length, bumps, gold: Math.round(R.length / 27), len: R.length }], trace: '' };
  }
  return out;
});
for (const k in res) {
  const r = res[k];
  console.log(`\n== ${k}: end=${r.end} v=${r.v} maxY=${r.maxY} maxV=${r.maxV} air=${r.airS}s grind=${r.grindS}s`);
  console.log('   ev:', JSON.stringify(r.events));
  console.log('   ' + r.trace);
}
if (errors.length) console.log('\nERRORES:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
