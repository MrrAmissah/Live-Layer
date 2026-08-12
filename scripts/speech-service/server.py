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

from dataclasses import replace

from segmenter import Segmenter, DEFAULT_CONFIG, load_vad

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "asr-benchmark"))

SR = 16000


# 12 bytes of header before the PCM: session, sequence, control.
#
# The uplink is now a CONTINUOUS STREAM rather than pre-segmented utterances. The
# browser used to decide what counted as speech and send only that; it decided
# badly in both directions at once — quiet speech discarded, silence forwarded —
# and no threshold could fix it, because loudness is not what separates a voice
# from a room. Segmentation moved to the server, behind Silero, so the browser now
# transports audio and owns no judgement about it.
#
# `session` still travels with every frame: Stop → Start must be a completely
# independent stream, and audio from a session the operator has ended must not be
# able to arrive late and be segmented into the next one.
UPLINK = struct.Struct("<IIi")

CONTROL_AUDIO = 0
CONTROL_START = 1
CONTROL_STOP = 2


def parse_uplink(message: bytes):
    """(session, sequence, control, pcm) — or None if unheadered."""
    if len(message) < UPLINK.size:
        return None
    session, sequence, control = UPLINK.unpack_from(message, 0)
    pcm = np.frombuffer(message, dtype=np.int16, offset=UPLINK.size).astype(np.float32) / 32768.0
    return session, sequence, control, pcm


async def handle(websocket, recogniser, vad, config, verbose: bool, keep_warm_seconds: float = 0.0) -> None:
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
    #: One segmenter per connection, holding this session's Silero state.
    segmenter = Segmenter(model=vad, config=config)
    #: The session the operator is currently listening in, or None between them.
    live_session: int | None = None
    utterance_no = 0

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
                # The operator may have stopped while this was on the GPU. The
                # browser refuses late results by session anyway, but a stopped
                # session should not be answered at all — an inference nobody can
                # act on is only a way for a stale transcript to exist.
                if job["session"] != live_session:
                    if verbose:
                        print(f"  dropped result for stopped session {job['session']}", flush=True)
                    continue
                last_served["at"] = time.perf_counter()
                text, inference = recogniser.transcribe(job["pcm"])
                last_served["at"] = time.perf_counter()
                if verbose:
                    # Shape and timing only — never the transcript, which is the
                    # content of what someone said (docs/ASR_EVALUATION.md §7).
                    kind = "final" if job["final"] else "prov"
                    print(f"  {kind} u{job['utterance']}r{job['revision']} "
                          f"{len(job['pcm'])/SR:.2f}s -> {inference:.3f}s "
                          f"({len(text.strip())} chars)", flush=True)
                # Checked again HERE, not only before the decode. Inference takes
                # ~0.8 s and the job is usually already running when Stop arrives,
                # so the earlier check almost never fires — this is the one that
                # actually keeps a stopped session's transcript off the wire.
                if job["session"] != live_session:
                    if verbose:
                        print(f"  dropped result for stopped session {job['session']}", flush=True)
                    continue
                await websocket.send(json.dumps({
                    "type": "transcript",
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
                    "type": "transcript",
                    "session": job["session"], "utterance": job["utterance"],
                    "revision": job["revision"], "final": job["final"],
                    "text": "", "error": f"{type(exc).__name__}",
                }))

    task = asyncio.create_task(worker())
    warm = asyncio.create_task(keep_warm(recogniser, keep_warm_seconds, verbose))
    try:
        async for message in websocket:
            if isinstance(message, str):
                # The only text frame understood is a ping; anything else is ignored
                # rather than interpreted — this endpoint has no command surface.
                await websocket.send(json.dumps({"ok": True}))
                continue
            frame = parse_uplink(message)
            if frame is None:
                continue
            session, _sequence, control, pcm = frame

            if control == CONTROL_START:
                # A new listening session. Silero carries recurrent state between
                # frames, so inheriting it would mean judging the first frames of
                # this session against the tail of the last one.
                live_session = session
                segmenter.reset()
                utterance_no = 0
                pending = None
                if verbose:
                    print(f"  session {session} start", flush=True)
                # Positively acknowledge. The browser must not infer readiness from
                # `WebSocket.onopen`: the socket being open says the transport
                # exists, not that this session's VAD state has been reset and the
                # server is willing to segment its audio. Now that the server owns
                # segmentation, that distinction is the difference between "the
                # first thing you say is heard" and "the first thing you say is fed
                # to a segmenter still holding the last session's state".
                await websocket.send(json.dumps({"type": "ready", "session": session}))
                continue

            if control == CONTROL_STOP:
                # Everything in flight belongs to a session the operator has ended.
                live_session = None
                segmenter.reset()
                pending = None
                if verbose:
                    print(f"  session {session} stop", flush=True)
                continue

            # Audio from a session that has been stopped, or from before the
            # current one began, is discarded rather than segmented. Without this a
            # frame still in the socket buffer at Stop could open an utterance in
            # the NEXT session.
            if live_session is None or session != live_session:
                continue

            for event in segmenter.push(pcm):
                if event.kind == "speech-start":
                    utterance_no += 1
                    await websocket.send(json.dumps(
                        {"type": "vad", "session": session, "utterance": utterance_no, "speech": True}
                    ))
                    continue
                if event.audio is None:
                    continue

                final = event.kind == "final"
                if final:
                    await websocket.send(json.dumps(
                        {"type": "vad", "session": session, "utterance": utterance_no, "speech": False}
                    ))
                job = {"session": session, "utterance": utterance_no, "revision": event.revision,
                       "final": final, "pcm": event.audio}
                if pending is not None:
                    # Something newer arrived before the old one started. Drop it
                    # here, where it costs nothing, rather than on the GPU.
                    if pending["final"] and not final:
                        continue  # never displace a final with a provisional
                    stats["dropped"] += 1
                    stats["max_depth"] = max(stats["max_depth"], 2)
                pending = job
                waiting.set()
    finally:
        task.cancel()
        warm.cancel()


# When the recogniser last did real work, so the idle heartbeat can stay out of
# the way. A dict because it is written from the request path and read from the
# heartbeat, and both are plain closures over module state.
last_served = {"at": 0.0}


async def keep_warm(recogniser, every: float, verbose: bool) -> None:
    """Keep the GPU resident **while an operator is listening**, because their
    first reference is the one that decides whether they trust this.

    Warming once at startup is not enough, and measurement is why: the same
    half-second clip costs **2.29 s** on the first request after the service has
    sat idle and 0.05 s on every request after it. Not lazy compilation — that was
    paid at startup — but Metal releasing what it is not using. A service is
    started before a meeting and then left alone, so warming at startup warms the
    wrong moment.

    Scoped to a CONNECTION rather than to the process, and that is deliberate.
    Pressing "Start listening" opens the socket seconds before anyone speaks,
    which is exactly when the wake-up should be paid; the rest of the time nobody
    is listening and there is nothing to keep warm. Each beat costs about a
    second of GPU — the wake-up itself, not the audio, which is why shortening the
    buffer did not help — so burning that continuously against an idle machine
    would be paying a real cost for nothing.
    """
    if every <= 0:
        return
    # Faint noise, not digital zeros. Silence is a degenerate input — the first
    # version of this used 0.5 s of zeros and each heartbeat cost 1.4 s, more than
    # ten times a real utterance of the same length, because the decode has nothing
    # to anchor on. It is also 0.2 s rather than 0.5 s: this exists to keep Metal
    # resident, and the shortest buffer that does that is the cheapest way to.
    rng = np.random.default_rng(7)
    tick = (rng.standard_normal(int(SR * 0.2)) * 1e-3).astype(np.float32)
    first = True
    while True:
        if not first:
            await asyncio.sleep(every)
            # Never warm a recogniser that is already working. Inference is
            # synchronous and shares this event loop, so a beat in progress DELAYS
            # the next real utterance by however long it takes — measured doing
            # exactly that, with an operator's first snapshot waiting 1.5 s behind
            # a beat it had no way to see.
            #
            # Only PERIODIC beats are skipped this way. The beat below, on connect,
            # is unconditional: this guard once suppressed it too, on the reasoning
            # that a recent request meant the GPU was still warm, and the very next
            # measurement disproved it — a connection opened seconds after another
            # one closed skipped its warm and paid 1.5 s on the operator's first
            # word. Recency of work is not evidence of residency.
            if time.perf_counter() - last_served["at"] < every:
                continue
        # The connection has just opened. Pay the wake-up NOW, while the operator
        # is still reaching for the microphone, rather than on their first word.
        first = False
        started = time.perf_counter()
        recogniser.transcribe(tick)
        if verbose:
            print(f"  warm {time.perf_counter() - started:.3f}s", flush=True)



class WhisperMlx:
    """Whisper large-v3-turbo under MLX. The primary recogniser.

    Chosen by measurement, not preference — `docs/ASR_EVALUATION.md` §10 has the
    whole comparison. The short version: against the frozen 83-case held-out
    corpus it puts the correct reference at the top of the operator's card 72.3%
    of the time against the incumbent's 38.6%, at the same 3.6% wrong-lead rate,
    while refusing 24% of utterances instead of 58%. The incumbent's apparent
    safety was mostly silence.

    ## Two properties that are NOT like the model it replaces

    **Inference time does not depend on how much audio you send.** Whisper pads
    every input to a 30-second window internally, so a 0.8 s snapshot and a 4.4 s
    snapshot both cost about 0.75 s. The 400 ms snapshot cadence was justified
    against a model whose cost grew with the audio and was ~0.13 s for a whole
    utterance; that reasoning does not transfer, and the cadence was re-derived
    from these measurements rather than re-tuned.

    **It hallucinates on degenerate input rather than returning nothing.** A CTC
    model emits blanks for silence; Whisper is a language model with an audio
    encoder and will happily invent text — and, on one measured occasion, loop for
    277 seconds on a second of digital zeros. Hence noise rather than silence
    everywhere this warms itself, and hence `no_speech_threshold` left at its
    default so the decoder can still say "nothing here".
    """

    def __init__(self, repo: str, language: str | None):
        import mlx_whisper

        self.mlx_whisper = mlx_whisper
        self.repo = repo
        self.language = language or "en"

    def transcribe(self, pcm: np.ndarray):
        started = time.perf_counter()
        out = self.mlx_whisper.transcribe(
            pcm,
            path_or_hf_repo=self.repo,
            language=self.language,
            # Greedy and unconditioned. The provisional stability rule downstream
            # counts CONSECUTIVE agreeing revisions, which only means anything if
            # the recogniser returns the same text for the same audio; temperature
            # fallback would make agreement a coin-flip. Measured deterministic
            # across repeated runs of every gate phrase.
            temperature=0.0,
            condition_on_previous_text=False,
            fp16=True,
        )
        return out["text"].strip(), time.perf_counter() - started


class DondoCtc:
    """The incumbent, kept for comparison rather than for production.

    Retained because a recogniser swap is exactly the kind of change that wants a
    way back, and because the human A/B that decides this runs both. It is one
    flag, not a provider-selection surface: the operator has no reason to know
    either name.
    """

    def __init__(self, repo: str, device: str, dtype: str, language: str | None):
        from benchmark import Recogniser

        self.model = Recogniser(repo, device, dtype, language=language)

    def transcribe(self, pcm: np.ndarray):
        return self.model.transcribe(pcm)


DEFAULT_REPOS = {
    "whisper": "mlx-community/whisper-large-v3-turbo",
    "dondo": str(pathlib.Path.home() / "LiveLayer-ASR-Eval/models/w2v-bert-en"),
}


def load_engine(args):
    repo = args.repo or DEFAULT_REPOS[args.engine]
    if args.engine == "whisper":
        print(f"loading {repo} on MLX/Metal …", flush=True)
        return WhisperMlx(repo, args.language or None)
    print(f"loading {repo} on {args.device}/{args.dtype} …", flush=True)
    return DondoCtc(repo, args.device, args.dtype, args.language or None)


async def main_async(args) -> int:
    try:
        import websockets
    except ImportError:
        print("websockets is not installed:\n"
              "  uv pip install --python ~/LiveLayer-ASR-Eval/venv/bin/python websockets",
              file=sys.stderr)
        return 2

    recogniser = load_engine(args)
    print("loading Silero VAD …", flush=True)
    vad = load_vad()
    config = replace(DEFAULT_CONFIG, first_snapshot_ms=args.first_snapshot_ms,
                     snapshot_every_ms=args.snapshot_every_ms)
    # Warm up before announcing readiness, so the first utterance of a service does
    # not pay lazy kernel compilation while the operator is waiting. Faint noise
    # rather than digital silence: Whisper decodes silence by looping, and one
    # measured warm-up on a second of zeros took 277 seconds to return.
    rng = np.random.default_rng(11)
    recogniser.transcribe((rng.standard_normal(SR) * 1e-3).astype(np.float32))
    # "ready" is announced only AFTER the socket is bound.
    #
    # It used to be printed first, so an occupied 4179 told the operator the
    # service was ready and then died underneath the message with EADDRINUSE.
    # That happened during this stage's own testing, which is how it was found: a
    # readiness line that can precede the failure it implicitly denies is worse
    # than no line at all.
    async with websockets.serve(
        lambda ws: handle(ws, recogniser, vad, config, args.verbose, args.keep_warm_seconds),
        args.host, args.port, max_size=32 * 1024 * 1024
    ):
        print(f"ready on ws://{args.host}:{args.port} — local only, no audio is stored", flush=True)
        await asyncio.Future()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="whisper", choices=["whisper", "dondo"],
                    help="which local recogniser to run; whisper is the measured winner")
    ap.add_argument("--repo", default="", help="override the checkpoint for the chosen engine")
    ap.add_argument("--host", default="127.0.0.1",
                    help="localhost by default; changing it exposes audio to the network")
    ap.add_argument("--port", type=int, default=4179)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--dtype", default="float32")
    ap.add_argument("--language", default="", help="DONDO language for multilingual checkpoints")
    ap.add_argument("--verbose", action="store_true", help="log timings — never transcripts")
    ap.add_argument("--first-snapshot-ms", type=int, default=DEFAULT_CONFIG.first_snapshot_ms,
                    help="voiced speech before the FIRST provisional look")
    ap.add_argument("--snapshot-every-ms", type=int, default=DEFAULT_CONFIG.snapshot_every_ms,
                    help="voiced speech between subsequent provisional looks")
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
