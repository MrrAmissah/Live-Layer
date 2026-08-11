#!/usr/bin/env python3
"""Transcribe continuously for a long run, reporting real-time factor as it drifts.

§5 items 5 and 6: "thermal behaviour over a 90-minute run, which is the length of a
service. A figure from a 30-second test is not a service."

**On thermal measurement, plainly:** `powermetrics` needs root, so die temperature
and fan speed are NOT sampled here. What is sampled is the observable that actually
matters for the decision — whether the machine keeps up. If Apple Silicon throttles,
inference slows, and RTF drifts upward across the run. A flat RTF curve over 90
minutes is evidence the recogniser stayed viable; it is not a temperature reading,
and this file does not claim to be one.

Emits one JSON object per line so a supervisor can watch it live and so a crash
leaves the completed iterations on disk rather than losing the run.
"""
from __future__ import annotations

import argparse, json, os, pathlib, sys, time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from benchmark import Recogniser, load_wav, peak_rss_mb, swap_used_mb  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--seconds", type=float, default=5400.0, help="default 90 minutes")
    ap.add_argument("--repo", default="KhayaAI/w2v-bert-en")
    ap.add_argument("--device", default="mps")
    ap.add_argument("--dtype", default="float32")
    ap.add_argument("--clip", default="120s.wav")
    # Chunking is not a tuning preference here: a 120-second clip in one forward pass
    # aborts on this machine (see benchmark.py), so a soak that did not chunk would
    # die on its first iteration instead of measuring 90 minutes.
    ap.add_argument("--chunk-seconds", type=float, default=30.0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ready-file", default="", help="touched once the model is loaded and warm")
    args = ap.parse_args()

    os.environ.setdefault("HF_HOME", str(pathlib.Path.home() / "LiveLayer-ASR-Eval" / "hf-cache"))
    wav = pathlib.Path(args.audio) / "duration" / args.clip
    audio, audio_seconds = load_wav(wav)

    rec = Recogniser(args.repo, args.device, args.dtype, chunk_seconds=args.chunk_seconds)
    rec.transcribe(audio)  # warm-up excluded from the curve

    if args.ready_file:
        pathlib.Path(args.ready_file).write_text(str(time.time()))

    out = open(args.out, "w", buffering=1)
    started = time.perf_counter()
    iteration = 0
    try:
        while time.perf_counter() - started < args.seconds:
            _, elapsed = rec.transcribe(audio)
            iteration += 1
            out.write(json.dumps({
                "iteration": iteration,
                "elapsed_run_seconds": round(time.perf_counter() - started, 1),
                "inference_seconds": round(elapsed, 4),
                "rtf": round(elapsed / audio_seconds, 5),
                "peak_rss_mb": round(peak_rss_mb(), 1),
                "swap_used_mb": round(swap_used_mb(), 1),
            }) + "\n")
            # Printed so a Monitor can watch the run without parsing the file.
            print(f"iter={iteration} elapsed={time.perf_counter()-started:.0f}s "
                  f"rtf={elapsed/audio_seconds:.4f}", flush=True)
    finally:
        out.close()
    print(f"soak complete: {iteration} iterations over {time.perf_counter()-started:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
