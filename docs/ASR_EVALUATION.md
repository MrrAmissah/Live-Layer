# Speech recognition: evaluation, and what would have to be true

**Status: evaluated, remediated, and now built as a reviewed assist — not as a
validated one.** §5 is the original benchmark, which stopped the work. §9 is the
targeted remediation and its measurements. §6 carries the current gate decision.

The candidate model has been downloaded and run locally on the production Mac, into
a cache outside this repository. No weights, no audio and no transcripts are
committed; the harness that produced the numbers is, at `scripts/asr-benchmark/`.

**The short version, in three steps.**

Stage 5 measured the pipeline and stopped it: on the most favourable audio
available, the assistant was fully correct for about a third of utterances and
offered a *confidently wrong passage* for about another third, with a 15.6-second
latency to final. Two blockers, one of them a safety failure.

Two **integration** blockers were ours rather than the model's. The wrong passages
came from the spoken parser reading the **typed** abbreviation table — `jon` is a
declared alias of Jonah, so a recogniser's rendering of "John" produced Jonah 3:16.
The latency came from buffering fixed windows rather than detecting when the speaker
stopped. Fixing those, measured against an 83-case corpus frozen beforehand:

| like-for-like | before | after |
| --- | --- | --- |
| misleading-top, same Stage 5 transcripts | 34.0% | **3.8%** |
| misleading-top, held-out end-to-end | 12.0% | **3.6%** |
| latency to final | 15.6 s | **0.649 s** |

**DONDO itself still has substantial acoustic limits.** It mangles less common book
names badly, and those **refuse** rather than err — roughly 60% of named passages
return nothing under degraded audio. The assistant is now safe and modestly useful:
it says nothing far more often than it says something wrong.

That is enough to justify **building** the reviewed assist for real-world
validation. It is not enough to trust it: **Gate A remains NOT CLEARED**, because
criterion 3 is unestablished and 4 and 6 have no evidence.

This document records what the candidate model claims, what our own harness
measures, the architecture a live recogniser fits behind, what the benchmark found,
what the remediation changed, and what is still unknown.

It is one document on purpose. Speech is the easiest place in this project to
accumulate confident planning prose about software that does not exist.

---

## 1. Why the obvious metric is the wrong one

DONDO reports word error rate. WER is the right number for comparing recognisers and
the wrong number for deciding whether this feature is safe, because the two failures
it averages together are not comparable:

| Outcome | What the operator sees | Cost |
| --- | --- | --- |
| **Refused** | An honest failure — no book found, no chapter or verse heard, or a passage that does not exist | They type the reference. A moment lost. |
| **Misleading-top** | A real, plausible passage that is **not** the one named, offered first | A wrong answer presented first. It reaches air only if the operator accepts it unread. |

The metric is called `misleading-top`, not "harmful", because the name has to be
accurate about what happened. Nothing here airs on its own: the shipped flow is
transcript → candidates → retrieval → **operator reads the passage text** → accepts
into the draft → a separate **Take**. A wrong leading candidate is a wrong answer at
the top of a list, not scripture on a screen.

That distinction sets two different bars, and §6 keeps them apart.

A transcript can be badly wrong overall and still produce the right passage when the
errors fall outside the reference; it can be barely wrong and produce the wrong
passage when the single error lands on a verse number — `twenty eight` heard as
`twenty ate` is `Romans 8:20` instead of `Romans 8:28`, and both exist. Aggregate WER
cannot see that difference, because it weights every word the same.

So the harness measures **reference outcome**, not transcription accuracy.

It scores against **every reference the utterance named, in order, and every reading
offered for each of them**, using the parser's groups rather than a flat candidate
list — only the grouping distinguishes *two passages* from *two readings of one
passage*.

Each expectation declares its complete reading set, `[]` meaning "the canonical
alone". Two earlier versions were weaker and both were wrong in the same way: one
expected a single canonical string, so multi-reference cases were vacuous after the
first passage; the next made the reading set optional, so an ordinary expectation
declared nothing and a fabricated reading beside the right one scored `exact`. The
harness could see an invented *group* and not an invented *reading*, while claiming
both were checked.

Outcomes: `exact`, `offered` (a declared alternative leads — a ranking miss),
`out-of-order`, `incomplete`, `mis-grouped` (two passages packed into one group),
`refused`, and `misleading-top`. The rule is also exported as `classifyGroups` and
tested on group shapes the parser cannot currently produce, because a rule tested only
on today's outputs is untested for the outputs it exists to catch.

Code: `src/lib/asr/referenceOutcome.ts`, `transcriptMetrics.ts`, `sensitivity.ts`,
`serviceCorpus.ts`. Tests: `src/lib/asr/asrEvaluation.test.ts`. It runs in the
ordinary suite with no audio and no model.

---

## 2. What the parser does with transcripts (no model)

> This section predates the benchmark and measures the **parser alone**, against
> transcripts corrupted by a synthetic model of ASR error. §5 later ran the same
> corpus through a real recogniser, and the two disagree about *which words break* —
> see §5.3. The disagreement is the most useful thing in this document, so both are
> kept.

A 53-utterance corpus of how references are spoken from a pulpit — complete
references, Ghanaian-English and Twi/Ga code-switched framing, quoted numbers
mid-sermon, several references in one breath, ambiguous book families, and utterances
that must resolve nothing.

**It is hand-authored representative test material, not observed real-service
speech.** No recordings and no transcripts of real services are in this repository
(§7). The Twi and Ga words appear as *framing around English references* — "medaase,
now turn to Luke four eighteen" — which exercises the parser's tolerance of
non-English words nearby. **It is not a Twi or Ga ASR benchmark**, and nothing here
measures recognition of a reference spoken in a Ghanaian language; that needs a
native-speaker corpus and a per-language number grammar.

**On clean transcripts: 53/53 correct, 0 misleading-top.**

| Group | Correct | Misleading-top |
| --- | --- | --- |
| Complete references | 18/18 | 0 |
| Code-switched framing | 7/7 | 0 |
| Quoted / narrative numbers | 11/11 | 0 |
| Multiple references (every passage checked) | 10/10 | 0 |
| Ambiguous families | 2/2 | 0 |
| Should refuse | 5/5 | 0 |

Then the same corpus corrupted with a fixed dictionary of English ASR confusions and
function-word deletions, **over 100 deterministic seeds per injection level**, to
characterise how this parser behaves as transcription degrades:

| Injected | Median WER (min–max) | Seeds with ≥1 misleading-top | Mean | Worst | Mean exact | Mean refused |
| --- | --- | --- | --- | --- | --- | --- |
| 0% | 0.0% (0.0–0.0) | **0%** | 0.00 | 0 | 42.0 | 11.0 |
| 5% | 1.9% (0.3–4.0) | **63%** | 0.94 | 4 | 40.9 | 11.1 |
| 10% | 4.0% (1.3–6.1) | **92%** | 2.02 | 6 | 39.7 | 11.2 |
| 20% | 7.7% (4.3–10.9) | **99%** | 3.84 | 8 | 37.5 | 11.4 |
| 30% | 11.4% (7.4–14.9) | **100%** | 5.26 | 11 | 35.9 | 11.6 |
| 50% | 19.1% (14.9–23.7) | **100%** | 8.65 | 12 | 31.8 | 12.0 |

Produced with `measureSensitivity(SERVICE_CORPUS, rate, 100)`. It is fully seeded, so
the table reproduces exactly; the test suite runs a smaller seed count to stay
interactive.

Reported as a *share of seeds* rather than an average: if one run in a hundred
produces a wrong leading candidate, "0.01 mean" reads like nothing and "1% of runs"
reads like what it is. The spread between min and max at a single injection level is
also why one seed is not a result.

### Which tokens are actually to blame

Two different questions, and conflating them produced a misleading answer in an
earlier draft.

**Involvement** — words corrupted in runs that ended badly, at 30% over 100 seeds:
`eight` (171), `one` (146), `and` (133), `three` (120), `ten` (85), `nine` (50),
`six` (38), `two` (28). Several words are usually corrupted in the same run and all
of them are counted, so this is skewed by how *often* a word appears.

**Causation** — corrupt exactly one word position and see whether that alone flips the
outcome: `eight` (4), `one` (4), `and` (3), `ten` (3), `nine` (2), `three` (2),
`six` (1), `two` (1). Twenty positions across the whole corpus, out of 145 corruptible
ones. Every culprit is a number word except `and`, which matters because it separates
a verse list from a second reference.

The earlier draft reported only the involvement list, ranked `and` first, and called
them "the tokens responsible" — `and` led that ranking because it is corrupted
constantly, not because it is decisive.

### What this does and does not establish

**It establishes:** a small number of strategically placed transcript errors is enough
to make this parser return a plausible but wrong leading passage, and those errors
concentrate on number words. Refusals stay roughly flat while misleading tops climb,
so degradation does *not* fail safe by itself.

**It does not establish** anything about any speech provider. The word error rate above
comes from synthetic corruption of hand-written sentences; a published WER comes from
real recognition of real audio over that model's own test material. They share a name
and are not interchangeable, and the DONDO paper itself warns that its in-domain
figures should not be read as guarantees for other speech domains.

**And it got the failure mode wrong**, which §5.3 only discovered by running a real
model. The corruption model above concentrates on **number words**, because that is
what an English confusion dictionary corrupts — `eight` → `ate`. Real CTC output
corrupts **proper nouns**: `John` → `jon`, which resolves to Jonah. The conclusion
that a handful of errors is enough to produce a wrong leading passage survived
contact with the real recogniser. The account of *which* errors did not. A synthetic
error model can only contain the failures its author thought of, and this one is kept
here as a worked example of that limit rather than deleted.

### The conclusion

> **Published WER alone cannot justify unattended acceptance.** Synthetic corruption
> shows that even a low aggregate word error rate can contain reference-critical
> errors, because the errors that change a passage are concentrated in a small number
> of tokens. DONDO's actual position must be measured on real church audio using the
> reference-outcome harness, not inferred from either number.

This is why operator review is a requirement rather than a refinement, and it is the
product decision the rest of this document is built on.

**§5 has since measured DONDO on synthetic audio and this held up, harder than
expected.** The checkpoint's published English WER is 16.9%; measured here it was
21–29%, and the reference-outcome numbers were far worse than either figure suggests
— about a third of utterances produced a wrong leading passage. Real church audio is
still unmeasured (§7), so the sentence above stands as written.

---

## 3. DONDO: what the sources actually say

The **facts** below are from the paper, the Hugging Face organisation, and Khaya AI's
own pages. Where this document draws a conclusion from them — which checkpoint suits
our use, why English behaves as it does — it is marked as our reading, not the
paper's.

**Paper.** Azunre, P., Ibrahim, N., Budu, J., Adu-Gyamfi, L. *DONDO: Open w2v-BERT
Speech-Recognition Base Models for African Languages* (subtitle: *Democratizing Oral
Neural Dialect Ontology*). Khaya AI, 2026. arXiv:2607.21540. Contact `paul@khaya.ai`.
Funded by the Huniki Federation; the acknowledgements thank Ghana-NLP, Algorine
Research and Hugging Face. (Version and submission dates are deliberately not pinned
here — the listing and the manuscript carry different dates, and nothing in this
assessment turns on which.)

**What is released.** 21 monolingual and 5 regional multilingual models — 26
checkpoints — covering **27 African language varieties** across Ghana, Sierra Leone,
Nigeria, Senegal, Kenya and Zimbabwe. Published at `huggingface.co/KhayaAI` as
`w2v-bert-<code>`. Hugging Face reports **0.6B parameters**, F32, 16 kHz input.

**Licence.** **Apache-2.0**, attribution only, commercial use permitted. The paper is
explicit that this is intentional: "so that others may fine-tune them freely,
including for commercial use." There is no licence obstacle to using these for a
church, or for anything else.

**Architecture.** Fine-tunes the w2v-BERT 2.0 Conformer encoder (from Meta's Seamless
family) with a character/sub-word CTC head. Multilingual checkpoints are steered by
**prefix-frame language conditioning**: a one-hot language vector is mapped into the
feature dimension and prepended as a short block of frames before the audio. No
architectural change, no adapters — but **the caller must declare the language**. The
paper states robust automatic language identification is left to future work.

**Training data.** Predominantly **read speech from religious texts** with verified
transcripts, chosen because such recordings exist for many languages, are
licence-clear, and are orthographically consistent. Total hours are **not stated** in
the paper.

**Method.** Two-step learning-rate annealing (5e-5 coarse adaptation, then 5e-6), with
an optional third step at 5e-7 for the East/Southern African family.

### The model relevant to a Ghanaian service

`KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en` — Southern Ghana. WER (%), Step 2:

| | Avg | Eng | Adangme | Ewe | Fante | French | Ga | Nzema | As. Twi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Monolingual | — | 16.9 | 5.38 | 4.5 | 30.1 | 8.5 | 9.7 | 12.6 | 15.75 |
| Multilingual | **11.4** | 27.4 | 8.78 | 6.57 | 13.4 | 3.64 | 16.0 | 20.8 | 14.7 |

The `Avg` column is the paper's own figure and is not the mean of the eight cells
shown, which is higher — reproduce it from the paper rather than from this table.

**Our reading of this, not the paper's:** African English is the worst column in the
multilingual row at 27.4% (in the monolingual row Fante is worse, at 30.1), and
English is the language in which references are actually spoken at PPC. The
multilingual model is also worse at English than the monolingual `en` model at 16.9%.
The paper notes English is a shared column across every regional family; we take that
to mean the English monolingual checkpoint would be the better starting point for
reference recognition here, with a multilingual model relevant only if references are
spoken in Twi or Ga. That is an inference and would need measuring.

The model card's language ids are a **global** map, not per-model indices — Adangme 0,
Akuapem Twi 1, Asante Twi 2, Ewe 5, African English 6, Fante 7, French 8, Ga 9, Nzema
24. Any adapter must use the card's map rather than assuming `0..L-1`.

### Stated limitations, quoted in substance

The paper's own limitations section: models inherit the vocabulary, register and
prosody of read religious text and "may underperform on spontaneous, code-switched or
noisy speech until fine-tuned"; reported WERs are in-domain and "should not be read as
guarantees for other domains"; orthographic conventions vary across communities;
evaluation for the smallest languages rests on limited test sets; and the prefix
scheme requires the user to specify the target language.

Every one of those bites for our use case. A sermon is spontaneous, code-switched,
often noisy, and delivered in a room with a PA system.

### Not found in the sources reviewed

**No latency, real-time factor, or hardware benchmark was found in the official paper
or the model cards reviewed.** That is a statement about what was checked, not a claim
that no such figure exists anywhere. Either way we have no basis for a speed claim,
which is the whole reason for §5.

### Hosted alternative

Khaya AI offers hosted ASR via Khaya Studio (`khaya.ai`, `studio.khaya.ai/asr`) and
professional services for on-premises deployment. The landing page does not document
an API, keys, or pricing. **Out of scope here** — a hosted service means a network
dependency and a credential during a live service, which is the opposite of this
project's local-first constraint.

---

## 4. Where a recogniser would plug in

The boundary already exists and shipped in PR #26. Nothing about adopting a provider
requires reshaping the parser, the candidate model, or the Program path.

```
microphone ─▶ [ separate inference process ]  ─ HTTP/WS ─▶  LiveTranscriptSource
                 audio, model, tensors                       │  TranscriptEvent only
                 never in the browser                        ▼
                                                      transcriptStream reducer
                                                      (interim never parsed)
                                                             │ finalText
                                                             ▼
                                                      parseSpokenReference
                                                             │ candidates
                                                             ▼
                                                    operator reviews and accepts
                                                             │
                                                             ▼
                                                    Scripture draft ── Take ──▶ air
```

`TranscriptSource` (`src/lib/scripture/transcriptSource.ts`) is a discriminated union.
A provider implements `LiveTranscriptSource` and nothing else changes:

```ts
interface LiveTranscriptSource {
  isLive: true;
  start(): Promise<void>;
  stop(): void;
  isListening(): boolean;
  languages: LanguageTag[];
  language: LanguageTag;
  setLanguage(tag: LanguageTag): void;
  subscribe(onEvent: (event: TranscriptEvent) => void): () => void;
}
```

Only `TranscriptEvent` — `{ text, isFinal, segmentId, sequence, language, sourceId }` —
crosses the boundary. No audio, no tensors, no model handle, no credentials. The
`language` field and `setLanguage` exist precisely because DONDO's prefix conditioning
requires a declared language and cannot infer one; that constraint was designed into
the port before any provider was considered, and it is provider-neutral — a recogniser
with built-in language ID simply reports what it detected.

### Rules for the inference process

- **A separate process, not the browser.** A 0.6B-parameter encoder does not belong in
  a Browser Source that also has to composite graphics at frame rate. The browser holds
  the UI; the recogniser holds the model; they exchange text.
- **No model weights in Git.** Downloaded on first run to a local cache, ignored by
  version control, checksum recorded.
- **No hosted credential.** Local inference only. If a hosted service is ever
  considered, it is a separate decision with its own consent discussion.
- **The operator can always stop.** `stop()` must cut capture immediately, and the
  reducer already discards everything that arrives after it.
- **Degrade to typing.** If the process is not running, the workspace behaves exactly
  as it does today. The typed transcript path is the fallback, which is why it was
  built first and stays.

### What is deliberately NOT decided

The provider. DONDO is the leading candidate for Ghanaian languages on licence and
coverage grounds, but nothing here selects it, and the port is neutral by
construction. Whisper, a hosted service, or a future model can implement the same
interface.

---

## 5. The benchmark — run 2026-08-11

**Status: executed.** The machine is fast enough and the recognition is not accurate
enough. Those are separate findings and the rest of this section keeps them apart,
because conflating them is how a project ships a feature on the strength of the
number that happened to be good.

Harness: `scripts/asr-benchmark/`. Weights live outside the repository and no audio or
transcript is committed. `model.safetensors` SHA-256, per §4's checksum rule:

- `w2v-bert-en` — `88607df25ea73d475066b2f82025d8598d2f97ff9d29cfcf22b41c08eac0b9f2`
- `w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en` — `44b545d0b7779c63b3624c15e594190cbfd67adf28a57ec7118d6480eea41e3e`

| | |
| --- | --- |
| Machine | Apple M1 Pro, 8 cores, **16 GB**, macOS 26.2 |
| Software | Python 3.12.13 (arm64), torch 2.13.0, transformers 5.15.0 |
| Concurrent load | OBS 32.2.1 on scene `PPC · Live` at 1080p30 with the LiveLayer Browser Source rendering, plus the LiveLayer server and LAN relay |
| Checkpoints | `KhayaAI/w2v-bert-en` (0.6B, F32) — the subject of §5.1–§5.2; and `KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en`, measured in §5.3 |

The interpreter matters and is recorded on purpose: this machine also carries an
x86_64 Homebrew Python at `/usr/local/bin/python3`. Measuring under Rosetta would
have produced a plausible real-time factor with no Metal at all.

### 5.1 Real-time factor, backends and memory

`chunk` is the window fed to the model in one forward pass. Peak RSS is the peak of
the process that did the work — each measurement ran in its own subprocess so one
figure cannot hide behind another's.

| backend | clip | chunk | audio s | median RTF | worst RTF | peak RSS |
| --- | --- | --- | --- | --- | --- | --- |
| **mps/f32** | 10s | single shot | 12.7 | **0.038** | 0.038 | 458 MB |
| **mps/f32** | 30s | single shot | 32.2 | **0.052** | 0.054 | 381 MB |
| **mps/f32** | 30s | 15s | 32.2 | 0.037 | 0.038 | 454 MB |
| **mps/f32** | 120s | single shot | 120.3 | **aborted (SIGABRT)** | — | — |
| **mps/f32** | 120s | 30s | 120.3 | 0.047 | 0.048 | 501 MB |
| **mps/f32** | 120s | 15s | 120.3 | **0.037** | 0.037 | 490 MB |
| mps/f16 | 30s | single shot | 32.2 | 0.044 | 0.044 | 3782 MB |
| mps/f16 | 120s | single shot | 120.3 | **failed (exit 1)** | — | — |
| mps/f16 | 120s | 15s | 120.3 | 0.034 | 0.035 | 3782 MB |
| cpu/f32 | 10s | single shot | 12.7 | 0.185 | 0.215 | 2939 MB |
| cpu/f32 | 30s | single shot | 32.2 | 0.221 | 0.321 | 4301 MB |
| cpu/f32 | 120s | single shot | 120.3 | **terminated at 18 min, RTF ≥ 1.5** † | — | 3000 MB at 18 min |
| cpu/f32 | 120s | 30s | 120.3 | 0.234 | 0.236 | 4089 MB |

† **That row is a bound I stopped, not a crash.** The run was killed by hand after
18 minutes because it was consuming the time budget, so no completed figure exists.
The bound is still sound: warm-up plus 5 repeats is at most 6 × 120.3 s = 722 s of
audio, and 1110 s of wall clock had elapsed without finishing, so RTF ≥ 1110 ÷ 722 ≈
1.54. Slower than real time either way, which is all the stop condition needs.

**Metal is the backend.** MPS float32 runs at RTF 0.037–0.052 — roughly 20–27× faster
than real time — in about 0.5 GB (measured peak **501 MB**), while CPU is 5–8×
slower and needs 3–4 GB.

**Float16 is not worth taking.** It is marginally faster and costs 3.8 GB against
float32's 501 MB. The gap is a loading artefact rather than a model-size effect:
float32 weights are memory-mapped from `safetensors` and paged in lazily, while
casting to float16 materialises them. Either way the measured footprint is what the
machine pays, and float32 pays less.

**CoreML was not attempted.** `Wav2Vec2BertForCTC` has no CoreML conversion path in
this stack and building one is a project rather than a benchmark step. Recorded as
not tried, per this section's own rule, rather than reported as unavailable.

**A 120-second window cannot be processed in one pass on this machine, on any
backend.** Self-attention is quadratic in sequence length: MPS aborted, float16
errored, and CPU was still running after 18 minutes having processed at most 720
seconds of audio — an RTF of at least 1.5, slower than real time. Cost per audio
second is therefore *not* constant, and an RTF measured at 30 seconds does not
predict 120. Any deployment must chunk.

### 5.2 Latency to final — the number that actually constrains this

Real-time factor is not latency, and quoting the first as the second would be a false
claim. w2v-BERT + CTC is **not a streaming architecture**: it encodes a complete
window, so what the operator waits for is the window, not the model.

| approach | model time per window | **worst-case latency to final** | why |
| --- | --- | --- | --- |
| 15s chunks | ≈ 0.55 s | **≈ 15.6 s** | an utterance ending just after a boundary waits out the whole next window |
| 30s chunks | ≈ 1.40 s | **≈ 31.4 s** | as above |
| utterance-sized | 0.13 s | 0.13 s **+ endpointing delay** | needs voice-activity detection, which is **not built** |

Per-window figures are derived from the 120 s clip, which divides into whole windows
(4.407 s total over ~8 windows of 15 s; 5.625 s over ~4 windows of 30 s). The 30 s
clip would understate them, because its trailing window is a 2-second stub that costs
almost nothing.

Per-utterance inference on the 53 real utterances (median 2.45 s of audio) was a
median of **0.132 s**, p95 0.265 s, max 0.364 s on mps/float32.

So the model is fast and the *pipeline* is slow, and closing that gap is a
voice-activity-detection problem rather than a faster-model problem. Against §5's own
stop condition — "latency to final is longer than the preacher stays on the verse" —
a 15-second wait is at best marginal and 30 seconds plainly fails. Nothing here
measured VAD, so no claim is made about what it would achieve.

### 5.3 Accuracy: real recognition, and what it is worth

The audio is **synthetic**: macOS `say` reading §2's 53 hand-written utterances at
16 kHz in a silent room (`scripts/asr-benchmark/make-audio.mjs`). No person was
recorded, so §7's consent rules are not engaged — and neither is its evidence
requirement met. Read speech with clean articulation and no room is close to the
read-religious-text domain DONDO was trained on.

Three voices, to separate the recogniser's behaviour from one voice's quirks. Scored
through the **same** `scoreCorpus` the test suite runs (`scripts/asr-benchmark/score-transcripts.mjs`),
with expectations re-read from `serviceCorpus.ts` so a recogniser is never scored
against expectations that travelled with it.

| voice | locale | WER | correct | exact | refused | **misleading-top** |
| --- | --- | --- | --- | --- | --- | --- |
| Tessa | en_ZA | **21.0%** | 20/53 (37.7%) | 10 | 25 | **18 (34.0%)** |
| Daniel | en_GB | 24.7% | 19/53 (35.9%) | 10 | 26 | **17 (32.1%)** |
| Samantha | en_US | 29.3% | 16/53 (30.2%) | 7 | 28 | **16 (30.2%)** |
| *(clean transcripts, no audio)* | — | 0% | 53/53 | 42 | 11 | 0 |

Per group, on the best voice (Tessa):

| group | correct | misleading-top |
| --- | --- | --- |
| Complete references | 5/18 | 3 |
| Code-switched framing | 3/7 | 2 |
| Quoted / narrative numbers | 7/11 | 3 |
| **Multiple references** | **0/10** | **8** |
| Ambiguous families | 1/2 | 1 |
| Should refuse | 4/5 | 1 |

**The dominant failure is a mangled book name that is still a real book.** "John"
comes back as `jon`, and the parser resolves `jon three sixteen` to **Jonah 3:16** —
an existing passage, offered first, for an utterance that named John. `Psalm` → `salm`
and `Luke` → `luoke` fail differently and more safely: they match nothing and the
parser refuses.

And `jon` is not a near-miss the parser fumbled. It is an **exact, deliberate
alias**: `bibleBooks.ts` lists `aliases: ['jon', 'jnh']` for Jonah, and the spoken
parser matches against that same table. There is no fuzzy matching anywhere in
`spokenReference.ts` — the parser did precisely what it was told.

That is the actual defect, and it is ours rather than DONDO's. **The alias set that is
right for typed input is wrong for spoken input.** Someone typing `jon` means Jonah;
nobody *says* "jon", so in a transcript that string is overwhelmingly a mis-heard
"John". The written abbreviations — `jon`, `jnh`, `jn`, `jhn` — are noise on the
spoken path and a live trap.

`spokenReference.ts` already carries a defence against a *neighbouring* hazard: its
`numberFollows` check exists because `is` is an alias of Isaiah and turned "This **is**
John chapter three verse sixteen" into Isaiah 3:16. That defence does not help here,
because "jon three sixteen" **is** followed by numbers — it is shaped exactly like a
genuine reference. The existing guard catches an alias that is an ordinary word in
running text; this is an alias that is a homophone of another book.

This is **not** the failure profile §2's synthetic curve predicted. That model
corrupted number words, because those are what an English confusion dictionary
corrupts. Real CTC output on this material corrupts **proper nouns**, and a
near-miss between two real book names is the one error the parser cannot detect —
`Jonah` is a perfectly good reading of `jon`.

Multiple references collapse completely: **0/10 across all three voices.**

**Top-k recall equals top-1 exactly, and that closes off the obvious mitigation.**
Gate A asks for both. Of the utterances that name a passage, the share where every
named passage is *reachable anywhere in the candidate list* is 23.8% (Tessa and
Daniel) and 16.7% (Samantha) — identical, to the case, with the top-1 rate. The
`offered` outcome, meaning the right passage was present but not leading, occurred
**zero times in every run**.

So the correct passage is never merely mis-ranked: it is either leading or it is not
there at all. Widening the candidate list, or letting the operator scroll further,
recovers nothing. This is a consequence of *how* the recogniser fails — a mangled
book name resolves to a different book or to none, and neither path leaves the true
reading somewhere further down the list.

Degrading the best voice (additive noise plus a crude 0.35 s synthetic room):

| condition | WER | correct | refused | misleading-top |
| --- | --- | --- | --- | --- |
| clean | 21.0% | 20/53 | 25 | 18 (34.0%) |
| 20 dB SNR + reverb | 31.1% | 18/53 | 32 | 14 (26.4%) |
| 10 dB SNR + reverb | 50.5% | 13/53 | 39 | 9 (17.0%) |

Degradation **does** fail toward refusal — as audio worsens, the parser matches less
and refuses more, which is the safe direction. The danger zone is not the worst
audio; it is *good* audio in which a book name is subtly wrong. But usefulness
collapses along the way: at 10 dB the assistant is right about a quarter of the time.

#### The multilingual checkpoint, and why its zero is not a good score

§5 names two checkpoints, so `w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en` was measured
too, on the same audio, with the `African English` language prefix built exactly as
the model card specifies (prefix id **6** from the card's *global* map — not the
model's own position in its language list).

Speed is the same: RTF 0.045–0.047 on mps/float32, 486 MB, and the same 120 s
single-shot failure. Accuracy is not:

| checkpoint | WER | correct | exact | refused | misleading-top |
| --- | --- | --- | --- | --- | --- |
| `w2v-bert-en` | 21.0% | 20/53 | 10 | 25 | 18 |
| `…gaa_nzi_twi_en` + prefix | **81.7%** | 11/53 | **0** | **53** | **0** |

**Its zero misleading-top is the harness's own warning case, not a result.** The
transcripts are so degraded that the parser matches nothing and refuses all 53
utterances; the 11 "correct" are exactly the 11 that were supposed to resolve nothing.
A recogniser that resolves *nothing* scores a perfect misleading-top rate, which is
precisely why `correct` and `misleadingTop` must be read together and why
`referenceOutcome.ts` reports both.

**Reported with low confidence, and it carries none of the conclusion.** 81.7% is far
worse than the card's own 27.4% for English on this checkpoint. A no-prefix control
was similarly bad, so the prefix is not obviously the culprit — but the card's
`add_language_prefix` is crude by its own admission (a one-hot dropped into feature
bin `lang_id % 160`, one frame ahead of hundreds), and it is entirely possible the
scheme needs something the card does not document. Either way the English monolingual
checkpoint is the one §3 predicted would suit reference recognition and the one the
Gate A verdict rests on; nothing above depends on this table.

### 5.4 Ninety minutes beside OBS

A service is 90 minutes, so the run is 90 minutes. Three windows, because "did the
recogniser cost anything" is a comparison and not a reading: **baseline** (OBS
recording, no recogniser), **soak** (recogniser transcribing continuously), and
**recovery** (recogniser stopped). OBS was loaded with a **local recording** — never a
stream; the file it created was deleted at the end. Frame counters are deltas across
each window, since OBS's own totals run since launch.

947 iterations, 5403 s, mps/float32, 120 s clip in 30 s chunks.

| window | duration | median frame render | render-skipped | output-skipped | median CPU |
| --- | --- | --- | --- | --- | --- |
| baseline | 285 s | 4.19 ms | 70 / 8 565 (0.82%) | 0 / 8 565 (0%) | 10.3% |
| **soak** | 5 411 s | **6.43 ms** | 52 / 162 334 (0.03%) | 173 / 162 334 (0.11%) | 11.0% |
| recovery | 165 s | 4.60 ms | 0 / 4 963 (0%) | 10 / 4 963 (0.20%) | 10.3% |

**Thermal: no meaningful throttling.** Median real-time factor drifted from 0.0467
over the first tenth of the run to 0.0482 over the last — **+3.2%** — with a worst
single iteration of 0.056. `powermetrics` needs root so no die temperature was
sampled; this is the observable that decides the question, and a machine 20× faster
than real time losing 3% over an hour and a half is not throttling into trouble.

**Memory: flat.** The recogniser's resident set was **344.5 MB at iteration 1 and
344.5 MB at iteration 947** — no leak over 90 minutes. System-wide swap use rose by
about 2 GB across the run, but the recogniser's own footprint did not grow, so that
is not attributable to it and is not claimed as such.

**Effect on OBS: a real cost in render time, and no sustained frame loss.** Median
frame render time rose from 4.19 ms to 6.43 ms — about **+53%** — and returned to
4.60 ms once the recogniser stopped. That is clean, reversible and clearly caused:
the recogniser and the compositor share one GPU. At 1080p30 the frame budget is
33.3 ms, so 6.43 ms is still comfortable.

**The dropped-frame numbers do not support a simple story, and are reported rather
than tidied.** They are *episodic bursts*, not a steady rate: the baseline's 70
render-skips arrived in a single step three minutes in, the soak's 173 output-skips
accumulated in bursts and then stayed flat for the last twenty minutes, and recovery
— with no recogniser at all — dropped 10 more at the highest per-frame rate of the
three windows. Render-skipping was **worse in the baseline** than during the soak.
Nothing here scales with the recogniser being on, so the honest conclusion is that
frame drops on this rig are dominated by something else and the recogniser's
contribution, if any, is below what this run can resolve.

**One observation that points the other way, and is not explained.** During the
earlier backend sweep (§5.1) OBS accumulated **1 022 skipped render frames**, far more
than anything in this soak. That sweep ran configurations this soak did not — CPU
float32 at 3–4 GB and float16 at 3.8 GB — and also included a Browser Source refresh,
so memory pressure is the plausible cause. **That is a guess and was not verified.**
It is recorded because a reader who saw only the soak table would conclude the
recogniser is free of frame cost, and the 1 022 is evidence that some configurations
are not.

### 5.5 What this establishes, and what it does not

**Establishes.** On this machine DONDO's English checkpoint is comfortably fast
enough — RTF 0.037–0.052, ≤501 MB, Metal — and holds that over a full 90-minute
service with 3.2% drift, no memory growth, and no sustained effect on OBS beyond a
+53% frame-render cost the compositor absorbs easily. **None of §5's performance stop
conditions is what blocks this feature.** It also establishes that the *pipeline*, not
the model, is the latency problem, and that any deployment must chunk.

**Establishes about accuracy: a measurement under favourable acoustics — not a
bound.** On synthetic read speech in a silent room the assistant offers a wrong
leading passage for about **a third** of utterances and is fully correct for about
**a third**. Three voices agree within a few points, and the closest available locale
to African English (en_ZA) is the *best* of them, so this is not one voice's accent.

It is tempting to call that an upper bound on real-world performance, and it is not
one. The acoustics here are far better than a sanctuary, which flatters the result;
but the *voices* are synthetic and none is Ghanaian, and DONDO's English was trained
on African English, which may well penalise it. Those two push in opposite
directions and this run cannot weigh them. So: a measurement taken under known
conditions, with the direction of its error unknown.

**Does not establish the number Gate A asks for.** This is synthetic speech, not a
service: no PA system, no congregation, no spontaneous or genuinely code-switched
delivery, no Ghanaian speaker, and no preacher moving relative to a microphone.

What it decides is not the criterion but **whether to go and measure it**. Gate A asks
whether the assistant saves the operator time. At roughly one utterance in three
correct and one in three confidently wrong — and none of ten multi-reference
utterances right — the result is not near the line from either side, and real audio
would have to move it a very long way in the favourable direction to change that.

Gathering the real number costs a congregation's informed consent, a recorded service
and an operator's time (§7). Spending that to confirm a result this adverse is not a
good use of any of it. So the criterion stays **unmeasured and not established**, and
the work stops here on the strength of the preliminary evidence — a decision about
effort, not a measurement we did not take.

**Does not establish anything about a fine-tuned model.** Everything here is the
base checkpoint. The paper's own position is that these models "may underperform on
spontaneous, code-switched or noisy speech **until fine-tuned**", and nothing in this
run tested that claim.

---

## 6. Two release gates, not one

An earlier draft said any non-zero misleading-top result means live capture does not
ship. That is the wrong rule: it would block an operator-reviewed assistant on the
strength of a failure mode the review step exists to catch, while the same document
argues that review is what makes the feature viable. A wrong leading candidate is
serious and must be measured — but in the shipped flow it is a wrong answer the
operator reads before accepting, not scripture on a screen.

So there are two decisions, with different bars.

### Gate A — operator-reviewed assist

May be considered when **all** of these hold:

- nothing stages, queues or airs automatically; acceptance is a press, and Take is a
  second, separate press;
- the candidate list shows alternatives and the reasoning for each reading, so the
  operator can see *why* a passage was offered;
- top-1 and top-k recall on **real church audio** are good enough to save time rather
  than cost it;
- the misleading-top rate on real audio is **measured and reported**, not assumed;
- latency to final is short enough to be useful during a service;
- operator testing shows wrong candidates are reliably noticed at the review step —
  this is the control the gate depends on, so it has to be tested, not asserted;
- typing remains immediately available and is never worse than it is today.

Note what is *not* on this list: a zero misleading-top rate. Under review, that number
is a cost to keep low and visible, not a veto.

### Gate A re-adjudication — after remediation: **STILL NOT CLEARED**

§9 records what the remediation changed. Against the same seven criteria:

| # | Criterion | Was | Now |
| --- | --- | --- | --- |
| 1 | Nothing stages/queues/airs automatically | Met | **Met** |
| 2 | Candidates show alternatives and reasoning | Met | **Met** — recovered books additionally carry `heard "jon"` |
| 3 | Top-1/top-k good enough to save time | Not established, **strongly adverse** | **Still not established** — but the adverse signal is gone: misleading-top 34.0% → 3.8% same-transcript, 12.0% → 3.6% held-out |
| 4 | Misleading-top on **real audio** measured | No evidence | **No evidence** |
| 5 | Latency short enough to be useful | **Fails** (15.6 s) | **Met** — 0.649 s median, 0.764 s p95 |
| 6 | Operator testing catches wrong candidates | No evidence | **No evidence** |
| 7 | Typing always available | Met | **Met** |

**Gate A requires all of its criteria, and three of them do not hold. It is NOT
CLEARED**, and nothing below softens that.

What changed is the *development* decision, which is a different question. Criterion
5 moved from failure to pass, and criterion 3's adverse evidence is gone — those were
the two that stopped Stage 5, and Stage 5 refused to build because the evidence said
the thing would not work. That is no longer what the evidence says.

So the decision is: **the engineering evidence is sufficient to build the
operator-reviewed assist for real-world validation.** It ships as an explicitly
unvalidated, validation-stage capability with typing always immediately available,
refusing far more often than it errs.

Criteria 4 and 6 are **not** logically impossible to measure without the feature —
criterion 4 could in principle be measured offline on consented real church audio,
and criterion 6 benefits from real interaction but is not strictly gated on this
implementation. What the built feature changes is practicality: it makes in-situ
collection and operator validation feasible rather than a separate research
exercise.

**What has NOT changed:** no automatic acceptance, no automatic staging, no
automatic queueing, no Auto-Take. Gate B remains out of scope and untouched.

### Gate A adjudication — 2026-08-11 (superseded by the re-adjudication above)

Against the §5 run.

| criterion | verdict |
| --- | --- |
| 3 — top-1/top-k on real church audio | **Not established** — strongly adverse preliminary evidence |
| 4 — misleading-top on real audio | **No evidence** |
| 5 — latency to final | **Fails** |
| 6 — operator testing | **No evidence** |
| **Gate A** | **NOT CLEARED** |

**On criterion 3, the verdict is deliberately "not established" rather than
"fails".** The criterion's measurement definition is *real church audio*, and no
real-audio number exists. §5.5 says so itself. Labelling it a failure would mean
scoring a criterion against a measurement it does not name — moving the gatepost
after seeing a bad result, which is exactly the move this document exists to refuse.
It does not weaken the conclusion by one step: criterion 5 fails outright on
measurement, and Gate A requires **all** criteria to hold.

| # | Criterion | Verdict |
| --- | --- | --- |
| 1 | Nothing stages, queues or airs automatically; accept is a press and Take a second | **Met** — shipped in #26. `voiceAssist.ts` has no transition to the draft except `accept`, and the Scripture workspace has no Take at all. |
| 2 | Candidates show alternatives *and the reasoning for each reading* | **Met** — `VoiceAssistPreview` renders each candidate's canonical alongside its `interpretation`. |
| 3 | Top-1/top-k on **real church audio** good enough to save time rather than cost it | *(Stage 5, superseded — see the re-adjudication above.)* **Not established — strongly adverse preliminary evidence.** Real church audio remains unmeasured, so the criterion as written has no result. What does exist — synthetic read speech in a silent room, three voices — is 30–38% fully correct against 30–34% wrong-leading, 0/10 on multiple references, and **top-k identical to top-1** (`offered` = 0 everywhere), so a longer candidate list recovers nothing. On evidence that adverse there is no justification for proceeding to the live-assist product phase and the real-audio validation it would require. That is an evidence-based stop decision, not a claim that the real-audio metric was measured. |
| 4 | Misleading-top on **real audio** measured and reported | **No evidence.** Measured on synthetic speech only (§5.3). Cannot be synthesised. |
| 5 | Latency to final short enough to be useful during a service | **Fails.** ≈15.6 s at 15 s chunks, ≈31.4 s at 30 s. The model is not the bottleneck; the buffering window is, and the endpointing that would fix it is not built. |
| 6 | Operator testing shows wrong candidates are *reliably noticed* at review | **No evidence.** Not tested. This is the control the whole gate depends on, and §6 already says it has to be tested rather than asserted. |
| 7 | Typing remains immediately available and never worse | **Met** — the typed path is untouched and remains the only path. |

**Criterion 3 is the one that decides the product question, and the honest label for
it is "not established".** It would be easy to write "fails" — the numbers are awful
and the instinct is to score them against the gate. But the gate says *real church
audio*, and that was not measured. Criteria 3, 4 and 6 all await the same missing
evidence; 3 differs only in that we have a strong preliminary signal about how it
would go, taken in far better acoustic conditions than a sanctuary and still landing a
long way below "saves time", with the multi-reference group at zero.

That signal is not a verdict on the criterion. It is a reason not to spend a
congregation's consent, a service, and an operator's afternoon gathering the real
measurement yet. **Stopping here is a decision about where to spend effort, not a
claim to have measured the thing the criterion names.**

Criterion 5 is different: it **fails outright**, on measurement, and would still fail
if recognition were perfect. Gate A requires *all* criteria to hold, so one measured
failure is sufficient on its own.

**So live capture is not built, and this is the §5 stop.** Not because the machine is
too slow — it is 20× faster than it needs to be — but because the transcripts are not
good enough to justify going further, and the pipeline that would deliver them is
15 seconds late. `LiveTranscriptSource` remains unimplemented, deliberately.

### What would change this verdict

In rough order of leverage, and none of it is in scope here:

1. **Give the spoken path its own alias set** — the cheapest by a wide margin, and
   the only one whose defect is already proven. Written abbreviations (`jon`, `jnh`,
   `jn`, `jhn`, `is`, `am`) should not be matchable in a transcript, because they are
   spellings rather than pronunciations. This is a change to *our* parser, needs no
   model, and can be evaluated today against transcripts already captured. It does
   not fix mishearings that land on a genuinely different spoken book name, so it
   shrinks the misleading-top count rather than eliminating it.
2. **Fine-tuning on Ghanaian church speech.** The paper's own limitations section says
   these base models "may underperform on spontaneous, code-switched or noisy speech
   until fine-tuned". Untested, and the largest single unknown.
3. **Constraining the decoder toward the book list** — CTC beam search biased toward
   the 66 canonical names, or a phonetic match with a confidence floor. Attacks the
   same error class as (1) but upstream, at the point where `John` became `jon`.
4. **Voice-activity detection**, to replace fixed windows and collapse latency from
   15 s toward the model's own 0.13 s.
5. **Then, and only then, real consented church audio** (§7) and the operator-review
   test of criterion 6.

Items 1, 3 and 4 are ordinary engineering against evidence already in hand. Item 5 is
the one that needs people, consent and a service.

**None of this is scheduled, and none of it is a promise.** The honest reading of the
numbers is that (1) and (3) together might move the misleading-top rate meaningfully
while leaving the multi-reference collapse (0/10) untouched — and that is the group
that most needs to work, because it is where an operator is least able to notice a
substitution.

### Gate B — automatic acceptance, staging or Take

**Out of scope, and not approvable from this evidence.** A finite corpus with zero
observed misleading-top results would still not establish that auto-airing scripture
is safe: absence of an observed failure in a hand-built corpus is not evidence of
absence in a live service. If it is ever revisited it needs a different argument
entirely — real audio at scale, a measured upper bound rather than a point estimate,
and a rollback that does not depend on someone noticing.

Program invariance and operator confirmation are unchanged by either gate.

---

## 7. Recordings, consent, storage and deletion

Evaluating on real audio means recording people in a church. That is a matter of
consent and dignity, not just data handling.

- **Nothing in this repository is a recording.** The corpus in
  `src/lib/asr/serviceCorpus.ts` is hand-written text. A test asserts no audio or model
  file extensions appear in it.
- **No church recordings are ever committed.** Not to this repo, not to any branch, not
  as test fixtures, not in an issue or PR.
- **Informed consent before recording.** The preacher and anyone else audible must be
  told what is being recorded, why, who will hear it, how long it is kept, and that
  they may decline or withdraw. Consent for a service is not consent for every service.
- **Local storage only**, on the production machine, in a folder outside the repository,
  not synced to any cloud drive.
- **Delete after evaluation.** Recordings are kept only as long as the benchmark run
  needs them, and are deleted when it concludes. What survives is the *measurements* —
  WER, latency, reference outcomes — never the audio.
- **Transcripts count as recordings.** A verbatim transcript of a sermon carries the
  same content and the same obligations.
- **No third-party upload.** Evaluation audio is not sent to a hosted API, including
  Khaya Studio, without a separate explicit decision and fresh consent.
- **Withdrawal is honoured.** If anyone asks for their recording to be removed, it is
  deleted, and any derived transcript with it.

---

## 8. Current state

| | |
| --- | --- |
| Reference parsing from a transcript | **Shipped** (PR #18, #26) |
| Operator review before anything airs | **Shipped** (PR #26) |
| Provider-neutral transcript port | **Shipped** (PR #26) |
| Evaluation harness and metrics | **Shipped** (PR #27) |
| DONDO audit against official sources | **Done** (this document) |
| Release gates for reviewed vs unattended | **Defined** (§6) |
| Benchmark harness | **Shipped** (`scripts/asr-benchmark/`) |
| Apple Silicon benchmark | **Run 2026-08-11.** Results in §5. |
| Machine fast enough? | **Yes** — RTF 0.037–0.052 on Metal, measured peak RSS 501 MB. |
| Recognition accurate enough? | **Improved, still unproven on real audio** — after remediation, misleading-top 3.8% same-transcript and 3.6% held-out, multiple references 5/5 (§9). Was ~32% and 0/10 before (§5.3). Real church audio remains unmeasured. |
| Gate A criterion 3 (accuracy, real audio) | **Not established** — adverse signal gone; misleading-top 3.8% same-transcript, 3.6% held-out (§9). |
| Gate A criterion 4 (misleading-top, real audio) | **No evidence** — needs a real service. |
| Gate A criterion 5 (latency) | **Met** — 0.649 s median after endpointing (§9). |
| Gate A criterion 6 (operator testing) | **No evidence** — needs operators using it. |
| **Gate A overall** | **NOT CLEARED** — 3 unestablished, 4 and 6 no evidence (§6). |
| Development decision | Evidence sufficient to **build for validation**, not to trust. |
| Speech-specific book lexicon + recovery | **Shipped** (§9). |
| Utterance endpointing | **Shipped** (§9). |
| Microphone capture | **Built, operator-reviewed, off by default.** |
| A selected provider | **Not chosen.** |
| Gate B (automatic acceptance / Take) | **Out of scope**, unchanged. |

A runnable local speech service now exists, so the condition this document set has
been met: `scripts/speech-service/server.py`, with setup in
`scripts/asr-benchmark/README.md` and an operator-facing pointer in
`docs/OBS_SETUP.md`. It is documented as a **validation-stage** capability, because
that is what it is.

## 9. Remediation — what changed, and what it measured

Stage 5 stopped because the assistant was right about a third of the time and
confidently wrong about a third. This section records the targeted fix and its
result.

The headline, stated like-for-like: **misleading-top fell from 34.0% to 3.8% on the
same Stage 5 transcripts, and from 12.0% to 3.6% end-to-end on held-out audio;
latency fell from 15.6 s to 0.649 s.** The narrower "wrong book or chapter" subtype
is 1.2% — a *different, stricter* metric than the 34%, and the two are not
comparable.

### The held-out corpus, frozen first

`serviceCorpus.ts` could not honestly measure a fix to failures it had already
revealed, so an **83-case held-out corpus was written and committed before the
parser was touched** (`src/lib/asr/heldOutCorpus.ts`, sha256
`3ed876598a0bacbc2baf06d771b9b9b4639e97795f9ffa7b162071cf8b34506c`). It covers
canonical names, confusable books, numbered books, chapter/verse forms, bare
numbers, natural framing, multiple references, ambiguous families, impossible
references, should-refuse utterances, and corrupted proper nouns. Individual rules
were not tuned against it; two of its own expectations were corrected before the
parser changed and both corrections are recorded in the file.

### What was fixed

**The alias policy.** An alias valid for typed input is not automatically valid for
spoken input. The spoken path now matches canonical names plus a short list of forms
people actually say; written abbreviations (`jn`, `jhn`, `jon`, `ps`, `is`) match
nothing. `parseReference.ts` is untouched, so typed entry keeps every abbreviation.

**Constrained recovery, allowed to refuse.** A corrupted book name may be recovered
under an absolute edit budget, a vowel requirement (written abbreviations are
vowel-stripped, speech renderings are not), a three-character floor, single-token
only, and only where numbers follow. Ties break on *how* the word is wrong —
dropped letters beat changed ones, which is what decides `jon` → John rather than
Job. Three or more equally-close books refuses outright.

**An unrelated route to the same failure**, found on the held-out set: when nothing
was followed by numbers the parser picked a book anyway and resolved it, so "my mark
on the paper was three out of ten" produced Mark 3. A book with numbers on neither
side is no longer a reference.

**Endpointing** replaced fixed windows (§5.2's blocker).

### Results

Parser A/B on Stage 5's **preserved transcripts** — identical audio, identical ASR
output, only the parser changed:

| | before | after |
| --- | --- | --- |
| correct | 20/53 (37.7%) | **38/53 (71.7%)** |
| exact | 10 | **27** |
| misleading-top | **18 (34.0%)** | **2 (3.8%)** |
| top-k reachable | 23.8% | **66.7%** |

End-to-end on the **held-out corpus**, recognised fresh (Tessa/en_ZA, WER 23.5%):

| | before | after |
| --- | --- | --- |
| correct | 33/83 (39.8%) | **48/83 (57.8%)** |
| exact | 20 | **31** |
| misleading-top | 10 (12.0%) | **3 (3.6%)** |
| top-k reachable | 30.3% | **47.0%** |

Held-out **text** (no audio) went 79.5% → 97.6% correct with misleading-top 8.4% →
2.4%, and the regression corpus is unchanged at 53/53 with zero misleading-top.

### Degradation, and the number that actually decides it

At 20 dB SNR with 0.35 s reverb the frozen scorer reports misleading-top rising to
**12.0%**. That number needs breaking down, because it is not what it appears:

| | clean | degraded |
| --- | --- | --- |
| **wrong book or chapter** | **1 (1.2%)** | **1 (1.2%)** |
| right book+chapter, verse lost | 2 | 8 |
| scorer artifact (matches intent) | 0 | 1 |
| exact rate | 47.0% | 28.8% |
| refused | 48 | 53 |

**The dangerous class does not grow under degradation.** What grows is verse
truncation — "Hebrews 11" for "Hebrews 11:1" — which is an incomplete answer the
operator sees as incomplete, not a plausible wrong passage they might accept. The
single wrong-passage case in each condition is `galations` heard as `revelations`,
where the recogniser produced a legitimate spoken form of a different book.

That is the inverse of Stage 5's profile, where a third of utterances produced a
confident wrong *book*.

### Latency

| | before | after |
| --- | --- | --- |
| endpoint delay | — (15 s window) | 0.504 s |
| inference | 0.146 s | 0.146 s |
| **latency to final** | **15.6 s** | **0.649 s** (p95 0.764 s) |

20/20 utterances detected. This is **utterance-batch inference behind a VAD, not
streaming** — w2v-BERT + CTC still encodes a complete utterance.

### What is still not established

Everything §5.5 said about synthetic audio still holds: no PA, no congregation, no
Ghanaian speaker, no real service. The remediation did not make DONDO better at
hearing; it made the layer above it stop turning mishearings into confident wrong
passages, and stopped the pipeline waiting 15 seconds.

The residual weakness is **acoustic and out of reach of any parser work**: less
common books are mangled beyond safe recovery — `"newer mile ai ten"` for Nehemiah,
`"melikhiri three tin"` for Malachi — and those refuse rather than err, which is
safe but not useful. Roughly 60% of named passages return nothing under degradation.

### The replaceable boundary

If DONDO is later replaced, the seam is unchanged and small:
`LiveTranscriptSource` in `transcriptSource.ts` (text only — no audio, tensors or
credentials cross it) and the local inference process behind it. Everything built
here — the lexicon, recovery, endpointing, the scorer, both corpora — is
provider-neutral and survives a swap.

---

## Sources

- [arXiv:2607.21540 — DONDO: Open w2v-BERT Speech-Recognition Base Models for African Languages](https://arxiv.org/abs/2607.21540)
- [huggingface.co/KhayaAI](https://huggingface.co/KhayaAI)
- [KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en](https://huggingface.co/KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en)
- [khaya.ai](https://khaya.ai)
