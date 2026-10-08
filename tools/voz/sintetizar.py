"""Dice con IndexTTS las líneas de un encargo (el de `node tools/voz.mjs encargo`).

Cada línea sale con su voz como timbre y su vector de emoción, sin referencia
de emoción. Usa el motor `indextts` de la mesa de doblaje sin la mesa, como el
spike de vídeo: su runtime, su receta de fábrica y su unión de referencias. Una
toma que acaba cortada se repite con la semilla siguiente. Los .mp3 salen todos
a la misma sonoridad (`igualar.py`, que va en la misma carpeta). Reanudable: lo
que ya está en la salida no se repite.

Uso (con MESA_MODELOS, y el paquete del motor y `colas.py` en el PYTHONPATH):
  python sintetizar.py encargo.json <carpeta de voces> <salida> [semilla]

Para rehacer una frase que no ha quedado bien: borrar su .mp3 de la salida y
volver a llamar con otra semilla (un número que se suma a la de siempre).
"""
import io
import json
import sys
import time
import wave
from pathlib import Path

import numpy as np
from motor_indextts import audio, modelos, runtime
from motor_indextts.manifiesto import EMOCIONES, manifiesto
from motor_indextts.receta import EMOCION_DEL_TIMBRE, peticion_de_audiocpp

import colas
from igualar import a_mp3

SEMILLA = 20261008
INTENTOS = 3
PICO = 0.89  # -1 dBFS

encargo = json.load(open(sys.argv[1], encoding="utf-8"))
voces, salida = Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()
semilla = SEMILLA + (int(sys.argv[4]) if len(sys.argv) > 4 else 0)
(salida / "wav").mkdir(parents=True, exist_ok=True)
fabrica = {q.nombre: q.valor_de_fabrica for q in manifiesto().parametros}


def muestras(wav: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(wav), "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        return x.reshape(-1, w.getnchannels()).mean(axis=1), w.getframerate()


def guardar(m: np.ndarray, hz: int, ruta: Path) -> None:
    m = m * (PICO / max(float(np.abs(m).max()), 1e-6))
    with wave.open(str(ruta), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(hz)
        w.writeframes((m * 32767).astype("<i2").tobytes())


servidor = runtime.Servidor(modelos.exigir(modelos.raiz_del_almacen()), salida / "servidor")
servidor.arrancar()
timbres: dict[str, Path] = {}
resumen = []
try:
    for x in encargo:
        mp3 = salida / f'{x["id"]}.mp3'
        if mp3.is_file():
            continue
        if x["voz"] not in timbres:
            carpeta = salida / "timbres" / x["voz"]
            carpeta.mkdir(parents=True, exist_ok=True)
            timbres[x["voz"]] = audio.escribir_referencia_unida([voces / f'{x["voz"]}.wav'], carpeta)
        receta = {**fabrica, "emo_audio_prompt": EMOCION_DEL_TIMBRE, "use_emo_vector": True}
        receta |= {f"emo_vector_{e}": v for e, v in zip(EMOCIONES, x["vector"], strict=True)}
        gpu = 0.0
        for intento in range(INTENTOS):
            peticion = peticion_de_audiocpp(
                receta, texto=x["texto"], idioma="es-ES", semilla=semilla + intento,
                timbre=str(timbres[x["voz"]]), original=None)
            t0 = time.monotonic()
            m, hz = muestras(servidor.sintetizar(peticion))
            gpu += time.monotonic() - t0
            final = colas.analizar(m, hz)["clase"]
            if final != "cortada":
                break
        wav = salida / "wav" / f'{x["id"]}.wav'
        guardar(m, hz, wav)
        sube = a_mp3(wav, mp3)
        fila = {"id": x["id"], "voz": x["voz"], "toma_s": round(len(m) / hz, 2), "gpu_s": round(gpu, 2),
                "intentos": intento + 1, "final": final, "sube_db": sube, "texto": x["texto"]}
        resumen.append(fila)
        print(json.dumps(fila, ensure_ascii=False), flush=True)
finally:
    servidor.terminar()
    with open(salida / "sintesis.jsonl", "a", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in resumen)
print("FIN", len(resumen), "tomas", flush=True)
