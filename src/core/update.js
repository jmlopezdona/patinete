// Versión del juego y aviso de versión nueva: el menú enseña la que se está jugando y, si mientras
// tanto se ha publicado otra (lo normal en el juego instalado, que se queda abierto días), lo avisa
// y deja actualizar con un botón.
export const VERSION = __APP_VERSION__;

const TRIED = 'cobena-update';
const EVERY = 60_000; // como mucho se pregunta una vez por minuto

const newer = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const session = (value) => {
  try {
    if (value === undefined) return sessionStorage.getItem(TRIED);
    sessionStorage.setItem(TRIED, value);
  } catch {
    /* sin almacenamiento solo se pierde el «recién estrenada» */
  }
  return null;
};

// Devuelve la función que vuelve a mirar si hay versión nueva (al pausar, al volver al menú…)
export function setupUpdate(label, banner, text, buttons) {
  label.textContent = `v${VERSION}`;
  // Si se acaba de actualizar desde el aviso, la etiqueta lo celebra
  const tried = session();
  if (tried && !newer(tried, VERSION)) {
    label.textContent += ' · ✨ ¡recién estrenada!';
    label.classList.add('fresh');
  }

  let found = null;
  let last = 0;
  async function check() {
    if (found || !import.meta.env.PROD || performance.now() - last < EVERY) return;
    last = performance.now();
    try {
      const { version } = await (await fetch('version.json', { cache: 'no-store' })).json();
      // Si ya se intentó y la página sigue llegando vieja, no se insiste con la misma versión
      if (typeof version !== 'string' || !newer(version, VERSION) || version === tried) return;
      found = version;
      text.innerHTML = `Tienes la v${VERSION} y ya está lista la <b>v${version}</b>.`;
      banner.classList.remove('hidden');
      for (const b of buttons) b.classList.remove('hidden');
    } catch {
      /* sin conexión no hay nada que avisar */
    }
  }

  for (const b of buttons) {
    b.addEventListener('click', () => {
      session(found);
      for (const o of buttons) {
        o.disabled = true;
        o.textContent = '🧱 Montando las piezas nuevas…';
      }
      // La página se pide siempre a la red (también con service worker), así que recargar basta
      setTimeout(() => location.reload(), 700);
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  last = -EVERY;
  check();
  return check;
}
