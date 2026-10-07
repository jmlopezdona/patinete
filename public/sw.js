// Service worker: hace que el juego se pueda instalar y que, una vez abierto con conexión,
// arranque también sin ella. Siempre que hay red manda la red, así que nunca sirve una versión vieja.
const CACHE = 'cobena-v1';
const FONTS = /^fonts\.(googleapis|gstatic)\.com$/;
const mine = (url) => url.origin === self.location.origin || FONTS.test(url.hostname);
// «index-AbC123xY.js» → «index.js»: el mismo fichero en cualquiera de sus versiones
const stem = (file) => file.replace(/-[\w-]{8}(\.\w+)$/, '$1');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || !mine(url)) return;
  // Los ficheros de assets/ llevan un hash en el nombre y no cambian nunca: valen los guardados
  e.respondWith(url.pathname.includes('/assets/') ? cacheFirst(req) : networkFirst(req));
});

// La página avisa de lo que cargó antes de que este service worker tomara el control
self.addEventListener('message', (e) => {
  if (Array.isArray(e.data?.cache)) e.waitUntil(Promise.allSettled(e.data.cache.map(keep)));
});

async function save(req, res) {
  if (res.ok || res.type === 'opaque') (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function keep(href) {
  const url = new URL(href);
  if (!mine(url)) return;
  if (url.hostname !== 'fonts.googleapis.com') {
    if (!(await caches.match(href))) await save(href, await fetch(href));
    return;
  }
  // La hoja de estilos de la tipografía lleva dentro las direcciones de los ficheros de letras
  const css = await fetch(href);
  if (!(await caches.match(href))) await save(href, css);
  await Promise.allSettled([...(await css.text()).matchAll(/url\((https:[^)]+)\)/g)].map((m) => keep(m[1])));
}

async function cacheFirst(req) {
  return (await caches.match(req)) || save(req, await fetch(req));
}

async function networkFirst(req) {
  try {
    const res = await save(req, await fetch(req));
    if (req.mode === 'navigate' && res.ok) prune(res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    throw err;
  }
}

// Con cada versión nueva de la página se tiran las versiones viejas de sus assets
async function prune(page) {
  const now = new Map();
  for (const [, file] of (await page.text()).matchAll(/assets\/([^"'?#]+)/g)) now.set(stem(file), file);
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    const file = path.slice(path.lastIndexOf('/') + 1);
    if (path.includes('/assets/') && now.has(stem(file)) && now.get(stem(file)) !== file) cache.delete(req);
  }
}
