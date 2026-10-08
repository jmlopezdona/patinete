"""Diseña con Qwen3-TTS VoiceDesign las voces de voces.json que aún no tienen audio.

La descripción va en inglés y sin pedir acento: es como mejor salió en el spike
de voces de la mesa de doblaje. El idioma lo pone el texto.

Uso (en el entorno de qwen-tts, con voces.json al lado): python disenar.py
"""
import json
import time
from pathlib import Path

import soundfile as sf
import torch

from qwen_tts import Qwen3TTSModel

MODELO = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
AQUI = Path(__file__).parent
SALIDA = AQUI
plan = json.loads((AQUI / "voces.json").read_text(encoding="utf-8"))

modelo = Qwen3TTSModel.from_pretrained(
    MODELO, device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
print("cargado", flush=True)
for voz in plan["voces"]:
    destino = SALIDA / f"{voz['id']}.wav"
    if destino.exists():
        continue
    torch.manual_seed(voz["semilla"])
    torch.cuda.manual_seed_all(voz["semilla"])
    t = time.time()
    ondas, frecuencia = modelo.generate_voice_design(
        text=voz["texto"], language="Spanish", instruct=voz["descripcion"])
    sf.write(destino, ondas[0], frecuencia)
    print(json.dumps({"fichero": destino.name, "duracion_s": round(len(ondas[0]) / frecuencia, 2),
                      "gpu_s": round(time.time() - t, 2)}), flush=True)
print("FIN", flush=True)
