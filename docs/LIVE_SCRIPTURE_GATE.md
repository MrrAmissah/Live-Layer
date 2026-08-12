# Five-reference human sanity gate

A short, honest check with a real microphone and a real voice, before anyone
spends time on a twenty-reference run. Twenty minutes of a person's attention is
the most expensive thing in this stage, so everything that could be verified
without them has been verified without them first — see **What was rehearsed**
below for exactly what that covered and what it could not.

This gate answers one question: **does saying a reference out loud put the right
verse in front of the operator, fast enough to be worth using?**

---

## Before you start

Two processes. Both local, neither talks to the internet except the Bible
lookup.

**1. The recogniser.** In one terminal:

```
cd ~/Documents/Live\ Layer
HF_HOME=~/LiveLayer-ASR-Eval/hf \
  ~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/server.py --verbose
```

That runs **Whisper large-v3-turbo** on MLX/Metal, which replaced the previous
recogniser on measured evidence after the last gate failed — see
`docs/ASR_EVALUATION.md` §10. To run the old one instead, add `--engine dondo`;
that is the A/B below and nothing else needs changing.

Wait for it to report that it is listening on `127.0.0.1:4179`. Loading the
model takes a few seconds. `--verbose` prints audio length and inference time
per request and **never prints a transcript** — that is deliberate, and it means
the terminal is safe to leave visible.

**2. The control surface.** In a second terminal:

```
cd ~/Documents/Live\ Layer
npm run dev
```

Then open **http://127.0.0.1:4173/control/scripture** in Chrome.

That port and host are fixed in `vite.config.ts` with `strictPort`, so if 4173 is
already taken the dev server refuses to start rather than moving — if `npm run
dev` fails, something else is on the port.

Chrome will ask for microphone permission the first time you press Start
listening. Grant it. **If it does not re-prompt, reload the page once anyway** —
the capture settings changed since the last gate and a tab holding an old
microphone stream would still be using the old ones. If it does not ask, the site permission is already set —
check the padlock in the address bar.

### Before you speak

- Check the meter moves when you talk and is still when you do not. It is driven
  by measured input level, so a still meter means nothing is arriving — that is
  a microphone problem, not a recognition problem, and there is no point
  continuing until it moves.
- Speak at the distance and volume you would actually use in the booth.

---

## Why this gate is being run again

Two things changed since the run that failed, and the gate exists to find out
whether either of them worked.

**The recogniser was replaced.** "John three sixteen" came back as
`"jon thr ixteen"` and no further parser patch was going to fix that. Three local
engines were compared on identical audio with the parser frozen; Whisper
large-v3-turbo nearly doubled how often the right verse leads the card, at the
same wrong-answer rate, and more than halved refusals.

**The microphone was being asked for the wrong thing.** `getUserMedia` was
explicitly requesting echo cancellation, noise suppression and automatic gain —
telephony processing that attenuates exactly the consonants that went missing.
Note what `"jon thr ixteen"` loses: the `ee` of "three", the `s` of "sixteen".
All three are now off.

The second one is a hypothesis with a matching signature, **not a measurement** —
it can only be measured with a real voice, which is what you are.

---

## The five references

Say each one, in this order, as one sentence with a clear pause afterwards. Wait
for the card to settle before the next one.

| # | Say exactly | Should show |
|---|---|---|
| 1 | "John three sixteen" | **John 3:16** |
| 2 | "Turn with me to John chapter three verse sixteen" | **John 3:16** |
| 3 | "Let us read Romans eight twenty eight" | **Romans 8:28** |
| 4 | "Psalm twenty three one" | **Psalms 23:1** |
| 5 | "First John four eight" | **1 John 4:8** |

Reference 5 is the one that most needs a human: an ordinal book name has to
survive damage to the ordinal *and* the book, and it is the shortest utterance
of the five.

---

## What to watch, and what it means

**While you are still speaking** the transcript updates continuously — that is
the recogniser re-reading everything you have said so far, several times a
second. It revises freely, and it is meant to.

**The passage card does not.** A guess made from unfinished speech has to be
heard **twice in a row** before it fills the card. The reason is a specific
failure: "John three sixteen" produced **John 3:6** from a snapshot cut a moment
before the last syllable — a real verse, retrievable, and not what was said.
Flashing that and correcting it a second later would teach you that the card
cannot be trusted, which costs more than the second it saved. If a reference has
been heard once and is being confirmed, the panel says *"Detecting reference…"*.

A guess naming only a chapter — "John 3" — is not shown mid-sentence either. It
retrieves perfectly well, which is the problem: it would fill the card with the
whole chapter and then collapse to one verse. Mid-sentence, a chapter with no
verse is almost always a reference you have not finished saying.

**What this costs.** For a short reference said on its own, waiting to hear it
twice usually means waiting for the end of the utterance anyway — so the card
fills when you stop, not before. Where it pays off is when you say the reference
and keep talking: rehearsing "John three sixteen, for God so loved the world…",
the passage appeared **2.8 s before** the speaker finished and stayed put. Either
way the transcript is moving the whole time.

**When you stop speaking**, the label changes to *"Ready to review"*. That is
the answer being judged.

Score each reference on the **"Ready to review"** card only:

- **Pass** — the right reference, with the passage text visible.
- **Coarse** — the right book and chapter, but no verse (e.g. "John 3"). Not a
  pass; note it.
- **Wrong** — a different reference. Note what it showed *and* what the live
  transcript said, because those are two different failures.
- **Nothing** — it refused. Note the live transcript.

The live transcript is on screen throughout. When something goes wrong, it is
the transcript that says whether the recogniser mis-heard you or the parser
mis-read the recogniser, and those get fixed in completely different places.

### If a reference fails

Say it once more, the same way. If it fails the same way twice, note it and move
on — do not keep retrying. Two clean failures is more useful information than
six muddled ones.

---

## What this gate does not do

Nothing here reaches air. Accepting a passage prepares the Scripture draft, and
**Take is still a separate press** — the same boundary as the typed path. You do
not need to accept anything for this gate; reading the card is the whole test.

No audio is recorded or written to disk, by the browser or by the recogniser.

---

## What to report back

Five lines is enough:

```
1. John three sixteen                 -> pass / coarse / wrong (…) / nothing    transcript: "…"
2. Turn with me to John chapter …     -> …
3. Let us read Romans eight twenty …  -> …
4. Psalm twenty three one             -> …
5. First John four eight              -> …
```

### The A/B, only if the five above do not all pass

Do not do this first, and do not do it at all if the run is clean. If something
failed, restart the recogniser with `--engine dondo`, say the failing phrase or
phrases again, and note both transcripts. That separates "the new engine is also
wrong here" from "this got worse", and those lead to opposite next steps.

Plus one sentence on **how it felt** — specifically whether something visibly
happened while you were still speaking, or whether it still feels like speaking
into silence and waiting. That was the complaint that stopped the last run, and
it is not something a number can answer.

---

## What was rehearsed before asking for this

So that the human run starts from a known position rather than from hope. All of
it used the **real browser endpointer**, the **real recogniser** and the **real
parser** — the only synthetic part is the voice.

Nine utterances were synthesised with the same voice and rate as the Stage 5
corpus (`say -v Tessa -r 165`), padded with room tone, and pushed through the
endpointer in 1024-sample blocks exactly as a `ScriptProcessor` delivers them.
They were then sent to the **live recogniser over the real socket**, so what is
recorded below is what the running service actually returned.

All nine again produce the correct reference on the new engine. The stability
rule earns its place more here than it did before: Whisper's half-utterance
guesses are confident and wrong in a different way — `John 3:6` for John 3:16,
`1 John 4:1` for 1 John 4:8, `Psalms 20` for Psalm 23 — and every one of those was
withheld rather than displayed.
Six cover the five references below; three more exist to catch the rule from the
other side — two genuine John 3:6 utterances, so that a real short verse is not
made unreachable, and one long quoting sentence, so that early display is not
lost where it matters.

**All nine produced the correct reference.** Three defects were found and fixed
on the way there:

- `Romans 8:28` was **refused outright**. The recogniser returns `romans eig
  twenty eight`; a damaged *book* was already repaired but a damaged *number*
  was not, so the whole reference was discarded.
- A provisional could display **John 3:60** — a verse that does not exist —
  because "…verse sixty" parses perfectly a moment before you say "sixteen".
  Provisional cards are now published only once their passage has actually been
  retrieved, so a reference that cannot exist is never shown.
- A provisional could display **John 3:6** for "John three sixteen" — a verse
  that does exist, which is worse. A guess must now be heard twice before the
  card fills.

Measured over those six utterances, from the moment speech starts:

| | |
|---|---|
| First words back on screen | **1.54 s** median |
| First reference parsed at all | 1.61 s median |
| First reference stable enough to display | 3.17 s (reached early in 1 of 9) |
| Final answer after you stop | **0.81 s** median inference |
| Provisional passes per utterance | 2 median (range 1–5) |
| Bible lookup | ~1 ms cached, ~0.31 s when the passage is new |

**These are worse than the last gate's numbers and that is the trade.** The
previous recogniser answered in 0.13 s and got the first reference of a real
human test wrong enough to produce nothing at all. Whisper takes about six times
longer per pass. Words now appear at ~1.5 s rather than ~0.64 s, and the passage
lands roughly 0.7 s later. If that feels too slow to use, say so — it is a real
cost and it is the main thing this gate is asking you to judge alongside
accuracy.

The first line is the one that answers the complaint. Words appear at about
**0.65 s**, long before any reference is understood — that is the difference
between watching it work and speaking into silence.

**Every one of the nine displayed the correct reference, and none displayed a
wrong one at any point.** What each card actually showed, revision by revision:

| Utterance | Withheld along the way | Card showed | When |
|---|---|---|---|
| "John three sixteen" | John 3:**6** (heard once) | John 3:16 | 1.90 s |
| "Turn with me to John chapter three verse sixteen" | John 3, John 3:**60** | John 3:16 | 3.60 s |
| "Let us read Romans eight twenty eight" | Romans 8:28 (heard once) | Romans 8:28 | 2.91 s |
| "Psalm twenty three one" | Psalms 23, Psalms 23:1 (once) | Psalms 23:1 | 2.11 s |
| "First John four eight" | — | 1 John 4:8 | 1.87 s |
| "Let us read first John chapter four verse eight" | 1 John 4 (chapter only) | 1 John 4:8 | 3.56 s |
| "John three six" *(genuinely 3:6)* | John 3:6 (heard once) | **John 3:6** | 1.66 s |
| "Let us read John chapter three verse six" *(genuinely 3:6)* | John 3 (chapter only) | **John 3:6** | 3.29 s |
| "John three sixteen, for God so loved the world…" | John 3 (chapter only) | John 3:16 | **2.33 s**, 2.8 s before the end |

The last three rows are the ones that prove the rule is bounded rather than
merely strict. A genuine John 3:6 still displays — the rule delays a reading by
one revision, it never makes one unreachable. And a reference said early in a
longer sentence displays well before the speaker stops and then stays put,
which is where progressive recognition actually pays.

**The cost, stated plainly.** For the five gate references the stability rule
removes early display entirely: each of them names its verse in only one
provisional before the final, so "heard twice" and "wait for the end" amount to
the same thing, and the card fills 0.5–0.9 s later than it would have. What was
bought for that is the John 3:6 flash, which is gone. The **transcript at
0.64 s** is what carries the live feeling; the early passage is a bonus for
longer phrasings.

In the rehearsal itself **nothing was dropped**: at 83 ms of inference against a
400 ms cadence the recogniser is idle most of every interval, which is what the
cadence was chosen for. Backpressure was measured separately, by firing five
snapshots without reading any of them — only the two newest were answered, three
were discarded before they cost anything, and a final was never displaced by a
provisional.

One more thing measurement changed. The same half-second clip cost **2.29 s** on
the first request after the service had sat idle, and 0.05 s on every request
after that — Metal releasing what it is not using, not compilation, which was
already paid at startup. A service is started before a meeting and left alone,
so the operator's *first* reference was reliably the slowest thing they would
ever see.

The wake-up is now paid when the socket opens — pressing "Start listening" warms
the recogniser while you are still reaching for the microphone — and repeated
quietly for as long as that connection stays open. The first real request after
connecting costs **0.14 s**. Two things had to be measured rather than assumed to
get there: warming with digital silence cost more than a real utterance of the
same length, and skipping the connect-time warm because a request had been served
recently put the 1.5 s straight back — recent work is not evidence that the GPU
is still resident.

### What the rehearsal could not test

- **A real voice in a real room.** Synthetic speech has no breath, no room
  reflection, no varying distance from the microphone, and no accent. This is
  the entire reason the gate exists.
- **The provisional card behaviour on screen.** The test environment has no DOM,
  so the rule that a provisional is published only after a successful lookup is
  verified by reading the code and by the parser tests underneath it — not by a
  rendered assertion.
- **Live microphone capture.** Browser automation cannot obtain microphone
  permission, so no automated pass exercises `getUserMedia` at all.
