import type { CSSProperties } from 'react';
import { darken, luminance } from '../graphics/themeVars';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function cleanColor(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next && HEX_COLOR.test(next) ? next : undefined;
}

/**
 * Per-graphic colour overrides. These live in `values` so a saved preset or
 * rundown item keeps its own palette instead of only inheriting global brand.
 */
export function templateColorStyle(values: Record<string, string>): CSSProperties {
  const brand = cleanColor(values.colorBrand);
  const accent = cleanColor(values.colorAccent);
  const surface = cleanColor(values.colorSurface);
  const text = cleanColor(values.colorText);
  const secondary = cleanColor(values.colorSecondary);

  return {
    ...(brand
      ? {
          '--gfx-brand': brand,
          '--gfx-brand-deep': darken(brand, 0.32),
          '--gfx-on-brand': luminance(brand) > 0.45 ? 'var(--gfx-ink)' : 'var(--gfx-paper-cool)',
          '--gfx-template-brand': brand
        }
      : {}),
    ...(accent ? { '--gfx-accent-2': accent, '--gfx-template-accent': accent } : {}),
    ...(surface ? { '--gfx-template-surface': surface } : {}),
    ...(text ? { '--gfx-template-text': text } : {}),
    ...(secondary ? { '--gfx-template-secondary': secondary } : {})
  } as CSSProperties;
}
