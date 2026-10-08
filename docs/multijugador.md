# Multijugador en red · diseño, plan y estado

Escrito el 8 de octubre de 2026 sobre el commit `169d849` y **puesto al día ese mismo día sobre
`730ec42`**, con el prototipo de conexión ya hecho. Primero va qué es la función y cómo se juega,
luego la arquitectura de red, después los cambios de código uno por uno y al final el plan de
implementación, los riesgos y las decisiones que quedan abiertas.

Las cifras de código (llamadas, líneas) están contadas sobre `730ec42`. De las de red, **las del
estado de un jugador ya son reales** (salen de `src/net/protocol.js`); las del mundo compartido
(marcianos, tráfico…) siguen siendo **estimaciones sin medir**, porque ese mundo todavía no viaja.

## Resumen

- **Qué es.** Varios amigos, cada uno en su casa y con su dispositivo, patinan a la vez por el
  mismo Cobeña. Cada uno lleva un personaje distinto y caben tantos como personajes hay: hoy 7
  (`CHARACTERS` en `src/game/characters.js`).
- **Sin backend propio.** Uno crea la partida y su navegador hace de servidor de los demás, por
  WebRTC. Solo hace falta un servicio ajeno para que los navegadores se encuentren al empezar.
- **Quién simula qué.** Cada jugador simula a su personaje; el anfitrión simula el mundo
  compartido (marcianos, platillo, nave nodriza, tráfico, municipal, gallinas, meteoritos,
  objetos) y lo reparte.
- **El trabajo no está en la red, está en el juego.** Los sistemas dan por hecho que hay un solo
  jugador y mezclan simulación con HUD, sonido y partículas. Separar eso es el grueso.
- **Dónde estamos.** **La fase 1 está hecha y probada entre redes**: anfitrión en un ordenador
  con Chrome por cable y invitado en un móvil con Edge por 4G, fluido. Hay transporte, protocolo,
  jugadores remotos, sala («Jugar con amigos», con código, enlace y personajes sin repetir),
  partida sin pausa y prueba automática. **La fase 2 está empezada**: el reloj y el día y la
  noche ya son los del anfitrión (C8), el mobiliario roto es el mismo para todos y está hecho el
  mecanismo para que lo que decide el anfitrión se vea, se oiga y le pase a quien toca (la base
  de C9 y C10). Se hace junto con la parte de la refactorización que se
  solapa con ella y sistema a sistema; el orden está en el [plan](#4-plan-de-implementación).

## 1. La función

### Cómo se juega

1. En el menú, además de «Jugar», hay **«Jugar con amigos»**, con dos opciones: crear partida o
   unirse a una.
2. Quien crea la partida recibe un **código de sala** corto (por ejemplo `KTRM`) y un enlace
   (`…/?sala=KTRM`) para mandar por WhatsApp. En el móvil, el botón de compartir del sistema.
3. Quien se une escribe el código o abre el enlace. Entra en la sala y ve qué personajes están
   cogidos: sus botones salen desactivados con el icono de quien los lleva.
4. Cada uno elige personaje. El anfitrión pulsa «Empezar» y todos salen **cada uno de su casa**
   (`world.places.homes[id]`, que ya es por personaje).
5. Se puede entrar con la partida empezada mientras queden personajes libres.

No hacen falta apodos: como no se repiten personajes, **el personaje es el nombre del jugador**
(«Adrián ha entrado en la partida»). Así tampoco hay texto escrito por usuarios viajando por la red.

Todo esto ya funciona así. Lo único que no es como se describe: el botón de compartir del
sistema sale donde el navegador lo tiene, y donde no, copia el enlace.

### Qué se comparte y qué no

| Cosa | En red | Detalle |
| --- | --- | --- |
| Los demás jugadores | Compartido | Se les ve patinar, saltar, hacer trucos y darse castañazos, con su nombre encima y su icono en el minimapa. **Ya funciona** |
| Día y noche | Compartido | Cualquiera puede hacer de noche con `N`; sale un aviso de quién ha sido. **Ya funciona** |
| Invasión marciana | Compartido | Una sola oleada, cooperativa: los culetazos de todos cuentan para el mismo marcador |
| Platillo, rayo y robo del platillo | Compartido | Abduce a un jugador cada vez; lo roba y lo pilota uno |
| Nave nodriza (jefe final) | Compartido | Una sola sobre el half-pipe; los coscorrones de todos suman y sus bombas de baba caen para todos |
| Robo de la estatua | Compartido | La recupera el que le dé el tercer culetazo; el premio es para todos |
| Marcianos disfrazados | Compartido | Los mismos vecinos con antena en todas las pantallas; el que eches le falta a la oleada de todos |
| Baba verde | Compartido | Resbala y rebota cualquiera |
| Lluvia de meteoritos | Compartido | Las mismas dianas y los mismos cráteres; el meteorito del fondo, para el primero que baje |
| Tráfico y peatones | Compartido | Los coches frenan y atropellan a cualquiera |
| Municipal y abuela | Compartido | Un solo nivel de búsqueda para la pandilla (decisión abierta D1) |
| Gallinas | Compartido | Si uno atropella a una, persiguen al que la ha atropellado; los demás las ven correr |
| Mobiliario que se rompe | Compartido | Si uno revienta un banco, los demás lo ven roto. **Ya funciona** |
| Objetos (timbre, gorro, cohete) | Compartido | El que sale por la calle es uno para todos; se lo queda quien llega antes |
| Vecinos con nombre | Compartido a medias | Faltan del pueblo los que lleva algún jugador; sus animaciones van por libre en cada pantalla |
| Studs y ladrillos dorados | Personal | Cada uno recoge los suyos y los guarda en su progreso |
| Minijuegos | Personal | Cada uno juega el suyo; mientras tanto ni marcianos ni municipal le hacen caso |
| Selfie con Emma, seguir a las mamás | Personal | Emma y las corredoras se animan por libre en cada pantalla, así que no hay nada que repartir |
| Estrellas, récords, colores | Personal | Siguen en el `localStorage` de cada uno |
| Calidad gráfica, sonido, cámara | Personal | |

### Lo que cambia respecto a jugar solo

- **No hay pausa de verdad.** El menú de pausa se abre, pero el mundo sigue. Tu personaje se
  queda quieto y, mientras tengas el menú abierto, nadie te persigue.
- **No hay modo foto ni seguir a las mamás.** Los dos paran el tiempo, y en red no se puede:
  sus botones y la tecla `T` desaparecen mientras dura la partida (decisión D3).
- **Cambiar de personaje a mitad de partida** solo deja elegir entre los libres.
- **Teo deja la portería** del Chut a Puerta en cuanto alguien lo lleva, igual que ahora.
- **Si el anfitrión se va, la partida se acaba** para todos. Nadie pierde progreso: cada uno
  guarda lo suyo.

### Fuera de alcance por ahora

- Dos jugadores en el mismo dispositivo (pantalla partida).
- Jugar contra desconocidos: no hay salas públicas ni emparejamiento, solo código.
- Medidas contra trampas: el anfitrión y cada jugador pueden mentir sobre su estado.
- Chat de texto o de voz.
- La idea del ROADMAP de que un jugador **pilote el platillo contra los demás**: encaja encima de
  esto como modo aparte, pero no forma parte de esta función.
- Que otro jugador herede la partida si el anfitrión se cae.

## 2. Arquitectura de red

### Topología

Estrella: los invitados se conectan solo al anfitrión. Con 7 jugadores son 6 conexiones en el
anfitrión y 1 en cada invitado. El estado de un invitado llega a los demás reenviado por el
anfitrión dentro de su foto.

```
 invitado ─┐
 invitado ─┼── anfitrión (simula el mundo)
 invitado ─┘
```

### Encontrarse y conectar

| Pieza | Para qué | Con qué |
| --- | --- | --- |
| Señalización | Que dos navegadores intercambien el saludo inicial | El broker público de PeerJS; el código de sala es el identificador del anfitrión (`cobena-KTRM`) |
| STUN | Atravesar el router de casa | Los públicos de Google y Cloudflare (`ICE` en `src/net/transport.js`) |
| TURN | Retransmitir cuando la conexión directa no sale (datos móviles, redes de empresa) | La cuenta gratuita de ExpressTURN (`free.expressturn.com`, por UDP y TCP), con las credenciales en el código. Los que PeerJS trae puestos (`eu-0` y `us-0.turn.peerjs.com`) ya no existen: sus nombres no resuelven |

El juego se publica en GitHub Pages, que ya sirve por HTTPS, que es lo que WebRTC necesita. El
service worker no estorba: `public/sw.js` solo intercepta peticiones `GET` del mismo origen.

PeerJS (87 kB, 23 kB comprimido) va en un trozo aparte que solo se descarga al abrir una partida
en red: jugar solo no carga nada nuevo.

Todo esto queda detrás de una interfaz de transporte (cambio C1), de modo que cambiar PeerJS por
otra cosa, o por un transporte local para las pruebas, no toca el resto.

### Lo que ha enseñado el prototipo

- **El «no fiable» de PeerJS no sirve tal cual.** `connect(id, { reliable: false })` crea el canal
  con `ordered: false` y nada más: deja de ordenar, pero sigue reenviando lo que se pierde. Para
  el estado, que caduca en 50 ms, eso es justo lo que no se quiere. Solución: PeerJS abre la
  conexión y lleva el canal fiable, y **el canal sin garantías se crea aparte sobre la misma
  conexión** (`conn.peerConnection.createDataChannel(…, { negotiated: true, id: 50, ordered: false,
  maxRetransmits: 0 })`). Al ir negociado de antemano con el mismo número en los dos lados no
  hace falta más señalización ni pisa el manejador `ondatachannel` de PeerJS.
- **Sin TURN, por datos móviles no se entra.** Primera prueba fuera de casa: un móvil con datos
  contra un anfitrión con fibra, y no conectó. Los TURN que PeerJS trae de serie están muertos
  (comprobado: no resuelven por DNS y no dan ningún candidato de retransmisión), así que solo
  había STUN, y eso no basta en redes que cambian de puerto con cada destino. La lista de
  servidores es ahora nuestra (`ICE`), con dos STUN y el TURN de ExpressTURN. Con `?ice=relay`
  se obliga a ir solo por él: así pasa entera la prueba automática
  (`RED=peer ICE=relay npm run test:red`). Repetida la prueba con el móvil por 4G: conecta y va
  fluido.
- **El modo `raw` de PeerJS sí manda el texto sin envolver**, así que el JSON lo hace la sesión y
  los dos transportes llevan exactamente lo mismo.
- **Probado por WebRTC de verdad**, con el broker público, entre ventanas del mismo equipo
  (`RED=peer npm run test:red`). Lo que eso **no** prueba es atravesar dos routers distintos.
- **Una pestaña tapada no pinta, pero puede seguir calculando.** El navegador le para los
  fotogramas y frena sus temporizadores a uno por segundo, pero no los de un worker. Con la
  página oculta, un worker hace de metrónomo (un mensaje cada 16 ms) y el juego se calcula y
  envía al oírlo, sin pintar. Probado con la ventana del anfitrión minimizada: sigue a 60 pasos
  por segundo y los invitados lo ven moverse. **No vale para un móvil con la pantalla bloqueada
  o la app en segundo plano**, donde el sistema congela la página entera, y está sin probar en
  Safari y con el ahorro de energía de Chrome (riesgo R3, cambio C6).

### Quién tiene la autoridad

| Sobre qué | Manda | Por qué |
| --- | --- | --- |
| El personaje de cada uno (posición, velocidad, trucos) | Su dueño | Los controles responden al instante, sin esperar al anfitrión |
| Cosas quietas contra las que choca un jugador (mobiliario, studs, ladrillos, charcos de baba, cráteres) | El jugador que choca, que lo avisa | No se mueven: no hay desfase que resolver |
| Todo lo que se mueve solo (marcianos, platillo, nave nodriza y sus bombas, ladrón, meteoritos, coches, peatones, municipal, abuela, zapatilla, gallinas) | El anfitrión | Hace falta una sola verdad |
| Reloj, día y noche, oleada, nivel de búsqueda, objeto en la calle | El anfitrión | Ídem |
| Un jugador **mientras lo tiene el platillo** (`held`) o va montado en él | El anfitrión | Hoy ya es el platillo quien mueve su posición |

Los choques entre un jugador y algo que se mueve los decide el anfitrión con la posición que le
llega de ese jugador. Es lo que menos código cambia, porque los sistemas ya reciben un `p` con
`pos` y `vel` y les da igual que sea local o remoto; el precio es un desfase que se trata en
riesgos (R1).

Como solo el anfitrión ejecuta la lógica del mundo, **el juego no tiene que ser determinista**:
los 164 `Math.random()` del juego se quedan como están.

### Canales y mensajes

Dos canales por conexión: uno **sin garantías** para el estado, que caduca enseguida, y otro
**fiable y ordenado** para lo que no se puede perder.

| Mensaje | Sentido | Canal | Cadencia | Lleva | Estado |
| --- | --- | --- | --- | --- | :---: |
| `hola` | invitado → anfitrión | fiable | al entrar y al cambiar de personaje o color | versión del juego, personaje, color | Hecho |
| `sala` | anfitrión → todos | fiable | al cambiar | qué sitio te toca, si la partida ha empezado, y quién está con qué personaje y color | Hecho |
| `mundo` | anfitrión → invitado | fiable | al entrar | estado completo: oleada, estatua, charcos, cráteres, mobiliario roto, abducidos, objeto en la calle. La hora no hace falta: va en cada `foto` | Hecho para el mobiliario roto |
| `yo` | invitado → anfitrión | sin garantías | 20/s | estado de su personaje (38 bytes) | Hecho, sin los contadores de controles |
| `foto` | anfitrión → invitado | sin garantías | 15/s | reloj del mundo, si es de noche y los demás jugadores; más adelante, todo lo que se mueve | Hecho para el reloj, la noche y los jugadores |
| `orden` | anfitrión → un invitado | fiable | cuando pasa | algo que el mundo le hace a su personaje: empujón, castañazo, rayo, lanzamiento, congelar. Va como método de `Player` y argumentos: `{ m, a }` | Hecho el mecanismo, con los cinco métodos que ya había; aún no lo usa ningún sistema |
| `aviso` | jugador → anfitrión → los demás | fiable | cuando pasa | «he roto el banco 12», «he cogido el timbre», «hago de noche». Va como `{ k, v }`: qué y un número; el anfitrión le pone de quién es (`from`) al repartirlo | Hecho para la noche (`noche` y `alba`) y el mobiliario (`rompe` y `arregla`) |
| `efecto` | anfitrión → uno o todos | fiable | cuando pasa | cartel, sonido, partículas, sacudida de cámara, studs de premio. Va como sistema, método y argumentos: `{ s, m, a }` | Hecho el mecanismo; aún no lo usa ningún sistema |
| `adios` | cualquiera | fiable | al salir o al no dejar entrar | motivo: `host`, `bye`, `version`, `full` | Hecho |

`yo` y `foto` llevan una cabecera de 7 bytes: tipo, número de orden (para tirar el paquete que
llega más viejo que el último visto) y el reloj de quien lo manda en milisegundos. La `foto` lleva
detrás 5 bytes del mundo: su hora en milisegundos (`game.time`) y si es de noche.

Las pulsaciones (saltar, truco, acción) viajarán en `yo` como **contadores**, no como «pulsado
ahora»: si se pierde un paquete, el siguiente trae la cuenta al día y no se pierde ninguna. El
anfitrión las necesita porque soltarse del rayo y pilotar el platillo robado se hacen con los
controles (`aliens.update(dt, p, time, inp)`). Todavía no van: hasta la fase 3 nadie las lee.

### El estado de un jugador

Lo que lee `Player.updateVisual` para pintar a alguien, que es justo lo que se manda
(`readState` en `src/game/remote-player.js`, empaquetado en `src/net/protocol.js`):

| Campo | Cómo viaja | Bytes | Para qué |
| --- | --- | ---: | --- |
| `pos` | 3 × coma flotante de 32 bits | 12 | Dónde está |
| `vel` | 3 × entero de 16 bits, en centésimas | 6 | Cabeceo en el aire; más adelante, adelantar los choques (R1) |
| `v` | entero de 16 bits, en centésimas | 2 | Giro de las ruedas, empujones con el pie |
| Giro que se ve (`heading + visYaw + spin`) | ángulo de 16 bits | 2 | Hacia dónde mira, con el coletazo de aterrizar ya sumado |
| `flip + visFlip`, `pitch` | 2 × ángulo de 16 bits | 4 | Volteretas y cuesta |
| `whipT` | 8 bits | 1 | Truco en curso |
| `steer`, `throttle` | 2 × 8 bits con signo | 2 | Inclinarse, girar la cabeza, empujar con el pie |
| `grounded`, `grind`, `boosting`, `crashT > 0`, `sunk`, `hidden`, `invuln > 0`, `held`, ocupado | 16 bits sueltos, 9 en uso | 2 | Postura, turbo, castañazo o chapuzón, oculto (o aún en el menú), parpadeo, en el rayo, a otra cosa |
| | | **31** | |
| `char`, `colorIdx` | en `hola` y `sala` | | No van en cada paquete |

Los giros viajan **como se ven**, no como los lleva la física. Para pintar es lo exacto; cuando
el anfitrión necesite el rumbo real de un invitado (fase 2) habrá que ver si le basta.

### Cuánto pesa

| Qué | Unidades | Bytes aprox. | |
| --- | ---: | ---: | --- |
| Cabecera, reloj del mundo y noche | | 13 | real |
| Jugadores (los otros 6) | 6 | 192 | real: 32 cada uno |
| Marcianos | 9 (`POOL`) | 150 | estimado |
| Platillo, ladrón y estatua | 3 | 60 | estimado |
| Nave nodriza y sus bombas | 1 + 4 | 70 | estimado; solo durante el jefe final |
| Meteoritos | 5 por lluvia | 50 | estimado; solo mientras caen |
| Coches | 16 (8 circuitos × 2) | 130 | estimado |
| Municipal, abuela y zapatilla | 3 | 40 | estimado |
| Gallinas | 7 | 60 | estimado; solo cuando persiguen |
| Peatones | hasta 64 | 130 | estimado: solo su avance por el recorrido |
| **Una `foto`, con todo a la vez** | | **≈ 880** | |

Hoy, que solo viajan jugadores, una `foto` con la sala llena son 205 bytes: unos 24 kbps por
invitado. Con el mundo entero, a 15 por segundo, serían unos 105 kbps por invitado y **unos
630 kbps de subida en el anfitrión** con la sala llena, aunque jefe final, meteoritos y gallinas
no coinciden casi nunca. Una fibra doméstica lo lleva de sobra; unos datos móviles flojos, no. Lo
sensato es que haga de anfitrión quien juegue con ordenador.

### Suavizado

- **Los demás jugadores se pintan con 100 ms de retraso**, interpolando entre los dos últimos
  estados recibidos (`Session.sample`). Es lo que evita los tirones cuando un paquete llega tarde.
  El mundo compartido irá igual.
- **La diferencia entre relojes** se saca del paquete que menos ha tardado en llegar, y se deja
  llevar despacio por si los relojes se separan.
- **Reaparecer no se interpola.** Si entre dos estados hay más de 20 unidades, el jugador salta
  de un sitio a otro en vez de cruzar el pueblo volando.
- **Tu personaje no se interpola**: se pinta donde lo calcula tu propio juego.
- **De invitado a invitado** el estado lleva la hora de la `foto` en la que lo reenvía el
  anfitrión, no la de cuando se midió: hasta 50 ms más de temblor. Si se nota, el anfitrión
  reenviará la hora original pasada a su reloj.
- **Reloj común.** `game.time` mueve muchas animaciones. El anfitrión manda el suyo en cada
  `foto` y el invitado calcula qué hora es allí ahora mismo (`Session.worldTime`). Su `game.time`
  sigue sumando `dt` y se acerca a esa hora poco a poco; si se separa más de un cuarto de segundo
  (al entrar, o tras un parón), salta. Si el anfitrión deja de mandar, el reloj del invitado se
  para con él.

## 3. Cambios de implementación

Tamaño: **P** unas horas, **M** un par de días, **G** una semana o más. Son órdenes de magnitud
para comparar entre sí, no plazos.

| # | Cambio | Archivos | Tamaño | Fase | Estado |
| --- | --- | --- | :---: | :---: | --- |
| C1 | Transporte y protocolo | `src/net/*`, `package.json` | M | 1 | **Hecho** |
| C2 | Sala: crear, unirse, elegir personaje | `index.html`, `style.css`, `lobby.js`, `party.js`, `main.js` | M | 1 | **Hecho** |
| C3 | Jugadores remotos | `remote-player.js`, `party.js`, `player.js`, `main.js` | M | 1 | **Hecho**, sin sonido de los demás |
| C4 | Varios vecinos fuera a la vez | `folks.js`, `missions.js`, `main.js` | P | 1 | **Hecho** |
| C5 | Minimapa y HUD con los demás | `party.js`, `main.js` | P | 1 | **Hecho** |
| C6 | Partida sin pausa | `main.js`, `party.js`, `photo.js`, `watch.js` | P | 1 | **Hecho** |
| C7 | Pruebas con varios navegadores | `tools/red.mjs`, `package.json` | M | 1 | **Hecho** |
| C8 | Reloj, día y noche compartidos | `env.js`, `party.js`, `main.js`, `aliens.js`, `src/net/*` | P | 2 | **Hecho** |
| C9 | Órdenes al jugador en vez de tocarle los campos | `player.js`, `remote-player.js` y los sistemas de cada fase | M | 2 y 3 | Hecha la base |
| C10 | HUD, sonido y partículas con destinatario | `fx.js`, los sistemas de cada fase, `src/net/*` | G | 2 y 3 | Hecha la base |
| C11 | Sistemas para varios jugadores | `traffic.js`, `wanted.js`, `props.js`, `items.js`, `hens.js`, `meteors.js`, `cows.js` | G | 2 | Hecho `props.js` |
| C12 | Simular en el anfitrión, pintar en todos | los mismos, más `src/net/*`; en la fase 3, los de C13 | G | 2 y 3 | |
| C13 | Invasión cooperativa | `aliens.js`, `boss.js`, `heist.js`, `disguise.js`, `slime.js` | G | 3 | |
| C14 | Minijuegos con más gente en el pueblo | `missions.js`, `minigames.js` | M | 3 | |
| C15 | Premios y progreso | `main.js`, `aliens.js`, `boss.js`, `heist.js`, `wanted.js`, `hens.js` | P | 3 | |
| C16 | Caídas, reconexión y versión | `src/net/*`, `main.js`, `core/update.js` | M | 4 | La versión ya se comprueba al entrar |

### C1 · Transporte y protocolo — hecho

Módulo `src/net/`, sin dependencias del resto del juego:

- `transport.js`: `host(code)`, `join(code)`, `send(to, data)`, `close()` y tres avisos
  (`onOpen`, `onClose`, `onData`). No hay parámetro de canal: **un texto va por el fiable y un
  `ArrayBuffer` por el que no da garantías**. Dos implementaciones: `PeerTransport` (PeerJS más el
  canal negociado aparte) y `LocalTransport`, con `BroadcastChannel` entre pestañas del mismo
  navegador, que se elige con `?red=local`: sirve para desarrollar con dos ventanas y para las
  pruebas, sin depender del broker. Los fallos al abrir o entrar son un `Error` con el motivo:
  `no-room`, `taken`, `broker` (no se llega al servicio de salas) o `blocked` (se han encontrado,
  pero entre esas dos redes no hay camino).
- `protocol.js`: los mensajes de la tabla de arriba, el empaquetado de `yo` y `foto` en binario
  (`DataView`) y la mezcla entre dos estados (`mixState`). Lo fiable va en JSON: son pocos
  mensajes y así se depuran a simple vista.
- `session.js`: quién está en la sala y en qué sitio (el 0 es el anfitrión), la entrada y salida
  de jugadores, la cadencia de envío (`yo` a 20/s, `foto` a 15/s) y los estados recibidos de cada
  uno, con su interpolación. No conoce el juego: recibe el estado local ya relleno
  (`update(now, state)`) y devuelve el de los demás (`sample(pl, now, out)`).

La cadencia va aparte de los fotogramas, pero **el envío cuelga del bucle del juego**
(`Game.loop` → `Party.update` → `Session.update`), no de un temporizador. Con la pestaña tapada
ese bucle lo mueve el metrónomo de C6.

Dependencia nueva: `peerjs` 1.5.5, cargada con `import()` solo al abrir una partida en red.

### C2 · Sala — hecho

- `index.html` y `style.css`: botón «Jugar con amigos» y, en su sitio, un panel (`#friends`) con
  dos caras. Sin sala: «Crear partida» y el código para unirse. Con sala: el código en grande,
  «Compartir enlace», quién está y el botón de salir a la calle.
- `lobby.js`: el panel. Al crear genera un código de cuatro consonantes (sin vocales, para que no
  salgan palabras) y prueba con otro si ya está cogido. El enlace es `…/?sala=KTRM`, que al
  abrirlo entra directamente.
- **Quién da la salida.** El anfitrión pulsa «Empezar» y los que esperaban en la sala salen con
  él, cada uno de su casa. Quien llega con la partida empezada ve «Entrar». `sala` lleva si ha
  empezado (`on`).
- **Personajes sin repetir.** Manda el anfitrión (`Session.greet`): si al entrar pides uno que
  ya lleva otro, te da el primero libre; si lo pides después, te quedas con el que tenías. Cada
  uno se entera por la `sala` que recibe (`onMe`), sin mensaje de visto bueno aparte. En el
  menú las tarjetas de los cogidos salen apagadas, y el botón de la pausa (`p-char`) se los salta.
- **Sin estado `'lobby'`.** La sala es el menú con el panel delante: `Game.state` sigue siendo
  `'menu'` o `'play'`. Quien no ha salido a la calle viaja como oculto y los demás no lo ven.
- La pastilla de arriba (`#net`) sigue diciendo la sala y cuántos hay. Si no se puede entrar, o
  el anfitrión se va, el panel dice por qué.
- `?sala=KTRM&anfitrion` sigue creando una partida con ese código exacto: lo usan las pruebas.

### C3 · Jugadores remotos — hecho

- `party.js`: la **pandilla**, la partida en red vista desde el juego. Es un sistema más de
  `Game` (`game.party`, que solo existe si hay sala): abre la sesión, crea y quita los jugadores
  remotos, cuenta a los demás el estado del local y avisa de entradas y salidas. `Game` no ha
  ganado una lista `players`: los remotos viven en `party.remotes`, y esa lista llegará con C11,
  cuando los sistemas tengan que recorrerla.
- `remote-player.js`: `RemotePlayer` hereda de `Player` para reutilizar el muñeco y
  `updateVisual`, pero no ejecuta `update()`: sus campos salen del estado interpolado
  (`apply(s, dt)`). Lleva encima la etiqueta `nameTag` de los vecinos con nombre.
- `player.js`: de `crash()` y `splash()` se ha sacado lo que se ve (`shatter()` y `sink()`: los
  trozos por los aires y el muñeco oculto) de lo que le pasa al jugador local (`game.onCrash()` y
  `game.onSplash()`: cartel, sonido, sacudida de cámara y combo). El remoto solo llama a lo
  primero, así que el castañazo de otro se ve pero no te sale el cartel a ti. `recover()` y su
  `camera3.snap` no se tocan: un remoto nunca pasa por ahí.
- `main.js`: tres enganches. Crear `Party` si la dirección trae `sala`, llamar a
  `party.update(dt)` en cada fotograma (también en el menú y en la pausa) y sumar sus puntos al
  minimapa. `render()` no cambia: ya sube todo lo que cuelga de la escena.

Falta: **no se oye a los demás** (ni saltos, ni turbo, ni castañazos). Hasta que el sonido tenga
posición (C10) es preferible el silencio a oírlos como si fueran tuyos.

### C4 · Varios vecinos fuera a la vez — hecho

- `folks.js`: `setPlayer(id)` es ahora `setAway(ids)`, con un conjunto, y las comprobaciones
  `this.away !== 'leo'` son `!this.away.has('leo')`. La misión del selfie (`missions.js`) también.
- `main.js`: `refreshAway()` junta al jugador local con los amigos de la sala y decide con eso
  los vecinos que faltan, si hay portero (nadie lleva a Teo) y la descripción del Chut a Puerta.
  Se llama al cambiar de personaje y cada vez que cambia la sala.

### C5 · Minimapa y HUD — hecho

- Cada amigo sale en el minimapa con el icono de su personaje, también cuando queda lejos (va en
  la lista de `blips` que ya se le pasa a `draw()`), y las entradas y salidas se avisan con el
  `toast` que ya existía.
- La tira de iconos es la pastilla de arriba (`#net`): la sala y un icono por jugador, apagado
  el de quien aún no ha salido a la calle o está ocupado. No ha hecho falta tocar `hud.js`.

### C6 · Partida sin pausa — hecho

- **La pausa no para el mundo.** En red, con el menú de pausa abierto `Game.loop` sigue llamando
  a `update()`, sin manos en el manillar y sin contar lo que se pulse. El sonido sí se calla.
- **Ocupado.** Un bit del estado (`F.BUSY`) que pone la pandilla cuando el jugador está en la
  pausa, en un minijuego o con la pestaña tapada. Hoy
  solo apaga su icono en la pastilla; en la fase 2 es lo que hará que no le persigan (C14).
- **Con la pestaña tapada la partida sigue.** `Party.keepGoing()` arranca al ocultarse la página
  un worker que solo marca el paso, y cada mensaje suyo llama a `Game.loop(t, true)`, que calcula
  y envía pero se salta `render()` y la calidad automática. Al volver, el worker se suelta y
  manda otra vez `requestAnimationFrame`. En red, tapar la pestaña ya no abre la pausa.
- **Pantalla despierta.** Mientras dura la partida se pide `navigator.wakeLock`, y se vuelve a
  pedir al destapar la pestaña, que es cuando el navegador lo suelta.
- **«El anfitrión está en pausa».** Si un invitado pasa 2 segundos sin `foto`, la pastilla lo
  dice y se pone naranja. Es lo que se ve cuando al anfitrión se le duerme el móvil o cambia de
  aplicación: ahí el sistema congela la página y no hay worker que valga.
- **Sin modo foto ni seguir a las mamás** (decisión D3): `photo.open()` y `watch.open()` no
  hacen nada con partida en red, y `body.net` esconde sus botones y la ayuda de la tecla `T`.

### C7 · Pruebas con varios navegadores — hecho

`tools/red.mjs`, sobre el `puppeteer-core` que ya usan `smoke.mjs` y `shot.mjs`. Script
`npm run test:red`, con `npm run dev` en marcha como las demás. Abre anfitrión, invitado y un
tercero con `?red=local` y comprueba:

- que entran y cada uno ve el personaje del otro, también si lo cambia después;
- que al patinar uno, el otro lo ve ir detrás sin tirones y acabar en el mismo sitio, en los dos
  sentidos;
- que dos invitados se ven entre sí a través del anfitrión, con su nombre encima;
- que con la ventana del anfitrión minimizada su partida sigue y los demás lo ven moverse;
- que la pausa no para el mundo y a quien la abre se le ve ocupado, y que si el anfitrión deja
  de calcular el invitado lo sabe;
- que el banco que rompe uno lo ven roto los demás y quien entra tarde, que los studs son solo
  para quien lo rompe y que lo reconstruye el anfitrión para todos;
- que un cartel para todos, para uno o para quien esté cerca de un sitio sale donde debe y sin
  HTML ajeno, y que un empujón del anfitrión mueve al invitado en su pantalla;
- que el invitado lleva el reloj del anfitrión, que si uno hace de noche lo es para todos y a los
  demás les dicen quién ha sido, y que quien llega tarde se encuentra la noche y el reloj;
- que el castañazo de otro se ve, pero no te saca el cartel;
- que el que se va desaparece, que un código que no existe se explica y que, si se va el
  anfitrión, se acaba la partida;
- la sala desde el menú: crear da un código y un enlace, no se repite personaje, el cogido no se
  puede elegir, el vecino que lleva un amigo falta del pueblo, el invitado espera a la salida,
  quien llega tarde entra directamente y salir de la sala devuelve al menú.

Con `RED=peer npm run test:red` hace lo mismo por WebRTC y el broker público de PeerJS: sirve
para comprobar el transporte de verdad, pero necesita internet y no debería ir en la tanda
habitual.

Cada jugador va en **su ventana**, no en una pestaña: una pestaña tapada por otra deja de
pintar. Con la página oculta, las esperas de puppeteer tienen que ir con `polling` por
temporizador, que por defecto van con fotogramas y no acaban nunca.

### C8 · Reloj, día y noche — hecho

- **La noche.** `env.toggle()` cambia `target` directamente cuando se juega solo. En red pasa por
  `Party.night()`: el anfitrión lo cambia y lo cuenta; el invitado solo manda el `aviso` y el
  cambio le vuelve en la `foto` siguiente, que lleva siempre si es de noche. Por eso quien entra
  tarde se la encuentra sin mensaje aparte. El `aviso` lleva la hora que se pide (noche o día), no
  «cámbiala»: si dos lo pulsan a la vez no se anulan.
- **Quién ha sido.** A los demás les sale «Adrián ha hecho de noche»; al que lo ha hecho, no.
- **El amanecer tras rechazar la invasión** (`aliens.js`, `env.toggle(true)`) va como `alba`: hace
  de día para todos sin decir de quién ha sido. Hasta la fase 3 cada pantalla lleva su invasión,
  así que **el primero que la rechaza hace amanecer a los demás** y sus marcianos se esconden.
- **El reloj.** En los invitados `game.time` sigue al del anfitrión (ver
  [Suavizado](#suavizado)). Al saltar se mueven con él las dos horas que el juego guarda para
  los combos (`lastTrick` y `aliens.lastKick`): `Game.shiftTime(d)`.
- `Session` sigue sin saber del juego: recibe `{ time, night }` del anfitrión en `update()` y lo
  devuelve en `world` y `worldTime(now)`; los avisos son `aviso(k, v)` y `onAviso(pl, k, v)`.

### C9 · Órdenes al jugador

Los sistemas del mundo modifican al jugador por tres vías, contadas fuera de `player.js`:

| Vía | Veces | Dónde sobre todo |
| --- | ---: | --- |
| Asignar campos (`p.held`, `p.v`, `p.boost`, `p.hidden`, `p.frozen`, `p.invuln`, `p.rocket`, `p.foil`, `p.moon`, `p.respawnAt`…) | 69 | `aliens.js` 31, `missions.js` 10, `items.js` 6, `wanted.js` 4, `dropoff.js` 4 |
| Llamar a métodos (`bump`, `place`, `crash`, `launch`, `skid`) | 29 | `missions.js` 7, `folks.js` 5, `wanted.js` 3, `minigames.js` 3 |
| Escribir en `p.pos` o `p.vel` | 26 | `aliens.js` 17, `boss.js` 4, `meteors.js` 2, `wanted.js` 2 |

Son 124; al escribir la primera versión eran 93. Lo nuevo viene de la nave nodriza, los
meteoritos, las gallinas y el robo de la estatua.

Para un jugador remoto, nada de eso puede aplicarse en el anfitrión: tiene que llegarle a su
dueño. El cambio es que **todo pase por métodos de `Player`** (`slow(k)`, `hold()`, `release()`,
`setBoost()`, `hide()`…, además de los que ya hay). En el `Player` local se aplican tal cual; en
el `RemotePlayer` del anfitrión se convierten en un mensaje `orden`.

**Hecha la base.** `RemotePlayer` ya no hereda `bump`, `place`, `crash`, `launch` y `skid` de
`Player`: en el anfitrión se convierten en un `orden` (`Party.order`) y el invitado los ejecuta
sobre su jugador; en un invitado no hacen nada. Los métodos nuevos (`slow`, `hold`…) se añaden a
esa lista (`ORDERS`) con el sistema que los necesite. Todavía no lo usa ninguno: está probado
desde `test:red`.

Mientras `held` es cierto, la posición la manda el anfitrión en la `foto` y el dueño la acata: es
lo que hacen hoy las 17 escrituras a `p.pos` de `aliens.js`.

Lo de `missions.js` (17 de las 124) no hay que tocarlo: las misiones son personales y actúan
siempre sobre el jugador local. Tampoco las 6 de `dropoff.js`, que solo corre en el menú.

### C10 · HUD, sonido y partículas con destinatario

Es el cambio más extendido. Los sistemas del mundo llaman directamente a la presentación:

| Sistema | `hud.` | `sfx.` | `bits.` | `camera3.` |
| --- | ---: | ---: | ---: | ---: |
| `aliens.js` | 45 | 28 | 11 | 10 |
| `items.js` | 22 | 5 | 5 | 2 |
| `wanted.js` | 19 | 13 | 4 | 2 |
| `boss.js` | 18 | 12 | 5 | 7 |
| `heist.js` | 18 | 9 | 4 | 1 |
| `disguise.js` | 10 | 2 | 1 | 1 |
| `hens.js` | 9 | 4 | 1 | 2 |
| `meteors.js` | 9 | 5 | 6 | 1 |
| `slime.js` | 2 | 3 | 5 | 2 |
| `folks.js`, `traffic.js`, `cows.js`, `props.js`, `minigames.js` | 0 | 23 | 4 | 1 |

Son 331 llamadas; eran 221. Tres sistemas enteros son nuevos (`boss.js`, `hens.js`,
`meteors.js`, más `disguise.js`), y cada función que se añada antes de este cambio lo agranda.

Si esos sistemas solo corren en el anfitrión, los invitados no verían ni oirían nada. Cada
llamada tiene que decir **para quién es**:

- `g.to(p).hud.toast(…)`: para un jugador («¡Te ha multado el municipal!»).
- `g.all.hud.big(…)`: para todos («¡Invasión!»).
- `g.at(x, z).sfx.pop()` y `g.at(x, z).bits.burst(…)`: en un sitio; lo oye y lo ve quien esté cerca.

Si el destinatario es el jugador local, se ejecuta en el momento; si no, viaja como `efecto` con
el nombre del método y sus argumentos, que ya son números y textos.

**Hecha la base** (`src/game/fx.js` y `Game.to`, `all`, `at`):

- Jugando solo, y para el jugador local, los tres devuelven el propio `g`: la llamada es la de
  siempre. Para otro jugador devuelven un `g` de pega (`echo`) que recoge sistema, método y
  argumentos y los manda.
- «Cerca» son 140 unidades (`NEAR`). `g.at` no ejecuta nada en la pantalla que queda lejos, ni
  manda el `efecto` a los jugadores que quedan lejos.
- **`g.here(x, z)`** es un cuarto destinatario que no estaba previsto: en un sitio, pero solo en
  esta pantalla. Es para lo que cada pantalla hace por su cuenta al enterarse de algo, como los
  trozos y el ruido de un banco que ha roto otro.
- Al recibir un `efecto` (`play`) solo se ejecutan métodos propios de `hud`, `sfx`, `bits` y
  `camera3`, con argumentos que sean datos sueltos, y a los textos del HUD se les quita el HTML
  que no sea `b`, `i`, `kbd`, `small` o `span` (riesgo R6).
- Solo el anfitrión decide por los demás: en un invitado, `g.to(otro)` no hace nada y `g.all` y
  `g.at` se quedan en su pantalla.
- Todavía no lo usa ningún sistema para mandar nada: está probado desde `test:red`. El primero
  será el claxon de `traffic.js`.

Esto es la propuesta **R2** de `docs/refactorizacion-y-optimizacion.md` (un bus de eventos entre
sistemas) con un requisito más: que el evento lleve destinatario. Conviene hacer las dos cosas de
una vez y no dos refactorizaciones seguidas sobre los mismos archivos.

### C11 · Sistemas para varios jugadores

Cada sistema recibe hoy **un** jugador en `update(dt, p, time)`. En el anfitrión pasa a recibir la
lista y decide a quién mira:

| Sistema | Qué cambia |
| --- | --- |
| `traffic.js` | Los coches frenan si tienen delante a cualquier jugador; atropellos y empujones, contra cada uno |
| `wanted.js` | Un solo nivel de búsqueda (D1). Los destrozos de todos suman; municipal y abuela van a por el más cercano que no esté ocupado; el rastro de migas (`trail`) es el de su objetivo |
| `props.js` | **Hecho.** Cada jugador detecta sus propios choques y manda `aviso` (`rompe`, con el número del mueble); el anfitrión lo reparte, lleva la cuenta atrás y avisa al reconstruirlo (`arregla`), cuando no hay ningún jugador a menos de 30 unidades (`Game.nearest2`). Los trozos salen con la velocidad que llevaba quien lo rompió; los studs y el lío con el municipal son solo para él. Al que entra se le dice cuáles están rotos (`mundo`) |
| `items.js` | El objeto de la calle es uno; lo gana el primer `aviso` que llegue al anfitrión. Gorro, cohete y gravedad lunar (`p.foil`, `p.rocket`, `p.moon`) son del que lo usa. El timbre aturde alrededor de quien lo toca |
| `hens.js` | Persiguen a quien ha atropellado a una (`rage` deja de ser del sistema y pasa a tener dueño); los picotazos le quitan studs a ese jugador |
| `meteors.js` | La lluvia la decide el anfitrión; las dianas apuntan cerca de cualquier jugador (`aim(p)`), y manda por los aires a quien pille debajo. Los cráteres cambian el terreno: tienen que llegar a todos, también al que entra tarde (`mundo`) |
| `cows.js`, `folks.js` | Animación local en cada pantalla; solo los empujones (`p.bump`) son contra el jugador local |
| `studs.js` | Sin cambios: local y personal. Los studs que saltan al romper algo aparecen en la pantalla de quien lo rompió |

Los que «se reconstruyen cuando no miras» (`props.js` espera a que el jugador esté a más de 30
unidades; los studs, a 25) comprueban la distancia al jugador **más cercano**.

Diez sitios dan una tregua mientras hay misión (`g.missions.active` en `aliens.js`,
`disguise.js`, `hens.js`, `items.js`, `meteors.js` y `wanted.js`): en red pasa a ser «ignora al
jugador ocupado» (C14), no «para el sistema».

### C12 · Simular en el anfitrión, pintar en todos

Los `update` de los sistemas hacen dos cosas a la vez: decidir (IA, choques, temporizadores) y
colocar las piezas del modelo. Los invitados necesitan solo lo segundo, alimentado por la `foto`.

Hay que partir cada sistema replicado en `simulate(dt, players)` (solo anfitrión) y
`present(dt)` (todos), con un estado intermedio pequeño y explícito por entidad: posición, rumbo,
estado y el tiempo que lleva en él. Ese estado es lo que se empaqueta.

Coincide con la propuesta **R3** del informe (máquinas de estados con un estado por función): los
métodos que hay que partir son los más largos del juego.

| Método | Líneas |
| --- | ---: |
| `aliens.js` · `updateAliens` | 340 |
| `heist.js` · `updateThief` | 248 |
| `traffic.js` · `update` | 180 |
| `hens.js` · `update` | 170 |
| `aliens.js` · `updateUfo` | 152 |
| `wanted.js` · `updateChaser` | 122 |

Para los peatones no hace falta mandar posición: van por un recorrido fijo (`loop`, `s`) y el
pueblo sale igual en todas las pantallas porque se construye con la misma semilla
(`makeRng(20261007)`). Basta su avance por el recorrido y si están por los aires.

### C13 · Invasión cooperativa

- **Objetivo de cada marciano.** Hoy todos van a por `p`. Cada uno elige jugador (el más cercano
  que no esté ocupado ni en el rayo) y lo revisa de vez en cuando.
- **Combo de culetazos.** `combo` y `lastKick` son de `Aliens`; pasan a ser de cada jugador. El
  marcador de la oleada (`wave.count`) sigue siendo uno.
- **El rayo.** Se lleva a un jugador cada vez, como ahora: `startAbduct(p)`, `take(p)` y
  `updateCarry(dt, p)` ya reciben a quién. Lo que cambia es que `take()` mira `g.home` y
  `g.save.studs`, que son la casa y los studs del jugador local: pasan a ser los del abducido, y
  los studs que le roba le llegan como `efecto`.
- **A quién apunta el platillo.** Hoy persigue a `p`; elige jugador con el mismo criterio que los
  marcianos. `pickVictim(p)`, que escoge vecino, coche o vaca cerca del jugador, mira cerca de
  cualquiera.
- **Rescates.** Además de a los vecinos, se puede rescatar a un amigo abducido: mismo mecanismo
  de `updateRescue`.
- **Robar el platillo.** Los coscorrones (`u.hits`) suman entre todos; lo pilota quien da el
  tercero. `ride` y `mate` guardan a qué jugador corresponde, y sus controles le llegan al
  anfitrión en `yo`.
- **Tamaño de la oleada.** `goal` (ahora descontando los disfrazados que se hayan echado de día,
  `disguise.discount()`) y `POOL` (9 marcianos) están pensados para uno (D2).
- **Tregua por misión.** `aliens.update` para la invasión entera con `g.missions.active`. En red
  la invasión sigue y solo se ignora al jugador ocupado.
- **`boss.js`, la nave nodriza:** una sola para todos. Los coscorrones (`m.hits`) suman entre
  todos; el escudo, las bombas y los refuerzos los decide el anfitrión, y las bombas apuntan a
  cualquiera que esté a tiro (`NEAR`). Las bombas dejan charcos, que van como los de `slime.js`.
- **`disguise.js`, los disfrazados:** qué vecinos llevan antena lo elige el anfitrión (`pick(p)`)
  y va en `mundo`. Se le cae el disfraz a quien lo embista; el marciano que sale corriendo ya es
  un marciano más de `aliens.js`.
- **`heist.js`:** el ladrón huye del jugador más cercano que lo vea (`SEES`), y `hit(p, label)`
  ya recibe quién le da.
- **`slime.js`:** los charcos los crea el anfitrión; resbalar y rebotar lo detecta cada jugador,
  que los charcos están quietos.

### C14 · Minijuegos

- Cada jugador lleva una marca **ocupado** (en un minijuego, en la pausa, con la pestaña
  oculta) que viaja en `yo`. Los que persiguen no eligen a
  un ocupado.
- `wanted.update` hace `reset(true)` si hay misión activa: en red, solo deja de contar al ocupado.
- Carrera, trucos, pizza y **Selfie con Emma** son personales y no tocan nada compartido: siguen
  igual.
- **Bolera y fútbol**, con sus versiones marcianas de noche (Bolos Marcianos y Chut Marciano),
  usan objetos que están en el pueblo (bolos, balón, portero). Mientras alguien juega, el sitio
  queda ocupado para los demás («Adrián está jugando») y es su juego el que simula bolos y balón;
  los demás lo ven por `foto`. Que los bolos y el portero sean marcianos depende de que sea de
  noche, que ya es compartido (C8).

### C15 · Premios y progreso

- `addStuds()` y `save` siguen siendo locales. Los premios de cosas compartidas llegan como
  `efecto` a quien toque: el culetazo, a quien lo da; rechazar la invasión, reventar la nave
  nodriza y recuperar la estatua, a todos.
- **Nivel de invasión** (`save.invasions`): la oleada usa el del anfitrión. Al ganar, cada jugador
  se queda con el mayor entre el suyo y el recién superado.
- **Contadores** (`save.aliens`, `ufos`, `rescues`, `motherships`, `statues`, `spies`, `hens`):
  los sube el sistema que corre en el anfitrión sobre **su** progreso. Pasan a ser un `efecto`
  para quien se lo haya ganado.
- **Studs que te quitan.** Cinco sitios restan de `g.save.studs`, el progreso de quien ejecuta el
  código: la multa del municipal (`wanted.take`), el rayo y los marcianos (`aliens.js`, dos
  sitios), las bombas de la nodriza (`boss.splash`) y los picotazos (`hens.peck`). Todos pasan a
  ser un `efecto` para el jugador al que le toca, que descuenta de los suyos.

### C16 · Caídas, reconexión y versión

- **Versión.** Hecho a medias: `hola` lleva `VERSION` (`core/update.js`) y, si no coincide con la
  del anfitrión, no se entra y se dice por qué. Falta ofrecer el botón de actualizar que ya existe.
- **Invitado que se cae:** hoy su personaje desaparece con un aviso. Falta que, si vuelve con el
  mismo código en un par de minutos, recupere personaje y sitio.
- **Anfitrión que se cae:** los demás se quedan sin amigos, con un aviso si estaban jugando y el
  motivo en el panel. Falta la vuelta al menú, cada uno con su progreso guardado.
- **Sala llena o código que no existe:** hecho; el mensaje sale en el panel de unirse.
- **Sin conexión directa:** a los 25 segundos sin conectar se explica que esas dos redes no
  dejan y que pruebe con wifi. Pasó a la primera con datos móviles, cuando aún no había TURN.
- **Cortes sin despedida.** Hoy uno se entera de que el otro se ha ido porque lo dice
  (`adios`) o porque se cierra el canal, y eso último puede tardar. Falta dar por perdido a quien
  lleve unos segundos sin mandar nada.

## 4. Plan de implementación

### Fases

| Fase | Qué se puede hacer al acabarla | Cambios |
| --- | --- | --- |
| 1 · Verse | Crear sala, unirse, elegir personaje sin repetir y patinar juntos de día. El mundo todavía va por libre en cada pantalla | C1–C7 |
| 2 · Mismo pueblo | Tráfico, municipal, mobiliario, objetos, gallinas, meteoritos y día y noche son los mismos para todos | C8–C12, en `props.js`, `traffic.js`, `wanted.js`, `items.js`, `hens.js` y `meteors.js` |
| 3 · Invasión | La noche de los marcianos en cooperativo, con minijuegos conviviendo | C13–C15, y C9, C10 y C12 en `aliens.js`, `boss.js`, `heist.js`, `disguise.js` y `slime.js` |
| 4 · Aguante | Reconexión, mensajes de error, TURN propio si hace falta | C16 |

La fase 1 es pequeña y casi no toca código existente, pero tiene una limitación a la vista:
**verás a un amigo atravesar un coche**, porque su tráfico no es el tuyo. Aun así va primero: es
la que dice si la conexión entre casas funciona, y si no funciona nada de lo demás importa.

### Orden dentro de la fase 1

No es C1 → C7 por orden: primero lo que valida la conexión, que es el único riesgo que no se
resuelve programando, y la sala bonita al final.

| Paso | Qué | Cambios | Estado |
| :---: | --- | --- | --- |
| 1 | **Prototipo de conexión**: transporte con sus dos implementaciones, `yo` y `foto`, y un jugador remoto que solo se pinta. Sin panel: se entra por la dirección | C1, C3 mínimo | **Hecho** |
| 2 | **Prueba automática** con varias ventanas, `npm run test:red` | C7 | **Hecho** |
| 3 | **Separar en `player.js` lo que se ve de lo que le pasa al jugador local**, para que el castañazo de un amigo no te sacuda la cámara | parte de C3 | **Hecho** (salió con el paso 1) |
| 3b | **Probar entre dos redes**. No es código: es jugar un rato. Ver [cómo](#cómo-probarlo) | — | **Hecho**: ordenador con Chrome por cable y móvil con Edge por 4G, fluido. La primera vez no conectó, no había TURN. Sin probar: Safari, y el anfitrión en un móvil |
| 4 | **Sala de verdad y varios vecinos fuera**: panel, código generado, compartir, personajes cogidos; `folks.setAway(ids)` y el portero | C2, C4 | **Hecho** |
| 5 | **Lo que queda de HUD y la partida sin pausa**: tira de iconos, ocupado, `wakeLock`, «el anfitrión está en pausa» | C5, C6 | **Hecho** |

Con esto la fase 1 está cerrada. Lo que queda suelto es de la fase 4 (reconexión, cortes sin
despedida).

### La fase 2 y la refactorización

Decidido el 8 de octubre de 2026:

- **Se hace junto solo lo que se solapa.** De `docs/refactorizacion-y-optimizacion.md` entran R2
  (el bus de eventos, que es C10 y nace ya con destinatario) y R3 (partir los métodos largos, que
  es el `simulate`/`present` de C12). Quedan fuera R1 (a la fase 2 le basta con cambiar la firma
  de los `update` en `main.js`), R4 (los vecinos se animan por libre en cada pantalla), R5 a R7 y
  todas las optimizaciones.
- **Solo en los sistemas de la fase 2.** `aliens.js`, `boss.js`, `heist.js`, `disguise.js` y
  `slime.js` suman más de la mitad de las 331 llamadas a la presentación, y refactorizarlos ahora
  sería hacerlo sin red que lo pruebe: se quedan como están hasta la fase 3. El precio es que
  mientras tanto conviven dos estilos, y que lo que se añada a los marcianos agranda la fase 3 (R9).
- **Sistema a sistema, cada uno hasta la red** antes de empezar el siguiente, y no C9 → C10 → C12
  → C11 en todos y la red al final. Así, si el formato de `efecto` o el corte entre simular y
  pintar no convence, se descubre con un sistema tocado y no con seis.

| Paso | Qué | Cambios | Estado |
| :---: | --- | --- | --- |
| 1 | **Reloj, día y noche**. No necesita refactorización y estrena el `aviso` | C8 | **Hecho** |
| 2 | **El mecanismo y `props.js` entero**: `g.to(p)`, `g.all`, `g.at(x, z)`, las órdenes al jugador y el `mundo` para el que entra tarde | C9 y C10 (la base), C11 | **Hecho**. `props.js` no ha servido para probar `efecto` ni `orden` con un sistema de verdad: como cada jugador detecta sus choques, no los necesita. Eso queda para el paso 3 |
| 3 | **`traffic.js`**: el primero con `simulate`/`present` y con el mundo en la `foto`. Aquí se mide el peso de verdad (R8) | C11, C12 | |
| 4 | **`wanted.js`, `items.js`, `hens.js` y `meteors.js`**, ya con el patrón probado | C9–C12 | |

Cada paso va en su PR, con el juego de un jugador funcionando igual que antes.

**Cada función nueva del juego agranda lo que queda.** Entre la primera versión de este documento
y la segunda, el juego ganó nave nodriza, meteoritos, gallinas y disfrazados: las escrituras al
jugador pasaron de 93 a 124 y las llamadas a la presentación de 221 a 331. Merece la pena que
lo nuevo que se añada mientras tanto nazca ya con la forma de C9 y C10, en cuanto exista (paso 2).

### Pruebas

C9, C10 y C12 son refactorizaciones del juego de un jugador que hay que dejar funcionando igual
que antes en cada paso; `npm run test:fisica`, `npm run test:misiones` y `npm run test:red` son la red de
seguridad.

Por ahora las pruebas **se pasan en local antes de abrir cada PR**; llevarlas a CI (paso 4 del
informe de deuda técnica) queda para más adelante y no bloquea ninguna fase.

### Cómo probarlo

- **Con dos ventanas del mismo navegador**, sin internet: abrir
  `http://localhost:5173/?red=local` en las dos, crear la partida en una desde «Jugar con amigos»
  y unirse con el código en la otra.
- **Entre dos redes**, con el juego publicado: «Jugar con amigos» → «Crear partida» →
  «Compartir enlace», y el otro abre el enlace. Para probar otra red sin salir de casa, basta
  con que uno de los dos ordenadores se conecte a la wifi compartida de un móvil con datos. La
  pastilla de arriba dice si ha conectado; el icono del amigo sale en el minimapa aunque esté en
  la otra punta del pueblo.
- **Qué mirar:** cuánto tarda en conectar, si el otro se mueve fluido o a saltos, si sigue así a
  los diez minutos, y qué dice la pastilla cuando no conecta.

## 5. Riesgos

| # | Riesgo | Qué se nota | Cómo se trata |
| --- | --- | --- | --- |
| R1 | Desfase en los choques con cosas que se mueven | A 30 unidades/s, 150 ms de retardo son 4–5 unidades: un culetazo que tú ves claro puede no contar, o te atropella un coche que ya habías pasado | El anfitrión adelanta la posición del jugador con su velocidad (que ya viaja en `yo`) antes de comprobar. Si no basta, los culetazos pasan a detectarse en el juego de quien los da (más código en C13) |
| R2 | El anfitrión va lento | `loop()` limita `dt` a 0,05 s: por debajo de 20 fotogramas por segundo el mundo va a cámara lenta para todos | Avisar al crear partida en un equipo justo; la calidad automática ya baja sola |
| R3 | Anfitrión con el juego tapado | En ordenador, cambiar de pestaña o minimizar ya no para la partida (metrónomo con worker, C6). En un móvil, bloquear la pantalla o cambiar de aplicación la congela para todos. Sin probar: Safari y el ahorro de energía de Chrome | `wakeLock`, aviso a los invitados y recomendar que haga de anfitrión quien juegue con ordenador |
| R4 | Redes que no dejan conexión directa | Alguien no consigue entrar. **Ha pasado a la primera con datos móviles** | Mensaje claro y el TURN de ExpressTURN. Con `?ice=relay` se comprueba que sigue vivo. Si se acaba el cupo o alguien abusa de las credenciales, que están a la vista, se cambian o se pasa a Cloudflare con un Worker |
| R5 | Depender del broker público de PeerJS | Si está caído no se pueden crear salas (las ya empezadas siguen) | El transporte es intercambiable (C1); se puede pasar a otro servicio sin tocar el juego |
| R6 | Textos con HTML por la red | Los carteles del HUD son HTML y los invitados pintarían lo que mande el anfitrión | Hecho: al recibir un `efecto` solo se dejan las etiquetas que ya se usan (`b`, `i`, `kbd`, `small`, `span`) |
| R7 | Las refactorizaciones rompen el juego de un jugador | Fallos en algo que hoy funciona | Sistema a sistema, un PR cada uno, con las pruebas pasando en cada paso |
| R8 | Las estimaciones de peso del mundo están sin medir | El anfitrión sube más de lo previsto | Medir en la fase 2; bajar la cadencia de `foto` o mandar solo lo cercano a cada invitado |
| R9 | El juego crece más deprisa que el multijugador | Las fases 2 y 3 son cada vez más grandes | Lo dicho en «La fase 2 y la refactorización»: que lo nuevo nazca ya con la forma de C9 y C10 |

## 6. Decisiones abiertas

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | ¿Nivel de búsqueda de la pandilla o de cada uno? | **De la pandilla.** Solo hay un municipal y una abuela, y es más divertido que te persigan por lo que ha roto tu amigo |
| D2 | ¿La invasión crece con los jugadores? | **Sí:** más marcianos a la vez, más culetazos para ganar y más coscorrones a la nodriza, a ajustar jugando |
| D3 | ¿Modo foto (y seguir a las mamás) en red? | **Decidido: desactivados en red.** Paran el tiempo y dejarían al jugador clavado a la vista de los demás |
| D4 | ¿Cambiar de personaje a mitad de partida? | **Sí**, entre los libres, como ahora en la pausa. Ya funciona así |
| D5 | ¿Quién puede hacer de noche? | **Cualquiera**, con aviso de quién ha sido. Ya funciona así |
| D6 | ¿Entrar con la partida empezada? | **Sí**; es lo que hace falta cuando a alguien se le cae la conexión. Ya funciona así |
| D7 | ¿Minijuegos unos contra otros (carrera, trucos)? | **Más adelante**, como función aparte encima de esta |
| D9 | ¿Qué TURN se pone? | **Decidido: ExpressTURN**, cuenta gratuita con credenciales fijas, que no pide backend. Van en el código, a la vista de cualquiera: lo peor que puede pasar es que alguien gaste el cupo. La alternativa si eso ocurre es Cloudflare, con credenciales de vida corta y un Worker que las pida |
| D8 | ¿A quién persiguen las gallinas? | **Al que atropelló a una**, no a la pandilla: es un castigo personal y son pocas para repartirlas |
