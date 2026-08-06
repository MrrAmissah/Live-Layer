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
   * The OTHER readings this group may contain — and the ONLY other readings it may
   * contain. **Required**, with `[]` meaning the group must hold the canonical alone.
   *
   * Required rather than optional because optional meant "skip the check". A case
   * written the ordinary way, `{ canonical: 'John 3:16' }`, declared nothing, so the
   * group's contents went unvalidated and a fabricated reading beside the right one
   * scored `exact` — or, leading, scored `offered`. The harness could see an invented
   * *group* and not an invented *reading*, while claiming both were checked. Making
   * the field mandatory is what removes "unspecified" as a state.
   */
  alternatives: string[];
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
  /**
   * True when the correct answer is to resolve nothing.
   *
   * Named for the required RESULT, not the utterance: it covers both "no passage was
   * named" and "a passage was named that cannot exist". Calling it `namesNothing`
   * claimed a distinction the type deliberately does not make — `John ninety nine
   * one` does name a passage, it just names an impossible one.
   */
  expectsNoResult: boolean;
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

/**
 * The scoring rule, over group contents alone.
 *
 * Separated from `scoreUtterance` so it can be exercised with group shapes the parser
 * does not currently produce — a reading in the wrong group, a duplicated group — but
 * which the rule must still classify correctly. Testing only through the parser meant
 * two branches could be deleted with the suite staying green, because nothing the
 * parser emits today reaches them.
 */
export function classifyGroups(groups: string[][], expected: ExpectedReference[]): ReferenceOutcome {
  const tops = groups.map((group) => group[0]);
  const wanted = expected.map((item) => item.canonical);
  const everywhere = groups.flat();
  const missing = wanted.filter((canonical) => !everywhere.includes(canonical));

  if (expected.length === 0) return groups.length === 0 ? 'refused' : 'misleading-top';
  if (groups.length === 0) return 'refused';

  /**
   * A reading offered that NO expectation declares, anywhere in the utterance.
   * Position-independent and checked first: it is the one signal meaning a passage
   * was invented rather than merely misplaced, and a differing group count must not
   * mask it.
   */
  const declaredAnywhere = new Set(expected.flatMap((item) => [item.canonical, ...item.alternatives]));
  if (everywhere.some((canonical) => !declaredAnywhere.has(canonical))) return 'misleading-top';

  // A group for a passage that was never spoken.
  if (groups.length > expected.length) return 'misleading-top';

  if (groups.length < expected.length) {
    /**
     * Every named passage came back, but packed into fewer groups than were spoken,
     * so a second passage is presented as an alternative READING of the first. Not an
     * under-read and not safe: the operator is told one passage was named when two
     * were, the mirror of the property grouping exists to protect.
     */
    return missing.length ? 'incomplete' : 'mis-grouped';
  }

  /**
   * Each group against its own declared set, in BOTH directions and for EVERY group —
   * not only where alternatives happened to be non-empty. This is where a fabricated
   * or misplaced READING is caught inside an otherwise correct structure.
   */
  const contentMismatch = groups.some((group, index) => {
    const declared = [expected[index].canonical, ...expected[index].alternatives];
    const offeredSet = new Set(group);
    const allowed = new Set(declared);
    return (
      group.some((canonical) => !allowed.has(canonical)) ||
      declared.some((canonical) => !offeredSet.has(canonical))
    );
  });

  const leadsHere = (index: number) =>
    expected[index].leadMayBeAny
      ? [expected[index].canonical, ...expected[index].alternatives].includes(tops[index])
      : tops[index] === expected[index].canonical;
  const leadsInOrder = expected.every((_, index) => leadsHere(index));

  const sortedJoin = (values: string[]) => [...values].sort().join('|');
  const readingsIntact =
    sortedJoin(everywhere) === sortedJoin(expected.flatMap((item) => [item.canonical, ...item.alternatives]));

  /**
   * Same passages, wrong sequence. Checked before the per-position content comparison:
   * once the groups have moved, comparing group *i* against expectation *i* compares
   * two unrelated references and reports mismatches that are an artefact of the
   * reordering rather than a fabrication.
   */
  if (readingsIntact && sortedJoin(tops) === sortedJoin(wanted) && !leadsInOrder) return 'out-of-order';

  if (contentMismatch) return 'misleading-top';
  if (leadsInOrder) return 'exact';

  /**
   * Contents exactly as declared and the groups line up, but a declared alternative
   * leads where the canonical was expected. A ranking miss the operator recovers in
   * one click — distinct from a group leading with something that is not a legitimate
   * reading of that reference at all.
   */
  return 'offered';
}

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
  const expectsNoResult = expected.length === 0;

  const declaredAnywhere = new Set(expected.flatMap((item) => [item.canonical, ...item.alternatives]));
  const unexpected = expectsNoResult ? tops : everywhere.filter((c) => !declaredAnywhere.has(c));

  return {
    ...testCase,
    groups,
    tops,
    missing,
    expectsNoResult,
    unexpected,
    outcome: classifyGroups(groups, expected)
  };
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
  const naming = scored.filter((item) => !item.expectsNoResult);
  const correct = exact + scored.filter((item) => item.expectsNoResult && item.outcome === 'refused').length;
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
