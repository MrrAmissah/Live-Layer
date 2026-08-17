import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QUICK TAKE — one gesture to air a verse, without quietly breaking the promise
 * everything else rests on.
 *
 * Asked for from the desk: "can we make double clicking a verse push take it
 * live? or enter? i want to make the work easier on fast scripture display."
 *
 * The danger is not the feature, it is the feature being INVISIBLE. The guide
 * tells volunteers in bold that nothing reaches the stream until they press
 * Take live, and that sentence is why someone who has never used LiveLayer will
 * click around and learn it rather than freeze. These tests hold the conditions
 * that keep the sentence true.
 */
const provider = readFileSync('src/app/quickTake.tsx', 'utf8');
const control = readFileSync('src/app/ControlPage.tsx', 'utf8');
/**
 * The GESTURE lives in the grid, which both Studio and the Scripture page now
 * render — it was inside `ScriptureReferencePicker` when this was written, and
 * reading that file kept these cases honest only for as long as the markup
 * stayed there. Pointing at the component that owns the double-click means the
 * rule is checked wherever the grid is used, which is the point of sharing it.
 */
const grid = readFileSync('src/components/control/ScriptureReferenceGrid.tsx', 'utf8');
/** The picker still owns the LOOKUP and the armed badge; the grid owns the gesture. */
const picker = readFileSync('src/components/control/ScriptureReferencePicker.tsx', 'utf8');

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('it is off until somebody turns it on', () => {
  it('starts off', () => {
    expect(stripComments(provider)).toContain('useState(false)');
  });

  it('is never persisted', () => {
    /**
     * A mode that airs a graphic from one gesture must not be inherited
     * silently by whoever opens the app next week. The cost of that decision is
     * one click at the start of a service; the cost of the other is a volunteer
     * discovering it by accident.
     */
    const code = stripComments(provider);
    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('sessionStorage');
  });

  it('does nothing at all outside the control layout', () => {
    // A picker rendered in a preview, a library card or a test gets an inert
    // value rather than a throw — and above all, never a silent broadcast.
    const code = stripComments(provider);
    expect(code).toContain('const FALLBACK');
    expect(code).toMatch(/takeNow: \(\) => \{\}/);
    expect(code).toContain('createContext<QuickTakeValue>(FALLBACK)');
  });
});

describe('it refuses when Take means something else', () => {
  it('blocks while a rundown is active, and says why', () => {
    /**
     * `ControlPage.onTake` fires the SELECTED RUNDOWN ROW when a rundown is
     * active and never falls through to the draft. A verse double-clicked in
     * that state would air a different graphic entirely — the worst outcome for
     * a control whose whole purpose is speed.
     */
    const code = stripComments(provider);
    expect(code).toContain('rundownActive');
    expect(code).toMatch(/blocked: rundownActive/);
    expect(provider).toContain('not this verse');
  });

  it('refuses inside takeNow as well as in the surface', () => {
    // Belt and braces: the picker checks `blocked` before offering the gesture,
    // and the provider refuses anyway.
    const body = stripComments(provider).slice(stripComments(provider).indexOf('takeNow: () =>'));
    expect(body).toMatch(/if \(!enabled \|\| rundownActive\) return/);
  });

  it('the draft take itself bails out on an active rundown', () => {
    const code = stripComments(control);
    const start = code.indexOf('const onQuickTakeDraft');
    expect(start).toBeGreaterThan(-1);
    expect(code.slice(start, start + 400)).toContain('if (getActiveRundownId()) return');
  });
});

describe('it is not a second Take', () => {
  it('publishes through the one door every other path uses', () => {
    /**
     * `publishShow` is the single publisher — quick-queue rows already call it
     * this way — so this adds no new decision about what a Take means, which is
     * what `takeNextWiring.test.ts` forbids.
     */
    const code = stripComments(control);
    const start = code.indexOf('const onQuickTakeDraft');
    const body = code.slice(start, start + 600);
    expect(body).toContain('publishShow(instance');
    expect(body).toContain("sourceType: 'draft'");
    // Serialised like every other command, so a slow relay cannot produce two.
    expect(body).toContain('runCommand');
  });

  it('records what went to air, like the ordinary draft Take', () => {
    const code = stripComments(control);
    const start = code.indexOf('const onQuickTakeDraft');
    expect(code.slice(start, start + 600)).toContain('state.addRecent(instance)');
  });
});

describe('the gesture, and the order it happens in', () => {
  it('airs only AFTER the passage is written into the draft', () => {
    /**
     * `onApply` writes the verse and `takeNow` publishes the draft, so the
     * reverse order — or a parallel one — airs the PREVIOUS verse. `takeNow`
     * reads the store directly rather than a rendered prop, so this ordering is
     * what makes it correct rather than merely tidy.
     */
    const code = stripComments(picker);
    const applyAt = code.indexOf('onApply({ reference: result.reference');
    const airAt = code.indexOf('if (airIt && quickTake.enabled');
    expect(applyAt).toBeGreaterThan(-1);
    expect(airAt).toBeGreaterThan(-1);
    expect(airAt).toBeGreaterThan(applyAt);
  });

  it('keeps a single click harmless', () => {
    // One click loads the verse and nothing else, armed or not. The SECOND
    // click is the broadcast.
    const code = stripComments(grid);
    expect(code).toContain('onClick={() => setVerse(verse, undefined, true)}');
    expect(code).toContain('onDoubleClick={() => setVerse(verse, undefined, true, quickTake.enabled)}');
  });

  it('airs a re-selected verse instead of doing nothing', () => {
    /**
     * `setVerse` returns early when the reference has not changed, so it does
     * not refetch — and that would have made the second click of a double-click
     * a no-op in the COMMON case, because the first click had just selected
     * that very verse.
     */
    /**
     * The gesture and the firing now sit either side of the grid's boundary:
     * the grid re-reports the pick with `air: true`, and the picker's own
     * `runLookup` is what calls `takeNow`. Both halves are asserted, because
     * either one alone would let a re-selected verse silently do nothing.
     */
    const gridCode = stripComments(grid);
    const start = gridCode.indexOf('if (ref === reference) {');
    expect(start).toBeGreaterThan(-1);
    expect(gridCode.slice(start, start + 200)).toContain("onPick?.(ref, { air: true })");
    expect(stripComments(picker)).toContain('quickTake.takeNow()');
  });
});

describe('an operator can see that the surface is hot', () => {
  it('shows a badge while it is armed', () => {
    // Someone else standing at the desk has to be able to see that a
    // double-click is now a broadcast.
    expect(picker).toContain('ref-picker__quick-live');
    expect(picker).toContain('to put it on air');
  });

  it('says why nothing will fire when a rundown owns Take', () => {
    expect(picker).toContain('ref-picker__quick-blocked');
    expect(stripComments(picker)).toContain('{quickTake.blocked}');
  });
});
