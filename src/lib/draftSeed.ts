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

/**
 * The values that belong to THIS template, with any other template's fields
 * stripped out.
 *
 * `draftValues` is not guaranteed to hold only one template's fields.
 * `applyPersonToLowerThird` spreads the previous draft into a preacher one on
 * purpose — that is how a logo and a palette carry across a person swap — so a
 * draft can legitimately be carrying `reference` and `verseText` from the
 * scripture card the operator was on a moment ago.
 *
 * That was harmless while a template switch re-seeded from scratch. It stopped
 * being harmless when drafts started being PARKED and restored per template: a
 * blob captured with foreign keys in it came back on a template it did not
 * belong to, and the scripture card was suddenly carrying a preacher's name.
 *
 * Filtering by "is this a field of some OTHER template" rather than by an
 * allow-list keeps every shared key — `variantId`, the palette, logo and
 * headshot ids, `personId`, `hiddenFields` — which are exactly the ones meant
 * to travel.
 */
export function scopeValuesToTemplate(
  templateId: string,
  values: Record<string, string>
): Record<string, string> {
  const template = templateRegistry.find((entry) => entry.id === templateId);
  if (!template) return values;
  const own = new Set(template.fields.map((field) => field.id));
  const foreign = new Set<string>();
  for (const entry of templateRegistry) {
    if (entry.id === templateId) continue;
    for (const field of entry.fields) if (!own.has(field.id)) foreign.add(field.id);
  }
  if (!Object.keys(values).some((key) => foreign.has(key))) return values;
  return Object.fromEntries(Object.entries(values).filter(([key]) => !foreign.has(key)));
}
