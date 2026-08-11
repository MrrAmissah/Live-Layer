# ASR benchmark harness

The measuring instrument for [`docs/ASR_EVALUATION.md`](../../docs/ASR_EVALUATION.md) §5.
It answers *what does a DONDO checkpoint cost on this machine* — real-time factor,
latency, memory, thermal drift, and effect on OBS — and produces real transcripts to
run through the reference-outcome harness in `src/lib/asr/`.

**This is not a product feature and is not wired into the app.** LiveLayer imports
nothing from here and nothing here imports LiveLayer's runtime. The
`LiveTranscriptSource` described in §4 — microphone capture, a listening UI, a live
transcript feeding candidates — may not be built until §6 Gate A is cleared, and
clearing it needs evidence this harness alone cannot produce (see *What this cannot
measure* below).

## What is never committed

- **No model weights.** Downloaded to `~/LiveLayer-ASR-Eval/hf-cache`, outside the
  repository. `checkpoints.json` records the `model.safetensors` SHA-256 per §4.
- **No audio.** Not the synthetic clips, and above all no recording of any person.
  §7 governs real audio: consent before recording, local storage outside the repo,
  deletion when the benchmark concludes, and transcripts count as recordings.
- **No credentials.**

Everything here is scripts and JSON measurements.

## Setup

Homebrew's Python bottles on this machine link `pyexpat` against a newer libexpat
than macOS ships, so `ensurepip` fails and a brew-Python venv cannot install
anything. Use `uv`, which brings its own self-contained interpreter:

```sh
brew install uv
uv venv --python 3.12 ~/LiveLayer-ASR-Eval/venv
uv pip install --python ~/LiveLayer-ASR-Eval/venv/bin/python torch transformers numpy
```

Verify the interpreter is **arm64** before trusting any timing. `/usr/local/bin/python3`
is the leftover Intel Homebrew; an x86_64 interpreter runs under Rosetta with no MPS
and produces a real-time factor that looks like a measurement and is not one.

```sh
~/LiveLayer-ASR-Eval/venv/bin/python -c \
  "import platform,torch;print(platform.machine(), torch.backends.mps.is_available())"
# expect: arm64 True
```

## Running

```sh
# 1. corpus out of TypeScript, audio in (synthetic — see make-audio.mjs)
node scripts/asr-benchmark/export-corpus.mjs ~/LiveLayer-ASR-Eval/corpus.json
node scripts/asr-benchmark/make-audio.mjs ~/LiveLayer-ASR-Eval/corpus.json ~/LiveLayer-ASR-Eval/audio

# 2. weights to the ignored cache, checksum recorded
#    curl with byte-range resume, because the CDN truncates unauthenticated
#    transfers mid-file and huggingface_hub's own retry did not resume from it
scripts/asr-benchmark/fetch-checkpoint.sh \
  KhayaAI/w2v-bert-en ~/LiveLayer-ASR-Eval/models/w2v-bert-en

# 3. RTF / backends / memory / transcripts. --repo is the LOCAL directory from
#    step 2; passing a Hub id re-downloads 2.4 GB.
~/LiveLayer-ASR-Eval/venv/bin/python scripts/asr-benchmark/benchmark.py \
  --audio ~/LiveLayer-ASR-Eval/audio \
  --repo  ~/LiveLayer-ASR-Eval/models/w2v-bert-en \
  --out   ~/LiveLayer-ASR-Eval/results/bench-en.json \
  --backends mps:float32,mps:float16,cpu:float32 --chunks 0,30,15

# 4. reference outcomes through the SAME scorer the test suite runs. Reads the
#    benchmark report directly; BACKEND picks which corpus run to score.
BACKEND=mps:float32 node scripts/asr-benchmark/score-transcripts.mjs \
  ~/LiveLayer-ASR-Eval/results/bench-en.json ~/LiveLayer-ASR-Eval/results/score-en.json

# 5. 90-minute soak with OBS under load (see "OBS safety" below)
node scripts/asr-benchmark/run-soak.mjs --baseline=300 --soak=5400 --recovery=180
```

A **multilingual** checkpoint additionally needs its language declared — DONDO's
prefix conditioning cannot infer one, and the id map is global rather than per-model:

```sh
scripts/asr-benchmark/fetch-checkpoint.sh \
  KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en ~/LiveLayer-ASR-Eval/models/w2v-bert-multi
~/LiveLayer-ASR-Eval/venv/bin/python scripts/asr-benchmark/benchmark.py \
  --audio ~/LiveLayer-ASR-Eval/audio --repo ~/LiveLayer-ASR-Eval/models/w2v-bert-multi \
  --language 'African English' --backends mps:float32 --chunks 0,30 \
  --out ~/LiveLayer-ASR-Eval/results/bench-multi.json
```

To characterise degradation rather than only the clean case — `--name` becomes a
sibling audio directory you can pass to `--audio`:

```sh
~/LiveLayer-ASR-Eval/venv/bin/python scripts/asr-benchmark/degrade-audio.py \
  --audio ~/LiveLayer-ASR-Eval/audio --snr 10 --rt60 0.35 --name audio-snr10
```

## OBS safety

`obs-stats.mjs` **never calls `StartStream`**, and refuses to run at all if OBS is
already streaming. This install points at the church's real endpoints; an accidental
start is a broadcast, not a test. The soak loads the encoder with a **local
recording**, and deletes the file it created.

Frame counters are reported as deltas across each window. OBS's totals run since
launch, so a rig that dropped frames an hour ago would otherwise be charged to the
recogniser.

## What this cannot measure

The synthetic audio is a macOS voice reading hand-written sentences in a silent
room: clean articulation, no PA system, no congregation, no reverb, no
code-switched prosody. That is the most favourable condition a recogniser can be
given and close to the read-religious-text domain DONDO was trained on.

So accuracy numbers from this harness are an **optimistic bound and a check that
the transcript's shape fits the parser** — not the Gate A number. Gate A requires
top-1/top-k recall and a misleading-top rate on **real church audio**, plus operator
testing that wrong candidates are reliably caught at the review step. Neither can be
synthesised, and no amount of running this harness substitutes for them.

The timing numbers — RTF, latency, memory, thermal drift, OBS impact — are
properties of the machine and the model rather than of the speaker, and those are
honest measurements.


## The live speech service

`scripts/speech-service/server.py` is the local recogniser the product uses — the
same `Recogniser` this harness benchmarks, behind a WebSocket.

```sh
uv pip install --python ~/LiveLayer-ASR-Eval/venv/bin/python websockets
~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/server.py \
  --repo ~/LiveLayer-ASR-Eval/models/w2v-bert-en
```

It binds `127.0.0.1`, has no command surface, stores nothing, and logs timings but
never transcripts — a verbatim transcript of a sermon carries the same content and
the same obligations as the recording (§7). When it is not running the control
surface degrades to typing, which is the normal state: the operator starts it
deliberately before a service.

`endpointing.py` measures what the VAD costs, separating the hangover from
inference — the two must not be reported as one number.
