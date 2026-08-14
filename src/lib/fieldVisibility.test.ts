import { describe, expect, it } from 'vitest';
import {
  HIDDEN_FIELDS_KEY,
  applyFieldVisibility,
  hiddenFieldIds,
  hideableFieldIds,
  isFieldHidden,
  withFieldHidden
} from './fieldVisibility';

/**
 * Hiding a field without deleting what is in it.
 *
 * The operator's only way to leave a title off was to clear it, which meant
 * retyping it the next time that speaker came up — so in practice it went to
 * air unwanted rather than lose the words.
 */
describe('remembering what is hidden', () => {
  it('starts with nothing hidden', () => {
    expect(hiddenFieldIds({})).toEqual([]);
    expect(isFieldHidden({ name: 'x' }, 'title')).toBe(false);
  });

  it('hides and shows again', () => {
    const hidden = withFieldHidden({ title: 'Lead Pastor' }, 'title', true);
    expect(isFieldHidden(hidden, 'title')).toBe(true);
    // THE POINT: the words are still there.
    expect(hidden.title).toBe('Lead Pastor');

    const shown = withFieldHidden(hidden, 'title', false);
    expect(isFieldHidden(shown, 'title')).toBe(false);
    expect(shown.title).toBe('Lead Pastor');
  });

  it('leaves no trace when nothing is hidden', () => {
    // A graphic that never used this carries no extra key, so saved graphics,
    // exports and the visual-override comparison are unchanged for everyone
    // who does not touch it.
    const shown = withFieldHidden(withFieldHidden({ title: 'x' }, 'title', true), 'title', false);
    expect(HIDDEN_FIELDS_KEY in shown).toBe(false);
  });

  it('holds several, and does not duplicate one', () => {
    let values: Record<string, string> = { title: 'a', subtitle: 'b' };
    values = withFieldHidden(values, 'title', true);
    values = withFieldHidden(values, 'subtitle', true);
    values = withFieldHidden(values, 'title', true);
    expect(hiddenFieldIds(values).sort()).toEqual(['subtitle', 'title']);
  });

  it('survives whitespace and stray separators', () => {
    // It rides in a flat string through the realtime message and a saved
    // rundown; it must read back whatever shape it arrives in.
    expect(hiddenFieldIds({ [HIDDEN_FIELDS_KEY]: ' title , , subtitle ' }).sort()).toEqual([
      'subtitle',
      'title'
    ]);
  });
});

describe('what a renderer is given', () => {
  it('blanks a hidden field and touches nothing else', () => {
    const values = { name: 'Rev. Ishmael', title: 'Lead Pastor', [HIDDEN_FIELDS_KEY]: 'title' };
    const rendered = applyFieldVisibility(values);
    expect(rendered.title).toBe('');
    expect(rendered.name).toBe('Rev. Ishmael');
    // The source is not mutated: the desk keeps the words.
    expect(values.title).toBe('Lead Pastor');
  });

  it('returns the very same object when nothing is hidden', () => {
    // The common case must allocate nothing and provoke no re-render.
    const values = { name: 'Rev. Ishmael' };
    expect(applyFieldVisibility(values)).toBe(values);
  });
});

describe('what may be hidden', () => {
  it('never offers to hide the thing the graphic is about', () => {
    // A lower third with no name is not a field turned off, it is an empty
    // plate — and the same for a scripture card with no reference.
    expect(hideableFieldIds('preacher-lower-third')).not.toContain('name');
    expect(hideableFieldIds('scripture-card')).not.toContain('reference');
  });

  it('offers the title and church lines, which is the ask', () => {
    const hideable = hideableFieldIds('preacher-lower-third');
    expect(hideable).toContain('title');
    expect(hideable).toContain('subtitle');
  });

  it('leaves the logo alone — it has its own control', () => {
    expect(hideableFieldIds('preacher-lower-third')).not.toContain('logoUrl');
  });

  it('says nothing for a template it does not know', () => {
    expect(hideableFieldIds('not-a-template')).toEqual([]);
  });
});
