import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  characterErrorRate,
  corpusErrorRate,
  tokeniseWords,
  wordErrorRate
} from './transcriptMetrics';
import { corruptTranscript, scoreCorpus, scoreUtterance } from './referenceOutcome';
import { CORPUS_GROUPS, SERVICE_CORPUS } from './serviceCorpus';

describe('error rates match the published definition', () => {
  it('counts substitutions, deletions and insertions separately', () => {
    expect(wordErrorRate('john three sixteen', 'john three sixteen')).toMatchObject({
      rate: 0,
      substitutions: 0,
      deletions: 0,
      insertions: 0
    });
    // One substitution in three words.
    expect(wordErrorRate('john three sixteen', 'john free sixteen')).toMatchObject({
      substitutions: 1,
      deletions: 0,
      insertions: 0,
      referenceLength: 3
    });
    expect(wordErrorRate('john three sixteen', 'john sixteen')).toMatchObject({ deletions: 1 });
    expect(wordErrorRate('john three sixteen', 'john three sixteen amen')).toMatchObject({ insertions: 1 });
  });

  it('normalises case and punctuation, because a recogniser is not being judged on commas', () => {
    expect(wordErrorRate('John 3:16, for God so loved', 'john 3:16 for god so loved').rate).toBe(0);
    expect(tokeniseWords('  Turn—please—to John.  ')).toEqual(['turn', 'please', 'to', 'john']);
  });

  it('does not silently score a hallucination against silence as perfect', () => {
    /**
     * An empty reference is a divide by zero. Returning 0 would flatter a provider
     * that invented words during silence — the exact failure that puts an unasked-for
     * passage in front of an operator.
     */
    expect(wordErrorRate('', 'jesus fed five thousand').rate).toBe(1);
    expect(wordErrorRate('', '').rate).toBe(0);
  });

  it('measures characters as well, for languages where word boundaries are unreliable', () => {
    expect(characterErrorRate('john', 'john').rate).toBe(0);
    expect(characterErrorRate('john', 'jahn')).toMatchObject({ substitutions: 1, referenceLength: 4 });
  });

  it('pools a corpus by total errors, not by averaging per-utterance rates', () => {
    /**
     * Averaging rates weights a three-word utterance the same as a thirty-word one,
     * which is how a provider that fails only on short commands posts a good number.
     */
    const pairs = [
      { reference: 'a b c d e f g h i j', hypothesis: 'a b c d e f g h i j' }, // 0/10
      { reference: 'john three', hypothesis: 'mark four' } // 2/2
    ];
    const pooled = corpusErrorRate(pairs);
    expect(pooled.referenceLength).toBe(12);
    expect(pooled.rate).toBeCloseTo(2 / 12, 5);
    // The mean of the two rates would be 0.5 — three times higher, and wrong.
    expect(pooled.rate).toBeLessThan(0.5);
  });
});

describe('a wrong passage and a refusal are not the same failure', () => {
  it('separates the four outcomes', () => {
    expect(scoreUtterance({ spoken: 'John three sixteen', expected: 'John 3:16' }).outcome).toBe('exact');
    expect(scoreUtterance({ spoken: 'good morning church', expected: null }).outcome).toBe('refused');
    // Present but not first.
    const timothy = scoreUtterance({ spoken: 'Timothy one seven', expected: '2 Timothy 1:7' });
    expect(timothy.outcome).toBe('offered');
    expect(timothy.rank).toBeGreaterThan(0);
    // A different, real passage leading — the one that can reach a congregation.
    const wrong = scoreUtterance({ spoken: 'John three sixteen', expected: 'Romans 8:28' });
    expect(wrong.outcome).toBe('harmful');
  });

  it('treats resolving anything for a non-reference utterance as harmful', () => {
    /**
     * Scored the other way round on purpose. If the preacher says "Jesus fed five
     * thousand" and a passage appears, the operator is being offered scripture that
     * was never asked for — a wrong answer, not a missing one.
     */
    const invented = scoreUtterance({ spoken: 'John three sixteen', expected: null });
    expect(invented.outcome).toBe('harmful');
  });

  it('scores refusals against the right denominator', () => {
    /**
     * A corpus mixes two questions. Counting a correct refusal as a non-exact miss
     * drags the headline down for behaviour that is exactly right — the misleading
     * aggregate this module exists to avoid.
     */
    const score = scoreCorpus([
      { spoken: 'John three sixteen', expected: 'John 3:16' },
      { spoken: 'good morning church', expected: null }
    ]);
    expect(score.correct).toBe(2);
    expect(score.correctRate).toBe(1);
    // exactRate is over the cases that name a passage — one of them — not over both.
    expect(score.exactRate).toBe(1);
    expect(score.harmful).toBe(0);

    /**
     * And the symmetric error: a refusal is only correct when nothing was named.
     * Crediting every refusal turns a recogniser that resolves NOTHING into a
     * perfect score, which is the most flattering lie this metric could tell.
     */
    const missed = scoreCorpus([
      { spoken: 'John', expected: 'John 3:16' }, // a real reference, not resolved
      { spoken: 'good morning church', expected: null }
    ]);
    expect(missed.refused).toBe(2);
    expect(missed.correct, 'a refused real reference is not correct').toBe(1);
    expect(missed.correctRate).toBe(0.5);
    expect(missed.exactRate).toBe(0);

    // The degenerate case the mutation would reward: resolve nothing, ever.
    const silent = scoreCorpus([
      { spoken: 'John', expected: 'John 3:16' },
      { spoken: 'Romans', expected: 'Romans 8:1' }
    ]);
    expect(silent.correct).toBe(0);
    expect(silent.correctRate).toBe(0);
  });
});

describe('the service corpus, on clean transcripts', () => {
  const score = scoreCorpus(SERVICE_CORPUS);

  it('never offers a wrong passage', () => {
    // The release gate. Not "low" — zero.
    expect(score.harmfulCases.map((c) => `${c.spoken} -> ${c.top}`)).toEqual([]);
    expect(score.harmfulRate).toBe(0);
  });

  it('resolves every reference that was actually spoken', () => {
    expect(score.correct).toBe(score.total);
    expect(score.exactRate).toBe(1);
  });

  it('refuses every utterance that names no passage', () => {
    const noReference = score.scored.filter((item) => item.expected === null);
    expect(noReference.length).toBeGreaterThan(8);
    for (const item of noReference) {
      expect(item.top, `"${item.spoken}" must resolve nothing`).toBeNull();
    }
  });

  it('holds in every group, so a strong group cannot hide a weak one', () => {
    for (const [name, cases] of Object.entries(CORPUS_GROUPS)) {
      const group = scoreCorpus(cases);
      expect(group.harmful, `${name} produced a wrong passage`).toBe(0);
      expect(group.correct, `${name}`).toBe(group.total);
    }
  });

  it('covers Ghanaian-English and code-switched framing', () => {
    // Presence anchor: if the corpus is gutted, these assertions must not pass vacuously.
    expect(SERVICE_CORPUS.length).toBeGreaterThanOrEqual(40);
    expect(CORPUS_GROUPS['code-switched framing'].length).toBeGreaterThanOrEqual(5);
    expect(CORPUS_GROUPS['quoted and narrative numbers'].length).toBeGreaterThanOrEqual(8);
  });
});

describe('how reference accuracy degrades as a recogniser gets worse', () => {
  /**
   * The point of the whole harness: establish, BEFORE any model is installed,
   * whether transcription errors turn into refusals (safe) or into wrong passages
   * (not safe) — and at what error rate that starts. This is a property of our
   * parser, measurable today with no audio.
   */
  const curve = [0, 0.05, 0.1, 0.2, 0.3, 0.5].map((injected) => {
    const corrupted = SERVICE_CORPUS.map((testCase) => ({
      ...testCase,
      spoken: corruptTranscript(testCase.spoken, injected, 7)
    }));
    const wer = corpusErrorRate(
      SERVICE_CORPUS.map((testCase, index) => ({
        reference: testCase.spoken,
        hypothesis: corrupted[index].spoken
      }))
    );
    return { injected, wer: wer.rate, score: scoreCorpus(corrupted) };
  });

  it('is deterministic — the same seed gives the same corpus', () => {
    expect(corruptTranscript('John three sixteen and Romans eight one', 0.5, 7)).toBe(
      corruptTranscript('John three sixteen and Romans eight one', 0.5, 7)
    );
    expect(corruptTranscript('John three sixteen', 0.5, 7)).not.toBe(
      corruptTranscript('John three sixteen', 0.5, 99)
    );
  });

  it('gives every utterance its own corruption, or the curve measures nothing', () => {
    /**
     * One shared roll sequence hit the same word positions in every utterance, so
     * the measured error rate sat flat across three different injection rates.
     */
    const rates = curve.map((point) => point.wer);
    expect(new Set(rates).size, 'error rate must actually vary with injection').toBe(rates.length);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i], `wer must rise from ${rates[i - 1]}`).toBeGreaterThan(rates[i - 1]);
    }
  });

  it('is clean at zero and produces wrong passages well before a "good" error rate', () => {
    expect(curve[0].wer).toBe(0);
    expect(curve[0].score.harmful).toBe(0);

    // The decision-relevant fact, asserted rather than left in a document: harmful
    // outcomes appear at a single-digit word error rate.
    const firstHarmful = curve.find((point) => point.score.harmful > 0);
    expect(firstHarmful, 'corruption must eventually produce a wrong passage').toBeDefined();
    expect(firstHarmful!.wer).toBeLessThan(0.15);

    // And they get worse, not better, as transcription degrades.
    expect(curve[curve.length - 1].score.harmful).toBeGreaterThan(firstHarmful!.score.harmful);
  });

  it('keeps refusing the utterances that name no passage, even when garbled', () => {
    // Degradation must not invent references out of narrative numbers.
    const garbled = CORPUS_GROUPS['should refuse'].map((testCase) => ({
      ...testCase,
      spoken: corruptTranscript(testCase.spoken, 0.5, 7)
    }));
    expect(scoreCorpus(garbled).harmful).toBe(0);
  });
});

describe('no provider, no audio, no credentials enter the harness', () => {
  it('has none of them in code', () => {
    for (const file of [
      'src/lib/asr/transcriptMetrics.ts',
      'src/lib/asr/referenceOutcome.ts',
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
    // The corpus is hand-written text. Recordings are governed by rules in
    // docs/ASR_EVALUATION.md and never enter the repository.
    const corpus = readFileSync('src/lib/asr/serviceCorpus.ts', 'utf8');
    expect(corpus).not.toMatch(/\.(wav|mp3|flac|m4a|ogg|safetensors|bin|onnx|gguf)\b/);
  });
});
