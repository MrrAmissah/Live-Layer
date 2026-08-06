import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useDockPrefs } from '../../store/useDockPrefs';
import { describeProgramStatus } from '../../lib/programStatus';
import { describeGraphic } from '../../lib/graphicTitle';
import { useTicks, elapsed, ago } from '../../hooks/useTicks';
import { programClockMs } from '../../lib/programClock';
import { Icon, type IconName } from '../../lib/icons';
import LiveActions from './LiveActions';
import type { LastAction } from './StatusBadge';

interface DockProgramStripProps {
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
 * FIXED HEIGHT CONTRACT (stage 2b): the strip is one height on every tab and
 * in every Program status. A strip that grows when the status flips moves Take
 * out from under the operator's hand at the worst possible moment — right
 * after they press it (same defect class as the `TAKE LIVE` wrap fixed in
 * 55186b5). The CSS enforces it: `--dock-strip-h`, a fixed head row, and
 * fixed-height title/sub rows that reserve their worst-case lines. The one
 * sanctioned exception is the blocked-Take reason, which is not a Program
 * status and renders BELOW the buttons, so even when it appears Take and Clear
 * do not move. The old tall/compact-per-tab variant is gone; `compact` is now
 * the operator's persisted preference (dockPrefs), applied identically
 * everywhere.
 *
 * Honesty contract: control publishes commands and cannot know what output
 * painted. Every status word here comes from `lib/programStatus.ts` (SENT /
 * "Awaiting output", UNVERIFIED, FAILED, CLEAR) — the strip never renders a
 * confident on-air claim. The elapsed clock IS real (we know when we sent the
 * command), so it is shown, paired with that vocabulary. The old meta grid is
 * gone because both rows failed the same bar the other way round: its status
 * cell duplicated the chip beside it, and its canvas cell printed a constant
 * that never changes. The recovery sentence stays — it is the honest
 * disclosure that makes the strip trustworthy after a reload.
 */
export default function DockProgramStrip({ onTake, onClear, sending = false, lastAction }: DockProgramStripProps) {
  const program = useLiveLayerStore((state) => state.program);
  const output = useLiveLayerStore((state) => state.outputStatus);
  const compact = useDockPrefs((state) => state.compactProgramStrip);

  // Same clock policy as the studio's OutputCard: tick while a readout is
  // moving, and drop the cleared counter to a one-minute cadence once it only
  // reports whole minutes.
  // Cadence is the shared rule in `lib/programClock.ts`: only statuses whose
  // visible copy changes with time wake anything up. `recovering` and `failed`
  // render static text, so they get no interval at all.
  const now = useTicks(programClockMs(program, Date.now()));
  // Both this strip and the studio's rail read the same function with the same
  // arguments; neither may reach its own conclusion about a source reading. The
  // tick is also what lets a confirmed claim DECAY — staleness is derived from
  // `now`, so a surface that never ticked would leave OUTPUT ACTIVE latched
  // after OBS closed.
  const words = describeProgramStatus(program, output, now);

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
    <section
      className={`dock-program${compact ? ' dock-program--compact' : ''}`}
      data-status={program.status}
    >
      <div className="dock-program__head">
        <span className="ll-kicker">Program</span>
        <span className="dock-program__chip" data-status={program.status} role="status">
          {words.pill}
          {clock ? <span className="dock-program__clock">· {clock}</span> : null}
        </span>
      </div>

      <div className="dock-program__identity">
        <span className="dock-program__glyph" aria-hidden>
          <Icon name={icon} size={17} />
        </span>
        <span className="dock-program__text">
          <span className="dock-program__title" title={title}>{title}</span>
          <span className="dock-program__sub" title={sub}>{sub}</span>
        </span>
      </div>

      <LiveActions surface="dock" onTake={onTake} onClear={onClear} sending={sending} lastAction={lastAction} />
    </section>
  );
}
