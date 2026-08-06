import { parseSpokenReference } from '../scripture/spokenReference';

/**
 * Scoring an utterance against **every reference it named**, in order.
 *
 * Word error rate is what ASR papers report and the wrong question for this app,
 * because it averages failures that are not comparable. What matters is whether the
 * passages the preacher named came back, and whether anything came back that they
 * did not name.
 *
 * ## Why the expectation is a list
 *
 * The first version of this module expected a single canonical string. That made
 * the multiple-reference group **vacuous after the first passage**: "John three
 * sixteen and Romans eight twenty eight" expected only `John 3:16`, so the case
 * passed whether Romans came back correctly, came back as the wrong verse, or never
 * came back at all — while the summary reported "multiple references 5/5 correct".
 * Multi-reference separation was one of the main safety fixes this harness exists to
 * watch, and the harness was not watching it.
 *
 * The expectation is therefore the complete ordered result, evaluated against the
 * parser's `groups` (one group per spoken reference, each with its own ranked
 * readings) rather than the flattened candidate list, because only the grouping
 * distinguishes *two passages* from *two readings of one passage*.
 *
 * ## What the outcomes mean
 *
 *  - `exact`           every named reference leads its own group, in the order spoken.
 *  - `offered`         the named passage is in its group but not leading. A ranking
 *                      miss the operator recovers with one click.
 *  - `out-of-order`    all present, wrong sequence. The operator reads them in order.
 *  - `incomplete`      a named reference produced nothing. Under-read; safe.
 *  - `refused`         nothing resolved at all. Safe — the operator types it.
 *  - `mis-grouped`     every passage is present but packed into fewer groups than
 *                      were spoken, so a second passage is shown as an alternative
 *                      READING of the first. Not an under-read, and not safe.
 *  - `misleading-top`  a group LEADS with a passage that is not in that group's
 *                      expectation at all, or a group appeared for a passage that
 *                      was never spoken, or a group's readings are not the declared
 *                      ones.
 *
 * ## `misleading-top` is a wrong leading candidate, not aired content
 *
 * Named precisely because nothing here reaches air on its own. The shipped flow is
 * transcript → candidates → retrieval → operator review of the passage TEXT →
 * acceptance into the draft → a separate Take. A misleading top candidate is a wrong
 * answer presented first; it becomes a wrong verse on a screen only if the operator
 * accepts it without reading it.
 *
 * That distinction sets two different bars, and they must not be conflated
 * (`docs/ASR_EVALUATION.md`): for an **operator-reviewed assistant** this is a
 * measured cost to be kept low and visible; for **automatic acceptance or Take** it
 * is disqualifying, and a finite corpus with zero observed cases would still not
 * establish the opposite.
 *
 * No provider, no audio, no model. It scores TRANSCRIPTS, so the corpus is written by
 * hand today and replayed against a real recogniser's output later.
 */

export type ReferenceOutcome =
  | 'exact'
  | 'offered'
  | 'out-of-order'
  | 'incomplete'
  | 'mis-grouped'
  | 'refused'
  | 'misleading-top';

export interface ExpectedReference {
  /** The canonical the speaker meant; leads its group unless `leadMayBeAny`. */
  canonical: string;
  /**
   * The OTHER readings this group may contain — and, when given, the only other
   * readings it may contain.
   *
   * Load-bearing, not documentation. It was previously consulted only to excuse a
   * wrong leading candidate, so it could widen acceptance and never restrict it:
   * deleting it from a case changed nothing, and adding fabricated entries changed
   * nothing. A group offering a reading nobody declared now fails, which is what
   * makes this the place a fabricated *reading* is caught (a fabricated *group* is
   * caught separately).
   */
  alternatives?: string[];
  /**
   * The transcript genuinely cannot say which reading was meant, so any of
   * `canonical` or `alternatives` may lead.
   *
   * For a bare "Timothy one seven" a listener has no basis to prefer 1 or 2 Timothy.
   * Recording one of them as "what the speaker meant" would encode the parser's own
   * sibling ordering as human intent and then score it as `exact` — the corpus
   * marking its own implementation correct. What is actually required here is that
   * both readings are offered together, in one group.
   */
  leadMayBeAny?: boolean;
}

export interface UtteranceCase {
  /** What was said, as a transcript. */
  spoken: string;
  /**
   * Every reference named, in the order spoken. `null` — or an empty list — means the
   * utterance names no passage and resolving anything would be wrong.
   */
  expected: ExpectedReference[] | null;
  note?: string;
}

export interface ScoredUtterance extends UtteranceCase {
  outcome: ReferenceOutcome;
  /** True when the utterance named nothing, so a refusal is the correct answer. */
  namesNothing: boolean;
  /** One entry per group the parser produced: that group's ranked canonicals. */
  groups: string[][];
  /** Leading canonical of each group, in order. */
  tops: string[];
  /** Expected canonicals that appeared nowhere. */
  missing: string[];
  /** Leading canonicals that were not named at this position. */
  unexpected: string[];
}

const canonicalsOf = (expected: ExpectedReference[] | null): string[] =>
  (expected ?? []).map((item) => item.canonical);

export function scoreUtterance(testCase: UtteranceCase): ScoredUtterance {
  const parsed = parseSpokenReference(testCase.spoken);
  const groups = parsed.ok
    ? parsed.groups.map((group) => group.candidates.map((candidate) => candidate.reference.canonical))
    : [];
  const tops = groups.map((group) => group[0]);
  const expected = testCase.expected ?? [];
  const wanted = expected.map((item) => item.canonical);
  const everywhere = groups.flat();
  const missing = wanted.filter((canonical) => !everywhere.includes(canonical));

  // An empty list and `null` mean the same thing and must score the same way; they
  // diverged once, so a correct refusal scored zero for one of the two spellings.
  const namesNothing = expected.length === 0;
  const base = { ...testCase, groups, tops, missing, namesNothing };

  if (namesNothing) {
    return {
      ...base,
      unexpected: tops,
      outcome: groups.length === 0 ? 'refused' : 'misleading-top'
    };
  }

  if (groups.length === 0) {
    return { ...base, unexpected: [], outcome: 'refused' };
  }

  /**
   * A group leads with a canonical that is not the one named at this position — or
   * there are MORE groups than references spoken, so a passage was invented.
   */
  const unexpected = tops.filter((top, index) => {
    const here = expected[index];
    if (!here) return true; // a group with no reference behind it
    if (top === here.canonical) return false;
    /**
     * The lead is wrong, but is the right passage *in this group*? If it is, this is
     * a ranking miss the operator recovers with one click (`offered`); if it is not,
     * the group leads with a passage that is simply not the one named. Collapsing
     * both into one outcome made `offered` unreachable — a dead outcome is as
     * misleading as a dead field, and it hid the difference between "second on the
     * list" and "not on the list at all".
     *
     * `leadMayBeAny` needs no clause here: if an allowed alternative leads then the
     * canonical is in the same group, so this test already passes it through. A
     * second condition saying the same thing could be deleted without any test
     * noticing, which is how a redundant guard becomes a false reassurance.
     */
    return !groups[index].includes(here.canonical);
  });

  /**
   * A reading offered inside a group that the case never declared. This is where a
   * fabricated *reading* is caught; a fabricated *group* is caught above. Checked
   * only when the case declares alternatives, so a case that says nothing about a
   * group's contents is not silently held to "exactly one reading".
   */
  const contentMismatch = groups.flatMap((group, index) => {
    const here = expected[index];
    if (!here || here.alternatives === undefined) return [];
    const declared = [here.canonical, ...here.alternatives];
    const offered = new Set(group);
    const allowed = new Set(declared);
    return [
      // Offered but never declared — a fabricated reading.
      ...group.filter((canonical) => !allowed.has(canonical)),
      // Declared but never offered — the expectation is wrong, which must also fail,
      // or an alternatives list could be padded with anything and still pass.
      ...declared.filter((canonical) => !offered.has(canonical))
    ];
  });

  const sameLength = wanted.length === tops.length;
  const outcome: ReferenceOutcome = (() => {
    const leadsHere = (index: number) => {
      const here = expected[index];
      return here.leadMayBeAny
        ? [here.canonical, ...(here.alternatives ?? [])].includes(tops[index])
        : tops[index] === here.canonical;
    };

    // Everything leading correctly, position by position, and every group's contents
    // exactly as declared.
    if (sameLength && !contentMismatch.length && expected.every((_, index) => leadsHere(index))) return 'exact';

    /**
     * The same passages in the wrong sequence, checked BEFORE the positional test.
     * Every group leads with something genuinely spoken, so nothing was invented —
     * reporting that as a wrong leading candidate would put a sequencing defect in
     * the same bucket as a fabricated verse. It still fails: the operator reads them
     * in the order they were said.
     */
    if (sameLength && !contentMismatch.length && [...wanted].sort().join('|') === [...tops].sort().join('|')) {
      return 'out-of-order';
    }

    if (unexpected.length) return 'misleading-top';
    // A group whose declared contents do not match what was offered.
    if (contentMismatch.length) return 'misleading-top';

    /**
     * Every named passage came back, but packed into fewer groups than were spoken —
     * so a second passage is presented as an alternative READING of the first. This
     * is not an under-read and is not safe: the operator is told one passage was
     * named when two were, which is the mirror image of the property grouping exists
     * to protect. It gets its own outcome rather than being filed under `incomplete`.
     */
    if (!missing.length && groups.length < wanted.length) return 'mis-grouped';

    if (groups.length < wanted.length || missing.length) return 'incomplete';
    return 'offered';
  })();

  return { ...base, unexpected, outcome };
}

export interface CorpusScore {
  total: number;
  exact: number;
  offered: number;
  outOfOrder: number;
  incomplete: number;
  misGrouped: number;
  refused: number;
  misleadingTop: number;
  /**
   * Cases that got the right answer, where "right" depends on what was asked: an
   * `exact` result for an utterance naming passages, a `refused` result for one
   * naming none. Counting correct refusals as misses would drag the headline down
   * for behaviour that is exactly right.
   */
  correct: number;
  correctRate: number;
  /** Of the cases that DO name passages: fraction fully correct and in order. */
  exactRate: number;
  /** Of the cases that DO name passages: fraction with every reference reachable. */
  reachableRate: number;
  /** Fraction of ALL cases where a wrong canonical led a group. */
  misleadingTopRate: number;
  misleadingCases: ScoredUtterance[];
  scored: ScoredUtterance[];
}

export function scoreCorpus(cases: UtteranceCase[]): CorpusScore {
  const scored = cases.map(scoreUtterance);
  const count = (outcome: ReferenceOutcome) => scored.filter((item) => item.outcome === outcome).length;
  const total = scored.length;
  const exact = count('exact');
  const misleadingTop = count('misleading-top');

  // Rates over the wrong denominator are how a corpus lies.
  const naming = scored.filter((item) => !item.namesNothing);
  const correct = exact + scored.filter((item) => item.namesNothing && item.outcome === 'refused').length;
  /**
   * Reachable means the operator could get to every named passage: all of them are
   * on screen, and the grouping still says how many passages were heard. A wrong
   * LEAD does not make a passage unreachable — that is what `exactRate` is for, and
   * conflating the two hid the difference between a ranking miss and a fabrication.
   */
  const reachable = naming.filter((item) => item.missing.length === 0 && item.outcome !== 'mis-grouped').length;
  const over = (value: number, denominator: number) => (denominator === 0 ? 0 : value / denominator);

  return {
    total,
    exact,
    offered: count('offered'),
    outOfOrder: count('out-of-order'),
    incomplete: count('incomplete'),
    misGrouped: count('mis-grouped'),
    refused: count('refused'),
    misleadingTop,
    correct,
    correctRate: over(correct, total),
    exactRate: over(exact, naming.length),
    reachableRate: over(reachable, naming.length),
    misleadingTopRate: over(misleadingTop, total),
    misleadingCases: scored.filter((item) => item.outcome === 'misleading-top'),
    scored
  };
}

/**
 * Deterministically damage a transcript the way a recogniser does, so the parser's
 * sensitivity can be characterised before any model is installed.
 *
 * This is a **parser sensitivity experiment**, not an estimate of any provider's
 * performance. It applies a fixed dictionary of English ASR confusions and function
 * word deletions at a chosen rate. Its word error rate is measured against a
 * synthetic corruption of hand-written text and is NOT interchangeable with a
 * published WER measured over real recognition of real audio.
 */
const ASR_CONFUSIONS: Record<string, string> = {
  two: 'to',
  too: 'two',
  four: 'for',
  for: 'four',
  eight: 'ate',
  ate: 'eight',
  one: 'won',
  won: 'one',
  three: 'free',
  six: 'sex',
  ten: 'then',
  nine: 'night',
  verse: 'verses',
  and: 'in'
};

const DROPPABLE = new Set(['the', 'of', 'in', 'to', 'a', 'and', 'me', 'with', 'my', 'is', 'it']);

/** Seeded so a corrupted corpus is reproducible; `Math.random` is unavailable here. */
function seededSequence(seed: number, length: number): number[] {
  const out: number[] = [];
  let state = (seed % 2147483647) || 1;
  for (let i = 0; i < length; i += 1) {
    state = (state * 16807) % 2147483647;
    out.push(state / 2147483647);
  }
  return out;
}

/** Mix the text into the seed so every utterance gets its own roll sequence. */
function textSeed(text: string, seed: number): number {
  /**
   * Without this, one seed produced the SAME roll sequence for every utterance, so
   * the same word positions were hit in all of them and the measured error rate sat
   * flat across three different injection rates — a curve that measured nothing.
   */
  let hash = seed;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return hash || seed || 1;
}

export interface Corruption {
  text: string;
  /**
   * The source words this run actually changed, lower-cased, one entry per changed
   * POSITION. Reported by the corruption itself rather than reconstructed afterwards
   * by diffing the two word lists: a diff compares membership, so a word corrupted at
   * one position is invisible whenever another copy of it survives elsewhere in the
   * sentence. "let us read Romans eight twenty eight" → "…twenty ate" changes the
   * second `eight` and a membership diff reports nothing changed at all — losing
   * exactly the failure this module is meant to explain.
   */
  changed: string[];
}

export function corruptTranscriptDetailed(text: string, errorRate: number, seed = 7): Corruption {
  const words = text.split(/\s+/).filter(Boolean);
  const rolls = seededSequence(textSeed(text, seed), words.length);
  const out: string[] = [];
  const changed: string[] = [];

  words.forEach((word, index) => {
    if (rolls[index] >= errorRate) {
      out.push(word);
      return;
    }
    const lower = word.toLowerCase();
    const confused = ASR_CONFUSIONS[lower];
    if (confused && confused !== lower) {
      out.push(confused);
      changed.push(lower);
      return;
    }
    if (DROPPABLE.has(lower)) {
      changed.push(lower);
      return; // deletion
    }
    out.push(word); // nothing in the model applies to this word
  });

  return { text: out.join(' '), changed };
}

export const corruptTranscript = (text: string, errorRate: number, seed = 7): string =>
  corruptTranscriptDetailed(text, errorRate, seed).text;

/** Apply the corruption model to one word. `null` means the model deletes it. */
export function corruptWord(word: string): string | null {
  const lower = word.toLowerCase();
  const confused = ASR_CONFUSIONS[lower];
  if (confused && confused !== lower) return confused;
  if (DROPPABLE.has(lower)) return null;
  return word;
}
