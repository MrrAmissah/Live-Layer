import type { RundownItem } from '../../types/rundown';
import RundownItemCard from './RundownItemCard';

interface Props {
  items: RundownItem[];
  selectedItemId?: string;
  onSelect: (itemId: string) => void;
  onToggleDone: (itemId: string) => void;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
  onDuplicate: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

/** Items of the active rundown (R2 — management only). */
export default function RundownItemList({
  items,
  selectedItemId,
  onSelect,
  onToggleDone,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete
}: Props) {
  return (
    <div className="rd-items">
      {items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No items yet</p>
          <p className="empty-state__hint">Add the current draft, or use “Add to rundown” on a Saved graphic.</p>
        </div>
      ) : (
        <ul className="rd-item-list">
          {items.map((item, index) => (
            <RundownItemCard
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              selected={item.id === selectedItemId}
              onSelect={() => onSelect(item.id)}
              onToggleDone={() => onToggleDone(item.id)}
              onMoveUp={() => onMoveUp(item.id)}
              onMoveDown={() => onMoveDown(item.id)}
              onDuplicate={() => onDuplicate(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
