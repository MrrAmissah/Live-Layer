import { describe, expect, it } from 'vitest';
import { NO_ITEM, summariseQueue } from './queueSummary';
import type { RundownItem } from '../../types/rundown';

/**
 * SELECTED, LAST SENT and NEXT answer three different questions from three
 * different fields. Two of them can legitimately land on the same item, and the
 * panel used to print that as two bare titles that happened to match — which
 * reads as a repeating bug rather than as the fact it is.
 *
 * The word is LAST SENT, never "live": `activeItemId` records the item behind
 * our last successful command, and nothing in this system observes an encoder.
 */

const item = (id: string, title: string): RundownItem =>
  ({ id, title, done: false, graphic: { templateId: 'preacher-lower-third' } } as unknown as RundownItem);

const WELCOME = item('i-1', 'Welcome — Rev. Ama');
const VERSE = item('i-2', 'Opening verse');
const NOTICE = item('i-3', 'Midweek notice');

describe('three distinct cursors', () => {
  it('reports each one when they are all different items', () => {
    expect(summariseQueue({ selected: WELCOME, lastSent: VERSE, next: NOTICE })).toEqual({
      selected: 'Welcome — Rev. Ama',
      lastSent: 'Opening verse',
      next: 'Midweek notice',
      nextIsLastSent: false
    });
  });

  it('keeps last sent and next distinct when only their titles differ', () => {
    const summary = summariseQueue({ selected: WELCOME, lastSent: VERSE, next: NOTICE });
    expect(summary.lastSent).not.toBe(summary.next);
    expect(summary.nextIsLastSent).toBe(false);
  });
});

describe('when next IS the last sent item', () => {
  it('marks the coincidence instead of printing two matching facts', () => {
    // Select the row before the one you last sent and this is the ordinary
    // outcome — taking the selection forward would re-send it.
    const summary = summariseQueue({ selected: WELCOME, lastSent: VERSE, next: VERSE });
    expect(summary.lastSent).toBe('Opening verse');
    expect(summary.next).toBe('Opening verse');
    expect(summary.nextIsLastSent).toBe(true);
  });

  it('compares by id, not by title', () => {
    // Two items may legitimately carry the same title. Telling the operator they
    // are "the same item" when they are two different rows is the worse error.
    const twin = item('i-9', 'Opening verse');
    const summary = summariseQueue({ selected: WELCOME, lastSent: VERSE, next: twin });
    expect(summary.next).toBe('Opening verse');
    expect(summary.nextIsLastSent).toBe(false);
  });
});

describe('absent cursors', () => {
  it('reports no selection without claiming anything about the others', () => {
    const summary = summariseQueue({ lastSent: VERSE, next: WELCOME });
    expect(summary.selected).toBe(NO_ITEM);
    expect(summary.lastSent).toBe('Opening verse');
    expect(summary.next).toBe('Welcome — Rev. Ama');
    expect(summary.nextIsLastSent).toBe(false);
  });

  it('reports the end of the rundown — a selection with nothing after it', () => {
    const summary = summariseQueue({ selected: NOTICE, lastSent: VERSE, next: undefined });
    expect(summary.selected).toBe('Midweek notice');
    expect(summary.next).toBe(NO_ITEM);
    // "Nothing next" must never read as "next is the last sent item".
    expect(summary.nextIsLastSent).toBe(false);
  });

  it('never claims the coincidence when the last sent item is absent', () => {
    const summary = summariseQueue({ selected: WELCOME, lastSent: undefined, next: VERSE });
    expect(summary.lastSent).toBe(NO_ITEM);
    expect(summary.nextIsLastSent).toBe(false);
  });

  it('reports an entirely empty cursor set as dashes, not as a match', () => {
    expect(summariseQueue({})).toEqual({
      selected: NO_ITEM,
      lastSent: NO_ITEM,
      next: NO_ITEM,
      nextIsLastSent: false
    });
  });
});
