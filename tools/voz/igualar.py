"""Pasa a .mp3 las tomas de una salida de `sintetizar.py`, todas a la misma sonoridad.

Con el mismo pico, una voz grave se oye más baja que una chillona: lo que se
iguala es la sonoridad (LUFS), y un limitador sujeta los picos que la subida
saca del tope. Una toma muy baja no sube más de TOPE_DB, para no aplastarla.

Uso: python igualar.py <salida> [id ...]

Rehace los .mp3 de <salida> a partir de <salida>/wav, todos o los que se digan.
"""
import re
import subprocess
import sys
from pathlib import Path

LUFS = -17.0
TOPE_DB = 6.0
PICO = 0.84  # -1,5 dBFS: el mp3 se pasa un poco del pico de su wav


def sonoridad(wav: Path) -> float:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav), "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", check=True).stderr
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", r[r.rindex("Summary:"):])[1])


def a_mp3(wav: Path, mp3: Path) -> float:
    """Escribe el .mp3 de una toma y devuelve los dB que ha subido (o bajado)."""
    i = sonoridad(wav)
    # Una toma tan corta que no llega a medirse se queda como está
    sube = min(LUFS - i, TOPE_DB) if i > -60 else 0.0
    filtro = f"volume={sube:.2f}dB,alimiter=limit={PICO}:level=false:attack=5:release=50:latency=true"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", filtro, "-ac", "1",
                    "-c:a", "libmp3lame", "-b:a", "64k", str(mp3)], check=True)
    return round(sube, 1)


if __name__ == "__main__":
    salida, ids = Path(sys.argv[1]).resolve(), sys.argv[2:]
    for wav in sorted((salida / "wav").glob("*.wav")):
        if ids and wav.stem not in ids:
            continue
        print(wav.stem, a_mp3(wav, salida / f"{wav.stem}.mp3"), flush=True)
