#!/usr/bin/env python3
"""The §5 benchmark: what a DONDO checkpoint actually costs on this machine.

Run from a virtualenv outside the repository (see README.md). Reads WAV files
produced by `make-audio.mjs`, loads weights from a local cache that is never
committed, and writes measurements as JSON. It imports nothing from LiveLayer and
LiveLayer imports nothing from it: this is a standalone measuring instrument, not
the `LiveTranscriptSource` of §4, which may not be built until Gate A is cleared.

## Why every measurement runs in its own subprocess

The first version measured every clip in one process and lost the whole run when
one of them was killed. A 120-second clip in a single forward pass exhausted memory
on this 16 GB machine and the kernel killed the process — no exception, no
traceback, no partial results, and the interesting fact (that it cannot be done)
went unrecorded.

Self-attention is quadratic in sequence length, so cost per audio second is NOT
constant: a real-time factor measured on 30 seconds does not predict 120. That is a
finding, not an inconvenience, and it is why chunked mode exists below. Each
(backend, clip, mode) combination is therefore a separate child process. A child
that dies is recorded with its signal and the sweep continues.

## What each number is worth

  * **Real-time factor** — inference wall-clock ÷ measured audio duration. A property
    of the machine and the model. Honest on synthetic audio.
  * **Latency to final** — reported WITH its chunk length. w2v-BERT + CTC is not a
    streaming architecture: it encodes a complete window, so the latency an operator
    feels is dominated by the window you buffer before running, not by model speed.
    An RTF of 0.05 still means a 15-second wait if you buffer 15 seconds. Quoting
    inference time alone as "latency" would be a false claim.
  * **Memory** — peak resident set of the child that did the work, so one clip's
    footprint is not hidden behind another's.
  * **Transcripts** — real recognition output, for the reference-outcome harness.
    Optimistic: synthetic read speech, silent room. See `make-audio.mjs`.
"""
from __future__ import annotations

import argparse, json, os, pathlib, resource, subprocess, sys, time, wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent

"""The DONDO multilingual language map, copied from the model card verbatim.

It is a GLOBAL map shared across every DONDO multilingual checkpoint, not a per-model
index — a model covering eight languages still uses `African English = 6`, not the
position of English in its own list. Assuming `0..L-1` would silently condition on the
wrong language and produce a confidently wrong transcript rather than an error.
"""
DONDO_LANGUAGE_MAP = {
    "Adangme": 0, "Akuapem Twi": 1, "Asante Twi": 2, "Dagbani": 3, "Dagaare": 4,
    "Ewe": 5, "African English": 6, "Fante": 7, "French": 8, "Ga": 9, "Gonja": 10,
    "Gurene": 11, "Hausa": 12, "Igbo": 13, "Kasem": 14, "Kikuyu": 15,
    "Konkomba (Likpakpaanl)": 16, "Konkomba (Likoonli)": 17, "Krio": 18,
    "Kusaal": 19, "Luo": 20, "Mampruli": 21, "Mende": 22, "Meru/Kimeru": 23,
    "Nzema": 24, "Pidgin": 25, "Shona": 26, "Swahili": 27, "Temne": 28,
    "Wali": 29, "Wolof": 30, "Yoruba": 31,
}


def load_wav(path) -> tuple[np.ndarray, float]:
    """Read a 16 kHz mono 16-bit WAV with the stdlib, so no audio library is a
    dependency and nothing resamples behind the measurement."""
    with wave.open(str(path), "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"{path}: expected 16kHz mono int16, got "
                             f"{w.getframerate()}Hz {w.getnchannels()}ch {w.getsampwidth()*8}bit")
        frames = w.readframes(w.getnframes())
        audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        return audio, w.getnframes() / 16000.0


def peak_rss_mb() -> float:
    # macOS reports ru_maxrss in bytes (Linux in kilobytes).
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)


def swap_used_mb() -> float:
    try:
        out = subprocess.run(["sysctl", "-n", "vm.swapusage"], capture_output=True, text=True).stdout
        return float([p for p in out.split() if p.endswith("M")][1][:-1])
    except Exception:
        return float("nan")


class Recogniser:
    """One loaded checkpoint on one backend. Deliberately thin — every millisecond
    it adds lands in the RTF."""

    def __init__(self, repo: str, device: str, dtype: str, language: str | None = None,
                 prefix_len: int = 1, chunk_seconds: float = 0.0):
        import torch
        from transformers import AutoProcessor, AutoModelForCTC

        self.torch = torch
        self.device = device
        self.torch_dtype = {"float32": torch.float32, "float16": torch.float16}[dtype]
        self.dtype_name = dtype
        self.repo = repo
        # None means monolingual: no prefix frames, because a monolingual checkpoint
        # has nothing to steer and prepending a frame would corrupt the input.
        self.language = language
        self.prefix_len = prefix_len
        self.chunk_seconds = chunk_seconds
        if language is not None and language not in DONDO_LANGUAGE_MAP:
            raise ValueError(f"unknown DONDO language {language!r}")

        t0 = time.perf_counter()
        self.processor = AutoProcessor.from_pretrained(repo)
        self.model = AutoModelForCTC.from_pretrained(repo, dtype=self.torch_dtype).to(device).eval()
        self.load_seconds = time.perf_counter() - t0

    def _add_language_prefix(self, features):
        """Prepend the one-hot language frames, exactly as the model card does it."""
        torch = self.torch
        lang_id = DONDO_LANGUAGE_MAP[self.language]
        _, dim = features.shape
        lang_vec = torch.zeros(dim, dtype=features.dtype)
        lang_vec[lang_id % dim] = 1.0
        prefix = lang_vec.unsqueeze(0).repeat(self.prefix_len, 1)
        return torch.cat([prefix, features], dim=0)

    def _forward(self, audio: np.ndarray) -> str:
        torch = self.torch
        extracted = self.processor(audio, sampling_rate=16000, return_tensors="pt")
        features = extracted.input_features[0]
        if self.language is not None:
            features = self._add_language_prefix(features)
        inputs = {"input_features": features.unsqueeze(0).to(self.device).to(self.torch_dtype)}
        with torch.no_grad():
            logits = self.model(**inputs).logits
        ids = torch.argmax(logits, dim=-1)
        if self.device == "mps":
            torch.mps.synchronize()  # MPS queues work; without this the timer lies.
        return self.processor.batch_decode(ids)[0]

    def transcribe(self, audio: np.ndarray) -> tuple[str, float]:
        """Feature extraction is inside the timed region: it is work the machine must
        do per utterance, and excluding it would report a number nobody experiences.

        In chunked mode the audio is cut into fixed windows and the pieces joined.
        This is deliberately the crudest possible segmentation — no overlap, no
        voice-activity detection, no boundary repair — because its purpose is to
        measure COST, and a smarter scheme would only be slower. It will cut words in
        half at the seams; the accuracy runs use whole utterances, never chunks.
        """
        t0 = time.perf_counter()
        if self.chunk_seconds and len(audio) > self.chunk_seconds * 16000:
            step = int(self.chunk_seconds * 16000)
            parts = [self._forward(audio[i:i + step]) for i in range(0, len(audio), step)]
            text = " ".join(p.strip() for p in parts if p.strip())
        else:
            text = self._forward(audio)
        return text, time.perf_counter() - t0


# --------------------------------------------------------------------------------
# Worker: one (backend, clip, mode) measurement, in its own process.
# --------------------------------------------------------------------------------

def run_worker(args) -> int:
    rec = Recogniser(args.repo, args.device, args.dtype, language=args.language,
                     chunk_seconds=args.chunk_seconds)
    out = {"device": args.device, "dtype": args.dtype, "chunk_seconds": args.chunk_seconds,
           "model_load_seconds": round(rec.load_seconds, 2)}

    if args.corpus_dir:
        manifest = json.loads((pathlib.Path(args.corpus_dir) / "manifest.json").read_text())
        first, _ = load_wav(manifest["corpus"][0]["wav"])
        rec.transcribe(first)  # warm-up
        results, times = [], []
        for item in manifest["corpus"]:
            audio, secs = load_wav(item["wav"])
            text, elapsed = rec.transcribe(audio)
            results.append({"index": item["index"], "reference": item["spoken"],
                            "hypothesis": text, "audio_seconds": round(secs, 3),
                            "inference_seconds": round(elapsed, 4)})
            times.append(elapsed)
        times.sort()
        out["corpus"] = {
            "utterances": len(results),
            "median_inference_seconds": round(times[len(times) // 2], 4),
            "p95_inference_seconds": round(times[min(int(len(times) * 0.95), len(times) - 1)], 4),
            "max_inference_seconds": round(times[-1], 4),
            "median_audio_seconds": round(sorted(r["audio_seconds"] for r in results)[len(results) // 2], 3),
        }
        out["transcripts"] = results
    else:
        audio, seconds = load_wav(args.clip)
        rec.transcribe(audio)  # warm-up: first call pays lazy kernel compilation
        times = []
        for _ in range(args.repeats):
            _, elapsed = rec.transcribe(audio)
            times.append(elapsed)
        times.sort()
        out.update({
            "clip": str(args.clip),
            "audio_seconds": round(seconds, 3),
            "repeats": args.repeats,
            "median_inference_seconds": round(times[len(times) // 2], 4),
            "min_inference_seconds": round(times[0], 4),
            "max_inference_seconds": round(times[-1], 4),
            "median_rtf": round(times[len(times) // 2] / seconds, 4),
            "worst_rtf": round(times[-1] / seconds, 4),
        })

    out["peak_rss_mb"] = round(peak_rss_mb(), 1)
    out["swap_used_mb"] = round(swap_used_mb(), 1)
    print("RESULT " + json.dumps(out), flush=True)
    return 0


# --------------------------------------------------------------------------------
# Driver: sweep backends and clips, isolating each measurement.
# --------------------------------------------------------------------------------

def spawn(args, extra: list[str], timeout: int) -> dict:
    cmd = [sys.executable, str(HERE / "benchmark.py"), "--worker", "--repo", args.repo]
    if args.language:
        cmd += ["--language", args.language]
    cmd += extra
    try:
        # errors="replace": a failing child can emit non-UTF-8 bytes on stderr, and a
        # decode error in the DRIVER would throw away every measurement still to come
        # — the same way the first version lost a whole sweep to one killed child.
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"failed": True, "reason": f"timed out after {timeout}s"}
    except Exception as exc:  # nothing a child does may end the sweep
        return {"failed": True, "reason": f"driver error: {type(exc).__name__}: {exc}"}
    for line in proc.stdout.splitlines():
        if line.startswith("RESULT "):
            return json.loads(line[len("RESULT "):])
    # A negative return code is a signal: -9 is the kernel's OOM killer, which is
    # the single most important failure this sweep can record.
    reason = f"exit {proc.returncode}"
    if proc.returncode is not None and proc.returncode < 0:
        reason = f"killed by signal {-proc.returncode}" + (" (out of memory)" if proc.returncode == -9 else "")
    tail = (proc.stderr or "").strip().splitlines()[-3:]
    return {"failed": True, "reason": reason, "stderr_tail": tail}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--audio", help="directory written by make-audio.mjs")
    ap.add_argument("--out")
    ap.add_argument("--repo", default="KhayaAI/w2v-bert-en")
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--backends", default="cpu:float32,mps:float32,mps:float16")
    ap.add_argument("--chunks", default="0,30,15", help="chunk seconds to try on long clips; 0 = single shot")
    ap.add_argument("--label", default="")
    ap.add_argument("--language", default=None,
                    help="DONDO language name for multilingual checkpoints, e.g. 'African English'.")
    ap.add_argument("--timeout", type=int, default=1800)
    # worker-only
    ap.add_argument("--clip")
    ap.add_argument("--corpus-dir")
    ap.add_argument("--device", default="mps")
    ap.add_argument("--dtype", default="float32")
    ap.add_argument("--chunk-seconds", type=float, default=0.0)
    args = ap.parse_args()

    os.environ.setdefault("HF_HOME", str(pathlib.Path.home() / "LiveLayer-ASR-Eval" / "hf-cache"))

    if args.worker:
        return run_worker(args)

    manifest = json.loads((pathlib.Path(args.audio) / "manifest.json").read_text())
    import platform
    report = {
        "label": args.label,
        "repo": args.repo,
        "language_prefix": args.language,
        "machine": {
            "arch": platform.machine(),
            "cpu": subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                  capture_output=True, text=True).stdout.strip(),
            "ram_gb": round(int(subprocess.run(["sysctl", "-n", "hw.memsize"],
                                               capture_output=True, text=True).stdout) / 2**30),
            "macos": platform.mac_ver()[0],
        },
        "audio": {"synthetic": manifest.get("synthetic"), "voice": manifest.get("voice"),
                  "words_per_minute": manifest.get("wordsPerMinute")},
        "runs": [],
    }

    chunk_options = [float(c) for c in args.chunks.split(",")]
    for spec in args.backends.split(","):
        device, _, dtype = spec.partition(":")
        dtype = dtype or "float32"
        print(f"=== {device}/{dtype} ===", flush=True)

        for clip in manifest["durationClips"]:
            for chunk in chunk_options:
                # Chunking a clip shorter than the window is the single-shot case
                # again; running it twice would pad the table with duplicates.
                if chunk and clip["seconds"] <= chunk:
                    continue
                row = spawn(args, ["--device", device, "--dtype", dtype, "--clip", clip["wav"],
                                   "--repeats", str(args.repeats), "--chunk-seconds", str(chunk)],
                            args.timeout)
                row.update({"target_seconds": clip["target"], "device": device, "dtype": dtype,
                            "chunk_seconds": chunk})
                report["runs"].append(row)
                if row.get("failed"):
                    print(f"  {clip['target']:>4}s chunk={chunk or 'none':>4}: FAILED — {row['reason']}", flush=True)
                else:
                    print(f"  {clip['target']:>4}s chunk={chunk or 'none':>4}: "
                          f"RTF {row['median_rtf']:.4f}  peak {row['peak_rss_mb']:.0f}MB", flush=True)

        print(f"  corpus ({device}/{dtype})", flush=True)
        row = spawn(args, ["--device", device, "--dtype", dtype, "--corpus-dir", args.audio], args.timeout)
        row.update({"corpus_run": True, "device": device, "dtype": dtype})
        report["runs"].append(row)
        if row.get("failed"):
            print(f"    FAILED — {row['reason']}", flush=True)
        else:
            print(f"    median {row['corpus']['median_inference_seconds']:.3f}s per utterance, "
                  f"peak {row['peak_rss_mb']:.0f}MB", flush=True)

    pathlib.Path(args.out).write_text(json.dumps(report, indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
