import { templateRegistry } from '../components/templates/registry';
import { packOverridesFor } from './packs';
import type { ExplicitBrandKey } from './storage';
import type { TemplateDefinition } from '../types/graphics';

type BrandTheme = TemplateDefinition['theme'];

/**
 * Which per-graphic colour field each global brand swatch seeds into a new
 * draft. The renderers read the `values` colours (see `templateColorStyle`),
 * so a brand default only reaches the screen by being seeded here.
 */
export const THEME_SEEDED_FIELDS = [
  { field: 'colorBrand', themeKey: 'accentColor' },
  { field: 'colorAccent', themeKey: 'accent2Color' }
] as const;

/** "The operator has chosen no brand colour" — the seed-from-template case. */
export const NO_EXPLICIT_BRAND: readonly ExplicitBrandKey[] = [];

/**
 * The colour fields a saved brand contributes to a fresh draft.
 *
 * Contribution is driven by the EXPLICIT-selection markers, never by comparing
 * a value with the built-in default. An operator may deliberately pick the
 * colour that happens to be the default, and that choice has to survive a
 * template switch and a reload like any other.
 *
 * Templates declare their own accents (electric / yellow / gold), so an
 * unmarked swatch contributes nothing and the registry defaults stand — the
 * behaviour before any brand colour had been chosen.
 */
export function themeSeedValues(
  theme: BrandTheme | undefined,
  explicitKeys: Iterable<ExplicitBrandKey> = NO_EXPLICIT_BRAND
): Record<string, string> {
  const explicit = new Set(explicitKeys);
  const seed: Record<string, string> = {};
  for (const { field, themeKey } of THEME_SEEDED_FIELDS) {
    if (!explicit.has(themeKey)) continue;
    const value = theme?.[themeKey];
    if (typeof value === 'string' && value.trim()) seed[field] = value;
  }
  return seed;
}

/**
 * Seed values for a new graphic: registry defaults, then the brand colours the
 * operator explicitly chose, then the active event pack.
 *
 * The pack is applied LAST on purpose — an event pack states an explicit
 * palette for the look it ships (see PPC_PALETTE), and that must keep winning
 * over the operator's house brand.
 *
 * `theme` and `explicitKeys` are required rather than optional so every call
 * site is forced to pass the same inputs the store holds; a site that silently
 * skipped one would seed a different draft than `isDraftDirty` compares
 * against, and the drift would only surface as a wrong pack-switch prompt.
 */
export function createDraftValues(
  templateId: string,
  packId: string,
  theme: BrandTheme,
  explicitKeys: Iterable<ExplicitBrandKey>
): Record<string, string> {
  const template = templateRegistry.find((item) => item.id === templateId);
  if (!template) return {};
  return {
    ...template.defaultValues,
    ...themeSeedValues(theme, explicitKeys),
    ...packOverridesFor(packId, templateId)
  };
}
