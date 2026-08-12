#!/usr/bin/env python3
"""Server-side speech segmentation: continuous PCM in, utterances out.

This replaces the browser's energy-threshold endpointer, which failed human
testing in **both** directions at once — the operator had to lean toward the
microphone for normal speech to register, and silence still reached Whisper often
enough to produce its party trick:

    3 seconds of digital silence  ->  "Thank you."

Those are not two bugs to be traded off against each other with a better dB
threshold. They are what an amplitude gate does: loudness is simply not what
distinguishes a voice from a room, so any threshold that admits a quiet speaker
also admits a fan, and any threshold that excludes the fan excludes the speaker.

Silero is a small trained model that answers the actual question — *is this
frame speech?* — and it runs at roughly 255x real time on this machine
(0.126 ms per 32 ms frame, measured warm), so asking it about every frame of a
live service costs almost nothing.

## Why the whole gate moved to the server

The browser could have kept a coarse energy pre-filter with Silero behind it.
That would have been strictly worse: Silero can only recover speech it is allowed
to see, and the energy gate's failure mode is discarding exactly the quiet speech
we are trying to rescue. A prerequisite it cannot overrule is a ceiling on how
good this can get, so the browser now transports audio and measures a meter, and
owns no decision about whether anyone spoke.

## What is never sent

Audio is recognised and dropped. Nothing here is written to disk — not the audio
and not the transcript — and nothing leaves the machine.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Iterator

import numpy as np

SR = 16000
#: Silero v6 accepts exactly this many samples per call at 16 kHz. It is not a
#: tunable: the model's internal state machine is defined on 32 ms steps.
FRAME = 512
FRAME_MS = FRAME * 1000 // SR  # 32


@dataclass(frozen=True)
class SegmenterConfig:
    """Everything below was chosen by sweeping, not by convention. See §10.2 of
    docs/ASR_EVALUATION.md for the measurements that produced these values."""

    #: Speech probability at which a frame counts as voiced.
    threshold: float = 0.5
    #: Lower bar for *staying* in speech. Hysteresis stops a brief dip mid-word —
    #: a stop consonant, a breath between clauses — from ending the utterance.
    neg_threshold: float = 0.35
    #: Voiced audio required before speech is declared at all. Rejects a cough.
    min_speech_ms: int = 128
    #: Silence required to call the end of an utterance. The dominant latency term
    #: — it is added directly to the time between the speaker stopping and the
    #: passage appearing, so it was chosen against a measured split curve rather
    #: than a convention:
    #:
    #:     pause held together?   160  192  256  320  384  448  512
    #:     200 ms hesitation       y    y    y    y    y    y    y
    #:     300 ms hesitation       n    y    y    y    y    y    y
    #:     400 ms hesitation       n    n    n    y    y    y    y
    #:
    #: 320 ms holds a 300 ms mid-reference hesitation together and saves 180 ms
    #: against the browser hangover it replaces. Beyond that the speaker has
    #: genuinely paused, and the split is survivable: "John chapter three" resolves
    #: to John 3 and "verse sixteen" arrives as a correction, which is a path that
    #: already exists and works.
    min_silence_ms: int = 320
    #: Audio kept from BEFORE the trigger, so a quiet onset is not clipped.
    pre_roll_ms: int = 320
    #: Audio kept after the last voiced frame, so a trailing consonant survives.
    speech_pad_ms: int = 160
    #: Safety valve. If this fires in normal use, something else is wrong.
    max_utterance_ms: int = 15000
    #: Voiced audio before the FIRST provisional look.
    #:
    #: Genuinely independent of the cadence, which is the whole point — the old
    #: shape was effectively `max(first, every)` so the cadence always won, and
    #: lowering the first threshold measured as changing nothing at all.
    #:
    #: Measured end to end at real-time rate, median over four utterances:
    #:
    #:     first look at   first transcript after speech starts
    #:        300 ms                1381 ms
    #:        400 ms                1452 ms
    #:        500 ms                1708 ms
    #:
    #: The ordering matches the theory and the sample is small (n=4, and one clip
    #: at 500 ms landed at 1078 ms while another took 1728 ms), so this is chosen
    #: on a consistent direction rather than a decisive gap. An early look often
    #: decodes to a fragment; that is a transcript appearing sooner, and the
    #: provisional stability rule already refuses to promote a reading no second
    #: revision agrees with.
    first_snapshot_ms: int = 300
    #: Voiced audio between subsequent provisional looks.
    snapshot_every_ms: int = 600


DEFAULT_CONFIG = SegmenterConfig()


@dataclass
class Event:
    """Something the caller must act on. `audio` is present for snapshot/final."""

    kind: str  # 'speech-start' | 'snapshot' | 'final' | 'speech-end'
    audio: np.ndarray | None = None
    revision: int = 0
    #: Voiced milliseconds behind this event, for latency accounting.
    voiced_ms: int = 0


@dataclass
class Segmenter:
    """One listening session's worth of state. Never shared between sessions."""

    model: object
    config: SegmenterConfig = DEFAULT_CONFIG

    # --- accumulator -----------------------------------------------------------
    #: Samples that arrived but do not yet fill a frame.
    #:
    #: This is the whole of the sample-continuity guarantee. Browser audio
    #: callbacks are whatever size the browser feels like (1024 is common, but it
    #: is not a contract) and Silero needs exactly 512. An earlier version of the
    #: browser-side framer solved this by DROPPING the remainder on every
    #: callback, which silently discarded 6.25% of every second of speech in a
    #: regular comb. The remainder is carried; every sample is consumed once.
    _remainder: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.float32))

    # --- pre-roll --------------------------------------------------------------
    _pre_roll: list[np.ndarray] = field(default_factory=list)

    # --- utterance -------------------------------------------------------------
    _buffered: list[np.ndarray] = field(default_factory=list)
    _in_speech: bool = False
    _voiced_frames: int = 0
    _silent_frames: int = 0
    #: Frames of *voiced* audio when the last snapshot was taken.
    _last_snapshot_voiced: int = -1
    _revision: int = 0
    #: Provisional frames held before speech is confirmed, so a confirmed
    #: utterance still contains the audio that triggered it.
    _pending: list[np.ndarray] = field(default_factory=list)

    def reset(self) -> None:
        """Forget everything. Called on Start and on Stop.

        Silero carries recurrent state between frames, so a session that inherited
        it would be judging its first frames against the tail of a previous
        conversation. `reset_states` is not optional hygiene — it is what makes
        Stop → Start a genuinely independent stream.
        """
        if hasattr(self.model, "reset_states"):
            self.model.reset_states()
        self._remainder = np.zeros(0, dtype=np.float32)
        self._pre_roll = []
        self._buffered = []
        self._pending = []
        self._in_speech = False
        self._voiced_frames = 0
        self._silent_frames = 0
        self._last_snapshot_voiced = -1
        self._revision = 0

    # --- framing ---------------------------------------------------------------

    def _frames(self, pcm: np.ndarray) -> Iterator[np.ndarray]:
        """Whole frames from the stream so far, carrying the remainder forward.

        The invariant a test pins: feeding one buffer and feeding the same samples
        as arbitrary chunks must produce identical frames in identical order.
        """
        joined = pcm if self._remainder.size == 0 else np.concatenate([self._remainder, pcm])
        whole = len(joined) // FRAME
        for i in range(whole):
            yield joined[i * FRAME : (i + 1) * FRAME]
        self._remainder = joined[whole * FRAME :].copy()

    # --- the decision ----------------------------------------------------------

    def push(self, pcm: np.ndarray) -> list[Event]:
        """Feed continuous audio; get back whatever it caused."""
        import torch

        cfg = self.config
        pre_roll_frames = max(0, cfg.pre_roll_ms // FRAME_MS)
        min_speech_frames = max(1, cfg.min_speech_ms // FRAME_MS)
        min_silence_frames = max(1, cfg.min_silence_ms // FRAME_MS)
        pad_frames = max(0, cfg.speech_pad_ms // FRAME_MS)
        max_frames = max(1, cfg.max_utterance_ms // FRAME_MS)
        first_snapshot_frames = max(1, cfg.first_snapshot_ms // FRAME_MS)
        every_frames = max(1, cfg.snapshot_every_ms // FRAME_MS)

        events: list[Event] = []

        for frame in self._frames(pcm):
            with torch.no_grad():
                prob = float(self.model(torch.from_numpy(frame), SR).item())

            if not self._in_speech:
                self._pending.append(frame)
                if prob >= cfg.threshold:
                    # Only the run of consecutive voiced frames counts; a single
                    # loud transient is not a word.
                    self._voiced_frames += 1
                else:
                    # The run broke. Everything before it becomes pre-roll.
                    if self._voiced_frames:
                        self._pre_roll.extend(self._pending)
                        self._pending = []
                        self._voiced_frames = 0
                    else:
                        self._pre_roll.extend(self._pending)
                        self._pending = []
                    if pre_roll_frames:
                        self._pre_roll = self._pre_roll[-pre_roll_frames:]
                    else:
                        self._pre_roll = []
                    continue

                if self._voiced_frames >= min_speech_frames:
                    # Speech confirmed. The utterance opens with the pre-roll, so a
                    # quiet onset — which is usually the book name — is not clipped.
                    self._in_speech = True
                    self._buffered = list(self._pre_roll) + list(self._pending)
                    self._pending = []
                    self._pre_roll = []
                    self._silent_frames = 0
                    self._last_snapshot_voiced = -1
                    events.append(Event("speech-start", voiced_ms=self._voiced_frames * FRAME_MS))
                continue

            # --- inside an utterance ---
            self._buffered.append(frame)
            if prob >= cfg.neg_threshold:
                self._voiced_frames += 1
                self._silent_frames = 0
            else:
                self._silent_frames += 1

            if self._silent_frames >= min_silence_frames:
                events.append(self._finish(pad_frames))
                continue

            if len(self._buffered) >= max_frames:
                events.append(self._finish(pad_frames, valve=True))
                continue

            # Provisional look. The FIRST one is scheduled independently of the
            # recurring cadence: `max(first, every)` was the old shape and it meant
            # the cadence always won, so lowering the first threshold did nothing
            # at all when it was measured.
            due = (
                self._voiced_frames >= first_snapshot_frames
                if self._last_snapshot_voiced < 0
                else self._voiced_frames - self._last_snapshot_voiced >= every_frames
            )
            if due:
                self._last_snapshot_voiced = self._voiced_frames
                self._revision += 1
                events.append(
                    Event(
                        "snapshot",
                        audio=np.concatenate(self._buffered),
                        revision=self._revision,
                        voiced_ms=self._voiced_frames * FRAME_MS,
                    )
                )

        return events

    def _finish(self, pad_frames: int, valve: bool = False) -> Event:
        """Close the utterance, keeping a short tail rather than the whole silence.

        The silence we waited through is how long it took to be SURE, not part of
        what was said. Sending all of it hands Whisper a second of room tone to
        decode, which is exactly the input it invents words for.
        """
        keep = self._buffered if valve else self._buffered[: max(1, len(self._buffered) - self._silent_frames + pad_frames)]
        audio = np.concatenate(keep)
        voiced_ms = self._voiced_frames * FRAME_MS
        self._revision += 1
        revision = self._revision
        # The next utterance starts clean, but Silero's recurrent state carries on:
        # it is one continuous stream and only Stop/Start resets it.
        self._buffered = []
        self._pending = []
        self._pre_roll = []
        self._in_speech = False
        self._voiced_frames = 0
        self._silent_frames = 0
        self._last_snapshot_voiced = -1
        return Event("final", audio=audio, revision=revision, voiced_ms=voiced_ms)


def load_vad():
    """The Silero model, torch build.

    ONNX measured marginally faster (0.118 ms vs 0.126 ms per frame) and torch is
    already a dependency of this service, so the extra runtime is not worth
    0.008 ms on a budget of 32.
    """
    from silero_vad import load_silero_vad

    return load_silero_vad(onnx=False)
