# Voces

Las voces del juego y lo que dicen. Son **ficticias**: ninguna es de una persona real. Cada una es
un audio de unos diez segundos diseñado con Qwen3-TTS VoiceDesign a partir de una descripción, y
[IndexTTS](../../mesa-de-doblaje/motores/indextts/README.md) lo clona para decir las frases del juego.

| Fichero | Qué es |
| --- | --- |
| `*.wav` | Las voces de referencia. Las nuevas tienen dos candidatas (`-s1` y `-s2`): la misma descripción con dos semillas, para elegir de oído |
| `voces.json` | De dónde sale cada voz: su descripción, su semilla y el texto que dice |
| `guion.json` | Qué frase dice cada voz y con qué tono |
| `escucha.html` | Todas las voces y todas las locuciones en una página, para oírlas sin jugar. Se abre tal cual, sin servidor. No está en git: se genera con `node tools/voz.mjs pagina` |

## El guion

- **`papeles`**: quién habla. Cada papel tiene una voz y un tono por defecto. Hoy hay dos: el
  `narrador`, que dice los avisos y los rótulos grandes, y `consejos`, que dice los consejos de los
  primeros minutos y los de los objetos.
- **`tonos`**: las intensidades del vector de emoción de IndexTTS (alegría, ira, tristeza, miedo,
  asco, melancolía, sorpresa y calma, de 0 a 1). Lo que el vector no suma lo pone la propia voz.
- **`lineas`**: cada frase, con su `papel`, el `texto` que sale en pantalla y, si hace falta, el
  `dicho` (lo que se oye: sin teclas, por ejemplo) y un `tono` distinto del de su papel.

El juego reconoce una frase por sus palabras, así que `texto` tiene que ser el del código, con o sin
emojis y negritas. Una frase sin locución, o con una parte que cambia (un nombre, un número), sale
en pantalla sin voz.

## Regenerar las locuciones

La síntesis se hace en el PC de juegos, con el motor de la mesa de doblaje:

```bash
node tools/voz.mjs encargo > encargo.json     # las frases del guion, con su voz y su vector
# en el PC: python tools/voz/sintetizar.py encargo.json <carpeta de voces> <salida>
# los .mp3 de la salida van a public/voz/
node tools/voz.mjs indice                     # apunta en public/voz/index.json las que hay
node tools/voz.mjs pagina                     # rehace escucha.html
```

Para comprobar que cada locución dice lo que toca sin oírlas todas, `tools/voz/transcribir.py` las
transcribe con Whisper en el PC y `node tools/voz.mjs comprobar oido.jsonl` lista las que no coinciden
con el guion. Avisa de más: no entiende a los marcianos ni las palabras en inglés («studs»,
«half-pipe»), así que lo que señala hay que oírlo.

`sintetizar.py` no repite lo que ya está en la salida: para rehacer una frase hay que borrar su
`.mp3` allí. Una voz nueva se diseña con `tools/voz/disenar.py`, que lee un `voces.json` como el de
esta carpeta.
