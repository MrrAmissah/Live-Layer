# Roadmap

Direction, not a commitment. Today's **alpha (v0.1)** ships the core loop:
two-surface OBS workflow, three templates, dock-first + studio control UI, live
preview parity, Take/Clear, auto-hide, slide/fade motion, brand theming, and
local presets. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for what that
does **not** include.

## Now (shipped in alpha)

- Transparent `/output` Browser Source + `/control` dock/studio surfaces
- Preacher lower third, scripture card, announcement banner
- Take / Clear / auto-hide, slide build + fade crossfade motion
- Brand colours + logo, reset-to-template, local presets
- Preview parity with `/output`, seed-test QA harness

## Phase 2 — shipped locally

> Phase 2 is specified in detail: [`PHASE_2_PRODUCT_SPEC.md`](PHASE_2_PRODUCT_SPEC.md).

- **Local asset system** — upload logos/headshots, store locally (IndexedDB), reference by id.
- **People / speaker library** — enter a speaker once, recall in two taps.
- **Scripture picker** — book/chapter/verse picker with auto-load (race-guarded); manual entry stays.
- **Dynamic date/time fields** — `{{date}}`/`{{time}}`/`{{countdown}}` tokens.
- **Layout / size controls** — beginner-safe, safe-area-aware output sizing.
- **Production QA pass** — `/setup` diagnostics, OBS production QA pack, regression guardrails verified ([`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md)).

## Next — content & confidence

> Phase 2 is QA'd and OBS-ready. **Rundown / queue mode** is now fully designed in
> [`RUNDOWN_QUEUE_SPEC.md`](RUNDOWN_QUEUE_SPEC.md) (snapshot items, Phases R1–R6) —
> implementation can begin next, ahead of the items below.

- **Rundown / queue mode** — build/run an ordered list of graphics live. **Complete for this phase (R1–R6).** See [`RUNDOWN_QA.md`](RUNDOWN_QA.md). Future: import/export, Take Next, auto-advance, drag-reorder, per-item brand.
- **More template layouts** — additional lower-third styles, full-frame title/section
  cards, scoreboard/ticker, headshot slot for lower thirds.
- **Operator animation picker** — surface slide vs fade in `/control` (the data path exists).
- **Import / export packs** — back up / move / share rundowns, Saved Graphics,
  People, and referenced assets between machines. Designed in
  [`IMPORT_EXPORT_PACKS_SPEC.md`](IMPORT_EXPORT_PACKS_SPEC.md) (`.livelayerpack` ZIP,
  non-destructive remap-on-import). **IE1 helpers + IE2 export-a-rundown + IE3
  read-only import preview done** (Library → Import); IE4 safe import (the first
  write) next, then IE5 Full Backup.

## Later — production scale

<!-- Rundown / queue mode moved up to "Next" — designed in RUNDOWN_QUEUE_SPEC.md. -->
- **OBS WebSocket helper** — assist or automate adding the dock and Browser Source,
  and optionally trigger scene/source actions.
- **Remote / tablet control** — drive the output from a second device (requires a
  small local relay; today's `BroadcastChannel` is single-machine).

## Eventually — packaging & ecosystem

- **Tauri desktop wrapper** — a real installable app so there's no manual dev server.
- **Template marketplace** — discover/share community templates and brand kits.
- **Optional cloud sync** — opt-in backup/sharing of presets and brand kits.

> Cloud, accounts, and native plugins remain explicitly out of scope for the
> local-first core; anything cloud-facing would be opt-in.
