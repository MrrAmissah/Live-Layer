import { useState } from 'react';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { templateRegistry } from '../templates/registry';
import type { GraphicInstance } from '../../types/graphics';

/** Human label for a queue entry, derived from its most identifying field. */
function entryLabel(item: GraphicInstance): string {
  if (item.presetName?.trim()) return item.presetName;
  const v = item.values;
  return (
    v.name ||
    v.eventTitle ||
    v.headline ||
    v.sermonTitle ||
    v.reference ||
    v.quoteText?.slice(0, 32) ||
    templateRegistry.find((t) => t.id === item.templateId)?.name ||
    item.templateId
  );
}

function templateShortName(templateId: string): string {
  return templateRegistry.find((t) => t.id === templateId)?.name ?? templateId;
}

/** The field a quick-added name should land in, per template. */
const PRIMARY_NAME_FIELD: Record<string, string> = {
  'preacher-lower-third': 'name',
  'event-banner': 'eventTitle',
  'announcement-banner': 'headline',
  'sermon-title': 'speakerName',
  'quote-card': 'sourceName',
  'scripture-card': 'reference',
  'fullscreen-message': 'headline'
};

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
  const addToQuickQueue = useLiveLayerStore((state) => state.addToQuickQueue);
  const removeFromQuickQueue = useLiveLayerStore((state) => state.removeFromQuickQueue);
  const moveInQuickQueue = useLiveLayerStore((state) => state.moveInQuickQueue);
  const loadGraphicInstance = useLiveLayerStore((state) => state.loadGraphicInstance);
  const draftValues = useLiveLayerStore((state) => state.draftValues);
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const [lastTakenId, setLastTakenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  /**
   * Type-and-enter add: uses the current draft as the base (template, design,
   * colors) and swaps in the typed name — so a whole choir lineup can be
   * queued without touching the editor after the first setup.
   */
  const quickAddName = () => {
    const name = newName.trim();
    if (!name) return;
    const field = PRIMARY_NAME_FIELD[currentTemplateId] ?? 'name';
    addToQuickQueue(name, { [field]: name });
    setNewName('');
  };

  const editEntry = (item: GraphicInstance) => {
    loadGraphicInstance(item);
    // The editor lives in the center column — bring it into view so the
    // loaded entry is visibly there to tweak.
    document.querySelector('.area--editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const draftLabel =
    draftValues.name ||
    draftValues.eventTitle ||
    draftValues.headline ||
    draftValues.sermonTitle ||
    draftValues.reference ||
    templateShortName(currentTemplateId);

  return (
    <Panel className="quick-queue-panel">
      <SectionHeader
        kicker="Live"
        title="Quick queue"
        aside={quickQueue.length ? <span className="qq-count">{quickQueue.length}</span> : undefined}
      />
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
          + Add current graphic{draftLabel ? ` (“${String(draftLabel).slice(0, 22)}”)` : ''}
        </button>

        {quickQueue.length === 0 ? (
          <p className="field__hint">
            Prepare a graphic in the editor, then add it here. Line up every performer before the
            service and take them in order — no live retyping.
          </p>
        ) : (
          <ol className="qq-list">
            {quickQueue.map((item, index) => (
              <li key={item.id} className={`qq-item${lastTakenId === item.id ? ' qq-item--live' : ''}`}>
                <span className="qq-item__head">
                  <span className="qq-item__pos">{index + 1}</span>
                  <span className="qq-item__label">{entryLabel(item)}</span>
                </span>
                <span className="qq-item__row">
                  <span className="qq-item__template">{templateShortName(item.templateId)}</span>
                  <span className="qq-item__actions">
                  <button
                    type="button"
                    className="qq-btn qq-btn--take"
                    onClick={() => {
                      onTakeInstance(item);
                      setLastTakenId(item.id);
                    }}
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
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}
