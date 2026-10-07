// Herramienta de desarrollo: primeros planos con cámara libre.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,810'], defaultViewport: { width: 1440, height: 810 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack));
await page.goto((process.env.GAME_URL || 'http://localhost:5173/') + '?autostart&q=2' + (process.argv[3] || ''), { waitUntil: 'load' });
await page.waitForFunction('window.__game && window.__game.env', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
const views = JSON.parse(process.argv[4] || '[]');
for (const v of views) {
  await page.evaluate((v) => {
    const g = window.__game; g.paused = true;
    document.getElementById('hud').style.display = v.hud ? '' : 'none';
    if (v.js) new Function('g', v.js)(g);
    if (v.place) g.player.place(...v.place);
    g.player.updateVisual(1 / 60, { ...g.input.neutral, steer: v.steer || 0 });
    const c = g.camera3.cam; c.position.set(...v.cam); c.fov = v.fov || 40; c.updateProjectionMatrix(); g.camera3.look.set(...v.look);
    g.final.uniforms.uBlur.value = v.blur ?? 0;
  }, v);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(out, v.name + '.png') });
  console.log('captura', v.name);
}
const info = await page.evaluate(async () => {
  const g = window.__game; g.paused = false; const r = g.renderer; r.info.autoReset = false; r.info.reset();
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const calls = r.info.render.calls, tris = r.info.render.triangles; r.info.reset();
  let n = 0; const t0 = performance.now();
  await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 > 3000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  return { callsPerFrame: calls / 2, trisPerFrame: Math.round(tris / 2), fps: +(n / 3).toFixed(1), quality: g.quality };
});
console.log(JSON.stringify(info));
await browser.close();
