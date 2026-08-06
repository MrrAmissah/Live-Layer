import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  characterErrorRate,
  corpusErrorRate,
  tokeniseWords,
  wordErrorRate
} from './transcriptMetrics';
import {
  classifyGroups,
  corruptTranscript,
  corruptTranscriptDetailed,
  corruptWord,
  scoreCorpus,
  scoreUtterance
} from './referenceOutcome';
import { measureSensitivity, misleadingTokens, sensitivityCurve, singleTokenCulprits } from './sensitivity';
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
      expected: expected === null ? null : expected.map((canonical) => ({ canonical, alternatives: [] }))
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

    // Treating the alternative as a second spoken passage must NOT pass. Both are
    // present, so it is not an under-read — it is the grouping being wrong.
    expect(outcome('Timothy one seven', ['1 Timothy 1:7', '2 Timothy 1:7'])).toBe('mis-grouped');
  });

  it('flags two passages packed into one group, and does not call it safe', () => {
    /**
     * The parser dedups canonicals globally, so a later group can lose every reading
     * and be dropped — and then the second passage is presented as an alternative
     * READING of the first. The operator is told one passage was named when two were,
     * which is the mirror of the property grouping exists to protect. Filing it under
     * `incomplete` would label it an under-read, and it is not.
     */
    const scored = scoreUtterance({
      spoken: 'Timothy one seven and second Timothy one seven',
      expected: [{ canonical: '1 Timothy 1:7', alternatives: [] }, { canonical: '2 Timothy 1:7', alternatives: [] }]
    });
    expect(scored.outcome).toBe('mis-grouped');
    expect(scored.groups).toHaveLength(1);
    expect(scored.missing, 'both passages ARE present — that is what makes it subtle').toEqual([]);
    // And it must not count towards reachable, which is the "usable" measure.
    expect(scoreCorpus([scored]).reachableRate).toBe(0);
  });

  it('requires every group to hold exactly the declared readings', () => {
    /**
     * `alternatives` was optional, and optional meant "skip the check". A case written
     * the ordinary way — `{ canonical: 'John 3:16' }` — declared nothing, so the
     * group's contents went unvalidated: a fabricated reading sitting beside the right
     * one scored `exact`, and one sitting ahead of it scored `offered`. The harness
     * could see an invented GROUP and not an invented READING while claiming both.
     *
     * The field is mandatory now, so there is no unspecified state to skip.
     */
    const outcomeOf = (expected: { canonical: string; alternatives: string[]; leadMayBeAny?: boolean }[]) =>
      scoreUtterance({ spoken: 'Timothy one seven', expected }).outcome;

    // The real group is ['1 Timothy 1:7', '2 Timothy 1:7'].
    // 1. An undeclared reading BEHIND a correct lead.
    expect(outcomeOf([{ canonical: '1 Timothy 1:7', alternatives: [] }])).toBe('misleading-top');
    // 2. An undeclared reading LEADING, with the canonical behind it.
    expect(outcomeOf([{ canonical: '2 Timothy 1:7', alternatives: [] }])).toBe('misleading-top');
    // 3/4. A declared reading absent, and an undeclared one present.
    expect(outcomeOf([{ canonical: '1 Timothy 1:7', alternatives: ['3 John 1:7'] }])).toBe('misleading-top');
    expect(
      outcomeOf([{ canonical: '1 Timothy 1:7', alternatives: ['2 Timothy 1:7', '3 John 1:7'] }])
    ).toBe('misleading-top');
    // 5. A declared alternative leading is a ranking miss, not a fabrication.
    expect(outcomeOf([{ canonical: '2 Timothy 1:7', alternatives: ['1 Timothy 1:7'] }])).toBe('offered');
    // 6. Unless the transcript genuinely cannot decide which should lead.
    expect(
      outcomeOf([{ canonical: '2 Timothy 1:7', alternatives: ['1 Timothy 1:7'], leadMayBeAny: true }])
    ).toBe('exact');

    // And the check applies to an unambiguous group too, not only a declared-plural one.
    expect(
      scoreUtterance({
        spoken: 'John three sixteen',
        expected: [{ canonical: 'John 3:16', alternatives: ['Romans 8:28'] }]
      }).outcome,
      'a declared reading that is never offered must fail'
    ).toBe('misleading-top');
  });

  it('holds a group to exactly the readings the case declares', () => {
    /**
     * `alternatives` used to be consulted only to excuse a wrong leading candidate,
     * so it could widen acceptance and never restrict it: deleting it changed
     * nothing, and padding it with fabricated entries changed nothing. It is now the
     * place a fabricated READING is caught.
     */
    const declared = scoreUtterance({
      spoken: 'Timothy one seven',
      expected: [{ canonical: '1 Timothy 1:7', alternatives: ['2 Timothy 1:7'], leadMayBeAny: true }]
    });
    expect(declared.outcome).toBe('exact');

    // A reading offered that the case never declared.
    expect(
      scoreUtterance({ spoken: 'Timothy one seven', expected: [{ canonical: '1 Timothy 1:7', alternatives: [] }] })
        .outcome
    ).toBe('misleading-top');

    // A reading declared that is never offered — a padded expectation must fail too.
    expect(
      scoreUtterance({
        spoken: 'John three sixteen',
        expected: [{ canonical: 'John 3:16', alternatives: ['Romans 8:28'] }]
      }).outcome
    ).toBe('misleading-top');
  });

  it('does not record a ranking choice as speaker intent', () => {
    /**
     * A listener hearing bare "Timothy one seven" cannot prefer 1 or 2 Timothy, so
     * either may lead. Without `leadMayBeAny` the corpus would certify the parser's
     * own sibling ordering as what the speaker meant.
     */
    const either = (canonical: string) =>
      scoreUtterance({
        spoken: 'Timothy one seven',
        expected: [
          {
            canonical,
            alternatives: [canonical === '1 Timothy 1:7' ? '2 Timothy 1:7' : '1 Timothy 1:7'],
            leadMayBeAny: true
          }
        ]
      }).outcome;
    expect(either('1 Timothy 1:7')).toBe('exact');
    expect(either('2 Timothy 1:7')).toBe('exact');

    // But an undecidable lead is not a licence for any passage at all.
    expect(
      scoreUtterance({
        spoken: 'Timothy one seven',
        expected: [{ canonical: 'Romans 8:1', alternatives: ['Titus 1:7'], leadMayBeAny: true }]
      }).outcome
    ).toBe('misleading-top');
  });

  it('scores an empty expectation exactly like null', () => {
    // They mean the same thing and diverged once, so a correct refusal scored zero.
    for (const expected of [null, [] as never[]]) {
      const score = scoreCorpus([{ spoken: 'good morning church', expected }]);
      expect(score.correct, JSON.stringify(expected)).toBe(1);
      expect(score.correctRate).toBe(1);
      expect(score.refused).toBe(1);

      // And it must not be counted among the cases that DO name a passage, or it
      // silently enlarges the denominator of every per-reference rate.
      const mixed = scoreCorpus([
        { spoken: 'John three sixteen', expected: [{ canonical: 'John 3:16', alternatives: [] }] },
        { spoken: 'good morning church', expected }
      ]);
      expect(mixed.exactRate, JSON.stringify(expected)).toBe(1);
      expect(mixed.reachableRate).toBe(1);
    }
  });

  it('reports `offered` when a named passage is present but not leading', () => {
    /**
     * `offered` and `reachable` had no test at all, so several fields could be
     * rewired without the suite noticing.
     */
    const scored = scoreUtterance({
      spoken: 'Timothy one seven',
      expected: [{ canonical: '2 Timothy 1:7', alternatives: ['1 Timothy 1:7'] }]
    });
    expect(scored.outcome).toBe('offered');
    expect(scored.missing).toEqual([]);

    const score = scoreCorpus([scored]);
    expect(score.offered).toBe(1);
    expect(score.exact).toBe(0);
    // Reachable but not exact — that is the whole point of the distinction.
    expect(score.reachableRate).toBe(1);
    expect(score.exactRate).toBe(0);
  });

  it('separates reachable from exact, and excludes what cannot be reached', () => {
    const mixed = scoreCorpus([
      { spoken: 'John three sixteen', expected: [{ canonical: 'John 3:16', alternatives: [] }] },
      { spoken: 'Timothy one seven', expected: [{ canonical: '2 Timothy 1:7', alternatives: ['1 Timothy 1:7'] }] },
      { spoken: 'John', expected: [{ canonical: 'John 3:16', alternatives: [] }] }
    ]);
    expect(mixed.exactRate).toBeCloseTo(1 / 3, 5);
    expect(mixed.reachableRate).toBeCloseTo(2 / 3, 5);
  });

  it('lists the cases behind a non-zero misleading rate', () => {
    // Asserting only that the list is EMPTY on a clean corpus let it be hardcoded.
    const score = scoreCorpus([
      { spoken: 'John three sixteen', expected: [{ canonical: 'Romans 8:28', alternatives: [] }] },
      { spoken: 'John three sixteen', expected: [{ canonical: 'John 3:16', alternatives: [] }] }
    ]);
    expect(score.misleadingTop).toBe(1);
    expect(score.misleadingCases).toHaveLength(1);
    expect(score.misleadingCases[0].tops).toEqual(['John 3:16']);
    expect(score.misleadingTopRate).toBe(0.5);
  });

  it('treats any passage for a no-reference utterance as a wrong leading candidate', () => {
    expect(outcome('John three sixteen', null)).toBe('misleading-top');
    expect(outcome('good morning church', null)).toBe('refused');
  });

  it('scores refusals against the right denominator', () => {
    const score = scoreCorpus([
      { spoken: 'John three sixteen', expected: [{ canonical: 'John 3:16', alternatives: [] }] },
      { spoken: 'good morning church', expected: null }
    ]);
    expect(score.correct).toBe(2);
    expect(score.correctRate).toBe(1);
    expect(score.exactRate).toBe(1);

    // The symmetric error: a refusal is only correct when nothing was named.
    const missed = scoreCorpus([
      { spoken: 'John', expected: [{ canonical: 'John 3:16', alternatives: [] }] },
      { spoken: 'good morning church', expected: null }
    ]);
    expect(missed.refused).toBe(2);
    expect(missed.correct, 'a refused real reference is not correct').toBe(1);
    expect(missed.correctRate).toBe(0.5);

    // The degenerate case a naive metric would reward: resolve nothing, ever.
    const silent = scoreCorpus([
      { spoken: 'John', expected: [{ canonical: 'John 3:16', alternatives: [] }] },
      { spoken: 'Romans', expected: [{ canonical: 'Romans 8:1', alternatives: [] }] }
    ]);
    expect(silent.correct).toBe(0);
    expect(silent.correctRate).toBe(0);
  });
});

describe('the scoring rule, on group shapes the parser cannot currently produce', () => {
  /**
   * Exercised directly, because two branches were unreachable through the parser and
   * could be deleted with the suite staying green. A rule that is only ever tested on
   * the inputs one caller happens to emit is untested for everything else, and this
   * rule exists to catch outputs that do not exist yet.
   */
  const only = (canonical: string) => ({ canonical, alternatives: [] });

  it('catches a declared reading sitting in the WRONG group', () => {
    // Both readings are declared somewhere, so the position-independent check passes
    // and only the per-group comparison can see this.
    expect(classifyGroups([['A', 'B'], ['B']], [only('A'), only('B')])).toBe('misleading-top');
    expect(classifyGroups([['A'], ['B']], [only('A'), only('B')])).toBe('exact');
  });

  it('catches a duplicated group of otherwise legitimate readings', () => {
    expect(classifyGroups([['A'], ['A']], [only('A')])).toBe('misleading-top');
    expect(classifyGroups([['A'], ['B']], [only('A')])).toBe('misleading-top');
  });

  it('separates every outcome on synthetic shapes', () => {
    expect(classifyGroups([], [only('A')])).toBe('refused');
    expect(classifyGroups([], [])).toBe('refused');
    expect(classifyGroups([['A']], [])).toBe('misleading-top');
    expect(classifyGroups([['Z']], [only('A')])).toBe('misleading-top');
    expect(classifyGroups([['B'], ['A']], [only('A'), only('B')])).toBe('out-of-order');
    expect(classifyGroups([['A', 'B']], [only('A'), only('B')])).toBe('mis-grouped');
    expect(classifyGroups([['A']], [only('A'), only('B')])).toBe('incomplete');
    expect(classifyGroups([['B', 'A']], [{ canonical: 'A', alternatives: ['B'] }])).toBe('offered');
    expect(classifyGroups([['B', 'A']], [{ canonical: 'A', alternatives: ['B'], leadMayBeAny: true }])).toBe(
      'exact'
    );
  });

  it('requires the declared set exactly, in both directions', () => {
    expect(classifyGroups([['A', 'B']], [only('A')])).toBe('misleading-top'); // undeclared present
    expect(classifyGroups([['A']], [{ canonical: 'A', alternatives: ['B'] }])).toBe('misleading-top'); // declared absent
    expect(classifyGroups([['A', 'B']], [{ canonical: 'A', alternatives: ['B'] }])).toBe('exact');
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

  it('declares ambiguity as ambiguity, so ranking is not recorded as intent', () => {
    /**
     * Structural, because the values alone cannot show it: dropping `leadMayBeAny`
     * leaves the corpus passing while quietly asserting that the parser's sibling
     * ordering is what the speaker meant.
     */
    for (const testCase of CORPUS_GROUPS['ambiguous families']) {
      const ambiguous = (testCase.expected ?? []).filter((item) => (item.alternatives ?? []).length > 0);
      expect(ambiguous.length, testCase.spoken).toBeGreaterThan(0);
      for (const item of ambiguous) {
        expect(item.leadMayBeAny, `${testCase.spoken}: ${item.canonical}`).toBe(true);
      }
    }
  });

  it('declares a reading set for every expectation in the corpus', () => {
    // Structural: `alternatives` is required by the type, but a corpus could still
    // drift to declaring `[]` everywhere and stop exercising the multi-reading path.
    const multiReading = SERVICE_CORPUS.flatMap((testCase) => testCase.expected ?? []).filter(
      (item) => item.alternatives.length > 0
    );
    expect(multiReading.length).toBeGreaterThan(0);
    for (const testCase of SERVICE_CORPUS) {
      for (const item of testCase.expected ?? []) {
        expect(Array.isArray(item.alternatives), `${testCase.spoken}: ${item.canonical}`).toBe(true);
      }
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
  // Kept modest so the suite stays interactive; the documented table uses 100.
  const SEEDS = 40;

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

  it('attributes by position, not by membership', () => {
    /**
     * The failure the documentation uses as its example. Diffing the two word lists
     * compares MEMBERSHIP, so corrupting the second `eight` in "twenty eight" was
     * invisible because the first `eight` survived — and the flagship case
     * attributed nothing at all.
     */
    const corruption = corruptTranscriptDetailed('let us read Romans eight twenty eight', 0.3, 2);
    expect(corruption.text).toBe('let us read Romans eight twenty ate');
    expect(corruption.changed).toEqual(['eight']);
    expect(scoreUtterance({ spoken: corruption.text, expected: [{ canonical: 'Romans 8:28', alternatives: [] }] }).tops).toEqual([
      'Romans 8:20'
    ]);

    /**
     * Scored on that ONE case, so the membership bug cannot be masked by other
     * utterances where the same word happens to be unique. A diff-based attribution
     * returns nothing at all here.
     */
    const single = SERVICE_CORPUS.filter((testCase) => testCase.spoken === 'let us read Romans eight twenty eight');
    expect(single).toHaveLength(1);

    /**
     * Seeds 1-2 at 0.2 corrupt only the SECOND `eight`, so a copy of the word
     * survives in the sentence. A membership diff therefore reports that nothing
     * changed and attributes nothing — while the outcome is a wrong passage.
     */
    const blind = corruptTranscriptDetailed(single[0].spoken, 0.2, 2);
    expect(blind.text).toBe('let us read Romans eight twenty ate');
    expect(blind.text.split(' ')).toContain('eight'); // a copy survives
    expect(blind.changed).toEqual(['eight']);
    expect(misleadingTokens(single, 0.2, 2)).toEqual([{ token: 'eight', count: 1 }]);

    const tokens = misleadingTokens(SERVICE_CORPUS, 0.3, 15);
    expect(tokens.length).toBeGreaterThan(3);
    expect(tokens.map((entry) => entry.token)).toContain('eight');
  });

  it('separates how often a token is involved from whether it is to blame', () => {
    /**
     * `misleadingTokens` counts involvement, and several words are usually corrupted
     * in the same run — so a merely COMMON word can outrank a decisive one. `and` is
     * a function word and ranks near the top for that reason alone. Corrupting one
     * position at a time is what actually establishes responsibility.
     */
    const causal = singleTokenCulprits(SERVICE_CORPUS);
    expect(causal.length).toBeGreaterThan(3);
    /**
     * What flips an outcome alone is a number word, or `and` — which is not noise
     * here: it is the token separating a verse list from a second reference, so
     * corrupting it changes how many passages were heard.
     */
    const referenceCritical = ['one', 'two', 'three', 'six', 'eight', 'nine', 'ten', 'and'];
    expect(referenceCritical).toContain(causal[0].token);
    // Every culprit must be a word the corruption model can actually change.
    for (const { token } of causal) {
      expect(corruptWord(token), `${token} is not corruptible`).not.toBe(token);
    }

    /**
     * And it must be selective: only positions whose corruption actually flips the
     * outcome count. Without that filter every corruptible position is tallied, and
     * the list stops meaning "responsible" — it becomes an inventory of the
     * corruption model.
     */
    let corruptible = 0;
    for (const testCase of SERVICE_CORPUS) {
      for (const word of testCase.spoken.split(/\s+/)) if (corruptWord(word) !== word) corruptible += 1;
    }
    const culpritPositions = causal.reduce((sum, entry) => sum + entry.count, 0);
    expect(culpritPositions).toBeGreaterThan(0);
    expect(culpritPositions, 'a culprit list this large is just the corruption model').toBeLessThan(
      corruptible / 3
    );
    /**
     * Words with no reference role at all must never be culprits. `and`, `to` and
     * `of` are deliberately NOT on this list even though they are function words —
     * `and` separates a verse list from a second reference, `to` marks a verse range,
     * and `of` carries "the third chapter OF Romans". Corrupting those genuinely
     * changes which passage was named, which is the distinction the list should draw.
     */
    for (const { token } of causal) {
      expect(['the', 'a', 'me', 'with', 'my', 'is', 'it', 'us', 'read', 'let']).not.toContain(token);
    }
  });

  it('reports the safe outcomes per seed, not just the failures', () => {
    // meanExact / meanRefused / minWer had no assertion, so they could be rewired.
    const clean = measureSensitivity(SERVICE_CORPUS, 0, 3);
    expect(clean.meanExact).toBe(scoreCorpus(SERVICE_CORPUS).exact);
    expect(clean.meanRefused).toBe(scoreCorpus(SERVICE_CORPUS).refused);
    expect(clean.minWer).toBe(0);
    expect(clean.maxWer).toBe(0);

    const noisy = measureSensitivity(SERVICE_CORPUS, 0.5, 10);
    expect(noisy.meanExact).toBeLessThan(clean.meanExact);
    expect(noisy.minWer).toBeGreaterThan(0);
    expect(noisy.minWer).toBeLessThan(noisy.maxWer);
  });

  it('counts a seed with exactly one failure', () => {
    /**
     * The share is over seeds with AT LEAST ONE misleading top. A boundary of "more
     * than one" would silently drop the single-failure seeds, which at low injection
     * rates are most of them.
     */
    const point = measureSensitivity(SERVICE_CORPUS, 0.05, SEEDS);
    const perSeed = Array.from({ length: SEEDS }, (_, index) => index + 1).map((seed) => {
      const corrupted = SERVICE_CORPUS.map((testCase) => ({
        ...testCase,
        spoken: corruptTranscript(testCase.spoken, 0.05, seed)
      }));
      return scoreCorpus(corrupted).misleadingTop;
    });
    const exactlyOne = perSeed.filter((count) => count === 1).length;
    const atLeastOne = perSeed.filter((count) => count >= 1).length;
    expect(exactlyOne, 'this rate must produce single-failure seeds to be a real test').toBeGreaterThan(0);
    // Exactly the seeds with at least one — not "more than one", which would drop
    // every single-failure seed, and at low rates those are most of them.
    expect(Math.round(point.seedsWithMisleadingShare * SEEDS)).toBe(atLeastOne);
  });

  it('models deletions as well as substitutions', () => {
    // The documented model is confusions AND function-word deletion; only the first
    // was pinned, so the deletion branch could be removed unnoticed.
    const deleted = corruptTranscriptDetailed('turn with me to the book of John three sixteen', 1, 3);
    expect(deleted.text.split(' ').length).toBeLessThan(10);
    expect(deleted.changed).toContain('the');
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
