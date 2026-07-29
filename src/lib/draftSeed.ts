import { templateRegistry } from '../components/templates/registry';
import { packOverridesFor } from './packs';
import { defaultBrandTheme } from './storage';
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

function sameColor(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * The colour fields a saved brand contributes to a fresh draft.
 *
 * Only values the operator has actually CHANGED are contributed. Templates
 * declare their own accents (electric / yellow / gold), so unconditionally
 * seeding from the brand default would flatten every template to one accent.
 * An untouched brand therefore seeds nothing and the registry defaults stand,
 * exactly as before this behaviour existed.
 */
export function themeSeedValues(theme: BrandTheme | undefined): Record<string, string> {
  const defaults = defaultBrandTheme();
  const seed: Record<string, string> = {};
  for (const { field, themeKey } of THEME_SEEDED_FIELDS) {
    const value = theme?.[themeKey];
    if (typeof value === 'string' && value.trim() && !sameColor(value, defaults[themeKey])) {
      seed[field] = value;
    }
  }
  return seed;
}

/**
 * Seed values for a new graphic: registry defaults, then the operator's saved
 * brand colours, then the active event pack.
 *
 * The pack is applied LAST on purpose — an event pack states an explicit
 * palette for the look it ships (see PPC_PALETTE), and that must keep winning
 * over the house brand default.
 *
 * `theme` is required rather than optional so every call site is forced to pass
 * the same brand the store holds; a site that silently skipped it would seed a
 * different draft than `isDraftDirty` compares against, and the drift would
 * only surface as a wrong pack-switch prompt.
 */
export function createDraftValues(
  templateId: string,
  packId: string,
  theme: BrandTheme
): Record<string, string> {
  const template = templateRegistry.find((item) => item.id === templateId);
  if (!template) return {};
  return {
    ...template.defaultValues,
    ...themeSeedValues(theme),
    ...packOverridesFor(packId, templateId)
  };
}
