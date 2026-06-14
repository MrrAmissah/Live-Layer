import { useEffect, useState } from 'react';
import type { LastAction } from './StatusBadge';

interface LastActionLineProps {
  lastAction: LastAction;
  lastTakenAt: number | null;
}

function relativeLabel(lastAction: LastAction, takenAt: number | null): string {
  if (lastAction === 'idle' || !takenAt) return 'No graphic taken yet';
  const seconds = Math.max(0, Math.round((Date.now() - takenAt) / 1000));
  const ago = seconds === 0 ? 'just now' : `${seconds}s ago`;
  return lastAction === 'taken' ? `Taken ${ago}` : `Cleared ${ago}`;
}

/**
 * One-line "what just happened" readout. Ticks once a second only while a take
 * is showing, so "Taken 3s ago" stays live without a constant timer. Shared by
 * the studio live deck and the dock Live step.
 */
export default function LastActionLine({ lastAction, lastTakenAt }: LastActionLineProps) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (lastAction !== 'taken') return;
    const id = window.setInterval(() => setNow((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [lastAction]);

  return <p className="live-deck__last">{relativeLabel(lastAction, lastTakenAt)}</p>;
}
