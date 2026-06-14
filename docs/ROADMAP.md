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
- **Scripture lookup** — fill the verse from a reference; manual entry stays.
- **Dynamic date/time fields** — `{{date}}`/`{{time}}`/`{{countdown}}` tokens.
- **Layout / size controls** — beginner-safe, safe-area-aware output sizing.

## Next — content & confidence

- **More template layouts** — additional lower-third styles, full-frame title/section
  cards, scoreboard/ticker, headshot slot for lower thirds.
- **Operator animation picker** — surface slide vs fade in `/control` (the data path exists).
- **Import / export packs** — share template + preset + brand bundles as JSON.

## Later — production scale

- **Rundown / queue mode** — stage a sequence of graphics and step through them live.
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
