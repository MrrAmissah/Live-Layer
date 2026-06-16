# Template Schema

Templates are defined in `src/components/templates/registry.ts` and typed in
`src/types/graphics.ts` (stored data is validated with Zod in `src/lib/schema.ts`).

## `TemplateDefinition`

- `id` — unique key (also the `templateRendererMap` key)
- `name` — display title
- `category` — grouping label (drives the rail/step grouping)
- `description` — short explanation
- `fields: TemplateField[]` — control-UI input definitions
- `defaultValues: Record<string,string>` — starter text per field id
- `theme: TemplateTheme` — default brand colours
- `animation?: TemplateAnimation` — default motion (see below)

### `TemplateField`

- `id`, `label`
- `type`: `'text' | 'textarea' | 'color' | 'url'`
- `placeholder?`, `optional?` (renders below the divider, marked “Optional”), `rows?` (textarea)

### `TemplateTheme`

- `primaryColor`, `accentColor`, `backgroundColor`
- `surfaceColor?`
- `accent2Color?` — secondary accent (stripes/keylines) for output graphics
- `logoAssetId?` — optional theme-level local logo reference

### `TemplateAnimation`

- `in: 'fade' | 'slide' | 'grow'`, `out: 'fade' | 'slide' | 'shrink'`
- Shipped behaviours: **`slide`** (per-element build, the default) and **`fade`**
  (whole-layer crossfade). Resolved by `resolveAnimationVariant()` and applied via
  `data-anim` on `.gfx-layer`. See `docs/DESIGN_SYSTEM.md` → Motion.

## `GraphicInstance` (a graphic taken to output / saved as a preset)

- `id`, `templateId`
- `presetName?` — set when saved as a preset
- `values: Record<string,string>` — field values entered by the operator
- `theme: Partial<TemplateTheme>` — brand overrides merged over the template theme
- `assetRefs?: Record<string,string>` — optional slot-to-asset id references
- `personId?` — optional provenance when filled from the People Library
- `layout?` — optional beginner layout settings (`size`, `position`, `density`, `safeMargin`)
- `animationOverride?: Partial<TemplateAnimation>` — per-instance motion override
- `durationSeconds` — auto-hide (0 = manual)
- `createdAt`, `updatedAt`

## Adding a new template

1. Add a renderer under `src/components/templates/` (compose the `graphics/` kit;
   read `var(--gfx-*)`, not inline theme colours — see `DESIGN_SYSTEM.md`).
2. Add a `TemplateDefinition` to `registry.ts` (include `animation`).
3. Register the renderer in `templateRendererMap`.
4. Add a scoped CSS block in `src/styles.css` and verify via `seed-test.html`.

## Built-In Templates

- `preacher-lower-third` — Lower Third
- `scripture-card` — Card
- `quote-card` — Card
- `announcement-banner` — Banner
- `event-banner` — Banner
- `sermon-title` — Fullscreen
- `fullscreen-message` — Fullscreen

All built-in templates use string fields only. Asset-backed imagery remains on
the existing lower-third logo/headshot path, so live messages and selected
rundown packs continue to store ids and field values only.
