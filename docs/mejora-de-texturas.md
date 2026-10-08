# Mejora de texturas · propuesta

Revisado el 8 de octubre de 2026 sobre `main` (commit `d6a68f0`). Primero va el inventario de lo
que el juego pinta hoy, luego las mejoras identificadas y por último un orden de trabajo.

Todo sale de leer el código: **no se ha arrancado el juego ni se ha medido nada**. Los costes de
rendimiento que aparecen son estimaciones y hay que confirmarlos con `tools/probe.mjs` antes de
dar ninguna mejora por buena.

## Resumen

- **El juego casi no usa texturas de imagen.** El pueblo entero es color plano por pieza; los
  studs y las juntas los dibuja el shader. Las únicas imágenes son cuatro fotos de camisetas.
- **Lo que más se notaría no es subir resoluciones, sino dar materia al plástico**: hoy es un
  color liso con una rugosidad fija, igual en un ladrillo que en el asfalto.
- **Hay arreglos de nitidez casi gratis**: estampados del torso a 128 px sin filtrado
  anisótropo, y una camiseta a 350 px cuando las demás van a 512.
- **Las dos mejoras de más efecto añaden trabajo por píxel**, que según
  `docs/refactorizacion-y-optimizacion.md` es justo donde el juego va más justo. Deben ir atadas
  al nivel de calidad «Altos».

## 1. Qué hay hoy

### Materiales sin textura

| Qué | Dónde | Cómo se pinta |
| --- | --- | --- |
| Ladrillos del pueblo | `createBrickMaterial` en `src/lego/materials.js:12` | Color por instancia, rugosidad 0,46. El shader oscurece studs y juntas según `aFlags` |
| Suelo por capas | `src/world/cobena.js:150` | El mismo material con color por vértice y rugosidad 0,62 |
| Piezas fusionadas (muñecos, vehículos, mobiliario) | `plastic` en `src/lego/materials.js:115` | Color por vértice, rugosidad 0,5 |
| Goma, oro, cristal, faros | `src/lego/materials.js:117`, `src/lego/vehicles.js:16` | Color y rugosidad fijos |
| Cielo | `src/game/env.js:27` | Shader propio: degradado, sol, luna y estrellas |

Los studs y las juntas solo multiplican el color (`diffuseColor.rgb *= …`): no tocan la normal
ni la rugosidad, así que la luz no los recorre al moverse la cámara ni el sol.

Los reflejos de todo el plástico salen de un `RoomEnvironment` genérico (`src/main.js:167`), una
habitación con focos que no tiene que ver con el cielo del juego y que no cambia de día a noche.

### Texturas de verdad

| Qué | Dónde | Tamaño | Anisotropía |
| --- | --- | --- | --- |
| Caras de los muñecos | `faceTexture`, `src/lego/minifig.js:25` | 512 × 256 | 4 |
| Estampados del torso (rayo, corbata, dorsal…) | `printTexture`, `src/lego/minifig.js:180` | 128 × 128 | sin poner |
| Camisetas pintadas (Argentina, España) | `src/lego/minifig.js:264` y `:319` | 512 × 512 | 8 |
| Camisetas de foto | `public/camisetas/*.jpg` | 512 × 512; `psicopato.jpg`, 350 × 350 | 8 |
| Carteles del pueblo | `textTexture`, `src/main.js:258` | 512 de ancho | 8 |
| Matrículas | `src/lego/vehicles.js:350` y `:416` | 256 × 82 | 8 |
| Nombres de los vecinos | `nameTag`, `src/lego/minifig.js:697` | 256 × 80 | — (sprite) |
| Iconos de misión | `iconTexture`, `src/game/missions.js:22` | 160 × 160 | — (sprite) |
| Charco de luz de las farolas | `src/game/env.js:96` | 128 × 128 | — |

## 2. Mejoras

### T1 · Plástico con materia

**Estado.** Hecho en parte, solo en «Altos» (`uDetail` en `legoUniforms`, lo pone
`applyQuality()`): el canto de los studs y las aristas de los ladrillos inclinan la normal, y
cada ladrillo de pared y cada placa de suelo varía un poco su rugosidad. El efecto es modesto:
se ve de cerca (studs con más bulto, aristas que cogen luz) y a media distancia casi no cambia
nada. Queda fuera el grano fino de la rugosidad, y `plastic` (muñecos y vehículos) sigue igual.
Coste: alternando con y sin detalle en la misma sesión, a 1440 × 810 y densidad 1, la
diferencia no sale del ruido (de −1,3 a +3,4 ms según la repetición, +0,25 ms de media). Sin
medir a densidad 1,5 ni en móvil.

**Qué.** Hacer en el shader de `createBrickMaterial` lo que hoy solo se insinúa con color:

- **Studs con relieve.** Perturbar la normal en el borde del stud en vez de oscurecerlo: el
  brillo del sol y el del entorno recorrerían el canto al moverse la cámara.
- **Bisel en las aristas del ladrillo.** Una franja fina más clara en el borde de cada pieza
  (las coordenadas locales `vLPos` y `vLSize` ya llegan al fragmento), que es lo que hace que un
  ladrillo de verdad se lea como pieza suelta.
- **Rugosidad con grano.** Variar `roughnessFactor` con un ruido muy fino y con el `tint` por
  ladrillo que ya se calcula para las juntas, para que dos ladrillos vecinos no brillen idénticos.

**Dónde.** `src/lego/materials.js`. Para la normal hay que engancharse en
`#include <normal_fragment_maps>`; para la rugosidad ya hay un enganche en
`#include <roughnessmap_fragment>`.

**Efecto.** El mayor de la lista: afecta a los 111 025 ladrillos del pueblo y al suelo.

**Coste.** Unas cuantas operaciones más por píxel en el material que cubre casi toda la
pantalla. Sin medir. Los detalles ya se apagan con la distancia (`fade` sobre `fwidth`), así que
el coste extra se puede limitar a lo cercano.

**Riesgo.** El relieve en la normal puede centellear a lo lejos si no se apaga con el mismo
`fade`. El material `plastic` (muñecos, vehículos) no pasa por este shader: quedaría igual que
hoy salvo que se le aplique el mismo tratamiento, y conviene decidirlo para que no desentone.

### T2 · Reflejos del cielo del juego

**Estado.** Hecho. El `RoomEnvironment` desaparece y `Environment.reflect()` (`src/game/env.js`)
genera el entorno a partir del cielo del juego: mismo degradado, el suelo por debajo del
horizonte, sin el disco del sol (ese brillo ya lo pone la luz del sol) y desaturado a la mitad
para no enfriar demasiado las sombras. Se regenera cada vez que la noche avanza 0,12: ocho
veces por anochecer o amanecer, a unos 0,8 ms cada una (la primera de la medida tardó 34 ms),
sin texturas de más al terminar. La intensidad (`ENV_DAY` 1,4 y `ENV_NIGHT` 5) está ajustada
para acercarse al brillo medio de antes; aun así el día queda algo más frío (en la calle, el
rojo medio baja de 139 a 128 y el azul sube de 117 a 133) y la noche algo más oscura.

**Qué.** Sustituir el `RoomEnvironment` por un entorno generado con `PMREMGenerator.fromScene`
a partir del propio cielo (`this.sky`), y regenerarlo cuando cambia la hora.

**Dónde.** `src/main.js:166-168` y el ciclo de día y noche de `src/game/env.js` (donde se
actualiza `uNight`, línea 143).

**Efecto.** Brillos del color del cielo sobre el plástico, y ventanas (`fWin`, rugosidad 0,07)
que reflejan el atardecer o la noche en lugar de unos focos de estudio.

**Coste.** Generar el entorno no es gratis: no puede hacerse cada fotograma. Bastan unos
pocos pasos a lo largo de la transición (o mezclar entre dos entornos precalculados, día y
noche). En reposo no cuesta nada.

**Riesgo.** Cambia la iluminación ambiente de toda la escena: la intensidad (hoy 0,04 de
desenfoque y los valores de `hemi` y `sun`) habrá que reajustarla, y las capturas de
`npm run capturas` cambiarán todas.

### T3 · Nitidez de lo que ya existe

**Estado.** Hecho, salvo `psicopato.jpg`, que espera a la foto original. El inventario de la
sección 1 describe lo que había antes.

Cuatro arreglos pequeños e independientes:

- **Estampados del torso a 256 px.** `printTexture` dibuja a 128 × 128 sobre un plano que ocupa
  todo el pecho. Las coordenadas están escritas a mano para 128: lo más limpio es subir el
  lienzo y poner `g.scale(2, 2)` al principio, sin tocar los dibujos.
- **Anisotropía en los estampados.** `printTexture` no la pone (las caras llevan 4; carteles y
  camisetas, 8). Vistos de lado se emborronan antes que el resto.
- **`psicopato.jpg` a 512 × 512**, como las otras tres. Hace falta la foto original: ampliar el
  JPG de 350 px no añade detalle.
- **Colocar bien el espacio de color.** `argentinaShirt` y `espanaShirt` devuelven la textura
  sin `colorSpace` y se lo pone `shirtTexture` después; funciona, pero es fácil romperlo si
  alguien las usa por otro camino.

**Efecto.** Se nota en primeros planos: modo foto, vestuario y escenas con vecinos cerca.

**Coste.** Despreciable: unas pocas texturas de 256 px en vez de 128.

### T4 · Suelo con variedad

**Estado.** Hecho en dos pasos. Primero, placas de 8 × 8 studs con ±5 % de tono para todo el
suelo. Después, una variación distinta por capa (`LOOK` en `src/world/cobena.js`, estilos en
`createBrickMaterial`):

| Capa | Estilo | Qué dibuja |
| --- | --- | --- |
| Campos | `surcos` | Surcos de dos studs sobre manchas grandes |
| Suelo urbano | `placas` | Placas de 8 × 8 |
| Verde y caminos | `manchas` | Manchas blandas a dos tamaños |
| Aceras | `baldosas` | Baldosas de 4 × 4 |
| Calzada | `asfalto` | Manchas blandas y, de cerca, moteado de gravilla |
| Agua y marcas viales | — | Lisas |

Cada dibujo se apaga por separado cuando ya no cabe en unos pocos píxeles. Sigue siendo sutil.
El coste del segundo paso está sin medir: hasta dos ruidos suaves (ocho `hash`) por píxel de
suelo, y no tiene interruptor de calidad.

**Qué.** Asfalto, hierba y tierra son un color por vértice idéntico en superficies muy grandes.
Añadir en el shader una variación suave por baldosa en las caras superiores, igual que el
`tint` que ya llevan las paredes (`legoHash(vec2(col, row) + …)`), con una amplitud pequeña
(±3-4 %).

**Dónde.** La rama `fStuds && vLNormal.y > 0.5` de `src/lego/materials.js`. El suelo usa
coordenadas de mundo en `vLPos`, así que la cuadrícula sale continua entre sectores.

**Efecto.** Rompe la uniformidad en plazas, campos y carreteras, que es donde más se ve el
plano liso.

**Coste.** Un `hash` más por píxel de suelo.

**Riesgo.** Una amplitud excesiva da aspecto de ajedrez. Y hay que comprobar que la cuadrícula
de la variación coincide con la de los studs: si van desfasadas se nota.

### T5 · Sprites más limpios

**Qué.** Iconos de misión a 256 px (hoy 160) y nombres de los vecinos a 512 × 160 (hoy
256 × 80). Son sprites que se ven grandes cuando el jugador se acerca.

**Efecto.** Menor: bordes y texto más definidos de cerca.

**Coste.** Hay un cartel por vecino con nombre, así que la memoria se multiplica por cuatro en
esas texturas. Sigue siendo poco, pero conviene contar cuántas son antes de subirlas.

## 3. Calidad y rendimiento

El informe de rendimiento concluye que el juego va «sobrado de lógica y justo de píxeles».
T1, T2 y T4 gastan precisamente ahí, así que:

- T1 debe poder apagarse por nivel de calidad. Lo más sencillo es un uniforme compartido en
  `legoUniforms` que `applyQuality()` (`src/main.js:295`) ponga a 0 fuera de «Altos».
- T2 no cuesta por fotograma; puede ir en los tres niveles.
- T3 y T5 no dependen del nivel.
- Medir antes y después con el método del informe (media de 24 fotogramas, ±1 ms de ruido) en
  la puerta de casa y en la Plaza de la Villa, de día y de noche. Una mejora que no pase de 1 ms
  en «Altos» se da por buena.

Nada de esto se ha probado en móvil ni en tableta, igual que el resto de medidas del proyecto.

## 4. Orden propuesto

| Paso | Mejora | Por qué en este orden |
| --- | --- | --- |
| 1 | T3 · Nitidez (hecho) | Rápido, sin riesgo y sin coste. Se valida con una captura |
| 2 | T4 · Suelo (hecho) | Pequeño y aislado; sirve para ensayar cambios en el shader antes de T1 |
| 3 | T1 · Plástico (hecho en parte) | El de más efecto. Con medida antes y después y el interruptor de calidad |
| 4 | T2 · Reflejos (hecho) | Después de T1, porque los reflejos lucen sobre el plástico ya tratado y obligan a reajustar la luz una sola vez |
| 5 | T5 · Sprites | Opcional |

Cada paso cabe en una PR propia. T1 y T2 cambian el aspecto de todo el juego: conviene verlas
en capturas comparadas (`npm run capturas`) antes de fusionar.
