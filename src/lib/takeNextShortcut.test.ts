import { describe, expect, it } from 'vitest';
import { isTakeNextShortcut, isTypingTarget } from './takeNextShortcut';

/**
 * The binding that can put a graphic on air. These assert what must NOT fire at
 * least as hard as what must — a false positive here is a wrong graphic in front
 * of a congregation, and Clear only removes it after everyone has seen it.
 */

const event = (over: Partial<Parameters<typeof isTakeNextShortcut>[0]> = {}) => ({
  key: 'Enter',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  target: null,
  ...over
});

describe('what fires Take Next', () => {
  it('fires on Ctrl+Enter', () => {
    expect(isTakeNextShortcut(event())).toBe(true);
  });

  it('fires on Cmd+Enter', () => {
    expect(isTakeNextShortcut(event({ ctrlKey: false, metaKey: true }))).toBe(true);
  });
});

describe('what must never fire it', () => {
  it('refuses Enter on its own — that is how a focused button activates', () => {
    expect(isTakeNextShortcut(event({ ctrlKey: false }))).toBe(false);
  });

  it('refuses any other key with the modifier', () => {
    for (const key of ['n', 'N', ' ', 'Space', 'Tab', 'ArrowRight']) {
      expect(isTakeNextShortcut(event({ key })), key).toBe(false);
    }
  });

  it('refuses Ctrl AND Cmd together', () => {
    // Not a near-miss to be generous about: it is a different chord.
    expect(isTakeNextShortcut(event({ ctrlKey: true, metaKey: true }))).toBe(false);
  });

  it('refuses when Alt or Shift ride along', () => {
    expect(isTakeNextShortcut(event({ altKey: true }))).toBe(false);
    expect(isTakeNextShortcut(event({ shiftKey: true }))).toBe(false);
  });

  it('refuses a held key repeating', () => {
    // Otherwise leaning on the chord walks the whole rundown to air.
    expect(isTakeNextShortcut(event({ repeat: true }))).toBe(false);
  });
});

describe('typing must never reach air', () => {
  /** Minimal Element stand-in: the rule only uses tagName, closest and isContentEditable. */
  const node = (tag: string, opts: { editable?: boolean; insideField?: string } = {}) =>
    ({
      tagName: tag.toUpperCase(),
      isContentEditable: opts.editable ?? false,
      closest: (selector: string) =>
        opts.insideField && selector.includes(opts.insideField) ? { tagName: opts.insideField.toUpperCase() } : null
    }) as unknown as EventTarget;

  it('refuses inside a text input', () => {
    expect(isTakeNextShortcut(event({ target: node('input', { insideField: 'input' }) }))).toBe(false);
  });

  it('refuses inside a textarea', () => {
    expect(isTakeNextShortcut(event({ target: node('textarea', { insideField: 'textarea' }) }))).toBe(false);
  });

  it('refuses inside a contenteditable region', () => {
    expect(isTakeNextShortcut(event({ target: node('div', { editable: true }) }))).toBe(false);
  });

  it('refuses a node NESTED inside a field, not just the field itself', () => {
    // A keystroke can be reported against a child of the element that owns it, so
    // a tagName check on the target alone would let this through.
    expect(isTakeNextShortcut(event({ target: node('span', { insideField: 'input' }) }))).toBe(false);
  });

  it('allows it from ordinary page chrome', () => {
    expect(isTakeNextShortcut(event({ target: node('body') }))).toBe(true);
    expect(isTakeNextShortcut(event({ target: node('button') }))).toBe(true);
  });

  it('treats a target it cannot inspect as not-typing rather than crashing', () => {
    expect(isTypingTarget({} as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});
