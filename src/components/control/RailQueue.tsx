import { useState } from 'react';
import { resolveGraphicReadiness } from '../../lib/graphicReadiness';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
// One title rule for every queue/preset/program surface — see graphicTitle.ts.
import { graphicTitle, describeGraphic } from '../../lib/graphicTitle';
import { Icon } from '../../lib/icons';
import type { GraphicInstance } from '../../types/graphics';
import QuickQueuePanel from './QuickQueuePanel';

const COMPACT_COUNT = 4;

const itemLabel = (item: GraphicInstance): string => graphicTitle(item);

function draftLabel(state: ReturnType<typeof useLiveLayerStore.getState>): string {
  return graphicTitle({ templateId: state.currentTemplateId, values: state.draftValues });
}

/**
 * Studio Quick Queue in the Program rail — the compact reference list (numbered
 * rows, template type, a take arrow) with "View all" expanding to the full
 * search/reorder/edit panel, so no functionality is lost.
 */
export default function RailQueue({
  onTakeInstance,
  onEditInstance
}: {
  onTakeInstance: (item: GraphicInstance) => void;
  onEditInstance: (item: GraphicInstance) => void;
}) {
  const quickQueue = useLiveLayerStore((state) => state.quickQueue);
  const addToQuickQueue = useLiveLayerStore((state) => state.addToQuickQueue);
  const program = useLiveLayerStore((state) => state.program);
  const [expanded, setExpanded] = useState(false);

  // Which queued entry produced what is currently commanded on air. Program
  // keeps the ORIGINATING item id in sourceId, so a re-taken entry still marks
  // its own row. Never marks on 'clear'/'failed' — nothing is on air then.
  const liveSourceId =
    program.sourceType === 'quickQueue' && (program.status === 'showing' || program.status === 'recovering')
      ? program.sourceId
      : null;

  if (expanded) {
    return (
      <div className="rail-queue rail-queue--full">
        <div className="rail-queue__head">
          <span className="ll-kicker">Quick queue</span>
          <button type="button" className="rail-queue__link" onClick={() => setExpanded(false)}>
            Show less
          </button>
        </div>
        <QuickQueuePanel onTakeInstance={onTakeInstance} onEditInstance={onEditInstance} />
      </div>
    );
  }

  const shown = quickQueue.slice(0, COMPACT_COUNT);

  return (
    <div className="rail-queue">
      <div className="rail-queue__head">
        <span className="ll-kicker">Quick queue</span>
        {/* Always reachable: the expanded panel holds the name-based quick-add,
            so an empty queue must not be a dead end. */}
        <button type="button" className="rail-queue__link" onClick={() => setExpanded(true)}>
          {quickQueue.length > 0 ? 'View all' : 'Set up queue'}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="rail-queue__empty">Line up graphics here to take them one after another.</p>
      ) : (
        <ol className="rail-queue__list">
          {shown.map((item, index) => (
            <li
              key={item.id}
              className={`rail-qrow${item.id === liveSourceId ? ' rail-qrow--live' : ''}`}
              aria-current={item.id === liveSourceId ? 'true' : undefined}
            >
              <span className="rail-qrow__num">{index + 1}</span>
              <span className="rail-qrow__body">
                <span className="rail-qrow__name">{itemLabel(item)}</span>
                <span className="rail-qrow__type">
                  <Icon name={describeGraphic(item).icon} size={12} />
                  {describeGraphic(item).typeLabel}
                </span>
              </span>
              {/* Same per-item rule as the full queue panel. This compact row is
                  an icon button with no room for the reason, so it carries it as
                  the accessible name and the tooltip rather than as visible text. */}
              <button
                type="button"
                className="rail-qrow__take"
                aria-label={
                  resolveGraphicReadiness(item.templateId, item.values).ready
                    ? `Take ${itemLabel(item)}`
                    : `Cannot take ${itemLabel(item)} — ${resolveGraphicReadiness(item.templateId, item.values).reason}`
                }
                title={resolveGraphicReadiness(item.templateId, item.values).reason || undefined}
                disabled={!resolveGraphicReadiness(item.templateId, item.values).ready}
                onClick={() => onTakeInstance(item)}
              >
                <Icon name="play" size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="rail-queue__add"
        onClick={() => addToQuickQueue(draftLabel(useLiveLayerStore.getState()))}
      >
        <Icon name="plus" size={15} />
        Add current graphic to queue
      </button>
    </div>
  );
}
