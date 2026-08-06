/**
 * Word and character error rate, for judging a speech provider against a fixed
 * corpus.
 *
 * These are the numbers ASR papers report, so they are here to make published
 * figures comparable with what we measure ourselves on our own audio. They are NOT
 * the number that decides whether voice assist is safe to use — see
 * `referenceOutcome.ts` for that. A transcript can be 27% wrong and still yield the
 * right passage if the errors land on words outside the reference; it can be 5%
 * wrong and yield the wrong passage if the single error lands on a verse number.
 *
 * No provider, no audio, no model. Pure string work over transcripts, so the whole
 * harness runs in the ordinary test suite.
 */

export interface ErrorRate {
  /** Errors ÷ reference length. 0 is perfect; can exceed 1 with many insertions. */
  rate: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  /** Length of the reference, in the unit being counted. */
  referenceLength: number;
}

/**
 * Levenshtein edit counts between two token sequences.
 *
 * Two rows rather than a full matrix, and the operation counts are carried
 * alongside the distance so the breakdown is exact rather than reconstructed.
 */
function editCounts(reference: string[], hypothesis: string[]): Omit<ErrorRate, 'rate'> {
  interface Cell {
    cost: number;
    sub: number;
    del: number;
    ins: number;
  }
  const start = (): Cell => ({ cost: 0, sub: 0, del: 0, ins: 0 });

  let previous: Cell[] = [start()];
  for (let j = 1; j <= hypothesis.length; j += 1) {
    previous.push({ cost: j, sub: 0, del: 0, ins: j });
  }

  for (let i = 1; i <= reference.length; i += 1) {
    const current: Cell[] = [{ cost: i, sub: 0, del: i, ins: 0 }];
    for (let j = 1; j <= hypothesis.length; j += 1) {
      const match = reference[i - 1] === hypothesis[j - 1];
      const diagonal = previous[j - 1];
      const fromSub: Cell = match
        ? { ...diagonal }
        : { cost: diagonal.cost + 1, sub: diagonal.sub + 1, del: diagonal.del, ins: diagonal.ins };

      const above = previous[j];
      const fromDel: Cell = { cost: above.cost + 1, sub: above.sub, del: above.del + 1, ins: above.ins };

      const left = current[j - 1];
      const fromIns: Cell = { cost: left.cost + 1, sub: left.sub, del: left.del, ins: left.ins + 1 };

      // Ties prefer substitution, then deletion — the conventional WER ordering, so
      // the breakdown matches what other tools report for the same pair.
      let best = fromSub;
      if (fromDel.cost < best.cost) best = fromDel;
      if (fromIns.cost < best.cost) best = fromIns;
      current.push(best);
    }
    previous = current;
  }

  const final = previous[hypothesis.length];
  return {
    substitutions: final.sub,
    deletions: final.del,
    insertions: final.ins,
    referenceLength: reference.length
  };
}

const rateOf = (counts: Omit<ErrorRate, 'rate'>): ErrorRate => ({
  ...counts,
  // An empty reference with any hypothesis is 100% insertion error, not a divide by
  // zero, and not silently 0 — reporting 0 there would flatter a provider that
  // hallucinated speech into silence.
  rate:
    counts.referenceLength === 0
      ? counts.insertions > 0
        ? 1
        : 0
      : (counts.substitutions + counts.deletions + counts.insertions) / counts.referenceLength
});

/** Lower-case, strip punctuation, collapse whitespace. */
export function normaliseTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?"“”'’()\[\]]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const tokeniseWords = (text: string): string[] =>
  normaliseTranscript(text).split(' ').filter(Boolean);

export function wordErrorRate(reference: string, hypothesis: string): ErrorRate {
  return rateOf(editCounts(tokeniseWords(reference), tokeniseWords(hypothesis)));
}

export function characterErrorRate(reference: string, hypothesis: string): ErrorRate {
  const chars = (text: string) => normaliseTranscript(text).replace(/ /g, '').split('');
  return rateOf(editCounts(chars(reference), chars(hypothesis)));
}

/** Aggregate over a corpus by total errors ÷ total reference length, not a mean of rates. */
export function corpusErrorRate(pairs: { reference: string; hypothesis: string }[]): ErrorRate {
  /**
   * Deliberately NOT the average of per-utterance rates. Averaging rates weights a
   * three-word utterance the same as a thirty-word one, which is how a provider
   * that fails only on short commands can post a flattering number. Pooling the
   * counts is what published WER means.
   */
  const totals = pairs.reduce(
    (sum, pair) => {
      const counts = editCounts(tokeniseWords(pair.reference), tokeniseWords(pair.hypothesis));
      return {
        substitutions: sum.substitutions + counts.substitutions,
        deletions: sum.deletions + counts.deletions,
        insertions: sum.insertions + counts.insertions,
        referenceLength: sum.referenceLength + counts.referenceLength
      };
    },
    { substitutions: 0, deletions: 0, insertions: 0, referenceLength: 0 }
  );
  return rateOf(totals);
}
