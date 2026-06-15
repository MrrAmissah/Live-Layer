import { useEffect, useRef, useState } from 'react';
import { useRundowns } from '../../hooks/useRundowns';
import { MAX_RUNDOWNS, MAX_ITEMS_PER_RUNDOWN } from '../../lib/rundown/rundownStore';
import { exportSelectedRundownPack, exportResultMessage } from '../../lib/export/exportRundownPack';
import type { Rundown } from '../../types/rundown';
import RundownCard from './RundownCard';
import RundownItemList from './RundownItemList';

/**
 * Rundown management inside the Library (R2 — management only). Create/rename/
 * delete rundowns, set one active, and add the current draft or Saved Graphics
 * as deep-cloned snapshots. Nothing here Takes, posts a realtime message, or
 * touches `/output` — live queue operation is R3.
 */
export default function RundownLibrary() {
  const rd = useRundowns();
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState('');
  const flashTimerRef = useRef<number | undefined>(undefined);

  const flash = (text: string, durationMs = 2500) => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setMessage(text);
    flashTimerRef.current = window.setTimeout(() => {
      setMessage('');
      flashTimerRef.current = undefined;
    }, durationMs);
  };

  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);

  const onCreate = () => {
    const created = rd.createRundown(newName.trim() || 'New rundown');
    if (!created) {
      flash(`Limit reached — max ${MAX_RUNDOWNS} rundowns. Delete one first.`);
      return;
    }
    rd.setActiveRundown(created.id);
    setNewName('');
    flash(`Created “${created.name}”`);
  };

  const onAddDraft = () => {
    if (!rd.activeRundownId) {
      flash('Create or select a rundown first.');
      return;
    }
    if ((rd.activeRundown?.items.length ?? 0) >= MAX_ITEMS_PER_RUNDOWN) {
      flash(`Rundown is full — max ${MAX_ITEMS_PER_RUNDOWN} items.`);
      return;
    }
    const item = rd.addDraftToRundown();
    flash(item ? `Added “${item.title}”` : 'Could not add item.');
  };

  const onDeleteRundown = (id: string, name: string) => {
    if (window.confirm(`Delete the rundown “${name}” and all its items?`)) {
      rd.deleteRundown(id);
    }
  };

  const onExportRundown = async (rundown: Rundown) => {
    const result = await exportSelectedRundownPack(rundown);
    flash(exportResultMessage(result), 6500);
  };

  const active = rd.activeRundown;

  return (
    <div className="rd-library">
      <div className="preset-save">
        <input
          className="field__input"
          value={newName}
          placeholder="New rundown name…"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCreate();
          }}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCreate}>New rundown</button>
      </div>

      <button type="button" className="btn btn--secondary btn--sm rd-add-draft" onClick={onAddDraft}>
        + Add current draft
      </button>
      {message ? <p className="field__hint" role="status" aria-live="polite">{message}</p> : null}

      {rd.rundowns.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No rundowns yet</p>
          <p className="empty-state__hint">Create a rundown to line up graphics for a service.</p>
        </div>
      ) : (
        <ul className="rd-card-list">
          {rd.rundowns.map((rundown) => (
            <RundownCard
              key={rundown.id}
              rundown={rundown}
              active={rundown.id === rd.activeRundownId}
              onSetActive={() => rd.setActiveRundown(rundown.id)}
              onExport={() => onExportRundown(rundown)}
              onDelete={() => onDeleteRundown(rundown.id, rundown.name)}
            />
          ))}
        </ul>
      )}

      {active ? (
        <div className="rd-active">
          <label className="rd-active__rename">
            <span className="ll-kicker">Active rundown</span>
            <input
              className="field__input"
              value={active.name}
              onChange={(event) => rd.renameRundown(active.id, event.target.value)}
              aria-label="Rundown name"
            />
          </label>
          <RundownItemList
            items={active.items}
            selectedItemId={active.selectedItemId}
            onSelect={(id) => rd.setSelectedItem(active.selectedItemId === id ? undefined : id)}
            onToggleDone={(id) => rd.toggleDone(id)}
            onMoveUp={(id) => rd.moveItemUp(id)}
            onMoveDown={(id) => rd.moveItemDown(id)}
            onDuplicate={(id) => rd.duplicateItem(id)}
            onDelete={(id) => rd.deleteItem(id)}
          />
        </div>
      ) : rd.rundowns.length > 0 ? (
        <p className="field__hint">Select a rundown above to manage its items.</p>
      ) : null}
    </div>
  );
}
