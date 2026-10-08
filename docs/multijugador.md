# Multijugador en red · diseño, plan y estado

Escrito el 8 de octubre de 2026 sobre el commit `169d849` y **puesto al día ese mismo día sobre
`730ec42`**, con el prototipo de conexión ya hecho. Primero va qué es la función y cómo se juega,
luego la arquitectura de red, después los cambios de código uno por uno y al final el plan de
implementación, los riesgos y las decisiones que quedan abiertas.

Las cifras de código (llamadas, líneas) están contadas sobre `730ec42`, antes de las fases 2 y 3.
Las de red **ya son todas reales**: salen de `src/net/protocol.js` y de lo que escribe cada
sistema en la `foto`, y las de la partida de dos jugadores están medidas en `test:red`.

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
  partida sin pausa y prueba automática. **La fase 2 también está hecha, pero solo probada entre
  ventanas del mismo equipo**: el reloj, el día y la noche, el mobiliario roto, el tráfico, el
  lío con el municipal, el objeto de la calle, las gallinas y la lluvia de meteoritos son los
  mismos para todos, y está hecho el mecanismo para que lo que decide el anfitrión se vea, se
  oiga y le pase a quien toca (la base de C9 y C10). **De la fase 3 está hecha la invasión, también
  probada solo entre ventanas**: la oleada, los marcianos, el platillo (con su rayo, sus rescates
  y su robo), la nave nodriza, el ladrón de la estatua, los disfrazados y la baba son los mismos
  para todos y se juegan en cooperativo. **Y la bolera y la pista**: los bolos y el balón de uno se
  ven en la pantalla de los demás, y mientras alguien juega el minijuego el sitio es suyo. Con eso
  la fase 3 está entera; queda probarla, como la 2, entre dos redes, y la fase 4. Está en el
  [plan](#4-plan-de-implementación).

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
| Invasión marciana | Compartido | Una sola oleada, cooperativa: los culetazos de todos cuentan para el mismo marcador, y con más gente en la calle es más grande. El combo y los studs de cada culetazo son de quien lo da. **Ya funciona** |
| Platillo, rayo y robo del platillo | Compartido | Ronda a un jugador cada vez y de una pasada a otra cambia; lo roba quien le da el tercer coscorrón, que lo pilota desde su pantalla, y los demás ven a su doble a los mandos. Lo que el platillo se lleva (vecinos, coches, vacas) lo rescata cualquiera. **Ya funciona** |
| Nave nodriza (jefe final) | Compartido | Una sola sobre el half-pipe; los coscorrones de todos suman y sus bombas de baba caen para todos. Con más gente aguanta alguno más. **Ya funciona** |
| Robo de la estatua | Compartido | La recupera el que le dé el tercer culetazo; el premio es para todos. **Ya funciona** |
| Marcianos disfrazados | Compartido | Los mismos vecinos con antena en todas las pantallas; el que eches le falta a la oleada de todos. **Ya funciona** |
| Baba verde | Compartido | Resbala y rebota cualquiera, y el charco que uno gasta a botes se gasta para todos. **Ya funciona** |
| Lluvia de meteoritos | Compartido | Las mismas dianas y los mismos cráteres; el meteorito del fondo, para el primero que baje, y el premio por recogerlos todos, para todos. **Ya funciona** |
| Tráfico y peatones | Compartido | Los coches frenan y atropellan a cualquiera. **Ya funciona** |
| Municipal y abuela | Compartido | Un solo nivel de búsqueda para la pandilla: los destrozos de todos suman y van a por el que tengan más cerca. **Ya funciona** |
| Gallinas | Compartido | Si uno atropella a una, persiguen al que la ha atropellado; los demás las ven correr. **Ya funciona** |
| Mobiliario que se rompe | Compartido | Si uno revienta un banco, los demás lo ven roto. **Ya funciona** |
| Objetos (timbre, gorro, cohete, gravedad lunar) | Compartido | El que sale por la calle es uno para todos; se lo queda quien llega antes. **Ya funciona.** El gorro, el cohete y la escafandra que lleva otro jugador todavía no se le ven |
| Vecinos con nombre | Compartido a medias | Faltan del pueblo los que lleva algún jugador; sus animaciones van por libre en cada pantalla |
| Studs y ladrillos dorados | Personal | Cada uno recoge los suyos y los guarda en su progreso |
| Bolos y balón | Compartido | Los que tira o chuta uno los ven caer y rodar los demás, también los bolos y el portero marcianos de noche. Los lleva la pantalla del último que los ha tocado. **Ya funciona** |
| Minijuegos | Personal | Cada uno juega el suyo; mientras tanto ni marcianos ni municipal le hacen caso. Mientras alguien juega a los bolos o al fútbol, la bolera o la pista es suya: los demás lo ven jugar, pero ni pueden empezar ahí ni tocarle los bolos o el balón. **Ya funciona** |
| Selfie con Emma, seguir a las mamás | Personal | Emma se anima por libre en cada pantalla, así que no hay nada que repartir. Las corredoras sí van a la par en todas: por dónde van sale del reloj del juego, como los peatones, y la que atropella uno la ven volar los demás. **Ya funciona** |
| Estrellas, récords, colores | Personal | Siguen en el `localStorage` de cada uno |
| Calidad gráfica, sonido, cámara | Personal | |

### Lo que cambia respecto a jugar solo

- **No hay pausa de verdad.** El menú de pausa se abre, pero el mundo sigue. Tu personaje se
  queda quieto y, mientras tengas el menú abierto, nadie te persigue.
- **Los minijuegos no paran la invasión.** Jugando solo, empezar uno manda a los marcianos a
  esconderse; en red la invasión sigue para los demás y solo dejan en paz a quien juega.
- **No hay modo foto ni seguir a las mamás.** Los dos paran el tiempo, y en red no se puede:
  sus botones y la tecla `T` desaparecen mientras dura la partida (decisión D3).
- **La bolera y la pista se ocupan.** Si un amigo está jugando a los bolos o al fútbol, hay que
  esperar a que acabe para empezar ahí: el cartel dice quién está jugando.
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
| Lo que le pasa a un jugador al tocar algo que se mueve y que no cambia con el golpe (el empujón de un coche) | Ese jugador, contra lo que ve en su pantalla | Rebota en el coche donde lo ve, sin esperar al anfitrión |
| Un peatón o una corredora atropellados | El jugador que los atropella, que lo avisa (`atropella`, `corredora`) | Por dónde anda cada uno no depende de nadie: sale del reloj |
| Todo lo que se mueve solo (marcianos, platillo, nave nodriza y sus bombas, ladrón, meteoritos, coches, peatones, municipal, abuela, zapatilla, gallinas) | El anfitrión | Hace falta una sola verdad |
| Reloj, día y noche, oleada, nivel de búsqueda, objeto en la calle | El anfitrión | Ídem |
| Los bolos de la bolera y el balón y el portero de la pista | El jugador que está jugando el minijuego o, si no juega nadie, el último que los ha tocado. Quién es lo dice el anfitrión | Son lo único del mundo que responde al empujón de un jugador fotograma a fotograma: calculados en otra pantalla, el balón saldría tarde y desde donde ya no estás |
| Un jugador **mientras lo tiene el platillo** (`held`) o va montado en él | Su dueño, siguiendo al platillo que ve; a los mandos, es el platillo el que va donde vaya él | Subir por el rayo, soltarse y pilotar responden al instante. El anfitrión solo decide qué hace el platillo con él (lo sube, se lo lleva, lo suelta) |

**Los choques los detecta cada jugador en su pantalla**, contra lo que ve. Es un cambio sobre la
primera versión de este plan, que los dejaba en manos del anfitrión con la posición que le llega
de cada uno. Con el tráfico se ha visto que no sirve: el empujón de un coche se resuelve fotograma
a fotograma mientras dura el contacto, y hecho en el anfitrión llegaría tarde, desde una posición
vieja y como un chorro de órdenes. El anfitrión sigue decidiendo lo que el mundo hace por su
cuenta mirando a los jugadores (frenar, pitar, perseguir); lo que cambia es que **el contacto lo
dice quien lo sufre o lo da**, y si cambia algo que ven todos, lo avisa. El desfase que queda
(R1) es que cada uno ve el mundo con unos 100 ms de retraso respecto al anfitrión.

La invasión ha llevado la misma idea un paso más allá: **lo que un jugador provoca en algo que se
mueve lo ve al momento en su pantalla, sin esperar al anfitrión**. El marciano al que le da un
culetazo sale volando ya (lo lleva su pantalla hasta que el anfitrión lo da por echado), el rayo
lo coge cuando lo ve encima y el platillo robado se pilota sin retardo. El anfitrión se entera
por un `aviso` y puede no darlo por bueno (el marciano ya no estaba, el platillo tenía a otro):
entonces a ese jugador se le deshace lo que vio, que es raro y dura menos de un segundo.

Como solo el anfitrión ejecuta la lógica del mundo, **el juego no tiene que ser determinista**:
los 164 `Math.random()` del juego se quedan como están.

### Canales y mensajes

Dos canales por conexión: uno **sin garantías** para el estado, que caduca enseguida, y otro
**fiable y ordenado** para lo que no se puede perder.

| Mensaje | Sentido | Canal | Cadencia | Lleva | Estado |
| --- | --- | --- | --- | --- | :---: |
| `hola` | invitado → anfitrión | fiable | al entrar y al cambiar de personaje o color | versión del juego, personaje, color | Hecho |
| `sala` | anfitrión → todos | fiable | al cambiar | qué sitio te toca, si la partida ha empezado, y quién está con qué personaje y color | Hecho |
| `mundo` | anfitrión → invitado | fiable | al entrar | lo que no viaja en la `foto`: mobiliario roto, cráteres y meteoritos por caer, charcos de baba y el retraso de los peatones que ha tenido cogidos el platillo. La hora, la oleada, la estatua y los abducidos no hacen falta: van en cada `foto` | Hecho |
| `yo` | invitado → anfitrión | sin garantías | 20/s | estado de su personaje (38 bytes) y, detrás, los bolos o el balón si los lleva él (hasta 80 más) | Hecho |
| `foto` | anfitrión → invitado | sin garantías | 15/s | reloj del mundo, si es de noche, todo lo que se mueve solo (coches, municipal, objeto, gallinas, marcianos y platillo, nodriza, ladrón, disfrazados, bolos y balón) y los demás jugadores | Hecho |
| `aviso` | jugador → anfitrión → los demás | fiable | cuando pasa | «he roto el banco 12», «he cogido el timbre», «hago de noche». Va como `{ k, v }`: qué y un número; el anfitrión le pone de quién es (`from`) al repartirlo | Hecho. A los quince de la fase 2 (`noche`, `alba`, `rompe`, `arregla`, `atropella`, `lio`, `multa`, `zapatillazo`, `salto`, `coge`, `timbre`, `gallina`, `lluvia`, `meteorito` y `cogido`) la invasión suma dieciséis: lo que un jugador le pide al anfitrión (`culetazo`, `pisoton`, `pillado`, `visto`, `rayo`, `suelto`, `dentro`, `fuera`, `coscorron`, `rescate`, `panza`, `ladron`, `disfraz`), lo que el anfitrión cuenta una vez (`baba`, `bomba`) y `boing`; y la bolera y la pista, dos: `sitio` (lo pido, lo pido para jugar el minijuego, he acabado) y `gol`. Llevan una ristra de números en vez de uno `lluvia`, `culetazo`, `baba`, `bomba`, `ladron` y `sitio` |
| `efecto` | anfitrión → uno o todos | fiable | cuando pasa | cartel, sonido, partículas, sacudida de cámara, studs de premio. Va como sistema, método y argumentos: `{ s, m, a }` | Hecho, y es por donde va casi todo lo que la invasión enseña y premia |
| `adios` | cualquiera | fiable | al salir o al no dejar entrar | motivo: `host`, `bye`, `version`, `full` | Hecho |

`yo` y `foto` llevan una cabecera de 7 bytes: tipo, número de orden (para tirar el paquete que
llega más viejo que el último visto) y el reloj de quien lo manda en milisegundos. La `foto` lleva
detrás 5 bytes del mundo: su hora en milisegundos (`game.time`) y si es de noche.

Las pulsaciones no viajan. La primera idea era mandarlas en `yo` como contadores para que el
anfitrión soltase del rayo y pilotase el platillo de un invitado, pero eso metía el retardo de
ida y vuelta justo en los controles. Al final soltarse y pilotar lo hace la pantalla de cada uno
(ver [Quién tiene la autoridad](#quién-tiene-la-autoridad)), y lo único que el anfitrión necesita
saber es si quien pilota **mantiene pulsado el salto**, que enciende el rayo: un bit del estado
(`F.KEY`).

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
| `grounded`, `grind`, `boosting`, `crashT > 0`, `sunk`, `hidden`, `invuln > 0`, `held`, ocupado, `foil`, salto pulsado | 16 bits sueltos, 11 en uso | 2 | Postura, turbo, castañazo o chapuzón, oculto (en el menú o dentro del platillo), parpadeo, en el rayo, a otra cosa, con el gorro de aluminio (el platillo no lo ve), el rayo del platillo robado |
| | | **31** | |
| `char`, `colorIdx` | en `hola` y `sala` | | No van en cada paquete |

Los giros viajan **como se ven**, no como los lleva la física. Para pintar es lo exacto, y al
anfitrión le ha bastado: lo usa para saber hacia dónde sale un marciano o el ladrón al echarlos y
hacia dónde mira el platillo de quien lo pilota.

### Cuánto pesa

| Qué | Unidades | Bytes | |
| --- | ---: | ---: | --- |
| Cabecera, reloj del mundo, noche, cuánto ocupa lo que se mueve solo y cuánto cada sistema | | 24 | 15 fijos y 1 por sistema que viaja (9) |
| Jugadores (los otros 6) | 6 | 192 | 32 cada uno |
| Marcianos y oleada | 9 (`POOL`) | 77 | 8 cada uno (qué hace, sitio, altura y rumbo) y 5 de la oleada |
| Platillo y lo que lleva | 1 | 30 | 14 del platillo, 8 de a quién sube, 7 de quién cae y 1 por cada uno que lleve dentro. Con los marcianos, 1 solo byte si no hay invasión ni marcianos sueltos |
| Ladrón y estatua | 1 | 12 | 1 si no hay robo y la estatua está en su fuente |
| Nave nodriza | 1 | 5 | 1 si no está. Sus bombas no viajan en la `foto`: cada una se cuenta una vez, en un `aviso` |
| Disfrazados | 3 | 8 | 2 cada uno y 2 de la cuenta; de noche, 2 |
| Charcos de baba | 8 | 0 | no viajan en la `foto`: cada uno se cuenta una vez, en un `aviso` |
| Meteoritos | 5 por lluvia | 0 | no viajan en la `foto`; la lluvia entera se cuenta una vez, en un `aviso` |
| Coches | 16 (8 circuitos × 2) | 114 | 7 cada uno (sitio en décimas, rumbo y velocidad) y 2 para los que tiene el platillo |
| Municipal, abuela y zapatilla | 3 | 35 | 13 cada perseguidor, 7 la zapatilla y 2 las estrellas |
| Objeto de la calle | 1 | 8 | cuál, su número de serie y dónde |
| Gallinas | 7 | 59 | 8 cada una y 3 del enfado; 1 solo byte si no hay nadie cerca del corral ni están enfadadas |
| Bolos y balón | 10 y 1 | 79 | 7 cada bolo, 7 el balón con el portero marciano y 1 por sitio (quién lo lleva y cómo está); 2 en total con los bolos en pie y el balón en el centro |
| Peatones | hasta 64 | 0 | no viajan, salen del reloj |
| **Una `foto`, con todo a la vez** | | **≈ 640** | |

Con dos jugadores una `foto` son 226 bytes de día y 326 en plena invasión (medido en
`test:red`); con la sala llena, 386 y 486: unos 58 kbps por invitado y **unos 350 kbps de subida en
el anfitrión** de noche. Con alguien cerca del corral son 58 bytes más, con el balón rodando 7 y
con bolos por el suelo 70, pero invasión, nodriza, meteoritos, gallinas y bolos no coinciden casi
nunca. Una fibra doméstica lo lleva de sobra; unos datos
móviles flojos, no. Lo sensato es que haga de anfitrión quien juegue con ordenador.

### Suavizado

- **Los demás jugadores se pintan con 100 ms de retraso**, interpolando entre los dos últimos
  estados recibidos (`Session.sample`). Es lo que evita los tirones cuando un paquete llega tarde.
  Los coches van igual (`Session.moving`).
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
| C9 | Órdenes al jugador en vez de tocarle los campos | `player.js`, `remote-player.js` y los sistemas de cada fase | M | 2 y 3 | **Descartado**: lo que le pasa a cada jugador lo hace su pantalla. El mensaje `orden` se hizo y se ha quitado sin que lo usara nadie |
| C10 | HUD, sonido y partículas con destinatario | `fx.js`, los sistemas de cada fase, `src/net/*` | G | 2 y 3 | **Hecho** |
| C11 | Sistemas para varios jugadores | `traffic.js`, `wanted.js`, `props.js`, `items.js`, `hens.js`, `meteors.js`, `cows.js` | G | 2 | **Hecho** (`cows.js` no ha hecho falta: las vacas se animan por libre en cada pantalla) |
| C12 | Simular en el anfitrión, pintar en todos | los mismos, más `src/net/*`; en la fase 3, los de C13 | G | 2 y 3 | **Hecho** |
| C13 | Invasión cooperativa | `aliens.js`, `boss.js`, `heist.js`, `disguise.js`, `slime.js` | G | 3 | **Hecho** |
| C14 | Minijuegos con más gente en el pueblo | `missions.js`, `minigames.js`, `spots.js`, `src/net/*` | M | 3 | **Hecho** |
| C15 | Premios y progreso | `main.js`, `aliens.js`, `boss.js`, `heist.js`, `wanted.js`, `hens.js` | P | 3 | **Hecho** |
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
  (`update(now, state)`) y devuelve el de los demás (`sample(pl, now, out)`). Lo que un invitado
  lleve del mundo va detrás de su estado, en la cola de su `yo`: la sesión lo guarda y lo entrega
  sin mirarlo (`carried(pl, now, out)`), como lo que se mueve solo en la `foto`.

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
  pausa, en un minijuego o con la pestaña tapada. Apaga su icono en la pastilla y hace que el
  mundo no vaya a por él: ni lo persiguen ni cuentan sus choques (C14).
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
- que la lluvia de meteoritos que empieza el anfitrión le cae igual al invitado y deja los mismos
  cráteres, que el meteorito del fondo se lo lleva el que baja y la cuenta es de todos, y que
  quien entra tarde se encuentra los cráteres y los que quedan por caer;
- que las gallinas solo viajan con alguien cerca del corral, que el invitado las ve donde el
  anfitrión, que si atropella a una se enfadan con él y que los picotazos le quitan studs a él;
- que el objeto que saca el anfitrión lo ve el invitado en el mismo sitio, que se lo queda el
  que llega y desaparece para todos, y que el timbrazo de uno se ve en la pantalla de otro;
- que los destrozos de un invitado sacan al municipal del anfitrión, que va a por él y él lo ve,
  que lo multan en su pantalla con sus studs y que con eso se acaba el lío para todos;
- que el invitado ve coches y peatones donde el anfitrión, que el coche frena ante un invitado y
  le pita a él, que el invitado rebota en el coche que ve, que un peatón atropellado vuela en
  todas las pantallas y que al irse el anfitrión los coches siguen por su circuito;
- que el banco que rompe uno lo ven roto los demás y quien entra tarde, que los studs son solo
  para quien lo rompe y que lo reconstruye el anfitrión para todos;
- que un cartel para todos, para uno o para quien esté cerca de un sitio sale donde debe y sin
  HTML ajeno, y que un empujón dado en una pantalla al personaje de otro no lo mueve;
- que el invitado lleva el reloj del anfitrión, que si uno hace de noche lo es para todos y a los
  demás les dicen quién ha sido, y que quien llega tarde se encuentra la noche y el reloj;
- la invasión: que los disfrazados son los mismos vecinos y a quien le quita el disfraz a uno y lo
  echa le cuentan los studs a él y la cuenta a todos; que la oleada, los marcianos, el platillo y
  la baba del invitado son los del anfitrión, y con dos jugadores la oleada es más grande; que el
  culetazo de un invitado sale volando en su pantalla sin esperar y cuenta para todos; que el
  ladrón es el mismo y al tercer culetazo de un invitado la estatua vuelve para todos, con el
  premio repartido; que el rayo coge al invitado que lo dice y el platillo del anfitrión se para
  con él, que se suelta machacando el salto y, si no, se lo lleva dentro a otra punta del pueblo
  y le birla sus studs, que con tres coscorrones el platillo es suyo, lo
  pilota desde su pantalla y los demás ven a su doble a los mandos; que lo que el platillo se
  lleva sube igual en todas las pantallas y lo rescata un invitado; que la nodriza baja para
  todos, los coscorrones de un invitado cuentan, las bombas caen en el mismo sitio y, al
  reventar, el premio, el nivel y el amanecer son de todos; y que quien entra tarde se encuentra
  la invasión empezada;
- la bolera y la pista: que la pista pasa a llevarla el invitado que anda por ella, que el balón
  que chuta lo ven rodar los demás y solo viaja cuando no está en su sitio, que quien lo toca pasa
  a llevarlo sin esperar, sea invitado o anfitrión, y que el gol es de quien lo marca y lo ven los
  que andan cerca; que quien empieza los bolos se queda la bolera y los demás ni pueden empezar
  ahí ni quitarle los bolos, que los que tira caen en todas las pantallas, también los marcianos,
  y que al acabar o al irse queda libre;
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
  de día para todos sin decir de quién ha sido. Desde la fase 3 la invasión es una sola y solo la
  rechaza el anfitrión, así que es él quien hace amanecer.
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

**Se hizo la base y se ha quitado.** `RemotePlayer` convertía `bump`, `place`, `crash`, `launch`
y `skid` en un mensaje `orden` (`Party.order`) que el invitado ejecutaba sobre su jugador. Ningún
sistema llegó a usarlo.

La invasión era el sistema que más tocaba al jugador (31 asignaciones y 17 escrituras a `p.pos`
en `aliens.js`), y se ha resuelto al revés de lo previsto: en vez de que el anfitrión le mande
órdenes, **todo lo que le pasa a un jugador lo hace su propia pantalla** (`Aliens.mine`,
`Boss.touch`, `Heist.touch`). Las escrituras siguen ahí, pero siempre son sobre el jugador local.
Mientras `held` es cierto, es su pantalla la que lo sube por el rayo, lo esconde dentro del
platillo y lo suelta, siguiendo al platillo que ve; el anfitrión solo dice qué hace el platillo
con él. La bolera y el fútbol tampoco lo necesitaron, así que `orden` se quitó al cerrar la fase 3
(decisión D10). Lo que queda de él: en un `RemotePlayer` esos cinco métodos no hacen nada, para
que un sistema que se los llame por descuido no mueva en esta pantalla al muñeco de otro.

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
- En la fase 3 se le ha añadido un quinto sistema, `studs` (`g.to(p).studs.burst(…)`: los studs
  que saltan por el suelo, para quien se los ha ganado), y a lo que es del juego (`OWN`),
  `kicked` (el marciano que el anfitrión le apunta a un jugador) y `beat` (invasión rechazada:
  premio y nivel).
- **Marcadores que salen del estado, no de un `efecto`.** Los contadores que son iguales para
  todos (marcianos echados, coscorrones al platillo, vida de la nodriza, culetazos al ladrón,
  disfrazados) ya no los pone quien cambia la cuenta: cada pantalla los pinta al ver que ha
  cambiado. Lo mismo lo que se ve y se oye al pasar de un estado a otro (un marciano que
  aterriza, el escudo de la nodriza que sube, la nodriza que revienta): así quien entra tarde lo
  ve bien sin que nadie le cuente nada, y sobran muchos `efecto`.

Esto es la propuesta **R2** de `docs/refactorizacion-y-optimizacion.md` (un bus de eventos entre
sistemas) con un requisito más: que el evento lleve destinatario. Conviene hacer las dos cosas de
una vez y no dos refactorizaciones seguidas sobre los mismos archivos.

### C11 · Sistemas para varios jugadores

Cada sistema recibe hoy **un** jugador en `update(dt, p, time)`. En el anfitrión pasa a recibir la
lista y decide a quién mira:

| Sistema | Qué cambia |
| --- | --- |
| `traffic.js` | **Hecho.** Los coches frenan si tienen delante a cualquier jugador (`Game.crowd`) y le pitan a ese (`g.to(p).sfx.honk()`, el primer `efecto` de verdad). El empujón de un coche y el atropello de un peatón los detecta cada jugador en su pantalla; el atropello se avisa (`atropella`) y los studs son para quien lo da |
| `wanted.js` | **Hecho.** Un solo nivel de búsqueda (D1), que lleva el anfitrión. Los destrozos de todos suman (`lio`). Municipal y abuela salen a por el último que ha roto algo y luego van a por el más cercano que no esté ocupado (`prey`, revisado cada segundo); el rastro de migas es el suyo y se borra al cambiar de presa. Cada jugador detecta en su pantalla si lo pillan, le dan o los salta, y lo avisa (`multa`, `zapatillazo`, `salto`): la multa y el premio del salto son suyos, y **con la multa o el zapatillazo de uno se acaba el lío para todos**. El esquinazo lo decide el anfitrión y el premio es para todos (`g.all.addStuds`). Silbato, sirena y aviso de proximidad suenan en cada pantalla según lo cerca que le quede |
| `props.js` | **Hecho.** Cada jugador detecta sus propios choques y manda `aviso` (`rompe`, con el número del mueble); el anfitrión lo reparte, lleva la cuenta atrás y avisa al reconstruirlo (`arregla`), cuando no hay ningún jugador a menos de 30 unidades (`Game.nearest2`). Los trozos salen con la velocidad que llevaba quien lo rompió; los studs y el lío con el municipal son solo para él. Al que entra se le dice cuáles están rotos (`mundo`) |
| `items.js` | **Hecho.** El objeto de la calle es uno y lo pone el anfitrión, cerca de un jugador cualquiera que no esté ocupado; va en cada `foto` y se quita si queda lejos de todos. Cada jugador detecta que lo toca y lo pide (`coge`, con el número de serie del objeto); lo gana el primer aviso que llegue al anfitrión, que se lo da con `g.to(p).giveItem(…)`. Lo que se lleva y lo que hace efecto (`p.foil`, `p.rocket`, `p.moon`) son del que lo usa, y quien ya lleva uno no coge otro. En red el siguiente empieza a contar al cogerlo, no al gastarlo. El timbrazo de otro se ve y se oye (`timbre`), y a los marcianos, que son de todos, los aturde el anfitrión al enterarse |
| `hens.js` | **Hecho.** Las mueve el anfitrión. Las que picotean se apartan del jugador que tengan más cerca; las enfadadas persiguen a quien ha atropellado a una (`owner`: `rage` ya tiene dueño), y si se va o se pone a otra cosa, se calman. Cada jugador detecta en su pantalla que atropella a una (y lo avisa: `gallina`) y que le dan un picotazo, que le quita studs solo a él. La cuenta atrás del enfado solo le sale a él; el premio del esquinazo y la hazaña (`g.to(p).tally('hens')`) también son suyos. Si otro atropella a una mientras dura el enfado, se renueva pero no cambia de dueño |
| `meteors.js` | **Hecho.** La lluvia la decide el anfitrión; las dianas caen alrededor de un jugador cualquiera que no esté ocupado (`aim(p)`). No viaja en la `foto`: una vez decidido dónde y cuándo cae cada meteorito, lo demás es cuestión de tiempo, así que se cuenta entera una vez (`lluvia`: qué cráteres viejos se tapan y, de cada meteorito, sitio, tamaño, espera y de dónde viene) y cada pantalla la lleva por su cuenta, levanta sus cráteres y manda por los aires a su jugador. El meteorito del fondo lo pide quien lo toca (`meteorito`) y lo da el anfitrión, que lo dice (`cogido`); el premio es suyo, la cuenta es de todos y el premio final, para todos. Los cráteres cambian el terreno: al que entra tarde se le cuentan en el `mundo` (`dump` y `load`), con los meteoritos que queden por caer |
| `cows.js`, `folks.js` | Animación local en cada pantalla; solo los empujones (`p.bump`) son contra el jugador local |
| `studs.js` | Sin cambios: local y personal. Los studs que saltan al romper algo aparecen en la pantalla de quien lo rompió |

Los que «se reconstruyen cuando no miras» (`props.js` espera a que el jugador esté a más de 30
unidades; los studs, a 25) comprueban la distancia al jugador **más cercano**.

Diez sitios daban una tregua mientras hay misión (`g.missions.active` en `aliens.js`,
`disguise.js`, `hens.js`, `items.js`, `meteors.js` y `wanted.js`): en red es «ignora al jugador
ocupado» (C14), no «para el sistema». Hecho en todos.

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

**Hecho en `traffic.js`**, que ha fijado la forma:

- `update` ya no es un método de 180 líneas: reparte en `simulate(dt, who)` (por dónde van los
  coches; solo jugando solo o en el anfitrión), `present(player)` (cada coche en su sitio),
  `touch(player)` (el choque del jugador de esta pantalla) y `walk(dt, player, time)` (peatones).
- **Lo que viaja lo escribe y lo lee el sistema**: `bytes`, `write(dv, o)` y `read(a, b, o, k)`,
  que mezcla dos fotos. `Party.shared` es la lista de sistemas que viajan, en orden; la sesión
  lleva ese trozo de la `foto` sin mirarlo y da las dos fotos entre las que toca pintar
  (`Session.moving`), con el mismo retraso de 100 ms que los jugadores.
- Un invitado deja de simular en cuanto le llega la primera foto (`Party.fed`). **Al acabar la
  partida** los coches vuelven a ser suyos: cada uno busca el tramo de su circuito en el que lo
  ha dejado el anfitrión (`rejoin`) y sigue desde ahí.
- **Los peatones no viajan.** Van por un recorrido fijo y el pueblo se construye con la misma
  semilla (`makeRng(20261007)`), así que por dónde anda cada uno es una cuenta sobre el reloj del
  juego, que ya es común: 64 peatones a cero bytes, y quien entra tarde los ve en su sitio sin
  que nadie le cuente nada. Para eso un peatón por los aires ya no se queda clavado: sigue
  avanzando mientras vuela (cae un par de unidades más allá).
- **Lo que no corre con el anfitrión en el menú.** `props.js`, `wanted.js`, `items.js`, `hens.js`, `meteors.js` y toda la invasión solo se actualizan con
  la partida en marcha: si el anfitrión vuelve al menú mientras los demás juegan, el mobiliario
  no se reconstruye y municipal, abuela, marcianos y platillo se quedan parados hasta que salga
  otra vez. El tráfico sí sigue. Además, cuando el anfitrión vuelve a casa o al menú se acaba el lío para todos
  (`wanted.reset(true)`, como jugando solo).
- **Lo que solo viaja cuando hay algo que contar.** Las gallinas fueron el primer sistema cuyo
  trozo de la `foto` cambia de tamaño: un byte a cero mientras no hay nadie cerca del corral ni
  están enfadadas, y 59 cuando sí. Con la invasión son cinco los que cambian (gallinas,
  marcianos, nodriza, ladrón y disfrazados), y dos fotos podrían ocupar lo mismo llevando cosas
  distintas. Por eso **delante de lo que se mueve solo va lo que ocupa cada sistema**, un byte
  cada uno, y dos fotos solo se mezclan si coinciden en todos; si no, vale la más antigua.
- **Lo que el platillo se lleva** ya cuadra entre pantallas: a quién sube, quién cae y a quiénes
  lleva dentro viaja en la `foto` con un número por cabeza (qué es y cuál), y cada pantalla lo
  cuelga de su rayo y lo devuelve a su sitio. El peatón cogido se retrasa lo mismo en todas (cada
  una le cuenta el rato que lo ve cogido), y a quien entra tarde se le dice el retraso que lleva
  cada uno (`mundo`).
- **La forma que ha fijado la invasión**, encima de la del tráfico: además de lo que decide el
  anfitrión (`direct`, `updateUfo`, `updateAliens`…) y lo que se pinta (`present`), cada sistema
  tiene **lo que le pasa al jugador de esta pantalla** (`mine` en `aliens.js`, `touch` en los
  demás), que corre en todas y es donde se detectan los contactos. Lo que se ve al cambiar algo
  de estado sale de comparar con el estado anterior (`changed`), no de quien lo cambió.

### C13 · Invasión cooperativa — hecho

Lo que se había previsto y cómo ha quedado:

- **Objetivo de cada marciano.** Cada uno va a por el jugador que tenga más cerca que no esté a
  otra cosa, ni en el rayo, ni dentro del platillo (`target`), y lo revisa cada segundo más o
  menos. Los refuerzos bajan cerca de un jugador cualquiera, y huyen del que les dé miedo (el que
  va con turbo, o el que lleva su platillo), no del que perseguían.
- **Culetazo, pisotón y que te pillen** los detecta cada jugador en su pantalla, contra los
  marcianos que ve (`touch`). El culetazo se nota al momento: el marciano sale volando en esa
  pantalla sin esperar al anfitrión, que se entera por un `aviso` (`culetazo`, con hacia dónde lo
  ha mandado) y lo echa a volar para los demás. Si el anfitrión no lo da por bueno (ya no
  estaba), a los 0,8 segundos vuelve a salir donde lo tenga.
- **Combo de culetazos.** `combo` y `lastKick` siguen siendo de `Aliens`, pero ahora cada
  pantalla lleva los del jugador local (`reward`), que es quien se da el premio. El marcador de
  la oleada (`wave.count`) es uno y lo lleva el anfitrión (`count`).
- **El rayo.** A quién ronda el platillo lo elige el anfitrión (`mark`) y va en la `foto`. Si es
  el jugador de esta pantalla, es ella la que mira si lo tiene debajo y cuánto le falta
  (`mine`); cuando lo coge, lo dice (`rayo`) y el platillo se para a subirlo. Sube, se suelta
  machacando el salto (`suelto`) o llega arriba (`dentro`) en su pantalla; el anfitrión elige
  adónde se lo lleva (entre los sitios de siempre y **su** casa, no la del anfitrión) y vuela
  hasta allí. Los studs que le birla salen de los suyos, porque lo calcula su pantalla.
- **Por si el anfitrión no se entera.** Entre que un jugador se da por cogido y que el anfitrión
  lo confirma pasa un momento. Si a los 1,5 segundos no lo ha confirmado (el platillo tenía a
  otro), se suelta solo. Y al revés: si el anfitrión deja de darlo por cogido, se suelta al
  verlo. Si un invitado se vuelve al menú con el rayo encima, el platillo lo deja a los 9 segundos.
- **A quién apunta el platillo.** Al más cercano que no esté a otra cosa, y de una pasada a otra
  cambia de víctima si hay varias a mano. Con el gorro de aluminio no lo ve: por eso `foil` viaja
  ahora en el estado de cada jugador. `pickVictim` escoge vecino, coche o vaca cerca del jugador
  al que ronda.
- **Rescates.** Cortar el rayo lo detecta quien lo cruza (`rescate`) y el premio es suyo. Lo que
  **no** se ha hecho es rescatar a un amigo abducido cruzando su rayo: el amigo se suelta él solo.
- **Robar el platillo.** Los coscorrones (`u.hits`) suman entre todos (`coscorron`) y lo pilota
  quien da el tercero. **Lo pilota desde su pantalla**, sin retardo: mientras dura, el platillo
  está donde esté él (el anfitrión lo lee de su estado), y lo único que viaja de sus controles es
  si mantiene el salto, que enciende el rayo. Lo que el rayo se lleva y el reloj del paseo son
  del anfitrión. Todos ven a su doble a los mandos.
- **Tamaño de la oleada** (D2). Con cada jugador de más, la mitad más de marcianos que echar, uno
  más a la vez por la calle (hasta los 9 de `POOL`) y un coscorrón más a la nodriza (hasta tres
  más). Se cuenta con los que hay en la calle al empezar la oleada. Está sin ajustar jugando.
- **Tregua por misión.** En red la invasión sigue y solo se ignora al jugador ocupado.
- **`boss.js`, la nave nodriza:** una sola. La lleva el anfitrión (`direct`); cada jugador detecta
  su coscorrón en la panza (`touch`, `panza`) y el anfitrión lo cuenta si no tenía el escudo
  levantado. Las bombas apuntan a cualquiera que esté a tiro y **no viajan en la `foto`**: cada
  una se cuenta una vez (`bomba`: dónde cae y de dónde sale) y cada pantalla la deja caer y mira
  si pringa a su jugador. El charco lo deja el anfitrión.
- **`disguise.js`, los disfrazados:** los elige el anfitrión y van en la `foto` (qué vecino es
  cada uno y qué ha sido de él), así que quien entra tarde los ve sin más. Quien embiste a uno se
  lo dice al anfitrión (`disfraz`); el marciano que sale corriendo ya es un marciano más de
  `aliens.js`, y los studs por echarlo son para quien le dé el culetazo.
- **`heist.js`:** el ladrón huye del jugador más cercano que lo vea; cada uno detecta su culetazo
  (`ladron`) y la estatua se la apunta quien le da el tercero. El vuelo de vuelta de la estatua
  lo anima cada pantalla. El reloj del robo solo se para si el rayo tiene cogidos a todos.
- **`slime.js`:** los charcos los pone el anfitrión y cuenta cada uno una vez (`baba`); resbalar
  y rebotar lo detecta cada jugador, y el bote que lo gasta se avisa (`boing`).

Lo que viaja está en [Cuánto pesa](#cuánto-pesa): 107 bytes de marcianos y platillo, 12 del
ladrón y 5 de la nodriza, y un byte cada uno cuando no hay nada que contar.

### C14 · Minijuegos — hecho

- Cada jugador lleva una marca **ocupado** (en un minijuego, en la pausa, con la pestaña
  oculta) que viaja en `yo`. Los que persiguen no eligen a un ocupado: ni marcianos, ni platillo,
  ni nodriza, ni ladrón, ni municipal, ni gallinas le hacen caso, y sus choques con ellos tampoco
  cuentan.
- `wanted.update` hace `reset(true)` si hay misión activa: en red, solo deja de contar al
  ocupado (fase 2).
- Carrera, trucos, pizza y **Selfie con Emma** son personales y no tocan nada compartido: siguen
  igual.

**Bolera y fútbol**, con sus versiones marcianas de noche, usan objetos que están en el pueblo
(bolos, balón, portero). Son `src/game/spots.js`: los **sitios**, hoy dos.

- **Cada sitio lo lleva un jugador**, no siempre el anfitrión. Es el primer trozo del mundo que
  puede simular un invitado, y la razón es la misma que llevó los choques a la pantalla de cada
  uno: el balón responde al empujón fotograma a fotograma. Quien lo lleva lo calcula con el código
  de siempre (`Pins.update`, `AlienPins.update`, `Ball.update`); los demás lo pintan (`paint`).
- **Quién lo lleva lo dice el anfitrión**, en cada `foto`: un byte por sitio con el dueño, si está
  jugando el minijuego y cómo está (de noche, con algo que contar). Detrás, solo si hay algo que
  contar, los diez bolos o el balón.
- **Cómo cambia de manos.** Tocando: quien toca un bolo en pie o el balón que lleva otro lo pide
  (`sitio`) y **empieza a llevarlo ya**, desde donde lo ve, sin esperar; el anfitrión se lo da al
  último que lo pide. Si en segundo y medio no se lo ha dado, lo suelta. Y por cercanía: cada
  medio segundo el anfitrión mira si quien lo lleva sigue por allí (a 45 unidades), y si se ha ido
  lejos, al menú o de la partida, se lo pasa al que quede más cerca, o se lo queda él. Así los
  bolos marcianos ya se apartan de quien llega aunque no haya tocado ninguno.
- **Jugando el minijuego, el sitio es suyo.** Al empezar lo pide para jugar y el anfitrión lo
  cierra: nadie se lo quita tocando, a los demás los bolos y el balón solo los apartan, y en la
  marca del minijuego les sale quién está jugando en vez de dejarles empezar. Al acabar, o si se
  va, queda libre. Si dos empiezan a la vez, al segundo se le acaba el minijuego al segundo y medio.
- **Por dónde viaja.** Lo que lleva un invitado va **en la cola de su `yo`**, detrás de su estado:
  así llega con la misma hora que su personaje y los demás ven el balón salir de su patinete y no
  una décima después. El anfitrión lo pinta entre dos colas, con el retraso de siempre, y **lo
  reparte tal cual** en su `foto`, sin pasarlo por lo que él pinta. Un `yo` sigue pesando 38 bytes
  mientras no se lleve nada.
- **De noche** los bolos y el portero son marcianos según quien lleva el sitio, no según la hora
  de cada pantalla: quien juega a los bolos de siempre de noche los ve de siempre, y los demás
  con él.
- **Lo que no viaja.** Las velocidades: al coger un sitio, cada cosa sigue con la que se le veía
  de un fotograma a otro. Teo y el suplente se pasean bajo los palos según el reloj, que ya es
  común; del portero marciano viaja por dónde anda. El giro de los marcianos por los aires y el
  del balón los pone cada pantalla.
- **Goles.** El de un minijuego cuenta para quien juega. Fuera de él, los 500 studs son para
  quien lleva el balón, que es el último que lo ha tocado; los que andan cerca lo ven y lo oyen
  (`gol`).

Lo que queda flojo: dos jugadores empujando el balón uno contra otro se lo quitan a cada toque y
el balón da saltos entre las dos versiones; y con el anfitrión en el menú, un sitio que lleve él
se queda quieto hasta que otro lo toque o se acerque.

### C15 · Premios y progreso — hecho

- `addStuds()` y `save` siguen siendo locales. Los premios de cosas compartidas llegan como
  `efecto` a quien toque: el coscorrón, el rescate y los marcianos que sube el rayo, a quien los
  hace; rechazar la invasión, reventar la nave nodriza y recuperar la estatua, a todos. El
  culetazo no viaja: se lo da su propia pantalla al que lo pega.
- **Nivel de invasión** (`save.invasions`): la oleada usa el del anfitrión. Al ganar, cada jugador
  se queda con el mayor entre el suyo y el recién superado (`Game.beat`).
- **Contadores** (`save.aliens`, `ufos`, `rescues`, `motherships`, `statues`, `spies`, `hens`):
  cada uno sube en el progreso de quien se lo ha ganado, por su pantalla o con `g.to(p).tally(…)`.
  Las nodrizas derribadas se les apuntan a todos; la estatua, a quien le dio el último culetazo.
- **Para todos o para uno:** `g.all.addStuds(…)` para el esquinazo al municipal, la invasión
  rechazada, la nodriza y la estatua. Los destinatarios de `fx.js` llevan, además de los
  sistemas, lo que es del juego y no de un sistema (`OWN`: `addStuds`, `giveItem`, `tally`,
  `confetti`, `kicked` y `beat`).
- **Studs que te quitan.** Cinco sitios restan de `g.save.studs`: la multa del municipal, el rayo
  y los marcianos (`aliens.js`, dos sitios), las bombas de la nodriza y los picotazos. Los cinco
  los detecta la pantalla de quien los sufre, así que salen de sus studs sin `efecto` de por medio.

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

### Lo que queda

Todo lo pendiente, en un solo sitio. El detalle de cada cosa está donde se indica.

| Qué | Tipo | Dónde está el detalle |
| --- | --- | --- |
| **Probar las fases 2 y 3 entre dos redes**: coches, municipal y gallinas por 4G; el culetazo a un marciano que se mueve y el rayo; el balón que chuta otro y qué pasa al quitárselo | Jugar un rato | [La fase 2](#la-fase-2-y-la-refactorización), [La fase 3](#la-fase-3), R1 |
| Probar en Safari, con el anfitrión en un móvil y con el ahorro de energía de Chrome | Jugar un rato | Paso 3b de la fase 1, R3 |
| Ajustar el tamaño de la oleada con dos, tres y siete jugadores | Ajuste | C13, D2 |
| Rescatar a un amigo del rayo cruzándolo: hoy solo se suelta él | Fase 3, fleco | C13 |
| Pintar lo que lleva puesto otro jugador: gorro de aluminio (ya viaja), cohete y escafandra | Fase 3, fleco | [La fase 3](#la-fase-3) |
| Oír a los demás (saltos, turbo, castañazos), y que lo que pasa lejos suene más bajo | Fase 3, fleco | C3 |
| El balón entre dos que lo empujan a la vez da saltos | Fase 3, fleco | C14 |
| Con el anfitrión en el menú se paran mobiliario, municipal, objetos, gallinas, meteoritos e invasión, y los bolos o el balón que lleve él | Limitación | C12, C14 |
| Reconexión: que un invitado que se cae recupere personaje y sitio si vuelve en un par de minutos | Fase 4 | C16 |
| Dar por perdido a quien lleve unos segundos sin mandar nada, sin esperar a que se cierre el canal | Fase 4 | C16 |
| Vuelta al menú cuando se cae el anfitrión | Fase 4 | C16 |
| Ofrecer el botón de actualizar cuando la versión no coincide con la del anfitrión | Fase 4 | C16 |
| TURN propio (Cloudflare con un Worker) si se acaba el cupo de ExpressTURN o alguien abusa de las credenciales | Fase 4, solo si hace falta | R4, D9 |
| Reenviar la hora original de cada invitado si se nota temblor entre invitados | Solo si se nota | [Suavizado](#suavizado) |
| Minijuegos unos contra otros (carrera, trucos) | Más adelante | D7 |
| Llevar las pruebas a CI | Más adelante | [Pruebas](#pruebas) |

Nada de esto impide jugar: las fases 1 a 3 están hechas. Lo primero es la partida de prueba entre
dos redes, que es lo que dirá si hay algo más que arreglar antes de la fase 4.

### Fases

| Fase | Qué se puede hacer al acabarla | Cambios |
| --- | --- | --- |
| 1 · Verse | Crear sala, unirse, elegir personaje sin repetir y patinar juntos de día. El mundo todavía va por libre en cada pantalla | C1–C7 |
| 2 · Mismo pueblo | Tráfico, municipal, mobiliario, objetos, gallinas, meteoritos y día y noche son los mismos para todos | C8–C12, en `props.js`, `traffic.js`, `wanted.js`, `items.js`, `hens.js` y `meteors.js` |
| 3 · Invasión | La noche de los marcianos en cooperativo, con minijuegos conviviendo. **Hecha** | C13–C15, y C9, C10 y C12 en `aliens.js`, `boss.js`, `heist.js`, `disguise.js` y `slime.js` |
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
| 2 | **El mecanismo y `props.js` entero**: `g.to(p)`, `g.all`, `g.at(x, z)`, las órdenes al jugador (quitadas después: ver C9) y el `mundo` para el que entra tarde | C9 y C10 (la base), C11 | **Hecho**. `props.js` no ha servido para probar `efecto` ni `orden` con un sistema de verdad: como cada jugador detecta sus choques, no los necesita. Eso queda para el paso 3 |
| 3 | **`traffic.js`**: el primero con `simulate`/`present` y con el mundo en la `foto`. Aquí se mide el peso de verdad (R8) | C11, C12 | **Hecho**. Los coches pesan 114 bytes y los peatones ninguno. `orden` sigue sin uso: los choques han pasado a detectarse en la pantalla de cada jugador |
| 4 | **`wanted.js`, `items.js`, `hens.js` y `meteors.js`**, ya con el patrón probado, uno por PR | C9–C12 | **Hecho** |

Cada paso va en su PR, con el juego de un jugador funcionando igual que antes.

Con el paso 4 la fase 2 queda hecha. Lo que deja pendiente:

- **Probarla entre dos redes.** Todo lo de esta fase está probado solo entre ventanas del mismo
  equipo (`test:red`). Falta una partida de verdad, sobre todo para ver cómo se ven coches,
  municipal y gallinas por 4G.
- **`orden` se quedó sin uso.** Los choques han acabado detectándose en la pantalla de cada jugador,
  así que ningún sistema de esta fase le hace nada al personaje de otro desde el anfitrión. En la
  fase 3 tampoco hizo falta, y se ha quitado (ver C9).
- **Lo que lleva puesto otro jugador no se le ve**: gorro de aluminio, cohete y escafandra.
- **El anfitrión en el menú** para mobiliario, municipal, objetos, gallinas y meteoritos (ver C12).

### La fase 3

Los cinco sistemas de la invasión se han hecho de una vez y no uno por PR como los de la fase 2:
`aliens.js` llama a los otros cuatro y ellos a él (la nodriza recoge el platillo y manda
refuerzos, el ladrón mira si el platillo es robado, los disfrazados salen de `aliens.js`, todos
dejan baba), y con uno solo en red los demás se habrían quedado a medias en los invitados.

| Paso | Qué | Cambios | Estado |
| :---: | --- | --- | --- |
| 1 | **La invasión**: `slime.js`, `aliens.js`, `boss.js`, `heist.js` y `disguise.js`, con los premios y el progreso | C13, C15, y lo que quedaba de C10 y C12 | **Hecho**, probado entre ventanas del mismo equipo |
| 2 | **Bolera y fútbol** vistos entre pantallas | lo que queda de C14 | **Hecho**, probado entre ventanas del mismo equipo |

Lo que la fase deja pendiente:

- **Probarlo entre dos redes.** Como la fase 2, solo está probado con `test:red`. Es donde más
  se va a notar el retardo: hay que ver cómo se siente el culetazo a un marciano que se mueve, y
  el rayo, por 4G; y cómo se ve el balón que chuta otro y qué pasa al quitárselo.
- **Ajustar el tamaño de la oleada** con dos, tres y siete jugadores (D2).
- **Rescatar a un amigo del rayo.** Hoy solo se suelta él.
- **Lo que lleva puesto otro jugador sigue sin vérsele**: gorro de aluminio, cohete y escafandra.
  El gorro ya viaja (`F.FOIL`), porque el platillo lo necesita; falta pintarlo.
- **No se oye a los demás** (C3), y los marcianos que echa otro suenan igual estén cerca o lejos
  dentro de las 140 unidades.
- **El balón entre dos que lo empujan a la vez** da saltos, y **un sitio que lleve el anfitrión
  se queda quieto si él está en el menú** hasta que otro lo toque o se acerque (ver C14).

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
| R1 | Desfase en los choques con cosas que se mueven | A 30 unidades/s, 150 ms de retardo son 4–5 unidades: un culetazo que tú ves claro puede no contar, o te atropella un coche que ya habías pasado | Los contactos los detecta cada jugador en su pantalla, contra lo que ve, y lo que provoca lo ve al momento: así no hay culetazo claro que no cuente. Queda que el mundo se ve con unos 100 ms de retraso, que el anfitrión frena o persigue según una posición igual de vieja, y que alguna vez no da por bueno lo que un jugador ha visto (dos le dan al mismo marciano a la vez). Sin probar entre dos redes |
| R2 | El anfitrión va lento | `loop()` limita `dt` a 0,05 s: por debajo de 20 fotogramas por segundo el mundo va a cámara lenta para todos | Avisar al crear partida en un equipo justo; la calidad automática ya baja sola |
| R3 | Anfitrión con el juego tapado | En ordenador, cambiar de pestaña o minimizar ya no para la partida (metrónomo con worker, C6). En un móvil, bloquear la pantalla o cambiar de aplicación la congela para todos. Sin probar: Safari y el ahorro de energía de Chrome | `wakeLock`, aviso a los invitados y recomendar que haga de anfitrión quien juegue con ordenador |
| R4 | Redes que no dejan conexión directa | Alguien no consigue entrar. **Ha pasado a la primera con datos móviles** | Mensaje claro y el TURN de ExpressTURN. Con `?ice=relay` se comprueba que sigue vivo. Si se acaba el cupo o alguien abusa de las credenciales, que están a la vista, se cambian o se pasa a Cloudflare con un Worker |
| R5 | Depender del broker público de PeerJS | Si está caído no se pueden crear salas (las ya empezadas siguen) | El transporte es intercambiable (C1); se puede pasar a otro servicio sin tocar el juego |
| R6 | Textos con HTML por la red | Los carteles del HUD son HTML y los invitados pintarían lo que mande el anfitrión | Hecho: al recibir un `efecto` solo se dejan las etiquetas que ya se usan (`b`, `i`, `kbd`, `small`, `span`) |
| R7 | Las refactorizaciones rompen el juego de un jugador | Fallos en algo que hoy funciona | Sistema a sistema, un PR cada uno, con las pruebas pasando en cada paso |
| R8 | Las estimaciones de peso del mundo están sin medir | El anfitrión sube más de lo previsto | Medido todo: 486 bytes por `foto` con la sala llena en plena invasión, unos 350 kbps de subida, por debajo de los 500 estimados. Si hiciera falta: bajar la cadencia de `foto` o mandar solo lo cercano a cada invitado |
| R9 | El juego crece más deprisa que el multijugador | Las fases 2 y 3 son cada vez más grandes | Lo dicho en «La fase 2 y la refactorización»: que lo nuevo nazca ya con la forma de C9 y C10 |

## 6. Decisiones abiertas

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | ¿Nivel de búsqueda de la pandilla o de cada uno? | **Decidido: de la pandilla.** Solo hay un municipal y una abuela, y es más divertido que te persigan por lo que ha roto tu amigo. Ya funciona así |
| D2 | ¿La invasión crece con los jugadores? | **Decidido: sí.** Por cada jugador de más, la mitad más de culetazos para ganar, un marciano más a la vez y un coscorrón más a la nodriza. Ya funciona así; las cifras están puestas a ojo y hay que ajustarlas jugando |
| D3 | ¿Modo foto (y seguir a las mamás) en red? | **Decidido: desactivados en red.** Paran el tiempo y dejarían al jugador clavado a la vista de los demás |
| D4 | ¿Cambiar de personaje a mitad de partida? | **Sí**, entre los libres, como ahora en la pausa. Ya funciona así |
| D5 | ¿Quién puede hacer de noche? | **Cualquiera**, con aviso de quién ha sido. Ya funciona así |
| D6 | ¿Entrar con la partida empezada? | **Sí**; es lo que hace falta cuando a alguien se le cae la conexión. Ya funciona así |
| D7 | ¿Minijuegos unos contra otros (carrera, trucos)? | **Más adelante**, como función aparte encima de esta |
| D9 | ¿Qué TURN se pone? | **Decidido: ExpressTURN**, cuenta gratuita con credenciales fijas, que no pide backend. Van en el código, a la vista de cualquiera: lo peor que puede pasar es que alguien gaste el cupo. La alternativa si eso ocurre es Cloudflare, con credenciales de vida corta y un Worker que las pida |
| D10 | ¿Se quita `orden`? | **Decidido: quitado.** Ningún sistema lo usaba después de las fases 2 y 3: lo que le pasa a cada jugador lo hace su pantalla, y la bolera y el fútbol tampoco lo necesitaron |
| D8 | ¿A quién persiguen las gallinas? | **Decidido: al que atropelló a una**, no a la pandilla: es un castigo personal y son pocas para repartirlas. Ya funciona así |
