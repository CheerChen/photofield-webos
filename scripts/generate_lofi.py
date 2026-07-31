#!/usr/bin/env python3
"""Generate four original, deterministic lofi loops bundled with the app.

No samples or third-party compositions are used. The simple electric-piano,
bass, percussion, and tape-noise voices are synthesized with Python's standard
library, then encoded to MP3 with ffmpeg.
"""

from array import array
import math
from pathlib import Path
import random
import subprocess
import tempfile
import wave

RATE = 22_050
BARS = 8
OUT = Path(__file__).resolve().parents[1] / "assets" / "audio"

TRACKS = {
    "red": {
        "bpm": 72,
        "seed": 403,
        "chords": [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]],
        "melody": [76, 72, 69, 67, 69, 72, 76, 79],
    },
    "green": {
        "bpm": 68,
        "seed": 404,
        "chords": [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [55, 59, 62, 65]],
        "melody": [67, 69, 71, 74, 72, 69, 67, 64],
    },
    "yellow": {
        "bpm": 82,
        "seed": 405,
        "chords": [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67]],
        "melody": [72, 76, 74, 72, 69, 67, 69, 72],
    },
    "blue": {
        "bpm": 64,
        "seed": 406,
        "chords": [[50, 53, 57, 60, 64], [46, 50, 53, 57], [53, 57, 60, 64], [48, 52, 55, 62]],
        "melody": [69, 65, 64, 60, 62, 64, 65, 69],
    },
}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def voice(freq, t):
    # Soft Rhodes-like odd harmonics with a faint detuned tine.
    return (
        math.sin(2 * math.pi * freq * t)
        + 0.30 * math.sin(2 * math.pi * freq * 2.01 * t)
        + 0.12 * math.sin(2 * math.pi * freq * 3.0 * t)
    )


def render(name, spec, wav_path):
    beat_len = 60.0 / spec["bpm"]
    bar_len = beat_len * 4
    duration = bar_len * BARS
    count = int(duration * RATE)
    rng = random.Random(spec["seed"])
    pcm = array("h")

    for i in range(count):
        t = i / RATE
        bar = int(t / bar_len)
        bar_t = t - bar * bar_len
        beat_pos = bar_t / beat_len
        beat = int(beat_pos)
        beat_t = (beat_pos - beat) * beat_len
        chord = spec["chords"][bar % len(spec["chords"])]

        attack = min(1.0, bar_t / 0.035)
        chord_env = attack * (0.44 + 0.56 * math.exp(-bar_t * 0.75))
        left = right = 0.0
        for ni, note in enumerate(chord):
            tone = voice(hz(note), t) * chord_env * 0.075
            pan = -0.45 + 0.9 * ni / max(1, len(chord) - 1)
            left += tone * (1.0 - pan * 0.35)
            right += tone * (1.0 + pan * 0.35)

        root = hz(chord[0] - 12)
        bass_env = min(1.0, beat_t / 0.018) * math.exp(-beat_t * 2.2)
        bass = math.sin(2 * math.pi * root * t) * bass_env * 0.16
        left += bass
        right += bass

        phrase = int((bar * 4 + beat) / 2) % len(spec["melody"])
        phrase_t = (beat_pos % 2) * beat_len
        melody_env = min(1.0, phrase_t / 0.025) * math.exp(-phrase_t * 1.8)
        melody = voice(hz(spec["melody"][phrase]), t) * melody_env * 0.045
        left += melody * 0.8
        right += melody * 1.2

        if beat % 2 == 0 and beat_t < 0.42:
            kick_env = math.exp(-beat_t * 11)
            kick_f = 48 + 55 * math.exp(-beat_t * 18)
            kick = math.sin(2 * math.pi * kick_f * beat_t) * kick_env * 0.24
            left += kick
            right += kick

        if beat % 2 == 1 and beat_t < 0.28:
            snare = rng.uniform(-1, 1) * math.exp(-beat_t * 16) * 0.11
            left += snare * 1.05
            right += snare * 0.95

        half_t = (beat_pos * 2 % 1) * (beat_len / 2)
        if half_t < 0.07:
            hat = rng.uniform(-1, 1) * math.exp(-half_t * 55) * 0.032
            left += hat * 0.8
            right += hat * 1.2

        # Sparse deterministic tape crackle rather than continuous white noise.
        if rng.random() < 0.00065:
            crackle = rng.uniform(-0.045, 0.045)
            left += crackle
            right -= crackle * 0.7

        edge = min(1.0, t / 0.025, (duration - t) / 0.025)
        left = math.tanh(left * 1.35) * edge
        right = math.tanh(right * 1.35) * edge
        pcm.append(max(-32767, min(32767, int(left * 32767))))
        pcm.append(max(-32767, min(32767, int(right * 32767))))

    with wave.open(str(wav_path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(pcm.tobytes())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, spec in TRACKS.items():
            wav_path = Path(tmp) / f"lofi-{name}.wav"
            mp3_path = OUT / f"lofi-{name}.mp3"
            print(f"rendering {mp3_path.name}...")
            render(name, spec, wav_path)
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(wav_path), "-af", "lowpass=f=9500,alimiter=limit=0.92",
                "-codec:a", "libmp3lame", "-b:a", "96k", str(mp3_path),
            ], check=True)

    (OUT / "README.md").write_text(
        "# Lofi loops\n\n"
        "These four tracks are original deterministic syntheses generated by "
        "`scripts/generate_lofi.py`. They use no external samples or compositions.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
