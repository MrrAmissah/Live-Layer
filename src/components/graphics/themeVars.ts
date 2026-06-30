import type { CSSProperties } from 'react';
import type { TemplateTheme } from '../../types/graphics';
import { GFX_DEFAULT_BRAND, GFX_DEFAULT_ACCENT_2 } from './stage';

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16)
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }
  return null;
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`;
}

/** Darken a hex color by `amount` (0..1). Non-hex input is returned as-is. */
export function darken(color: string, amount: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  return toHex([rgb[0] * (1 - amount), rgb[1] * (1 - amount), rgb[2] * (1 - amount)] as [number, number, number]);
}

/** Approximate relative luminance (0..1) of a hex color. Defaults dark. */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Maps a graphic instance theme to the stage-scoped `--gfx-*` custom
 * properties. Renderers consume `var(--gfx-brand)` etc. instead of inline
 * theme colors, so the whole composition re-themes from one place.
 *
 * - `--gfx-brand` is driven by `theme.accentColor` (the saturated plate fill).
 * - `--gfx-brand-deep` is an auto-derived darker tone for underlayers/seams.
 * - `--gfx-on-brand` flips between ink and white based on brand luminance so
 *   operator-picked light brands (e.g. gold) keep readable text.
 */
export function themeToVars(theme?: Partial<TemplateTheme>): CSSProperties {
  const brand = theme?.accentColor || GFX_DEFAULT_BRAND;
  const accent2 = theme?.accent2Color || GFX_DEFAULT_ACCENT_2;
  const surface = theme?.surfaceColor || theme?.primaryColor;
  const text = theme?.primaryColor;
  const onBrand = luminance(brand) > 0.45 ? 'var(--gfx-ink)' : 'var(--gfx-paper-cool)';
  return {
    '--gfx-brand': brand,
    '--gfx-brand-deep': darken(brand, 0.32),
    '--gfx-accent-2': accent2,
    '--gfx-on-brand': onBrand,
    ...(surface ? { '--gfx-template-surface': surface } : {}),
    ...(text ? { '--gfx-template-text': text } : {})
  } as CSSProperties;
}
