import { useEffect, useRef, useState } from 'react';
import { useRundowns } from '../../hooks/useRundowns';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import {
  getQueueCursors,
  getNextTakeableItem,
  MAX_ITEMS_PER_RUNDOWN,
  MAX_RUNDOWNS
} from '../../lib/rundown/rundownStore';
import { filterRundownItems } from '../../lib/rundown/queueSearch';
import { describeGraphic, graphicTitle, templateLabel } from '../../lib/graphicTitle';
import { templateRegistry } from '../templates/registry';
import { describeTemplate } from '../../lib/templateMeta';
import { Icon } from '../../lib/icons';

interface DockQueueTabProps {
  /** Jump to the Live tab, whose monitor shows the selected item — the thing Take fires. */
  onPreviewSelected: () => void;
  /** Jump to the Quick Edit tab, whose editors target the selected item. */
  onEditSelected: () => void;
}

/**
 * Queue tab: run and manage the active rundown from the dock. Search, add,
 * reorder (per-row ±1, the only move the store performs), duplicate, done,
 * delete — and a selected-item bar with Preview and Edit.
 *
 * Deliberately NO Take here. The mockup draws one in the selected-action bar,
 * but the pinned Program strip above already owns the dock's single Take;
 * a second would reintroduce the two-Take ambiguity stage 1 removed. Preview
 * and Edit navigate to the tabs that really do those jobs, so neither is a
 * duplicate surface either.
 */
export default function DockQueueTab({ onPreviewSelected, onEditSelected }: DockQueueTabProps) {
  const rd = useRundowns();
  const [message, setMessage] = useState('');
  const messageTimerRef = useRef<number | undefined>(undefined);
  // The rundown picker doubles as the no-active-rundown state and the
  // "Change" disclosure when one is active.
  const [managing, setManaging] = useState(false);

  const flash = (text: string) => {
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = window.setTimeout(() => {
      setMessage('');
      messageTimerRef.current = undefined;
    }, 4000);
  };
  useEffect(() => () => {
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
  }, []);

  const rundown = rd.activeRundown;
  const showPicker = !rundown || managing;

  return (
    <div className="dock-tabpane">
      <section className="dock-card">
        <div className="dock-card__head">
          <span className="ll-kicker">Rundown</span>
          <span className="dock-card__meta" title={rundown?.name}>
            {rundown ? rundown.name : 'None active'}
          </span>
          {rd.rundowns.length > 0 && rundown ? (
            <button
              type="button"
              className="dock-card__action"
              aria-expanded={managing}
              onClick={() => setManaging((value) => !value)}
            >
              {managing ? 'Done' : 'Change'}
            </button>
          ) : null}
        </div>
        {showPicker ? <RundownPicker flash={flash} onActivated={() => setManaging(false)} /> : null}
        {message ? (
          <p className="dock-card__hint" role="status" aria-live="polite">{message}</p>
        ) : null}
      </section>

      {rundown ? (
        <QueueCard
          key={rundown.id}
          flash={flash}
          onPreviewSelected={onPreviewSelected}
          onEditSelected={onEditSelected}
        />
      ) : null}
    </div>
  );
}

/** Pick or create the active rundown — the dock's only rundown manager. */
function RundownPicker({ flash, onActivated }: { flash: (text: string) => void; onActivated: () => void }) {
  const rd = useRundowns();
  const [newName, setNewName] = useState('');

  const onCreate = () => {
    const created = rd.createRundown(newName.trim() || 'New rundown');
    if (!created) {
      // createRundown returns undefined at the cap — surfaced, never swallowed.
      flash(`Limit reached — max ${MAX_RUNDOWNS} rundowns. Delete one in the studio first.`);
      return;
    }
    rd.setActiveRundown(created.id);
    setNewName('');
    onActivated();
  };

  return (
    <div className="dock-rdpick">
      {rd.rundowns.length === 0 ? (
        <p className="dock-card__hint">No rundowns yet — create one to line up graphics for a service.</p>
      ) : (
        <ul className="dock-rdpick__list">
          {rd.rundowns.map((entry) => {
            const active = entry.id === rd.activeRundownId;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="dock-rdpick__row"
                  aria-pressed={active}
                  onClick={() => {
                    rd.setActiveRundown(entry.id);
                    onActivated();
                  }}
                >
                  <span className="dock-rdpick__name" title={entry.name}>{entry.name}</span>
                  <span className="dock-rdpick__count">{entry.items.length} item{entry.items.length === 1 ? '' : 's'}</span>
                  <span className="dock-rdpick__state">{active ? 'Active' : 'Set active'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="dock-rdpick__new">
        <input
          className="field__input"
          value={newName}
          placeholder="New rundown name…"
          aria-label="New rundown name"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCreate();
          }}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCreate}>
          Create
        </button>
      </div>
    </div>
  );
}

/** The queue proper: head + search + add panel + rows + selected-action bar. */
function QueueCard({
  flash,
  onPreviewSelected,
  onEditSelected
}: {
  flash: (text: string) => void;
  onPreviewSelected: () => void;
  onEditSelected: () => void;
}) {
  const rd = useRundowns();
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  // One expanded row-action strip at a time; closed on any queue mutation
  // below so a strip can't linger on a row whose neighbours just changed.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const rundown = rd.activeRundown;
  if (!rundown) return null;

  const items = rundown.items;
  const { selected, selectedIndex } = getQueueCursors(rundown);
  const lastSentItemId = rundown.activeItemId;
  /**
   * The row **Take Next would actually send** — not merely the row after the
   * selection.
   *
   * Those differ the moment a done item sits in between, and the badge has to be
   * the one that matches the button: marking NEXT on a done row that Take Next
   * would skip past tells the operator the queue is about to do something it is
   * not. `getNextTakeableItem` is the same rule `planTakeNext` and
   * `ControlPage.onTakeNext` use, so the badge, the cue and the graphic that airs
   * cannot disagree.
   *
   * Only ever ONE extra marker on a row, and never on the selected row: the
   * selection already has its own treatment, and "next" beside "you are here"
   * is noise. Nothing here is an on-air claim — NEXT is a position in a list.
   */
  const nextItemId = getNextTakeableItem(rundown)?.id;
  const searching = query.trim().length > 0;
  const hits = filterRundownItems(items, query);
  const full = items.length >= MAX_ITEMS_PER_RUNDOWN;

  const guardAdd = (added: unknown, title?: string) => {
    // addItem returns undefined/null when the rundown is at its item cap —
    // the refusal is said out loud, never swallowed.
    if (!added) flash(`Rundown is full — max ${MAX_ITEMS_PER_RUNDOWN} items. Delete one first.`);
    else if (title) flash(`Added “${title}”`);
  };

  return (
    <section className="dock-card dock-q">
      <div className="dock-card__head">
        <span className="ll-kicker">Queue</span>
        <span className="dock-card__meta">{items.length} item{items.length === 1 ? '' : 's'}</span>
        <button
          type="button"
          className="dock-q__addbtn"
          aria-expanded={addOpen}
          onClick={() => setAddOpen((value) => !value)}
        >
          <Icon name="plus" size={13} />
          Add
        </button>
      </div>

      {addOpen ? <AddPanel full={full} guardAdd={guardAdd} /> : null}

      {items.length > 0 ? (
        <div className="dock-q__search">
          <Icon name="search" size={14} />
          <input
            type="search"
            value={query}
            placeholder="Search queue…"
            aria-label="Search queue"
            onChange={(event) => setQuery(event.target.value)}
          />
          {searching ? (
            <button type="button" className="dock-q__clear" aria-label="Clear search" onClick={() => setQuery('')}>
              ✕
            </button>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="dock-card__hint">No items yet — use Add above to queue your first graphic.</p>
      ) : hits.length === 0 ? (
        <p className="dock-card__hint">No items match “{query.trim()}”.</p>
      ) : (
        <ol className="dock-q__list">
          {hits.map(({ item, index }) => {
            const meta = describeGraphic(item.graphic);
            const menuOpen = openMenuId === item.id;
            const closeAnd = (fn: () => void) => () => {
              setOpenMenuId(null);
              fn();
            };
            return (
              <li
                key={item.id}
                className="dock-qitem"
                data-selected={item.id === rundown.selectedItemId || undefined}
                data-done={item.done || undefined}
              >
                <button
                  type="button"
                  className="dock-qitem__main"
                  onClick={() => rd.setSelectedItem(item.id)}
                  aria-current={item.id === rundown.selectedItemId ? 'true' : undefined}
                >
                  <span className="dock-qitem__title">{item.title}</span>
                  <span className="dock-qitem__sub">
                    <Icon name={meta.icon} size={12} />
                    {/* The type ellipsises; the queue position must survive
                        any width — it is the running order Take walks. */}
                    <span className="dock-qitem__type">{meta.typeLabel}</span>
                    <span className="dock-qitem__dot" aria-hidden>•</span>
                    <span className="dock-qitem__pos">{index + 1}</span>
                  </span>
                </button>
                <span className="dock-qitem__cluster">
                  {item.id === lastSentItemId ? <span className="rd-sent">LAST SENT</span> : null}
                  {item.id === nextItemId && item.id !== selected?.id ? (
                    <span className="dock-qitem__next">NEXT</span>
                  ) : null}
                  <button
                    type="button"
                    className="dock-qitem__menu"
                    aria-expanded={menuOpen}
                    aria-label={`Actions for ${item.title}`}
                    onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
                  >
                    <Icon name="overflow" size={15} />
                  </button>
                </span>
                {/* An inline action strip, not a floating menu: no popover
                    primitive exists in this codebase, and an in-flow strip
                    needs no positioning or outside-click logic and cannot be
                    clipped at 255px. Every button is a real store operation. */}
                {menuOpen ? (
                  <div className="dock-qitem__actions" role="group" aria-label={`${item.title} actions`}>
                    {/* Moves are hidden while searching: the store swaps ±1 in
                        the FULL queue, and moving past hidden neighbours would
                        look like nothing happened. Same rule as the studio
                        quick queue's filter. */}
                    {!searching ? (
                      <>
                        <button
                          type="button"
                          className="dock-qitem__act"
                          disabled={index === 0}
                          onClick={() => rd.moveItemUp(item.id)}
                        >
                          <Icon name="chevronUp" size={13} />
                          Move up
                        </button>
                        <button
                          type="button"
                          className="dock-qitem__act"
                          disabled={index === items.length - 1}
                          onClick={() => rd.moveItemDown(item.id)}
                        >
                          <Icon name="chevronDown" size={13} />
                          Move down
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="dock-qitem__act"
                      disabled={full}
                      title={full ? `Rundown is full — max ${MAX_ITEMS_PER_RUNDOWN} items.` : undefined}
                      onClick={closeAnd(() => guardAdd(rd.duplicateItem(item.id)))}
                    >
                      Duplicate
                    </button>
                    <button type="button" className="dock-qitem__act" onClick={() => rd.toggleDone(item.id)}>
                      {item.done ? 'Mark not done' : 'Mark done'}
                    </button>
                    <button
                      type="button"
                      className="dock-qitem__act dock-qitem__act--danger"
                      onClick={closeAnd(() => {
                        if (window.confirm(`Remove “${item.title}” from the queue?`)) rd.deleteItem(item.id);
                      })}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {/* Selected-action bar. Preview/Edit only — Take stays in the Program
          strip above (the dock's one and only Take). */}
      {selected ? (
        <div className="dock-q__selbar">
          <span className="dock-q__selinfo">
            <span className="ll-kicker">Selected{selectedIndex >= 0 ? ` · #${selectedIndex + 1}` : ''}</span>
            <span className="dock-q__selname" title={selected.title}>{selected.title}</span>
          </span>
          <span className="dock-q__selacts">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              title="Show this item on the Live tab monitor"
              onClick={onPreviewSelected}
            >
              <Icon name="previewOutput" size={14} />
              Preview
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              title="Edit this item in the Quick Edit tab"
              onClick={onEditSelected}
            >
              <Icon name="edit" size={14} />
              Edit
            </button>
          </span>
        </div>
      ) : items.length > 0 ? (
        <div className="dock-q__selbar">
          <span className="dock-q__selinfo">
            <span className="ll-kicker">Selected</span>
            <span className="dock-q__selname">No item selected</span>
          </span>
          <span className="dock-q__selacts">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => rd.setSelectedItem(items[0].id)}
            >
              Select first item
            </button>
          </span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The Add disclosure: current draft, saved graphics, or a fresh pack-seeded
 * template. Each row states exactly what will be added; every path reports
 * the item-cap refusal through `guardAdd`.
 */
function AddPanel({ full, guardAdd }: { full: boolean; guardAdd: (added: unknown, title?: string) => void }) {
  const rd = useRundowns();
  const presets = useLiveLayerStore((state) => state.presets);
  const draftTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftTitle = useLiveLayerStore((state) =>
    graphicTitle({ templateId: state.currentTemplateId, values: state.draftValues })
  );

  return (
    <div className="dock-q__addpanel">
      {full ? (
        <p className="dock-card__hint" role="status">
          Rundown is full — max {MAX_ITEMS_PER_RUNDOWN} items. Delete one first.
        </p>
      ) : null}

      <div className="dock-q__addgroup">
        <span className="ll-kicker">Current draft</span>
        {/* The draft is HIDDEN while a rundown runs (the Live tab shows the
            selected item), so the row names exactly what would be added. */}
        <button
          type="button"
          className="dock-q__addrow"
          disabled={full}
          onClick={() => {
            const item = rd.addDraftToRundown();
            guardAdd(item, item?.title);
          }}
        >
          <span className="dock-q__addrow-title" title={draftTitle}>{draftTitle}</span>
          <span className="dock-q__addrow-type">{templateLabel(draftTemplateId)}</span>
          <Icon name="plus" size={14} />
        </button>
      </div>

      {presets.length > 0 ? (
        <div className="dock-q__addgroup">
          <span className="ll-kicker">Saved graphics</span>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="dock-q__addrow"
              disabled={full}
              onClick={() => {
                const item = rd.addSavedGraphicToRundown(preset);
                guardAdd(item, item?.title);
              }}
            >
              <span className="dock-q__addrow-title" title={graphicTitle(preset)}>{graphicTitle(preset)}</span>
              <span className="dock-q__addrow-type">{templateLabel(preset.templateId)}</span>
              <Icon name="plus" size={14} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="dock-q__addgroup">
        <span className="ll-kicker">Start from a template</span>
        {templateRegistry.map((template) => (
          <button
            key={template.id}
            type="button"
            className="dock-q__addrow"
            disabled={full}
            onClick={() => {
              const item = rd.addTemplateToRundown(template.id);
              guardAdd(item, item?.title);
            }}
          >
            <Icon name={describeTemplate(template, template.id).icon} size={14} />
            <span className="dock-q__addrow-title">{template.name}</span>
            <Icon name="plus" size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
