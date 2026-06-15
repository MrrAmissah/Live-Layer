import { useRundowns } from '../../hooks/useRundowns';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { getQueueCursors } from '../../lib/rundown/rundownStore';

/**
 * Live-tab rundown operation (R3). Select / Previous / Next + a compact list with
 * LIVE (activeItemId) and done indicators. Take and Clear are the sticky bar /
 * action-deck buttons (mode-aware), not duplicated here — so there is one Take.
 * Nothing here posts a realtime message; only ControlPage's Take/Clear do.
 */
export default function RundownQueue() {
  const rd = useRundowns();
  const { activeItemId } = useLiveTakeContext();
  const rundown = rd.activeRundown;
  if (!rundown) return null;

  const items = rundown.items;
  const { selectedIndex, selected, nextItem, prevItem } = getQueueCursors(rundown);

  const onPrev = () => {
    if (prevItem) rd.setSelectedItem(prevItem.id);
  };
  const onNext = () => {
    if (selectedIndex < 0 && items[0]) rd.setSelectedItem(items[0].id);
    else if (nextItem) rd.setSelectedItem(nextItem.id);
  };

  return (
    <div className="rd-queue">
      <div className="rd-queue__head">
        <span className="ll-kicker">Rundown queue</span>
        <span className="rd-queue__name" title={rundown.name}>{rundown.name}</span>
      </div>

      {items.length === 0 ? (
        <p className="field__hint">No items yet — add some in Library → Rundowns.</p>
      ) : !selected ? (
        <div className="rd-queue__empty">
          <p className="field__hint">No item selected.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => rd.setSelectedItem(items[0].id)}>
            Select first item
          </button>
        </div>
      ) : (
        <p className="rd-queue__summary">
          <span><span className="rd-queue__lbl">Selected</span> {selected.title}</span>
          <span><span className="rd-queue__lbl">Next</span> {nextItem ? nextItem.title : '—'}</span>
        </p>
      )}

      <div className="rd-queue__nav">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onPrev} disabled={!prevItem}>◀ Previous</button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onNext}
          disabled={items.length === 0 || (selectedIndex >= 0 && selectedIndex === items.length - 1)}
        >
          Next ▶
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="rd-q-list">
          {items.map((item, index) => {
            const isLive = item.id === activeItemId;
            return (
              <li
                key={item.id}
                className={`rd-q-item ${item.id === rundown.selectedItemId ? 'rd-q-item--selected' : ''} ${item.done ? 'rd-q-item--done' : ''}`}
              >
                <button type="button" className="rd-q-item__main" onClick={() => rd.setSelectedItem(item.id)}>
                  <span className="rd-item__order" aria-hidden>{index + 1}</span>
                  <span className="rd-q-item__title">{item.title}</span>
                  {isLive ? <span className="rd-live">LIVE</span> : null}
                </button>
                <button
                  type="button"
                  className={`rd-icon ${item.done ? 'rd-icon--on' : ''}`}
                  onClick={() => rd.toggleDone(item.id)}
                  aria-pressed={item.done}
                  title={item.done ? 'Mark not done' : 'Mark done'}
                >
                  ✓
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
