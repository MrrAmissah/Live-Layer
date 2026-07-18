/**
 * Single home for shared brand asset URLs — every renderer, pack, and registry
 * entry imports from here so retargeting an asset is a one-line change.
 */

export const DEFAULT_CHURCH_LOGO_URL = '/default%20logo.png';

/** Event logo for the convention-styled variants (PPC '26). */
export const CONVENTION_LOGO_URL = '/ppc-2026-logo.png';

/**
 * Resolve the logo source for a renderer: pre-resolved asset (control passes
 * blob URLs), then an explicit URL field, then the caller's fallback.
 */
export function resolveLogoSrc(values: Record<string, string>, fallback = ''): string {
  return values.logoResolvedSrc?.trim() || values.logoUrl?.trim() || fallback;
}
