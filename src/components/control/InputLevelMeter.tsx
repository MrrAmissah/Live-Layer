import { useEffect, useRef, useState } from 'react';

/**
 * A meter that moves because audio is arriving — never because it is animating.
 *
 * The first human microphone test could not tell whether LiveLayer was hearing
 * anything: the only feedback was a small dot with two states. That is the one
 * question an operator needs answered instantly mid-service, and a decorative
 * animation would answer it *wrongly* — a meter that sweeps whether or not the
 * microphone is working teaches the operator to distrust every other indicator on
 * the surface.
 *
 * So every bar here is measured input level (`levelFromDb` over frame RMS). When
 * nothing is arriving the meter is visibly, deliberately still.
 *
 * Three states must be distinguishable at a glance and without reading:
 *
 *   **off**       — flat and grey. Not listening.
 *   **listening** — a live baseline that responds to the room, in the muted accent.
 *   **speaking**  — clearly taller bars in the live green.
 *
 * "Connecting" deliberately reads as *not yet listening* rather than as a quiet
 * room, because those mean opposite things: one will start working on its own, the
 * other will not.
 */

const BARS = 24;

interface Props {
  /** Measured 0–1 input level. */
  level: number;
  /** Capture is running. */
  active: boolean;
  /** Speech is being heard right now. */
  speaking?: boolean;
}

export default function InputLevelMeter({ level, active, speaking = false }: Props) {
  /**
   * A short history, so the meter reads as a moving trace rather than a single
   * jumping bar. Kept in state at the cadence the source publishes (~20 Hz), NOT
   * at audio-frame rate — the audio path measures every 20 ms frame, and coalescing
   * happens before this component ever hears about it.
   */
  const [history, setHistory] = useState<number[]>(() => new Array(BARS).fill(0));
  const latest = useRef(0);
  latest.current = active ? Math.max(0, Math.min(1, level)) : 0;

  useEffect(() => {
    if (!active) {
      setHistory(new Array(BARS).fill(0));
      return;
    }
    const timer = setInterval(() => {
      setHistory((previous) => [...previous.slice(1), latest.current]);
    }, 60);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <div
      className="level-meter"
      data-active={active || undefined}
      data-speaking={speaking || undefined}
      // The meter is decoration for assistive tech; the status sentence beside it
      // carries the same information as words.
      aria-hidden
    >
      {history.map((value, index) => (
        <span
          key={index}
          className="level-meter__bar"
          // Floor of 8% so the meter reads as present-but-quiet rather than broken
          // when the room is silent.
          style={{ transform: `scaleY(${Math.max(0.08, value)})` }}
        />
      ))}
    </div>
  );
}
