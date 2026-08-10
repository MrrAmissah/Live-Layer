import { PALETTE_FIELD_IDS } from './variantPalette';
import type { PaletteFieldId } from './visualState';

/**
 * Which visual fields a template can actually show.
 *
 * A graphic carries fields its template never renders: `setTemplate` deliberately
 * carries the logo across a template switch (`carriedLogo`), and every template
 * gets all five palette values seeded whether or not its CSS reads them. Counting
 * those as visual differences reported changes nobody could see — a "Logo URL"
 * override on a scripture card that has no logo anywhere in its design.
 *
 * Both tables are derived from evidence and pinned by `templateCapabilities.test.ts`:
 * the palette lists from which `--gfx-*` colour variables each renderer root's
 * selectors read in `styles.css` (including derived ones like `--gfx-on-brand`),
 * and the logo flags from rendering each template with a logo URL and looking for
 * it in the markup.
 */

/** Palette fields whose colour reaches the screen for each template. */
export const TEMPLATE_PALETTE_FIELDS: Record<string, ReadonlyArray<PaletteFieldId>> = {
  'preacher-lower-third': PALETTE_FIELD_IDS,
  'performer-lower-third': PALETTE_FIELD_IDS,
  'scripture-card': PALETTE_FIELD_IDS,
  'announcement-banner': PALETTE_FIELD_IDS,
  'quote-card': PALETTE_FIELD_IDS,
  'event-banner': PALETTE_FIELD_IDS,
  // `.gfx-sermon` and `.gfx-fullmsg` read only `--gfx-brand` / `--gfx-accent-2`
  // (and `--gfx-on-brand`, which derives from brand). Their surface, text and
  // secondary values are stored but never painted.
  'sermon-title': ['colorBrand', 'colorAccent'],
  'fullscreen-message': ['colorBrand', 'colorAccent']
};

/** Templates whose renderer draws a logo at all. */
export const TEMPLATE_RENDERS_LOGO: Record<string, boolean> = {
  'preacher-lower-third': true,
  'performer-lower-third': true,
  'announcement-banner': true,
  'event-banner': true,
  'sermon-title': true,
  'scripture-card': false,
  'quote-card': false,
  'fullscreen-message': false
};

/**
 * An unknown template is assumed to render everything: a comparison that hides a
 * row is worse than one that shows a row the operator can dismiss, and a build
 * carrying a graphic from a newer build has no evidence either way.
 */
export function paletteFieldsFor(templateId: string): ReadonlyArray<PaletteFieldId> {
  return TEMPLATE_PALETTE_FIELDS[templateId] ?? PALETTE_FIELD_IDS;
}

export function rendersLogo(templateId: string): boolean {
  return TEMPLATE_RENDERS_LOGO[templateId] ?? true;
}

/**
 * Templates whose renderer draws a person's headshot.
 *
 * Derived the same evidence-based way as `TEMPLATE_RENDERS_LOGO`: only
 * `PreacherLowerThird` reads `headshotAssetId` (via `headshotResolvedSrc`,
 * which `/output` fills in from the id), and `templateRendererMap` points both
 * lower thirds at it.
 *
 * It has to be a separate table from the registry's `fields`. The registry
 * declares the TEXT inputs an operator types — `headshotAssetId` is not among
 * them, because the headshot is chosen through the asset picker rather than a
 * text box. A person mapping that filtered on declared fields alone would
 * silently drop the most visible part of a person swap: the face.
 */
export const TEMPLATE_RENDERS_HEADSHOT: Record<string, boolean> = {
  'preacher-lower-third': true,
  'performer-lower-third': true,
  'scripture-card': false,
  'announcement-banner': false,
  'quote-card': false,
  'event-banner': false,
  'sermon-title': false,
  'fullscreen-message': false
};

/** Unknown templates are assumed NOT to draw a headshot: writing an asset id a
 *  renderer ignores would leave a graphic carrying a reference nothing shows. */
export function rendersHeadshot(templateId: string): boolean {
  return TEMPLATE_RENDERS_HEADSHOT[templateId] ?? false;
}
