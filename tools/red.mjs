// Herramienta de desarrollo: abre una partida en red con varias pestañas y comprueba que se ven unas a otras.
// Uso: node tools/red.mjs            entre pestañas, sin salir a internet (?red=local)
//      RED=peer node tools/red.mjs   por WebRTC, con el broker público de PeerJS
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:5173/';
const PEER = process.env.RED === 'peer';
const SALA = PEER ? 'T' + Math.random().toString(36).slice(2, 8).toUpperCase() : 'TEST';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  // Las pestañas que no están delante tienen que seguir pintando y enviando
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  defaultViewport: { width: 800, height: 450 },
});
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail === '' ? '' : ` · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

async function abrir(nombre, query) {
  // Cada una en su ventana: una pestaña tapada por otra deja de pintar
  const page = await browser.newPage({ type: 'window' });
  await page.setViewport({ width: 800, height: 450 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${nombre}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${nombre}] [pageerror] ${e.message}\n${e.stack || ''}`));
  await page.goto(`${URL}?autostart&q=0${PEER ? '' : '&red=local'}&${query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__game && window.__game.env', { timeout: 60000 });
  return page;
}
const sala = (page, n) => page.waitForFunction((n) => window.__game.party.remotes.size === n, { timeout: PEER ? 30000 : 8000 }, n).then(() => true, () => false);
const quien = (page) => page.evaluate(() => [...window.__game.party.remotes].map(([slot, r]) => `${slot}:${r.char.id}`).sort().join(' '));
const yo = (page) => page.evaluate(() => { const p = window.__game.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z }; });
// Dónde pinta esta pestaña al jugador del sitio `slot`
const otro = (page, slot) => page.evaluate((slot) => {
  const r = window.__game.party.remotes.get(slot);
  return r && r.seen ? { x: r.root.position.x, y: r.pos.y, z: r.root.position.z, yaw: r.root.rotation.y, visible: r.model.visible, tag: r.tag.visible } : null;
}, slot);
const lejos = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Infinity);
const teclas = (page, codes, on) => page.evaluate((codes, on) => { for (const c of codes) window.__game.input.keys[on ? 'add' : 'delete'](c); }, codes, on);

const A = await abrir('anfitrión', `sala=${SALA}&anfitrion`);
await A.waitForFunction(() => window.__game.party.session.slot === 0, { timeout: 30000 });
const B = await abrir('invitado', `sala=${SALA}`);
check('el invitado entra en la sala', (await sala(A, 1)) && (await sala(B, 1)), `${await quien(A)} | ${await quien(B)}`);

// Cada uno con su personaje: el cambio le llega al otro con la partida empezada
await B.evaluate(() => window.__game.setCharacter('adrian'));
await A.evaluate(() => window.__game.setCharacter('teo'));
await wait(600);
check('cada uno ve el personaje del otro', (await quien(A)) === '1:adrian' && (await quien(B)) === '0:teo', `${await quien(A)} | ${await quien(B)}`);

// El anfitrión patina y gira: el invitado lo ve ir detrás, a su ritmo, y acabar en el mismo sitio
await wait(400);
const a0 = await yo(A);
check('quieto, cada uno está donde dice', lejos(a0, await otro(B, 0)) < 0.05 && lejos(await yo(B), await otro(A, 1)) < 0.05);
await teclas(A, ['KeyW', 'KeyD'], true);
let atras = 0;
let salto = 0;
let antes = await otro(B, 0);
for (let i = 0; i < 20; i++) {
  await wait(100);
  const [real, visto] = [await yo(A), await otro(B, 0)];
  atras = Math.max(atras, lejos(real, visto));
  salto = Math.max(salto, lejos(antes, visto));
  antes = visto;
}
await teclas(A, ['KeyW', 'KeyD'], false);
await A.waitForFunction(() => Math.abs(window.__game.player.v) < 0.01, { timeout: 15000 });
await wait(500);
const a1 = await yo(A);
check('el anfitrión se ha movido', lejos(a0, a1) > 15, `${lejos(a0, a1).toFixed(1)} unidades`);
check('el invitado lo ve llegar al mismo sitio', lejos(a1, await otro(B, 0)) < 0.05, `a ${lejos(a1, await otro(B, 0)).toFixed(3)}`);
check('por el camino va detrás sin perderse', atras > 0.2 && atras < 12, `hasta ${atras.toFixed(1)} unidades por detrás`);
check('sin tirones', salto < 9, `${salto.toFixed(1)} unidades como mucho entre dos miradas`);

// Y al revés: el invitado se mueve, el anfitrión lo ve
const b0 = await yo(B);
await teclas(B, ['KeyW'], true);
await wait(1500);
await teclas(B, ['KeyW'], false);
await B.waitForFunction(() => Math.abs(window.__game.player.v) < 0.01, { timeout: 15000 });
await wait(500);
const b1 = await yo(B);
check('el anfitrión ve moverse al invitado', lejos(b0, b1) > 8 && lejos(b1, await otro(A, 1)) < 0.05, `${lejos(b0, b1).toFixed(1)} unidades, a ${lejos(b1, await otro(A, 1)).toFixed(3)}`);

// El anfitrión minimiza la ventana: el navegador deja de darle fotogramas, pero su partida sigue
const tapar = async (page, on) => {
  const cdp = await page.createCDPSession();
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: on ? 'minimized' : 'normal' } });
  // Con la página oculta no hay fotogramas: la espera tiene que ir con temporizador
  await page.waitForFunction((on) => document.hidden === on, { timeout: 5000, polling: 100 }, on);
  await cdp.detach();
};
await tapar(A, true);
const f0 = await A.evaluate(() => window.__game.frame);
await teclas(A, ['KeyW'], true);
await wait(1500);
await teclas(A, ['KeyW'], false);
await A.waitForFunction(() => Math.abs(window.__game.player.v) < 0.01, { timeout: 15000, polling: 100 });
await wait(500);
const a2 = await yo(A);
const tapado = await A.evaluate((f0) => ({ oculta: document.hidden, pausa: window.__game.paused, pasos: window.__game.frame - f0 }), f0);
check('tapado, el anfitrión sigue calculando', tapado.oculta && !tapado.pausa && tapado.pasos > 100, tapado);
check('y el invitado lo sigue viendo moverse', lejos(a1, a2) > 8 && lejos(a2, await otro(B, 0)) < 0.05, `${lejos(a1, a2).toFixed(1)} unidades, a ${lejos(a2, await otro(B, 0)).toFixed(3)}`);
await tapar(A, false);
await wait(300);
check('al volver, pinta otra vez y suelta el metrónomo', await A.evaluate(() => !document.hidden && !window.__game.party.ticker));

// Un tercero: los invitados no se conectan entre sí, se ven a través del anfitrión
const C = await abrir('tercero', `sala=${SALA}`);
check('entra un tercero', (await sala(A, 2)) && (await sala(B, 2)) && (await sala(C, 2)), `${await quien(A)} | ${await quien(B)} | ${await quien(C)}`);
await wait(700);
check('los invitados se ven entre sí', lejos(b1, await otro(C, 1)) < 0.05 && lejos(await yo(C), await otro(B, 2)) < 0.05);
check('con su nombre encima', (await otro(C, 1))?.tag === true);

// Castañazo: los demás lo ven saltar en pedazos, pero ni cartel ni sacudida de cámara
const antesCartel = await B.evaluate(() => document.getElementById('big').textContent);
await A.evaluate(() => window.__game.player.crash());
await B.waitForFunction(() => !window.__game.party.remotes.get(0).model.visible, { timeout: 3000 }).catch(() => {});
const roto = await otro(B, 0);
const cartel = await B.evaluate(() => document.getElementById('big').textContent);
await wait(3300); // el castañazo y el parpadeo de después
const entero = await otro(B, 0);
check('el castañazo de otro se ve', roto.visible === false && roto.tag === false && entero.visible === true, { roto: [roto.visible, roto.tag], luego: entero.visible });
check('pero el cartel no le sale a quien mira', cartel === antesCartel, cartel);

// El invitado se va: los demás dejan de verlo
await B.close();
check('el que se va desaparece', (await sala(A, 1)) && (await sala(C, 1)), `${await quien(A)} | ${await quien(C)}`);

// Entrar donde no hay partida
const D = await abrir('perdido', 'sala=NOHAY');
await D.waitForFunction(() => window.__game.party.error, { timeout: PEER ? 30000 : 5000 }).catch(() => {});
check('un código que no existe se explica', (await D.evaluate(() => window.__game.party.error)) === 'no-room', await D.evaluate(() => document.getElementById('net').textContent));
await D.close();

// El anfitrión se va: se acaba la partida para el que queda
await A.close();
await C.waitForFunction(() => window.__game.party.error, { timeout: PEER ? 30000 : 5000 }).catch(() => {});
check('si el anfitrión se va, se acaba la partida', (await C.evaluate(() => window.__game.party.error + ' ' + window.__game.party.remotes.size)) === 'host 0', await C.evaluate(() => document.getElementById('net').textContent));

if (errors.length) console.log('\nERRORES:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
else console.log('\nSin errores de consola.');
console.log(fallos ? `\n${fallos} comprobaciones han fallado.` : '\nTodo en orden.');
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
