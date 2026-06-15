import { useEffect, useRef, useState } from 'react';
import { useRundowns } from '../../hooks/useRundowns';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { getQueueCursors } from '../../lib/rundown/rundownStore';
import { exportSelectedRundownPack, exportResultMessage } from '../../lib/export/exportRundownPack';
import RundownItemCard from './RundownItemCard';

/**
 * Richer rundown queue for studio/desktop (R5). Additive UI only — it reuses the
 * R2/R3/R4 hooks and operations (no new state, no second queue, no second Take
 * path). Take/Clear remain the action-deck buttons above it. Mounts only in
 * studio (it lives in the LiveActionsPanel, which renders at ≥1024px); the dock
 * keeps the compact RundownQueue.
 */
export default function StudioRundownPanel() {
  const rd = useRundowns();
  const { activeItemId } = useLiveTakeContext();
  const [message, setMessage] = useState('');
  const messageTimerRef = useRef<number | undefined>(undefined);
  const rundown = rd.activeRundown;

  const flash = (text: string, durationMs = 6500) => {
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = window.setTimeout(() => {
      setMessage('');
      messageTimerRef.current = undefined;
    }, durationMs);
  };

  useEffect(() => () => {
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
  }, []);

  const onExport = async () => {
    if (!rundown) return;
    const result = await exportSelectedRundownPack(rundown);
    flash(exportResultMessage(result));
  };

  if (rd.rundowns.length === 0) {
    return <p className="field__hint studio-rd__hint">Create a rundown in <strong>Library → Rundowns</strong>.</p>;
  }
  if (!rundown) {
    return <p className="field__hint studio-rd__hint">Select an active rundown in <strong>Library → Rundowns</strong>.</p>;
  }

  const items = rundown.items;
  const { selectedIndex, selected, nextItem, prevItem, liveItem } = getQueueCursors(rundown);

  const onPrev = () => {
    if (prevItem) rd.setSelectedItem(prevItem.id);
  };
  const onNext = () => {
    if (selectedIndex < 0 && items[0]) rd.setSelectedItem(items[0].id);
    else if (nextItem) rd.setSelectedItem(nextItem.id);
  };

  return (
    <div className="studio-rd">
      <div className="studio-rd__head">
        <span className="ll-kicker">Rundown queue</span>
        <span className="studio-rd__name" title={rundown.name}>{rundown.name}</span>
        <span className="ll-count">{items.length}</span>
        <button type="button" className="btn btn--ghost btn--xs" onClick={onExport} title="Export as .livelayerpack">
          Export
        </button>
      </div>
      {message ? <p className="field__hint" role="status" aria-live="polite">{message}</p> : null}

      {items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No items yet</p>
          <p className="empty-state__hint">Add items from Library → Rundowns, or “Add current draft”.</p>
        </div>
      ) : (
        <>
          <div className="studio-rd__summary">
            <span><span className="rd-queue__lbl">Selected</span> {selected ? selected.title : '—'}</span>
            <span><span className="rd-queue__lbl">Live</span> {liveItem ? liveItem.title : '—'}</span>
            <span><span className="rd-queue__lbl">Next</span> {nextItem ? nextItem.title : '—'}</span>
          </div>

          <div className="studio-rd__nav">
            <button type="button" className="btn btn--secondary btn--sm" onClick={onPrev} disabled={!prevItem} aria-label="Select previous rundown item">◀ Previous</button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onNext}
              disabled={selectedIndex >= 0 && selectedIndex === items.length - 1}
              aria-label="Select next rundown item"
            >
              Next ▶
            </button>
          </div>

          {!selected ? (
            <div className="studio-rd__noselect">
              <p className="field__hint">No item selected.</p>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => rd.setSelectedItem(items[0].id)}>
                Select first item
              </button>
            </div>
          ) : null}

          <ul className="studio-rd__list rd-item-list">
            {items.map((item, index) => (
              <RundownItemCard
                key={item.id}
                item={item}
                index={index}
                count={items.length}
                selected={item.id === rundown.selectedItemId}
                live={item.id === activeItemId}
                onSelect={() => rd.setSelectedItem(item.id)}
                onToggleDone={() => rd.toggleDone(item.id)}
                onMoveUp={() => rd.moveItemUp(item.id)}
                onMoveDown={() => rd.moveItemDown(item.id)}
                onDuplicate={() => rd.duplicateItem(item.id)}
                onDelete={() => rd.deleteItem(item.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
