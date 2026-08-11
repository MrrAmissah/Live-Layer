#!/usr/bin/env python3
"""Utterance endpointing, and the latency it actually costs.

Stage 5 measured the live-assist pipeline as fixed windows: buffer 15 or 30
seconds, run the model, emit. Real-time factor was 0.037 and latency-to-final was
**15.6 seconds**, because what the operator waits for is the window, not the model.
That is not a speed problem and no faster checkpoint fixes it.

This replaces the window with an endpoint: detect when the speaker stopped, and run
the model on exactly that utterance. The wait becomes the hangover — the silence
required before "they have finished" is a safe conclusion — plus inference on a
2-3 second clip instead of a 30-second one.

## What this is NOT

**It is not streaming.** w2v-BERT + CTC encodes a complete utterance; that has not
changed and cannot be changed by anything here. This is utterance-batch inference
behind a voice-activity detector, and calling it streaming would be a false claim
about the architecture. The honest description is: the operator waits for the
speaker to stop, plus a fixed hangover, plus one short inference.

**It is not a general VAD.** Energy-based endpointing with an adaptive noise floor
is adequate for a lapel or pulpit mic and will behave badly in a room with music
under the speech. A neural VAD is a provider decision, not a benchmark step.

## The two latencies, kept apart

`endpoint_delay` is structural: the hangover, paid on every utterance no matter how
fast the model is. `inference_seconds` is the model. Reporting their sum as one
number is how a slow pipeline gets described as a fast one, so this reports both
and their sum separately.
"""
from __future__ import annotations

import argparse, json, pathlib, sys, time, wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SR = 16000
FRAME_MS = 20
FRAME = SR * FRAME_MS // 1000


def frame_energies(audio: np.ndarray) -> np.ndarray:
    """RMS per 20 ms frame, in dBFS. dB rather than linear because speech level
    varies by ~40 dB between a whisper and a shout, and a linear threshold tuned
    for one is wrong for the other."""
    usable = len(audio) - (len(audio) % FRAME)
    frames = audio[:usable].reshape(-1, FRAME)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-10))


def segment_utterances(
    audio: np.ndarray,
    hangover_ms: int = 500,
    min_speech_ms: int = 250,
    threshold_db: float = 12.0,
    pad_ms: int = 150,
) -> list[tuple[int, int]]:
    """Utterance spans as (start_sample, end_sample).

    `threshold_db` is measured ABOVE an adaptive noise floor rather than as an
    absolute level, so the same settings work for a quiet room and a loud PA. The
    floor is the 10th percentile of frame energy: in speech with pauses, the
    quietest tenth is silence by construction.

    `hangover_ms` is the decision: how much silence must pass before the speaker is
    judged to have finished. It is the dominant term in latency-to-final and the
    one real tuning knob — too short splits an utterance across a breath, too long
    makes the operator wait.

    `pad_ms` re-attaches a little audio either side, because energy onset lags the
    actual start of a plosive and clipping it costs the first phoneme — which for
    this application is usually the book name.
    """
    if len(audio) < FRAME:
        return []
    energies = frame_energies(audio)
    floor = float(np.percentile(energies, 10))
    speech = energies > floor + threshold_db

    hangover = max(1, hangover_ms // FRAME_MS)
    min_speech = max(1, min_speech_ms // FRAME_MS)
    pad = pad_ms * SR // 1000

    spans: list[tuple[int, int, int]] = []
    start: int | None = None
    silence = 0
    for i, is_speech in enumerate(speech):
        if is_speech:
            if start is None:
                start = i
            silence = 0
        elif start is not None:
            silence += 1
            if silence >= hangover:
                end = i - silence + 1
                if end - start >= min_speech:
                    spans.append((
                        max(0, start * FRAME - pad),
                        min(len(audio), end * FRAME + pad),
                        # WHEN the detector concluded, not where it cut. The span end
                        # backs the hangover out so the clip is tight, but the operator
                        # waits until this moment — reporting the cut point as the
                        # latency would understate it by the whole hangover, which is
                        # the dominant term.
                        (i + 1) * FRAME,
                    ))
                start = None
                silence = 0
    if start is not None and len(speech) - start >= min_speech:
        # End of audio: no hangover was needed, the stream simply stopped.
        spans.append((max(0, start * FRAME - pad), len(audio), len(audio)))
    return spans


def read_wav(path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def write_wav(path, audio: np.ndarray) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())


def build_stream(clips: list[pathlib.Path], gap_seconds: float, out: pathlib.Path) -> list[dict]:
    """Concatenate utterances with silence between them, recording where each one
    truly ends. Knowing the true end is the whole point: it is what makes
    "speaker-end to final transcript" a MEASUREMENT rather than an estimate."""
    parts: list[np.ndarray] = []
    truth: list[dict] = []
    gap = np.zeros(int(gap_seconds * SR), dtype=np.float32)
    cursor = 0
    parts.append(gap)
    cursor += len(gap)
    for clip in clips:
        audio = read_wav(clip)
        parts.append(audio)
        truth.append({"clip": clip.name, "start": cursor, "true_end": cursor + len(audio)})
        cursor += len(audio)
        parts.append(gap)
        cursor += len(gap)
    write_wav(out, np.concatenate(parts))
    return truth


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True, help="directory written by make-audio.mjs")
    ap.add_argument("--repo", required=True, help="local checkpoint directory")
    ap.add_argument("--out", required=True)
    ap.add_argument("--clips", type=int, default=20)
    ap.add_argument("--gap", type=float, default=0.8, help="silence between utterances")
    ap.add_argument("--hangover", type=int, default=500)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--dtype", default="float32")
    args = ap.parse_args()

    audio_dir = pathlib.Path(args.audio)
    manifest = json.loads((audio_dir / "manifest.json").read_text())
    clips = [pathlib.Path(item["wav"]) for item in manifest["corpus"][: args.clips]]

    stream_path = audio_dir / "endpoint-stream.wav"
    truth = build_stream(clips, args.gap, stream_path)
    stream = read_wav(stream_path)

    spans = segment_utterances(stream, hangover_ms=args.hangover)

    from benchmark import Recogniser

    rec = Recogniser(args.repo, args.device, args.dtype)
    rec.transcribe(read_wav(clips[0]))  # warm-up, excluded

    rows = []
    for start, end, decided_at in spans:
        segment = stream[start:end]
        text, inference = rec.transcribe(segment)
        nearest = min(truth, key=lambda t: abs(t["true_end"] - end))
        # Speaker-end to detector-decision. This is the hangover, paid on every
        # utterance regardless of model speed, and it is measured from where the
        # audio ACTUALLY stopped rather than from where the clip was cut.
        endpoint_delay = (decided_at - nearest["true_end"]) / SR
        rows.append({
            "clip": nearest["clip"],
            "audio_seconds": round(len(segment) / SR, 3),
            "endpoint_delay_seconds": round(endpoint_delay, 3),
            "inference_seconds": round(inference, 4),
            "latency_to_final_seconds": round(endpoint_delay + inference, 3),
            "hypothesis": text,
        })

    med = lambda xs: round(float(np.median(xs)), 3)
    p95 = lambda xs: round(float(np.percentile(xs, 95)), 3)
    report = {
        "config": {"hangover_ms": args.hangover, "gap_seconds": args.gap,
                   "device": args.device, "dtype": args.dtype, "frame_ms": FRAME_MS},
        "architecture": "utterance-batch inference behind energy VAD — NOT streaming",
        "utterances_expected": len(truth),
        "utterances_detected": len(spans),
        "endpoint_delay_seconds": {"median": med([r["endpoint_delay_seconds"] for r in rows]),
                                   "p95": p95([r["endpoint_delay_seconds"] for r in rows])},
        "inference_seconds": {"median": med([r["inference_seconds"] for r in rows]),
                              "p95": p95([r["inference_seconds"] for r in rows])},
        "latency_to_final_seconds": {"median": med([r["latency_to_final_seconds"] for r in rows]),
                                     "p95": p95([r["latency_to_final_seconds"] for r in rows])},
        "utterances": rows,
    }
    pathlib.Path(args.out).write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in
                      ("utterances_expected", "utterances_detected", "endpoint_delay_seconds",
                       "inference_seconds", "latency_to_final_seconds")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
