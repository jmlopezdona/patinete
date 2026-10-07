# Brick City · Patinete

Videojuego web en 3D: una ciudad entera construida con ladrillos de juguete para recorrerla
montado en el patinete de las fotos de `fotos_patinete/`. El patinete del juego está modelado
pieza a pieza a partir de esas fotos (largueros azules con agujeros, losetas grises, guardabarros
gris, horquilla blanca en L, conectores negros, columna a rayas y manillar gris en T).

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
| Día / noche | `N` | — |
| Cámara cerca / lejos | `C` | Select |
| Color del patinete | `V` | — |
| Recolocarse | `R` | — |
| Sonido | `M` | — |
| Pausa | `Esc` | Start |

Para hacer *grind*, salta y cae sobre una barandilla del skatepark.

## Qué hay en la ciudad

- **Plaza Central** con la fuente y la estatua dorada del patinete (punto de salida).
- **Skatepark**: half-pipe, bowl circular, funbox con barandilla, mesa de salto, rollers y raíles.
- **Parque** con estanque, columpios, tobogán y un **campo de fútbol** con portero.
- **Bolera gigante**, **pizzería**, rascacielos **Torre Brick**, playa alrededor de la isla.
- **Mega Salto**: un muelle con rampa para volar hasta la **Isla del Tesoro** (hace falta turbo).
- Tráfico, peatones, mobiliario que revienta en ladrillos, studs de plata, oro y azules,
  y **12 ladrillos dorados** escondidos.

### Minijuegos (acércate al icono y pulsa `E`)

| | Minijuego | Objetivo |
| --- | --- | --- |
| 🏁 | Gran Premio Brick | Vuelta al circuito urbano contrarreloj |
| 🛹 | Rey del Skatepark | 75 segundos encadenando trucos |
| 🎳 | Bolos Gigantes | Tú eres la bola: 10 bolos en dos tiradas |
| 🍕 | Pizza Exprés | Repartir 5 pizzas antes de que se enfríen |
| ⚽ | Chut a Puerta | Meter goles empujando el balón |

Cada uno da hasta 3 estrellas. El progreso (studs, estrellas, ladrillos dorados, récords)
se guarda en el navegador.

## Cómo está hecho

- [Three.js](https://threejs.org) + [Vite](https://vite.dev). Sin modelos ni texturas externas:
  todo se genera por código al arrancar.
- `src/lego/` — paleta, shader de ladrillos (studs y juntas dibujados por pieza), instanciado
  masivo, constructor de piezas, patinete, minifiguras y modelos.
- `src/world/` — generación de la ciudad, lugares especiales y terreno analítico (rampas,
  quarter pipes, bowls) que usa la física.
- `src/game/` — jugador y física arcade, cámara, studs, escombros, tráfico, minijuegos,
  entorno día/noche, HUD y minimapa.
- `src/core/` — entrada (teclado, mando, táctil), audio sintetizado con WebAudio y utilidades.
- `tools/` — utilidades de desarrollo que abren el juego en Chrome sin cabeza para simular la
  física, recorrer los minijuegos y sacar capturas (necesitan `npm run dev` en marcha y Google
  Chrome instalado en la ruta habitual de macOS).

Juego de fans sin relación con ninguna marca de juguetes.
