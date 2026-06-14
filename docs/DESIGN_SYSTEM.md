# LiveLayer Design System

## Control surface color tokens

These drive the `/control` product UI only. The output graphics do **not**
consume them — they use the `--gfx-*` layer below.

- `--bg`: #03060d — graphite navy base
- `--surface`: rgba(10, 15, 26, 0.92) — deep broadcast panel
- `--surface-strong`: rgba(7, 11, 18, 0.96)
- `--surface-soft`: rgba(12, 18, 30, 0.72)
- `--border`: rgba(148, 163, 184, 0.14) — subtle edge highlight
- `--text`: #f8fafc — crisp off-white
- `--text-muted`: #94a3b8 — cool gray-blue
- `--accent`: #22d3ee — electric cyan highlight
- `--accent-strong`: #06b6d4 — premium broadcast blue
- `--gold`: #fbbf24 — warm gold accent

## Output graphic tokens (`--gfx-*`)

Single source of truth for the broadcast output layer. Defined on `.gfx-stage`
in `src/styles.css`; every template renderer reads `var(--gfx-*)` rather than
inline theme colors, so a whole composition re-themes from one place. See
`REFERENCE_STYLE_ANALYSIS.md` for the rationale behind these choices.

| Token | Value | Role |
|---|---|---|
| `--gfx-ink` | `#0b0d12` | Near-black ink — dark text, ink plates / reference tabs |
| `--gfx-paper` | `#f5f2ec` | Warm paper — scripture plate fill |
| `--gfx-paper-cool` | `#ffffff` | Cool white — end plates, default on-brand text |
| `--gfx-brand` | `#0e7c86` *(default)* | Saturated brand plate fill — **per-graphic**, set from `theme.accentColor` |
| `--gfx-brand-deep` | `#09545b` *(auto)* | Underbars / seams — auto-derived `darken(brand, 0.32)` |
| `--gfx-accent-2` | `#e8b93c` | Secondary accent — gold cap rails, stripes, keylines (`theme.accent2Color`) |
| `--gfx-on-brand` | `var(--gfx-paper-cool)` *(auto)* | Text / marks on the brand plate; flips to ink when the brand is light (luminance > 0.45) |
| `--gfx-text-muted` | `rgba(245,242,236,0.78)` | Muted secondary text |
| `--gfx-shadow` | `0 12px 32px rgba(0,0,0,0.35)` | The single composition-level shadow (whole graphics only) |
| `--gfx-ease-out` | `cubic-bezier(0.16,1,0.3,1)` | Enter / build easing |
| `--gfx-ease-in` | `cubic-bezier(0.7,0,0.84,0)` | Exit easing |
| `--gfx-font-display` | `'Archivo Variable', 'Arial Narrow', …` | Condensed display face — names, headlines, references |
| `--gfx-font-text` | `Inter, ui-sans-serif, …` | Body / label text |
| `--gfx-safe-action-x` / `-bottom` | `96px` / `72px` | Action-safe insets |
| `--gfx-safe-title-x` / `-bottom` | `160px` / `120px` | Title-safe insets (all text stays inside) |

The four per-graphic colors (`--gfx-brand`, `--gfx-brand-deep`, `--gfx-accent-2`,
`--gfx-on-brand`) are overridden at the stage root by `themeToVars()`
(`src/components/graphics/themeVars.ts`) from each graphic's theme. The safe-area
tokens mirror `SAFE_ACTION` / `SAFE_TITLE` in `src/components/graphics/stage.ts` —
change both together.

### Brand controls → tokens (theme-aware accents)

The Brand panel exposes exactly the two colours the graphics consume, so every
decorative stroke follows the operator's choice — there are **no hardcoded
gold/yellow literals in the template CSS**; the gold cap rails, stripes, quote
spine, medallion ring, and announcement rail all read `var(--gfx-accent-2)`:

| Brand swatch | Theme field | Token | Drives |
| --- | --- | --- | --- |
| **Main colour** | `accentColor` | `--gfx-brand` | brand plate fill |
| **Accent** | `accent2Color` | `--gfx-accent-2` | keylines / rails / stripes / spine |

Gold (`#e8b93c`) survives only as the **registry default palette** for a template;
once the operator sets the Accent swatch, the keylines follow it everywhere (preview
and `/output`, via the Take snapshot). `theme.primaryColor` is **not** consumed by
output graphics (it has no `--gfx-*` mapping) and has no brand control.

### Motion

`/output` ships two behaviors, selected by `data-anim` on `.gfx-layer` and
resolved from the registry `animation` + per-instance `animationOverride` by
`resolveAnimationVariant()`:

- `slide` *(default)* — per-element build choreography (wipes, plate slides,
  masked text reveal, medallion/CTA pop).
- `fade` — flat whole-layer crossfade; per-element builds are suppressed via
  `.gfx-layer:not([data-anim='fade'])`. A missing `data-anim` safely falls back
  to `slide`. Exit duration is `GFX_OUT_MS` (300ms) in `stage.ts`.

## Typography rules

- Use a strong hierarchy with clear headings and compact control labels.
- Avoid excessive uppercase and tracking on body text.
- Keep broadcast labels legible, not overdecorated.
- Use higher contrast on primary text and a softer voice for secondary captions.

## Spacing rules

- Use balanced padding and visible breathing room.
- Avoid empty dark holes in the layout.
- Keep the central preview prominent and well-centered.
- Maintain compact controls in narrow dock widths.

## Control UI design principles

The `/control` surface must read as a broadcast control room, not a dark web
dashboard. Full layout + interaction rules live in `CONTROL_UI_UX.md`; the
visual rules are:

- One route, two layouts switched at **1024px** (a JS breakpoint, not separate
  routes): **< 1024px** → a guided **dock** (Graphic → Edit → Live tabs, sticky
  status + sticky Take/Clear bar); **≥ 1024px** → a **studio** grid (rail ·
  preview/editor · actions/brand/presets). Full rules in `CONTROL_UI_UX.md`.
- Studio panels stretch to fill their grid cells so leftover space becomes panel
  surface, never dead black page space.
- One surface primitive (`Panel`) with sharp ~12px edges and 1px subtle
  borders — no large rounded web cards, no card-in-card.
- Restrained glow only (faint corner gradients on a deep graphite base).
- Take is the single loudest control; Clear, auto-hide, status, and last action
  sit directly under it. Keep Take/Clear reachable without hunting in dock mode.
- Template cards read as radio options (a selection dot + name + category, no
  description), not form fields — light on text, fast to scan.
- Controlled accents: cyan = primary/active, gold = category/marker, green =
  on-air, restrained red = clear. Letter-spacing only on small eyebrows.

## Output graphic design principles

- Design for transparent 1920×1080 broadcast overlay.
- Use layered lower thirds, slim accent bars, and strong typography.
- Avoid web-style cards and blurred glass effects.
- Ensure text reads clearly over camera/video backgrounds.
- Keep each template visually distinct and production-ready.

## Visual QA checklist

- [ ] Full browser `/control` UI looks balanced in studio mode.
- [ ] Narrow dock `/control` UI collapses cleanly and keeps Take/Clear visible.
- [ ] Preview monitor has a refined 16:9 frame with subtle safe-area treatment.
- [ ] Preacher Lower Third appears compact, strong, and lower-left safe.
- [ ] Scripture Card feels reverent, readable, and broadcast-friendly.
- [ ] Announcement Banner looks like a live event graphic.
- [ ] `/output` stays transparent and overlays cleanly over video.
- [ ] Templates render crisply in 1920×1080 safe area.

## What not to do

- Do not use bright orange as a default accent.
- Avoid large pill-shaped UI controls.
- Avoid generic dashboard cards and forms.
- Avoid cheap glass and blur effects in output graphics.
- Avoid overly large hero headers in the control interface.
- Avoid tiny text or cramped output panels.
