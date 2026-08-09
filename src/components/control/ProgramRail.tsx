import { useLocation } from 'react-router-dom';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { templateRegistry } from '../templates/registry';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { describeProgramStatus } from '../../lib/programStatus';
// Shared with the dock's Program strip — one title rule, one clock.
import { graphicTitle } from '../../lib/graphicTitle';
import { useTicks, elapsed, ago } from '../../hooks/useTicks';
import { programClockMs } from '../../lib/programClock';
import LiveActions from './LiveActions';
import type { GraphicInstance } from '../../types/graphics';
import type { OutputStatusState, ProgramState } from '../../types/program';
import { Icon } from '../../lib/icons';
import LiveSettings from './LiveSettings';
import RailQueue from './RailQueue';
import StudioRundownPanel from './StudioRundownPanel';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));

function templateName(templateId: string | null): string {
  return (templateId && templateById.get(templateId)?.name) || '';
}

/**
 * Output status card — reports the operator-side Program model honestly. Every
 * status word comes from `lib/programStatus.ts`: a published Take is SENT /
 * "Awaiting output" until the OUTPUT_APPLIED with the matching commandId
 * arrives, OUTPUT READY / OUTPUT ACTIVE only while the output heartbeat is
 * fresh, never a confident LIVE. Flat surface, status word right-aligned.
 */
function OutputCard({ program, output }: { program: ProgramState; output: OutputStatusState | null }) {
  // The cleared readout is a live counter too — it used to freeze because the
  // clock only ran for on-air states. Both branches tick; each drops to a
  // one-minute cadence once it is only reporting whole minutes.
  // Shared cadence rule (`lib/programClock.ts`). The `showing` tick is also
  // what lets a confirmed reading fall to UNVERIFIED once the heartbeat lapses.
  const now = useTicks(programClockMs(program, Date.now()));
  const words = describeProgramStatus(program, output, now);

  return (
    <div className={`program-card program-card--${program.status}`}>
      <div className="program-card__row">
        <span className="program-card__label">Output</span>
        <span className="program-card__badge">{words.phrase}</span>
      </div>
      <div className="program-card__detail">
        {program.status === 'showing' && program.snapshot ? (
          <>
            <span className="program-card__identity">
              {words.pill === 'UNVERIFIED' ? <>Last sent: {graphicTitle(program.snapshot)}</> : graphicTitle(program.snapshot)}
            </span>
            <span className="program-card__sub">
              {program.outputFailure ? (
                // Surface output's own reason — the one thing SENT wording can't say.
                <>{program.outputFailure.reason}</>
              ) : (
                <>
                  {templateName(program.templateId)}
                  {program.takenAt ? <> · sent {elapsed(program.takenAt, now)} ago</> : null}
                </>
              )}
            </span>
          </>
        ) : program.status === 'clearing' && program.snapshot ? (
          <>
            <span className="program-card__identity">Last sent: {graphicTitle(program.snapshot)}</span>
            {/* Honest pending clear: the command went out, and nothing has yet
                confirmed the graphic is gone. */}
            <span className="program-card__sub">Clear sent — waiting for output to confirm</span>
          </>
        ) : program.status === 'recovering' && program.snapshot ? (
          <>
            <span className="program-card__identity">Last on air: {graphicTitle(program.snapshot)}</span>
            <span className="program-card__sub">Reloaded — can’t confirm what output is showing</span>
          </>
        ) : program.status === 'failed' && program.snapshot ? (
          <>
            <span className="program-card__identity">{graphicTitle(program.snapshot)}</span>
            {/* Never claims output is empty: a failed publish leaves whatever
                was already on air untouched. */}
            <span className="program-card__sub">
              The new command didn’t send — output may still show the previous graphic.
            </span>
          </>
        ) : (
          <span className="program-card__sub">
            {program.clearedAt ? <>Cleared {ago(program.clearedAt, now)}</> : 'Ready — nothing on air'}
          </span>
        )}
      </div>
    </div>
  );
}

interface ProgramRailProps {
  onTake: () => void;
  onClear: () => void;
  onTakeInstance: (item: GraphicInstance) => void;
  /** Load a queue entry into the editor (owner also reveals the editor). */
  onEditInstance: (item: GraphicInstance) => void;
  /** A command is in flight — controls lock so a slow relay can't be double-fired. */
  sending?: boolean;
}

/**
 * Right-hand Program/Live rail (studio). One continuous surface: Program status,
 * primary Take/Clear, live settings, and the quick queue — grouped by dividers,
 * not nested cards.
 */
export default function ProgramRail({ onTake, onClear, onTakeInstance, onEditInstance, sending = false }: ProgramRailProps) {
  const program = useLiveLayerStore((state) => state.program);
  const output = useLiveLayerStore((state) => state.outputStatus);
  // The rail rides along in every workspace, so it hands the editable list to
  // the Rundown workspace when that is what the operator is looking at.
  const managingRundown = useLocation().pathname.startsWith('/control/rundown');
  const { rundownActive } = useLiveTakeContext();
  // Shared with the stacked layout's sticky strip — one vocabulary, one source.
  // Ticks at the shared cadence so the pill can fall to UNVERIFIED when the
  // output heartbeat goes stale (staleness is derived from `now`).
  const now = useTicks(programClockMs(program, Date.now()));
  const statusLabel = describeProgramStatus(program, output, now).pill;

  return (
    <div className="program-rail">
      <div className="program-rail__section program-rail__section--program">
        <div className="program-rail__head">
          <span className="ll-kicker">Program / Live</span>
          <span className={`program-rail__status program-rail__status--${program.status}`}>
            <span className="program-rail__status-dot" aria-hidden />
            {statusLabel}
          </span>
        </div>

        <OutputCard program={program} output={output} />

        <div className="program-rail__actions">
          <LiveActions surface="studio" onTake={onTake} onClear={onClear} sending={sending} />
        </div>
      </div>

      {rundownActive ? (
        <div className="program-rail__section">
          <StudioRundownPanel showItems={!managingRundown} />
        </div>
      ) : (
        <div className="program-rail__section">
          <LiveSettings />
        </div>
      )}

      <div className="program-rail__section program-rail__section--queue">
        <RailQueue onTakeInstance={onTakeInstance} onEditInstance={onEditInstance} />
      </div>
    </div>
  );
}
