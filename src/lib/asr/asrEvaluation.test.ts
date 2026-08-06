import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  characterErrorRate,
  corpusErrorRate,
  tokeniseWords,
  wordErrorRate
} from './transcriptMetrics';
import { corruptTranscript, scoreCorpus, scoreUtterance } from './referenceOutcome';
import { measureSensitivity, misleadingTokens, sensitivityCurve } from './sensitivity';
import { CORPUS_GROUPS, MULTIPLE_REFERENCES, SERVICE_CORPUS } from './serviceCorpus';

describe('error rates match the published definition', () => {
  it('counts substitutions, deletions and insertions separately', () => {
    expect(wordErrorRate('john three sixteen', 'john three sixteen')).toMatchObject({
      rate: 0,
      substitutions: 0,
      deletions: 0,
      insertions: 0
    });
    expect(wordErrorRate('john three sixteen', 'john free sixteen')).toMatchObject({
      substitutions: 1,
      referenceLength: 3
    });
    expect(wordErrorRate('john three sixteen', 'john sixteen')).toMatchObject({ deletions: 1 });
    expect(wordErrorRate('john three sixteen', 'john three sixteen amen')).toMatchObject({ insertions: 1 });
  });

  it('normalises case and punctuation, because a recogniser is not judged on commas', () => {
    expect(wordErrorRate('John 3:16, for God so loved', 'john 3:16 for god so loved').rate).toBe(0);
    expect(tokeniseWords('  Turn—please—to John.  ')).toEqual(['turn', 'please', 'to', 'john']);
  });

  it('does not score a hallucination against silence as perfect', () => {
    expect(wordErrorRate('', 'jesus fed five thousand').rate).toBe(1);
    expect(wordErrorRate('', '').rate).toBe(0);
  });

  it('measures characters too, for languages where word boundaries are unreliable', () => {
    expect(characterErrorRate('john', 'john').rate).toBe(0);
    expect(characterErrorRate('john', 'jahn')).toMatchObject({ substitutions: 1, referenceLength: 4 });
  });

  it('pools a corpus by total errors, not by averaging per-utterance rates', () => {
    const pairs = [
      { reference: 'a b c d e f g h i j', hypothesis: 'a b c d e f g h i j' },
      { reference: 'john three', hypothesis: 'mark four' }
    ];
    const pooled = corpusErrorRate(pairs);
    expect(pooled.referenceLength).toBe(12);
    expect(pooled.rate).toBeCloseTo(2 / 12, 5);
    expect(pooled.rate).toBeLessThan(0.5); // the mean of the rates would be 0.5
  });
});

describe('every reference that was spoken is evaluated', () => {
  /**
   * The gap this closes. The expectation used to be a single canonical string, so
   * "John three sixteen and Romans eight twenty eight" expected only John — and the
   * case passed whether Romans came back right, came back as a different real verse,
   * or never came back at all, while the summary said "multiple references 5/5".
   */
  const outcome = (spoken: string, expected: string[] | null) =>
    scoreUtterance({
      spoken,
      expected: expected === null ? null : expected.map((canonical) => ({ canonical }))
    }).outcome;

  it('accepts two correct references in the order spoken', () => {
    expect(outcome('John three sixteen and Romans eight twenty eight', ['John 3:16', 'Romans 8:28'])).toBe('exact');
  });

  it('accepts three correct references', () => {
    expect(
      outcome('John three sixteen and Romans eight twenty eight then Psalm twenty three one', [
        'John 3:16',
        'Romans 8:28',
        'Psalms 23:1'
      ])
    ).toBe('exact');
  });

  it('rejects a correct first with a WRONG second', () => {
    // The case the old contract could not see at all.
    expect(outcome('John three sixteen and Romans eight twenty eight', ['John 3:16', 'Romans 8:29'])).toBe(
      'misleading-top'
    );
  });

  it('rejects a correct first with a MISSING second', () => {
    expect(outcome('John three sixteen', ['John 3:16', 'Romans 8:28'])).toBe('incomplete');
  });

  it('rejects an extra passage that was never spoken', () => {
    expect(outcome('John three sixteen and Romans eight twenty eight', ['John 3:16'])).toBe('misleading-top');
  });

  it('rejects the right passages in the wrong order', () => {
    expect(outcome('John three sixteen and Romans eight twenty eight', ['Romans 8:28', 'John 3:16'])).toBe(
      'out-of-order'
    );
  });

  it('holds the parser to its own deduplication contract', () => {
    expect(outcome('John three sixteen and John three sixteen', ['John 3:16'])).toBe('exact');
    // Two DIFFERENT verses of one book stay two passages.
    expect(outcome('John three sixteen and John three eighteen', ['John 3:16', 'John 3:18'])).toBe('exact');
  });

  it('keeps a discontinuous verse list as ONE reference, not two passages', () => {
    expect(outcome('John three sixteen and eighteen', ['John 3:16,18'])).toBe('exact');
    /**
     * And expecting it as two passages must FAIL rather than pass as "both present".
     * It reports `misleading-top` because the group leads with a canonical that was
     * not the one named at that position — from the harness's side that is the same
     * evidence as a fabricated passage, and failing conservatively is right.
     */
    expect(outcome('John three sixteen and eighteen', ['John 3:16', 'John 3:18'])).toBe('misleading-top');
  });

  it('distinguishes an ambiguity alternative from a second spoken passage', () => {
    /**
     * `Timothy one seven` is ONE reference with two readings. They must share a
     * group; two groups would tell the operator two passages were named.
     */
    const ambiguous = scoreUtterance({
      spoken: 'Timothy one seven',
      expected: [{ canonical: '1 Timothy 1:7', alternatives: ['2 Timothy 1:7'] }]
    });
    expect(ambiguous.outcome).toBe('exact');
    expect(ambiguous.groups).toHaveLength(1);
    expect(ambiguous.groups[0]).toEqual(['1 Timothy 1:7', '2 Timothy 1:7']);

    // Treating the alternative as a second spoken passage must NOT pass.
    expect(outcome('Timothy one seven', ['1 Timothy 1:7', '2 Timothy 1:7'])).toBe('incomplete');
  });

  it('treats any passage for a no-reference utterance as a wrong leading candidate', () => {
    expect(outcome('John three sixteen', null)).toBe('misleading-top');
    expect(outcome('good morning church', null)).toBe('refused');
  });

  it('scores refusals against the right denominator', () => {
    const score = scoreCorpus([
      { spoken: 'John three sixteen', expected: [{ canonical: 'John 3:16' }] },
      { spoken: 'good morning church', expected: null }
    ]);
    expect(score.correct).toBe(2);
    expect(score.correctRate).toBe(1);
    expect(score.exactRate).toBe(1);

    // The symmetric error: a refusal is only correct when nothing was named.
    const missed = scoreCorpus([
      { spoken: 'John', expected: [{ canonical: 'John 3:16' }] },
      { spoken: 'good morning church', expected: null }
    ]);
    expect(missed.refused).toBe(2);
    expect(missed.correct, 'a refused real reference is not correct').toBe(1);
    expect(missed.correctRate).toBe(0.5);

    // The degenerate case a naive metric would reward: resolve nothing, ever.
    const silent = scoreCorpus([
      { spoken: 'John', expected: [{ canonical: 'John 3:16' }] },
      { spoken: 'Romans', expected: [{ canonical: 'Romans 8:1' }] }
    ]);
    expect(silent.correct).toBe(0);
    expect(silent.correctRate).toBe(0);
  });
});

describe('the service corpus, on clean transcripts', () => {
  const score = scoreCorpus(SERVICE_CORPUS);

  it('never leads with a wrong passage', () => {
    expect(score.misleadingCases.map((c) => `${c.spoken} -> ${c.tops.join(', ')}`)).toEqual([]);
    expect(score.misleadingTopRate).toBe(0);
  });

  it('resolves every reference that was spoken, in order', () => {
    expect(score.correct).toBe(score.total);
    expect(score.exactRate).toBe(1);
    expect(score.incomplete).toBe(0);
    expect(score.outOfOrder).toBe(0);
  });

  it('refuses every utterance that names no passage', () => {
    const noReference = score.scored.filter((item) => item.expected === null);
    expect(noReference.length).toBeGreaterThan(8);
    for (const item of noReference) {
      expect(item.groups, `"${item.spoken}" must resolve nothing`).toEqual([]);
    }
  });

  it('holds in every group, so a strong group cannot hide a weak one', () => {
    for (const [name, cases] of Object.entries(CORPUS_GROUPS)) {
      const group = scoreCorpus(cases);
      expect(group.misleadingTop, `${name} led with a wrong passage`).toBe(0);
      expect(group.correct, name).toBe(group.total);
    }
  });

  it('actually states more than one reference in the multi-reference group', () => {
    /**
     * Presence anchor against regression to the vacuous contract: if these collapse
     * back to a single expected canonical, the group stops testing separation and
     * the suite must say so rather than reporting a clean pass.
     */
    const multi = MULTIPLE_REFERENCES.filter((c) => (c.expected ?? []).length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(6);
    expect(MULTIPLE_REFERENCES.some((c) => (c.expected ?? []).length >= 3)).toBe(true);
    expect(SERVICE_CORPUS.length).toBeGreaterThanOrEqual(45);
    expect(CORPUS_GROUPS['code-switched framing'].length).toBeGreaterThanOrEqual(5);
    expect(CORPUS_GROUPS['quoted and narrative numbers'].length).toBeGreaterThanOrEqual(8);
  });
});

describe('parser sensitivity, over many seeds', () => {
  /**
   * A parser-sensitivity experiment, NOT a measurement of any provider. Its word
   * error rate comes from synthetic corruption of hand-written text and is not
   * interchangeable with a WER measured over real recognition of real audio.
   */
  const SEEDS = 100;

  it('is deterministic, and different seeds give different corpora', () => {
    expect(corruptTranscript('John three sixteen and Romans eight one', 0.5, 7)).toBe(
      corruptTranscript('John three sixteen and Romans eight one', 0.5, 7)
    );
    expect(corruptTranscript('John three sixteen', 0.5, 7)).not.toBe(
      corruptTranscript('John three sixteen', 0.5, 99)
    );
  });

  it('gives every utterance its own corruption sequence', () => {
    /**
     * Tested at the mechanism, not through the aggregate. One shared roll sequence
     * corrupts the SAME WORD POSITIONS in every utterance — and averaging over many
     * seeds hides that completely, because the aggregate still rises with the
     * injection rate. So compare two utterances of equal length directly: under a
     * shared sequence their changed-position sets are necessarily identical.
     */
    const a = 'one two three four five six seven eight';
    const b = 'eight seven six five four three two one';
    const changedPositions = (text: string, seed: number) => {
      const before = text.split(' ');
      const after = corruptTranscript(text, 0.5, seed).split(' ');
      return before.map((word, index) => (after[index] === word ? '.' : 'x')).join('');
    };

    const differs = [1, 2, 3, 4, 5].some((seed) => changedPositions(a, seed) !== changedPositions(b, seed));
    expect(differs, 'two utterances must not be corrupted at identical positions').toBe(true);

    // And the curve still has to rise with the injection rate.
    const rates = sensitivityCurve(SERVICE_CORPUS.slice(0, 12), [0.1, 0.3, 0.5], 5).map((point) => point.medianWer);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });

  it('uses every seed, not one privileged draw', () => {
    /**
     * A single seed is one arbitrary sample. If the aggregate were computed from one
     * of them, the spread would collapse — so the spread is the evidence that all of
     * them ran.
     */
    const point = measureSensitivity(SERVICE_CORPUS, 0.3, SEEDS);
    expect(point.seeds).toBe(SEEDS);
    expect(point.maxWer).toBeGreaterThan(point.minWer);
    expect(point.medianWer).toBeGreaterThanOrEqual(point.minWer);
    expect(point.medianWer).toBeLessThanOrEqual(point.maxWer);
    // The worst seed is worse than the average one — impossible from a single draw.
    expect(point.worstMisleadingCount).toBeGreaterThan(point.meanMisleadingCount);
  });

  it('reports the share of seeds that failed, so a mean cannot round one away', () => {
    /**
     * If one seed in a hundred produces a wrong leading candidate, a mean of 0.01
     * reads like nothing. The share reads as 1%, which is what it is.
     */
    const low = measureSensitivity(SERVICE_CORPUS, 0.05, SEEDS);
    expect(low.seedsWithMisleadingShare).toBeGreaterThan(0);
    expect(low.meanMisleadingCount).toBeLessThan(low.worstMisleadingCount);
    // A seed containing a failure cannot be hidden by seeds that did not.
    expect(low.seedsWithMisleadingShare).toBeGreaterThanOrEqual(low.worstMisleadingCount > 0 ? 1 / SEEDS : 0);
    // It counts SEEDS, so scaling it back up must land on a whole number of them.
    expect(Number.isInteger(Math.round(low.seedsWithMisleadingShare * SEEDS))).toBe(true);

    /**
     * The discriminator against reporting an average instead. At a high injection
     * rate every single seed produces at least one wrong leading candidate, so the
     * share is exactly 1 — where any per-case mean is a small fraction, and would
     * read as "a few percent" for a corpus that failed in every run.
     */
    const high = measureSensitivity(SERVICE_CORPUS, 0.5, SEEDS);
    expect(high.seedsWithMisleadingShare).toBe(1);
    expect(high.meanMisleadingCount / SERVICE_CORPUS.length).toBeLessThan(0.5);
  });

  it('is clean at zero injection and degrades monotonically', () => {
    const curve = sensitivityCurve(SERVICE_CORPUS, [0, 0.2, 0.5], 20);
    expect(curve[0].medianWer).toBe(0);
    expect(curve[0].seedsWithMisleadingShare).toBe(0);
    expect(curve[0].worstMisleadingCount).toBe(0);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].meanMisleadingCount).toBeGreaterThan(curve[i - 1].meanMisleadingCount);
    }
  });

  it('names the tokens responsible, because a rate is not actionable', () => {
    const tokens = misleadingTokens(SERVICE_CORPUS, 0.3, 20);
    expect(tokens.length).toBeGreaterThan(3);
    // Number words dominate — the errors that matter land on chapters and verses.
    const top = tokens.slice(0, 8).map((entry) => entry.token);
    expect(top.some((token) => ['one', 'two', 'three', 'eight', 'nine', 'ten'].includes(token))).toBe(true);
  });

  it('keeps refusing the utterances that name no passage, even when garbled', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const garbled = CORPUS_GROUPS['should refuse'].map((testCase) => ({
        ...testCase,
        spoken: corruptTranscript(testCase.spoken, 0.5, seed)
      }));
      expect(scoreCorpus(garbled).misleadingTop, `seed ${seed}`).toBe(0);
    }
  });
});

describe('no provider, no audio, no credentials enter the harness', () => {
  it('has none of them in code', () => {
    for (const file of [
      'src/lib/asr/transcriptMetrics.ts',
      'src/lib/asr/referenceOutcome.ts',
      'src/lib/asr/sensitivity.ts',
      'src/lib/asr/serviceCorpus.ts'
    ]) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const forbidden of [
        'getUserMedia',
        'MediaRecorder',
        'SpeechRecognition',
        'AudioContext',
        'mediaDevices',
        'huggingface',
        'khaya',
        'apiKey',
        'Authorization',
        'fetch(',
        'localStorage'
      ]) {
        expect(code, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('ships no audio or model files', () => {
    const corpus = readFileSync('src/lib/asr/serviceCorpus.ts', 'utf8');
    expect(corpus).not.toMatch(/\.(wav|mp3|flac|m4a|ogg|safetensors|bin|onnx|gguf)\b/);
  });

  it('does not place a provider WER on the synthetic curve', () => {
    /**
     * The conclusion this harness must not draw. A published WER measures real
     * recognition of real audio; the sensitivity curve measures synthetic corruption
     * of invented sentences. Naming a provider next to a threshold in this code
     * would be equating them.
     */
    for (const file of ['src/lib/asr/sensitivity.ts', 'src/lib/asr/referenceOutcome.ts']) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/dondo/i);
      expect(text).not.toMatch(/16\.9|27\.4/);
    }
  });
});
