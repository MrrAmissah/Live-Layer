# Layout / Size Controls

Phase 2D adds beginner-safe layout controls for live graphics. These are not a
freeform visual builder. They are a small set of safe choices that preserve the
template design and keep graphics within broadcast-safe regions.

## Controls

- **Size:** Small, Medium, Large
- **Position:** Left, Center, Full
- **Density:** Compact, Standard, Bold
- **Safe margin:** Normal, Tight

Medium / Left / Standard / Normal matches the original template defaults.
Graphics and old presets without a `layout` field render as they did before.

## How it works

Layout settings are stored on `GraphicInstance.layout` and are applied as data
attributes on the rendered graphic layer in both preview and `/output`.

Saved graphics/presets store the selected layout settings alongside template id,
field values, theme, asset ids, and person id. No image bytes are stored in
presets.

## Safety model

The controls map to predefined CSS behavior:

- size uses conservative scale changes
- position uses template-aware left/center/full placement
- density adjusts template spacing/type scale
- tight margins reduce safe-area inset but do not expose arbitrary offsets

There is no drag, resize handle, pixel offset, or free transform in this phase.

## Current limitations

- Layout controls are shared across templates, so some choices have subtle
  effects on full-band templates.
- There is no named layout-preset library yet beyond saving settings with a
  Saved Graphic.
- There is no per-template advanced editor.

## Manual test

1. Open `/control`.
2. Select Preacher Lower Third.
3. Go to Live.
4. Try Small / Medium / Large.
5. Try Left / Center / Full.
6. Take live and confirm `/output` matches preview.
7. Save the graphic in Library → Saved graphics.
8. Reload `/control`, load the saved graphic, and confirm layout returns.
