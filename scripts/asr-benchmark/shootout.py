#!/usr/bin/env python3
"""Run several local recognisers over identical audio and record what each returns.

The first human microphone test failed on the first reference: "John three
sixteen" came back as `"jon thr ixteen"` and the parser correctly refused. A
further lexical patch — `thr` → three, `ixteen` → sixteen — would tune the parser
to observed failures rather than fix the recognition, so the question became
which local recogniser supplies better evidence to the SAME downstream system.

## The rules this obeys

- **One frozen parser.** Nothing downstream changes between engines. This script
  emits transcripts; scoring happens in the TypeScript suite that already exists,
  against the same `scoreCorpus` used for every previous number.
- **Identical audio.** Every engine gets the same float32 arrays, already through
  the same endpointer. An engine is never handed a file another engine did not
  get.
- **No repair.** Transcripts are recorded verbatim. Fixing a candidate's errors
  during the comparison would decide the comparison.
- **Local only.** Weights come from disk. Nothing is uploaded and no hosted
  transcription is contacted.
- **Nothing retained.** Transcripts of synthetic speech are written to a results
  file; no microphone audio is recorded by this script at all.

## What is measured, and why each

Generic WER is not the selection rule — a recogniser that hears every word except
the book name is useless here, and one that mangles ordinary prose but nails
"Romans eight twenty eight" is exactly what this product wants. So alongside
transcripts this records what the 400 ms progressive snapshot architecture
actually needs to know: how inference time varies with the LENGTH of the audio,
because a model that pads every input to a fixed window costs the same for 0.6 s
as for 5 s, and the existing cadence was justified on the opposite assumption.
"""
from __future__ import annotations

import argparse, json, pathlib, resource, sys, time, wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SR = 16000


def read_wav(path: str) -> np.ndarray:
    with wave.open(path) as w:
        if w.getframerate() != SR:
            raise SystemExit(f"{path}: expected {SR} Hz, got {w.getframerate()}")
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def peak_rss_mb() -> float:
    # macOS reports ru_maxrss in bytes; Linux in kilobytes.
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return raw / (1024 * 1024) if sys.platform == "darwin" else raw / 1024


class Dondo:
    """The incumbent: w2v-BERT 2.0 + CTC, the checkpoint Stage 5 benchmarked."""

    name = "dondo"

    def __init__(self, repo: str, device: str = "mps", dtype: str = "float32"):
        from benchmark import Recogniser

        self.model = Recogniser(repo, device, dtype, language=None)
        self.detail = f"w2v-BERT CTC · {device}/{dtype}"

    def transcribe(self, audio: np.ndarray) -> str:
        text, _ = self.model.transcribe(audio)
        return text.strip()


class MlxWhisper:
    """Whisper family under MLX, which is the Apple-native runtime that fits.

    Chosen over whisper.cpp for a structural reason, stated so it can be argued
    with: the recogniser is called in-process every 400 ms by a Python service
    that already exists, and whisper.cpp would mean either a subprocess per
    snapshot — process start per call, at a cadence measured in hundreds of
    milliseconds — or a second binding layer to build and maintain. MLX is a
    Python call against the same Metal device the incumbent already uses. If its
    measured latency had failed the cadence, that reasoning would not have saved
    it; it is here because it passed.
    """

    def __init__(self, repo: str, name: str):
        import mlx_whisper

        self.mlx_whisper = mlx_whisper
        self.repo = repo
        self.name = name
        self.detail = f"MLX · {repo}"

    def transcribe(self, audio: np.ndarray) -> str:
        # English is forced rather than detected: the incumbent is an English
        # checkpoint, so letting Whisper spend time deciding would compare two
        # different tasks. `temperature=0` for a deterministic first pass —
        # determinism is measured separately and reported, not assumed.
        out = self.mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=self.repo,
            language="en",
            temperature=0.0,
            condition_on_previous_text=False,
            fp16=True,
        )
        return out["text"].strip()


def build(engine: str, args) -> object:
    if engine == "dondo":
        return Dondo(args.dondo_repo)
    if engine == "turbo":
        return MlxWhisper(args.turbo_repo, "whisper-large-v3-turbo")
    if engine == "distil":
        return MlxWhisper(args.distil_repo, "distil-whisper-large-v3")
    raise SystemExit(f"unknown engine {engine}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=["dondo", "turbo", "distil"])
    ap.add_argument("--clips", required=True, help="JSON list of {key, wav, spoken}")
    ap.add_argument("--out", required=True)
    ap.add_argument("--repeats", type=int, default=1, help=">1 measures determinism")
    ap.add_argument("--dondo-repo", default=str(pathlib.Path.home() / "LiveLayer-ASR-Eval/models/w2v-bert-en"))
    ap.add_argument("--turbo-repo", default="mlx-community/whisper-large-v3-turbo")
    ap.add_argument("--distil-repo", default="mlx-community/distil-whisper-large-v3")
    args = ap.parse_args()

    clips = json.load(open(args.clips))

    load_started = time.perf_counter()
    engine = build(args.engine, args)
    load_seconds = time.perf_counter() - load_started

    # The FIRST inference of a process pays wake-up and any lazy compilation. It is
    # recorded separately rather than folded into the median, because the operator
    # pays it exactly once and averaging it in would misreport both numbers.
    warm_started = time.perf_counter()
    engine.transcribe(np.zeros(SR, dtype=np.float32))
    cold_seconds = time.perf_counter() - warm_started

    results = []
    for clip in clips:
        audio = read_wav(clip["wav"])
        runs = []
        for _ in range(args.repeats):
            started = time.perf_counter()
            text = engine.transcribe(audio)
            runs.append({"text": text, "seconds": round(time.perf_counter() - started, 4)})
        results.append({
            **clip,
            "seconds_audio": round(len(audio) / SR, 3),
            "text": runs[0]["text"],
            "inference": runs[0]["seconds"],
            # Identical across repeats or not — reported, never assumed. The
            # provisional stability rule downstream counts consecutive agreements,
            # which is only meaningful if the recogniser is deterministic.
            "deterministic": len({r["text"] for r in runs}) == 1 if args.repeats > 1 else None,
            "runs": runs if args.repeats > 1 else None,
        })
        print(f"  {clip.get('key', clip['wav'])[:28]:28s} {results[-1]['inference']:6.3f}s  {results[-1]['text']!r}",
              flush=True)

    payload = {
        "engine": args.engine,
        "detail": engine.detail,
        "loadSeconds": round(load_seconds, 3),
        "coldFirstInferenceSeconds": round(cold_seconds, 4),
        "peakRssMb": round(peak_rss_mb(), 1),
        "clips": results,
    }
    pathlib.Path(args.out).write_text(json.dumps(payload, indent=1))
    print(f"load {load_seconds:.1f}s  cold {cold_seconds:.2f}s  peak RSS {payload['peakRssMb']:.0f} MB -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
