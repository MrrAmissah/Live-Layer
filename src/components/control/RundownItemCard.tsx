import { templateRegistry } from '../templates/registry';
import type { RundownItem } from '../../types/rundown';

function templateName(templateId: string): string {
  return templateRegistry.find((item) => item.id === templateId)?.name ?? templateId;
}

interface Props {
  item: RundownItem;
  index: number;
  count: number;
  selected: boolean;
  /** True when this item is the live (activeItemId) one — shows a LIVE badge. */
  live?: boolean;
  onSelect: () => void;
  onToggleDone: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * One rundown item (R2 — management only). Clicking the body selects it (sets
 * selectedItemId for R3; no Take, no /output). Right-side controls: done toggle,
 * move up/down, duplicate, delete. Order number on the left.
 */
export default function RundownItemCard({
  item,
  index,
  count,
  selected,
  live = false,
  onSelect,
  onToggleDone,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete
}: Props) {
  return (
    <li className={`rd-item ${selected ? 'rd-item--selected' : ''} ${item.done ? 'rd-item--done' : ''}`}>
      <button type="button" className="rd-item__main" onClick={onSelect} aria-pressed={selected}>
        <span className="rd-item__order" aria-hidden>{index + 1}</span>
        <span className="rd-item__text">
          <span className="rd-item__title">{item.title}</span>
          <span className="rd-item__meta">{templateName(item.graphic.templateId)}</span>
        </span>
        {live ? <span className="rd-live">LIVE</span> : null}
      </button>
      <span className="rd-item__actions">
        <button
          type="button"
          className={`rd-icon ${item.done ? 'rd-icon--on' : ''}`}
          onClick={onToggleDone}
          aria-pressed={item.done}
          aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
          title={item.done ? 'Mark not done' : 'Mark done'}
        >
          ✓
        </button>
        <button type="button" className="rd-icon" onClick={onMoveUp} disabled={index === 0} aria-label={`Move ${item.title} up`} title="Move up">↑</button>
        <button type="button" className="rd-icon" onClick={onMoveDown} disabled={index === count - 1} aria-label={`Move ${item.title} down`} title="Move down">↓</button>
        <button type="button" className="rd-icon" onClick={onDuplicate} aria-label={`Duplicate ${item.title}`} title="Duplicate">⧉</button>
        <button type="button" className="rd-icon rd-icon--danger" onClick={onDelete} aria-label={`Delete ${item.title}`} title="Delete">✕</button>
      </span>
    </li>
  );
}
