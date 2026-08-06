import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { describeProgramStatus } from '../../lib/programStatus';
import { describeGraphic } from '../../lib/graphicTitle';
import { useTicks, elapsed, ago } from '../../hooks/useTicks';
import { Icon, type IconName } from '../../lib/icons';
import LiveActions from './LiveActions';
import type { LastAction } from './StatusBadge';

interface DockProgramStripProps {
  /** `tall` on the Live tab (meta grid + rule); `compact` everywhere else. */
  variant: 'tall' | 'compact';
  onTake: () => void;
  onClear: () => void;
  sending?: boolean;
  lastAction: LastAction;
}

/**
 * The dock's Program strip — pinned between the tab bar and the scrolling tab
 * content so Take/Clear and the Program record are visible on every tab. This
 * is the dock's ONE live-actions surface (it replaces the old StickyLiveBar);
 * exactly one instance mounts, so exactly one Take is ever in the tree.
 *
 * Honesty contract: control publishes commands and cannot know what output
 * painted. Every status word here comes from `lib/programStatus.ts` (SENT /
 * "Awaiting output", UNVERIFIED, FAILED, CLEAR) — the strip never renders a
 * confident on-air claim. The elapsed clock IS real (we know when we sent the
 * command), so it is shown, paired with that vocabulary. The "1920 × 1080"
 * row is the fixed authoring canvas, not a measured output — there is no fps
 * or resolution feedback from OBS anywhere in this app, so none is printed.
 */
export default function DockProgramStrip({
  variant,
  onTake,
  onClear,
  sending = false,
  lastAction
}: DockProgramStripProps) {
  const program = useLiveLayerStore((state) => state.program);
  const words = describeProgramStatus(program);

  // Same clock policy as the studio's OutputCard: tick while a readout is
  // moving, and drop the cleared counter to a one-minute cadence once it only
  // reports whole minutes.
  const since = program.status === 'clear' ? program.clearedAt : program.takenAt;
  const needsClock =
    program.status === 'showing' || program.status === 'recovering' || program.status === 'clear';
  const coarse = program.status === 'clear' && since !== null && Date.now() - since >= 60_000;
  const now = useTicks(needsClock && since !== null ? (coarse ? 60_000 : 1000) : 0);

  const snapshotMeta = program.snapshot ? describeGraphic(program.snapshot) : null;
  // Clock on the chip only while SHOWING — same rule as the studio's OutputCard.
  // In `recovering` the takenAt survives a reload, so an elapsed counter would
  // read as a huge stale number next to "Not confirmed".
  const clock = program.status === 'showing' && program.takenAt !== null ? elapsed(program.takenAt, now) : null;

  let icon: IconName = snapshotMeta?.icon ?? 'layers';
  let title: string;
  let sub: string;
  switch (program.status) {
    case 'showing':
      title = snapshotMeta?.title ?? 'Sent graphic';
      sub = snapshotMeta?.typeLabel ?? '';
      break;
    case 'recovering':
      title = snapshotMeta ? `Last sent: ${snapshotMeta.title}` : 'Reloaded';
      sub = 'Reloaded — can’t confirm what output is showing';
      break;
    case 'failed':
      title = snapshotMeta?.title ?? 'Send failed';
      // Never claims output is empty: a failed publish leaves whatever was
      // already on air untouched.
      sub = 'Command didn’t send — output may still show the previous graphic';
      break;
    default:
      icon = 'layers';
      title = 'Ready';
      sub = program.clearedAt ? `Cleared ${ago(program.clearedAt, now)}` : 'Nothing on air';
  }

  return (
    <section className={`dock-program dock-program--${variant}`} data-status={program.status}>
      <span className="ll-kicker">Program</span>

      <div className="dock-program__identity">
        <span className="dock-program__glyph" aria-hidden>
          <Icon name={icon} size={17} />
        </span>
        <span className="dock-program__text">
          <span className="dock-program__title" title={title}>{title}</span>
          <span className="dock-program__sub">{sub}</span>
        </span>
        <span className="dock-program__chip" data-status={program.status} role="status">
          {words.pill}
          {clock ? <span className="dock-program__clock">· {clock}</span> : null}
        </span>
      </div>

      {variant === 'tall' ? (
        <>
          <div className="dock-program__meta">
            <span className="dock-program__cell">
              <span className="dock-program__label">Canvas</span>
              <span className="dock-program__value">1920 × 1080</span>
            </span>
            <span className="dock-program__cell dock-program__cell--end">
              <span className="dock-program__label">Status</span>
              <span className="dock-program__value" data-status={program.status}>
                {words.phrase}
              </span>
            </span>
          </div>
          <hr className="dock-program__rule" />
        </>
      ) : null}

      <LiveActions surface="dock" onTake={onTake} onClear={onClear} sending={sending} lastAction={lastAction} />
    </section>
  );
}
