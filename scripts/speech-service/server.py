#!/usr/bin/env python3
"""The local recogniser: PCM in over a WebSocket, text out. Nothing else.

This is the "separate inference process" `docs/ASR_EVALUATION.md` §4 required. The
0.6B encoder lives here and never enters the browser, which has to composite
graphics at frame rate.

## What it will not do

- **No network egress.** Binds 127.0.0.1 by default and talks to nobody. Audio is
  never uploaded anywhere; §7's consent rules exist because recording people is a
  matter of dignity, and the simplest way to honour them is a process that cannot
  send audio off the machine.
- **No storage.** Audio is recognised and dropped. Nothing is written to disk —
  not the audio, and not the transcript, because a verbatim transcript of a sermon
  carries the same content and the same obligations as the recording (§7).
- **No commands.** It returns text. It cannot stage, queue, accept or Take, and it
  has no idea those concepts exist.

## Running it

    ~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/server.py \
        --repo ~/LiveLayer-ASR-Eval/models/w2v-bert-en

The control surface degrades to typing when this is not running, which is the
normal state: the operator starts it deliberately before a service.
"""
from __future__ import annotations

import argparse, asyncio, json, pathlib, struct, sys, time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "asr-benchmark"))

SR = 16000


# 16 bytes of header before the PCM: session, utterance, revision, final flag.
# Identity travels WITH the audio because arrival order is not identity — a slow
# provisional result can land after the final one it was superseded by, and
# "whatever arrived last" would then overwrite the authoritative answer.
HEADER = struct.Struct("<IIIi")


def parse_frame(message: bytes):
    """(session, utterance, revision, is_final, pcm) — or None if unheadered."""
    if len(message) < HEADER.size:
        return None
    session, utterance, revision, final = HEADER.unpack_from(message, 0)
    pcm = np.frombuffer(message, dtype=np.int16, offset=HEADER.size).astype(np.float32) / 32768.0
    return session, utterance, revision, bool(final), pcm


async def handle(websocket, recogniser, verbose: bool) -> None:
    """One connection, one worker, a slot for the newest provisional request.

    Progressive recognition sends a snapshot every few hundred milliseconds while
    someone is speaking, so a naive server queues five inferences and answers the
    first one seconds late. Provisional work is DISPOSABLE: only the newest pending
    snapshot is kept, anything older is dropped before it costs GPU time, and a
    FINAL request replaces whatever is waiting because it is the only answer that
    has to be right.
    """
    pending: dict | None = None          # the one queued request, newest wins
    waiting = asyncio.Event()
    stats = {"dropped": 0, "max_depth": 0}

    async def worker():
        nonlocal pending
        while True:
            await waiting.wait()
            waiting.clear()
            job, pending = pending, None
            if job is None:
                continue
            try:
                started = time.perf_counter()
                text, inference = recogniser.transcribe(job["pcm"])
                if verbose:
                    # Shape and timing only — never the transcript, which is the
                    # content of what someone said (docs/ASR_EVALUATION.md §7).
                    kind = "final" if job["final"] else "prov"
                    print(f"  {kind} u{job['utterance']}r{job['revision']} "
                          f"{len(job['pcm'])/SR:.2f}s -> {inference:.3f}s "
                          f"({len(text.strip())} chars)", flush=True)
                await websocket.send(json.dumps({
                    "session": job["session"],
                    "utterance": job["utterance"],
                    "revision": job["revision"],
                    "final": job["final"],
                    "text": text.strip(),
                    "inference_seconds": round(inference, 4),
                    "total_seconds": round(time.perf_counter() - started, 4),
                    "dropped": stats["dropped"],
                }))
            except Exception as exc:  # a bad frame must not kill the session
                await websocket.send(json.dumps({
                    "session": job["session"], "utterance": job["utterance"],
                    "revision": job["revision"], "final": job["final"],
                    "text": "", "error": f"{type(exc).__name__}",
                }))

    task = asyncio.create_task(worker())
    try:
        async for message in websocket:
            if isinstance(message, str):
                # The only text frame understood is a ping; anything else is ignored
                # rather than interpreted — this endpoint has no command surface.
                await websocket.send(json.dumps({"ok": True}))
                continue
            frame = parse_frame(message)
            if frame is None:
                continue
            session, utterance, revision, final, pcm = frame
            if len(pcm) < SR // 10:  # under 100 ms is not an utterance
                continue
            job = {"session": session, "utterance": utterance, "revision": revision,
                   "final": final, "pcm": pcm}
            if pending is not None:
                # Something newer arrived before the old one started. Drop it here,
                # where it costs nothing, rather than on the GPU.
                if pending["final"] and not final:
                    continue  # never displace a final with a provisional
                stats["dropped"] += 1
                stats["max_depth"] = max(stats["max_depth"], 2)
            pending = job
            waiting.set()
    finally:
        task.cancel()


async def keep_warm(recogniser, every: float, verbose: bool) -> None:
    """Keep the GPU resident, because the operator's FIRST reference is the one
    that decides whether they trust this.

    Warming once at startup is not enough and measurement is why: the same
    half-second clip costs **2.29 s** on the first request after the service has
    sat idle, and 0.05 s on every request after it. Not lazy compilation — that
    was already paid — but Metal releasing what it is not using. A service is
    started deliberately before a meeting and then left alone for an hour, which
    is exactly the gap that produces the cold number, and the operator pays it on
    the first thing they say.

    So a heartbeat of silence every few seconds. It cannot overlap a real request:
    inference is synchronous and this shares the event loop with the worker, so
    the two take strict turns. Nothing is transmitted, nothing is stored, and the
    audio is zeros.
    """
    if every <= 0:
        return
    silence = np.zeros(int(SR * 0.5), dtype=np.float32)
    while True:
        await asyncio.sleep(every)
        started = time.perf_counter()
        recogniser.transcribe(silence)
        if verbose:
            print(f"  warm {time.perf_counter() - started:.3f}s", flush=True)


async def main_async(args) -> int:
    try:
        import websockets
    except ImportError:
        print("websockets is not installed:\n"
              "  uv pip install --python ~/LiveLayer-ASR-Eval/venv/bin/python websockets",
              file=sys.stderr)
        return 2

    from benchmark import Recogniser

    print(f"loading {args.repo} on {args.device}/{args.dtype} …", flush=True)
    recogniser = Recogniser(args.repo, args.device, args.dtype,
                            language=args.language or None)
    # Warm up before announcing readiness, so the first utterance of a service does
    # not pay lazy kernel compilation while the operator is waiting.
    recogniser.transcribe(np.zeros(SR, dtype=np.float32))
    print(f"ready on ws://{args.host}:{args.port} — local only, no audio is stored", flush=True)

    warm = asyncio.create_task(keep_warm(recogniser, args.keep_warm_seconds, args.verbose))

    try:
        async with websockets.serve(
            lambda ws: handle(ws, recogniser, args.verbose),
            args.host, args.port, max_size=32 * 1024 * 1024
        ):
            await asyncio.Future()
    finally:
        warm.cancel()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="local checkpoint directory")
    ap.add_argument("--host", default="127.0.0.1",
                    help="localhost by default; changing it exposes audio to the network")
    ap.add_argument("--port", type=int, default=4179)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--dtype", default="float32")
    ap.add_argument("--language", default="", help="DONDO language for multilingual checkpoints")
    ap.add_argument("--verbose", action="store_true", help="log timings — never transcripts")
    ap.add_argument("--keep-warm-seconds", type=float, default=15.0,
                    help="idle heartbeat that keeps the GPU resident; 0 disables it")
    args = ap.parse_args()
    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\nstopped", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
