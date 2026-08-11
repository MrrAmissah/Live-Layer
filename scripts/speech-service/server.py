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


async def handle(websocket, recogniser, verbose: bool) -> None:
    async for message in websocket:
        if isinstance(message, str):
            # The only text frame understood is a ping; anything else is ignored
            # rather than interpreted, because this endpoint has no command surface.
            await websocket.send(json.dumps({"ok": True}))
            continue
        try:
            pcm = np.frombuffer(message, dtype=np.int16).astype(np.float32) / 32768.0
            if len(pcm) < SR // 10:  # under 100 ms is not an utterance
                await websocket.send(json.dumps({"text": ""}))
                continue
            started = time.perf_counter()
            text, inference = recogniser.transcribe(pcm)
            if verbose:
                # Length and timing only. The transcript is NOT logged: it is the
                # content of what someone said, and this process does not keep it.
                print(f"  {len(pcm)/SR:.2f}s audio -> {inference:.3f}s inference "
                      f"({len(text.strip())} chars)", flush=True)
            await websocket.send(json.dumps({
                "text": text.strip(),
                "inference_seconds": round(inference, 4),
                "total_seconds": round(time.perf_counter() - started, 4),
            }))
        except Exception as exc:  # a bad frame must not kill the session
            await websocket.send(json.dumps({"text": "", "error": f"{type(exc).__name__}"}))


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

    async with websockets.serve(
        lambda ws: handle(ws, recogniser, args.verbose),
        args.host, args.port, max_size=32 * 1024 * 1024
    ):
        await asyncio.Future()
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
    args = ap.parse_args()
    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\nstopped", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
