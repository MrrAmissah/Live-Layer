import { useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { Icon } from '../../lib/icons';

/**
 * "Reset all local data" — one implementation, mounted wherever it belongs.
 *
 * It was inline in `PresetControls`, i.e. at the bottom of the studio's Saved
 * Graphics list, which is where stage 4B moves it out of: erasing every store
 * in the browser is not a saved-graphics action. The dock's Settings tab is its
 * proper home.
 *
 * It is extracted rather than re-created there. A second copy would be a second
 * confirmation flow to keep honest, and the copy below is checked against what
 * `clearLocalData` actually clears — the sort of thing that drifts the moment
 * two versions exist.
 *
 * The studio still mounts it too. `PresetControls` is studio-only
 * (`LibraryControls` and `LibraryStep` are dead code from the pre-#28 dock), so
 * a literal move would leave a studio operator with no way to reset at all. Two
 * mount points, one component, one contract.
 */
export default function ResetLocalData() {
  const clearLocalData = useLiveLayerStore((state) => state.clearLocalData);
  const [confirming, setConfirming] = useState(false);

  /* Two-step, and never a bare one-click. The list is checked against what
     `clearLocalData` really clears: it resets Program and removes the working
     draft as well as the obvious libraries. Nothing leaves this browser, so it
     must not imply a server or cloud deletion. */
  if (confirming) {
    return (
      <div className="preset-reset__confirm" role="alertdialog" aria-label="Confirm reset">
        <p className="preset-reset__warning">
          Erase everything saved in this browser — presets, quick queue, recents, rundowns,
          people, uploaded assets, brand colours, the Program record, and the service and
          graphic you are preparing? This cannot be undone.
        </p>
        <div className="preset-reset__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="preset-reset preset-reset--confirm"
            onClick={() => {
              clearLocalData();
              setConfirming(false);
            }}
          >
            Yes, erase everything
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="preset-reset" onClick={() => setConfirming(true)}>
      <Icon name="reset" size={14} />
      Reset all local data
    </button>
  );
}
