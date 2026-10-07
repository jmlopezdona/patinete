# Cobeña · Patinete

Videojuego web en 3D: el pueblo de **Cobeña (Madrid)** reconstruido calle a calle con ladrillos de
juguete para recorrerlo montado en el patinete de las fotos de `fotos_patinete/`. El patinete del
juego está modelado pieza a pieza a partir de esas fotos (largueros azules con agujeros, losetas
grises, guardabarros gris, horquilla blanca en L, conectores negros, columna a rayas y manillar
gris en T).

El callejero es el real: calles, casas, vallas, parques, piscinas y pistas salen de
[OpenStreetMap](https://www.openstreetmap.org) a escala 2 unidades de juego por metro. Cada
personaje empieza la partida en su casa (Jose, en la **calle Río Júcar, 44**), y el skatepark está donde lo están construyendo de
verdad: en la parcela de al lado de la rotonda de la M-103, al final de la calle.

Las cuestas también son las de verdad: el relieve sale del modelo digital del terreno del
[IGN](https://www.ign.es) (LiDAR), a la misma escala. Entre el arroyo y los cerros hay unos 100 m
de desnivel, y calles como las del Olivar o Dalia se notan en las piernas.

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

## Instalar en el móvil

El juego es una aplicación web instalable (PWA): instalado se abre **a pantalla completa, sin la
barra del navegador**, con su icono en la pantalla de inicio.

- **Android (Chrome)**: en el menú principal aparece el botón «📲 Instalar». También vale el menú
  ⋮ del navegador → «Instalar aplicación» o «Añadir a pantalla de inicio». Se abre en horizontal.
- **iPhone y iPad (Safari)**: botón **Compartir** → «Añadir a pantalla de inicio» (el menú del
  juego lo recuerda con un aviso). Ahí la orientación no se bloquea: hay que girar el móvil.
- Después de abrirlo una vez con conexión, **arranca también sin ella**. Cuando hay red siempre se
  carga la última versión publicada.
- El menú enseña la **versión** que se está jugando (`v1.0.N`: los dos primeros números son los de
  `package.json` y `N` los commits que lleva el juego, así que sube sola con cada publicación). El
  juego instalado suele quedarse abierto días sin recargarse; por eso, al abrirlo, al volver a él y
  al pausar pregunta si hay algo más nuevo y, si lo hay, un platillo lo avisa en el menú y en la
  pausa con un botón para actualizar.

Hace falta servirlo por HTTPS (GitHub Pages lo hace) o desde `localhost`. El service worker solo
se registra en la versión compilada (`npm run build` y `npm run preview`), no con `npm run dev`.

## Controles

| Acción | Teclado | Mando |
| --- | --- | --- |
| Conducir | `W` `A` `S` `D` o flechas | Stick izquierdo, gatillos |
| Saltar | `Espacio` | A |
| Turbo | `Mayús` | B |
| Truco del personaje (en el aire) | `F` | X |
| Giros en el aire | `A` / `D` | Stick |
| Backflip / frontflip | pulsar `S` / `W` en el aire | — |
| Empezar minijuego | `E` | Y |
| Día / noche (de noche: ¡marcianos!) | `N` | — |
| Soltarse del rayo abductor | machacar `Espacio` | A |
| Usar el objeto que llevas (timbre sónico) | `Q` | RB |
| Rayo del platillo robado | mantener `Espacio` | A |
| Esquivar al municipal y la zapatilla | `Espacio` justo a tiempo | A |
| Cámara cerca / lejos | `C` | Select |
| Color del vehículo | `V` | — |
| Modo foto | `T` | — |
| Recolocarse | `R` | — |
| Sonido | `M` | — |
| Pausa | `Esc` | Start |

Para hacer *grind*, salta y cae sobre una barandilla del skatepark.

## Personajes

En el menú principal (o con «Personaje» en la pausa) se elige quién sale a la calle. Cada uno
sale de su casa, lleva su vehículo y se conduce distinto:

| | Personaje | Su casa | Vehículo | Cómo va | Su truco (`F` en el aire) |
| --- | --- | --- | --- | --- | --- |
| 🏀 | **Jose** | Calle Río Júcar, 44 | Patinete | El de siempre: equilibrado | Tailwhip |
| 🥁 | **Adrián** | Calle Libertad, 17 | Monopatín | Gira fino y tiene buen ollie. Se impulsa con el pie y luego va de lado | Kickflip |
| 🤹 | **Yago** | Calle Río Guadiana, 17 | Monociclo | Gira sobre una moneda y salta más que nadie, pero corre menos | Pirueta |
| 🧤 | **Teo** | Avenida Río Guadalquivir, 39 | Bicicleta | Más velocidad punta y buenos saltos | Tailwhip |
| 🤳 | **Emma** | No vive en Cobeña: la puerta del parque El Palmeral | Patines | Arranca y gira como nadie; con turbo se agacha con las manos a la espalda | Espagat |
| ⚡ | **Iker** | No para en casa: una calle cualquiera, distinta cada vez | Patinete eléctrico | El que más corre, sin dar una patada; a cambio pesa, y salta y gira peor | Tailwhip |
| 🎾 | **Leo** | La puerta del centro de salud (el consultorio local) | Patinete | De blanco de arriba abajo. Un patinete de calle de los de toda la vida (tabla baja, ruedas pequeñas y manillar en T), más ligero que el de Jose: arranca antes y salta más, con algo menos de punta | Tailwhip |

Al elegirlo en el menú, el personaje aparece en la puerta de su casa; en la pausa se cambia sobre
la marcha, sin moverse del sitio. «Volver a casa» y el castigo de la abuela llevan a la casa del
que se lleve en ese momento.

A Emma, que viene de fuera, la trae su padre: al elegirla en el menú el monovolumen gris oscuro
llega por la avenida Río Guadalquivir y para junto a la puerta del parque El Palmeral, enfrente de
la Pista Polideportiva; ella se baja con los patines puestos y, al empezar la partida, el padre se
despide con la mano y sigue avenida adelante. Su «casa» es esa puerta.

Iker no sale de ninguna casa: al elegirlo en el menú aparece en un punto al azar del callejero, en
mitad de una calle y por su carril, y ese punto hace de «casa» hasta que se le vuelve a elegir o se
pulsa «Volver a casa», que lo manda a otra calle.

Leo sale de la puerta del centro de salud, de espaldas a la fachada del cartel, y allí vuelve con
«Volver a casa».

Mientras llevas a un personaje, su doble desaparece del pueblo: Yago deja libre la pista de circo,
la batería de Adrián se queda sola y callada, a Teo lo sustituye otro portero, Emma deja de
hacerse selfies en el parque, Iker ya no se cruza contigo por las calles, la pista de tenis se queda vacía, sin Leo ni su
máquina, y el padre de Jose se queda tirando
solo a canasta, sin Jose. El color de
cada vehículo se cambia con `V` y se guarda por separado.

## Qué hay en Cobeña

- **Las casas de los personajes**: Río Júcar, 44; Río Guadiana, 17; Río Guadalquivir, 39 y Libertad, 17.
  Llevan cartel con el número y banderín, y la del que se lleva sale marcada en el minimapa.
- **Parque El Palmeral**, pegado a Río Júcar, 44: su puerta, con arco y palmeras, está en el lado
  que da a la Pista Polideportiva, con la avenida Río Guadalquivir por medio.
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
- **Cuestas**: cuesta abajo el patinete coge velocidad sin empujar (y pasa de su punta), cuesta
  arriba le cuesta más y corre menos; el turbo ayuda. Parado no se va solo: se aguanta con el pie.

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
- **Rescate de vecinos**: cuando no va a por ti, el platillo se lleva a un vecino, un coche o
  una de las vacas del campo del Mega Salto (🆘 en el minimapa). Mientras lo sube, el rayo no te
  coge: **salta y crúzalo por el aire** para cortarlo. El platillo se queda aturdido, tú con el
  turbo lleno y, al echar la oleada, cada rescate suma premio. Si llegas tarde, se lo queda dentro
  hasta que se marche.
- **Róbale el platillo**: cuando se queda atontado (al soltarte del rayo, al rescatar a alguien o
  con un timbrazo) baja casi hasta el suelo. Ponte debajo, **salta** y dale un coscorrón en la
  panza; el contador 🛸 lleva la cuenta. Al tercero el piloto sale por los aires y el rayo te sube
  a ti a los mandos: durante 40 segundos se conduce igual que el patinete y, con `Espacio`
  pulsado, el rayo se traga a los marcianos que pilla debajo (cuentan para la oleada) y, de paso,
  a los vecinos, los coches y las vacas, que vuelven a su sitio al acabar el paseo. Los marcianos
  huyen del platillo en cuanto lo ven en tus manos.
- **Timbre sónico** 🔔: durante la invasión aparece uno en alguna calle cercana (sale en el
  minimapa). Se recoge pasando por encima, se lleva encima y se gasta con `Q`: los marcianos de
  alrededor se quedan unos segundos tontos perdidos, dando vueltas y viendo las estrellas, y
  entonces el culetazo vale por cualquier lado. Si el platillo anda cerca, también se atonta.
- Cada noche hay que echar a una **oleada** (8 marcianos la primera, 4 más cada vez). Al
  conseguirlo el platillo huye, amanece y te llevas el premio. No hay «game over».
- Los puntos verdes del minimapa son marcianos; el 🛸, el platillo. Durante los minijuegos se esconden.

### Nivel de búsqueda

Romper mobiliario da studs, pero también calienta el ambiente. Cinco destrozos seguidos (atropellar
peatones también cuenta) y aparece la primera estrella bajo el minimapa:

| Estrellas | Qué pasa |
| --- | --- |
| ★ | Sale el **policía municipal** a pie, pitando y dando el alto. Si te toca, **multa** de 200 studs |
| ★★ | Aprieta el paso y la multa sube (200 por estrella) |
| ★★★ | Saca su **patinete oficial** con rotativo azul: corre casi tanto como tú y ataja por otras calles. Si te pilla, acabas en la puerta de la **Policía Local** |
| ★★★★ | Va tan rápido como tú sin turbo. Último aviso |
| ★★★★★ | Llaman a **la abuela**, que corre más que nadie y lanza **la zapatilla**: teledirigida y con vuelta, como un bumerán. Zapatillazo = castañazo, 500 studs requisados y **castigado a casa** |

- Cada estrella cuesta cuatro destrozos más. Sin estrellas, lo roto se va olvidando solo.
- **Esquinazo**: aléjate hasta que te pierdan de vista y aguanta unos segundos sin romper nada (las
  estrellas parpadean). Se van… y te llevas un premio mayor cuantas más estrellas tuvieras.
- Si doblas una esquina **siguen tu rastro**; lo que no saben es saltar vallas.
- **Sáltalos**: pasar por encima del municipal o de la abuela los deja descolocados un momento (y
  puntúa). La zapatilla también se esquiva saltando cuando avisa «¡Zapatilla va!», o con un quiebro.
- En el minimapa son el 👮 y la 👵. Durante los minijuegos hay tregua.

### Vecinos con nombre propio

| | Quién | Dónde | Qué hace |
| --- | --- | --- | --- |
| 🤹 | **Yago** | Skatepark nuevo, en su pista de circo | Monociclo, malabares, piruetas y reverencia. Si te le echas encima, te salta con una voltereta |
| 🧤 | **Teo** | Pista Polideportiva | El portero de «Chut a Puerta»: rizos, gafas redondas y la camiseta de Argentina con sus tres estrellas |
| 🥁 | **Adrián** | Entrada de la Plaza de la Villa, de cara a la fuente | Doble bombo y flequillo a tazón. Cuanto más te acercas, más suena |
| 🏀 | **Jose** y el **Padre de Jose** | Pista de baloncesto más cercana a Río Júcar, 44 | Padre e hijo echando unas canastas: rueda de pases (de pecho y picados), pase y corte, alley-oops, mates colgándose del aro, triples y entradas. No las meten todas, y los canastones se celebran. Si llevas tú a Jose, su padre se queda tirando solo |
| 🏃‍♀️ | **Ana, Cintia y Bea** | Parques de al lado de Río Júcar, 44 | Footing en grupo dando la vuelta a los dos parques |
| 🤳 | **Emma** | Parque El Palmeral, pasada la puerta | Selfies sin parar, con sus patines: posa, dispara, mira la foto y cambia de ángulo, rodeada de corazones. Si te acercas, se gira para sacarte de fondo |
| ⚡ | **Iker** | Por todo el pueblo, sin parar | Da vueltas por las calles con su patinete eléctrico, por su carril y eligiendo camino en cada cruce. Corre más que los coches; si te tiene delante, frena y toca el timbre |
| 🎾 | **Leo** | Pista de tenis | De blanco y con su raqueta, pelotea contra una máquina lanzapelotas: corre a por cada bola, la devuelve de derecha por encima de la red… y alguna se le queda en ella |

Todos salen en el minimapa con su icono.

### Modo foto

Pulsa `T` (o «📷 Modo foto» en la pausa) y **el tiempo se para**: en pleno backflip, con los
ladrillos de un castañazo en el aire o con la zapatilla de la abuela a medio vuelo. La cámara
queda libre para buscar el encuadre.

| Qué | Ratón y teclado | Táctil |
| --- | --- | --- |
| Girar alrededor del personaje | arrastrar | un dedo |
| Acercar y alejar | rueda | pellizco |
| Desplazar el encuadre | botón derecho (o `Mayús` + arrastrar), `W` `A` `S` `D` | dos dedos |
| Subir y bajar | `E` / `Q` | dos dedos |
| Esconder los controles | `H` (cualquier clic los devuelve) | «Ocultar» (un toque los devuelve) |
| Volver al encuadre inicial | `R` | «Restablecer» |
| Hacer la foto | `Espacio` | «📸 Hacer foto» |
| Salir | `Esc` o `T` | «Salir» |

- **Ajustes**: zoom, inclinación del horizonte, desenfoque de maqueta, viñeta y cinco **filtros**
  (normal, vivo, blanco y negro, sepia y retro). También se puede hacer de noche (`N`), quitar al
  piloto y su vehículo para fotografiar solo el pueblo, y quitar el sello.
- La foto se pinta **más grande que la pantalla** (2560 px de lado largo; 1920 en el móvil) y lleva
  un **sello** con el logo y el nombre de la calle. Sale una vista previa con «Guardar» (JPG) y, donde el
  navegador lo permite, «Compartir». En el móvil también se guarda con una pulsación larga.
- La cámara no se aleja más de unas calles del personaje ni se mete bajo tierra. Al salir, la
  partida sigue exactamente donde estaba; si entraste desde la pausa, vuelves a la pausa.

### Minijuegos (acércate al icono y pulsa `E`)

| | Minijuego | Dónde | Objetivo |
| --- | --- | --- | --- |
| 🏁 | Gran Premio de Cobeña | Calle Río Júcar, delante del 44 | Vuelta al barrio de los ríos contrarreloj |
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
  masivo, constructor de piezas, patinete, minifiguras y modelos. `vehicles.js` añade el monopatín,
  el monociclo, la bici y el Tesla.
- `src/world/` — `cobena-data.js` (callejero ya procesado), `cobena.js` (suelo por capas, calles,
  casas, vallas y mobiliario), `landmarks.js` (skatepark y demás lugares especiales) y `terrain.js`
  (terreno analítico: rampas, quarter pipes, bowls… que usa la física).
- `src/world/relief.js` — el relieve (`cobena-relieve.js` son las cotas ya procesadas). El juego
  sigue razonando en plano, con las alturas medidas desde el suelo, y el relieve se suma al
  dibujar: `lift(x, z)` da la cota del terreno. El suelo se tiende sobre él, cada edificio se
  asienta a la cota de su fachada con un zócalo, las vallas bajan a escalones y, justo antes de
  pintar, cada objeto y la cámara suben a su cota (`Game.render`). El patinete solo lo nota como
  pendiente. Donde hay rampas, pistas o porterías el terreno se allana, así los minijuegos y el
  skatepark funcionan igual que en llano.
- `src/game/` — jugador y física arcade, cámara, studs, escombros, tráfico, minijuegos,
  entorno día/noche, HUD y minimapa. `aliens.js` lleva la invasión (marcianos, platillo, rayo,
  rescates y el robo del platillo), `items.js`, los objetos que se recogen por la calle y se gastan
  con `Q` (de momento, el timbre sónico), `cows.js`, las vacas que pastan junto al Mega Salto,
  `folks.js`, los vecinos con nombre, y `wanted.js`, el nivel de búsqueda (el municipal, la abuela
  y la zapatilla). `walker.js` es el paso a pie que comparten marcianos y perseguidores.
  `characters.js` define los personajes elegibles y sus estadísticas (sus casas y puntos de salida
  van en el callejero, en `places.homes`; la puerta del parque de Emma la pone `landmarks.js` y el
  punto al azar de Iker sale de `world/streets.js`, el grafo de calles por el que también circula; la
  puerta del centro de salud de Leo y su pista de tenis las pone también `landmarks.js`), y
  `dropoff.js` es el coche que la trae. `photo.js` es el modo foto:
  cámara libre, filtros (van en la pasada final de `main.js`) y la captura a mayor resolución.
- `src/core/` — entrada (teclado, mando, táctil), audio sintetizado con WebAudio y utilidades.
  `install.js` registra el service worker y pone el botón de instalar, y `update.js` enseña la
  versión y avisa cuando se ha publicado otra (compara con el `version.json` que escribe
  `vite.config.js` al compilar).
- `public/` — `manifest.webmanifest` (nombre, iconos, pantalla completa y horizontal) y `sw.js`,
  el service worker: la red manda siempre que la hay y lo ya cargado queda guardado para jugar sin
  conexión. Los iconos de `public/icons` se dibujan con `npm run iconos`.
- `tools/` — utilidades de desarrollo que abren el juego en Chrome sin cabeza para simular la
  física, recorrer los minijuegos y sacar capturas (necesitan `npm run dev` en marcha y Google
  Chrome instalado en la ruta habitual de macOS). `npm run test:misiones` también prueba la invasión,
  a los vecinos, el nivel de búsqueda y el modo foto, y `node tools/probe.mjs '<js>' [captura.png]` evalúa una
  expresión dentro del juego (o un guion entero con `node tools/probe.mjs @guion.js`).

### Regenerar el callejero y el relieve

```bash
npm run datos                   # reprocesa la descarga guardada en tools/.cache
npm run datos -- --descargar    # vuelve a pedir los datos a OpenStreetMap (Overpass)
npm run relieve                 # reprocesa el relieve guardado en tools/.cache
npm run relieve -- --descargar  # vuelve a pedir el modelo del terreno al IGN
```

`tools/osm-cobena.mjs` convierte los datos en bruto en `src/world/cobena-data.js`: ajusta cada
edificio a un rectángulo, estrecha las calles según el hueco real entre fachadas, quita las vallas
que cortarían el paso y calcula los circuitos de los coches, los paseos de los peatones y la carrera.

`tools/relieve-cobena.mjs` descarga el MDT05 (una cota cada 5 m) del servicio WCS del IGN, lo
suaviza y lo deja en `src/world/cobena-relieve.js` como una rejilla de cotas cada 20 m, con el
cero en la puerta de casa. Si cambian los límites del mapa en el callejero, hay que regenerarlo.

Datos del mapa © colaboradores de OpenStreetMap, bajo licencia ODbL.
Relieve: MDT05 2015-2021 CC-BY 4.0 [scne.es](https://www.scne.es).
Juego de fans sin relación con ninguna marca de juguetes.
