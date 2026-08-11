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
~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/server.py \
    --repo ~/LiveLayer-ASR-Eval/models/w2v-bert-en --verbose
```

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
listening. Grant it. If it does not ask, the site permission is already set —
check the padlock in the address bar.

### Before you speak

- Check the meter moves when you talk and is still when you do not. It is driven
  by measured input level, so a still meter means nothing is arriving — that is
  a microphone problem, not a recognition problem, and there is no point
  continuing until it moves.
- Speak at the distance and volume you would actually use in the booth.

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

**While you are still speaking**, a card may appear labelled *"Updating while
you speak"*. That is a guess made from the audio so far, and it is allowed to be
wrong — it is recognised again the moment you stop.

**One thing to expect and not be alarmed by:** the guess can be a real but
different verse. In rehearsal, "John three sixteen" produced **John 3:6**
partway through, before correcting to John 3:16. That is the honest behaviour of
recognising an unfinished sentence, which is why the card says it is still
updating and why nothing is accepted automatically.

A guess that names only a chapter — "John 3" — is deliberately **not** shown
while you are still speaking. It retrieves perfectly well, which is the problem:
it would fill the card with the whole chapter for a moment and then collapse to
one verse. Mid-sentence, a chapter with no verse is almost always a reference
you have not finished saying.

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

Plus one sentence on **how it felt** — specifically whether something visibly
happened while you were still speaking, or whether it still feels like speaking
into silence and waiting. That was the complaint that stopped the last run, and
it is not something a number can answer.

---

## What was rehearsed before asking for this

So that the human run starts from a known position rather than from hope. All of
it used the **real browser endpointer**, the **real recogniser** and the **real
parser** — the only synthetic part is the voice.

Six utterances covering all five references were synthesised with the same voice
and rate as the Stage 5 corpus (`say -v Tessa -r 165`), padded with room tone,
and pushed through the endpointer in 1024-sample blocks exactly as a
`ScriptProcessor` delivers them.

**All six produced the correct reference at the final stage.** Two defects were
found and fixed on the way there:

- `Romans 8:28` was **refused outright**. The recogniser returns `romans eig
  twenty eight`; a damaged *book* was already repaired but a damaged *number*
  was not, so the whole reference was discarded.
- A provisional could display **John 3:60** — a verse that does not exist —
  because "…verse sixty" parses perfectly a moment before you say "sixteen".
  Provisional cards are now published only once their passage has actually been
  retrieved, so a reference that cannot exist is never shown.

Measured over those six utterances, from the moment speech starts:

| | |
|---|---|
| First words back on screen | **0.65 s** median |
| Final answer after you stop | **0.12 s** median inference |
| Provisional passes per utterance | 5 median (range 2–6) |
| Provisional inference | 83 ms median |
| Bible lookup | ~1 ms cached, ~0.31 s when the passage is new |

The first line is the one that answers the complaint. Words appear at about
**0.65 s**, long before any reference is understood — that is the difference
between watching it work and speaking into silence.

**A verse arriving early is the smaller effect, and it is uneven.** Written out
per utterance rather than as a median, because a median hides which half you are
in:

| Utterance | Verse visible early | vs. waiting for the endpoint |
|---|---|---|
| "John three sixteen" | 1.06 s | 0.84 s earlier — but as John 3:**6**, corrected at the end |
| "Turn with me to John chapter three verse sixteen" | — | nothing early |
| "Let us read Romans eight twenty eight" | 2.34 s | 0.56 s earlier, correct |
| "Psalm twenty three one" | 1.46 s | 0.64 s earlier, correct |
| "First John four eight" | — | nothing early |
| "Let us read first John chapter four verse eight" | — | nothing early |

So **three of six** show a verse before the speaker stops, by roughly 0.6–0.8 s,
and one of those three shows a wrong one first. The other three show only the
moving transcript until the end — two because their guesses were chapter-only
and are deliberately withheld, one because it is too short for a provisional to
have a complete reference at all.

That is a real improvement and a modest one, and it is worth being clear about
which part is doing the work: the **transcript at 0.65 s** is what removes the
feeling of speaking into silence. The early verse is a bonus that arrives for
some phrasings and not others.

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
ever see. The recogniser now runs a half-second heartbeat of silence while idle;
after 90 seconds untouched the first real request costs **0.16 s**.

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
