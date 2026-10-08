// Herramienta de desarrollo: abre una partida en red con varias pestañas y comprueba que se ven unas a otras.
// Uso: node tools/red.mjs            entre pestañas, sin salir a internet (?red=local)
//      RED=peer node tools/red.mjs   por WebRTC, con el broker público de PeerJS
//      RED=peer ICE=relay node tools/red.mjs   lo mismo, pero todo retransmitido por el TURN
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:5173/';
const PEER = process.env.RED === 'peer';
const RELAY = process.env.ICE === 'relay' ? '&ice=relay' : '';
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

async function abrir(nombre, query, auto = true) {
  // Cada una en su ventana: una pestaña tapada por otra deja de pintar
  const page = await browser.newPage({ type: 'window' });
  await page.setViewport({ width: 800, height: 450 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${nombre}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${nombre}] [pageerror] ${e.message}\n${e.stack || ''}`));
  await page.goto(`${URL}?${auto ? 'autostart&' : ''}q=0${PEER ? RELAY : '&red=local'}&${query}`, { waitUntil: 'load' });
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

// En red no hay pausa de verdad: a quien abre el menú se le sigue moviendo el mundo, y los demás lo ven ocupado
const pastilla = (page) => page.evaluate(() => { const el = document.getElementById('net'); return { texto: el.textContent, apagados: el.querySelectorAll('i.off').length, iconos: el.querySelectorAll('i').length, espera: el.classList.contains('wait') }; });
check('la pastilla enseña quién está', (await pastilla(A)).iconos === 2 && (await pastilla(A)).apagados === 0, (await pastilla(A)).texto);
const t0 = await B.evaluate(() => { window.__game.setPaused(true); return window.__game.time; });
await wait(800);
const enPausa = await B.evaluate((t0) => ({ pausa: window.__game.paused, corre: window.__game.time - t0 }), t0);
check('con la pausa abierta el mundo sigue', enPausa.pausa && enPausa.corre > 0.5, `${enPausa.corre.toFixed(2)} s`);
check('y los demás lo ven ocupado', (await A.evaluate(() => window.__game.party.remotes.get(1).busy)) && (await pastilla(A)).apagados === 1);
await B.evaluate(() => window.__game.setPaused(false));
await wait(400);
check('al volver deja de estarlo', (await A.evaluate(() => !window.__game.party.remotes.get(1).busy)) && (await pastilla(A)).apagados === 0);

// En red no hay modo foto ni seguir a las mamás: paran el tiempo
const sinFoto = await B.evaluate(() => {
  const g = window.__game;
  g.photo.open();
  g.watch.open();
  g.setPaused(true);
  const ocultos = ['p-photo', 'p-watch'].every((id) => getComputedStyle(document.getElementById(id)).display === 'none');
  g.setPaused(false);
  return !g.photo.on && !g.watch.on && ocultos;
});
check('en red no hay modo foto ni seguir a las mamás', sinFoto);

// El reloj y el día y la noche son los del anfitrión
const hora = (page) => page.evaluate(() => window.__game.time);
const [ha, hb] = await Promise.all([hora(A), hora(B)]);
check('el invitado lleva el reloj del anfitrión', Math.abs(ha - hb) < 0.2, `${ha.toFixed(2)} y ${hb.toFixed(2)} s`);
const noche = (page) => page.evaluate(() => ({ noche: window.__game.env.target, dicho: document.getElementById('toasts').textContent }));
const esNoche = (page, on) => page.waitForFunction((on) => window.__game.env.target === on, { timeout: 3000, polling: 50 }, on).then(() => true, () => false);
const fb = await B.evaluate(() => window.__game.frame);
await B.evaluate(() => window.__game.env.toggle());
let igual = (await esNoche(A, 1)) && (await esNoche(B, 1));
await wait(300);
let [na, nb] = [await noche(A), await noche(B)];
check('un invitado hace de noche y lo es para todos', igual && na.noche === 1 && nb.noche === 1, `${na.noche} y ${nb.noche} · ${(await B.evaluate(() => window.__game.frame)) - fb} fotogramas`);
check('y al otro le dicen quién ha sido', na.dicho.includes('Adrián ha hecho de noche') && !nb.dicho.includes('ha hecho de noche'), na.dicho);
await A.evaluate(() => window.__game.env.toggle());
igual = (await esNoche(A, 0)) && (await esNoche(B, 0));
await wait(300);
[na, nb] = [await noche(A), await noche(B)];
check('el anfitrión hace de día', igual && na.noche === 0 && nb.noche === 0 && nb.dicho.includes('Teo ha hecho de día'), nb.dicho);

// El tráfico es el mismo para todos: los coches los mueve el anfitrión y los peatones salen del reloj
const trafico = (page) => page.evaluate(() => { const t = window.__game.traffic; return { coches: t.cars.map((c) => [c.x, c.z, c.speed]), gente: t.peds.map((q) => [q.x, q.z]), guiado: !!t.led }; });
const peor = (a, b) => Math.max(...a.map((v, i) => Math.hypot(v[0] - b[i][0], v[1] - b[i][1])));
const [ta, tb] = await Promise.all([trafico(A), trafico(B)]);
await wait(1000);
const ta2 = await trafico(A);
check('el invitado ve los coches donde los lleva el anfitrión', tb.guiado && !ta.guiado && peor(ta.coches, tb.coches) < 5 && peor(ta.coches, ta2.coches) > 5, `hasta ${peor(ta.coches, tb.coches).toFixed(1)} unidades de diferencia entre ${ta.coches.length} coches`);
check('y los peatones, por el mismo sitio', peor(ta.gente, tb.gente) < 1.5 && peor(ta.gente, ta2.gente) > 1.5, `hasta ${peor(ta.gente, tb.gente).toFixed(2)} unidades entre ${ta.gente.length} peatones`);
check('lo que pesa una foto', true, `${await A.evaluate(() => window.__game.party.session.sent)} bytes con dos jugadores`);
// Un invitado se planta delante de un coche: el del anfitrión frena y le pita a él
const b0c = await yo(B);
const delante = await A.evaluate(() => {
  const c = window.__game.traffic.cars.reduce((a, b) => (b.speed > a.speed ? b : a));
  return { i: window.__game.traffic.cars.indexOf(c), x: c.x + Math.sin(c.heading) * (c.hl + 9), z: c.z + Math.cos(c.heading) * (c.hl + 9), h: c.heading, v: c.speed };
});
await A.evaluate(() => { window.__pitos = 0; const f = window.__game.sfx.honk; window.__game.sfx.honk = function () { window.__pitos++; return f.call(this); }; });
await B.evaluate((d) => { window.__pitos = 0; const g = window.__game; const f = g.sfx.honk; g.sfx.honk = function () { window.__pitos++; return f.call(this); }; g.player.place(d.x, d.z, d.h); }, delante);
await wait(1500);
const frenado = await A.evaluate((i) => window.__game.traffic.cars[i].speed, delante.i);
check('el coche del anfitrión frena ante un invitado', delante.v > 8 && frenado < 1, `de ${delante.v.toFixed(1)} a ${frenado.toFixed(1)}`);
check('y le pita a él, no al anfitrión', (await B.evaluate(() => window.__pitos)) > 0 && (await A.evaluate(() => window.__pitos)) === 0);
// Y si se mete en el coche que ve, es su pantalla la que lo saca
const dentro = (page) => page.evaluate((i) => { const g = window.__game; const c = g.traffic.cars[i]; const p = g.player.pos; const fx = Math.sin(c.heading); const fz = Math.cos(c.heading); return Math.abs((p.x - c.x) * fx + (p.z - c.z) * fz) < c.hl + 0.9 && Math.abs((p.x - c.x) * fz - (p.z - c.z) * fx) < c.hw + 0.9; }, delante.i);
await B.evaluate((i) => { const g = window.__game; const c = g.traffic.cars[i]; g.player.place(c.x + Math.cos(c.heading) * 0.5, c.z - Math.sin(c.heading) * 0.5, c.heading); }, delante.i);
const metido = await dentro(B);
await wait(400);
check('el invitado choca en su pantalla con el coche que ve', metido && !(await dentro(B)));
await B.evaluate((b) => window.__game.player.place(b.x, b.z, 0), b0c);
// Un peatón atropellado sale por los aires en todas las pantallas; los studs, para quien lo atropella
const peaton = await B.evaluate(() => { const t = window.__game.traffic; const i = t.peds.findIndex((q) => !q.taken); window.__st = window.__game.studs.cursor; t.knock(i, true); return i; });
await A.waitForFunction((i) => window.__game.traffic.peds[i].fly > 0, { timeout: 3000, polling: 30 }, peaton).catch(() => {});
check('un peatón atropellado vuela también en la pantalla de los demás', await A.evaluate((i) => window.__game.traffic.peds[i].fly > 0, peaton));
await wait(400);

// El lío con el municipal es de toda la pandilla: los destrozos de un invitado sacan al del anfitrión
const lio = (page) => page.evaluate(() => { const g = window.__game; const W = g.wanted; const c = W.cop; return { estrellas: W.stars, pintadas: document.querySelectorAll('#wanted b.on').length, municipal: c.state, visible: c.root.visible, x: c.x, y: c.y, z: c.z, presa: W.prey ? W.prey.char.id : '', studs: g.save.studs, dicho: document.getElementById('toasts').textContent }; });
await B.evaluate(() => { const g = window.__game; g.save.studs = 3000; g.player.invuln = 0; for (let i = 0; i < 5; i++) g.onSmash(); });
await B.waitForFunction(() => window.__game.wanted.cop.state === 'chase', { timeout: 6000, polling: 50 }).catch(() => {});
let [la, lb] = [await lio(A), await lio(B)];
check('los destrozos de un invitado suman en el anfitrión', la.estrellas === 1 && lb.estrellas === 1 && lb.pintadas === 1 && la.pintadas === 1, `${la.estrellas}★ y ${lb.estrellas}★`);
check('el municipal del anfitrión va a por él, y él lo ve', la.presa === 'adrian' && la.municipal !== 'off' && lb.visible && lejos(la, lb) < 6, `${la.municipal} / ${lb.municipal}, a ${lejos(la, lb).toFixed(1)} unidades uno de otro`);
// Y lo pilla en su pantalla: la multa es suya y el lío se acaba para todos
await B.evaluate(() => { const g = window.__game; const c = g.wanted.cop; g.player.place(c.x + 1, c.z, 0); });
await A.waitForFunction(() => window.__game.wanted.stars === 0, { timeout: 4000, polling: 50 }).catch(() => {});
await wait(400);
[la, lb] = [await lio(A), await lio(B)];
check('al invitado lo multan en su pantalla', lb.studs === 2800 && lb.dicho.includes('Multa de 200'), `${3000 - lb.studs} studs`);
check('y se acaba el lío para todos', la.estrellas === 0 && lb.estrellas === 0 && la.dicho.includes('Adrián se ha llevado una multa'), la.dicho);
await B.evaluate((b) => window.__game.player.place(b.x, b.z, 0), b0c);

// El mobiliario es el mismo para todos: lo rompe uno y lo ven roto los demás
const mueble = await A.evaluate(() => {
  const g = window.__game;
  let best = 0;
  g.props.items.forEach((it, i) => { if (g.nearest2(it.x, it.z) > g.nearest2(g.props.items[best].x, g.props.items[best].z)) best = i; });
  return best;
});
const sano = (page) => page.evaluate((i) => window.__game.props.items[i].alive, mueble);
const studs0 = await A.evaluate(() => window.__game.studs.cursor);
await B.evaluate((i) => window.__game.props.smash(window.__game.props.items[i], 0, 0), mueble);
await A.waitForFunction((i) => !window.__game.props.items[i].alive, { timeout: 3000, polling: 50 }, mueble).catch(() => {});
check('un invitado rompe un banco y el anfitrión lo ve roto', !(await sano(A)) && !(await sano(B)), `mueble ${mueble}`);
check('pero los studs son para quien lo rompe', (await A.evaluate(() => window.__game.studs.cursor)) === studs0);

// Al anfitrión se le duerme el equipo: deja de calcular y los invitados se enteran
await A.evaluate(() => window.__game.renderer.setAnimationLoop(null));
await wait(2600);
const parado = await pastilla(B);
await A.evaluate(() => window.__game.renderer.setAnimationLoop((t) => window.__game.loop(t)));
await wait(600);
check('si el anfitrión se para, el invitado lo sabe', parado.espera && parado.texto.includes('en pausa') && !(await pastilla(B)).espera, parado.texto);

// Un tercero: los invitados no se conectan entre sí, se ven a través del anfitrión
await A.evaluate(() => window.__game.env.toggle());
const C = await abrir('tercero', `sala=${SALA}`);
check('entra un tercero', (await sala(A, 2)) && (await sala(B, 2)) && (await sala(C, 2)), `${await quien(A)} | ${await quien(B)} | ${await quien(C)}`);
await wait(700);
const [hc, hd] = await Promise.all([hora(A), hora(C)]);
check('quien llega tarde se encuentra la noche y el reloj de los demás', (await noche(C)).noche === 1 && Math.abs(hc - hd) < 0.2, `${hc.toFixed(2)} y ${hd.toFixed(2)} s`);
await A.evaluate(() => window.__game.env.toggle());
await wait(300);
check('y el mobiliario que ya estaba roto', !(await sano(C)));
// Lo reconstruye el anfitrión, cuando le toca y no hay nadie cerca
await A.evaluate((i) => { window.__game.props.items[i].t = 0; }, mueble);
await C.waitForFunction((i) => window.__game.props.items[i].alive, { timeout: 3000, polling: 50 }, mueble).catch(() => {});
check('el anfitrión lo reconstruye para todos', (await sano(A)) && (await sano(B)) && (await sano(C)));
check('los invitados se ven entre sí', lejos(b1, await otro(C, 1)) < 0.05 && lejos(await yo(C), await otro(B, 2)) < 0.05);
check('con su nombre encima', (await otro(C, 1))?.tag === true);

// Lo que el anfitrión decide para otros se ve y se oye en su pantalla
const dicho = (page) => page.evaluate(() => document.getElementById('toasts').innerHTML);
await A.evaluate(() => {
  const g = window.__game;
  const r = g.party.remotes.get(1);
  g.all.hud.toast('<b>Para todos</b><img src="x">');
  g.to(r).hud.toast('Solo para uno');
  g.at(r.pos.x, r.pos.z).hud.toast('Por aquí cerca');
});
await wait(500);
const [da, db, dc] = [await dicho(A), await dicho(B), await dicho(C)];
const cerca = (page) => page.evaluate(([x, z]) => window.__game.near(x, z), [b1.x, b1.z]);
check('un cartel para todos sale en todas las pantallas', [da, db, dc].every((d) => d.includes('<b>Para todos</b>')));
check('sin el HTML que el juego no usa', !db.includes('<img') && db.includes('&lt;img'));
check('uno para un jugador, solo en la suya', db.includes('Solo para uno') && !da.includes('Solo para uno') && !dc.includes('Solo para uno'));
check('y lo que pasa en un sitio, a quien esté cerca', db.includes('Por aquí cerca') && da.includes('Por aquí cerca') === (await cerca(A)) && dc.includes('Por aquí cerca') === (await cerca(C)), `anfitrión ${await cerca(A)}, tercero ${await cerca(C)}`);
// Y lo que el mundo le hace al personaje de otro lo cumple su dueño
await A.evaluate(() => { const r = window.__game.party.remotes.get(1); r.bump(1, 0, 3, 1); r.skid(); });
await wait(500);
const b2 = await yo(B);
check('un empujón del anfitrión mueve al invitado en su pantalla', Math.abs(b2.x - b1.x - 3) < 0.2 && (await B.evaluate(() => window.__game.player.slip > 0)) && lejos(b2, await otro(A, 1)) < 0.3, `${(b2.x - b1.x).toFixed(2)} unidades`);

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
await D.waitForFunction(() => window.__game.lobby.error, { timeout: PEER ? 30000 : 5000 }).catch(() => {});
check('un código que no existe se explica', (await D.evaluate(() => window.__game.lobby.error)) === 'no-room', await D.evaluate(() => document.getElementById('fr-msg').textContent));
await D.close();

// El anfitrión se va: se acaba la partida para el que queda
await A.close();
await C.waitForFunction(() => window.__game.lobby.error, { timeout: PEER ? 30000 : 5000 }).catch(() => {});
check('si el anfitrión se va, se acaba la partida', (await C.evaluate(() => `${window.__game.lobby.error} ${window.__game.party}`)) === 'host null', await C.evaluate(() => document.getElementById('fr-msg').textContent));
// Y los coches vuelven a ser de cada uno: siguen su circuito desde donde estaban
const tc = await trafico(C);
await wait(1500);
const tc2 = await trafico(C);
const fuera = await C.evaluate(() => Math.max(...window.__game.traffic.cars.map((c) => {
  let d = Infinity;
  c.path.forEach((a, i) => { const b = c.path[(i + 1) % c.path.length]; const ex = b[0] - a[0]; const ez = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((c.x - a[0]) * ex + (c.z - a[1]) * ez) / (ex * ex + ez * ez || 1))); d = Math.min(d, Math.hypot(c.x - a[0] - ex * t, c.z - a[1] - ez * t)); });
  return d;
})));
check('sin anfitrión, los coches siguen por su circuito', !tc2.guiado && peor(tc.coches, tc2.coches) > 5 && peor(tc.coches, tc2.coches) < 40 && fuera < 0.5, `el que más se sale, ${fuera.toFixed(2)} unidades`);
await C.close();

// ---------- La sala, desde el menú ----------
const sala2 = (page) => page.evaluate(() => {
  const g = window.__game;
  const go = document.getElementById('fr-go');
  return { yo: g.player.char.id, estado: g.state, boton: go.textContent.trim(), listo: !go.disabled, fuera: [...g.folks.away].sort().join(' '), cogidos: [...document.querySelectorAll('.char-btn:disabled')].map((b) => b.dataset.id).join(' '), gente: document.getElementById('fr-players').textContent };
});
const E = await abrir('crea', 'x', false);
await E.click('#btn-friends');
await E.click('#fr-create');
await E.waitForFunction(() => window.__game.party?.session.slot === 0, { timeout: 30000 });
const codigo = await E.evaluate(() => document.getElementById('fr-name').textContent);
check('crear partida da un código de cuatro letras', /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(codigo) && (await sala2(E)).boton === '▶  Empezar', codigo);
check('y un enlace para mandar', (await E.evaluate(() => window.__game.lobby.link())).endsWith(`?sala=${codigo}`));

// El que entra tenía guardado el mismo personaje: el anfitrión le pone otro
const G = await abrir('se une', `sala=${codigo}`, false);
await sala(G, 1);
await sala(E, 1);
await wait(500);
let [e, g2] = [await sala2(E), await sala2(G)];
check('no se repite personaje', e.yo !== g2.yo && g2.cogidos === e.yo && e.cogidos === g2.yo, `${e.yo} y ${g2.yo}`);
check('el invitado espera a que el anfitrión empiece', g2.estado === 'menu' && !g2.listo && g2.boton === 'Esperando al anfitrión…', g2.gente);
check('el vecino que lleva un amigo falta del pueblo', e.fuera === g2.fuera && e.fuera === [e.yo, g2.yo].sort().join(' '), e.fuera);
check('en la sala todavía no se le ve por la calle', await G.evaluate(() => window.__game.party.remotes.get(0).hidden === true));
// El personaje cogido no se deja elegir
await G.evaluate((id) => window.__game.setCharacter(id), e.yo);
await wait(300);
check('el personaje cogido no se puede elegir', (await sala2(G)).yo === g2.yo);
const libre = await G.evaluate(() => [...document.querySelectorAll('.char-btn:not(:disabled):not(.sel)')][0].dataset.id);
await G.click(`.char-btn[data-id="${libre}"]`);
await wait(500);
[e, g2] = [await sala2(E), await sala2(G)];
check('uno libre sí, y el otro se entera', g2.yo === libre && e.cogidos === libre && e.fuera === [e.yo, libre].sort().join(' '), `${e.yo} y ${g2.yo}`);

await E.click('#fr-go');
await G.waitForFunction(() => window.__game.state === 'play', { timeout: 5000 }).catch(() => {});
await wait(500);
check('el anfitrión da la salida y salen todos', (await sala2(E)).estado === 'play' && (await sala2(G)).estado === 'play' && (await otro(G, 0))?.visible === true && (await otro(E, 1))?.visible === true);

// Con la partida empezada se entra directamente
const H = await abrir('llega tarde', `sala=${codigo}`, false);
await sala(H, 2);
await wait(300);
const h = await sala2(H);
check('quien llega tarde puede entrar', h.listo && h.boton === '▶  Entrar' && ![e.yo, g2.yo].includes(h.yo), `${h.yo} · ${h.gente}`);
await H.click('#fr-go');
await wait(500);
check('y sale a la calle con los demás', (await sala2(H)).estado === 'play' && (await otro(E, 2))?.visible === true);

// Salir de la sala: los demás dejan de verlo y él vuelve al menú de siempre
await H.evaluate(() => document.getElementById('p-menu').click());
await H.click('#fr-back');
check('salir de la sala devuelve al menú de siempre', (await sala(E, 1)) && (await H.evaluate(() => window.__game.party === null && window.__game.folks.away.size === 1 && document.getElementById('friends').classList.contains('hidden') && !document.getElementById('menu-buttons').classList.contains('hidden'))));

if (errors.length) console.log('\nERRORES:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
else console.log('\nSin errores de consola.');
console.log(fallos ? `\n${fallos} comprobaciones han fallado.` : '\nTodo en orden.');
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
