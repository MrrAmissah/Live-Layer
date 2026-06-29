# Control UI / UX

How the `/control` surface is built and why. The goal is a **broadcast control
surface a volunteer can learn in under two minutes and run during a live
service** — not a generic dark dashboard. This document is the source of truth
for control-page layout and interaction; visual tokens live in `DESIGN_SYSTEM.md`.

## Two experiences, one route

There are **no separate routes** for desktop vs OBS. `ControlPage` picks the
layout from one breakpoint (`useMediaQuery('(min-width: 1024px)')`, initialised
synchronously so there is no first-paint flash). Both layouts share the same
Zustand store, the same Take/Clear handlers, and the same preview-parity
renderer — only the information architecture differs.

- **< 1024px → Dock** (OBS Custom Browser Dock, tablets, narrow windows): a
  guided, one-task-at-a-time operator flow.
- **≥ 1024px → Studio** (full browser, portfolio screenshots): the multi-panel
  dashboard, where seeing everything at once is an asset.

## Dock mode — the primary experience

A fixed-height app frame (`height: 100dvh`, `100vh` fallback for OBS's embedded
Chromium). Three regions never move; only the middle scrolls:

```
┌─────────────────────────────────────┐
│ Status bar   LiveLayer · Scripture · Live │  ← sticky, always visible
├─────────────────────────────────────┤
│ ① Graphic  ② Edit  ③ Live │ Brand Library │  ← tab bar
├─────────────────────────────────────┤
│                                     │
│   one step's content (scrolls)      │  ← only the active step is mounted
│                                     │
├─────────────────────────────────────┤
│ ▶ TAKE LIVE        Clear   Auto-hide 6s │  ← sticky, always visible
└─────────────────────────────────────┘
```

### Beginner workflow

The whole dock is organised around a plain primary path; the operator is never asked
to understand more than one at a time:

1. **Choose a graphic** (Graphic tab) — radio-style cards, one tap to select.
2. **Edit the text** (Edit tab) — fields for the selected template + a live thumbnail.
3. **Take it live** (Live tab) — a large preview, safe layout controls, auto-hide, and live status.

Brand and Library are **secondary** tabs after a divider — present, but visually
quieter so they never compete with the main path. Library contains Saved Graphics
and People, avoiding extra top-level tabs for presets and speakers. Selecting a
graphic or editing text shows a `Next →` button that walks the operator forward;
the tab bar lets them jump anywhere.

### Sticky status bar (top)

Always answers *"what am I working on and is it live?"*: app identity, the
selected graphic's name, and a plain **Ready / Live / Cleared** pill (the dot
pulses on Live). It stays pinned while steps scroll.

### Sticky live bar (bottom)

The dock's single, always-visible **Take live / Clear**, plus the current
auto-hide value as a readout. It is pinned below the scroll area so the operator
is never more than one tap from air, on **every** tab.

> The Live tab intentionally has **no second Take button** — the sticky bar is on
> screen while the Live tab is active, so it *is* the Live tab's Take. One Take in
> one fixed place beats a button that moves between tabs. The Live tab instead
> owns the big preview, layout controls, the auto-hide selector, and the last-action status.

### Context helpers

The Edit tab only shows helpers relevant to the selected graphic:

- Announcement Banner shows Insert date/time buttons.
- Scripture Card shows Translation + Look up.
- Lower Third speaker reuse lives in Library → People.

The Live tab owns beginner-safe layout choices: Size, Position, Density, and Safe
margin. There is no freeform drag/resize editor.

### Edit target — draft vs rundown item

Every content/layout/duration editor reads & writes through one abstraction
(`useEditTarget`). With **no rundown active** it edits the ad-hoc **draft** (the
default). With an **active rundown and a selected item**, the editors target that
**item's snapshot** instead — an "Editing rundown item" banner makes this explicit,
the ad-hoc draft is preserved, and (in rundown mode) the Edit surface gains the
layout/duration controls so it's the full item editor. Editing a *live* item updates
the preview only; **Take selected** re-fires it. Brand colours/logo stay global (they
don't alter a selected item's captured theme).

### Plain language

The main flow avoids jargon. Use "Choose a graphic", "Edit the text", "Take it
live", "Clear". Avoid "resolved theme", "template schema", "animation override",
"transparent output" — those belong in `/setup` and docs, not the operator path.

## Studio mode — full browser

A single responsive CSS grid (`.studio-grid`) for roomy widths. Three columns at
≥1180px: template **rail** (left, full height), **preview** + **editor** (center),
**on-air actions** + **brand** + **library** (right). Panels stretch to fill
their cells so leftover space becomes panel surface, never dead black gaps. This
is the screenshot/portfolio view and is deliberately information-dense.

When a rundown is active, the **On-air actions** column hosts the richer
`StudioRundownPanel` (R5): the full ordered list with reorder/duplicate/delete/
done and selected/LIVE/done badges, plus Previous/Next — so the operator manages
and runs the queue without returning to Library. Take/Clear stay the deck buttons
above it (one mode-aware Take). The dock keeps the compact `RundownQueue`.

## Component map

```
ControlPage                 realtime channel + Take/Clear + last-action; picks Dock vs Studio by breakpoint
├─ DockShell (< 1024px)     fixed-height frame; owns the active-tab state
│  ├─ DockStatusBar         identity · selected graphic · Ready/Live/Cleared
│  ├─ DockTabs              ①Graphic ②Edit ③Live │ Brand Library
│  ├─ steps/TemplateStep    StepIntro + TemplateList + Next
│  ├─ steps/EditStep        StepIntro + small preview + TemplateFields + Next
│  ├─ steps/LiveStep        StepIntro + large preview + DurationControl + LastActionLine
│  ├─ steps/BrandStep       StepIntro + BrandControls
│  ├─ steps/LibraryStep     StepIntro + LibraryControls
│  └─ StickyLiveBar         always-visible Take / Clear / auto-hide readout
└─ ControlShell (≥ 1024px)  CommandBar + studio grid
   ├─ CommandBar · TemplateRail · PreviewPanel · FieldEditor
   ├─ LiveActionsPanel · BrandPanel · LibraryPanel

Shared presentational (used by BOTH layouts, each owns its store slice):
  TemplateList · TemplateFields · BrandControls · PresetControls · PeopleLibrary
  DurationControl · LastActionLine · TemplateCard
Primitives: Panel · SectionHeader · StatusBadge · StepIntro
```

- **State**: every leaf reads its own slice from the store directly. Only the
  realtime channel and Take/Clear live in `ControlPage`. Extracting the shared
  presentational components was a pure JSX move — no store call or handler
  changed — so presets, Take/Clear, and realtime behave identically in both layouts.
- **Parity rule**: both layouts render the same `TemplatePreview`. The dock passes
  `showControls={false}` to hide only the backdrop/safe-area toolbar; the
  `GraphicStage` + renderer + theme call is byte-identical, so `/output` parity holds.

## Visual design rules

- Deep graphite/navy base with restrained corner glow; no flat black.
- Selection is a **radio dot**, not a text badge — cards stay light on text
  (name + category, no description, no "selected" label).
- Accent (cyan) marks the active tab/step/selection and the Take button — nothing
  else competes for it. Gold stays a quiet category accent.
- One Take, always loud, always in the same place (sticky bar in dock; the action
  deck in studio).
- Strong hierarchy: a big step title + one helper sentence beats a wall of tiny
  uppercase labels. Reserve letter-spacing for small eyebrows only.
- State is glanceable: status pill, segmented auto-hide, live last-action line.

## What not to do

- Don't stack every panel in one long dock scroll — that buried Take/Clear and is
  exactly the problem this layout replaced.
- Don't show a second Take on the Live tab (the sticky bar is it).
- Don't put backdrop/safe-area/debug controls in the beginner dock flow.
- Don't use jargon in the main path; keep technical detail in `/setup`.
- Don't add separate desktop/dock routes — responsive layout only.
- Don't touch `/output`, the preview-parity renderer, presets, Take/Clear,
  auto-hide, realtime, or transparency while restyling.

## Future improvements

- Optional auto-advance to Edit on first template pick (currently explicit Next).
- Keyboard radio semantics (arrow-key roving) on the template radiogroup.
- Surface an animation-mode (slide/fade) picker once it has a control-side UI.
- Studio mode could adopt the same plain-language headings as the dock steps.
