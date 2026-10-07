// Herramienta de desarrollo: abre el juego en Chrome sin cabeza y guarda capturas.
// Uso: node tools/shot.mjs <carpeta_salida> [nombre1,nombre2,...]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'shots';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const URL = process.env.GAME_URL || 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });

const tp = (x, z, h, extra = '') => `(() => { const g = window.__game; g.player.place(${x}, ${z}, ${h}); g.camera3.snap = true; ${extra} })()`;

const SHOTS = [
  { name: 'menu', url: '?q=2', wait: 2500 },
  { name: 'spawn', url: '?autostart&q=2', wait: 2500 },
  { name: 'street', js: tp(29, -20, Math.PI), wait: 1200 },
  { name: 'skate', js: tp(87, 46, 0), wait: 1200 },
  { name: 'halfpipe', js: tp(76, 87, -Math.PI / 2), wait: 1200 },
  { name: 'park', js: tp(-140, 50, 0.4), wait: 1200 },
  { name: 'soccer', js: tp(-170, 112, Math.PI / 2), wait: 1200 },
  { name: 'bowling', js: tp(116, -99, Math.PI), wait: 1200 },
  { name: 'pier', js: tp(215, 29, Math.PI / 2), wait: 1200 },
  { name: 'tower', js: tp(0, -80, Math.PI), wait: 1200 },
  { name: 'night', js: tp(-29, 20, Math.PI, 'g.env.night = g.env.target = 1; g.env.apply();'), wait: 1500 },
];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,810', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));

for (const s of SHOTS) {
  if (only && !only.includes(s.name) && !s.url) continue;
  if (s.url) {
    await page.goto(URL + s.url, { waitUntil: 'load' });
    await page.waitForFunction('window.__game && window.__game.env', { timeout: 60000 }).catch(() => errors.push('timeout esperando al juego'));
  }
  if (s.js) await page.evaluate(s.js);
  await new Promise((r) => setTimeout(r, s.wait));
  if (only && !only.includes(s.name)) continue;
  await page.screenshot({ path: path.join(out, s.name + '.png') });
  console.log('captura', s.name);
}
const info = await page.evaluate(() => {
  const g = window.__game;
  const r = g.renderer.info;
  return { calls: r.render.calls, tris: r.render.triangles, bricks: g.world && g.scene.children.length, fps: 0 };
}).catch((e) => ({ error: String(e) }));
console.log('info', JSON.stringify(info));
if (errors.length) console.log('ERRORES:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
