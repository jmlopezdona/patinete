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
  run('A_accel', () => p.place(-150, 29, Math.PI / 2), 3, () => ({ throttle: 1 }));
  run('A2_boost', () => p.place(-150, 29, Math.PI / 2), 4, () => ({ throttle: 1, boost: true }));
  run('B_curb', () => { p.place(0, 29, Math.PI); setV(30); }, 1.2, () => ({ throttle: 1 }));
  run('C_tabletop', () => { p.place(66, 128, Math.PI / 2); setV(30); }, 3, () => ({ throttle: 1 }));
  run('D_halfpipe', () => { p.place(57, 87, 0); setV(31); }, 10, () => ({ throttle: 1 }));
  run('E_bowl', () => { p.place(110, 63, 0.3); setV(28); }, 8, () => ({ throttle: 1 }));
  run('F_wall20', () => { p.place(-29, 29, Math.PI / 2); setV(20); }, 1.5, () => ({ throttle: 1 }));
  run('F_wall35', () => { p.place(-29, 0, Math.PI / 2); setV(40); p.boost = 1; }, 3, () => ({ throttle: 1, boost: true }));
  run('G_rail', () => { p.place(80, 52, 0); setV(25); }, 3, (t, pl) => ({ throttle: 1, jumpPressed: pl.grounded && pl.pos.z > 61.5 && pl.pos.z < 63 }));
  run('H_mega', () => { p.place(120, 29, Math.PI / 2); setV(30); p.boost = 1; }, 7, (t, pl) => ({ throttle: pl.pos.x > 300 ? -1 : 1, boost: pl.pos.x < 290 }));
  run('H2_megaSlow', () => { p.place(200, 29, Math.PI / 2); setV(25); p.boost = 0; }, 5, () => ({ throttle: 1 }));
  run('I_spin360', () => { p.place(66, 128, Math.PI / 2); setV(31); }, 3, (t, pl) => ({ throttle: 1, steer: pl.grounded ? 0 : 1, trickPressed: !pl.grounded && pl.airTime > 0.1 && pl.airTime < 0.13 }));
  run('J_backflip', () => { p.place(57, 87, 0); setV(31); }, 4, (t, pl) => ({ throttle: pl.grounded ? 1 : -1, downPressed: !pl.grounded && pl.airTime > 0.13 && pl.airTime < 0.16 }));
  run('K_funbox', () => { p.place(80, 105, Math.PI / 2); setV(28); }, 3, () => ({ throttle: 1 }));
  run('L_rollers', () => { p.place(130, 90, 0); setV(22); }, 3, () => ({ throttle: 1 }));
  run('M_pondKicker', () => { p.place(-140, 61, -Math.PI / 2); setV(24); }, 3, () => ({ throttle: 1 }));
  run('N_return', () => { p.place(335, 42, -Math.PI / 2); p.boost = 1; }, 5, () => ({ throttle: 1, boost: true }));
  run('O_steer', () => { p.place(0, 29, Math.PI / 2); setV(20); }, 2, () => ({ throttle: 1, steer: 1 }));
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
