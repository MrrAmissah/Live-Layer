import type { Rundown } from '../../types/rundown';

interface Props {
  rundown: Rundown;
  active: boolean;
  onSetActive: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

/** One rundown in the list. Clicking selects it as the active rundown (R2). */
export default function RundownCard({ rundown, active, onSetActive, onDuplicate, onExport, onDelete }: Props) {
  return (
    <li className={`rd-card ${active ? 'rd-card--active' : ''}`}>
      <button type="button" className="rd-card__main" onClick={onSetActive} aria-pressed={active}>
        <span className="rd-card__radio" aria-hidden />
        <span className="rd-card__text">
          <span className="rd-card__name">{rundown.name}</span>
          <span className="rd-card__meta">
            {rundown.items.length} {rundown.items.length === 1 ? 'item' : 'items'}
            {active ? ' · Active' : ''}
          </span>
        </span>
      </button>
      {/* Same glyph the item row uses for the same idea, so "duplicate" reads
          the same whether the operator is copying one graphic or a service. */}
      <button
        type="button"
        className="rd-icon"
        onClick={onDuplicate}
        aria-label={`Duplicate rundown ${rundown.name}`}
        title="Duplicate rundown"
      >
        ⧉
      </button>
      <button
        type="button"
        className="rd-icon"
        onClick={onExport}
        aria-label={`Export rundown ${rundown.name}`}
        title="Export as .livelayerpack"
      >
        ⤓
      </button>
      <button
        type="button"
        className="rd-icon rd-icon--danger"
        onClick={onDelete}
        aria-label={`Delete rundown ${rundown.name}`}
        title="Delete rundown"
      >
        ✕
      </button>
    </li>
  );
}
