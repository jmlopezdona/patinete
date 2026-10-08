"""Transcribe con Whisper las locuciones de una carpeta, para comprobar que dicen lo que toca.

Uso (en un entorno con openai-whisper y GPU):
  python transcribir.py <large-v3.pt> <carpeta de .mp3> [id ...]

Escribe una línea de JSON por locución: su id y lo que se oye.
"""
import json
import sys
from pathlib import Path

import whisper

modelo = whisper.load_model(sys.argv[1], device="cuda")
carpeta, ids = Path(sys.argv[2]), sys.argv[3:]
for mp3 in sorted(carpeta.glob("*.mp3")):
    if ids and mp3.stem not in ids:
        continue
    r = modelo.transcribe(str(mp3), language="es", temperature=0.0, condition_on_previous_text=False)
    print(json.dumps({"id": mp3.stem, "oido": r["text"].strip()}, ensure_ascii=False), flush=True)
