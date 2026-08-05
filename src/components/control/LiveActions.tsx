import type { LastAction } from './StatusBadge';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { Icon } from '../../lib/icons';

export type LiveActionsSurface = 'studio' | 'dock';

interface LiveActionsProps {
  /** The one Take handler, owned by ControlPage. Never re-implemented here. */
  onTake: () => void;
  /** The one Clear handler, owned by ControlPage. */
  onClear: () => void;
  /** A command is in flight — both actions lock until it settles. */
  sending?: boolean;
  surface: LiveActionsSurface;
  /**
   * DOCK ONLY, and optional on purpose.
   *
   * The dock says "Update live" after a take because its status bar reads the
   * same local `lastAction`. The studio must never speak that way: it reports
   * Program, which is a record of what we *commanded*, and claiming "live" from
   * a published message would assert an acknowledgement no ack protocol exists
   * to give (see `types/program.ts`). The studio therefore does not pass this,
   * and cannot accidentally acquire the dock's vocabulary.
   */
  lastAction?: LastAction;
}

/**
 * The Take/Clear pair — one implementation for every surface that offers them.
 *
 * Three surfaces render live actions now: the studio Program rail, the studio's
 * sticky strip in the stacked layout, and the dock's bottom bar. They must be
 * the same buttons calling the same handlers with the same locks, or "one
 * canonical Take" quietly becomes three implementations that drift.
 *
 * What this component deliberately does NOT do: subscribe to Program, decide
 * what to publish, own a channel, or confirm before airing. Take is one click,
 * and the decision of what a take means (selected rundown item vs draft) stays
 * in ControlPage where the guard lives.
 */
export default function LiveActions({ onTake, onClear, sending = false, surface, lastAction }: LiveActionsProps) {
  // No aria-label: the visible text IS the name. An aria-label that said
  // "Take selected" over a button reading "Take live" desynchronised the two,
  // which breaks voice control ("click Take live" matching nothing).
  const { takeLabel, takeDisabled, rundownActive, notReadyReason } = useLiveTakeContext();
  const dock = surface === 'dock';

  // Studio wording is Program-honest; the dock adds its own "Update live" once a
  // take has happened in this session.
  const takeText = dock
    ? lastAction === 'taken'
      ? 'Update live'
      : takeLabel
    : rundownActive
      ? takeLabel
      : 'Take live';

  return (
    <div className={dock ? 'dock-livebar__actions' : 'live-actions'}>
      {/* A disabled Take with no stated reason is its own failure mid-service:
          the operator presses, nothing happens, and they debug the app instead
          of the graphic. `title` and `aria-describedby` both carry it, so the
          reason is available to a pointer and to a screen reader. */}
      {notReadyReason ? (
        <p className="live-actions__blocked" id={`take-blocked-${surface}`} role="status" aria-live="polite">
          {notReadyReason}
        </p>
      ) : null}
      <button
        type="button"
        className={dock ? 'take-btn dock-livebar__take' : 'take-btn'}
        data-state={dock ? lastAction : undefined}
        onClick={onTake}
        disabled={takeDisabled || sending}
        aria-busy={sending || undefined}
        title={notReadyReason || undefined}
        aria-describedby={notReadyReason ? `take-blocked-${surface}` : undefined}
      >
        {dock ? null : <Icon name="broadcast" size={17} />}
        {sending ? 'Sending…' : takeText}
      </button>
      <button
        type="button"
        className={dock ? 'clear-btn dock-livebar__clear' : 'clear-btn'}
        onClick={onClear}
        disabled={sending}
        aria-busy={sending || undefined}
      >
        {sending ? 'Sending…' : dock ? 'Clear' : 'Clear graphic'}
      </button>
    </div>
  );
}
