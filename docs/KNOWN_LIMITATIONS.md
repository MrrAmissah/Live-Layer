# Known limitations

LiveLayer is an **alpha (v0.1)**. The core production loop works, but the scope is
deliberately narrow. These are honest constraints, not bugs.

## Workflow & deployment

- **Local-first, single machine.** Everything runs in one browser context on one
  computer. Control and output communicate via `BroadcastChannel` + `localStorage`,
  so both surfaces must live in the **same browser/profile on the same machine**
  (this is normal for an OBS dock + Browser Source on the operator's PC).
- **You must keep the local dev server running.** There is no packaged app yet, so
  `npm run dev` (or a static host of `dist/`) has to stay up while you stream.
- **Manual OBS setup.** You add the dock and the Browser Source yourself; there is
  no auto-configuration and no OBS WebSocket integration.
- **Output is a Browser Source.** Graphics composite inside OBS via the transparent
  `/output` page — there is no native OBS plugin or hardware output.
- **No multi-operator / network sync.** Two people on two machines cannot drive the
  same output; there is no server relaying state.

## Not built yet

- **No cloud sync or accounts** — presets/brand live only in this browser's `localStorage`
  (clearing site data removes them).
- **No native desktop installer** (Tauri/Electron) — browser + OBS only.
- **Scripture lookup depends on a public provider** — WEB/KJV lookup is available,
  but manual paste remains the fallback if the provider is offline or rate-limited.
- **No visual layout builder** — beginner layout controls exist, but you can't drag/resize freely on screen.
- **No rundown / queue mode** — one graphic at a time; no playlist or sequence.
- **No full asset browser yet** — logos/headshots upload locally, but there is no
  general-purpose asset management grid.
- **No import/export of template or preset packs.**

## Smaller caveats

- **Three templates** ship today (lower third, scripture, announcement).
- **No animation picker in the UI** — slide is the default; the `fade` crossfade is
  configured per template / via a per-instance override (exercised through the seed
  harness), not yet operator-selectable in `/control`.
- **Brand override applies one accent across templates** — distinctness comes from
  layout, not colour (see `docs/REFERENCE_STYLE_ANALYSIS.md`).
- **Long text is handled by step-down sizing**, not reflow — extreme inputs are
  clamped, not perfectly typeset.
- **No automated tests** — QA is the manual checklist in `docs/QA_CHECKLIST.md`
  (no headless browser in the project yet).

See [ROADMAP.md](ROADMAP.md) for where several of these are headed.
