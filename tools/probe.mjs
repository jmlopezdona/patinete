// Herramienta de desarrollo: evalúa una expresión dentro del juego y, si se pide, guarda una captura.
// Uso: node tools/probe.mjs '<js que devuelve algo>' [captura.png] [query]
// Si el guion es largo, mejor en un fichero: node tools/probe.mjs @guion.js [captura.png] [query]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const code = process.argv[2].startsWith('@') ? fs.readFileSync(process.argv[2].slice(1), 'utf8') : process.argv[2];
const URL = process.env.GAME_URL || 'http://localhost:5173/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,810'], defaultViewport: { width: 1440, height: 810 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (process.env.TRACE && m.text().startsWith('T ')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(URL + (process.argv[4] || '?autostart&q=2'), { waitUntil: 'load' });
await page.waitForFunction('window.__game && window.__game.env', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const g = window.__game;
  g.paused = true;
  const base = () => ({ steer: 0, throttle: 0, boost: false, jumpPressed: false, trickPressed: false, upPressed: false, downPressed: false });
  window.sim = (secs, ctrl) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      const c = ctrl ? ctrl(i / 60, g.player) || {} : {};
      if (c.keys) for (const k of c.keys) g.input.pressed.add(k);
      g.update(1 / 60, { ...base(), ...c });
      g.input.endFrame();
    }
  };
});
// Si la expresión se cuelga, a los 10 s se para el depurador y se imprime por dónde iba
const cdp = await page.createCDPSession();
await cdp.send('Debugger.enable');
cdp.on('Debugger.paused', (e) => {
  console.log('COLGADO EN:');
  for (const f of e.callFrames.slice(0, 16)) console.log('  ', f.functionName || '(anónima)', f.url.split('/').slice(-2).join('/').split('?')[0] + ':' + (f.location.lineNumber + 1));
  process.exit(2);
});
const watchdog = setTimeout(() => cdp.send('Debugger.pause').catch(() => {}), 10000);
try {
  console.log(JSON.stringify(await page.evaluate(`(() => { const g = window.__game; ${code} })()`), null, 1));
} catch (e) {
  console.log('EXCEPCIÓN', e.message);
}
clearTimeout(watchdog);
await cdp.send('Debugger.disable').catch(() => {});
if (process.argv[3]) {
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: process.argv[3] });
}
if (errors.length) console.log('ERRORES:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
