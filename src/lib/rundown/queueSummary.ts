import type { RundownItem } from '../../types/rundown';

/**
 * The rundown summary's three cursors, turned into words once.
 *
 * SELECTED, LAST SENT and NEXT answer three different questions — what the
 * operator has picked, what we last commanded, and what follows the pick — and
 * they are derived from different fields (`selectedItemId`, `activeItemId`, and
 * the item after the selection). Two of them legitimately resolve to the same
 * item: select the row before the one you last sent and NEXT *is* LAST SENT.
 *
 * Printed as two bare titles that happen to match, that reads as a bug — the
 * panel looks like it is repeating itself, and an operator who distrusts the
 * panel stops reading it. So the coincidence is stated rather than left to be
 * inferred, and the three labels stay semantically distinct.
 *
 * `lastSent` is deliberately named for what `activeItemId` means: the item
 * behind our last successful command. It is not an acknowledgement that OBS
 * rendered it, and this module may not call it live (see `dockOperator.test.ts`).
 */
export interface QueueSummary {
  selected: string;
  lastSent: string;
  next: string;
  /**
   * True when NEXT and LAST SENT are the same item — i.e. taking the selection
   * forward would re-send what was last sent. Never true when either is absent.
   */
  nextIsLastSent: boolean;
}

/** What an absent cursor reads as. One dash, so the rows stay aligned. */
export const NO_ITEM = '—';

export function summariseQueue(cursors: {
  selected?: RundownItem;
  lastSent?: RundownItem;
  next?: RundownItem;
}): QueueSummary {
  const { selected, lastSent, next } = cursors;
  return {
    selected: selected?.title ?? NO_ITEM,
    lastSent: lastSent?.title ?? NO_ITEM,
    next: next?.title ?? NO_ITEM,
    // Compared by id, not by title: two items may share a title, and telling the
    // operator they are "the same item" when they are not is the worse error.
    nextIsLastSent: Boolean(next && lastSent && next.id === lastSent.id)
  };
}
