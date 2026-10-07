// Herramienta de desarrollo: recorre las misiones con entradas simuladas y avisa de errores.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const URL = process.env.GAME_URL || 'http://localhost:5173/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,810'], defaultViewport: { width: 1440, height: 810 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(URL + '?autostart&q=2', { waitUntil: 'load' });
await page.waitForFunction('window.__game && window.__game.env', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));

await page.evaluate(() => {
  const g = window.__game;
  g.paused = true;
  const I = g.input;
  const base = () => ({ steer: 0, throttle: 0, boost: false, jumpPressed: false, trickPressed: false, upPressed: false, downPressed: false });
  window.sim = (secs, ctrl) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      const c = ctrl ? ctrl(i / 60, g.player) || {} : {};
      if (c.keys) for (const k of c.keys) I.pressed.add(k);
      g.update(1 / 60, { ...base(), ...c });
      I.endFrame();
    }
  };
  window.startMission = (id) => {
    const m = g.missions;
    if (m.active) m._cleanup();
    m.begin(m.defs.find((d) => d.id === id));
    window.sim(3.6);
  };
});
const shot = async (name) => {
  await page.evaluate(() => { const g = window.__game; g.camera3.update(1 / 60); });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(out, name + '.png') });
};
const log = async (label, fn) => {
  try { console.log(label, JSON.stringify(await page.evaluate(fn))); } catch (e) { console.log(label, 'EXCEPCIÓN', e.message); }
};

await log('libre', () => {
  const g = window.__game;
  window.sim(20, (t) => ({ throttle: 1, steer: Math.sin(t * 0.9) > 0.6 ? 1 : Math.sin(t * 1.3) < -0.7 ? -1 : 0, boost: t % 5 < 1.5, jumpPressed: Math.floor(t * 60) % 90 === 0 }));
  return { studs: g.save.studs, pos: g.player.pos.toArray().map((n) => +n.toFixed(1)) };
});
await shot('s_libre');

await log('carrera', () => {
  const g = window.__game; const m = g.missions;
  window.startMission('race');
  const st = m.state;
  window.sim(2, () => ({ throttle: 1, boost: true }));
  return { st, time: +m.time.toFixed(2), x: +g.player.pos.x.toFixed(1) };
});
await shot('s_carrera');
await log('carrera fin', () => {
  const g = window.__game; const m = g.missions;
  const RACE = [[87, 29], [145, 29], [145, -58], [145, -145], [29, -145], [-87, -145], [-87, -29], [-203, -29], [-203, 58], [-203, 145], [-116, 145], [-29, 145], [-29, 87], [-29, 38]];
  for (const c of RACE) { g.player.place(c[0], c[1], 0); window.sim(0.1); }
  return { st: m.state, stars: g.save.stars, best: g.save.best };
});
await shot('s_resultado');
await page.evaluate(() => { window.sim(1.2, (t) => (t > 1 ? { keys: ['KeyE'] } : {})); });

await log('trucos', () => {
  const g = window.__game; const m = g.missions;
  window.startMission('tricks');
  g.player.place(57, 87, 0); g.player.v = 31;
  window.sim(14, (t, p) => ({ throttle: 1, steer: p.grounded ? 0 : 1, trickPressed: !p.grounded && p.airTime > 0.2 && p.airTime < 0.23 }));
  return { score: m.score, combo: g.combo, st: m.state };
});
await page.evaluate(() => { const g = window.__game; window.sim(1.45, (t, p) => ({ throttle: 1, steer: p.grounded ? 0 : 1 })); });
await shot('s_trucos');
await log('trucos fin', () => { const g = window.__game; window.sim(62, (t, p) => ({ throttle: 1, steer: p.grounded ? 0 : 1, trickPressed: !p.grounded && p.airTime > 0.2 && p.airTime < 0.23 })); return { st: g.missions.state, stars: g.save.stars, best: g.save.best }; });
await shot('s_trucos_fin');
await page.evaluate(() => { window.sim(1.2, (t) => (t > 1 ? { keys: ['KeyE'] } : {})); });

await log('bolos', () => {
  const g = window.__game; const m = g.missions;
  window.startMission('bowling');
  window.sim(1.3, () => ({ throttle: 1, boost: true }));
  return { down: g.pins.downCount, st: m.state, z: +g.player.pos.z.toFixed(1), v: +g.player.v.toFixed(1) };
});
await shot('s_bolos');
await log('bolos fin', () => {
  const g = window.__game; const m = g.missions;
  window.sim(7, () => ({ throttle: -1 }));
  const first = g.pins.downCount;
  window.sim(1.5, () => ({ throttle: 1, boost: true, steer: 0 }));
  window.sim(8, () => ({ throttle: -1 }));
  return { first, down: g.pins.downCount, st: m.state, stars: g.save.stars };
});
await shot('s_bolos_fin');
await page.evaluate(() => { window.sim(1.2, (t) => (t > 1 ? { keys: ['KeyE'] } : {})); });

await log('pizza', () => {
  const g = window.__game; const m = g.missions;
  window.startMission('pizza');
  window.sim(1.5, () => ({ throttle: 1 }));
  return { st: m.state, goal: m.goalPos, pos: g.player.pos.toArray().map((n) => +n.toFixed(1)) };
});
await shot('s_pizza');
await log('pizza fin', () => {
  const g = window.__game; const m = g.missions;
  for (let i = 0; i < 5 && m.state === 'run'; i++) { g.player.place(m.goalPos.x, m.goalPos.z, 0); window.sim(0.2); }
  return { st: m.state, stars: g.save.stars, best: g.save.best };
});
await page.evaluate(() => { window.sim(1.2, (t) => (t > 1 ? { keys: ['KeyE'] } : {})); });

await log('fútbol', () => {
  const g = window.__game; const m = g.missions;
  window.startMission('soccer');
  window.sim(2.2, () => ({ throttle: 1 }));
  return { st: m.state, ball: g.ball.pos.toArray().map((n) => +n.toFixed(1)), goals: m.goals };
});
await shot('s_futbol');
await log('fútbol fin', () => {
  const g = window.__game; const m = g.missions;
  window.sim(60, (t, p) => {
    const b = g.ball.pos; const a = Math.atan2(b.x - 2.5 - p.pos.x, b.z - p.pos.z);
    let d = a - p.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return { throttle: 1, steer: d > 0.1 ? -1 : d < -0.1 ? 1 : 0 };
  });
  return { st: m.state, goals: m.goals, stars: g.save.stars };
});
await shot('s_futbol_fin');
await page.evaluate(() => { window.sim(1.2, (t) => (t > 1 ? { keys: ['KeyE'] } : {})); });

await log('noche + mega salto', () => {
  const g = window.__game;
  g.env.night = g.env.target = 1; g.env.apply();
  g.player.place(150, 29, Math.PI / 2); g.player.boost = 1; g.player.v = 40;
  window.sim(3.05, () => ({ throttle: 1, boost: true }));
  return { pos: g.player.pos.toArray().map((n) => +n.toFixed(1)), grounded: g.player.grounded };
});
await shot('s_mega_noche');
await log('noche ciudad', () => { const g = window.__game; g.player.place(-29, -60, 0); g.camera3.snap = true; window.sim(1.5, () => ({ throttle: 1 })); return { bricks: g.save.bricks.length }; });
await shot('s_noche');
await log('estado', () => { const g = window.__game; return { studs: g.save.studs, stars: g.save.stars, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, programs: g.renderer.info.programs.length, geos: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures }; });
if (errors.length) console.log('\nERRORES:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
else console.log('\nSin errores de consola.');
await browser.close();
