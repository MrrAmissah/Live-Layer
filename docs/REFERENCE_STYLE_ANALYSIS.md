# LiveLayer — Reference Style Analysis & Graphics Pack Rebuild Plan

Date: 2026-06-13 (implemented through 2026-06-14)
Status: Implemented — Phases 0–6 shipped. This document is retained as design rationale; the live `--gfx-*` token contract now lives in `DESIGN_SYSTEM.md` (single source of truth). Phases 3a–3c rebuilt all three templates, Phase 4 wired the `TemplateAnimation` enum (`slide` build / `fade` crossfade) via `data-anim`, Phase 5 brought preview parity through the shared `GraphicStage`.
Scope: Output templates (`src/components/templates/`), output stage (`src/app/OutputPage.tsx`, `src/styles.css`), preview parity (`TemplatePreview.tsx`). Control UI is touched only where it affects template configuration.

---

## 1. What was inspected

### 1.1 Current output templates

| File | Template | Styling approach |
|---|---|---|
| `src/components/templates/PreacherLowerThird.tsx` | Lower third | Tailwind utility classes + arbitrary values, inline `style={{ color: theme.primaryColor }}` |
| `src/components/templates/ScriptureCard.tsx` | Scripture | Tailwind utility classes; `theme` prop accepted but **never used** |
| `src/components/templates/AnnouncementBanner.tsx` | Announcement | Tailwind utility classes + one inline color style |
| `src/components/templates/registry.ts` | Schema + renderer map | `TemplateDefinition[]` with fields, defaults, per-template theme |
| `src/components/templates/TemplatePreview.tsx` | Control-side preview | Wraps renderer in `.preview-monitor` / `.monitor-stage` CSS |
| `src/app/OutputPage.tsx` | OBS output | `.output-root` / `.output-canvas` / `.output-graphic` from `src/styles.css` |

### 1.2 Current design tokens (actual values)

From `src/styles.css` `:root`:

- Fonts: `Inter, ui-sans-serif, system-ui, …` — one family, used at `font-semibold` (600) maximum in templates. No display/condensed face, no weight above 600 anywhere in the output graphics.
- Colors: `--accent: #22d3ee` (cyan), `--accent-strong: #06b6d4`, `--gold: #fbbf24`, slate surfaces (`rgba(10,15,26,0.92)` etc.). These are **control-UI tokens**; the output templates do not consume them — they hardcode Tailwind slate classes.
- Radii: `--radius: 1rem`; templates use `rounded-[2rem]`, `rounded-[1.75rem]`, `rounded-[1.5rem]`, `rounded-full` pills everywhere.
- Shadows: `--shadow-soft: 0 24px 80px rgba(0,0,0,0.24)` plus per-element inset keylines `inset 0 0 0 1px rgba(255,255,255,0.04)`.
- Tailwind config (`tailwind.config.js`) adds an `obs` gray palette and `shadow-soft` — neither is used by the output templates.

### 1.3 Current animation behavior (actual values)

- One global transition for every template: `.output-graphic { transition: opacity 0.35s ease, transform 0.35s ease; opacity: 0; transform: scale(0.96); }` → `.active { opacity: 1; scale(1) }` (`src/styles.css:341-357`).
- `OutputPage.tsx:49` unmounts the renderer after a `420ms` timer — **70ms longer than the 350ms CSS transition**, a latent mismatch if either number changes.
- The schema has `TemplateAnimation { in: 'fade'|'slide'|'grow'; out: … }` in `src/types/graphics.ts:19-22`, but **no template defines it and nothing reads it**. Animation is schema-dead.

### 1.4 Current output geometry (actual values)

- `.output-canvas` centers content both axes with `padding: 16px` (`src/styles.css:331-339`).
- `.output-graphic` is a centered 16:9 flex box; every template caps itself at `max-w-[980px]` and floats in the **middle of the frame**. There is no anchoring system: the "lower third" renders vertically centered. There is no 1920×1080 fixed coordinate space — everything is fluid `%`/`rem`, so composition changes with browser-source size.
- There are no safe-area margins (no title-safe/action-safe concept in the renderer; the only safe-area visualization is the debug overlay in `OutputPage.tsx:74-86`).

### 1.5 Control UI / schema flow (for context)

`ControlPage.tsx` builds a `GraphicInstance` (`buildGraphicInstance`, line 8) from `templateId + draftValues + theme + durationSeconds`, posts `SHOW_GRAPHIC` over `src/lib/realtime.ts` (BroadcastChannel + localStorage fallback), and `OutputPage` resolves the renderer via `templateRendererMap`. The Zustand store (`src/store/useLiveLayerStore.ts`) owns draft values, brand theme overrides, presets, recents. **This pipeline is sound and should be preserved unchanged** — the rebuild is renderer-side plus additive schema fields.

---

## 2. Reference image analysis (`reference-samples/`)

All nine images were viewed directly. Identifying details below describe composition only; no people, logos, names, or assets from these images may be reused.

| File | What it shows |
|---|---|
| `1782d664…jpg` | On-air YouTube frame: speaker lower third as a **near-full-width horizontal bar at the bottom edge**. Off-white textured plate with a torn/ripped top edge, collage texture (foliage, ink marks) filling the left half, a small yellow ticket-shaped brand element overlapping the bar's top-right corner. Name in heavy uppercase black sans, role/org beneath in a smaller white-on-black strip. Hard rectangle, zero corner radius. |
| `2eaedab5…jpg` | Design sheet of three event lower thirds: teal angular panels with **diagonal end cuts**, layered yellow brush shapes, a **circular gradient logo medallion overlapping the left edge**, a "NOW MINISTERING" tab hanging *below* the main bar, and a **black-and-white cutout headshot breaking out above the bar's top edge** with the person's name on a small white plate. Saturated brand color, hard geometry, multiple stacked layers. |
| `3e9d77a2…jpg` | Transparent-background lower third: full-width maroon band hugging the bottom edge with a **diagonal cut on the right end**, thin gold underlayer band beneath, serif name in white, gold uppercase role on a second line, presenter cutout standing on the band at left. |
| `745f8b98…jpg` | Scripture overlay: wide rounded banner in the lower third area with a red→purple gradient fill, and a **separate small white "Scripture Reference" tab attached above the top-left corner**. Verse body text in white on the gradient. (Weakest reference — the gradient is loud — but the *tab + body plate* structure is the takeaway.) |
| `9366b74d…jpg` | Minimal broadcast lower third on black: a **flat white rectangle** with three thin vertical accent stripes (red/orange/yellow) stacked on its left end, and a thin white **keyline bracket** hanging beneath as a secondary line slot. No radius, no shadow, no gradient. Pure geometry and color discipline. |
| `ab1f320b…jpg` | On-air sermon frame: scripture overlay built from **two stacked opaque plates** — a small black tab top-left with the reference in red condensed caps ("MARK 8:22–26" style), and a full-width off-white bar with the verse in **bold black uppercase condensed type**, brand mark bleeding off the right end. Completely opaque, hard edges, instantly legible over a busy stage background. |
| `b0f30cc4…jpg` | Transparent-background lower third: full-width purple→blue gradient band at the absolute bottom, a **white end plate at the left holding an institutional logo**, small orange quarter-circle accent at the top-right corner of the band. Slight forward skew on plate edges. |
| `b7de696…jpg` | Event lower third: full-width band of **layered red diagonal strips** (three tones of red stacked with skewed seams), hosts' cutout photo planted at the left edge rising above the band, **circular logo seal at the right**, condensed uppercase white headline with a yellow secondary line, plus a "LIVE" bug at top-right. |
| `c678412b…jpg` | Sermon lower third: full-width **skewed parallelogram bar** with a textured purple paint fill, a smaller darker-purple tab floating above its left end ("SERMON TITLE"), main text in heavy uppercase white. Two-layer tab-over-bar structure, hard skewed edges. |

### 2.1 What the references have in common (the visual language)

1. **Bottom-anchored, edge-aware composition.** Every graphic hugs the bottom of the frame, usually full-width or starting from the left edge, sitting inside or bleeding through the action-safe margin. Nothing floats centered in the frame.
2. **Hard, angular geometry.** Rectangles, parallelograms, diagonal end cuts, skewed seams, torn edges. Corner radius is either zero or barely perceptible. Not one large rounded card appears in any reference.
3. **Opaque plates for text.** Text always sits on a solid (or near-solid) fill — white plate, black tab, saturated brand band. None of the references put body text on translucent dark glass over video. This is the single biggest legibility difference.
4. **Layered, multi-part construction.** A graphic is 3–6 stacked elements: underlayer band + main bar + tab + accent stripe + medallion + cutout. The silhouette is irregular (tabs hang below, headshots break above, medallions overlap the left edge), which is what makes them read as "designed" rather than "a div."
5. **Two-tier condensed/bold typography.** Name or headline in heavy (700–900) uppercase — frequently condensed — at roughly 2.5–3× the size of the secondary line. The secondary line is differentiated by *color or plate*, not just size. Letter-spacing is normal-to-tight on the display line; wide tracking appears only on tiny labels, sparingly.
6. **One saturated brand hue + one accent + neutrals.** Teal+yellow, maroon+gold, red+yellow, purple+orange. Color is committed and opaque, not a 10%-alpha tint. Neutrals are true white and near-black, not slate-blue.
7. **Brand slots are physical objects.** Circular medallion/seal, ticket chip, end plate with a logo — placed to overlap an edge of the bar, never inset inside padding as a small rounded square.
8. **Headshot slots** (in the church/event references) are B/W or duotone cutouts planted on the bar, rising above its top edge.
9. **Motion implication** (from the on-air frames): these graphics are built for wipe/slide reveals along their own geometry — a bar slides in from the left edge or grows from a stripe; text reveals behind a clipping mask. A whole-graphic fade+scale would look wrong for any of them.

### 2.2 Why the references look more professional than current output

Direct comparison against the shipped renderers:

| References | Current LiveLayer output |
|---|---|
| Bottom-anchored, asymmetric, frame-aware | Vertically centered in frame (`.output-canvas { align-items: center }`), symmetric `max-w-[980px]` block |
| Hard edges, diagonal cuts, layered silhouette | `rounded-[2rem]` outer card with nested `rounded-[1.75rem]` cards — the exact "web card inside a web card" pattern |
| Opaque plates, saturated brand fills | `bg-slate-950/90`, `bg-slate-900/80` translucent dark glass with `border-white/10` 1px keylines — reads as a dashboard widget over video |
| Heavy condensed display type, tight | Inter 600 at `text-4xl` with multiple `tracking-[0.2em+]` uppercase micro-labels (`PreacherLowerThird.tsx:23,28`; `ScriptureCard.tsx:15,16,27`) — the exact "overuse of letter-spaced micro-labels" anti-pattern |
| Brand medallion overlapping the bar edge | 64px `rounded-[1.4rem]` logo square inset inside the card padding (`PreacherLowerThird.tsx:15-21`) |
| No self-labeling | Decorative filler chips baked into the graphic: "Broadcast-ready Scripture" (`ScriptureCard.tsx:27`), "Broadcast announcement" (`AnnouncementBanner.tsx:29`), plus an entire hardcoded explainer sentence (`ScriptureCard.tsx:26`) that an operator cannot edit and would never want on stream |
| Per-graphic directional motion | One global `fade + scale(0.96)` for everything (`styles.css:341-357`) |
| Theme drives color | `theme.accentColor` is effectively ignored — cyan and amber are hardcoded as Tailwind classes (`bg-cyan-400/30`, `rgba(251,191,36,0.12)`); the brand color pickers in `ControlPage.tsx:184-202` mostly do nothing visible |

### 2.3 What the current app is specifically missing

1. **A fixed 1920×1080 coordinate system.** Templates are fluid; at OBS browser-source sizes other than the design width, proportions drift. References are composed against a fixed frame.
2. **Anchoring + safe areas.** No concept of lower-left / lower-center / full-frame regions, no title-safe (5%) or action-safe (3.5%) margins in the layout itself.
3. **Opaque, brand-colored surfaces.** Everything is translucent slate. Over a bright camera feed (white wall, stage wash) the current cards lose contrast badly; the references never can, because their plates are opaque.
4. **A display type voice.** One font (Inter), one weight ceiling (600). No condensed/heavy face for names and headlines, no weight contrast between tiers.
5. **Angular construction primitives.** No clip-path panels, no skew, no accent stripes, no layered underbars. Only stacked rounded rectangles.
6. **A real animation system.** The `TemplateAnimation` type exists but is unwired; in/out is one fade for all templates; the 420ms unmount timer is decoupled from the 350ms CSS value.
7. **Theme propagation.** `TemplateTheme` reaches the renderers but is barely consumed; CSS custom properties are not used in the output layer at all.
8. **Preview parity.** `TemplatePreview` renders the template inside a rounded "monitor stage" with its own gradient background (`styles.css:211-228`) — the operator never sees the graphic positioned in a 16:9 frame the way `/output` will place it, and never sees it over anything resembling video.

---

## 3. Required design-system changes (concrete tokens)

These become a `gfx-*` token layer in `src/styles.css` (output-scoped, separate from the existing control-UI tokens) plus a small Tailwind extension. All sizes are authored against the fixed 1920×1080 frame in `px` and scale via a single root transform (§4 Phase 0).

### 3.1 Typography

- **Families** (self-hosted via `@fontsource`, the one justified dependency — local-first means no Google Fonts CDN):
  - `--gfx-font-display`: **Archivo** (variable, incl. SemiExpanded/Condensed axes) — names, headlines, references. Fallback: `'Arial Narrow', 'Helvetica Neue', sans-serif`.
  - `--gfx-font-text`: **Inter** (already the app face) — verse body, supporting copy, labels.
- **Weights**: display 700/800/900; text 400/500/600. Names and headlines never below 700.
- **Type scale at 1080p** (min on-air size 24px; nothing smaller ever renders to output):
  - `--gfx-type-display-xl: 88px / 0.95 / -0.01em` (announcement headline)
  - `--gfx-type-display-lg: 64px / 1.0 / -0.01em` (speaker name)
  - `--gfx-type-display-md: 44px / 1.05` (scripture reference, announcement date)
  - `--gfx-type-body-lg: 40px / 1.25` (verse text)
  - `--gfx-type-body-md: 30px / 1.3` (role/org line, supporting copy)
  - `--gfx-type-label: 24px / 1 / +0.08em uppercase` (translation tag, kicker) — **the only tracked-out tier, max one per graphic**.

### 3.2 Color palette + roles

- `--gfx-ink: #0B0D12` (near-black, warm-neutral — replaces slate-950 glass)
- `--gfx-paper: #F5F2EC` (warm off-white plate, as in the on-air scripture reference)
- `--gfx-paper-cool: #FFFFFF`
- `--gfx-brand: var(theme.accentColor)` — the saturated band fill, **driven by the existing `TemplateTheme.accentColor`**, default `#0E7C86` (deep teal; current cyan `#06b6d4` stays available as a brand choice but stops being hardcoded)
- `--gfx-brand-deep`: auto-derived darken(brand, ~18%) for underlayers/seams
- `--gfx-accent-2: #E8B93C` (controlled gold; replaces `#fbbf24` tint usage) — stripe/keyline accent only, never a text fill on light plates
- Text-on-plate rules: ink on paper, paper on brand/ink. **No text on translucent surfaces in output. No alpha fills below 0.9 behind text.**

### 3.3 Geometry, depth, surface

- **Radii**: `--gfx-radius: 0` on all primary plates; `2px` maximum micro-bevel on tabs. Pills are banned in output templates.
- **Angles**: `--gfx-cut: 12deg` standard end-cut (via `clip-path: polygon(...)`); `--gfx-skew: -6deg` for skewed tab variants. One angle family per graphic.
- **Stripes/keylines**: 6px and 12px accent stripes; 2px keyline brackets (per the minimal black/white reference).
- **Shadow**: one token only — `--gfx-shadow: 0 12px 32px rgba(0,0,0,0.35)` — used to lift the whole composition off the video, never on inner elements. **Delete inset keylines, radial-gradient washes, and bottom fade strips** (`PreacherLowerThird.tsx:11,32` etc.).
- **No blur/glass in output.** `backdrop-filter` stays out of `/output` entirely (also a CEF/OBS performance and rendering-consistency win).
- **Gradients**: permitted only as a subtle 2-stop darkening along a band's length (≤ 20% luminance shift within the brand hue), modeled on the purple/blue reference band. No radial washes, no hue-crossing gradients.

### 3.4 Motion / easing / timing

- Easings: `--gfx-ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (entrances), `--gfx-ease-in: cubic-bezier(0.7, 0, 0.84, 0)` (exits). No bounce/overshoot.
- Timing: in **550ms total, staggered**; out **300ms, reverse order, no stagger**.
- Choreography pattern (per the on-air references): **build along the graphic's own geometry** —
  1. 0ms: accent stripe/underbar wipes in along x (180ms)
  2. 80ms: main plate slides/clips in from its anchored edge (320ms)
  3. 200ms: text lines reveal inside `overflow:hidden` line masks, translateY 110%→0, 60ms per-line stagger
  4. 260ms: medallion/tab scales 0.8→1 with fade (240ms)
- Implementation: pure CSS keyframes toggled by a `data-state="in"|"out"` attribute set by `OutputPage`; unmount waits for `animationend` (or a single `--gfx-out-duration` constant) — **fixing the 420ms/350ms drift at `OutputPage.tsx:49`**.

### 3.5 Layout / safe areas

- Fixed stage: 1920×1080 design space, scaled uniformly to the viewport (§4 Phase 0).
- `--gfx-safe-action: 67px` (3.5%) and `--gfx-safe-title: 96px` (5%) insets; all text inside title-safe, bands may run full-bleed to the frame edge (as in the maroon and purple references) while their text block respects the inset.
- Anchor regions exposed by the shell: `lower-left`, `lower-center`, `lower-band` (full-width), `center` (full-frame announcements). Lower-third baseline sits at `1080 − 96px` with the band occupying roughly y 850–1000.

---

## 4. Implementation plan (phased — executable without re-deriving this analysis)

### Phase 0 — Stage & coordinate system (prerequisite, no visual redesign yet)

1. In `OutputPage.tsx` + `styles.css`, replace the fluid `.output-graphic` flex box with a **fixed 1920×1080 stage**: a `div.gfx-stage` with `width:1920px; height:1080px; transform-origin: top left; transform: scale(min(vw/1920, vh/1080))`, centered with letterbox offsets, computed in a tiny `useStageScale()` hook (ResizeObserver on window). All template content is then authored in absolute 1080p pixels.
2. Add safe-area CSS vars and extend the existing `?debug=1` overlay to draw true action-safe/title-safe rectangles from the same tokens.
3. Keep `output-root` transparent; verify against OBS Browser Source (1920×1080, "control audio via OBS" off, no custom CSS needed).

### Phase 1 — Token & theme layer

1. Add the `gfx-*` tokens from §3 to `src/styles.css` under a `.gfx-stage` scope (so control-UI tokens stay untouched).
2. Add `@fontsource-variable/archivo` (+ confirm `@fontsource-variable/inter`), imported in `src/main.tsx`. Verify fonts load with no network (offline dev server test).
3. Extend `TemplateTheme` in `src/types/graphics.ts` **additively**: `accent2Color?: string`, `plateStyle?: 'paper' | 'ink' | 'brand'`. Update `src/lib/schema.ts` Zod schema in lockstep. Existing presets in localStorage must still parse (all new fields optional with defaults) — no migration needed.
4. Map theme → CSS custom properties once, in a shared `themeToVars(theme): CSSProperties` helper consumed by the shell, so renderers use `var(--gfx-brand)` instead of inline styles.

### Phase 2 — Shared primitives (`src/components/templates/primitives/`)

Extract before rebuilding any template:

- **`GraphicShell`** — positions children in an anchor region (`lower-left | lower-center | lower-band | center`) inside the stage, applies `themeToVars`, owns `data-state` for motion.
- **`Plate`** — opaque panel, props: `fill: 'paper'|'ink'|'brand'`, `cut: 'none'|'right'|'left'|'skew'` (clip-path/transform from §3.3 tokens).
- **`AccentStripe`** — 6/12px stripe, horizontal or vertical, brand or accent-2.
- **`Tab`** — small label plate that offsets above/below a parent Plate (the reference-tab pattern from the scripture and sermon references).
- **`Medallion`** — circular logo slot, 132px, designed to overlap a Plate edge; renders initials monogram fallback when `logoUrl` is empty (replacing the "Logo" placeholder text at `PreacherLowerThird.tsx:19`).
- **`MaskedLine`** — `overflow:hidden` line wrapper for staggered text reveals; accepts `--gfx-stagger-index`.

Each is ≤ ~60 lines, typed, no state.

### Phase 3 — Template rebuilds (priority order)

**Priority rationale:** the lower third is what every operator triggers most and what the product is judged by; scripture is the signature church use case with the worst current legibility (translucent glass under 30px text); the announcement is least frequent on-air.

#### 3a. `PreacherLowerThird.tsx` — rebuild first
- Anchor: `lower-left`, full composition ~1200×190px, band baseline at title-safe.
- Construction (inspired by the maroon-diagonal and teal-angular references, original geometry): brand-deep underbar (full width of composition, 24px tall, offset down-right) → main ink or brand Plate with a 12° right end-cut → 12px accent-2 stripe on the left edge → Medallion overlapping the left end → name in `display-lg` 800 paper, role+org on a second 30px line set on a contrasting inset strip (paper plate with ink text when main plate is brand).
- Fields unchanged (`name`, `title`, `subtitle`, `logoUrl`). Kill the title-in-its-own-glass-card layout (`PreacherLowerThird.tsx:27-29`).
- Motion: stripe wipe → plate clip-in from left → masked name/role lines → medallion pop (per §3.4).

#### 3b. `ScriptureCard.tsx` → scripture **overlay** — rebuild second
- Anchor: `lower-band` (full-width), modeled structurally on the on-air tab+bar reference: ink Tab at top-left of the band carrying `reference` in `display-md` 800 with a brand accent block; main paper Plate (full-bleed width, text inset to title-safe) carrying `verseText` in `body-lg` ink at 40px, max 3 lines with an auto step-down to 34px for long text (simple character-count threshold, no JS measurement); `translationLabel` as the single `label`-tier element at the right end; `themeTitle` becomes an optional small brand chip on the tab.
- Delete the hardcoded explainer sentence and "Broadcast-ready Scripture" pill (`ScriptureCard.tsx:26-27`).
- Motion: band rises 110%→0 from bottom edge → tab clips in → verse lines mask-reveal.

#### 3c. `AnnouncementBanner.tsx` — rebuild third
- Two layout modes are tempting; keep scope tight: a `lower-band`-plus composition (band height ~280px) — headline in `display-xl` 800 on a brand Plate with left end-cut, `dateTime` in `display-md` on a paper end Plate at the right (the white-end-plate pattern from the gradient-band reference), `body` limited to one 30px line, `callToAction` on an accent-2 keyline bracket beneath (the keyline pattern from the minimal reference).
- Delete the "Broadcast announcement" self-label (`AnnouncementBanner.tsx:29`).
- Fields unchanged.

### Phase 4 — Animation system wiring

1. Implement the `data-state` lifecycle in `OutputPage.tsx`: SHOW → mount with `data-state="in"`; HIDE/CLEAR → `data-state="out"`, unmount on `animationend` from the shell (with a 600ms safety timeout). Removes the magic `420` at line 49.
2. Wire `TemplateDefinition.animation` / `animationOverride` to choreography variants (`slide` = default build; `fade` = simple crossfade for conservative operators; reserve `grow` or repurpose enum later — keep the union type but only ship two behaviors). Registry entries get explicit `animation` values so the schema field stops being dead.

### Phase 5 — Preview parity in the control surface

1. Rewrite `TemplatePreview.tsx` to render the **same `gfx-stage`** scaled into the monitor (one shared stage component, two consumers), so preview composition is pixel-true to `/output`.
2. Monitor backdrop: replace the cyan radial gradient (`styles.css:217`) with a neutral simulated-camera backdrop (CSS-generated soft photographic gradient, mid-gray) plus a toggle for transparent/checkerboard — operators must judge legibility over "video," not over black glass.
3. Add a safe-area guide toggle to the preview header.

### Phase 6 — QA & docs

1. `npm run build` clean; TS strict pass.
2. Stress matrix per template: shortest realistic values, longest realistic values (3-line verse, 40-char name), empty optionals, logo vs. monogram.
3. OBS checklist update in `docs/QA_CHECKLIST.md` + `docs/OBS_SETUP.md`: 1920×1080 source, transparency verified over a video scene, dock-width control test at ~340px, animation in/out on Take/Clear, refresh-restores-state (`loadLastRealtimeMessage` path).
4. Update `docs/DESIGN_SYSTEM.md` with the `gfx-*` token table from §3 (it becomes the single source of truth; this analysis stays as rationale).

### Sequencing & safety

- Phases 0–2 are non-destructive scaffolding; templates keep rendering throughout.
- Each template rebuild (3a–3c) is an isolated file swap behind the unchanged registry contract `({ values, theme })`, so Take/Clear, presets, and realtime never break mid-rebuild.
- Total new dependencies: `@fontsource-variable/archivo` (and `@fontsource-variable/inter` if not present). Nothing else.

---

## 5. Known weaknesses to revisit after the rebuild

- Headshot slot (`imageUrl` field) for lower thirds — strongly suggested by the references; deferred to keep schema churn out of the first pass.
- Color-pair presets ("teal/gold", "maroon/gold", "ink/paper") in the Brand panel — the current free color pickers make it easy to choose bad pairs.
- Announcement may eventually deserve a true full-frame `center` variant; not in this pass.
- The control UI itself (template cards, pill badges, rounded-2rem panels) shares the "web card" problem and should be tightened in a separate task — output first.
