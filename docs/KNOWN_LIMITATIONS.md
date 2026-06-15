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
  no auto-configuration and no OBS WebSocket integration. `/setup` →
  **Production readiness** offers diagnostics (origin, storage/messaging checks)
  but cannot itself prove the dock and source share storage — the real check is
  Take → refresh `/output` → confirm it returns (see `OBS_PRODUCTION_QA.md`).
- **Same-origin is mandatory.** The dock and Browser Source must use the *exact*
  same origin (scheme + host + port). Mixing `localhost` and `127.0.0.1` silently
  breaks Take/Clear and uploaded-image resolution.
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
- **Rundown / queue mode is usable but not fully featured** —
  build in Library → Rundowns (R1+R2); operate from the **Live tab** queue (R3):
  select / Previous / Next, **Take selected** (the mode-aware sticky/deck Take),
  Clear, LIVE badge, manual done; and the Edit tab edits the **selected item** in
  place (text, layout, duration) with the ad-hoc draft preserved (R4); and the
  desktop/studio view has a full **queue panel** with reorder/duplicate/delete/
  done and selected/LIVE/done badges (R5). Still pending: **Take Next**,
  auto-advance, and drag-and-drop reorder (Up/Down only for now). Two notes: with a
  rundown active, the Take button takes the
  **selected item** on every tab (deselect the rundown to air a fresh draft); and
  **Brand colours/logo stay global** — editing them does not change a selected
  item's captured theme (per-item theme/logo editing is deferred). Soft caps apply
  (50 rundowns, 100 items each) with a friendly message at the limit. See
  [`RUNDOWN_QA.md`](RUNDOWN_QA.md) and [`RUNDOWN_QUEUE_SPEC.md`](RUNDOWN_QUEUE_SPEC.md).
- **No full asset browser yet** — logos/headshots upload locally, but there is no
  general-purpose asset management grid.
- **Import is preview-only; export is rundown-only.** You can **export** one rundown
  as a `.livelayerpack` (Library → Rundowns → Export, or the studio panel) — it
  bundles the rundown snapshot + referenced People + referenced asset blobs. You can
  also **preview** a pack before importing (Library → **Import** → choose a
  `.livelayerpack`): it validates the manifest and shows what's inside (rundown/item/
  people/asset counts, template ids, warnings). **The preview writes nothing** — no
  records, no asset blobs — and the Import button is disabled ("Import comes next").
  **Safe import** that actually loads a pack (IE4) and **Full Backup / restore**
  (IE5) are not built yet, so a pack can be created and inspected but not loaded back
  in. A pack made by a **newer** LiveLayer is blocked with a clear message. See
  [`IMPORT_EXPORT_PACKS_SPEC.md`](IMPORT_EXPORT_PACKS_SPEC.md).

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
