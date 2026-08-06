import { parseSpokenReference } from '../scripture/spokenReference';

/**
 * The metric that actually decides whether voice assist is safe to switch on.
 *
 * Word error rate is what ASR papers report, and it is the wrong question for this
 * app. What matters is whether the utterance produced the passage the preacher
 * named — and, far more importantly, whether it ever produced a DIFFERENT passage
 * that looks correct. Those two failures are not equally bad and must never be
 * averaged into one score:
 *
 *  - `exact`    the passage the preacher named is the top candidate. Success.
 *  - `offered`  it is present but not first. Usable — the operator picks it — but a
 *               ranking miss, and it costs seconds during a service.
 *  - `refused`  nothing was resolved. SAFE. The operator types the reference and the
 *               feature has cost them a moment, not their credibility.
 *  - `harmful`  a valid but different passage is the top candidate. This is the only
 *               outcome that can put wrong scripture on a screen in front of a
 *               congregation, and the target for it is zero, not "low".
 *
 * A provider with a worse WER and no harmful outcomes is better than one with a
 * better WER that occasionally invents a plausible reference. That tradeoff is
 * invisible to WER and is the whole reason this module exists.
 *
 * Runs with no audio and no provider: it scores TRANSCRIPTS, so the corpus can be
 * written by hand today and replayed against a real recogniser's output later.
 */

export type ReferenceOutcome = 'exact' | 'offered' | 'refused' | 'harmful';

export interface UtteranceCase {
  /** What was said, as a transcript. */
  spoken: string;
  /**
   * The canonical reference the speaker meant, e.g. `John 3:16`, or null when the
   * utterance names no passage at all and resolving anything would be wrong.
   */
  expected: string | null;
  /** Free-text note on what this case is probing. */
  note?: string;
}

export interface ScoredUtterance extends UtteranceCase {
  outcome: ReferenceOutcome;
  /** Every candidate offered, best first. */
  offered: string[];
  /** The top candidate, or null if nothing resolved. */
  top: string | null;
  /** Where `expected` appeared, or -1. */
  rank: number;
}

export function scoreUtterance(testCase: UtteranceCase): ScoredUtterance {
  const parsed = parseSpokenReference(testCase.spoken);
  const offered = parsed.ok ? parsed.candidates.map((candidate) => candidate.reference.canonical) : [];
  const top = offered[0] ?? null;
  const rank = testCase.expected === null ? -1 : offered.indexOf(testCase.expected);

  const outcome: ReferenceOutcome = (() => {
    /**
     * A case that names no passage is scored the other way round: resolving
     * ANYTHING is harmful, because the operator is being offered scripture the
     * preacher never asked for.
     */
    if (testCase.expected === null) return top === null ? 'refused' : 'harmful';
    if (top === null) return 'refused';
    if (top === testCase.expected) return 'exact';
    if (rank > 0) return 'offered';
    return 'harmful';
  })();

  return { ...testCase, outcome, offered, top, rank };
}

export interface CorpusScore {
  total: number;
  exact: number;
  offered: number;
  refused: number;
  harmful: number;
  /**
   * Cases that got the right answer, where "right" depends on what was asked.
   *
   * Kept separate from `exactRate` because a corpus mixes two different questions.
   * For an utterance naming a passage, success is `exact`. For one naming none,
   * success is `refused` — and counting those refusals as misses drags the headline
   * number down for behaviour that is exactly correct, which is the sort of
   * misleading aggregate this module exists to avoid.
   */
  correct: number;
  correctRate: number;
  /** Of the cases that DO name a passage: fraction where it was first. */
  exactRate: number;
  /** Of the cases that DO name a passage: fraction where it was reachable at all. */
  reachableRate: number;
  /**
   * Fraction where a WRONG passage led. The number that gates release. Every case
   * contributing to it is listed in `harmfulCases` — a rate alone is not actionable.
   */
  harmfulRate: number;
  harmfulCases: ScoredUtterance[];
  scored: ScoredUtterance[];
}

export function scoreCorpus(cases: UtteranceCase[]): CorpusScore {
  const scored = cases.map(scoreUtterance);
  const count = (outcome: ReferenceOutcome) => scored.filter((item) => item.outcome === outcome).length;
  const total = scored.length;
  const exact = count('exact');
  const offered = count('offered');
  const harmful = count('harmful');

  // Cases naming a passage are scored against `exact`; cases naming none are scored
  // against `refused`. Rates over the wrong denominator are how a corpus lies.
  const naming = scored.filter((item) => item.expected !== null);
  const correct = exact + scored.filter((item) => item.expected === null && item.outcome === 'refused').length;

  const over = (value: number, denominator: number) => (denominator === 0 ? 0 : value / denominator);

  return {
    total,
    exact,
    offered,
    refused: count('refused'),
    harmful,
    correct,
    correctRate: over(correct, total),
    exactRate: over(exact, naming.length),
    reachableRate: over(exact + offered, naming.length),
    harmfulRate: over(harmful, total),
    harmfulCases: scored.filter((item) => item.outcome === 'harmful'),
    scored
  };
}

/**
 * Deterministically damage a transcript the way a recogniser does, so reference
 * accuracy can be measured as a FUNCTION of word error rate before any model is
 * installed.
 *
 * This is a stand-in for real audio, and it is honest about being one: it applies
 * the documented confusions of English ASR (number homophones, dropped short
 * function words) at a fixed rate with a seeded sequence, so the same seed always
 * produces the same corruption. It cannot tell us DONDO's error rate. It can tell
 * us the shape of the curve — specifically whether errors turn into `harmful`
 * outcomes or into `refused` ones, which is a property of OUR parser and is exactly
 * what we can and should establish in advance.
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
  first: 'first',
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
   * flat across three different injection rates — a degradation curve that was not
   * measuring degradation.
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
