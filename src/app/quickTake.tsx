import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Quick take — airing a verse in one gesture, without breaking the promise.
 *
 * Asked for from the desk: "can we make double clicking a verse push take it
 * live? or enter? i want to make the work easier on fast scripture display."
 * Verse-by-verse through a passage while someone is preaching is exactly the
 * moment two clicks and a look across the screen are too slow.
 *
 * ## Why it is a mode and not simply the behaviour
 *
 * Everything else in this app rests on one sentence, and the guide states it in
 * bold to volunteers: nothing reaches the stream until you press Take live.
 * That sentence is why an operator who has never used LiveLayer will click
 * around and learn it instead of freezing. Making double-click air a graphic
 * would quietly make it false for everyone, including the person reading the
 * guide for the first time on a Sunday.
 *
 * So it is a switch. Off, the promise holds exactly as written. On, it is
 * visible on screen — the panel wears a badge — so anyone standing at the desk
 * can see that this surface is now hot.
 *
 * ## It does not survive a reload, deliberately
 *
 * Session state, never persisted. A mode that airs graphics from a single
 * gesture must not be inherited silently by whoever opens the app next week; the
 * cost of that decision is one click at the start of a service, and the cost of
 * the other decision is a volunteer discovering it by accident.
 *
 * ## It refuses while a rundown is active
 *
 * `ControlPage.onTake` fires the SELECTED RUNDOWN ROW when a rundown is active
 * and never falls through to the draft. So a verse double-clicked in that state
 * would air something else entirely — the worst possible outcome for a control
 * whose whole point is speed. `blocked` carries the reason, and the surface says
 * it rather than doing nothing.
 */

export interface QuickTakeValue {
  /** Is the one-gesture path armed? */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /**
   * Why it cannot fire right now, or null. Non-null does NOT mean the switch is
   * off — it means the switch is on and something else owns Take.
   */
  blocked: string | null;
  /** Stage the current draft and air it, through the one publish door. */
  takeNow: () => void;
}

const FALLBACK: QuickTakeValue = {
  enabled: false,
  setEnabled: () => {},
  blocked: null,
  takeNow: () => {}
};

/**
 * Defaults to a value that does nothing, so a surface rendered outside the
 * control layout — a preview, a test, the template library — is inert rather
 * than throwing. The one thing it must never do is silently air something.
 */
const QuickTakeContext = createContext<QuickTakeValue>(FALLBACK);

export function QuickTakeProvider({
  children,
  takeDraft,
  rundownActive
}: {
  children: ReactNode;
  takeDraft: () => void;
  rundownActive: boolean;
}) {
  const [enabled, setEnabled] = useState(false);

  const value = useMemo<QuickTakeValue>(
    () => ({
      enabled,
      setEnabled,
      blocked: rundownActive
        ? 'A rundown is active, so Take fires the selected rundown row — not this verse.'
        : null,
      takeNow: () => {
        // Belt and braces: the surface checks `blocked` before offering the
        // gesture, and this refuses anyway. Airing the wrong graphic quickly is
        // worse than not airing one.
        if (!enabled || rundownActive) return;
        takeDraft();
      }
    }),
    [enabled, rundownActive, takeDraft]
  );

  return <QuickTakeContext.Provider value={value}>{children}</QuickTakeContext.Provider>;
}

export function useQuickTake(): QuickTakeValue {
  return useContext(QuickTakeContext);
}
