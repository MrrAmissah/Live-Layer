import { corruptTranscript, scoreCorpus, type UtteranceCase } from './referenceOutcome';
import { corpusErrorRate } from './transcriptMetrics';

/**
 * How sensitive is OUR PARSER to transcription error?
 *
 * This is a parser-sensitivity experiment and nothing else. It corrupts hand-written
 * transcripts with a fixed dictionary of English ASR confusions and function-word
 * deletions, then measures what the parser does with the result.
 *
 * **It does not measure any speech provider, and its word error rate is not
 * interchangeable with a published one.** A published WER comes from real
 * recognition of real audio over that model's own test material; this comes from a
 * synthetic corruption of invented sentences. Putting a provider's WER onto this
 * curve to predict its behaviour would be comparing two different quantities that
 * merely share a name — see `docs/ASR_EVALUATION.md`.
 *
 * What it CAN establish, before any model exists: whether transcription errors in
 * this domain tend to become refusals (safe) or wrong leading candidates, and which
 * tokens are responsible. That is a property of the parser and is worth knowing.
 *
 * Run over many seeds rather than one. A single seed is one arbitrary draw; reporting
 * it alone would let a lucky or unlucky corruption stand in for the distribution.
 */

export interface SensitivityPoint {
  injectionRate: number;
  seeds: number;
  /** Measured word error rate of the corrupted corpus against the clean one. */
  medianWer: number;
  minWer: number;
  maxWer: number;
  /** Share of seeds in which at least one utterance got a wrong leading candidate. */
  seedsWithMisleadingShare: number;
  meanMisleadingCount: number;
  worstMisleadingCount: number;
  /** Mean per-seed counts, for the safe outcomes. */
  meanRefused: number;
  meanExact: number;
}

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export function measureSensitivity(
  corpus: UtteranceCase[],
  injectionRate: number,
  seedCount: number
): SensitivityPoint {
  const wers: number[] = [];
  const misleadingCounts: number[] = [];
  const refusedCounts: number[] = [];
  const exactCounts: number[] = [];

  for (let seed = 1; seed <= seedCount; seed += 1) {
    const corrupted = corpus.map((testCase) => ({
      ...testCase,
      spoken: corruptTranscript(testCase.spoken, injectionRate, seed)
    }));
    wers.push(
      corpusErrorRate(
        corpus.map((testCase, index) => ({
          reference: testCase.spoken,
          hypothesis: corrupted[index].spoken
        }))
      ).rate
    );
    const score = scoreCorpus(corrupted);
    misleadingCounts.push(score.misleadingTop);
    refusedCounts.push(score.refused);
    exactCounts.push(score.exact);
  }

  return {
    injectionRate,
    seeds: seedCount,
    medianWer: median(wers),
    minWer: Math.min(...wers),
    maxWer: Math.max(...wers),
    /**
     * Reported as a SHARE OF SEEDS, not a mean, because a mean can round a real
     * failure away: if one seed in a hundred produces a wrong leading candidate,
     * "0.01 average" reads like nothing while "1% of runs" reads like what it is.
     */
    seedsWithMisleadingShare: misleadingCounts.filter((count) => count > 0).length / seedCount,
    meanMisleadingCount: mean(misleadingCounts),
    worstMisleadingCount: Math.max(...misleadingCounts),
    meanRefused: mean(refusedCounts),
    meanExact: mean(exactCounts)
  };
}

export const sensitivityCurve = (
  corpus: UtteranceCase[],
  injectionRates: number[],
  seedCount: number
): SensitivityPoint[] => injectionRates.map((rate) => measureSensitivity(corpus, rate, seedCount));

/**
 * Which spoken tokens keep turning into wrong leading candidates.
 *
 * A rate says there is a problem; this says where. Counted over every seed so a
 * token that fails rarely still shows up.
 */
export function misleadingTokens(
  corpus: UtteranceCase[],
  injectionRate: number,
  seedCount: number
): { token: string; count: number }[] {
  const tally = new Map<string, number>();

  for (let seed = 1; seed <= seedCount; seed += 1) {
    for (const testCase of corpus) {
      const spoken = corruptTranscript(testCase.spoken, injectionRate, seed);
      if (spoken === testCase.spoken) continue;
      const [scored] = scoreCorpus([{ ...testCase, spoken }]).scored;
      if (scored.outcome !== 'misleading-top') continue;

      // The words that changed are the ones responsible.
      const before = testCase.spoken.toLowerCase().split(/\s+/);
      const after = spoken.toLowerCase().split(/\s+/);
      for (const word of before) {
        if (!after.includes(word)) tally.set(word, (tally.get(word) ?? 0) + 1);
      }
    }
  }

  return [...tally.entries()]
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
}
