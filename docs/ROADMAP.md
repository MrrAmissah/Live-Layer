# Roadmap

Direction, not a commitment. Today's **alpha (v0.1)** ships the core loop:
two-surface OBS workflow, expanded templates, dock-first + studio control UI,
live preview parity, Take/Clear, auto-hide, slide/fade motion, brand theming,
local presets, rundowns, and selected-rundown import/export. See
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for what that does **not** include.

## Now (shipped in alpha)

- Transparent `/output` Browser Source + `/control` dock/studio surfaces
- Preacher lower third, scripture card, announcement banner, quote card, event
  banner, sermon title, and fullscreen message
- Take / Clear / auto-hide, slide build + fade crossfade motion
- Brand colours + logo, reset-to-template, local presets
- Preview parity with `/output`, seed-test QA harness

## Phase 2 — shipped locally

- **Local asset system** — upload logos/headshots, store locally (IndexedDB), reference by id.
- **People / speaker library** — enter a speaker once, recall in two taps.
- **Scripture picker** — book/chapter/verse picker with auto-load (race-guarded); manual entry stays.
- **Dynamic date/time fields** — `{{date}}`/`{{time}}` tokens. (`{{eventTime}}` and
  `{{countdown}}` shipped as tokens here but had no supplier and never resolved;
  see the service work in Phase 4 below.)
- **Layout / size controls** — beginner-safe, safe-area-aware output sizing.
- **Production QA pass** — `/setup` diagnostics, OBS production QA pack, regression guardrails verified ([`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md)).

## Phase 3 — Scripture and voice assist (shipped locally)

- **Scripture workspace** (`/control/scripture`) — reference → passage from eleven
  public-domain translations, bounded recents, staged as an ordinary draft.
- **Voice assist preview** — a **typed** transcript becomes ranked candidate
  references for the operator to choose between. No microphone, no speech provider,
  no model, no credentials. Nothing reaches air without review and a Take.
- **Evaluation harness** — reference-outcome scoring (`src/lib/asr/`) that measures
  whether an utterance yields *every* passage named, in order, and separates a
  harmless refusal from a wrong leading candidate.
- **Relay routing and readiness hardening** — truthful relay states (`ready`,
  `unreachable`, `not-relay`) instead of "connected" for anything that answers;
  canonical redirects that preserve the relay parameter; and readiness that is
  honestly not an output acknowledgement.

## Phase 4 — service & event workflow (shipped locally)

- **Service context** — the production being prepared: a name and a local
  wall-clock start time, stored exactly as typed so no conversion can move a
  10:30 service across a DST boundary. Settable from the studio command bar and
  from the dock's Settings tab; it does not own the event pack.
- **`{{eventTime}}` and `{{countdown}}` became real** — they resolve against the
  service, and the insert helper offers them only against a genuinely configured
  start time. With none set they stay visibly unresolved rather than inventing
  a time.
- **Program context isolation** — going to air freezes the service onto the
  published graphic, so setting up the next service cannot retime a countdown
  that is already showing. Preparation (drafts, saved graphics, rundown items)
  carries no context, so a rundown reused next week counts down to the service
  being run.
- **Rundown duplication** — copy a whole service to start the next one. Items,
  content and raw tokens travel; the last-sent cursor, the selection and `done`
  do not, because those are a record of a service being run.

## Phase 5 — rundown live operation (shipped locally)

The rundown was good at *preparation*; this makes running one feel like a
rundown while the service is happening.

- **Take Next** — sends the next item and moves the operator onto it. Goes
  through the one existing publish boundary and the one in-flight guard, so
  there is still exactly one path to air. Both cursors advance **only after the
  command is out**: a cursor that moved without a graphic going out is a cursor
  lying about where the operator is.
- **"Next" has a single definition** — *the first item after the selection that
  is not done*, derived at read time, never stored. Anchored on the **selection**
  rather than on what was last sent, because `Clear` nulls `activeItemId`: an
  anchor on last-sent would be destroyed by an ordinary mid-service Clear and
  fall back to the top of the rundown, putting the opening graphic one keypress
  from air. Correct after reorder, skip, duplicate, reload and an item taken
  twice (`getNextTakeableItem`).
- **Honest refusal** — at the end, or when the rest are done, or when the next
  graphic is unready, Take Next is disabled *with the cause on screen*. It never
  wraps to the top. Three dead ends are told apart, because "the rest are marked
  done" is something the operator can undo and "nothing follows this" is not.
- **Done is the skip mechanism** — move past an item without deleting it. Take
  **never** sets `done` itself: an aired item would become permanently
  unreachable, and re-showing a lower third is ordinary.
- **Drag reorder** — order is operational once Take Next exists, so it is
  reorderable by drag as well as by the up/down buttons (which remain: HTML5
  drag is unreachable by touch and by keyboard). Reordering publishes nothing,
  moves no cursor, and rewrites no record of what was already sent.
- **Keyboard** — `Ctrl/Cmd + Enter`, chosen to be hard to hit by accident and
  refused inside any field. Take and Clear deliberately have no shortcut.
- **Deliberately NOT included: auto-advance.** Manual Take Next establishes the
  semantics first; auto-advance changes timing and failure behaviour and should
  answer to evidence from real use rather than ship beside this because the two
  appear together on a roadmap.

## Next — content & confidence

> Phase 2 is QA'd and OBS-ready. Rundown / queue mode is implemented for the
> current local-first phase; selected-rundown import/export packs are ready for
> manual browser/OBS round-trip confirmation before Full Backup work starts.

- **Rundown / queue mode** — build/run an ordered list of graphics live. **Take
  Next, drag-reorder and done/skip are shipped** (see Phase 5 below). Future:
  auto-advance, per-item brand.
- **More template layouts** — additional lower-third styles, full-frame title/section
  cards, scoreboard/ticker, headshot slot for lower thirds.
- **Operator animation picker** — surface slide vs fade in `/control` (the data path exists).
- **Import / export packs** — back up / move / share rundowns, Saved Graphics,
  People, and referenced assets between machines with `.livelayerpack` ZIP files
  and non-destructive remap-on-import. **IE1 helpers + IE2 export-a-rundown + IE3
  import preview + IE4 safe selected-rundown import are done** (Library → Import).
  Next: manually prove the rundown round-trip, then IE5 Full Backup / restore.
- **LAN control relay** — beta event relay for second-PC/tablet Take/Clear is in
  place; next is host-owned assets/libraries so remote operators can share logos,
  People, presets, and rundowns safely.

## Later — production scale

- **Operator-reviewed live speech assist — remediated and built, not validated.**
  Stage 5 measured DONDO and stopped: a third of utterances produced a confidently
  wrong passage, and latency to final was 15.6 s. **Two integration blockers turned
  out to be ours rather than the model's** — the spoken parser was reading the
  *typed* abbreviation table (`jon` is a declared alias of Jonah, so "John" became
  Jonah 3:16), and the pipeline buffered fixed windows instead of detecting when
  the speaker stopped. Fixing our two did not fix DONDO: its acoustic limits are
  substantial and unchanged.
  Fixing those moved misleading-top from **34.0% to 3.8%** on the same Stage 5
  transcripts and **12.0% to 3.6%** end-to-end on a held-out corpus frozen before
  the work began, with latency **15.6 s → 0.649 s**
  ([ASR_EVALUATION.md](ASR_EVALUATION.md) §9). DONDO's own acoustic limits remain.
  So the reviewed microphone assist now exists: explicit Start/Stop listening, a
  visible listening state, local inference only (`scripts/speech-service/`), final
  transcript → the existing candidate flow → operator reads the passage → explicit
  Accept → a separate Take. Typing is always immediately available and every
  failure degrades to it.
  **Gate A remains NOT CLEARED** — criterion 3 is unestablished and 4 and 6 have no
  evidence. What changed is the development decision: the engineering evidence is
  sufficient to build the reviewed assist **for real-world validation**, and it
  ships as an explicitly unvalidated validation-stage capability. The residual weakness is acoustic
  and out of reach of parser work: less common book names are mangled beyond safe
  recovery and **refuse**, so roughly 60% of named passages return nothing under
  degraded audio. If DONDO is replaced, the seam is `LiveTranscriptSource` and the
  local process behind it; everything else is provider-neutral.

- **Automatic acceptance or automatic Take — out of scope.** Distinct from the above
  and not a later phase of it. A finite corpus with no observed errors would not
  establish that auto-airing scripture is safe; it needs a different argument
  entirely (Gate B).
- **OBS WebSocket helper** — assist or automate adding the dock and Browser Source,
  and optionally trigger scene/source actions.
- **Remote / tablet control hardening** — host-owned asset/library storage,
  connection status, and better operator diagnostics around the beta LAN relay.

## Eventually — packaging & ecosystem

- **Tauri desktop wrapper** — a real installable app so there's no manual dev server.
- **Template marketplace** — discover/share community templates and brand kits.
- **Optional cloud sync** — opt-in backup/sharing of presets and brand kits.

> Cloud, accounts, and native plugins remain explicitly out of scope for the
> local-first core; anything cloud-facing would be opt-in.
