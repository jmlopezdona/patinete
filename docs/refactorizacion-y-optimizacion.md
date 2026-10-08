# Refactorización y optimización · informe

Medido el 8 de octubre de 2026 sobre `main` (commit `9c7cb3b`). Primero van las medidas
de rendimiento, luego las optimizaciones que salen de ellas y por último la deuda técnica del
código, con un orden de trabajo propuesto al final.

## Resumen

- **El juego va sobrado de lógica y justo de píxeles.** Un fotograma en «Altos» cuesta unos 12 ms
  de gráfica; la lógica entera (`update()`), 0,065 ms.
- **Lo que más pesa es el posprocesado, no la geometría.** Pintar la escena sin composer cuesta
  5,6 ms; con él, 12. El antialias ×4 del composer se lleva unos 5 ms y el resplandor unos 3.
- **Más de la mitad de los triángulos se pintan sin mirar si se ven** (mobiliario, studs y
  trocitos), pero en un Mac eso apenas se nota en el tiempo. En un móvil puede que sí: falta medirlo.
- **La deuda de código está en cuatro archivos y en `main.js`**, que cablea a mano 18 sistemas que
  además se llaman entre sí sin intermediarios.

## 1. Medidas

### Cómo se ha medido

- Chrome sin ventana lanzado con `tools/probe.mjs` contra `npm run dev`, con la gráfica real
  (Apple M3 Pro, ANGLE sobre Metal).
- Ventana de 1440 × 810 a densidad 1,5 (2160 × 1215 píxeles), que es lo que pinta «Altos» en una
  pantalla retina. Partida recién empezada, de día, en la puerta de casa.
- Triángulos y llamadas de dibujo: `renderer.info` con `autoReset = false`, un fotograma.
- Tiempo: media de 24 fotogramas llamando a `game.render()` y forzando a la gráfica a terminar
  cada uno con un `readPixels` de un píxel. Entre repeticiones idénticas baila **±1 ms**: las
  diferencias menores que eso no cuentan.
- Reparto por sistemas: se oculta cada objeto de la escena y se resta.

No se ha medido en ningún móvil ni tableta. Todo lo que sigue vale para un portátil con gráfica
integrada buena; las conclusiones sobre geometría son las que más pueden cambiar en un móvil.

### Qué se pinta

| Escena | Llamadas | Triángulos |
| --- | ---: | ---: |
| Puerta de casa, de día | 210 | 1 014 912 |
| La misma, sin sombras | 147 | 681 846 |
| Plaza de la Villa, de día | 324 | 1 634 104 |
| Puerta de casa, de noche con invasión | 284 | 1 048 510 |

La escena completa tiene 2,66 millones de triángulos, 153 geometrías, 34 texturas y 66 programas
de sombreado. Los ladrillos del pueblo son 111 025 cajas repartidas en 102 sectores.

Reparto del fotograma de la puerta de casa (pasada principal y pasada de sombras por separado):

| Qué | Principal | Sombras | % del total | ¿Se descarta lo que no se ve? |
| --- | ---: | ---: | ---: | --- |
| Ladrillos del pueblo (`lego/batch.js`) | 156 888 | 120 900 | 27 % | Sí, por sectores |
| Mobiliario (`game/props.js`) | 136 696 | 136 696 | 27 % | **No** |
| Studs coleccionables (`game/studs.js`) | 225 216 | 0 | 22 % | **No** |
| Suelo y relieve | 84 947 | 0 | 8 % | Sí |
| Trocitos de ladrillo (`game/bits.js`) | 31 680 | 31 680 | 6 % | **No** |
| Jugador | 15 216 | 15 216 | 3 % | Sí |
| Edificios singulares, vecinos, nubes y resto | ≈ 31 000 | ≈ 28 500 | 6 % | Sí |

Tres mallas instanciadas con `frustumCulled = false` suman **562 000 triángulos, el 55 % del
fotograma**, y se envían enteras siempre:

- Los 1564 studs del pueblo, a 144 triángulos cada uno, estén donde estén.
- Todo el mobiliario del pueblo, dos veces (también proyecta sombra).
- Los 720 trocitos de ladrillo, dos veces, aunque no haya ninguno volando.

### Qué cuesta tiempo

Fotograma base: **≈ 12 ms** (entre 11,0 y 13,9 en una docena de repeticiones).

| Cambio | ms por fotograma | Ahorro |
| --- | ---: | ---: |
| Sin composer (pintando directo, con sombras) | 5,6 | ≈ 6,5 |
| Composer sin antialias ×4 (`samples: 0`) | 5,9 – 6,8 | ≈ 5 |
| Composer en 8 bits en vez de `HalfFloat` | 8,5 – 8,7 | ≈ 3 |
| Sin resplandor (bloom) | 8,1 – 10,4 | ≈ 3 |
| Sin sombras | 9,4 – 11,5 | ≈ 2 |
| Sombra de 2048 en vez de 4096 | 11,0 – 13,1 | no medible |
| Sin studs coleccionables (225 000 triángulos menos) | 11,4 – 13,3 | no medible |
| Sin desenfoque de la pasada final | 10,6 – 14,0 | no medible |
| Canvas sin `antialias` | 11,8 | no medible |

Los ahorros no se suman: antialias, 8 bits y resplandor se solapan (sin antialias, el resplandor
baja a 1–1,6 ms).

Densidad de píxeles, con todo lo demás igual:

| Densidad | Píxeles | ms por fotograma |
| --- | ---: | ---: |
| 1,0 | 1440 × 810 | 9,7 |
| 1,5 | 2160 × 1215 | ≈ 12 |
| 2,0 | 2880 × 1620 | 19,1 |

Y la parte de procesador:

| Qué | ms |
| --- | ---: |
| `update()` (toda la lógica, de día o con invasión) | 0,065 |
| Preparar y enviar el dibujo (`game.render()` sin esperar a la gráfica) | ≈ 1 |

### Qué pesa más

1. **El antialias ×4 del composer** sobre un búfer de coma flotante: unos 5 ms de 12.
2. **El resplandor**: unos 3 ms, y de día trabaja con intensidad 0,1 (`game/env.js:153`), casi
   invisible.
3. **Las sombras**: unos 2 ms. El tamaño del mapa no influye; lo que cuesta es volver a pintar
   333 000 triángulos en 63 llamadas, la mitad de mallas que no se descartan.
4. **La geometría de la pasada principal**: no es el cuello de botella en este equipo. Quitar la
   malla más gorda no mueve el tiempo.
5. **La lógica**: despreciable.

Dos de las sospechas de partida no se han confirmado: bajar la sombra a 2048 no ahorra nada
medible, y quitar el `antialias` del canvas tampoco gana tiempo (solo memoria). Los studs que
pesan no son los de los ladrillos, sino los coleccionables.

## 2. Optimizaciones

Por orden de lo que ahorran según las medidas. Las que cambian el aspecto hay que mirarlas con
`npm run capturas` antes de darlas por buenas.

### O1 · Abaratar el antialias del composer

`src/main.js:247` crea el búfer con `samples: 4` y `HalfFloatType`. Opciones, de menos a más
cambio:

- Probar `samples: 2` en «Altos» y `0` en «Medios». No está medido; debería quedar entre 6 y 12 ms.
- Sustituir el MSAA por una pasada de FXAA o SMAA al final, que cuesta por píxel y no por muestra.
- Dejar el MSAA solo cuando la densidad es 1 (pantallas normales), que es donde más se nota el
  dentado y menos cuesta.

Ahorro esperado: hasta 5 ms por fotograma en «Altos».

### O2 · Resplandor solo cuando se ve

De día la intensidad es 0,1 con umbral 1,0. Desactivar la pasada (`bloom.enabled = false`) cuando
la noche esté por debajo de un umbral y no haya nada que brille (platillo, rayo, turbo) ahorra
unos 3 ms en todas las horas de día.

### O3 · Descartar las tres mallas que se pintan siempre

- **Trocitos** (`game/bits.js`): poner `mesh.count` al número de trocitos vivos. Es una línea y
  quita 63 000 triángulos del fotograma en reposo.
- **Mobiliario** (`game/props.js`): repartirlo por sectores como los ladrillos, o al menos
  calcular su esfera envolvente y dejar que Three lo descarte. Quita hasta 273 000 triángulos
  entre las dos pasadas.
- **Studs** (`game/studs.js`): sectores, o una geometría más barata a distancia (144 triángulos
  por stud es mucho para algo de pocos píxeles).

En el Mac no se va a notar en milisegundos. Se propone igualmente porque el 55 % de los
triángulos sale gratis y en móviles el coste por vértice pesa más; conviene medir antes y después
en un móvil real.

### O4 · Calidad automática que también ajuste la densidad

Hoy (`src/main.js:635`) solo baja un escalón entero de calidad si la media pasa de 1/36 s, nunca
vuelve a subir y se apaga si la URL lleva `q`. La densidad de píxeles es el mando más fino que hay
(de 1,0 a 2,0 el fotograma se duplica): ajustarla en pasos pequeños antes de quitar sombras o
posprocesado daría mejor imagen a igual fluidez.

### O5 · Sombras

No tocar el tamaño del mapa: no ahorra. Lo que sí reduce la pasada es O3 (168 000 de sus 333 000
triángulos son mobiliario y trocitos sin descartar). Si aun así hiciera falta más, actualizar el
mapa de sombras un fotograma de cada dos cuando el jugador va despacio.

### O6 · Arranque: sacar los datos del pueblo del JavaScript

El paquete publicado es un único archivo de 1,57 MB, y 680 KB son `cobena-data.js` y
`cobena-relieve.js`. No afecta a los fotogramas, pero sí a lo que tarda en abrirse en un móvil:
servirlos como recurso aparte (JSON o binario) permite cargarlos en paralelo y que el service
worker los guarde sin volver a bajarlos con cada versión.

### O7 · Una herramienta de medida en el repositorio

Las medidas de este informe salen de guiones sueltos. Conviene dejar un `tools/perf.mjs` con
`npm run perf` que imprima la tabla de «Qué se pinta» y los milisegundos de dos o tres puntos
fijos del pueblo, para comparar antes y después de cada cambio y detectar retrocesos.

### Lo que no merece la pena

- Cambiar de motor por rendimiento: el coste está en píxeles y posprocesado, que cuestan lo mismo
  en cualquiera.
- Optimizar la lógica o pasarla a un worker: 0,065 ms.
- Quitar el `antialias` del canvas: no gana tiempo y «Bajos» lo necesita, porque pinta sin composer.

## 3. Deuda técnica

### R1 · `main.js` lo cablea todo a mano

`src/main.js` (776 líneas) crea 18 sistemas en `init()`, llama a sus `update` uno por uno en un
orden que solo está en el código, toca 14 elementos del DOM por su `id` y lee los parámetros de
la URL. Añadir un objeto o un minijuego de la hoja de ruta obliga a editarlo en tres o cuatro
sitios.

**Propuesta:** un registro de sistemas con una interfaz común (`init`, `update(dt, ctx)`,
`dispose`) y el orden declarado en una lista. `main.js` se queda en arranque, bucle y calidad; el
montaje del render (composer, calidad, `resize`) pasa a un módulo propio.

### R2 · Los sistemas se llaman entre sí a través de `game`

Cada sistema recibe el `Game` entero y entra en los demás. Miembros de `game` que usa cada uno:

| Archivo | Miembros de `game` que toca |
| --- | ---: |
| `aliens.js` | 14 |
| `missions.js` | 12 |
| `items.js` | 11 |
| `wanted.js` | 9 |
| `photo.js` | 7 |
| `folks.js` | 6 |

**Propuesta:** un bus de eventos pequeño para lo que hoy son llamadas cruzadas (`golpe`,
`abducción`, `stud recogido`, `multa`) y un contexto estrecho para lo compartido de verdad
(escena, terreno, sonido, jugador). Empezar por `aliens.js` e `items.js`, que son los que más se
van a tocar con la hoja de ruta.

### R3 · Métodos de cientos de líneas

| Método | Líneas |
| --- | ---: |
| `aliens.js` · `updateAliens` | 316 |
| `folks.js` · `updateJose` | 274 |
| `folks.js` · `nextPlay` | 217 |
| `traffic.js` · `update` | 176 |
| `player.js` · `stepGround` | 176 |
| `aliens.js` · `updateUfo` | 151 |
| `player.js` · `updateVisual` | 143 |
| `wanted.js` · `updateChaser` | 121 |

Son máquinas de estados escritas como un `if` largo. **Propuesta:** un estado por función
(`estado.entrar`, `estado.actualizar`) y una tabla de transiciones, empezando por los marcianos y
el platillo, que es donde la hoja de ruta añade más comportamientos (jefe final, disfrazados,
gorro de aluminio).

### R4 · `folks.js` son muchos vecinos en un archivo

1484 líneas con Yago, Teo, Adrián, Jose y su padre, las corredoras, Iker y Leo, cada uno con su
construcción y su comportamiento. **Propuesta:** `game/folks/` con un módulo por vecino y un
índice que los registra; lo común (marcadores, andar, reacciones) a un módulo compartido.

### R5 · Las pruebas no se ejecutan solas y dependen de un Mac

- Los siete guiones de `tools/` que usan navegador repiten el arranque de puppeteer con la ruta de
  Chrome de macOS escrita a mano.
- `.github/workflows/pages.yml` compila y publica, pero no lanza `test:fisica` ni `test:misiones`:
  un cambio que rompa una misión llega a producción.
- `tools/smoke.mjs` tiene 530 líneas en un solo guion.

**Propuesta:** un `tools/lib/navegador.mjs` compartido con la ruta de Chrome por variable de
entorno, y un paso de pruebas en el workflow antes de publicar (el corredor de GitHub trae Chrome, aunque sin gráfica real: irán más lentas).

### R6 · Ni tipos ni reglas de estilo

No hay ESLint, Prettier ni comprobación de tipos; con 15 000 líneas y objetos que se pasan enteros
de un sistema a otro, los errores de nombre solo aparecen jugando. **Propuesta:** `jsconfig.json`
con `checkJs` y JSDoc en las interfaces de R1 y R2, sin migrar a TypeScript, más ESLint con las
reglas mínimas (variables sin usar, sin definir). Activarlo archivo a archivo a medida que se
trocean.

### R7 · Datos generados dentro de `src/`

`src/world/cobena-data.js` (565 KB) y `cobena-relieve.js` (115 KB) son salida de `npm run datos` y
`npm run relieve`, pero viven junto al código y entran en los diffs y en el paquete. Va unido a
O6: moverlos a una carpeta de datos y cargarlos como recurso.

## 4. Orden de trabajo propuesto

| Paso | Qué | Por qué ahora |
| --- | --- | --- |
| 1 | O7: `npm run perf` | Sin medida repetible no se puede comprobar nada de lo demás |
| 2 | O2 y el `mesh.count` de los trocitos (O3) | Cambios de pocas líneas con ahorro medido |
| 3 | O1: antialias | El mayor ahorro; necesita comparar capturas |
| 4 | R5: pruebas en CI | Red de seguridad antes de mover código |
| 5 | R1 y R2: registro de sistemas y eventos | Desbloquea el resto de la refactorización |
| 6 | R3 y R4: trocear marcianos y vecinos | Sobre las interfaces del paso 5 |
| 7 | O3 (mobiliario y studs), O4 y O6 | Pensando en móviles; medir en uno real |
| 8 | R6 y R7 | Se pueden ir haciendo a la vez que 5 y 6 |

**R2 y R3 se hacen con el multijugador** (decidido el 8 de octubre de 2026): el bus de eventos
nace con destinatario y los métodos largos se parten en simular y pintar, primero en los sistemas
de su fase 2 y luego en los marcianos. El detalle está en `docs/multijugador.md`, «La fase 2 y la
refactorización». R1 y R4 no entran ahí y siguen pendientes por su cuenta.
