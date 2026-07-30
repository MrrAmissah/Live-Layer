import { GFX_DEFAULT_ACCENT_2, GFX_DEFAULT_BRAND } from '../components/graphics/stage';

/**
 * What the RENDERERS paint for a palette slot the graphic doesn't carry.
 *
 * There are two colour families in the stylesheet and they behave differently,
 * which is why one global fallback was always going to be wrong somewhere:
 *
 *  - **premium** (`.gfx-l3`, `.gfx-scripture`, `.gfx-announce`, `.gfx-quote`,
 *    `.gfx-event`) resolves its plates through `--gfx-template-*`, which ONLY
 *    `templateColorStyle` sets — i.e. only per-graphic values. A graphic with no
 *    `colorBrand` therefore paints the stylesheet's own constant (`#1259ff`),
 *    not its theme's brand and not the template's registry default.
 *  - **stage** (`.gfx-sermon`, `.gfx-fullmsg`) reads `--gfx-brand` /
 *    `--gfx-accent-2`, which `themeToVars` DOES set, so those templates follow
 *    the graphic's theme and fall back to the stage defaults.
 *
 * `--gfx-template-surface` / `--gfx-template-text` are set by BOTH
 * `templateColorStyle` and `themeToVars`, so surface and text follow the theme
 * in either family.
 *
 * These constants are duplicated from `styles.css` because CSS cannot export
 * them. `rendererFallbacks.test.ts` parses the stylesheet and fails if the two
 * ever disagree — the same tactic as reading `data-variant` off real markup
 * rather than trusting a table.
 */

export type PaletteFamily = 'premium' | 'stage';

/** The `--gfx-premium-*: var(--gfx-template-*, X)` fallbacks, and their source. */
export const PREMIUM_FALLBACKS = {
  colorBrand: '#1259ff', // var(--gfx-house-blue)
  colorAccent: '#ffcc32',
  colorSurface: '#f8fafc',
  colorText: '#07111f',
  colorSecondary: '#334155'
} as const;

/** The selectors that carry the premium block, kept for the parity test. */
export const PREMIUM_SELECTORS = [
  '.gfx-l3',
  '.gfx-scripture',
  '.gfx-announce',
  '.gfx-quote',
  '.gfx-event'
] as const;

/**
 * Which family each template renders in, keyed by template rather than renderer
 * because both lower thirds share one renderer. A template absent from this map
 * is treated as `stage`, the more conservative chain: it follows the graphic's
 * theme instead of asserting a stylesheet constant that may not apply.
 */
export const TEMPLATE_PALETTE_FAMILY: Record<string, PaletteFamily> = {
  'preacher-lower-third': 'premium',
  'performer-lower-third': 'premium',
  'scripture-card': 'premium',
  'announcement-banner': 'premium',
  'quote-card': 'premium',
  'event-banner': 'premium',
  'sermon-title': 'stage',
  'fullscreen-message': 'stage'
};

export function paletteFamilyFor(templateId: string): PaletteFamily {
  return TEMPLATE_PALETTE_FAMILY[templateId] ?? 'stage';
}

/** The stage family's last resort for the two theme-backed brand slots. */
export const STAGE_FALLBACKS = {
  colorBrand: GFX_DEFAULT_BRAND,
  colorAccent: GFX_DEFAULT_ACCENT_2
} as const;
