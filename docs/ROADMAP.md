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

## Next — content & confidence

> Phase 2 is QA'd and OBS-ready. Rundown / queue mode is implemented for the
> current local-first phase; selected-rundown import/export packs are ready for
> manual browser/OBS round-trip confirmation before Full Backup work starts.

- **Rundown / queue mode** — build/run an ordered list of graphics live. **Complete for this phase.** Future: Take Next, auto-advance, drag-reorder, per-item brand.
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

- **Operator-reviewed live speech assist — evaluation stage only.** No provider is
  selected and nothing captures audio. DONDO (Apache-2.0, 27 African language
  varieties) is the leading candidate on licence and coverage grounds; the transcript
  port it would plug into already ships. Before any live capture: run the Apple
  Silicon benchmark, measure reference outcomes on real church audio, and clear
  Gate A in [ASR_EVALUATION.md](ASR_EVALUATION.md).
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
