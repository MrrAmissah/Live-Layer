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
 *  - `offered`         all present and correctly grouped, but something is not first.
 *  - `out-of-order`    all present, wrong sequence. The operator reads them in order.
 *  - `incomplete`      a named reference produced nothing. Under-read; safe.
 *  - `refused`         nothing resolved at all. Safe — the operator types it.
 *  - `misleading-top`  a wrong canonical LEADS a group, or a group appeared for a
 *                      passage that was never spoken.
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
  | 'refused'
  | 'misleading-top';

export interface ExpectedReference {
  /** The canonical the speaker meant; must LEAD its group. */
  canonical: string;
  /**
   * Other readings the parser may legitimately offer for this same reference —
   * a genuine ambiguity such as `Timothy one seven`. Lower-ranked readings within a
   * group are the ambiguity feature working, not fabrication; a *group* that was
   * never spoken is fabrication.
   */
  alternatives?: string[];
}

export interface UtteranceCase {
  /** What was said, as a transcript. */
  spoken: string;
  /**
   * Every reference named, in the order spoken. `null` means the utterance names no
   * passage and resolving anything would be wrong.
   */
  expected: ExpectedReference[] | null;
  note?: string;
}

export interface ScoredUtterance extends UtteranceCase {
  outcome: ReferenceOutcome;
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
  const wanted = canonicalsOf(testCase.expected);
  const everywhere = groups.flat();

  const missing = wanted.filter((canonical) => !everywhere.includes(canonical));
  const base = { ...testCase, groups, tops, missing };

  // An utterance that names nothing: resolving anything at all is the failure.
  if (testCase.expected === null || wanted.length === 0) {
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
   * A group leads with a canonical that is not the one named at this position and
   * is not one of that reference's own alternatives — or there are MORE groups than
   * references spoken, so a passage was invented.
   */
  const unexpected = tops.filter((top, index) => {
    const expectedHere = testCase.expected![index];
    if (!expectedHere) return true; // a group with no reference behind it
    if (top === expectedHere.canonical) return false;
    return !(expectedHere.alternatives ?? []).includes(top);
  });

  const sameLength = wanted.length === tops.length;
  const outcome: ReferenceOutcome = (() => {
    // Everything leading correctly, position by position.
    if (sameLength && wanted.every((canonical, index) => tops[index] === canonical)) return 'exact';

    /**
     * The same passages in the wrong sequence, checked BEFORE the positional test.
     * Every group leads with something that was genuinely spoken, so nothing was
     * invented — reporting that as a wrong leading candidate would put a sequencing
     * defect in the same bucket as a fabricated verse, and they are not the same
     * problem. It still fails: the operator reads them in the order they were said.
     */
    if (sameLength && [...wanted].sort().join('|') === [...tops].sort().join('|')) return 'out-of-order';

    // A group leads with something not named at that position, or was invented.
    if (unexpected.length) return 'misleading-top';
    // Fewer groups than references named, or a named reference absent entirely.
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
  const naming = scored.filter((item) => item.expected !== null && item.expected.length > 0);
  const correct = exact + scored.filter((item) => item.expected === null && item.outcome === 'refused').length;
  const reachable = naming.filter((item) => item.missing.length === 0 && item.outcome !== 'misleading-top').length;
  const over = (value: number, denominator: number) => (denominator === 0 ? 0 : value / denominator);

  return {
    total,
    exact,
    offered: count('offered'),
    outOfOrder: count('out-of-order'),
    incomplete: count('incomplete'),
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

export function corruptTranscript(text: string, errorRate: number, seed = 7): string {
  const words = text.split(/\s+/).filter(Boolean);
  const rolls = seededSequence(textSeed(text, seed), words.length * 2);
  const out: string[] = [];

  words.forEach((word, index) => {
    if (rolls[index] >= errorRate) {
      out.push(word);
      return;
    }
    const lower = word.toLowerCase();
    const confused = ASR_CONFUSIONS[lower];
    if (confused && confused !== lower) {
      out.push(confused);
      return;
    }
    if (DROPPABLE.has(lower)) return; // deletion
    out.push(word);
  });

  return out.join(' ');
}
