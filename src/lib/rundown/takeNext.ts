import type { GraphicReadiness } from '../graphicReadiness';
import type { Rundown, RundownItem } from '../../types/rundown';
import { countSkippedAfterSelection, getNextTakeableItem, getSelectedItem } from './rundownStore';

/**
 * What Take Next would do, and why it would refuse — decided once.
 *
 * Take Next is the one control in this app that both *chooses* a graphic and
 * *sends* it, so the choice and the refusal have to come out of the same call.
 * Same invariant `describeTakeBlock` establishes for Take: **`disabled` is true
 * exactly when `reason` is non-empty**, so no surface can render a dead button
 * with nothing to say. Here it is stronger, because a third thing has to agree:
 * `item` is present exactly when the plan is enabled. A surface cannot show a
 * cue for one item and send another.
 *
 * The rule is a pure function over a rundown plus an injected readiness lookup,
 * rather than something the button works out for itself. That is the
 * `classifyGroups` lesson from the ASR harness: a rule tested only through its
 * current caller is untested for the states it exists to catch. Here it lets the
 * end-of-list, everything-done and unready-content branches be exercised on
 * rundowns the UI cannot currently build.
 *
 * ## What it deliberately does not do
 *
 * **It does not wrap.** Reaching the end refuses; it does not cycle to the top.
 * Same convention as `moveItem`, which is "a no-op at the ends rather than
 * wrapping" — and a rundown that silently restarts is how the opening titles go
 * out over the closing prayer.
 *
 * **It does not consult `activeItemId`.** What was last sent has no bearing on
 * what is next; see `getNextTakeableItem` for why the selection is the anchor.
 *
 * **It does not mark anything done.** `done` is the operator's judgement and the
 * skip mechanism. If Take set it, an aired item would become permanently
 * unreachable by Take Next, and re-showing a lower third is ordinary.
 */

export interface TakeNextPlan {
  /** The item Take Next would send. Present exactly when `disabled` is false. */
  item?: RundownItem;
  disabled: boolean;
  /** Operator-facing cause. Empty exactly when `disabled` is false. */
  reason: string;
  /** Done items passed over to reach `item`. Zero when none were skipped. */
  skipped: number;
}

const refuse = (reason: string, skipped = 0): TakeNextPlan => ({ disabled: true, reason, skipped });

export function planTakeNext(input: {
  rundown: Rundown | undefined;
  /** Injected so the branches below can be tested without building graphics. */
  readinessOf: (item: RundownItem) => GraphicReadiness;
}): TakeNextPlan {
  const { rundown, readinessOf } = input;

  if (!rundown) {
    return refuse('No rundown is active. Take Next sends the next item in a rundown.');
  }
  if (rundown.items.length === 0) {
    return refuse(`"${rundown.name}" is empty. Add an item before running it.`);
  }

  const skipped = countSkippedAfterSelection(rundown);
  const next = getNextTakeableItem(rundown);

  if (!next) {
    const selected = getSelectedItem(rundown);
    // Three different dead ends, and telling them apart is the whole point of a
    // stated cause: "nothing follows this" is a normal end of service, whereas
    // "the rest are marked done" is a thing the operator can undo.
    if (skipped > 0) {
      return refuse(
        selected
          ? `Everything after "${selected.title}" is marked done. Un-mark one to send it.`
          : 'Every item is marked done. Un-mark one to send it.',
        skipped
      );
    }
    return refuse(
      selected
        ? `"${selected.title}" is the last item — there is nothing after it.`
        : `"${rundown.name}" has nothing left to send.`
    );
  }

  const readiness = readinessOf(next);
  if (!readiness.ready) {
    // The content complaint names the item, because the operator is being told
    // about a graphic they may not be looking at.
    return refuse(`"${next.title}" is not ready. ${readiness.reason}`, skipped);
  }

  return { item: next, disabled: false, reason: '', skipped };
}

/**
 * One line describing what Take Next is about to do, for the cue.
 *
 * Says when items are being skipped. A cue reading "Next: Closing Prayer" when
 * three rows in between were quietly passed over invites the operator to think
 * the rundown lost them.
 */
export function describeTakeNextCue(plan: TakeNextPlan): string {
  if (!plan.item) return plan.reason;
  if (plan.skipped === 0) return `Next: ${plan.item.title}`;
  const rows = plan.skipped === 1 ? '1 done item' : `${plan.skipped} done items`;
  return `Next: ${plan.item.title} — skipping ${rows}`;
}
