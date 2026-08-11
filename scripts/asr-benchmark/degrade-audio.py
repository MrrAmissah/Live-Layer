#!/usr/bin/env python3
"""Degrade the synthetic corpus, to bracket the clean-room measurement from below.

The clean synthetic corpus is the most favourable input this recogniser can be
given (`make-audio.mjs`). A single favourable number is not a range, and the
question that decides anything is what happens as conditions get *worse* — because
a church is a reverberant room with a PA system and a congregation in it.

So this writes degraded copies at stated signal-to-noise ratios, optionally through
a crude synthetic room, and the corpus is re-scored against each. What that
produces is a **direction and a rough magnitude**: whether reference outcomes
degrade gracefully into refusals, or start producing wrong leading candidates.

**It is still not church audio, and it is not a substitute for §7's consented
recordings.** Gaussian noise is not a congregation; an exponentially-decaying
synthetic impulse is not a sanctuary; and neither touches the thing most likely to
break recognition in the real room — spontaneous, code-switched, accented speech
with a preacher moving relative to a microphone. It brackets. It does not settle.
"""
from __future__ import annotations

import argparse, json, pathlib, wave

import numpy as np


def read_wav(path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0


def write_wav(path, audio: np.ndarray) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((clipped * 32767).astype(np.int16).tobytes())


def room_impulse(rt60: float, rng: np.random.Generator, sr: int = 16000) -> np.ndarray:
    """A crude exponentially-decaying noise burst standing in for a room.

    Deliberately crude and labelled as such: a real impulse response has early
    reflections with structure, and this has none. It reproduces the one property
    that matters most for a CTC encoder — energy from a phoneme smearing into the
    next one — and nothing else about a real sanctuary.
    """
    length = int(rt60 * sr)
    decay = np.exp(-6.9 * np.arange(length) / length)  # -60 dB over rt60
    impulse = rng.standard_normal(length) * decay
    impulse[0] += 1.0  # keep the direct path dominant
    return impulse / np.abs(impulse).sum()


def degrade(audio: np.ndarray, snr_db: float | None, rt60: float, rng) -> np.ndarray:
    out = audio
    if rt60 > 0:
        out = np.convolve(out, room_impulse(rt60, rng))[: len(audio)]
    if snr_db is not None:
        # SNR against THIS clip's own power, so a quiet clip is not silently given a
        # gentler noise floor than a loud one.
        signal_power = np.mean(out**2)
        noise_power = signal_power / (10 ** (snr_db / 10))
        out = out + rng.standard_normal(len(out)) * np.sqrt(noise_power)
    peak = np.abs(out).max()
    return out / peak * 0.95 if peak > 0.95 else out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True, help="directory written by make-audio.mjs")
    ap.add_argument("--snr", type=float, default=None, help="signal-to-noise ratio in dB")
    ap.add_argument("--rt60", type=float, default=0.0, help="reverb tail in seconds; 0 disables")
    ap.add_argument("--name", required=True, help="subdirectory name for this condition")
    ap.add_argument("--seed", type=int, default=11, help="fixed so a condition reproduces exactly")
    args = ap.parse_args()

    src = pathlib.Path(args.audio)
    manifest = json.loads((src / "manifest.json").read_text())
    dest = src.parent / args.name
    (dest / "corpus").mkdir(parents=True, exist_ok=True)
    (dest / "duration").mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(args.seed)
    out_corpus = []
    for item in manifest["corpus"]:
        audio = read_wav(item["wav"])
        target = dest / "corpus" / pathlib.Path(item["wav"]).name
        write_wav(target, degrade(audio, args.snr, args.rt60, rng))
        out_corpus.append({**item, "wav": str(target)})

    # The duration clips carry over untouched: they exist to measure COST at a known
    # length, and noise does not change how long a clip is.
    (dest / "manifest.json").write_text(json.dumps({
        **manifest,
        "synthetic": True,
        "degradation": {"snr_db": args.snr, "rt60_seconds": args.rt60, "seed": args.seed},
        "corpus": out_corpus,
    }, indent=2))
    print(f"wrote {len(out_corpus)} degraded clips to {dest} "
          f"(snr={args.snr} dB, rt60={args.rt60}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
