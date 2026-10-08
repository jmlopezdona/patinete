# Multijugador en red · diseño y cambios de implementación

Escrito el 8 de octubre de 2026 sobre el commit `169d849`. Primero va qué es la
función y cómo se juega, luego la arquitectura de red, después los cambios de código uno por uno y
al final las fases, los riesgos y las decisiones que quedan abiertas.

Las cifras de código (llamadas, líneas) están contadas sobre ese commit. Las de red (bytes, kbps,
retardos) son **estimaciones sin medir**: no hay todavía ni una línea de red en el juego.

## Resumen

- **Qué es.** Varios amigos, cada uno en su casa y con su dispositivo, patinan a la vez por el
  mismo Cobeña. Cada uno lleva un personaje distinto y caben tantos como personajes hay: hoy 7
  (`CHARACTERS` en `src/game/characters.js`).
- **Sin backend propio.** Uno crea la partida y su navegador hace de servidor de los demás, por
  WebRTC. Solo hace falta un servicio ajeno para que los navegadores se encuentren al empezar.
- **Quién simula qué.** Cada jugador simula a su personaje; el anfitrión simula el mundo
  compartido (marcianos, platillo, tráfico, municipal, objetos) y lo reparte.
- **El trabajo no está en la red, está en el juego.** Los sistemas dan por hecho que hay un solo
  jugador y mezclan simulación con HUD, sonido y partículas. Separar eso es el grueso.
- **Se puede hacer por fases** y la primera (verse patinar unos a otros) apenas toca el código
  que ya existe, así que sirve para validar la conexión entre casas antes de lo caro.

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

### Qué se comparte y qué no

| Cosa | En red | Detalle |
| --- | --- | --- |
| Los demás jugadores | Compartido | Se les ve patinar, saltar, hacer trucos y darse castañazos, con su nombre encima y su punto en el minimapa |
| Día y noche | Compartido | Cualquiera puede hacer de noche con `N`; sale un aviso de quién ha sido |
| Invasión marciana | Compartido | Una sola oleada, cooperativa: los culetazos de todos cuentan para el mismo marcador |
| Platillo, rayo y robo del platillo | Compartido | Abduce a un jugador cada vez; lo roba y lo pilota uno |
| Robo de la estatua | Compartido | La recupera el que le dé el tercer culetazo; el premio es para todos |
| Baba verde | Compartido | Resbala y rebota cualquiera |
| Tráfico y peatones | Compartido | Los coches frenan y atropellan a cualquiera |
| Municipal y abuela | Compartido | Un solo nivel de búsqueda para la pandilla (decisión abierta D1) |
| Mobiliario que se rompe | Compartido | Si uno revienta un banco, los demás lo ven roto |
| Objetos (timbre, gorro, cohete) | Compartido | El que sale por la calle es uno para todos; se lo queda quien llega antes |
| Vecinos con nombre | Compartido a medias | Faltan del pueblo los que lleva algún jugador; sus animaciones van por libre en cada pantalla |
| Studs y ladrillos dorados | Personal | Cada uno recoge los suyos y los guarda en su progreso |
| Minijuegos | Personal | Cada uno juega el suyo; mientras tanto ni marcianos ni municipal le hacen caso |
| Estrellas, récords, colores | Personal | Siguen en el `localStorage` de cada uno |
| Calidad gráfica, sonido, cámara | Personal | |

### Lo que cambia respecto a jugar solo

- **No hay pausa de verdad.** El menú de pausa se abre, pero el mundo sigue. Tu personaje se
  queda quieto y, mientras tengas el menú abierto, nadie te persigue.
- **El modo foto** para el tiempo, y en red el tiempo no se puede parar (decisión abierta D3).
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
anfitrión dentro de su foto del mundo.

```
 invitado ─┐
 invitado ─┼── anfitrión (simula el mundo)
 invitado ─┘
```

### Encontrarse y conectar

| Pieza | Para qué | Con qué |
| --- | --- | --- |
| Señalización | Que dos navegadores intercambien el saludo inicial | El broker público de PeerJS; el código de sala es el identificador del anfitrión (`cobena-KTRM`) |
| STUN | Atravesar el router de casa | Servidores públicos gratuitos |
| TURN | Retransmitir cuando la conexión directa no sale (datos móviles, redes de empresa) | Nada al principio; se añade un servicio con nivel gratuito si a alguien no le conecta |

El juego se publica en GitHub Pages, que ya sirve por HTTPS, que es lo que WebRTC necesita. El
service worker no estorba: `public/sw.js` solo intercepta peticiones `GET` del mismo origen.

Todo esto queda detrás de una interfaz de transporte (cambio C1), de modo que cambiar PeerJS por
otra cosa, o por un transporte local para las pruebas, no toca el resto.

### Quién tiene la autoridad

| Sobre qué | Manda | Por qué |
| --- | --- | --- |
| El personaje de cada uno (posición, velocidad, trucos) | Su dueño | Los controles responden al instante, sin esperar al anfitrión |
| Cosas quietas contra las que choca un jugador (mobiliario, studs, ladrillos, charcos de baba) | El jugador que choca, que lo avisa | No se mueven: no hay desfase que resolver |
| Todo lo que se mueve solo (marcianos, platillo, ladrón, coches, peatones, municipal, abuela, zapatilla) | El anfitrión | Hace falta una sola verdad |
| Reloj, día y noche, oleada, nivel de búsqueda, objeto en la calle | El anfitrión | Ídem |
| Un jugador **mientras lo tiene el platillo** (`held`) o va montado en él | El anfitrión | Hoy ya es el platillo quien mueve su posición |

Los choques entre un jugador y algo que se mueve los decide el anfitrión con la posición que le
llega de ese jugador. Es lo que menos código cambia, porque los sistemas ya reciben un `p` con
`pos` y `vel` y les da igual que sea local o remoto; el precio es un desfase que se trata en
riesgos (R1).

Como solo el anfitrión ejecuta la lógica del mundo, **el juego no tiene que ser determinista**:
los 88 `Math.random()` de `src/` se quedan como están.

### Canales y mensajes

Dos canales por conexión: uno **sin garantías** para el estado, que caduca enseguida, y otro
**fiable y ordenado** para lo que no se puede perder.

| Mensaje | Sentido | Canal | Cadencia | Lleva |
| --- | --- | --- | --- | --- |
| `hola` | invitado → anfitrión | fiable | al entrar | versión del juego, personaje preferido |
| `sala` | anfitrión → todos | fiable | al cambiar | quién está y con qué personaje y color |
| `mundo` | anfitrión → invitado | fiable | al entrar | estado completo: hora, oleada, estatua, charcos, mobiliario roto, abducidos, objeto en la calle |
| `yo` | invitado → anfitrión | sin garantías | 20/s | estado de su personaje y sus controles |
| `foto` | anfitrión → invitado | sin garantías | 15/s | reloj, los demás jugadores y todo lo que se mueve |
| `orden` | anfitrión → un invitado | fiable | cuando pasa | algo que el mundo le hace a su personaje: empujón, castañazo, rayo, lanzamiento, congelar |
| `aviso` | jugador → anfitrión → todos | fiable | cuando pasa | «he roto el banco 12», «he cogido el timbre», «hago de noche» |
| `efecto` | anfitrión → uno o todos | fiable | cuando pasa | cartel, sonido, partículas, sacudida de cámara, studs de premio |
| `adiós` | cualquiera | fiable | al salir | motivo |

Las pulsaciones (saltar, truco, acción) viajan en `yo` como **contadores**, no como «pulsado
ahora»: si se pierde un paquete, el siguiente trae la cuenta al día y no se pierde ninguna. El
anfitrión las necesita porque soltarse del rayo y pilotar el platillo robado se hacen con los
controles (`aliens.update(dt, p, time, inp)`).

### El estado de un jugador

Lo que lee `Player.updateVisual` para pintar a alguien, que es justo lo que hay que mandar:

| Campo | Para qué |
| --- | --- |
| `pos`, `vel`, `v`, `heading` | Dónde está y hacia dónde va |
| `spin`, `flip`, `pitch` | Giros en el aire y cuesta |
| `grounded`, `grind`, `boosting`, `whipT` | Postura, turbo y truco en curso |
| `steer`, `throttle` | Inclinarse, girar la cabeza, empujar con el pie |
| `crashT > 0`, `hidden`, `invuln > 0`, `held` | Castañazo, oculto, parpadeo, en el rayo |
| `char`, `colorIdx` | Solo en `sala`, no en cada paquete |

Con posiciones en coma flotante de 32 bits y ángulos en 16 sale en torno a **40 bytes por
jugador**.

### Cuánto pesa

| Qué | Unidades | Bytes aprox. |
| --- | ---: | ---: |
| Jugadores (los otros 6) | 6 | 240 |
| Marcianos | 9 (`POOL`) | 150 |
| Platillo, ladrón y estatua | 3 | 60 |
| Coches | 16 (8 circuitos × 2) | 130 |
| Municipal, abuela y zapatilla | 3 | 40 |
| Peatones | hasta 64 | 130 (solo su avance por el recorrido) |
| **Una `foto`** | | **≈ 750** |

A 15 por segundo son unos 90 kbps por invitado y **unos 550 kbps de subida en el anfitrión** con
la sala llena. Una fibra doméstica lo lleva de sobra; unos datos móviles flojos, no. Lo sensato es
que haga de anfitrión quien juegue con ordenador.

### Suavizado

- **Los demás jugadores y el mundo se pintan con unos 100 ms de retraso**, interpolando entre las
  dos últimas `foto`. Es lo que evita los tirones cuando un paquete llega tarde.
- **Tu personaje no se interpola**: se pinta donde lo calcula tu propio juego.
- **Reloj común.** `game.time` mueve muchas animaciones; el anfitrión manda el suyo y cada
  invitado guarda la diferencia.

## 3. Cambios de implementación

Tamaño: **P** unas horas, **M** un par de días, **G** una semana o más. Son órdenes de magnitud
para comparar entre sí, no plazos.

| # | Cambio | Archivos | Tamaño | Fase |
| --- | --- | --- | :---: | :---: |
| C1 | Transporte y protocolo | `src/net/*` (nuevo), `package.json` | M | 1 |
| C2 | Sala: crear, unirse, elegir personaje | `index.html`, `style.css`, `main.js` | M | 1 |
| C3 | Jugadores remotos | `src/game/remote-player.js` (nuevo), `player.js`, `main.js` | M | 1 |
| C4 | Varios vecinos fuera a la vez | `folks.js`, `minigames.js`, `main.js` | P | 1 |
| C5 | Minimap y HUD con los demás | `minimap.js`, `hud.js` | P | 1 |
| C6 | Partida sin pausa | `main.js`, `photo.js` | P | 1 |
| C7 | Pruebas con dos navegadores | `tools/red.mjs` (nuevo), `package.json` | M | 1 |
| C8 | Reloj, día y noche compartidos | `env.js`, `main.js`, `src/net/*` | P | 2 |
| C9 | Órdenes al jugador en vez de tocarle los campos | `player.js` y todos los sistemas | M | 2 |
| C10 | HUD, sonido y partículas con destinatario | todos los sistemas, `src/net/*` | G | 2 |
| C11 | Sistemas para varios jugadores | `traffic.js`, `wanted.js`, `props.js`, `items.js`, `cows.js` | G | 2 |
| C12 | Simular en el anfitrión, pintar en todos | los mismos, más `src/net/*` | G | 2 |
| C13 | Invasión cooperativa | `aliens.js`, `heist.js`, `slime.js` | G | 3 |
| C14 | Minijuegos con más gente en el pueblo | `missions.js`, `minigames.js` | M | 3 |
| C15 | Premios y progreso | `main.js`, `aliens.js`, `heist.js`, `wanted.js` | P | 3 |
| C16 | Caídas, reconexión y versión | `src/net/*`, `main.js`, `core/update.js` | M | 4 |

### C1 · Transporte y protocolo

Módulo nuevo `src/net/`, sin dependencias del resto del juego:

- `transport.js`: `host(code)`, `join(code)`, `send(to, channel, data)`, `on(type, fn)`,
  `close()`. Una implementación con PeerJS y otra **local** con `BroadcastChannel` entre pestañas
  del mismo navegador, que se elige con `?red=local`: sirve para desarrollar con dos pestañas y
  para las pruebas, sin depender del broker.
- `protocol.js`: los tipos de mensaje de la tabla de arriba y cómo se empaquetan `yo` y `foto` en
  binario (`DataView`). Lo fiable va en JSON: son pocos mensajes y así se depuran a simple vista.
- `session.js`: quién está en la sala, quién es el anfitrión, el reloj común y el bucle de envío
  (`yo` a 20/s, `foto` a 15/s) desacoplado de los fotogramas.

Dependencia nueva: `peerjs`. A confirmar en el prototipo que deja abrir los dos canales (fiable y
sin garantías) contra el mismo par y mandar binario sin envolver.

### C2 · Sala

- `index.html` y `style.css`: botón «Jugar con amigos» y panel de sala con el código, el botón de
  compartir, la lista de jugadores y «Empezar» (solo el anfitrión).
- `main.js`, `bindUi()`: las tarjetas de personaje (`.char-btn`) se desactivan para los cogidos.
  `setCharacter()` pasa a pedir el personaje al anfitrión cuando hay partida en red y solo cambia
  al recibir el visto bueno. El botón de la pausa (`p-char`), que hoy rota por todos, salta los
  ocupados.
- `?sala=KTRM` en la URL abre directamente el panel de unirse (`params` ya se lee en `main.js`).
- Estados nuevos de `Game.state`: `'lobby'` entre `'menu'` y `'play'`.
- El tope de jugadores es `CHARACTERS.length`: si se añade un personaje, cabe uno más.

### C3 · Jugadores remotos

- `Game` gana `players`: el local (`game.player`, que no cambia de nombre) más los remotos.
- `remote-player.js`: un `RemotePlayer` que reutiliza el modelo y `updateVisual` de `Player`, pero
  no ejecuta `update()`: sus campos salen de interpolar las dos últimas `foto`. A `updateVisual`
  se le pasa un `inp` sintético con el `steer` y `throttle` recibidos.
- `player.js`: `crash()` y `splash()` llaman hoy a `game.onCrash()` y `game.onSplash()`, que
  enseñan «¡Castañazo!» y sacuden **la cámara local**. Hay que separar el efecto visual (trozos
  por los aires, modelo oculto) del aviso al jugador, para que el castañazo de otro se vea pero no
  te salga el cartel a ti. Lo mismo con `recover()`, que hace `camera3.snap = true`.
- Encima de cada remoto, la etiqueta `nameTag` que ya llevan los vecinos con nombre.
- `main.js`: `render()` no cambia (ya sube todo lo que cuelga de la escena), y `update()` llama a
  `updateVisual` de los remotos.

### C4 · Varios vecinos fuera a la vez

- `folks.js`: `setPlayer(id)` guarda un solo ausente en `this.away`. Pasa a `setAway(ids)` con un
  conjunto, y las comprobaciones `this.away !== 'leo'` a `!this.away.has('leo')`.
- `minigames.js`: `ball.setKeeper(ch.id !== 'teo')` pasa a «hay portero si nadie lleva a Teo».
- `main.js`: la descripción de la misión de fútbol, que depende del portero, se recalcula al
  cambiar la sala.

### C5 · Minimap y HUD

- `minimap.js`: un punto por cada jugador remoto con el color de su personaje. Encaja en la lista
  de `blips` que ya se le pasa a `draw()`.
- `hud.js`: una tira pequeña con los iconos de quién está en la partida, y avisos de entradas y
  salidas con el `toast` que ya existe.

### C6 · Partida sin pausa

- `main.js`, `loop()`: en red, `this.paused` no detiene `update()`; solo congela los controles
  propios y marca al jugador como **ocupado** (ver C14).
- El `visibilitychange` que hoy pausa al cambiar de pestaña pasa, en red, a marcar ocupado.
- **Anfitrión con la pestaña oculta:** el navegador deja de dar fotogramas y el mundo se congela
  para todos. Mientras dure la partida se pide `navigator.wakeLock` para que no se apague la
  pantalla, y los invitados ven «El anfitrión está en pausa» si pasan 2 segundos sin `foto`.
- `photo.js`: según la decisión D3.

### C7 · Pruebas con dos navegadores

`tools/red.mjs`, sobre el `puppeteer-core` que ya usan `smoke.mjs` y `shot.mjs`: abre dos páginas
con `?red=local`, una crea sala y la otra se une, mueve a un jugador con entradas simuladas y
comprueba desde la otra página que el remoto está donde debe. Script `npm run test:red`.

Para guiones largos, pasarlos con `@fichero`, como en `probe.mjs`.

### C8 · Reloj, día y noche

- `env.js`: `toggle()` cambia `target` directamente. En red, un invitado manda el `aviso` y es el
  anfitrión quien cambia; `target` viaja en cada `foto`.
- `main.js`: en los invitados `this.time` sale del reloj del anfitrión, no de sumar `dt`.

### C9 · Órdenes al jugador

Los sistemas del mundo modifican al jugador por tres vías, contadas fuera de `player.js`:

| Vía | Veces | Dónde sobre todo |
| --- | ---: | --- |
| Asignar campos (`p.held`, `p.v`, `p.boost`, `p.hidden`, `p.frozen`, `p.invuln`, `p.rocket`, `p.foil`…) | 51 | `aliens.js` 27, `missions.js` 8, `items.js` 4 |
| Llamar a métodos (`bump`, `place`, `crash`, `launch`, `skid`) | 25 | `missions.js` 6, `folks.js` 5 |
| Escribir en `p.pos` o `p.vel` | 17 | `aliens.js` 15 |

Para un jugador remoto, nada de eso puede aplicarse en el anfitrión: tiene que llegarle a su
dueño. El cambio es que **todo pase por métodos de `Player`** (`slow(k)`, `hold()`, `release()`,
`setBoost()`, `hide()`…, además de los que ya hay). En el `Player` local se aplican tal cual; en
el `RemotePlayer` del anfitrión se convierten en un mensaje `orden`.

Mientras `held` es cierto, la posición la manda el anfitrión en la `foto` y el dueño la acata: es
lo que hacen hoy las 15 escrituras a `p.pos` de `aliens.js`.

Lo de `missions.js` (14 de las 93) no hay que tocarlo: las misiones son personales y actúan
siempre sobre el jugador local. Tampoco las 6 de `dropoff.js`, que solo corre en el menú.

### C10 · HUD, sonido y partículas con destinatario

Es el cambio más extendido. Los sistemas del mundo llaman directamente a la presentación:

| Sistema | `hud.` | `sfx.` | `bits.` | `camera3.` |
| --- | ---: | ---: | ---: | ---: |
| `aliens.js` | 44 | 28 | 11 | 10 |
| `wanted.js` | 19 | 13 | 4 | 2 |
| `heist.js` | 18 | 9 | 4 | 1 |
| `items.js` | 18 | 4 | 4 | 2 |
| `slime.js` | 2 | 3 | 5 | 2 |
| `folks.js`, `traffic.js`, `cows.js`, `props.js`, `minigames.js` | 0 | 19 | 2 | 1 |

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
| `items.js` | El objeto de la calle es uno; lo gana el primer `aviso` que llegue al anfitrión. Gorro y cohete (`p.foil`, `p.rocket`) son del que lo usa. El timbre aturde alrededor de quien lo toca |
| `cows.js`, `folks.js` | Animación local en cada pantalla; solo los empujones (`p.bump`) son contra el jugador local |
| `studs.js` | Sin cambios: local y personal. Los studs que saltan al romper algo aparecen en la pantalla de quien lo rompió |

Los que «se reconstruyen cuando no miras» (`props.js` espera a que el jugador esté a más de 30
unidades; los studs, a 25) comprueban la distancia al jugador **más cercano**.

### C12 · Simular en el anfitrión, pintar en todos

Los `update` de los sistemas hacen dos cosas a la vez: decidir (IA, choques, temporizadores) y
colocar las piezas del modelo. Los invitados necesitan solo lo segundo, alimentado por la `foto`.

Hay que partir cada sistema replicado en `simulate(dt, players)` (solo anfitrión) y
`present(dt)` (todos), con un estado intermedio pequeño y explícito por entidad: posición, rumbo,
estado y el tiempo que lleva en él. Ese estado es lo que se empaqueta.

Coincide con la propuesta **R3** del informe (máquinas de estados con un estado por función): los
métodos que hay que partir son los mismos que allí salen como demasiado largos (`updateAliens`,
316 líneas; `traffic.update`, 176; `updateUfo`, 151; `updateChaser`, 121).

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
- **Tamaño de la oleada.** `goal` (8 + 4 por nivel, tope 28) y `POOL` (9 marcianos) están pensados
  para uno (D2).
- **Tregua por misión.** `aliens.update` para la invasión entera con `g.missions.active`. En red
  la invasión sigue y solo se ignora al jugador ocupado.
- **`heist.js`:** el ladrón huye del jugador más cercano que lo vea (`SEES`), y `hit(p, label)`
  ya recibe quién le da.
- **`slime.js`:** los charcos los crea el anfitrión; resbalar y rebotar lo detecta cada jugador,
  que los charcos están quietos.

### C14 · Minijuegos

- Cada jugador lleva una marca **ocupado** (en un minijuego, en la pausa, en el modo foto, con la
  pestaña oculta) que viaja en `yo`. Los que persiguen no eligen a un ocupado.
- `wanted.update` hace `reset(true)` si hay misión activa: en red, solo deja de contar al ocupado.
- Carrera, trucos y pizza son personales y no tocan nada compartido: siguen igual.
- **Bolera y fútbol** usan objetos que están en el pueblo (bolos, balón, portero). Mientras
  alguien juega, el sitio queda ocupado para los demás («Adrián está jugando») y es su juego el
  que simula bolos y balón; los demás lo ven por `foto`.

### C15 · Premios y progreso

- `addStuds()` y `save` siguen siendo locales. Los premios de cosas compartidas llegan como
  `efecto` a quien toque: el culetazo, a quien lo da; rechazar la invasión y recuperar la
  estatua, a todos.
- **Nivel de invasión** (`save.invasions`): la oleada usa el del anfitrión. Al ganar, cada jugador
  se queda con el mayor entre el suyo y el recién superado.
- **Multas.** `wanted.take(n)` resta de `g.save.studs`, el progreso de quien ejecuta el código:
  pasa a ser un `efecto` para el jugador al que pillan, que descuenta de los suyos.

### C16 · Caídas, reconexión y versión

- **Versión.** `hola` lleva `VERSION` (`core/update.js`). Si no coincide con la del anfitrión, no
  se entra y se ofrece el botón de actualizar que ya existe.
- **Invitado que se cae:** su personaje desaparece con un aviso y queda libre. Si vuelve con el
  mismo código en un par de minutos, recupera personaje y sitio.
- **Anfitrión que se cae:** aviso a todos y vuelta al menú, cada uno con su progreso guardado.
- **Sala llena o código que no existe:** mensaje claro en el panel de unirse.
- **Sin conexión directa:** si pasan 10 segundos sin conectar, se explica que esa red no deja y
  que pruebe con wifi. Si pasa a menudo, es el momento de añadir TURN.

## 4. Fases

| Fase | Qué se puede hacer al acabarla | Cambios |
| --- | --- | --- |
| 1 · Verse | Crear sala, unirse, elegir personaje sin repetir y patinar juntos de día. El mundo todavía va por libre en cada pantalla | C1–C7 |
| 2 · Mismo pueblo | Tráfico, municipal, mobiliario, objetos y día y noche son los mismos para todos | C8–C12 |
| 3 · Invasión | La noche de los marcianos en cooperativo, con minijuegos conviviendo | C13–C15 |
| 4 · Aguante | Reconexión, mensajes de error, TURN si hace falta | C16 |

La fase 1 es pequeña y casi no toca código existente, pero tiene una limitación a la vista:
**verás a un amigo atravesar un coche**, porque su tráfico no es el tuyo. Aun así merece ir
primero: es la que dice si la conexión entre casas funciona, y si no funciona nada de lo demás
importa.

La fase 2 es la cara. C9, C10 y C12 son refactorizaciones del juego de un jugador que hay que
dejar funcionando igual que antes; `npm run test:fisica` y `npm run test:misiones` son la red de
seguridad, junto con `npm run test:red` desde que exista (C7).

Por ahora las pruebas **se pasan en local antes de abrir cada PR**; llevarlas a CI (paso 4 del
informe de deuda técnica) queda para más adelante y no bloquea ninguna fase.

## 5. Riesgos

| # | Riesgo | Qué se nota | Cómo se trata |
| --- | --- | --- | --- |
| R1 | Desfase en los choques con cosas que se mueven | A 30 unidades/s, 150 ms de retardo son 4–5 unidades: un culetazo que tú ves claro puede no contar, o te atropella un coche que ya habías pasado | El anfitrión adelanta la posición del jugador con su velocidad antes de comprobar. Si no basta, los culetazos pasan a detectarse en el juego de quien los da (más código en C13) |
| R2 | El anfitrión va lento | `loop()` limita `dt` a 0,05 s: por debajo de 20 fotogramas por segundo el mundo va a cámara lenta para todos | Avisar al crear partida en un equipo justo; la calidad automática ya baja sola |
| R3 | Móvil de anfitrión | Pantalla bloqueada o cambio de aplicación congela la partida | `wakeLock`, aviso a los invitados y recomendar ordenador (C6) |
| R4 | Redes que no dejan conexión directa | Alguien no consigue entrar | Mensaje claro; TURN cuando haga falta |
| R5 | Depender del broker público de PeerJS | Si está caído no se pueden crear salas (las ya empezadas siguen) | El transporte es intercambiable (C1); se puede pasar a otro servicio sin tocar el juego |
| R6 | Textos con HTML por la red | Los carteles del HUD son HTML y los invitados pintarían lo que mande el anfitrión | Limitar a las etiquetas que ya se usan (`b`, `kbd`, `small`, `span`) al recibir |
| R7 | Las refactorizaciones rompen el juego de un jugador | Fallos en algo que hoy funciona | Hacerlas sin red de por medio, sistema a sistema, con las pruebas pasando en cada paso |
| R8 | Las estimaciones de peso están sin medir | El anfitrión sube más de lo previsto | Medir en la fase 2; bajar la cadencia de `foto` o mandar solo lo cercano a cada invitado |

## 6. Decisiones abiertas

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | ¿Nivel de búsqueda de la pandilla o de cada uno? | **De la pandilla.** Solo hay un municipal y una abuela, y es más divertido que te persigan por lo que ha roto tu amigo |
| D2 | ¿La invasión crece con los jugadores? | **Sí:** más marcianos a la vez y más culetazos para ganar, a ajustar jugando |
| D3 | ¿Modo foto en red? | **Sin parar el tiempo:** la cámara se suelta y tú quedas ocupado, pero el mundo sigue. Si queda raro, desactivarlo en red |
| D4 | ¿Cambiar de personaje a mitad de partida? | **Sí**, entre los libres, como ahora en la pausa |
| D5 | ¿Quién puede hacer de noche? | **Cualquiera**, con aviso de quién ha sido |
| D6 | ¿Entrar con la partida empezada? | **Sí**; es lo que hace falta cuando a alguien se le cae la conexión |
| D7 | ¿Minijuegos unos contra otros (carrera, trucos)? | **Más adelante**, como función aparte encima de esta |
