# Cobeña · Patinete

Videojuego web en 3D: el pueblo de **Cobeña (Madrid)** reconstruido calle a calle con ladrillos de
juguete para recorrerlo montado en el patinete de las fotos de `fotos_patinete/`. El patinete del
juego está modelado pieza a pieza a partir de esas fotos (largueros azules con agujeros, losetas
grises, guardabarros gris, horquilla blanca en L, conectores negros, columna a rayas y manillar
gris en T).

El callejero es el real: calles, casas, vallas, parques, piscinas y pistas salen de
[OpenStreetMap](https://www.openstreetmap.org) a escala 2 unidades de juego por metro. La partida
empieza en casa, en la **calle Río Júcar, 44**, y el skatepark está donde lo están construyendo de
verdad: en la parcela de al lado de la rotonda de la M-103, al final de la calle.

## Cómo jugar

```bash
npm install
npm run dev        # abre http://localhost:5173
```

Para generar la versión lista para publicar en cualquier hosting estático:

```bash
npm run build      # crea la carpeta dist/
npm run preview    # la sirve en local para probarla
```

El servidor de desarrollo también escucha en la red local, así que se puede abrir desde una
tableta o un móvil (hay controles táctiles) con la dirección «Network» que muestra Vite.

## Controles

| Acción | Teclado | Mando |
| --- | --- | --- |
| Conducir | `W` `A` `S` `D` o flechas | Stick izquierdo, gatillos |
| Saltar | `Espacio` | A |
| Turbo | `Mayús` | B |
| Tailwhip (en el aire) | `F` | X |
| Giros en el aire | `A` / `D` | Stick |
| Backflip / frontflip | pulsar `S` / `W` en el aire | — |
| Empezar minijuego | `E` | Y |
| Día / noche (de noche: ¡marcianos!) | `N` | — |
| Soltarse del rayo abductor | machacar `Espacio` | A |
| Cámara cerca / lejos | `C` | Select |
| Color del patinete | `V` | — |
| Recolocarse | `R` | — |
| Sonido | `M` | — |
| Pausa | `Esc` | Start |

Para hacer *grind*, salta y cae sobre una barandilla del skatepark.

## Qué hay en Cobeña

- **Calle Río Júcar, 44**: la casa de salida (lleva cartel y banderín, y sale marcada en el minimapa).
- **Skatepark nuevo**, en su parcela junto a la rotonda: half-pipe, bowl circular, funbox con
  barandilla, mesa de salto, rollers y raíles.
- **Plaza de la Villa** con el ayuntamiento, la iglesia de San Cipriano y su campanario, y la fuente
  con la estatua dorada del patinete.
- **Parque El Mirador** con su estanque, parques infantiles repartidos por el pueblo, el Jardín
  Botánico, el polígono industrial, el colegio, la biblioteca…
- **Pista Polideportiva** (fútbol con portero), **bolera gigante** en el Recinto Ferial y el
  skatepark viejo.
- **Mega Salto**: en el campo de detrás del skatepark hay una charca con rampa para volar hasta la
  **Isla del Tesoro** (hace falta turbo). Esta parte es inventada.
- Tráfico por las calles principales, peatones, vallas que se pueden saltar, mobiliario que revienta
  en ladrillos, studs de plata, oro y azules, y **12 ladrillos dorados** escondidos.
- El indicador de zona muestra el nombre de la calle por la que vas.

### La noche de los marcianos

Pulsa `N` (o «Día / noche» en la pausa) y, en cuanto oscurece, un platillo baja por el lado del
campanario y empieza a soltar marcianos de ladrillo por las calles.

- **Culetazo**: llevan una diana en el culo. Embístelos **por la espalda** y salen volando hasta
  reventar en ladrillos y studs. Si no te han visto venir, ni se enteran.
- **De frente te pillan**: calambrazo, 100 studs por los suelos (se pueden recoger) y risas marcianas.
- **El turbo los asusta**: mientras lo usas huyen despavoridos enseñando la diana. Con turbo el
  golpe es un *superculetazo*.
- También valen el **pisotón** (caerles encima) y el **tailwhip marciano** (`F` en el aire junto a uno).
  Los golpes seguidos suben el multiplicador: doble, triple… culetazo galáctico.
- **Rayo abductor**: el platillo te sigue con un círculo de luz. Si te quedas debajo te sube:
  machaca `Espacio` para soltarte. Si no, te lleva volando a otra punta del pueblo (la Isla del
  Tesoro, la fuente de la plaza, la bolera…) y te birla unos studs.
- Cada noche hay que echar a una **oleada** (8 marcianos la primera, 4 más cada vez). Al
  conseguirlo el platillo huye, amanece y te llevas el premio. No hay «game over».
- Los puntos verdes del minimapa son marcianos; el 🛸, el platillo. Durante los minijuegos se esconden.

### Vecinos con nombre propio

| | Quién | Dónde | Qué hace |
| --- | --- | --- | --- |
| 🤹 | **Yago** | Skatepark nuevo, en su pista de circo | Monociclo, malabares, piruetas y reverencia. Si te le echas encima, te salta con una voltereta |
| 🧤 | **Teo** | Pista Polideportiva | El portero de «Chut a Puerta»: rubio y con gafas |
| 🥁 | **Adrián** | Calle Libertad, 17 | Doble bombo y melena al viento. Cuanto más te acercas, más suena |
| 🏀 | **Jose** | Pista de baloncesto más cercana a casa | Tiros en suspensión y entradas a canasta (no las mete todas) |
| 🏃‍♀️ | **Ana, Cintia y Bea** | Parques de al lado de casa | Footing en grupo dando la vuelta a los dos parques |

Todos salen en el minimapa con su icono.

### Minijuegos (acércate al icono y pulsa `E`)

| | Minijuego | Dónde | Objetivo |
| --- | --- | --- | --- |
| 🏁 | Gran Premio de Cobeña | Delante de casa | Vuelta al barrio de los ríos contrarreloj |
| 🛹 | Rey del Skatepark | Skatepark nuevo | 75 segundos encadenando trucos |
| 🎳 | Bolos Gigantes | Recinto Ferial | Tú eres la bola: 10 bolos en dos tiradas |
| 🍕 | Pizza Exprés | Plaza de la Villa | Repartir 5 pizzas antes de que se enfríen |
| ⚽ | Chut a Puerta | Pista Polideportiva | Meter goles empujando el balón |

Cada uno da hasta 3 estrellas. El progreso (studs, estrellas, ladrillos dorados, récords)
se guarda en el navegador.

## Cómo está hecho

- [Three.js](https://threejs.org) + [Vite](https://vite.dev). Sin modelos ni texturas externas:
  todo se genera por código al arrancar.
- `src/lego/` — paleta, shader de ladrillos (studs y juntas dibujados por pieza), instanciado
  masivo, constructor de piezas, patinete, minifiguras y modelos.
- `src/world/` — `cobena-data.js` (callejero ya procesado), `cobena.js` (suelo por capas, calles,
  casas, vallas y mobiliario), `landmarks.js` (skatepark y demás lugares especiales) y `terrain.js`
  (terreno analítico: rampas, quarter pipes, bowls… que usa la física).
- `src/game/` — jugador y física arcade, cámara, studs, escombros, tráfico, minijuegos,
  entorno día/noche, HUD y minimapa. `aliens.js` lleva la invasión (marcianos, platillo y rayo) y
  `folks.js`, los vecinos con nombre.
- `src/core/` — entrada (teclado, mando, táctil), audio sintetizado con WebAudio y utilidades.
- `tools/` — utilidades de desarrollo que abren el juego en Chrome sin cabeza para simular la
  física, recorrer los minijuegos y sacar capturas (necesitan `npm run dev` en marcha y Google
  Chrome instalado en la ruta habitual de macOS). `npm run test:misiones` también prueba la invasión y
  a los vecinos, y `node tools/probe.mjs '<js>' [captura.png]` evalúa una expresión dentro del juego.

### Regenerar el callejero

```bash
npm run datos                 # reprocesa la descarga guardada en tools/.cache
npm run datos -- --descargar  # vuelve a pedir los datos a OpenStreetMap (Overpass)
```

`tools/osm-cobena.mjs` convierte los datos en bruto en `src/world/cobena-data.js`: ajusta cada
edificio a un rectángulo, estrecha las calles según el hueco real entre fachadas, quita las vallas
que cortarían el paso y calcula los circuitos de los coches, los paseos de los peatones y la carrera.

Datos del mapa © colaboradores de OpenStreetMap, bajo licencia ODbL.
Juego de fans sin relación con ninguna marca de juguetes.
