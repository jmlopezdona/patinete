// Para quién es lo que se ve y se oye. Los sistemas del mundo no llaman a `g.hud`, `g.sfx`,
// `g.bits` o `g.camera3` a secas, sino diciendo el destinatario:
//   g.to(p).hud.toast(…)      para un jugador
//   g.to(p).addStuds(…)       y los studs que gana (`OWN`: lo que es del juego y no de un sistema)
//   g.all.hud.big(…)          para todos
//   g.at(x, z).sfx.honk()     en un sitio: para quien esté cerca
//   g.here(x, z).sfx.pop()    lo mismo, pero solo en esta pantalla (lo que cada una hace por su cuenta)
// Jugando solo, todo acaba en el jugador local. En red, lo que el anfitrión decide para otro viaja
// como `efecto`, con el nombre del método y sus argumentos, y se ejecuta en la pantalla de ese jugador
export const SYS = ['hud', 'sfx', 'bits', 'camera3'];
const OWN = ['addStuds', 'giveItem', 'tally'];

// Más lejos que esto, lo que pasa en un sitio ni se ve ni se oye
export const NEAR = 140;

// Un `g` de pega: con cada `eco.<sistema>.<método>(…)` hace lo que diga `each`
export const echo = (each) => Object.fromEntries([...SYS.map((sys) => [sys, new Proxy({}, { get: (_, m) => (...a) => each(sys, m, a) })]), ...OWN.map((m) => [m, (...a) => each('game', m, a)])]);

// Lo que un eco ha recogido, hecho en esta pantalla
export const run = (g, sys, m, a) => (sys === 'game' ? g[m](...a) : g[sys][m](...a));

export const NOBODY = echo(() => {});

// Los carteles son HTML: de lo que llega por la red solo se dejan las etiquetas que el juego usa
const clean = (v) => (typeof v === 'string' ? v.replace(/<(?!\/?(b|i|kbd|small|span)( class="[\w -]*")?>)/g, '&lt;') : v);
const plain = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((n) => typeof n === 'number'));

// Un `efecto` recibido: se ejecuta solo si es un método de verdad de uno de esos sistemas y sus
// argumentos son datos sueltos
export function play(g, sys, m, a) {
  if (!Array.isArray(a) || !a.every(plain)) return;
  if (sys === 'game') {
    if (OWN.includes(m)) g[m](...a);
    return;
  }
  if (!SYS.includes(sys)) return;
  const proto = Object.getPrototypeOf(g[sys]);
  if (m === 'constructor' || !Object.hasOwn(proto, m) || typeof proto[m] !== 'function') return;
  g[sys][m](...(sys === 'hud' ? a.map(clean) : a));
}
