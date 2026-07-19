import { useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { templateRegistry } from '../templates/registry';
import { describeTemplate } from '../../lib/templateMeta';
import { Icon } from '../../lib/icons';
import type { GraphicInstance } from '../../types/graphics';
import QuickQueuePanel from './QuickQueuePanel';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));
const COMPACT_COUNT = 4;

function itemLabel(item: GraphicInstance): string {
  if (item.presetName?.trim()) return item.presetName;
  const t = templateById.get(item.templateId);
  const primary = t?.primaryField;
  return (primary ? item.values[primary] : '') || item.values.name || t?.name || item.templateId;
}
function typeName(templateId: string): string {
  return describeTemplate(templateById.get(templateId), templateId).label;
}
function draftLabel(state: ReturnType<typeof useLiveLayerStore.getState>): string {
  const t = templateById.get(state.currentTemplateId);
  const primary = t?.primaryField;
  return (primary ? state.draftValues[primary] : '') || state.draftValues.name || t?.name || state.currentTemplateId;
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
        {quickQueue.length > 0 ? (
          <button type="button" className="rail-queue__link" onClick={() => setExpanded(true)}>
            View all
          </button>
        ) : null}
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
                  <Icon name={describeTemplate(templateById.get(item.templateId), item.templateId).icon} size={12} />
                  {typeName(item.templateId)}
                </span>
              </span>
              <button
                type="button"
                className="rail-qrow__take"
                aria-label={`Take ${itemLabel(item)}`}
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
