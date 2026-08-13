import { describe, expect, it } from 'vitest';
import { EMPTY_STACK, promote, recallPrevious, clearStack, newestReference } from './passageStack';
import { parseSpokenReference } from './spokenReference';
import { parseScriptureReference } from './parseReference';
import type { ScriptureLookupResult } from '../../types/scripture';

const confirmed = (reference: string, heard = reference) => {
  const parsed = parseScriptureReference(reference);
  if (!parsed.ok) throw new Error(`bad fixture: ${reference}`);
  return {
    interpretation: `read as ${reference}`,
    reference: parsed.reference,
    passage: { reference, translation: 'KJV', text: `text of ${reference}` } as ScriptureLookupResult,
    heard
  };
};

describe('a previous passage is history, not a possible reading', () => {
  /**
   * The defect, exactly as the screenshots showed it: say "John three sixteen",
   * then "Romans eight twenty eight", and the panel offered Romans 8:28 as an
   * "other possible reading" of John 3:16 — telling the operator that the newest
   * thing they said was an alternative interpretation of the oldest.
   */
  it('promotes the newer passage and demotes the older one', () => {
    let stack = promote(EMPTY_STACK, confirmed('John 3:16'));
    stack = promote(stack, confirmed('Romans 8:28'));
    expect(stack.current?.reference.canonical).toBe('Romans 8:28');
    expect(stack.previous?.reference.canonical).toBe('John 3:16');
    // And crucially, the old passage is nowhere near the alternatives.
    expect(stack.alternatives).toEqual([]);
  });

  it('never lets a confirmed passage become an alternative', () => {
    let stack = promote(EMPTY_STACK, confirmed('John 3:16'));
    stack = promote(stack, confirmed('Romans 8:28'));
    stack = promote(stack, confirmed('Psalms 23:1'));
    const asAlternatives = stack.alternatives.map((c) => c.reference.canonical);
    expect(asAlternatives).not.toContain('John 3:16');
    expect(asAlternatives).not.toContain('Romans 8:28');
    expect(stack.previous?.reference.canonical).toBe('Romans 8:28');
  });

  it('keeps only the CURRENT span’s ambiguity as alternatives', () => {
    const ambiguous = parseSpokenReference('Timothy 1 7');
    if (!ambiguous.ok) throw new Error('fixture');
    let stack = promote(EMPTY_STACK, confirmed('John 3:16'));
    stack = promote(stack, confirmed('1 Timothy 1:7'), ambiguous.candidates.slice(1));
    expect(stack.alternatives.length).toBeGreaterThan(0);
    // Genuine doubt about the current span — and John is not part of it.
    expect(stack.alternatives.map((c) => c.reference.canonical)).not.toContain('John 3:16');
    expect(stack.previous?.reference.canonical).toBe('John 3:16');
  });

  it('drops the previous span’s ambiguity when a new one arrives', () => {
    const ambiguous = parseSpokenReference('Timothy 1 7');
    if (!ambiguous.ok) throw new Error('fixture');
    let stack = promote(EMPTY_STACK, confirmed('1 Timothy 1:7'), ambiguous.candidates.slice(1));
    stack = promote(stack, confirmed('Romans 8:28'));
    // Nothing is ambiguous about "Romans eight twenty eight".
    expect(stack.alternatives).toEqual([]);
  });

  it('does not push previous out of view when the same passage is re-confirmed', () => {
    // A later revision naming the same reference is not a change of passage.
    let stack = promote(EMPTY_STACK, confirmed('John 3:16'));
    stack = promote(stack, confirmed('Romans 8:28'));
    stack = promote(stack, confirmed('Romans 8:28'));
    expect(stack.previous?.reference.canonical).toBe('John 3:16');
  });

  it('lets the operator take the previous passage back', () => {
    let stack = promote(EMPTY_STACK, confirmed('John 3:16'));
    stack = promote(stack, confirmed('Romans 8:28'));
    stack = recallPrevious(stack);
    expect(stack.current?.reference.canonical).toBe('John 3:16');
    expect(stack.previous?.reference.canonical).toBe('Romans 8:28');
  });

  it('clears only when the operator says so', () => {
    expect(clearStack()).toEqual(EMPTY_STACK);
  });

  it('carries the words that caused each passage', () => {
    const stack = promote(EMPTY_STACK, confirmed('Romans 8:3', 'no, verse 3'));
    expect(stack.current?.heard).toBe('no, verse 3');
  });
});

describe('two references in one recognition window', () => {
  /**
   * Real Whisper output for a single window: `"John 3 16 Romans 8 28"`. The
   * preacher said both. They are not competing readings of one span — they are two
   * things said in order, and the operator is on the LATER one.
   */
  const heard = (text: string) => {
    const parsed = parseSpokenReference(text);
    if (!parsed.ok) throw new Error(`refused: ${text}`);
    return newestReference(parsed.groups)!;
  };

  it('targets the reference spoken last, not the highest scored', () => {
    const result = heard('John 3 16 and Romans 8 28');
    expect(result.target.reference.canonical).toBe('Romans 8:28');
    expect(result.earlier.map((c) => c.reference.canonical)).toEqual(['John 3:16']);
  });

  it('puts the earlier reference in history, never in alternatives', () => {
    const result = heard('John 3 16 and Romans 8 28');
    expect(result.alternatives.map((c) => c.reference.canonical)).not.toContain('John 3:16');
  });

  it('preserves spoken order across three references', () => {
    const result = heard('John 3 16 and Romans 8 28 then Psalm 23 1');
    expect(result.target.reference.canonical).toBe('Psalms 23:1');
    expect(result.earlier.map((c) => c.reference.canonical)).toEqual(['John 3:16', 'Romans 8:28']);
  });

  it('still offers genuine ambiguity over ONE span as alternatives', () => {
    const result = heard('Timothy 1 7');
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.earlier).toEqual([]);
  });

  it('returns nothing when no reference was heard', () => {
    const parsed = parseSpokenReference('the choir will sing now');
    expect(parsed.ok ? newestReference(parsed.groups) : null).toBeNull();
  });
});
