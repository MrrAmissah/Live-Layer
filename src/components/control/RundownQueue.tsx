import { useState } from 'react';
import { useRundowns } from '../../hooks/useRundowns';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { getQueueCursors } from '../../lib/rundown/rundownStore';
import { describeGraphic } from '../../lib/graphicTitle';
import { Icon } from '../../lib/icons';

/**
 * Live-tab rundown queue (dock). Row click selects; Previous/Next step the
 * selection; LIVE marks the item we last COMMANDED (activeItemId) — the one
 * on-air claim the app can make, because it is a record of our own command,
 * not an output acknowledgement. Take and Clear are the Program strip's
 * buttons (mode-aware), never duplicated here — so there is one Take.
 * Nothing here posts a realtime message; only ControlPage's Take/Clear do.
 *
 * Reordering is an explicit mode with per-row up/down — deliberately NOT a
 * drag handle, because the store can only swap adjacent items
 * (`moveItem(±1)`) and a handle promises drop-anywhere it cannot deliver.
 */
export default function RundownQueue() {
  const rd = useRundowns();
  const { activeItemId } = useLiveTakeContext();
  const [reordering, setReordering] = useState(false);
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
    <section className="dock-card dock-queue">
      <div className="dock-card__head">
        <span className="ll-kicker">Queue{items.length > 0 ? ` (${items.length})` : ''}</span>
        <span className="dock-card__meta" title={rundown.name}>{rundown.name}</span>
        {items.length > 1 ? (
          <button
            type="button"
            className="dock-card__action"
            aria-pressed={reordering}
            onClick={() => setReordering((value) => !value)}
          >
            {reordering ? 'Done' : 'Reorder'}
          </button>
        ) : null}
      </div>

      {/* Dock-only surface: the Queue tab owns adding, so this points there. */}
      {items.length === 0 ? (
        <p className="dock-card__hint">No items yet — add some in the Queue tab.</p>
      ) : !selected ? (
        <div className="dock-queue__empty">
          <p className="dock-card__hint">No item selected.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => rd.setSelectedItem(items[0].id)}>
            Select first item
          </button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ol className="dock-queue__list">
          {items.map((item, index) => {
            const isLive = item.id === activeItemId;
            const meta = describeGraphic(item.graphic);
            return (
              <li
                key={item.id}
                className="dock-queue__row"
                data-selected={item.id === rundown.selectedItemId || undefined}
                data-done={item.done || undefined}
              >
                <button
                  type="button"
                  className="dock-queue__main"
                  onClick={() => rd.setSelectedItem(item.id)}
                  aria-current={item.id === rundown.selectedItemId ? 'true' : undefined}
                >
                  <span className="dock-queue__index" aria-hidden>{index + 1}</span>
                  <span className="dock-queue__glyph" aria-hidden>
                    <Icon name={meta.icon} size={15} />
                  </span>
                  <span className="dock-queue__text">
                    <span className="dock-queue__title">{item.title}</span>
                    <span className="dock-queue__sub">{meta.typeLabel}</span>
                  </span>
                </button>
                <span className="dock-queue__cluster">
                  {isLive ? <span className="rd-live">LIVE</span> : null}
                  {reordering ? (
                    <>
                      <button
                        type="button"
                        className="dock-queue__move"
                        onClick={() => rd.moveItemUp(item.id)}
                        disabled={index === 0}
                        aria-label={`Move ${item.title} up`}
                      >
                        <Icon name="chevronUp" size={13} />
                      </button>
                      <button
                        type="button"
                        className="dock-queue__move"
                        onClick={() => rd.moveItemDown(item.id)}
                        disabled={index === items.length - 1}
                        aria-label={`Move ${item.title} down`}
                      >
                        <Icon name="chevronDown" size={13} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={`rd-icon ${item.done ? 'rd-icon--on' : ''}`}
                      onClick={() => rd.toggleDone(item.id)}
                      aria-pressed={item.done}
                      aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                      title={item.done ? 'Mark not done' : 'Mark done'}
                    >
                      ✓
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {items.length > 0 ? (
        <div className="dock-queue__nav">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onPrev} disabled={!prevItem} aria-label="Select previous rundown item">
            ◀ Previous
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onNext}
            disabled={items.length === 0 || (selectedIndex >= 0 && selectedIndex === items.length - 1)}
            aria-label="Select next rundown item"
          >
            Next ▶
          </button>
        </div>
      ) : null}
    </section>
  );
}
