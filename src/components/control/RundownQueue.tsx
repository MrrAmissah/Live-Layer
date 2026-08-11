import { useState } from 'react';
import { useRundowns } from '../../hooks/useRundowns';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';
import { getQueueCursors, getNextTakeableItem } from '../../lib/rundown/rundownStore';
import { describeGraphic } from '../../lib/graphicTitle';
import { Icon } from '../../lib/icons';

/**
 * Live-tab rundown queue (dock). Row click selects; Previous/Next step the
 * selection; LAST SENT marks the item behind our last successful command
 * (`activeItemId`). That is deliberately not an on-air claim: messaging is
 * one-way, so the app knows what it sent and never what output rendered.
 * Take and Clear are the Program strip's
 * buttons (mode-aware), never duplicated here — so there is one Take.
 * Nothing here posts a realtime message; only ControlPage's Take/Clear do.
 *
 * Reordering is an explicit mode. It used to offer per-row up/down ONLY, and the
 * note here said a drag handle was refused because the store could just swap
 * adjacent items (`moveItem(±1)`) — a handle would promise drop-anywhere it
 * could not deliver. `moveItemTo` now delivers it, so the handle exists and this
 * note records why it may.
 *
 * The up/down buttons stay, and are not redundant: HTML5 drag does not work by
 * touch, and it is unreachable by keyboard. They are the accessible path to the
 * same store call.
 *
 * Order is operational once Take Next exists — it decides what airs next — so
 * reordering still publishes nothing, moves no cursor, and rewrites no record of
 * what was already sent (`moveItemTo`).
 */
export default function RundownQueue() {
  const rd = useRundowns();
  const { activeItemId } = useLiveTakeContext();
  const [reordering, setReordering] = useState(false);
  /** The row being dragged, and the gap it is currently over. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rundown = rd.activeRundown;
  if (!rundown) return null;

  const items = rundown.items;
  const { selectedIndex, selected, nextItem, prevItem } = getQueueCursors(rundown);
  /** Badge the row Take Next would send, not merely the row after the cursor. */
  const nextTakeableId = getNextTakeableItem(rundown)?.id;

  const endDrag = () => {
    setDragId(null);
    setDropIndex(null);
  };

  const onDrop = (index: number) => {
    if (!dragId) return endDrag();
    const from = items.findIndex((item) => item.id === dragId);
    // Dropping into a gap AFTER the row's own position removes it first, so the
    // target shifts down by one. Without this every downward drag lands one row
    // short of where the operator let go.
    rd.moveItemTo(dragId, from >= 0 && index > from ? index - 1 : index);
    endDrag();
  };

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
            const isLastSent = item.id === activeItemId;
            const meta = describeGraphic(item.graphic);
            return (
              <li
                key={item.id}
                className="dock-queue__row"
                data-selected={item.id === rundown.selectedItemId || undefined}
                data-done={item.done || undefined}
                data-dragging={item.id === dragId || undefined}
                data-dropbefore={dropIndex === index || undefined}
                data-dropafter={dropIndex === items.length && index === items.length - 1 || undefined}
                draggable={reordering}
                onDragStart={(event) => {
                  setDragId(item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  // Firefox refuses to start a drag with no payload set.
                  event.dataTransfer.setData('text/plain', item.id);
                }}
                onDragOver={(event) => {
                  if (!dragId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  // Past the midpoint means "after this row", which is the gap
                  // below it — so the indicator sits where the row will land.
                  const box = event.currentTarget.getBoundingClientRect();
                  setDropIndex(event.clientY - box.top > box.height / 2 ? index + 1 : index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDrop(dropIndex ?? index);
                }}
                onDragEnd={endDrag}
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
                  {isLastSent ? <span className="rd-sent">LAST SENT</span> : null}
                  {/* Never on the selected row: "next" beside "you are here" is
                      noise, and the selection already has its own treatment.
                      This is a position in a list, not an on-air claim. */}
                  {item.id === nextTakeableId && item.id !== rundown.selectedItemId ? (
                    <span className="dock-qitem__next">NEXT</span>
                  ) : null}
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
