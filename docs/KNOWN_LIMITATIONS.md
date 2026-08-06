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
  `/output` page — there is no native OBS plugin or native NDI output. You can
  send the finished OBS scene/program over NDI with an OBS plugin workflow such
  as DistroAV/NDI.
- **LAN control is beta.** The optional LAN relay can carry Take/Clear/live graphic
  messages between devices, but uploaded assets, People, Saved Graphics, and
  rundowns are still browser-local. Host-owned asset/library storage is not built
  yet.

## Not built yet

- **No cloud sync or accounts** — presets/brand live only in this browser's `localStorage`
  (clearing site data removes them).
- **No native desktop installer** (Tauri/Electron) — browser + OBS only.
- **Scripture lookup depends on a public provider** — eleven public-domain
  translations are available (WEB, KJV, ASV, BBE, Darby, DRA, WEBBE, OEB-US, OEB-CW,
  YLT, Almeida) via bible-api.com. Manual paste remains the fallback if the provider
  is offline or rate-limited. Copyrighted translations (NIV, ESV, NLT) are not
  carried by this provider and are not available.
- **Verse numbers are not validated.** Chapters are checked against bundled per-book
  data, so `John 99:1` is refused — but there is no per-chapter verse data, so
  `Psalms 23:99` is accepted and simply returns nothing from the provider.
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
  **Brand colours/logo follow the visible target** — with an item selected they edit
  that item and leave the persisted brand default untouched, so recolouring one
  queued graphic never redefines the ones made afterwards. Soft caps apply
  (50 rundowns, 100 items each) with a friendly message at the limit.
- **No full asset browser yet** — logos/headshots upload locally, but there is no
  general-purpose asset management grid.
- **Import/export is selected-rundown only.** You can **export** one rundown
  as a `.livelayerpack` (Library → Rundowns → Export, or the studio panel) — it
  bundles the rundown snapshot + referenced People + referenced asset blobs. You can
  also **preview and safely import** a selected-rundown pack (Library → **Import**):
  import creates a new rundown, remaps all ids, restores bundled assets, restores
  referenced People, and never overwrites existing records. Missing asset blobs warn
  and fall back to placeholder/monogram behavior. **Full Backup / restore** (IE5),
  replace mode, People/Assets-only packs, and standalone Saved Graphics import are
  not built yet. A pack made by a **newer** LiveLayer is blocked with a clear
  message.

## Voice assist

- **There is no microphone.** The voice assist panel interprets a **typed**
  transcript. No audio is captured, no speech provider is contacted, no model is
  installed, and no credential exists. See [ASR_EVALUATION.md](ASR_EVALUATION.md).
- **Nothing it produces can reach air by itself.** It offers candidate references;
  the operator retrieves, reviews the passage text, and accepts it into the ordinary
  Scripture draft. Take is still a separate, deliberate press.
- **Reference interpretation has known bounds**, recorded in
  `src/lib/scripture/spokenReference.ts`: a reference list with no conjunction can
  mis-segment ("Romans eight one John three sixteen" reads as Romans 8 and 1 John
  3:16, because "one John" is a real book name); "Psalm one nineteen" reads as 1:19
  rather than 119; stutters are not repaired; and a disfluency inside a reference
  truncates it to the chapter.
- **References spoken in Twi, Ga or Ewe are not interpreted.** Book names and number
  words are English-only. Code-switched framing *around* an English reference works.
- **No performance claim is made for live recognition**, because none has been
  measured. Our own harness shows wrong-passage outcomes beginning around 5% word
  error rate, which is below every published figure for the candidate models — which
  is exactly why operator review is required rather than optional.

## Smaller caveats

- **Seven templates** ship today: preacher lower third, scripture card, announcement
  banner, quote card, event banner, sermon title, and fullscreen message.
- **No animation picker in the UI** — slide is the default; the `fade` crossfade is
  configured per template / via a per-instance override (exercised through the seed
  harness), not yet operator-selectable in `/control`.
- **Brand override applies one accent across templates** — distinctness comes from
  layout, not colour.
- **Long text is handled by step-down sizing**, not reflow — extreme inputs are
  clamped, not perfectly typeset.
- **No full browser/OBS automation yet** — `npm run verify` guards the build,
  output isolation, transparency, and asset-id message contract; route smoke is
  available with `npm run smoke:routes`. End-to-end OBS/browser behavior still
  relies on the manual checklist in `docs/QA_CHECKLIST.md`.

See [ROADMAP.md](ROADMAP.md) for where several of these are headed.
