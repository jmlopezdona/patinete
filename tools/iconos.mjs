// Herramienta de desarrollo: dibuja el icono de la aplicación (el patinete de perfil) y lo guarda
// en public/icons a los tamaños que piden Android, iOS y el navegador. No necesita el juego en marcha.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
const out = path.resolve('public/icons');
fs.mkdirSync(out, { recursive: true });

const INK = '#12202e';
// El patinete en un lienzo de 512: largueros azules, horquilla y columna blancas, manillar en T
const ART = `
  <g fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
    <path d="M70 414h372" stroke-width="14" opacity=".28"/>
    <path d="M100 322q36-46 84-14" stroke-width="44"/>
    <path d="M100 322q36-46 84-14" stroke="#a0a5a9" stroke-width="22"/>
    <path d="M360 356L312 128" stroke-width="44"/>
    <path d="M360 356L312 128" stroke="#f4f4f4" stroke-width="22"/>
    <path d="M338 252l-9-42" stroke="#a0a5a9" stroke-width="22" stroke-linecap="butt"/>
    <rect x="124" y="316" width="216" height="40" rx="14" fill="#1591d8"/>
    <path d="M330 336h34" stroke-width="44"/>
    <path d="M330 336h34" stroke="#f4f4f4" stroke-width="22"/>
    <path d="M246 122h132" stroke-width="40"/>
    <path d="M268 122h88" stroke="#a0a5a9" stroke-width="18" stroke-linecap="butt"/>
  </g>
  <g fill="#0055bf">
    <circle cx="160" cy="336" r="7"/><circle cx="196" cy="336" r="7"/><circle cx="232" cy="336" r="7"/><circle cx="268" cy="336" r="7"/><circle cx="304" cy="336" r="7"/>
  </g>
  <g stroke="${INK}" stroke-width="12">
    <circle cx="136" cy="366" r="44" fill="#2a2d33"/><circle cx="136" cy="366" r="17" fill="#f4f4f4"/>
    <circle cx="372" cy="366" r="44" fill="#2a2d33"/><circle cx="372" cy="366" r="17" fill="#f4f4f4"/>
  </g>`;

// rx = redondeo del fondo; k = escala del dibujo (los iconos «maskable» reservan margen para el recorte)
const svg = (rx, k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffdf5a"/><stop offset="1" stop-color="#ffc21a"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#f)"/>
  <g transform="translate(256 262) scale(${k}) translate(-254 -262)">${ART}</g>
</svg>`;

const FILES = [
  ['icon-192.png', 192, 104, 1],
  ['icon-512.png', 512, 104, 1],
  ['icon-maskable-512.png', 512, 0, 0.74],
  ['apple-touch-icon.png', 180, 0, 0.9],
];

fs.writeFileSync(path.join(out, 'icon.svg'), svg(104, 1).replace(/\n\s*/g, ''));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
for (const [name, size, rx, k] of FILES) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(rx, k)}`);
  await page.screenshot({ path: path.join(out, name), omitBackground: true });
  console.log(name, `${size}×${size}`);
}
await browser.close();
