// Tablón de novedades del menú: lo último que ha llegado al juego, contado para quien juega.
// Se escribe a mano: cuando un cambio merece anunciarse se añade arriba una entrada con el `id`
// siguiente (por él se sabe cuáles no ha visto todavía cada jugador) y la fecha en que se publica.
export const NEWS = [
  { id: 8, date: '2026-10-09', text: '🤫 <b>Narrador más callado</b>: ya no canta cada cosa que coges ni repite lo que te acaban de contar.' },
  { id: 7, date: '2026-10-08', text: '🛹 <b>Bordillos</b>: las aceras tienen escalón. Súbelo rodando o salta a su lado y grinda por el canto.' },
  { id: 6, date: '2026-10-08', text: '🗞️ <b>Tablón de novedades</b>: aquí verás lo que trae cada actualización.' },
  { id: 5, date: '2026-10-08', text: '🤸 <b>Caballito</b>: mantén la <kbd>G</kbd> y el patinete, la bici y el monopatín van sobre la rueda de atrás.' },
  { id: 4, date: '2026-10-08', text: '👥 <b>Jugar con amigos</b>: crea una partida, pasa el código y recorred Cobeña juntos. Desde la pausa puedes ir a donde está un amigo.' },
  { id: 3, date: '2026-10-08', text: '✨ <b>Piezas más bonitas</b>: el plástico refleja el cielo y tiene los cantos redondeados, y el suelo cambia de tono de placa en placa.' },
  { id: 2, date: '2026-10-08', text: '📸 <b>Selfie con Emma</b>: cuélate de fondo en sus 12 fotos haciendo trucos.' },
  { id: 1, date: '2026-10-08', text: '👽 <b>Bolos marcianos y Chut Marciano</b>: de noche los bolos se apartan y en la portería hay un marciano con cuatro brazos.' },
];

const SHOWN = 5; // las más recientes: el resto ya no son novedad

const day = (date) => new Date(`${date}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

// Pinta el tablón, marcando lo que el jugador aún no había visto, y devuelve el `id` más reciente
export function setupNews(list, seen) {
  let last = null;
  for (const n of NEWS.slice(0, SHOWN)) {
    if (n.date !== last) {
      last = n.date;
      const head = document.createElement('li');
      head.className = 'day';
      head.textContent = day(n.date);
      list.append(head);
    }
    const li = document.createElement('li');
    li.innerHTML = n.text;
    if (n.id > seen) li.classList.add('new');
    list.append(li);
  }
  return NEWS[0].id;
}
