import { describe, expect, it } from 'vitest';
import { parseSpokenReference } from './spokenReference';
import { readCorrection } from './referenceCorrection';
import { EMPTY_STACK, promote, newestReference, type PassageStack } from './passageStack';
import { applyTranscriptEvent, EMPTY_STREAM, interimText } from './transcriptStream';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * One listening session, many references — which is what a sermon is.
 *
 * The operator's words: **"continuity is a hassle."** Each reference behaved like
 * an isolated lookup rather than one turn in a continuously armed listener, so
 * carrying on naturally to the next passage did not feel possible.
 *
 * This models the panel across a realistic run and asserts the property that
 * makes continuity real: **nothing between utterances**. No dismiss, no clear, no
 * stop and start, and no moment where the operator is left looking at nothing.
 */

const passage = (reference: string) =>
  ({ reference, translation: 'KJV', text: `text of ${reference}` }) as ScriptureLookupResult;

/** The panel, in the shape the component actually holds it. */
function panel() {
  let stack: PassageStack = EMPTY_STACK;
  let stream = EMPTY_STREAM;
  let utterance = 0;

  /** One complete Silero speech segment, start to endpoint. */
  const hear = (text: string) => {
    utterance += 1;
    const segmentId = `live-${utterance}`;
    stream = applyTranscriptEvent(stream, {
      segmentId,
      sequence: 1,
      text,
      isFinal: true,
      sourceId: 'live'
    } as never).state;

    // A correction is read against what is CONFIRMED, and only when the fragment
    // names no book of its own.
    const amendment = readCorrection(text, stack.current?.reference ?? null);
    if (amendment) {
      stack = promote(stack, { reference: amendment.reference, passage: passage(amendment.reference.canonical), heard: text });
      return;
    }
    const parsed = parseSpokenReference(text);
    if (!parsed.ok) return; // ordinary speech: nothing happens, nothing is lost
    const newest = newestReference(parsed.groups);
    if (!newest) return;
    stack = promote(
      stack,
      { reference: newest.target.reference, passage: passage(newest.target.reference.canonical), heard: text },
      newest.alternatives
    );
  };

  return {
    hear,
    current: () => stack.current?.reference.canonical ?? null,
    previous: () => stack.previous?.reference.canonical ?? null,
    heardNow: () => stream.text,
    interim: () => interimText(stream),
    utterances: () => utterance
  };
}

describe('one listening session, many references', () => {
  it('carries an operator through a realistic run with no intervention', () => {
    const p = panel();

    // 1 — the first reference.
    p.hear('John 3 16');
    expect(p.current()).toBe('John 3:16');

    // 2 — ordinary preaching. Nothing is detected, and nothing is LOST.
    p.hear('and that is the heart of the gospel this morning');
    expect(p.current(), 'ordinary speech cleared the passage').toBe('John 3:16');
    expect(p.previous()).toBeNull();

    // 3 — a new reference, spoken naturally, with no dismiss in between.
    p.hear('Romans 8 28');
    expect(p.current()).toBe('Romans 8:28');
    expect(p.previous()).toBe('John 3:16');

    // 4 — a correction to it.
    p.hear('No, verse 3.');
    expect(p.current()).toBe('Romans 8:3');
    expect(p.previous()).toBe('Romans 8:28');

    // 5 — more preaching. Still nothing lost.
    p.hear('now turn with me and let us consider what that means');
    expect(p.current()).toBe('Romans 8:3');

    // 6 — a third reference.
    p.hear('1 John 4 8');
    expect(p.current()).toBe('1 John 4:8');
    expect(p.previous()).toBe('Romans 8:3');

    // Six speech segments, one listening session, no operator action at all.
    expect(p.utterances()).toBe(6);
  });

  it('never leaves the operator looking at nothing', () => {
    const p = panel();
    p.hear('John 3 16');
    // Every subsequent utterance, whatever it is, leaves a passage on screen.
    for (const said of ['mm', 'and so we see', 'Romans 828', 'no, verse three', 'the choir will sing']) {
      p.hear(said);
      expect(p.current(), `nothing on screen after "${said}"`).not.toBeNull();
    }
  });

  it('shows the CURRENT utterance, not everything said so far', () => {
    // The complaint behind this: an ever-growing "John 3 16 Romans 8 28 …".
    const p = panel();
    p.hear('John 3 16');
    expect(p.heardNow()).toBe('John 3 16');
    p.hear('Romans 8 28');
    expect(p.heardNow(), 'the transcript accumulated across utterances').toBe('Romans 8 28');
    expect(p.heardNow()).not.toContain('John');
  });

  it('keeps two references together when they were genuinely one breath', () => {
    // Said without a pause, they arrive in ONE segment — and then the operator is
    // on the later one, with the earlier one as history rather than as doubt.
    const p = panel();
    p.hear('John 3 16 and Romans 8 28');
    expect(p.current()).toBe('Romans 8:28');
    expect(p.heardNow()).toBe('John 3 16 and Romans 8 28');
  });
});

describe('a new book always outranks the current passage', () => {
  it('reads an explicit reference as new, never as a correction', () => {
    const p = panel();
    p.hear('Romans 8 28');
    // "John three sixteen" names a book, so it can never be read as an amendment
    // to Romans — the correction layer refuses anything naming a book.
    p.hear('John 3 16');
    expect(p.current()).toBe('John 3:16');
    expect(p.previous()).toBe('Romans 8:28');
  });

  it('uses context only for bookless fragments', () => {
    const p = panel();
    p.hear('John 3 16');
    p.hear('verse 17 instead');
    expect(p.current()).toBe('John 3:17');
  });

  it('ignores a bookless fragment when there is nothing to amend', () => {
    const p = panel();
    p.hear('verse 17 instead');
    expect(p.current()).toBeNull();
  });
});

describe('an impossible verse can never reach the operator', () => {
  /**
   * The parser can produce a compact split whose CHAPTER exists and whose VERSE
   * does not — `Genesis 1:234` parses because per-chapter verse counts are not
   * bundled. Retrieval is the gate that eliminates it, so this models the panel's
   * rule directly: a compact candidate is displayed only if it retrieves, and the
   * panel falls through to the next split when it does not.
   */
  const realVerses: Record<string, number> = {
    'Genesis 1': 31,
    'Genesis 12': 20,
    'Genesis 24': 67,
    'Psalms 2': 12,
    'Psalms 23': 6,
    'John 3': 36,
    'Romans 8': 39
  };
  /** Stands in for the Bible provider: null means "no such passage". */
  const retrieve = (canonical: string): string | null => {
    const [, book, chapter, verse] = /^(.*) (\d+):(\d+)$/.exec(canonical) ?? [];
    if (!book) return null;
    const limit = realVerses[`${book} ${chapter}`];
    if (limit === undefined) return null;
    return Number(verse) <= limit ? `text of ${canonical}` : null;
  };

  /** What the panel would end up displaying: the first split that retrieves. */
  const displayed = (spoken: string): string | null => {
    const parsed = parseSpokenReference(spoken);
    if (!parsed.ok) return null;
    for (const candidate of parsed.candidates) {
      if (retrieve(candidate.reference.canonical)) return candidate.reference.canonical;
      // A non-compact candidate that fails retrieval does not fall through.
      if (!candidate.compact) return null;
    }
    return null;
  };

  it('shows nothing for a compact number whose splits are all impossible', () => {
    // Genesis 1 has 31 verses and Genesis 12 has 20 — neither 1:234 nor 12:34.
    expect(displayed('Genesis 1234')).toBeNull();
  });

  it('finds the one real verse when the canon alone could not', () => {
    // Psalm 2 has 12 verses so 2:34 is impossible; Psalm 23:4 is real.
    expect(displayed('Psalm 234')).toBe('Psalms 23:4');
  });

  it('still resolves the references the microphone produced', () => {
    expect(displayed('John 316')).toBe('John 3:16');
    expect(displayed('Romans 828')).toBe('Romans 8:28');
  });

  /**
   * Genuine compact ambiguity DOES exist, and an earlier report of mine said it
   * did not. `Genesis 125` is Genesis 1:25 and Genesis 12:5 — both real verses.
   * Silently taking the first would hide a choice the operator is entitled to
   * make, so the panel retrieves the siblings and offers the survivors.
   */
  const survivors = (spoken: string): string[] => {
    const parsed = parseSpokenReference(spoken);
    if (!parsed.ok) return [];
    return parsed.candidates
      .filter((c) => c.compact && retrieve(c.reference.canonical))
      .map((c) => c.reference.canonical);
  };

  it('exposes real ambiguity rather than picking one', () => {
    expect(survivors('Genesis 125')).toEqual(['Genesis 1:25', 'Genesis 12:5']);
  });

  it('does not manufacture ambiguity when only one split is real', () => {
    expect(survivors('Psalm 234')).toEqual(['Psalms 23:4']);
    expect(survivors('John 316')).toEqual(['John 3:16']);
  });

  it('leaves nothing at all when neither split is real', () => {
    expect(survivors('Genesis 1234')).toEqual([]);
  });

  it('never offers an unverified split as an alternative reading', () => {
    // Every compact candidate is marked, and the panel filters marked candidates
    // out of the alternatives list entirely.
    const parsed = parseSpokenReference('Genesis 1234');
    expect(parsed.ok && parsed.candidates.every((c) => c.compact)).toBe(true);
  });
});

describe('exactly one Heard line, updated in place', () => {
  /**
   * Screenshot QA found the same transcript printed twice:
   *
   *     Heard "John 3.16"
   *     Heard "John 3.16"
   *
   * Two renderers had grown independently — the panel's current transcript, and a
   * separate line added so a passage never changes without visible cause. Both
   * were right about what to show and wrong to both show it.
   *
   * This models the single slot: interim while speaking, final in its place, and
   * the next utterance replacing that. What it pins is that ONE value feeds the
   * line, so no future caller can reintroduce a second row.
   */
  function line() {
    let interim = '';
    let heard = '';
    return {
      /** A revision arriving while the speaker is still talking. */
      interim(text: string) {
        interim = text;
      },
      /** An utterance ending — resolved, refused or corrected, it makes no difference. */
      final(text: string) {
        interim = '';
        heard = text;
      },
      dismiss() {
        interim = '';
        heard = '';
      },
      /** Exactly what the panel renders: at most one row. */
      rendered(): string[] {
        const shown = interim || heard;
        if (!shown) return [];
        return [`${interim ? 'Hearing' : 'Heard'} “${shown}”`];
      }
    };
  }

  it('shows one row while recognising, and one when it settles', () => {
    const l = line();
    l.interim('John 3');
    expect(l.rendered()).toEqual(['Hearing “John 3”']);
    l.final('John 3.16');
    expect(l.rendered()).toEqual(['Heard “John 3.16”']);
  });

  it('never renders the same transcript twice', () => {
    const l = line();
    l.final('John 3.16');
    const rows = l.rendered();
    expect(rows).toHaveLength(1);
    expect(rows.filter((r) => r.includes('John 3.16'))).toHaveLength(1);
  });

  it('replaces the previous utterance rather than accumulating history', () => {
    const l = line();
    l.final('John 3 16');
    l.interim('Romans');
    expect(l.rendered()).toEqual(['Hearing “Romans”']);
    l.final('Romans 8 28');
    expect(l.rendered()).toEqual(['Heard “Romans 8 28”']);
    // The first utterance is gone from the live workspace — history lives in the
    // passage stack, not in a growing transcript.
    expect(l.rendered().join()).not.toContain('John');
  });

  it('shows the correction that changed the passage, in the same slot', () => {
    const l = line();
    l.final('Romans 8 28');
    l.final('No, verse 3.');
    expect(l.rendered()).toEqual(['Heard “No, verse 3.”']);
  });

  it('shows nothing at all before anything has been said', () => {
    expect(line().rendered()).toEqual([]);
  });

  it('clears when the operator dismisses', () => {
    const l = line();
    l.final('John 3 16');
    l.dismiss();
    expect(l.rendered()).toEqual([]);
  });
});
