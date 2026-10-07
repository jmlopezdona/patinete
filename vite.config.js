import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// La versión que enseña el menú: «1.0» sale de package.json y el tercer número son los commits que
// lleva el juego, así que sube sola con cada cambio publicado
function gameVersion() {
  const [major, minor, patch] = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version.split('.');
  let build = patch;
  try {
    build = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || patch;
  } catch {
    /* sin git (o sin historial) vale el número de package.json */
  }
  return `${major}.${minor}.${build}`;
}
const version = gameVersion();

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    {
      // version.json: lo que pregunta el juego ya abierto para saber si se ha publicado algo más nuevo
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
      },
    },
  ],
});
