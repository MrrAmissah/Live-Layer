import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from './useLiveLayerStore';

/**
 * LEAVING A TEMPLATE AND COMING BACK MUST NOT THROW THE WORK AWAY.
 *
 * Reported from the desk: "when i move from one template to another and come
 * back it seems all the work i have done leaves and it goes to default."
 *
 * Switching template re-seeded from scratch. That is right for a FIRST visit —
 * choosing a template starts a new graphic — and was wrong for the second: a
 * name typed, a glance at a scripture card, and the name was gone, with no
 * warning and nothing to undo it.
 */
const reset = () => {
  useLiveLayerStore.setState({
    valuesByTemplate: {},
    durationByTemplate: {}
  });
  useLiveLayerStore.getState().setTemplate('preacher-lower-third');
  useLiveLayerStore.getState().resetDraft();
};

describe('a draft survives a trip to another template', () => {
  beforeEach(reset);

  it('brings back exactly what was typed', () => {
    const store = useLiveLayerStore.getState();
    store.setField('name', 'Rev. Ishmael K. Awotwe');
    store.setField('title', 'Lead Pastor');

    useLiveLayerStore.getState().setTemplate('scripture-card');
    expect(useLiveLayerStore.getState().draftValues.name).toBeUndefined();

    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    expect(useLiveLayerStore.getState().draftValues.name).toBe('Rev. Ishmael K. Awotwe');
    expect(useLiveLayerStore.getState().draftValues.title).toBe('Lead Pastor');
  });

  it('keeps each template’s work separate', () => {
    const store = useLiveLayerStore.getState();
    store.setField('name', 'Ps. Ato Mensah');

    useLiveLayerStore.getState().setTemplate('quote-card');
    useLiveLayerStore.getState().setField('quoteText', 'God is our refuge.');

    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    expect(useLiveLayerStore.getState().draftValues.name).toBe('Ps. Ato Mensah');
    // ...and the quote is still waiting under its own template.
    useLiveLayerStore.getState().setTemplate('quote-card');
    expect(useLiveLayerStore.getState().draftValues.quoteText).toBe('God is our refuge.');
  });

  it('still seeds a template being visited for the first time', () => {
    // The original rule, which was never wrong: a template you have not edited
    // starts as a new graphic rather than as a blank.
    useLiveLayerStore.getState().setTemplate('announcement-banner');
    const values = useLiveLayerStore.getState().draftValues;
    expect(Object.keys(values).length).toBeGreaterThan(0);
    expect(values.variantId).toBeTruthy();
  });

  it('a reset really resets — the parked copy goes with it', () => {
    const store = useLiveLayerStore.getState();
    store.setField('name', 'Typed then abandoned');
    useLiveLayerStore.getState().resetDraft();
    expect(useLiveLayerStore.getState().draftValues.name).not.toBe('Typed then abandoned');

    // Without dropping the parked copy this round trip would bring it back,
    // which is a reset that did not reset.
    useLiveLayerStore.getState().setTemplate('scripture-card');
    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    expect(useLiveLayerStore.getState().draftValues.name).not.toBe('Typed then abandoned');
  });

  it('a pack switch clears what was parked under the old pack', () => {
    // Parked drafts carry their pack's palette, logo and variant. Carrying them
    // across would put the previous event's branding back on a template the
    // operator returns to.
    const store = useLiveLayerStore.getState();
    store.setField('name', 'House pack name');
    useLiveLayerStore.getState().setActivePack('ppc-2026');
    useLiveLayerStore.getState().setTemplate('scripture-card');
    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    expect(useLiveLayerStore.getState().draftValues.name).not.toBe('House pack name');
    useLiveLayerStore.getState().setActivePack('house');
  });
});
