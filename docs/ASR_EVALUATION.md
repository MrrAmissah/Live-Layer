# Speech recognition: evaluation, and what would have to be true

**Status: evaluation only. No provider has been selected, no model is installed, and
nothing in LiveLayer captures audio.** This document records what the candidate
model actually claims, what our own harness measures, the architecture a live
recogniser would have to fit behind, and the benchmark that has to be *run* before
any of it is switched on.

It is one document on purpose. Speech is the easiest place in this project to
accumulate confident planning prose about software that does not exist.

---

## 1. Why the obvious metric is the wrong one

DONDO reports word error rate. WER is the right number for comparing recognisers and
the wrong number for deciding whether this feature is safe, because the two failures
it averages together are not comparable:

| Outcome | What the operator sees | Cost |
| --- | --- | --- |
| **Refused** | "Couldn't find a Bible book in …" | They type the reference. A moment lost. |
| **Harmful** | A real, plausible passage that is **not** the one named | Wrong scripture on screen in front of a congregation. |

A transcript can be 27% wrong and still produce the right passage when the errors
fall outside the reference. It can be 5% wrong and produce the wrong passage when the
single error lands on a verse number — `twenty eight` heard as `twenty ate` is
`Romans 8:20` instead of `Romans 8:28`, and both exist.

So the harness measures **reference outcome**, not transcription accuracy, and treats
`harmful` as a release gate rather than a rate to optimise.

Code: `src/lib/asr/referenceOutcome.ts`, `src/lib/asr/transcriptMetrics.ts`,
`src/lib/asr/serviceCorpus.ts`. Tests: `src/lib/asr/asrEvaluation.test.ts`. It runs in
the ordinary suite with no audio and no model.

---

## 2. What we measured (today, no model)

A 46-utterance hand-written corpus of how references are spoken from a pulpit —
complete references, Ghanaian-English and Twi/Ga code-switched framing, quoted
numbers mid-sermon, several references in one breath, and utterances that must
resolve nothing.

**On clean transcripts: 46/46 correct, 0 harmful.**

| Group | Correct | Harmful |
| --- | --- | --- |
| Complete references | 18/18 | 0 |
| Code-switched framing | 7/7 | 0 |
| Quoted / narrative numbers | 11/11 | 0 |
| Multiple references | 5/5 | 0 |
| Should refuse | 5/5 | 0 |

Then the same corpus with deterministic, seeded transcription errors injected — the
documented confusions of English ASR (number homophones, dropped function words) —
to find *where the parser starts producing wrong passages*:

| Injected | Measured WER | Correct | Refused | **Harmful** |
| --- | --- | --- | --- | --- |
| 0% | 0.0% | 46 | 11 | **0** |
| 5% | 1.9% | 46 | 11 | **0** |
| 10% | 4.7% | 45 | 11 | **1** |
| 20% | 8.5% | 43 | 11 | **2** |
| 30% | 11.0% | 43 | 11 | **2** |
| 50% | 17.6% | 36 | 13 | **7** |

### The finding that matters

**The first wrong passage appears at roughly 5% word error rate.** DONDO's published
African-English WER is **16.9%** (monolingual `en`) and **27.4%** in the Southern
Ghana multilingual model — the one that covers the languages a PPC service uses. Both
sit well above the point where our own corpus starts yielding real-but-wrong verses,
and those published figures are on *read religious text*, which is an easier task than
spontaneous preaching.

This is a statement about the combination, not a criticism of the model. It means:
**a general-purpose recogniser feeding this parser unattended is not currently a safe
design, at any of the published numbers.** The operator-in-the-loop review step that
PR #26 built is not a nicety to be optimised away later; it is what makes the feature
viable at all. Any future "auto-take a recognised reference" idea has to clear this
table first.

Caveat, stated plainly: the injected errors are a stand-in for real audio. They model
the *shape* of ASR failure, not DONDO's actual behaviour. The curve is a property of
our parser and is real; the specific WER at which DONDO would sit on it is unmeasured.

---

## 3. DONDO: what the sources actually say

All facts below are from the paper, the Hugging Face organisation, and Khaya AI's own
pages. Nothing is inferred.

**Paper.** Azunre, P., Ibrahim, N., Budu, J., Adu-Gyamfi, L. *DONDO: Open w2v-BERT
Speech-Recognition Base Models for African Languages* (subtitle: *Democratizing Oral
Neural Dialect Ontology*). Khaya AI. arXiv:2607.21540v2 [cs.CL], 24 July 2026; dated
28 July 2026. Contact `paul@khaya.ai`. Funded by the Huniki Federation; the
acknowledgements thank Ghana-NLP, Algorine Research and Hugging Face.

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

Two things to note for our use. **African English is the worst column** at 27.4% —
and English is the language in which references are actually spoken at PPC. And the
multilingual model is *worse* at English than the monolingual `en` model (16.9%),
because English acts as a shared column across every regional family. If DONDO were
used here, the English monolingual checkpoint is the better starting point for
reference recognition, with the multilingual model relevant only if references are
spoken in Twi or Ga.

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

### Not published anywhere we could find

**No latency, real-time factor, or hardware benchmark** appears in the paper or on the
model cards. Nothing about DONDO's speed on any machine is known to us. That is the
whole reason for §5.

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

## 5. The benchmark that has to be run

**No performance claim will be made until this has been executed and the numbers
written into this section.** There is currently no published latency figure for DONDO
on any hardware, and none for Apple Silicon in particular.

Target machine: the production Mac (Apple Silicon), running OBS, LiveLayer and the
recogniser **at the same time** — a number measured on an idle machine is not the
number that matters.

Measure, per candidate checkpoint (`w2v-bert-en` first, then
`w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en`):

1. **Real-time factor** — audio seconds processed per wall-clock second, on 10s, 30s
   and 120s clips. RTF < 1 is the bare minimum for streaming; the useful threshold is
   well below that, because OBS needs the machine too.
2. **Latency to final** — from end of utterance to the settled transcript. This is what
   the operator feels. A reference that arrives after the preacher has moved on is
   useless however accurate it is.
3. **Backend comparison** — CPU vs Metal/MPS vs CoreML, and quantised vs F32. Record
   what was actually tried, including what failed to run.
4. **Memory footprint** and whether it forces swap while OBS is encoding.
5. **Thermal behaviour** over a 90-minute run, which is the length of a service. A
   figure from a 30-second test is not a service.
6. **Effect on OBS** — dropped frames and encoding lag with and without the recogniser
   running. If graphics stutter, the feature is not viable at any accuracy.

Then re-run §2's corpus against the real transcripts to get the true reference-outcome
numbers, replacing the synthetic curve.

**Stop conditions.** If RTF ≥ 1 on the production machine, or OBS drops frames, or
harmful outcomes are non-zero on real audio, the feature does not ship as live capture.
The typed transcript path stays and remains useful.

---

## 6. Recordings, consent, storage and deletion

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

## 7. Current state

| | |
| --- | --- |
| Reference parsing from a transcript | **Shipped** (PR #18, #26) |
| Operator review before anything airs | **Shipped** (PR #26) |
| Provider-neutral transcript port | **Shipped** (PR #26) |
| Evaluation harness and metrics | **Shipped** (this PR) |
| DONDO audit against official sources | **Done** (this document) |
| Microphone capture | **Not built.** Deliberately. |
| A selected provider | **Not chosen.** |
| Apple Silicon benchmark | **Not run.** §5 is a plan, not a result. |

`docs/OBS_SETUP.md` will gain a speech section when there is a runnable service to set
up, and not before.

## Sources

- [arXiv:2607.21540 — DONDO: Open w2v-BERT Speech-Recognition Base Models for African Languages](https://arxiv.org/abs/2607.21540)
- [huggingface.co/KhayaAI](https://huggingface.co/KhayaAI)
- [KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en](https://huggingface.co/KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en)
- [khaya.ai](https://khaya.ai)
