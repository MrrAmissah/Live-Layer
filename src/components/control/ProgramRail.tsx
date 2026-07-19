import { useEffect, useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { templateRegistry } from '../templates/registry';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import type { GraphicInstance } from '../../types/graphics';
import type { ProgramState } from '../../types/program';
import { Icon } from '../../lib/icons';
import LiveSettings from './LiveSettings';
import RailQueue from './RailQueue';
import StudioRundownPanel from './StudioRundownPanel';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));

function graphicLabel(snapshot: GraphicInstance): string {
  const template = templateById.get(snapshot.templateId);
  const primary = template?.primaryField;
  return (
    snapshot.presetName?.trim() ||
    (primary ? snapshot.values[primary] : '') ||
    snapshot.values.name ||
    template?.name ||
    snapshot.templateId
  );
}
function templateName(templateId: string | null): string {
  return (templateId && templateById.get(templateId)?.name) || '';
}

/**
 * Re-render clock for the elapsed/ago readouts. `intervalMs` of 0 disables it.
 * Callers step down to a coarser interval once second-level precision stops
 * being meaningful, so an idle rail isn't waking every second forever.
 */
function useTicks(intervalMs: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!intervalMs) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return Date.now();
}
function elapsed(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function ago(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/**
 * Output status card — reports the operator-side Program model honestly: a
 * published Take is 'showing' + unconfirmed ("Awaiting output"), never a
 * confident acknowledged LIVE. Flat surface, status word right-aligned.
 */
function OutputCard({ program }: { program: ProgramState }) {
  // The cleared readout is a live counter too — it used to freeze because the
  // clock only ran for on-air states. Both branches tick; each drops to a
  // one-minute cadence once it is only reporting whole minutes.
  const since = program.status === 'clear' ? program.clearedAt : program.takenAt;
  const needsClock = program.status === 'showing' || program.status === 'recovering' || program.status === 'clear';
  const withinFirstMinute = since !== null && Date.now() - since < 60_000;
  const now = useTicks(needsClock && since !== null ? (withinFirstMinute ? 1000 : 60_000) : 0);

  const badge =
    program.status === 'showing'
      ? { label: 'Awaiting output', tone: 'showing' as const }
      : program.status === 'recovering'
        ? { label: 'Not confirmed', tone: 'recovering' as const }
        : program.status === 'failed'
          ? { label: 'Send failed', tone: 'failed' as const }
          : { label: 'Clear', tone: 'clear' as const };

  return (
    <div className={`program-card program-card--${badge.tone}`}>
      <div className="program-card__row">
        <span className="program-card__label">Output</span>
        <span className="program-card__badge">{badge.label}</span>
      </div>
      <div className="program-card__detail">
        {program.status === 'showing' && program.snapshot ? (
          <>
            <span className="program-card__identity">{graphicLabel(program.snapshot)}</span>
            <span className="program-card__sub">
              {templateName(program.templateId)}
              {program.takenAt ? <> · sent {elapsed(program.takenAt, now)} ago</> : null}
            </span>
          </>
        ) : program.status === 'recovering' && program.snapshot ? (
          <>
            <span className="program-card__identity">Last on air: {graphicLabel(program.snapshot)}</span>
            <span className="program-card__sub">Reloaded — can’t confirm what output is showing</span>
          </>
        ) : program.status === 'failed' && program.snapshot ? (
          <>
            <span className="program-card__identity">{graphicLabel(program.snapshot)}</span>
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
  /** A command is in flight — controls lock so a slow relay can't be double-fired. */
  sending?: boolean;
}

/**
 * Right-hand Program/Live rail (studio). One continuous surface: Program status,
 * primary Take/Clear, live settings, and the quick queue — grouped by dividers,
 * not nested cards.
 */
export default function ProgramRail({ onTake, onClear, onTakeInstance, sending = false }: ProgramRailProps) {
  const program = useLiveLayerStore((state) => state.program);
  const { takeLabel, takeDisabled, rundownActive } = useLiveTakeContext();
  const statusLabel =
    program.status === 'showing' ? 'SENT' : program.status === 'recovering' ? 'UNVERIFIED' : program.status === 'failed' ? 'FAILED' : 'CLEAR';

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

        <OutputCard program={program} />

        <div className="program-rail__actions">
          <button
            type="button"
            className="take-btn"
            onClick={onTake}
            disabled={takeDisabled || sending}
            aria-busy={sending || undefined}
            aria-label={sending ? 'Sending command' : takeLabel}
          >
            <Icon name="broadcast" size={17} />
            {sending ? 'Sending…' : rundownActive ? takeLabel : 'Take live'}
          </button>
          <button type="button" className="clear-btn" onClick={onClear} disabled={sending} aria-busy={sending || undefined}>
            {sending ? 'Sending…' : 'Clear graphic'}
          </button>
        </div>
      </div>

      {rundownActive ? (
        <div className="program-rail__section">
          <StudioRundownPanel />
        </div>
      ) : (
        <div className="program-rail__section">
          <LiveSettings />
        </div>
      )}

      <div className="program-rail__section program-rail__section--queue">
        <RailQueue onTakeInstance={onTakeInstance} />
      </div>
    </div>
  );
}
