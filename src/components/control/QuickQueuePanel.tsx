import { useMemo, useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { templateRegistry } from '../templates/registry';
import { describeTemplate } from '../../lib/templateMeta';
import { Icon } from '../../lib/icons';
import type { GraphicInstance } from '../../types/graphics';

const templateById = new Map(templateRegistry.map((template) => [template.id, template]));

function templateShortName(templateId: string): string {
  return describeTemplate(templateById.get(templateId), templateId).label;
}

/** The field a quick-added name lands in (and labels read first). */
function primaryFieldFor(templateId: string): string {
  return templateById.get(templateId)?.primaryField ?? 'name';
}

/**
 * Human label for a set of values: the template's primary field first, then
 * a generic identity cascade. Shared by queue entries and the draft button.
 */
function labelFromValues(templateId: string, values: Record<string, string>): string {
  return (
    values[primaryFieldFor(templateId)] ||
    values.name ||
    values.eventTitle ||
    values.headline ||
    values.sermonTitle ||
    values.reference ||
    values.quoteText?.slice(0, 32) ||
    ''
  );
}

function entryLabel(item: GraphicInstance): string {
  return (
    item.presetName?.trim() ||
    labelFromValues(item.templateId, item.values) ||
    templateShortName(item.templateId)
  );
}

/**
 * Live quick queue (studio right column, under the on-air actions).
 *
 * Pre-built graphics in a deliberate order for fast live swaps — the choir
 * lineup problem: prepare each performer's banner before the service, then
 * take them one after another without touching the editor. Items can be
 * reordered, re-loaded into the editor for edits, and taken straight to air.
 */
export default function QuickQueuePanel({
  onTakeInstance
}: {
  onTakeInstance: (item: GraphicInstance) => void;
}) {
  const quickQueue = useLiveLayerStore((state) => state.quickQueue);
  const program = useLiveLayerStore((state) => state.program);
  // The entry Program says is on air — survives reloads, unlike a local
  // "last taken" flag.
  const liveSourceId =
    program.sourceType === 'quickQueue' && (program.status === 'showing' || program.status === 'recovering')
      ? program.sourceId
      : null;
  const addToQuickQueue = useLiveLayerStore((state) => state.addToQuickQueue);
  const removeFromQuickQueue = useLiveLayerStore((state) => state.removeFromQuickQueue);
  const moveInQuickQueue = useLiveLayerStore((state) => state.moveInQuickQueue);
  const loadGraphicInstance = useLiveLayerStore((state) => state.loadGraphicInstance);
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  // Derived-string selector: the panel only re-renders when the label itself
  // changes, not on every editor keystroke in unrelated fields.
  const draftLabel = useLiveLayerStore(
    (state) =>
      labelFromValues(state.currentTemplateId, state.draftValues) ||
      templateShortName(state.currentTemplateId)
  );
  const [newName, setNewName] = useState('');
  const [templateFilter, setTemplateFilter] = useState<string | null>(null);

  // One pass over the queue: per-template counts (chips) + running-order index.
  const { templateCounts, indexById } = useMemo(() => {
    const counts = new Map<string, number>();
    const indices = new Map<string, number>();
    quickQueue.forEach((item, index) => {
      counts.set(item.templateId, (counts.get(item.templateId) ?? 0) + 1);
      indices.set(item.id, index);
    });
    return { templateCounts: counts, indexById: indices };
  }, [quickQueue]);
  const presentTemplates = [...templateCounts.keys()];

  // Self-healing: a filter pointing at a template with no remaining entries
  // (e.g. after deletes) falls back to "all" instead of a dead-end empty list.
  const effectiveFilter =
    templateFilter && templateCounts.has(templateFilter) ? templateFilter : null;
  const visibleQueue = effectiveFilter
    ? quickQueue.filter((item) => item.templateId === effectiveFilter)
    : quickQueue;

  /**
   * Type-and-enter add: uses the current draft as the base (template, design,
   * colors) and swaps in the typed name — so a whole choir lineup can be
   * queued without touching the editor after the first setup.
   */
  const quickAddName = () => {
    const name = newName.trim();
    if (!name) return;
    addToQuickQueue(name, { [primaryFieldFor(currentTemplateId)]: name });
    setNewName('');
  };

  const editEntry = (item: GraphicInstance) => {
    loadGraphicInstance(item);
    // The editor lives in the center column — bring it into view so the
    // loaded entry is visibly there to tweak.
    document.querySelector('.area--editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // No card chrome or heading of its own — RailQueue supplies both.
  return (
    <div className="qq qq--studio">
      <div className="ll-panel__body qq-body">
        <div className="qq-quick-add">
          <input
            className="field__input qq-quick-add__input"
            type="text"
            value={newName}
            placeholder="Type a name, press Enter to queue"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                quickAddName();
              }
            }}
          />
          <button type="button" className="btn btn--secondary btn--sm" onClick={quickAddName} disabled={!newName.trim()}>
            Add
          </button>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm qq-add"
          onClick={() => addToQuickQueue(draftLabel)}
        >
          + Add current graphic{draftLabel ? ` (“${draftLabel.slice(0, 22)}”)` : ''}
        </button>

        {presentTemplates.length > 1 ? (
          <div className="qq-filter" role="group" aria-label="Filter queue by template">
            <button
              type="button"
              className={`qq-chip${effectiveFilter === null ? ' qq-chip--active' : ''}`}
              onClick={() => setTemplateFilter(null)}
            >
              All · {quickQueue.length}
            </button>
            {presentTemplates.map((templateId) => (
              <button
                key={templateId}
                type="button"
                className={`qq-chip${effectiveFilter === templateId ? ' qq-chip--active' : ''}`}
                onClick={() => setTemplateFilter(effectiveFilter === templateId ? null : templateId)}
              >
                <Icon name={describeTemplate(templateById.get(templateId), templateId).icon} size={11} />
                {templateShortName(templateId)} · {templateCounts.get(templateId)}
              </button>
            ))}
          </div>
        ) : null}

        {quickQueue.length === 0 ? (
          <p className="field__hint">
            Prepare a graphic in the editor, then add it here. Line up every performer before the
            service and take them in order — no live retyping.
          </p>
        ) : (
          <ol className="qq-list">
            {visibleQueue.map((item) => {
              const index = indexById.get(item.id) ?? 0;
              return (
              <li
                key={item.id}
                className={`qq-item${liveSourceId === item.id ? ' qq-item--live' : ''}`}
                aria-current={liveSourceId === item.id ? 'true' : undefined}
              >
                <span className="qq-item__head">
                  <span className="qq-item__pos">{index + 1}</span>
                  <span className="qq-item__label">{entryLabel(item)}</span>
                </span>
                <span className="qq-item__row">
                  <span className="qq-item__template">
                    <Icon name={describeTemplate(templateById.get(item.templateId), item.templateId).icon} size={12} />
                    {templateShortName(item.templateId)}
                  </span>
                  <span className="qq-item__actions">
                  <button
                    type="button"
                    className="qq-btn qq-btn--take"
                    onClick={() => onTakeInstance(item)}
                  >
                    Take
                  </button>
                  <button
                    type="button"
                    className="qq-btn"
                    title="Load into editor"
                    onClick={() => editEntry(item)}
                  >
                    Edit
                  </button>
                  {effectiveFilter === null ? (
                    <>
                      <button
                        type="button"
                        className="qq-btn"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => moveInQuickQueue(item.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="qq-btn"
                        aria-label="Move down"
                        disabled={index === quickQueue.length - 1}
                        onClick={() => moveInQuickQueue(item.id, 1)}
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="qq-btn qq-btn--remove"
                    aria-label="Remove"
                    onClick={() => removeFromQuickQueue(item.id)}
                  >
                    ✕
                  </button>
                  </span>
                </span>
              </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
