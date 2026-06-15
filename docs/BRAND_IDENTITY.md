# LiveLayer Brand Identity

LiveLayer's identity should feel like a production-control surface: precise,
local-first, transparent-overlay aware, and calm enough for church/event teams
running a live service.

## Assets

- `public/brand/livelayer-mark.svg` — primary app mark, favicon source, compact UI
  identity.
- `public/brand/livelayer-logo.svg` — README/GitHub wordmark lockup.
- `public/livelayer-mark.svg` — compatibility copy for older references.

The system is SVG-first. Do not replace these with raster text or copied marks.

## Concept

The mark combines:

- layered transparent panes,
- a geometric `L`,
- a broadcast frame,
- a live signal dot.

This connects the product ideas directly: local control, layered graphics, and a
transparent OBS output.

## Palette

- Deep panel: `#07111D`
- Panel stroke: `#1D3346`
- Signal cyan: `#22D3EE`
- Soft pane cyan: `#8BE9FF`
- Accent gold: `#F5C542`
- Live dot: `#F43F5E`
- Text: `#F8FAFC`
- Muted text: `#94A3B8`

These are tuned for the dark LiveLayer UI and should stay legible at favicon,
dock, and README sizes.

## Usage

- Use the mark in tight UI: command bar, dock status bar, favicon/app icon.
- Use the logo lockup for README, GitHub, and project/profile surfaces.
- Keep clear space around the mark of at least one live-dot diameter.
- Keep the mark on dark, neutral, or transparent backgrounds.
- Preserve the accessible fallback text beside icon-only usage in the app header.

## Avoid

- Generic play buttons, TV icons, camera icons, or copied broadcast symbols.
- Heavy 3D effects, novelty gradients, glow-heavy treatments, or busy outlines.
- Rasterized text inside image exports.
- Recoloring the live dot to something that no longer reads as a live/on-air cue.

## Validation

After editing brand assets, run:

```bash
npm run verify
npm run build
```

Then smoke `/control`, `/output`, `/setup`, and `/seed-test.html`. The identity
refresh must not alter `/output`, Take/Clear behavior, or asset-message contracts.
