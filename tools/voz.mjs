// Locuciones: del guion de voces/guion.json a los ficheros de public/voz/.
//
//   node tools/voz.mjs encargo > encargo.json   lo que hay que sintetizar (para tools/voz/sintetizar.py)
//   node tools/voz.mjs indice                   apunta en public/voz/index.json las locuciones que hay
//   node tools/voz.mjs pagina                   escribe voces/escucha.html, para oírlo todo sin jugar
//
// El paso de en medio, la síntesis, se hace en el PC: ver voces/README.md.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { voiceKey } from '../src/core/voice.js';

const EMOCIONES = ['alegria', 'ira', 'tristeza', 'miedo', 'asco', 'melancolia', 'sorpresa', 'calma'];
const root = new URL('..', import.meta.url);
const guion = JSON.parse(readFileSync(new URL('voces/guion.json', root), 'utf8'));
// Lo que se oye: sin etiquetas ni emojis
const dicho = (t) => t.replace(/<[^>]+>/g, '').replace(/[\p{Extended_Pictographic}️]/gu, '').trim();

const orden = process.argv[2];
if (orden === 'encargo') {
  const vistas = new Map();
  const lineas = guion.lineas.map((l) => {
    const papel = guion.papeles[l.papel];
    if (!papel) throw new Error(`«${l.texto}»: no hay papel «${l.papel}»`);
    const tono = guion.tonos[l.tono || papel.tono];
    if (!tono) throw new Error(`«${l.texto}»: no hay tono «${l.tono || papel.tono}»`);
    const id = voiceKey(l.texto);
    if (vistas.has(id)) throw new Error(`«${l.texto}» y «${vistas.get(id)}» tienen la misma clave`);
    vistas.set(id, l.texto);
    return { id, voz: papel.voz, texto: dicho(l.dicho || l.texto), vector: EMOCIONES.map((e) => tono[e] || 0) };
  });
  process.stdout.write(JSON.stringify(lineas, null, 1));
} else if (orden === 'indice') {
  const dir = new URL('public/voz/', root);
  const hay = readdirSync(dir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4));
  const guionizadas = new Set(guion.lineas.map((l) => voiceKey(l.texto)));
  const sobran = hay.filter((k) => !guionizadas.has(k));
  const faltan = [...guionizadas].filter((k) => !hay.includes(k));
  writeFileSync(new URL('index.json', dir), JSON.stringify(hay.filter((k) => guionizadas.has(k)).sort()));
  console.log(`${hay.length - sobran.length} locuciones en el índice; faltan ${faltan.length}; sobran ${sobran.length} ${sobran.join(' ')}`);
} else if (orden === 'pagina') {
  const voces = JSON.parse(readFileSync(new URL('voces/voces.json', root), 'utf8')).voces;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fila = (a, b, src) => `<tr><td>${a}</td><td>${b}</td><td><audio controls preload="none" src="${src}"></audio></td></tr>`;
  const html = `<!doctype html><meta charset="utf-8"><title>Voces · Cobeña</title>
<style>body{font:15px system-ui;max-width:1100px;margin:2em auto;padding:0 1em}table{border-collapse:collapse;width:100%}td{border-top:1px solid #8884;padding:6px 8px;vertical-align:middle}audio{height:32px;width:260px}small{opacity:.65}</style>
<h1>Voces de referencia</h1><table>
${voces.map((v) => fila(`<b>${v.id}</b><br><small>${esc(v.papel)}</small>`, `<small>${esc(v.descripcion)}</small>`, `${v.id}.wav`)).join('\n')}
</table>
${Object.entries(guion.papeles).map(([papel, p]) => `<h1>${papel} <small>(${p.voz})</small></h1><table>
${guion.lineas.filter((l) => l.papel === papel).map((l) => fila(`<small>${l.tono || p.tono}</small>`, esc(dicho(l.dicho || l.texto)), `../public/voz/${voiceKey(l.texto)}.mp3`)).join('\n')}
</table>`).join('\n')}
`;
  writeFileSync(new URL('voces/escucha.html', root), html);
  console.log('voces/escucha.html');
} else {
  console.error('uso: node tools/voz.mjs encargo|indice|pagina');
  process.exit(1);
}
