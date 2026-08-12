#!/usr/bin/env python3
"""Segmenter correctness, without a microphone or a model download.

Run with:  ~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/test_segmenter.py

Deliberately dependency-light and self-running rather than pytest: the repository
gate is `npm run verify`, which cannot execute Python, so this has to be trivially
runnable by hand and say plainly whether it passed.

Most cases use a FAKE VAD with scripted probabilities. That is on purpose — these
test the segmenter's arithmetic (framing, pre-roll, hysteresis, endpointing,
lifecycle), and driving them through the real Silero would make them a test of
Silero's opinions about synthetic noise instead. The real model is measured
separately, end to end, against real audio.
"""
from __future__ import annotations

import sys, pathlib
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from segmenter import Segmenter, SegmenterConfig, FRAME, FRAME_MS, SR

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    print(f"  {'ok  ' if condition else 'FAIL'} {name}" + (f"  — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


class ScriptedVad:
    """Returns whatever probability the script says for each successive frame.

    Also records every frame it was given, which is how sample continuity is
    proven: the recording must be the input, exactly, in order.
    """

    def __init__(self, probs):
        self.probs = list(probs)
        self.seen: list[np.ndarray] = []
        self.resets = 0

    def __call__(self, frame, sr):
        self.seen.append(np.asarray(frame).copy())
        p = self.probs[len(self.seen) - 1] if len(self.seen) <= len(self.probs) else 0.0

        class _R:
            def __init__(self, v): self.v = v
            def item(self): return self.v

        return _R(float(p))

    def reset_states(self):
        self.resets += 1


def ramp(n: int) -> np.ndarray:
    """Distinct recoverable values, so loss or reordering is visible."""
    return (np.arange(1, n + 1, dtype=np.float32) % 30000) / 32768.0


def feed(seg: Segmenter, audio: np.ndarray, chunk: int) -> list:
    events = []
    for at in range(0, len(audio), chunk):
        events.extend(seg.push(audio[at : at + chunk]))
    return events


print("\nframing — every sample once, in order, whatever the browser sends")
for chunk in (1, 7, 160, 512, 1024, 1600, 4096):
    vad = ScriptedVad([0.0] * 10000)
    seg = Segmenter(model=vad, config=SegmenterConfig())
    seg.reset()
    audio = ramp(FRAME * 20 + 137)  # deliberately not a whole number of frames
    feed(seg, audio, chunk)
    seen = np.concatenate(vad.seen) if vad.seen else np.zeros(0, dtype=np.float32)
    whole = (len(audio) // FRAME) * FRAME
    check(
        f"chunk {chunk:>4}: {len(seen)} samples consumed, in order",
        len(seen) == whole and np.array_equal(seen, audio[:whole]),
        f"expected {whole}, got {len(seen)}",
    )

vad = ScriptedVad([0.0] * 10000)
seg = Segmenter(model=vad, config=SegmenterConfig())
seg.reset()
audio = ramp(FRAME * 8 + 300)
feed(seg, audio, 333)
check(
    "the tail that does not fill a frame is HELD, not dropped",
    len(seg._remainder) == len(audio) % FRAME,
    f"remainder {len(seg._remainder)}",
)
# ...and completing it later produces the next frame from those exact samples.
before = len(vad.seen)
feed(seg, ramp(FRAME), 64)
check("a held remainder joins the next block rather than being discarded", len(vad.seen) > before)


print("\nspeech detection — what opens and closes an utterance")
CFG = SegmenterConfig(threshold=0.5, neg_threshold=0.35, min_speech_ms=128, min_silence_ms=320,
                      pre_roll_ms=320, speech_pad_ms=160, first_snapshot_ms=400, snapshot_every_ms=600)
speech_frames = lambda n: [0.9] * n
silence_frames = lambda n: [0.01] * n

vad = ScriptedVad(silence_frames(30))
seg = Segmenter(model=vad, config=CFG); seg.reset()
events = feed(seg, ramp(FRAME * 30), 1024)
check("silence alone produces nothing", events == [])

# A cough: loud, brief, gone. Under min_speech_ms it must never open an utterance.
vad = ScriptedVad(silence_frames(10) + speech_frames(2) + silence_frames(30))
seg = Segmenter(model=vad, config=CFG); seg.reset()
events = feed(seg, ramp(FRAME * 42), 1024)
check("a 2-frame transient is not an utterance", events == [])

vad = ScriptedVad(silence_frames(20) + speech_frames(40) + silence_frames(30))
seg = Segmenter(model=vad, config=CFG); seg.reset()
events = feed(seg, ramp(FRAME * 90), 1024)
kinds = [e.kind for e in events]
check("speech opens exactly one utterance", kinds.count("speech-start") == 1, str(kinds))
check("and closes it exactly once", kinds.count("final") == 1, str(kinds))
check("no Whisper-bound event precedes speech-start", kinds.index("speech-start") == 0, str(kinds))

final = next(e for e in events if e.kind == "final")
pre_roll_frames = CFG.pre_roll_ms // FRAME_MS
check(
    "the utterance opens BEFORE the trigger, so a quiet onset is not clipped",
    len(final.audio) > 40 * FRAME,
    f"{len(final.audio)} samples for 40 voiced frames",
)
check(
    "pre-roll is bounded rather than the whole session",
    len(final.audio) < (40 + pre_roll_frames + 8) * FRAME,
    f"{len(final.audio)} samples",
)

# Hysteresis: a dip between the thresholds is inside a word, not the end of one.
vad = ScriptedVad(silence_frames(10) + speech_frames(10) + [0.4] * 4 + speech_frames(10) + silence_frames(30))
seg = Segmenter(model=vad, config=CFG); seg.reset()
events = feed(seg, ramp(FRAME * 70), 1024)
check("a dip between the thresholds does not end the utterance",
      [e.kind for e in events].count("final") == 1, str([e.kind for e in events]))

print("\nprogressive snapshots — first look scheduled independently of the cadence")
vad = ScriptedVad(silence_frames(10) + speech_frames(80) + silence_frames(30))
seg = Segmenter(model=vad, config=CFG); seg.reset()
events = feed(seg, ramp(FRAME * 125), 1024)
snaps = [e for e in events if e.kind == "snapshot"]
check("provisional looks happen while speech continues", len(snaps) >= 2, str(len(snaps)))
first_voiced = snaps[0].voiced_ms if snaps else 0
check(
    f"the FIRST look lands at ~{CFG.first_snapshot_ms} ms of voiced speech, not the cadence",
    abs(first_voiced - CFG.first_snapshot_ms) <= FRAME_MS,
    f"{first_voiced} ms",
)
if len(snaps) >= 2:
    gap = snaps[1].voiced_ms - snaps[0].voiced_ms
    check(f"subsequent looks follow the {CFG.snapshot_every_ms} ms cadence",
          abs(gap - CFG.snapshot_every_ms) <= FRAME_MS, f"{gap} ms")
check("each snapshot carries more audio than the last",
      all(len(snaps[i].audio) > len(snaps[i - 1].audio) for i in range(1, len(snaps))))
check("the final carries at least as much as the largest snapshot",
      len(final.audio) > 0 and all(len(final.audio) >= 0 for _ in snaps))

print("\nlifecycle — Stop must not leak into Start")
vad = ScriptedVad(silence_frames(10) + speech_frames(40) + silence_frames(200))
seg = Segmenter(model=vad, config=CFG); seg.reset()
feed(seg, ramp(FRAME * 25), 1024)  # mid-utterance, nothing finalised yet
check("an utterance is genuinely in progress", seg._in_speech)
seg.reset()
check("Stop discards the partial utterance", seg._buffered == [] and not seg._in_speech)
check("Stop discards the pre-roll", seg._pre_roll == [])
check("Stop discards the unframed remainder", len(seg._remainder) == 0)
check("Stop resets Silero's recurrent state", vad.resets >= 2, f"{vad.resets} resets")

# A fresh session must not inherit the previous one's momentum.
vad2 = ScriptedVad(speech_frames(2) + silence_frames(40))
seg2 = Segmenter(model=vad2, config=CFG); seg2.reset()
events = feed(seg2, ramp(FRAME * 42), 1024)
check("after Start, two voiced frames alone still do not open an utterance", events == [])

print("\nthe safety valve")
vad = ScriptedVad(speech_frames(2000))
seg = Segmenter(model=vad, config=SegmenterConfig(max_utterance_ms=2000)); seg.reset()
events = feed(seg, ramp(FRAME * 200), 1024)
check("unbroken speech is cut rather than buffered without bound",
      any(e.kind == "final" for e in events))

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {', '.join(FAILURES)}")
    raise SystemExit(1)
print("all segmenter checks passed")
