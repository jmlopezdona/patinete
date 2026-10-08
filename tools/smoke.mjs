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
  // Centro del half-pipe mirando a lo largo de la parcela del skatepark
  window.pipe = () => {
    const T = g.world.places.trick;
    const c = Math.cos(T.rot), s = Math.sin(T.rot);
    g.player.place(T.x0 - 2 * c - 19 * s, T.z0 + 2 * s - 19 * c, Math.atan2(c, -s));
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
  for (const c of g.world.places.race.gates) { g.player.place(c[0], c[1], 0); window.sim(0.1); }
  return { st: m.state, stars: g.save.stars, best: g.save.best };
});
await shot('s_resultado');
await page.evaluate(() => { window.sim(1.2, (t) => (t > 1 ? { keys: ['KeyE'] } : {})); });

await log('trucos', () => {
  const g = window.__game; const m = g.missions;
  window.startMission('tricks');
  window.pipe(); g.player.v = 31;
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
  g.player.place(g.world.places.megaHole.x0 - 86, g.world.places.mega.z, Math.PI / 2); g.player.boost = 1; g.player.v = 40;
  window.sim(3.05, () => ({ throttle: 1, boost: true }));
  return { pos: g.player.pos.toArray().map((n) => +n.toFixed(1)), grounded: g.player.grounded };
});
await shot('s_mega_noche');
await log('noche ciudad', () => { const g = window.__game; g.player.place(g.world.places.spawn.x, g.world.places.spawn.z, g.world.places.spawn.heading); g.camera3.snap = true; window.sim(1.5, () => ({ throttle: 1 })); return { bricks: g.save.bricks.length }; });
await shot('s_noche');
await log('vecinos', () => {
  const g = window.__game; const F = g.folks; const P = g.world.places;
  g.env.night = g.env.target = 0; g.env.apply();
  // Yago salta por encima si el patinete se le echa encima
  const Y = F.yago;
  g.player.place(Y.x - 12, Y.z, Math.PI / 2); g.player.v = 25;
  let jumped = false;
  window.sim(1.2, () => { jumped = jumped || Y.air; return { throttle: 1 }; });
  // El padre de Jose: un par de minutos de tiros y entradas
  const J = F.jose;
  g.player.place(J.H.x + J.H.nx * 30, J.H.z + J.H.nz * 30, 0);
  window.sim(60);
  // Las corredoras dan la vuelta sin quedarse atascadas
  const R = F.joggers; const q = {}; F.pathAt(R.s + 30, q);
  g.player.place(q.x + 20, q.z + 20, 0);
  window.sim(20);
  const spread = Math.max(...R.list.map((j) => Math.hypot(j.x - R.list[0].x, j.z - R.list[0].z)));
  return { marcadores: F.markers.map((m) => m.icon).join(''), yagoSalta: jumped, joseTiros: J.n, joseCanastas: J.made, corredorasJuntas: +spread.toFixed(1), bateriaALaEscuela: +Math.hypot(P.drummer.x - P.drummer.door.x, P.drummer.z - P.drummer.door.z).toFixed(0), teo: g.ball.keeper.group.children.some((c) => c.isSprite) };
});
await shot('s_vecinos');
await log('marcianos: culetazo', () => {
  const g = window.__game; const A = g.aliens; const p = g.player;
  const sp = g.world.places.spawn;
  g.save.studs = 2000; g.save.invasions = 0;
  p.place(sp.x, sp.z, sp.heading);
  g.env.night = g.env.target = 1; g.env.apply();
  window.sim(4);
  g.heist.cd = 999; // el robo de la estatua, cuando le toque su prueba
  const goal = A.wave.goal;
  // Embestir por la espalda a un marciano despistado
  const a = A.aliens.find((x) => x.state !== 'off' && x.state !== 'drop');
  for (const o of A.aliens) if (o !== a) o.cd = 99;
  a.state = 'wander'; a.t = 9; a.dirT = a.heading; a.cd = 0;
  p.place(a.x - Math.sin(a.heading) * 9, a.z - Math.cos(a.heading) * 9, a.heading); p.v = 28; p.invuln = 0;
  window.sim(0.6, () => ({ throttle: 1 }));
  const flew = a.state === 'fly';
  window.sim(3);
  return { oleada: goal, vuela: flew, culetazos: A.wave.count, contador: document.getElementById('aliens').textContent, revienta: a.state === 'off' || a.state === 'drop' };
});
await shot('s_marcianos');
await log('marcianos: rayo y fuga', () => {
  const g = window.__game; const A = g.aliens; const p = g.player; const u = A.u;
  for (const o of A.aliens) o.cd = 99;
  p.invuln = 0; A.setUfo('hunt'); u.x = p.pos.x; u.z = p.pos.z; u.beam = 1; u.vx = u.vz = 0;
  let n = 0; while (u.state === 'hunt' && n++ < 300) window.sim(1 / 60);
  const held = p.held;
  // Machacar el salto para soltarse
  n = 0; while (u.state === 'abduct' && n++ < 300) window.sim(1 / 60, () => (n % 6 === 0 ? { keys: ['Space'] } : {}));
  const free = !p.held && u.state === 'stun';
  n = 0; while (!p.grounded && n++ < 300) window.sim(1 / 60);
  return { atrapado: held, suelto: free, enElSuelo: p.grounded, castañazo: p.crashT > 0 };
});
await log('marcianos: abducción', () => {
  const g = window.__game; const A = g.aliens; const p = g.player; const u = A.u;
  const st = g.save.studs;
  p.invuln = 0; A.setUfo('hunt'); u.x = p.pos.x; u.z = p.pos.z; u.beam = 1; u.vx = u.vz = 0;
  let n = 0; while (u.state !== 'carry' && n++ < 900) window.sim(1 / 60);
  const dest = A.carry && A.carry.dest.name;
  n = 0; while ((u.state === 'carry' || !p.grounded) && n++ < 900) window.sim(1 / 60);
  return { destino: dest, zona: g.zoneName(p.pos.x, p.pos.z), robados: st - g.save.studs, visible: !p.hidden, enElSuelo: p.grounded };
});
await shot('s_abducido');
await log('marcianos: rescate', () => {
  const g = window.__game; const A = g.aliens; const p = g.player; const u = A.u;
  const cow = g.cows.list[0];
  // Junto a las vacas, el platillo va a por una; la segunda vez se le deja llevársela
  const snatch = () => {
    p.place(cow.x + 60, cow.z, 0); u.x = p.pos.x; u.z = p.pos.z + 20; u.vx = u.vz = 0;
    const rnd = Math.random; Math.random = () => 0.1; A.snatchCd = 0; A.falling = null; A.pickVictim(p); Math.random = rnd;
    A.setUfo('snatch');
    const v = A.vic;
    let n = 0; while (!v.lifting && n++ < 900) { p.invuln = 5; window.sim(1 / 60); }
    window.sim(2);
    return v;
  };
  const st = g.save.studs;
  const v = snatch();
  const up = v.h;
  p.place(u.x, u.z, 0); window.sim(0.1);
  const pisando = A.vic === v; // por el suelo no se corta el rayo
  window.sim(0.4, (t) => ({ jumpPressed: t < 0.02 }));
  const saved = A.falling === v && u.state === 'stun';
  window.sim(3);
  const back = !v.ref.taken && v.obj.scale.x === 1 && v.obj.position.y === 0;
  const w = snatch();
  let n = 0; while (A.vic === w && n++ < 1500) window.sim(1 / 60);
  return { presa: v.name, sube: +up.toFixed(1), pisandoNo: pisando, rescatada: saved, premio: g.save.studs - st, enElPrado: back, laSegundaSeLaLlevan: A.lost.length === 1 && !w.obj.visible };
});
await shot('s_rescate');
await log('marcianos: timbre sónico', () => {
  const g = window.__game; const A = g.aliens; const I = g.items; const p = g.player; const u = A.u;
  // Aparece por la calle, se recoge pasando por encima y con Q deja tontos a los de alrededor
  const sp = g.world.places.spawn;
  p.place(sp.x, sp.z, sp.heading);
  I.stop(p); I.held = null; I.group.visible = false; I.cd = 0; I.last = null;
  let n = 0; while (!I.group.visible && n++ < 600) window.sim(1 / 60);
  window.sim(1 / 60);
  const enLaCalle = I.group.visible && I.blips.length === 1 && I.drop.kind;
  for (const o of A.aliens) o.cd = 99;
  p.place(I.drop.x - 6, I.drop.z, Math.PI / 2); p.invuln = 5;
  window.sim(0.8, () => ({ throttle: 1 }));
  const cogido = I.held;
  const live = A.aliens.slice(0, 3);
  live.forEach((a, i) => { a.state = 'chase'; a.t = 9; a.x = p.pos.x + 12 + i * 3; a.z = p.pos.z + 10; a.y = 0; a.fig.group.visible = true; a.fig.group.scale.setScalar(1); });
  u.x = p.pos.x + 20; u.z = p.pos.z; A.setUfo('hunt');
  window.sim(1 / 60, () => ({ keys: ['KeyQ'] }));
  const tontos = `${A.aliens.filter((a) => a.state === 'dazed').length}/${live.length}`;
  // A uno tonto se le da el culetazo aunque te esté mirando
  const a = A.aliens.find((x) => x.state === 'dazed');
  for (const o of A.aliens) o.cd = o === a ? 0 : 99;
  const c0 = A.wave.count;
  a.heading = Math.PI;
  p.place(a.x, a.z - 9, 0); p.v = 20; p.invuln = 0;
  window.sim(0.6, () => ({ throttle: 1 }));
  return { enLaCalle, cogido, gastado: I.held === null, tontos, platillo: u.state, culetazoDeFrente: A.wave.count - c0 };
});
await log('marcianos: gorro de aluminio', () => {
  const g = window.__game; const A = g.aliens; const I = g.items; const p = g.player; const u = A.u;
  // Después del timbre le toca al gorro: con él puesto, ni parado debajo del platillo te coge el rayo
  const sp = g.world.places.spawn;
  for (const o of A.aliens) o.cd = 99;
  p.place(sp.x, sp.z, sp.heading);
  I.stop(p); I.held = null; I.group.visible = false; I.cd = 0; I.last = 'bell';
  let n = 0; while (!I.group.visible && n++ < 600) window.sim(1 / 60);
  const sale = I.drop.kind;
  p.place(I.drop.x - 6, I.drop.z, Math.PI / 2); p.invuln = 5;
  window.sim(0.8, () => ({ throttle: 1 }));
  const cogido = I.held;
  const bajoElRayo = (secs) => {
    p.place(sp.x, sp.z, sp.heading); p.invuln = 0;
    u.x = p.pos.x; u.z = p.pos.z; u.vx = u.vz = 0; A.setUfo('hunt');
    let m = 0; window.sim(secs, () => { m = Math.max(m, u.meter); });
    return +m.toFixed(2);
  };
  window.sim(1 / 60, () => ({ keys: ['KeyQ'] }));
  const puesto = p.foil && I.hat.visible && I.hat.parent === p.rider.head;
  const conGorro = bajoElRayo(3);
  I.fx.t = 0.1; window.sim(0.2);
  const quitado = !p.foil && !I.hat.visible && !I.fx;
  const sinGorro = bajoElRayo(2);
  if (p.held) A.release(p);
  A.setUfo('rest'); window.sim(1);
  return { sale, cogido, puesto, rayoConGorro: conGorro, quitado, rayoSinGorro: sinGorro };
});
await log('marcianos: cohete', () => {
  const g = window.__game; const A = g.aliens; const I = g.items; const p = g.player;
  // Turbo que entra solo y no gasta, más rápido que el normal, hasta que se acaba
  const sp = g.world.places.spawn;
  for (const o of A.aliens) o.cd = 99;
  p.place(sp.x, sp.z, sp.heading);
  I.stop(p); I.held = null; I.group.visible = false; I.cd = 0; I.last = 'foil';
  let n = 0; while (!I.group.visible && n++ < 600) window.sim(1 / 60);
  const sale = I.drop.kind;
  p.place(I.drop.x - 6, I.drop.z, Math.PI / 2); p.invuln = 99;
  window.sim(0.8, () => ({ throttle: 1 }));
  const cogido = I.held;
  p.place(sp.x, sp.z, sp.heading); p.boost = 0.5;
  window.sim(1 / 60, () => ({ keys: ['KeyQ'] }));
  window.sim(2.5);
  const lanzado = { v: +p.v.toFixed(0), tope: p.stats.vboost, turbo: p.boost, atado: I.rocket.visible };
  window.sim(1, () => ({ throttle: -1 }));
  const frenando = +p.v.toFixed(0);
  I.fx.t = 0.1; window.sim(0.2);
  p.invuln = 0;
  return { sale, cogido, lanzado, frenando, apagado: !p.rocket && !p.boosting && !I.rocket.visible && !I.fx };
});
await log('marcianos: gravedad lunar', () => {
  const g = window.__game; const A = g.aliens; const I = g.items; const p = g.player;
  // Después del cohete le toca a la luna: el mismo salto sube mucho más y tarda mucho más en caer
  const sp = g.world.places.spawn;
  for (const o of A.aliens) o.cd = 99;
  A.setUfo('rest');
  const salto = () => {
    // Sin charcos debajo, que un rebote en la baba falsea la medida
    for (const s of g.slime.list) { s.t = 0; s.mesh.visible = false; }
    p.place(sp.x, sp.z, sp.heading); p.invuln = 99;
    const y0 = p.pos.y; let top = 0; let air = 0;
    window.sim(1 / 60, () => ({ jumpPressed: true }));
    window.sim(5, () => { top = Math.max(top, p.pos.y - y0); if (!p.grounded) air++; });
    return { alto: +top.toFixed(1), aire: +(air / 60).toFixed(2) };
  };
  const normal = salto();
  I.stop(p); I.held = null; I.group.visible = false; I.cd = 0; I.last = 'rocket';
  let n = 0; while (!I.group.visible && n++ < 600) window.sim(1 / 60);
  const sale = I.drop.kind;
  p.place(I.drop.x - 6, I.drop.z, Math.PI / 2);
  window.sim(0.8, () => ({ throttle: 1 }));
  const cogido = I.held;
  p.place(sp.x, sp.z, sp.heading);
  window.sim(1 / 60, () => ({ keys: ['KeyQ'] }));
  const puesta = p.moon && I.helmet.visible;
  const lunar = salto();
  const escafandra = I.helmet.parent === p.rider.head;
  I.fx.t = 0.1; window.sim(0.2);
  const quitada = !p.moon && !I.helmet.visible && !I.fx;
  const despues = salto();
  p.invuln = 0;
  return { sale, cogido, puesta, escafandra, normal, lunar, quitada, despues };
});
await log('marcianos: baba verde', () => {
  const g = window.__game; const A = g.aliens; const S = g.slime; const p = g.player; const u = A.u;
  const sp = g.world.places.spawn; const fx = Math.sin(sp.heading); const fz = Math.cos(sp.heading);
  const vivos = () => S.list.filter((s) => s.t > 0).length;
  for (const o of A.aliens) o.cd = 99;
  for (const s of S.list) { s.t = 0; s.mesh.visible = false; }
  u.x = sp.x - fx * 150; u.z = sp.z - fz * 150; A.setUfo('rest');
  // Rodando por encima se derrapa: ni el freno ni el manillar mandan hasta que se pasa
  const c = S.splat(sp.x + fx * 14, sp.z + fz * 14);
  p.place(sp.x, sp.z, sp.heading); p.invuln = 99; p.v = 25;
  window.sim(0.45);
  const h0 = p.heading; const v0 = p.v;
  window.sim(0.5, () => ({ throttle: -1, steer: 1 }));
  const derrape = { resbala: p.slip > 0, frenoSinEfecto: +(v0 - p.v).toFixed(1), rumbo: +(p.heading - h0).toFixed(2) };
  window.sim(1.6, () => ({ throttle: -1 }));
  derrape.luegoFrena = !(p.slip > 0) && p.v < 1;
  // Cayendo encima se rebota, cada vez más alto, y al tercer bote el charco se deshace
  p.place(c.x, c.z, sp.heading); c.t = 26;
  let alto = 0; window.sim(7, (t) => { alto = Math.max(alto, p.pos.y); return { jumpPressed: t < 0.02 }; });
  const rebote = { alto: +alto.toFixed(1), salto: +((p.stats.jump ** 2) / 84).toFixed(1), seDeshace: c.t <= 0 && p.grounded };
  // Un marciano que corre por encima resbala; al reventar deja otro charco
  const c2 = S.splat(sp.x + fx * 14, sp.z + fz * 14);
  p.place(sp.x, sp.z, sp.heading);
  const a = A.aliens[0];
  a.state = 'chase'; a.t = 9; a.slick = 0; a.y = 0; a.fig.group.visible = true; a.fig.group.scale.setScalar(1);
  a.x = sp.x + fx * 32; a.z = sp.z + fz * 32; a.heading = sp.heading + Math.PI;
  let tonto = false; window.sim(1.6, () => { tonto = tonto || a.state === 'dazed'; });
  c2.t = 0; const n0 = vivos();
  A.pop(a, 0, 10);
  const alReventar = vivos() - n0;
  // Al irse los marcianos se secan todos
  S.clear(); window.sim(1.2);
  return { puesto: !!c, derrape, rebote, marcianoResbala: tonto, alReventar, secos: vivos() === 0 };
});
await log('marcianos: robo de la estatua', () => {
  const g = window.__game; const A = g.aliens; const H = g.heist; const p = g.player; const k = H.k;
  const P = g.world.places.plaza;
  const quiet = () => { for (const o of A.aliens) o.cd = 99; p.invuln = 99; A.u.x = p.pos.x + 300; A.setUfo('rest'); };
  // El ladrón cae sobre la fuente, levanta la estatua y sale a la calle con ella
  p.place(P.x + 30, P.z + 8, -1.6); quiet();
  H.cd = 0; window.sim(2.7, quiet);
  const robo = { corre: k.state === 'run', aCuestas: H.where === 'carried', minimapa: H.blips.length === 1, hud: document.getElementById('heist').textContent };
  // Tres culetazos, con un timbrazo por medio, y la estatua vuelve volando a su fuente
  const ram = () => {
    quiet(); p.place(k.x - Math.sin(k.heading) * 10, k.z - Math.cos(k.heading) * 10, k.heading); p.v = 45; p.invuln = 0; k.cd = 0;
    const h0 = H.hits; let hit = false;
    window.sim(1.2, () => { hit = hit || H.hits > h0; return hit ? {} : { throttle: 1, boost: true }; });
    return hit;
  };
  const golpes = [ram()];
  window.sim(1.5);
  p.place(k.x + 12, k.z, 0); quiet();
  const tonto = A.sonic(p.pos.x, p.pos.z, 46).n > 0 && k.state === 'dazed';
  golpes.push(ram()); window.sim(1.2); golpes.push(ram());
  const suelta = H.where === 'flying' && k.state === 'fly';
  window.sim(4);
  const recuperada = { golpes, tonto, suelta, enLaFuente: H.home && H.statue.position.distanceTo(H.base) < 0.01, contador: g.save.statues };
  // Si se le acaba el tiempo se la lleva el platillo, que la devuelve al irse
  H.done = false; H.cd = 0; quiet(); window.sim(2.7, quiet);
  H.left = 0.2; window.sim(1.5, quiet);
  const seEscapa = H.where === 'gone' && !H.statue.visible;
  g.env.night = g.env.target = 0; g.env.apply(); window.sim(3.5);
  const devuelta = H.home && H.statue.visible;
  g.env.night = g.env.target = 1; g.env.apply(); window.sim(3);
  H.cd = 999;
  return { robo, recuperada, seEscapa, devuelta };
});
await log('marcianos: robo del platillo', () => {
  const g = window.__game; const A = g.aliens; const p = g.player; const u = A.u;
  const cow = g.cows.list[0];
  for (const o of A.aliens) o.cd = 99;
  p.place(cow.x + 30, cow.z, 0);
  // Tres coscorrones saltando bajo el platillo atontado
  const golpes = [];
  for (let k = 0; k < 3; k++) {
    p.invuln = 5; u.x = p.pos.x; u.z = p.pos.z; u.vx = u.vz = 0; A.setUfo('stun');
    window.sim(1.5);
    const bajo = +u.y.toFixed(0);
    window.sim(0.5, (t) => ({ jumpPressed: t < 0.02 }));
    golpes.push(`${u.hits} a ${bajo}`);
    if (k < 2) window.sim(1.2);
  }
  let n = 0; while (u.state === 'board' && n++ < 300) window.sim(1 / 60);
  const tuyo = u.state === 'ride' && p.hidden && !A.pilot.group.visible && !!A.mate;
  const x0 = u.x;
  window.sim(1.5, () => ({ throttle: 1 }));
  const vuela = Math.hypot(u.x - x0, u.z - cow.z) > 20;
  // Con el rayo encendido se lleva a un marciano y a una vaca
  const a = A.aliens[0]; const c0 = A.wave.count;
  u.x = cow.x; u.z = cow.z; u.vx = u.vz = 0;
  a.state = 'wander'; a.t = 5; a.x = u.x + 3; a.z = u.z; a.y = 0; a.fig.group.visible = true;
  window.sim(3, () => ({ jump: true }));
  const botin = `${A.wave.count - c0} marciano, ${A.lost.length} vaca`;
  A.ride.t = 0.3; window.sim(0.6);
  const fin = u.state === 'rest' && !p.held && !p.hidden && !g.camera3.rig && A.pilot.group.visible && !A.mate && u.hits === 0;
  n = 0; while (!p.grounded && n++ < 600) window.sim(1 / 60);
  return { golpes: golpes.join(', '), tuyo, vuela, botin, finDelPaseo: fin, vacaDevuelta: !cow.taken && cow.group.visible && !A.lost.length, enElSuelo: p.grounded, castañazo: p.crashT > 0 };
});
await log('marcianos: nave nodriza', () => {
  const g = window.__game; const A = g.aliens; const B = g.boss; const p = g.player; const m = B.m; const H = g.world.places.halfpipe;
  const pips = () => document.querySelectorAll('#bosspips i:not(.off)').length;
  // Con el último marciano de la oleada baja la nodriza sobre el half-pipe y el platillo se recoge
  A.wave.count = A.wave.goal - 1;
  A.score(p, g.time, null, 500);
  window.sim(0.1);
  const llega = `${m.state}, platillo ${A.u.state}, rechazada ${A.cleared}`;
  window.sim(5);
  const plantada = { estado: m.state, minimapa: B.blips.length === 1, vida: `${pips()}/${m.need}`, sobreElHalfPipe: Math.hypot(m.x - H.x, m.z - H.z) < 1 };
  // De un salto desde la plataforma no se llega; cogiendo carrerilla con el turbo, sí
  const c = Math.cos(H.rot); const s = Math.sin(H.rot);
  p.place(H.x + s * 20, H.z + c * 20, H.rot); p.invuln = 99;
  window.sim(1.2, (t) => ({ jumpPressed: t < 0.02 }));
  const deUnSalto = m.hits;
  const pump = (until) => {
    let n = 0;
    while (!until() && n++ < 3600) {
      if (p.grounded && (Math.hypot(p.pos.x - H.x, p.pos.z - H.z) > 26 || (Math.abs(p.v) < 1 && n % 120 === 0))) { p.place(H.x, H.z, H.rot); p.invuln = 99; }
      window.sim(1 / 60, () => ({ throttle: 1, boost: true }));
    }
    return +(n / 60).toFixed(1);
  };
  p.place(H.x, H.z, H.rot); p.invuln = 99;
  const t1 = pump(() => m.hits >= 1);
  const escudo = { sube: m.shield > 0, hud: document.getElementById('boss').classList.contains('shield'), refuerzos: B.minions };
  // Con el escudo levantado se rebota sin hacerle nada, llueven bombas y el timbrazo lo rompe
  let bombas = 0;
  pump(() => { bombas = Math.max(bombas, B.bombs.filter((b) => b.t >= 0).length); return m.shield < 2.5; });
  escudo.aguanta = m.hits === 1;
  escudo.bombas = bombas > 0;
  escudo.timbrazo = A.sonic(p.pos.x, p.pos.z, 46).boss && m.shield === 0;
  // Un bombazo de lleno: frenazo y studs por los suelos
  p.place(H.x, H.z, H.rot); p.invuln = 0; g.save.studs = 500;
  B.bombs.forEach((b) => { b.t = -1; });
  m.bombT = 0; window.sim(1 / 60); m.bombT = 99;
  const b = B.bombs.find((o) => o.t >= 0);
  b.x = p.pos.x; b.z = p.pos.z; b.gy = p.pos.y;
  window.sim(1.6);
  const bombazo = 500 - g.save.studs;
  m.bombT = 3; m.shield = 0;
  const st = g.save.studs;
  const t3 = pump(() => m.state !== 'fight');
  const cae = { golpes: m.hits, segundos: [t1, t3], estado: m.state, marcianos: A.aliens.filter((a) => a.state !== 'off' && a.state !== 'fly').length };
  window.sim(4);
  const revienta = m.state === 'gone' && !B.group.visible && !g.camera3.ceil && document.getElementById('boss').classList.contains('hidden');
  window.sim(6);
  // (las vacas que quedan lejos del skatepark no se pintan: solo cuenta que no siga ninguna abducida)
  return { llega, plantada, deUnSalto, escudo, bombazo, cae, revienta, derribadas: g.save.motherships, rechazada: g.save.invasions, premio: g.save.studs - st, amanece: g.env.target === 0, platillo: A.u.state, marcianos: A.aliens.filter((a) => a.state !== 'off').length, devueltos: !A.lost.length && !g.cows.list.some((c) => c.taken) };
});
await log('búsqueda: multa y cuartelillo', () => {
  const g = window.__game; const W = g.wanted; const p = g.player; const sp = g.world.places.spawn;
  g.env.night = g.env.target = 0; g.env.apply();
  const chase = (smashes) => {
    g.save.studs = 3000; p.place(sp.x, sp.z, sp.heading); p.invuln = 0;
    for (let i = 0; i < smashes; i++) g.onSmash();
    window.sim(1 / 60);
    const stars = W.stars; const hud = document.querySelectorAll('#wanted b.on').length;
    let n = 0; while (W.stars && n++ < 1800) window.sim(1 / 60);
    return `${stars}★ (${hud} en pantalla), multa ${3000 - g.save.studs}, en ${g.zoneName(p.pos.x, p.pos.z)}`;
  };
  const una = chase(5);
  const a = W.cop.state;
  window.sim(6);
  return { unaEstrella: una, municipal: a + '→' + W.cop.state, tresEstrellas: chase(13), comisaria: !!W.station };
});
await log('búsqueda: esquinazo', () => {
  const g = window.__game; const W = g.wanted; const p = g.player; const sp = g.world.places.spawn;
  // El municipal sale por delante: se le llama mirando al revés y se huye calle adelante
  p.place(sp.x, sp.z, sp.heading + Math.PI); p.invuln = 0;
  for (let i = 0; i < 9; i++) g.onSmash();
  window.sim(1.3);
  const st = g.save.studs; let blink = false;
  p.place(sp.x, sp.z, sp.heading);
  let n = 0; while (W.stars && n++ < 2400) { window.sim(1 / 60, () => ({ throttle: 1 })); blink = blink || document.getElementById('wantedbox').classList.contains('evading'); }
  return { segundos: +(n / 60).toFixed(1), parpadea: blink, premio: g.save.studs - st >= 400, estrellas: W.stars, aviso: document.getElementById('big').textContent };
});
await log('búsqueda: la abuela', () => {
  const g = window.__game; const W = g.wanted; const p = g.player; const sp = g.world.places.spawn; const G = W.granny; const S = W.slip;
  W.fine = () => {}; // aquí solo interesa la abuela (al final se restaura el método)
  window.sim(6, () => ({ throttle: 1 }));
  window.sim(2, () => ({ throttle: -1 }));
  const far = Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z);
  g.save.studs = 3000;
  for (let i = 0; i < 21; i++) g.onSmash();
  const stars = W.stars;
  // Primera zapatilla: se esquiva saltando. La segunda, no
  let n = 0; let jumped = false; let dodged = false;
  while (n++ < 1500 && !dodged && W.stars) {
    const jump = S.state === 'fly' && Math.hypot(S.x - p.pos.x, S.z - p.pos.z) < 16 && p.grounded && !jumped;
    jumped = jumped || jump;
    window.sim(1 / 60, () => ({ jumpPressed: jump }));
    dodged = jumped && S.state === 'back';
    if (G.d < 8 && G.state === 'chase') G.x += 30;
  }
  const ok = dodged && W.stars === 5;
  n = 0; while (W.stars && n++ < 1800) { window.sim(1 / 60); if (G.d < 8 && G.state === 'chase') G.x += 30; }
  const big = document.getElementById('big').textContent;
  window.sim(1.6);
  delete W.fine;
  return { estrellas: stars, esquivada: ok, aviso: big, requisado: 3000 - g.save.studs, lejos: +far.toFixed(0), aCasa: +Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z).toFixed(1) };
});
await page.evaluate(() => {
  const g = window.__game; const W = g.wanted; const p = g.player;
  window.sim(4);
  for (let i = 0; i < 21; i++) g.onSmash();
  p.invuln = 99; window.sim(2.6);
  // Los dos delante de la cámara para la foto
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  [[W.cop, 15, 4], [W.granny, 17, -3]].forEach(([c, f, s]) => { c.x = p.pos.x + fx * f + fz * s; c.z = p.pos.z + fz * f - fx * s; c.y = g.terrain.height(c.x, c.z); c.heading = Math.atan2(p.pos.x - c.x, p.pos.z - c.z); c.state = 'chase'; c.t = 0; c.pop = 1; c.throwCd = 9; });
  window.sim(0.05);
  p.invuln = 0;
});
await shot('s_busqueda');
await page.evaluate(() => { window.__game.wanted.reset(true); });
await log('casas', () => {
  const g = window.__game; const p = g.player; const out = {};
  const lejos = () => { const sp = g.home.spawn; return +Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z).toFixed(1); };
  g.state = 'menu';
  for (const id of ['yago', 'teo', 'adrian', 'emma', 'iker', 'leo', 'jose']) { g.setCharacter(id); out[id] = `${g.home.name} a ${lejos()}`; }
  g.state = 'play';
  g.setCharacter('teo');
  out.enLaPausaSeQueda = lejos() > 100;
  g.goHome();
  out.volverACasa = lejos();
  out.canasta = !g.folks.jose.marker.hidden;
  return out;
});
await log('personajes', () => {
  const g = window.__game; const p = g.player; const F = g.folks; const sp = g.world.places.spawn;
  const out = {};
  for (const id of ['yago', 'teo', 'adrian', 'emma', 'iker', 'leo', 'jose']) {
    g.setCharacter(id);
    p.place(sp.x, sp.z, sp.heading);
    let vm = 0; let ym = 0;
    window.sim(4, () => { vm = Math.max(vm, p.speed); return { throttle: 1 }; });
    window.sim(1 / 60, () => ({ jumpPressed: true }));
    window.sim(1.6, (t) => { ym = Math.max(ym, p.pos.y); return { throttle: 1, trickPressed: t > 0.1 && t < 0.13 }; });
    out[id] = [p.veh.kind, +vm.toFixed(0), +ym.toFixed(1), document.getElementById('trick').textContent.split('+')[0]].join(' ');
    out[id + 'Doble'] = id === 'yago' ? F.yago.root.visible : id === 'teo' ? g.ball.keeperName : id === 'adrian' ? F.drummer.fig.group.visible : id === 'emma' ? F.emma.fig.group.visible : id === 'iker' ? F.iker.root.visible : id === 'leo' ? F.leo.fig.group.visible : !F.jose.kid.away;
  }
  out.guardado = g.save.character;
  return out;
});
await shot('s_personajes');
// La canasta: el padre tira solo si se lleva a Jose; con otro personaje, padre e hijo juegan juntos
await log('canasta', () => {
  const g = window.__game; const p = g.player; const J = g.folks.jose; const H = J.H; const out = {};
  const jugadas = () => Object.keys(J.seen).sort().join(' ');
  p.place(H.x + H.nx * 24 + J.tx * 6, H.z + H.nz * 24 + J.tz * 6, Math.atan2(-H.nx, -H.nz));
  J.seen = {};
  window.sim(30);
  out.solo = [J.kid.fig.group.visible, jugadas()].join(' ');
  g.setCharacter('yago');
  const n = J.n; const made = J.made; let juntos = 9; let fuera = -9;
  J.seen = {};
  for (let i = 0; i < 80 * 60; i++) {
    window.sim(1 / 60);
    if (!J.dad.jump && !J.kid.jump) juntos = Math.min(juntos, Math.hypot(J.dad.x - J.kid.x, J.dad.z - J.kid.z));
    for (const P of [J.dad, J.kid]) fuera = Math.max(fuera, Math.abs((P.x - H.x) * J.tx + (P.z - H.z) * J.tz) - H.half, -((P.x - H.x) * H.nx + (P.z - H.z) * H.nz));
  }
  out.aDuo = [J.kid.fig.group.visible, J.n - n, J.made - made].join(' ');
  out.jugadas = jugadas();
  out.sinPisarse = juntos > 2;
  out.enLaPista = fuera < 0;
  return out;
});
await shot('s_canasta');
// Emma: en el menú la trae su padre en coche a la puerta de El Palmeral, frente a la pista, y se baja;
// de vecina, selfies y corazones en el parque
await log('emma', () => {
  const g = window.__game; const p = g.player; const D = g.dropoff; const E = g.folks.emma; const out = {};
  const menu = (secs) => { for (let i = 0; i < secs * 60; i++) D.update(1 / 60, false); };
  g.state = 'menu';
  g.setCharacter('emma');
  out.llega = [D.state, D.van.group.visible, p.hidden].join(' ');
  menu(4.6);
  out.puerta = D.state;
  menu(1.5);
  out.seBaja = [D.state, p.hidden, !D.kid].join(' ');
  out.cocheA = +Math.hypot(D.x - p.pos.x, D.z - p.pos.z).toFixed(1);
  g.start();
  out.adios = D.state;
  window.sim(22);
  out.seVa = [D.state, D.van.group.visible].join(' ');
  g.state = 'menu';
  g.setCharacter('jose');
  g.setCharacter('emma');
  g.setCharacter('jose');
  out.cambioEnElMenu = [D.state, p.hidden].join(' ');
  g.state = 'play';
  out.parque = g.zoneName(E.x, E.z);
  const gate = g.world.places.homes.emma; const S = g.world.places.soccer;
  out.puertaALaPista = +Math.hypot(gate.x - S.cx, gate.z - S.cz).toFixed(0);
  out.emmaALaPuerta = +Math.hypot(E.x - gate.x, E.z - gate.z).toFixed(0);
  p.place(E.x + 9, E.z + 4, 0);
  window.sim(6);
  out.selfies = [E.fig.group.visible, E.n > 0, E.hearts.filter((h) => h.t > 0).length > 2].join(' ');
  out.teSacaDeFondo = Math.abs(Math.atan2(Math.sin(E.heading - Math.atan2(E.x - p.pos.x, E.z - p.pos.z)), 1)) < 0.2;
  return out;
});
await shot('s_emma');
await log('foto', async () => {
  const g = window.__game; const P = g.photo; const c = g.camera3; const U = g.final.uniforms;
  const t = g.time; const antes = c.cam.position.clone();
  P.open();
  P.turn(160, -40); P.dolly(0.6); P.roll = 0.2; P.filter = 3;
  for (let i = 0; i < 60; i++) P.update(1 / 60);
  const out = { congelado: g.paused && g.time === t, sinHud: document.getElementById('hud').classList.contains('hidden'), camara: +c.cam.position.distanceTo(antes).toFixed(1), sepia: U.uSat.value === 0 };
  P.shoot();
  await new Promise((r) => { const id = setInterval(() => { if (P.preview) { clearInterval(id); r(); } }, 30); });
  const bmp = await createImageBitmap(P.shot);
  out.foto = `${bmp.width}×${bmp.height} ${Math.round(P.shot.size / 1024)} kB`;
  out.fichero = document.getElementById('ph-save').download;
  P.close();
  // La prueba lleva el juego en pausa: el modo foto vuelve a ella y hay que quitar su panel
  document.getElementById('pause').classList.add('hidden');
  out.restaurado = c.cam.position.distanceTo(antes) < 0.01 && c.roll === 0 && U.uSat.value === 1.14 && !P.on && !P.preview;
  return out;
});
await log('estado', () => { const g = window.__game; return { studs: g.save.studs, stars: g.save.stars, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, programs: g.renderer.info.programs.length, geos: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures }; });
if (errors.length) console.log('\nERRORES:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
else console.log('\nSin errores de consola.');
await browser.close();
