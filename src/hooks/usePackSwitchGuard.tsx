import { createContext, useContext, useState, type ReactNode } from 'react';
import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { getPack } from '../lib/packs';

interface PackSwitchGuardValue {
  /**
   * Request an event-pack change from any switcher. Same pack → no-op; a clean
   * ad-hoc draft switches immediately; an edited draft opens one shared
   * confirmation first (switching re-seeds the draft). Confirm invokes
   * setActivePack exactly once with its established re-seeding behaviour.
   */
  requestPackChange: (packId: string) => void;
}

/** What a pack-change request should do. Pure so the branching is unit-tested
 *  without rendering: same pack is a no-op, a clean draft switches immediately,
 *  an edited draft must confirm first. */
export type PackChangeIntent = 'noop' | 'switch' | 'confirm';
export function resolvePackChangeIntent(currentPackId: string, nextPackId: string, draftDirty: boolean): PackChangeIntent {
  if (nextPackId === currentPackId) return 'noop';
  return draftDirty ? 'confirm' : 'switch';
}

const PackSwitchGuardContext = createContext<PackSwitchGuardValue | null>(null);

export function usePackSwitchGuard(): PackSwitchGuardValue {
  const ctx = useContext(PackSwitchGuardContext);
  if (!ctx) throw new Error('usePackSwitchGuard must be used within a PackSwitchGuardProvider');
  return ctx;
}

/**
 * One guard for every pack switcher (CommandBar, BrandControls,
 * EventPackSummary). Owns the confirmation so no component duplicates the logic;
 * dirtiness is read from the store's isDraftDirty, which reuses the exact
 * seeding setActivePack applies — so the check can't drift from the behaviour.
 * The guard inspects the hidden ad-hoc draft even while a rundown item is
 * selected, since that draft can still hold unsaved edits.
 */
export function PackSwitchGuardProvider({ children }: { children: ReactNode }) {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const setActivePack = useLiveLayerStore((state) => state.setActivePack);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);

  const requestPackChange = (packId: string) => {
    // getState() so the dirtiness check is live, not a render-time snapshot.
    const intent = resolvePackChangeIntent(activePackId, packId, useLiveLayerStore.getState().isDraftDirty());
    if (intent === 'noop') return;
    if (intent === 'switch') {
      setActivePack(packId);
      return;
    }
    setPendingPackId(packId);
  };

  const confirm = () => {
    if (pendingPackId) setActivePack(pendingPackId);
    setPendingPackId(null);
  };
  const cancel = () => setPendingPackId(null);

  const pendingPack = pendingPackId ? getPack(pendingPackId) : null;

  return (
    <PackSwitchGuardContext.Provider value={{ requestPackChange }}>
      {children}
      {pendingPack ? (
        <div className="pack-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pack-confirm-title">
          <div className="pack-confirm__scrim" onClick={cancel} aria-hidden />
          <div className="pack-confirm__card">
            <h2 id="pack-confirm-title" className="pack-confirm__title">
              Switch to “{pendingPack.name}”?
            </h2>
            <p className="pack-confirm__body">
              This resets the current draft to the pack’s defaults, discarding your unsaved edits. Saved
              presets, rundowns, and live output are unaffected.
            </p>
            <div className="pack-confirm__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn--secondary btn--sm pack-confirm__go" autoFocus onClick={confirm}>
                Switch &amp; reset draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PackSwitchGuardContext.Provider>
  );
}
