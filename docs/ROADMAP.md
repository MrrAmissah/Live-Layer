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
- **Dynamic date/time fields** — `{{date}}`/`{{time}}`/`{{countdown}}` tokens.
- **Layout / size controls** — beginner-safe, safe-area-aware output sizing.
- **Production QA pass** — `/setup` diagnostics, OBS production QA pack, regression guardrails verified ([`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md)).

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
