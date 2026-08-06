import { create } from 'zustand';
import { loadDockPrefs, saveDockPrefs, type DockPrefs } from '../lib/storage';

interface DockPrefsState extends DockPrefs {
  setCompactProgramStrip: (compact: boolean) => void;
}

/**
 * Dock-surface preferences, kept OUT of the main LiveLayer store on purpose:
 * nothing here touches graphics, Program, or packs — it only shapes the dock's
 * own chrome, and the main store is already the app's largest file.
 *
 * `compactProgramStrip` is read by DockProgramStrip (stage 2b) and written by
 * the More tab's toggle (stage 3). Persisted via `livelayer.dockPrefs` so the
 * choice survives OBS restarts and is wiped by "Reset all local data" like
 * every other livelayer key.
 */
export const useDockPrefs = create<DockPrefsState>()((set) => ({
  ...loadDockPrefs(),
  setCompactProgramStrip: (compact) =>
    set(() => {
      saveDockPrefs({ compactProgramStrip: compact });
      return { compactProgramStrip: compact };
    })
}));
