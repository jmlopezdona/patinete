// Instalación como aplicación (PWA): registra el service worker y, en el menú, ofrece instalar el
// juego para que se abra a pantalla completa, sin la barra del navegador.
export function setupInstall(button, hint) {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Lo que ya se ha cargado (página, código, fuentes, camisetas) se guarda para jugar sin conexión
        const loaded = performance.getEntriesByType('resource').map((r) => r.name);
        reg.active.postMessage({ cache: [location.href.split(/[?#]/)[0], ...loaded] });
      })
      .catch(() => {
        /* sin service worker se juega igual, solo que no sin conexión */
      });
  }
  const installed = () => navigator.standalone === true || ['fullscreen', 'standalone'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  if (installed()) return;

  // Android y Chrome de escritorio avisan de que se puede instalar; el botón lanza su diálogo
  let offer = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e;
    button.classList.remove('hidden');
  });
  button.addEventListener('click', async () => {
    if (!offer) return;
    offer.prompt();
    await offer.userChoice;
    offer = null;
    button.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => {
    button.classList.add('hidden');
    hint.classList.add('hidden');
  });

  // En iPhone y iPad no hay aviso: se instala a mano desde el menú de compartir
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    hint.innerHTML = '📲 Para jugar a pantalla completa: pulsa <b>Compartir</b> y luego <b>«Añadir a pantalla de inicio»</b>.';
    hint.classList.remove('hidden');
  }
}
