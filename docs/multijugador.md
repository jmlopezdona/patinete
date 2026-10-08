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
- **Dónde estamos.** Hecho el prototipo de la fase 1: transporte, protocolo, jugadores remotos y
  la prueba automática. Dos o más navegadores ya se ven patinar entre sí, por ahora entrando con
  la dirección (`?sala=KTRM`). **Falta probarlo entre dos casas de verdad**, que es lo que decide
  si se sigue por aquí; el orden de lo que viene está en el [plan](#4-plan-de-implementación).

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

> **Hoy, en el prototipo:** no hay panel de sala. La partida se crea abriendo
> `…/?sala=KTRM&anfitrion` y se entra con `…/?sala=KTRM`; cada uno sale con el personaje que tenga
> guardado, se puede repetir, y se entra directamente con la partida en marcha.

### Qué se comparte y qué no

| Cosa | En red | Detalle |
| --- | --- | --- |
| Los demás jugadores | Compartido | Se les ve patinar, saltar, hacer trucos y darse castañazos, con su nombre encima y su icono en el minimapa. **Ya funciona** |
| Día y noche | Compartido | Cualquiera puede hacer de noche con `N`; sale un aviso de quién ha sido |
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
| Mobiliario que se rompe | Compartido | Si uno revienta un banco, los demás lo ven roto |
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
- **El modo foto** para el tiempo, y en red el tiempo no se puede parar (decisión abierta D3). Lo
  mismo vale para **seguir a las mamás** (`watch.js`), que deja la partida «como estaba».
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
| STUN | Atravesar el router de casa | El de Google, que es el que PeerJS trae puesto |
| TURN | Retransmitir cuando la conexión directa no sale (datos móviles, redes de empresa) | Los comunitarios que PeerJS trae puestos (`eu-0` y `us-0.turn.peerjs.com`), sin garantía ninguna. Si a alguien no le conecta, se añade un servicio propio con nivel gratuito |

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
| `sala` | anfitrión → todos | fiable | al cambiar | qué sitio te toca, y quién está con qué personaje y color | Hecho |
| `mundo` | anfitrión → invitado | fiable | al entrar | estado completo: hora, oleada, estatua, charcos, cráteres, mobiliario roto, abducidos, objeto en la calle | Fase 2 |
| `yo` | invitado → anfitrión | sin garantías | 20/s | estado de su personaje (37 bytes) | Hecho, sin los contadores de controles |
| `foto` | anfitrión → invitado | sin garantías | 15/s | reloj y los demás jugadores; más adelante, todo lo que se mueve | Hecho para los jugadores |
| `orden` | anfitrión → un invitado | fiable | cuando pasa | algo que el mundo le hace a su personaje: empujón, castañazo, rayo, lanzamiento, congelar | Fase 2 |
| `aviso` | jugador → anfitrión → todos | fiable | cuando pasa | «he roto el banco 12», «he cogido el timbre», «hago de noche» | Fase 2 |
| `efecto` | anfitrión → uno o todos | fiable | cuando pasa | cartel, sonido, partículas, sacudida de cámara, studs de premio | Fase 2 |
| `adios` | cualquiera | fiable | al salir o al no dejar entrar | motivo: `host`, `bye`, `version`, `full` | Hecho |

`yo` y `foto` llevan una cabecera de 7 bytes: tipo, número de orden (para tirar el paquete que
llega más viejo que el último visto) y el reloj de quien lo manda en milisegundos.

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
| `grounded`, `grind`, `boosting`, `crashT > 0`, `sunk`, `hidden`, `invuln > 0`, `held` | 8 bits sueltos | 1 | Postura, turbo, castañazo o chapuzón, oculto, parpadeo, en el rayo |
| | | **30** | |
| `char`, `colorIdx` | en `hola` y `sala` | | No van en cada paquete |

Los giros viajan **como se ven**, no como los lleva la física. Para pintar es lo exacto; cuando
el anfitrión necesite el rumbo real de un invitado (fase 2) habrá que ver si le basta.

### Cuánto pesa

| Qué | Unidades | Bytes aprox. | |
| --- | ---: | ---: | --- |
| Cabecera | | 8 | real |
| Jugadores (los otros 6) | 6 | 186 | real: 31 cada uno |
| Marcianos | 9 (`POOL`) | 150 | estimado |
| Platillo, ladrón y estatua | 3 | 60 | estimado |
| Nave nodriza y sus bombas | 1 + 4 | 70 | estimado; solo durante el jefe final |
| Meteoritos | 5 por lluvia | 50 | estimado; solo mientras caen |
| Coches | 16 (8 circuitos × 2) | 130 | estimado |
| Municipal, abuela y zapatilla | 3 | 40 | estimado |
| Gallinas | 7 | 60 | estimado; solo cuando persiguen |
| Peatones | hasta 64 | 130 | estimado: solo su avance por el recorrido |
| **Una `foto`, con todo a la vez** | | **≈ 880** | |

Hoy, que solo viajan jugadores, una `foto` con la sala llena son 194 bytes: unos 23 kbps por
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
- **Reloj común (fase 2).** `game.time` mueve muchas animaciones; el anfitrión mandará el suyo y
  cada invitado guardará la diferencia.

## 3. Cambios de implementación

Tamaño: **P** unas horas, **M** un par de días, **G** una semana o más. Son órdenes de magnitud
para comparar entre sí, no plazos.

| # | Cambio | Archivos | Tamaño | Fase | Estado |
| --- | --- | --- | :---: | :---: | --- |
| C1 | Transporte y protocolo | `src/net/*`, `package.json` | M | 1 | **Hecho** |
| C2 | Sala: crear, unirse, elegir personaje | `index.html`, `style.css`, `main.js` | M | 1 | Solo por la dirección |
| C3 | Jugadores remotos | `remote-player.js`, `party.js`, `player.js`, `main.js` | M | 1 | **Hecho**, sin sonido de los demás |
| C4 | Varios vecinos fuera a la vez | `folks.js`, `minigames.js`, `main.js` | P | 1 | Pendiente |
| C5 | Minimapa y HUD con los demás | `minimap.js`, `hud.js` | P | 1 | Minimapa y avisos hechos; falta la tira de iconos |
| C6 | Partida sin pausa | `main.js`, `party.js`, `photo.js`, `watch.js` | P | 1 | Hecho lo de la pestaña tapada y que los demás se muevan en tu pausa; falta el resto |
| C7 | Pruebas con varios navegadores | `tools/red.mjs`, `package.json` | M | 1 | **Hecho** |
| C8 | Reloj, día y noche compartidos | `env.js`, `main.js`, `src/net/*` | P | 2 | |
| C9 | Órdenes al jugador en vez de tocarle los campos | `player.js` y todos los sistemas | M | 2 | |
| C10 | HUD, sonido y partículas con destinatario | todos los sistemas, `src/net/*` | G | 2 | |
| C11 | Sistemas para varios jugadores | `traffic.js`, `wanted.js`, `props.js`, `items.js`, `hens.js`, `meteors.js`, `cows.js` | G | 2 | |
| C12 | Simular en el anfitrión, pintar en todos | los mismos, más `src/net/*` | G | 2 | |
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
  `no-room`, `taken`, `timeout` o `network`.
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

### C2 · Sala

Hoy: `?sala=KTRM&anfitrion` crea la partida y `?sala=KTRM` entra, sin panel. Una pastilla arriba
(`#net`) dice la sala, cuántos hay y, en rojo, por qué no se ha podido entrar.

Lo que falta:

- `index.html` y `style.css`: botón «Jugar con amigos» y panel de sala con el código, el botón de
  compartir, la lista de jugadores y «Empezar» (solo el anfitrión).
- `main.js`, `bindUi()`: las tarjetas de personaje (`.char-btn`) se desactivan para los cogidos.
  `setCharacter()` pasa a pedir el personaje al anfitrión cuando hay partida en red y solo cambia
  al recibir el visto bueno. El botón de la pausa (`p-char`), que hoy rota por todos, salta los
  ocupados. En `session.js`, `greet()` tiene que rechazar el personaje cogido.
- `?sala=KTRM` en la URL abre directamente el panel de unirse.
- Estados nuevos de `Game.state`: `'lobby'` entre `'menu'` y `'play'`. Hoy, quien está en el menú
  ya sale en la partida de los demás, quieto en su puerta.
- Generar el código al crear (hoy lo pone quien escribe la dirección) y reintentar si está cogido
  (`taken`).
- El tope de jugadores es `CHARACTERS.length`: si se añade un personaje, cabe uno más. Ya es así.

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

### C4 · Varios vecinos fuera a la vez

- `folks.js`: `setPlayer(id)` guarda un solo ausente en `this.away`. Pasa a `setAway(ids)` con un
  conjunto, y las comprobaciones `this.away !== 'leo'` a `!this.away.has('leo')`. La misión del
  selfie (`missions.js`) también mira `folks.away !== 'emma'`.
- `minigames.js`: `ball.setKeeper(ch.id !== 'teo')` pasa a «hay portero si nadie lleva a Teo».
- `main.js`: la descripción de la misión de fútbol, que depende del portero, se recalcula al
  cambiar la sala.

Hasta entonces, **el vecino que lleva un amigo sigue en su sitio en tu pantalla**: si él es Yago,
tú ves dos Yagos.

### C5 · Minimapa y HUD

- Hecho: cada amigo sale en el minimapa con el icono de su personaje, también cuando queda lejos
  (va en la lista de `blips` que ya se le pasa a `draw()`), y las entradas y salidas se avisan con
  el `toast` que ya existía.
- Falta en `hud.js`: una tira pequeña con los iconos de quién está en la partida.

### C6 · Partida sin pausa

- Hecho: con tu pausa abierta, los demás se siguen moviendo y a ti se te ve quieto.
- Hecho: **con la pestaña tapada la partida sigue.** `Party.keepGoing()` arranca al ocultarse la
  página un worker que solo marca el paso, y cada mensaje suyo llama a `Game.loop(t, true)`, que
  calcula y envía pero se salta `render()` y la calidad automática. Al volver, el worker se
  suelta y manda otra vez `requestAnimationFrame`. En red, tapar la pestaña ya no abre la pausa.
- `main.js`, `loop()`: en red, `this.paused` no detiene `update()`; solo congela los controles
  propios y marca al jugador como **ocupado** (ver C14).
- Con la pestaña tapada falta marcar al jugador como ocupado: hoy se queda quieto, pero cuando
  el mundo sea compartido no deben perseguirle.
- **Anfitrión en un móvil:** si bloquea la pantalla o cambia de aplicación, el sistema congela la
  página y no hay worker que valga. Mientras dure la partida se pide `navigator.wakeLock` para
  que no se apague la pantalla, y los invitados ven «El anfitrión está en pausa» si pasan 2
  segundos sin `foto`.
- `photo.js` y `watch.js`: según la decisión D3.

### C7 · Pruebas con varios navegadores — hecho

`tools/red.mjs`, sobre el `puppeteer-core` que ya usan `smoke.mjs` y `shot.mjs`. Script
`npm run test:red`, con `npm run dev` en marcha como las demás. Abre anfitrión, invitado y un
tercero con `?red=local` y comprueba:

- que entran y cada uno ve el personaje del otro, también si lo cambia después;
- que al patinar uno, el otro lo ve ir detrás sin tirones y acabar en el mismo sitio, en los dos
  sentidos;
- que dos invitados se ven entre sí a través del anfitrión, con su nombre encima;
- que con la ventana del anfitrión minimizada su partida sigue y los demás lo ven moverse;
- que el castañazo de otro se ve, pero no te saca el cartel;
- que el que se va desaparece, que un código que no existe se explica y que, si se va el
  anfitrión, se acaba la partida.

Con `RED=peer npm run test:red` hace lo mismo por WebRTC y el broker público de PeerJS: sirve
para comprobar el transporte de verdad, pero necesita internet y no debería ir en la tanda
habitual.

Cada jugador va en **su ventana**, no en una pestaña: una pestaña tapada por otra deja de
pintar. Con la página oculta, las esperas de puppeteer tienen que ir con `polling` por
temporizador, que por defecto van con fotogramas y no acaban nunca.

### C8 · Reloj, día y noche

- `env.js`: `toggle()` cambia `target` directamente. En red, un invitado manda el `aviso` y es el
  anfitrión quien cambia; `target` viaja en cada `foto`.
- `main.js`: en los invitados `this.time` sale del reloj del anfitrión, no de sumar `dt`.

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
| `props.js` | Cada jugador detecta sus propios choques y manda `aviso`; el anfitrión lo reparte y lleva la cuenta atrás para reconstruirlo |
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

- Cada jugador lleva una marca **ocupado** (en un minijuego, en la pausa, en el modo foto,
  siguiendo a las mamás, con la pestaña oculta) que viaja en `yo`. Los que persiguen no eligen a
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
- **Anfitrión que se cae:** hoy los demás se quedan sin amigos y con el aviso en la pastilla.
  Falta la vuelta al menú, cada uno con su progreso guardado.
- **Sala llena o código que no existe:** el mensaje ya sale; falta llevarlo al panel de unirse.
- **Sin conexión directa:** a los 12 segundos sin conectar se explica que esa red no deja y que
  pruebe con otra. Si pasa a menudo, es el momento de añadir un TURN propio.
- **Cortes sin despedida.** Hoy uno se entera de que el otro se ha ido porque lo dice
  (`adios`) o porque se cierra el canal, y eso último puede tardar. Falta dar por perdido a quien
  lleve unos segundos sin mandar nada.

## 4. Plan de implementación

### Fases

| Fase | Qué se puede hacer al acabarla | Cambios |
| --- | --- | --- |
| 1 · Verse | Crear sala, unirse, elegir personaje sin repetir y patinar juntos de día. El mundo todavía va por libre en cada pantalla | C1–C7 |
| 2 · Mismo pueblo | Tráfico, municipal, mobiliario, objetos, gallinas, meteoritos y día y noche son los mismos para todos | C8–C12 |
| 3 · Invasión | La noche de los marcianos en cooperativo, con minijuegos conviviendo | C13–C15 |
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
| 3b | **Probar entre dos casas**: uno con fibra y otro en otra red, y otra vez con uno en datos móviles. No es código: es jugar un rato. Ver [cómo](#cómo-probarlo) | — | **Pendiente: es lo siguiente** |
| 4 | **Sala de verdad y varios vecinos fuera**: panel, código generado, compartir, personajes cogidos, estado `'lobby'`; `folks.setAway(ids)` y el portero | C2, C4 | Pendiente |
| 5 | **Lo que queda de HUD y la partida sin pausa**: tira de iconos, ocupado, `wakeLock`, «el anfitrión está en pausa» | C5, C6 | Pendiente; adelantado que la partida siga con la pestaña tapada |

Según salga el paso 3b:

- **Conecta y se ve fluido:** se sigue con los pasos 4 y 5.
- **Conecta pero va a tirones:** antes de seguir, mirar la hora de los estados reenviados (ver
  Suavizado) y subir el retraso de 100 ms.
- **No conecta en alguna red:** decidir TURN propio u otro transporte **antes** del paso 4. El
  resto del código no cambia: es lo que compra la interfaz de C1.

### Antes de empezar la fase 2

- **Decidir qué se hace con la refactorización.** C10 y C12 son las propuestas R2 y R3 de
  `docs/refactorizacion-y-optimizacion.md` con un requisito más. Si el bus de eventos se va a
  hacer, que nazca ya con destinatario; si no, se refactorizan dos veces los mismos archivos.
- **Hacerla sin red de por medio**, sistema a sistema, con el juego de un jugador funcionando
  igual en cada paso. Orden propuesto: C9 (órdenes al jugador) → C10 (destinatario) → C12
  (simular y pintar) → C11 (varios jugadores) → C8 y la red.
- **Cada función nueva del juego agranda la fase 2.** Entre la primera versión de este documento
  y esta, el juego ganó nave nodriza, meteoritos, gallinas y disfrazados: las escrituras al
  jugador pasaron de 93 a 124 y las llamadas a la presentación de 221 a 331. Merece la pena que
  lo nuevo que se añada mientras tanto nazca ya con la forma de C9 y C10.
- **Medir el peso de verdad** en cuanto viaje el primer sistema del mundo (R8).

### Pruebas

C9, C10 y C12 son refactorizaciones del juego de un jugador que hay que dejar funcionando igual
que antes; `npm run test:fisica`, `npm run test:misiones` y `npm run test:red` son la red de
seguridad.

Por ahora las pruebas **se pasan en local antes de abrir cada PR**; llevarlas a CI (paso 4 del
informe de deuda técnica) queda para más adelante y no bloquea ninguna fase.

### Cómo probarlo

- **Con dos ventanas del mismo navegador**, sin internet:
  `http://localhost:5173/?red=local&sala=KTRM&anfitrion` en una y
  `http://localhost:5173/?red=local&sala=KTRM` en otra.
- **Entre dos casas**, con el juego publicado: el que crea abre `…/?sala=KTRM&anfitrion` (el
  código, el que se quiera, de hasta 8 letras o números) y manda al otro `…/?sala=KTRM`. La
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
| R4 | Redes que no dejan conexión directa | Alguien no consigue entrar | Mensaje claro; los TURN comunitarios de PeerJS de entrada y uno propio cuando haga falta. **Sin probar todavía** (paso 3b) |
| R5 | Depender del broker público de PeerJS | Si está caído no se pueden crear salas (las ya empezadas siguen) | El transporte es intercambiable (C1); se puede pasar a otro servicio sin tocar el juego |
| R6 | Textos con HTML por la red | Los carteles del HUD son HTML y los invitados pintarían lo que mande el anfitrión | Limitar a las etiquetas que ya se usan (`b`, `kbd`, `small`, `span`) al recibir. Hoy no viaja ningún texto: los avisos se montan en cada pantalla con el nombre del personaje |
| R7 | Las refactorizaciones rompen el juego de un jugador | Fallos en algo que hoy funciona | Hacerlas sin red de por medio, sistema a sistema, con las pruebas pasando en cada paso |
| R8 | Las estimaciones de peso del mundo están sin medir | El anfitrión sube más de lo previsto | Medir en la fase 2; bajar la cadencia de `foto` o mandar solo lo cercano a cada invitado |
| R9 | El juego crece más deprisa que el multijugador | La fase 2 es cada vez más grande | Lo dicho en «Antes de empezar la fase 2»: que lo nuevo nazca ya con la forma de C9 y C10 |

## 6. Decisiones abiertas

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | ¿Nivel de búsqueda de la pandilla o de cada uno? | **De la pandilla.** Solo hay un municipal y una abuela, y es más divertido que te persigan por lo que ha roto tu amigo |
| D2 | ¿La invasión crece con los jugadores? | **Sí:** más marcianos a la vez, más culetazos para ganar y más coscorrones a la nodriza, a ajustar jugando |
| D3 | ¿Modo foto (y seguir a las mamás) en red? | **Sin parar el tiempo:** la cámara se suelta y tú quedas ocupado, pero el mundo sigue. Si queda raro, desactivarlos en red |
| D4 | ¿Cambiar de personaje a mitad de partida? | **Sí**, entre los libres, como ahora en la pausa. El prototipo ya lo hace, aún sin mirar si está libre |
| D5 | ¿Quién puede hacer de noche? | **Cualquiera**, con aviso de quién ha sido |
| D6 | ¿Entrar con la partida empezada? | **Sí**; es lo que hace falta cuando a alguien se le cae la conexión. El prototipo solo sabe entrar así |
| D7 | ¿Minijuegos unos contra otros (carrera, trucos)? | **Más adelante**, como función aparte encima de esta |
| D8 | ¿A quién persiguen las gallinas? | **Al que atropelló a una**, no a la pandilla: es un castigo personal y son pocas para repartirlas |
