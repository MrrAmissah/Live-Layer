/**
 * Graphic packs: named looks that re-skin every template for an event or
 * season without touching the registry. A pack contributes per-template
 * value overrides (palette, variant, logo, identity copy) that are merged
 * over registry defaults whenever a new draft is created, so operators get
 * the event look by default while every field stays editable.
 */

import { CONVENTION_LOGO_URL } from './brandAssets';
import { loadActivePackRaw, saveActivePackRaw } from './storage';

export interface GraphicPack {
  id: string;
  name: string;
  description: string;
  /** Per-template partial `values` merged over registry defaultValues. */
  valueOverrides: Record<string, Record<string, string>>;
  /**
   * Optional curated design-sample sets per template. When set, the control
   * variant picker only offers these (in this order) while the pack is
   * active; templates without an entry keep the full registry list.
   */
  variantChoices?: Record<string, string[]>;
}

const PPC_LOGO_URL = CONVENTION_LOGO_URL;

/* Royal palette pulled from the PPC '26 reference sample. The white event
   logo needs dark/royal surfaces, so paper-surface templates keep their own
   surface and only take the royal brand + identity copy. Exported so the
   registry's convention variants share the same source of truth (seed-test
   .html keeps a hand copy — it can't import TS). */
export const PPC_PALETTE = {
  colorBrand: '#2338dd',
  colorAccent: '#9db1ff',
  colorSurface: '#101fae',
  colorText: '#ffffff',
  colorSecondary: '#b9c6ff'
};

export const graphicPacks: GraphicPack[] = [
  {
    id: 'house',
    name: 'House Style',
    description: 'The default church look — house blue, gold accents, church logo.',
    valueOverrides: {}
  },
  {
    id: 'ppc-2026',
    name: "PPC '26",
    description:
      "Annual Peace Prayer Convention '26 — royal palette, convention strap and ticker layouts, and the event logo.",
    variantChoices: {
      /* A pack's curated list REPLACES the registry order, so reordering the
         registry alone left this one leading with the strap. The two that get
         reached for lead here too. */
      'preacher-lower-third': ['modern-minimal', 'soft-broadcast', 'convention-strap', 'split-bar'],
      'performer-lower-third': ['performer-pill', 'performer-note', 'soft-broadcast', 'convention-strap'],
      /* Same trap as the lower thirds: reordering the registry alone would have
         left this pack still leading with the ticker.

         ALL SEVEN ARE LISTED, and that is the point. A curated list REPLACES
         the picker rather than leading it (`TemplateFields`/`ContentTab` map
         the ids and keep nothing else), so a short list here is a curation, not
         an ordering — naming four would have quietly removed plain-pattern,
         tag-strip and communion-strip from this pack. The ask was which one
         comes first. */
      'announcement-banner': [
        'live-tab',
        'convention-ticker',
        'info-ribbon',
        'plain-pattern',
        'tag-strip',
        'service-alert',
        'communion-strip'
      ]
    },
    valueOverrides: {
      'preacher-lower-third': {
        /* Was `convention-strap`. A new preacher graphic on this pack now seeds
           as modern-minimal like everywhere else — the strap is still one click
           away and still carries the event branding when chosen. */
        variantId: 'modern-minimal',
        subtitle: "Annual PPC '26",
        logoUrl: PPC_LOGO_URL,
        ...PPC_PALETTE
      },
      'performer-lower-third': {
        variantId: 'performer-pill',
        title: 'Ministration in Songs',
        subtitle: "Annual PPC '26",
        logoUrl: PPC_LOGO_URL,
        ...PPC_PALETTE
      },
      'scripture-card': {
        themeTitle: "PPC '26",
        ...PPC_PALETTE
      },
      'quote-card': {
        themeTitle: 'Key Thought',
        ...PPC_PALETTE
      },
      'announcement-banner': {
        /* Was `convention-ticker`. A new announcement on this pack now seeds as
           live-tab like everywhere else; the ticker is still one click away and
           still carries the event logo when chosen. */
        variantId: 'live-tab',
        logoUrl: PPC_LOGO_URL,
        ...PPC_PALETTE
      },
      'event-banner': {
        variantId: 'convention-bar',
        tag: "PPC '26",
        logoUrl: PPC_LOGO_URL,
        ...PPC_PALETTE
      },
      'sermon-title': {
        variantId: 'midnight-manifest',
        churchName: "Annual Peace Prayer Convention '26",
        seriesTitle: "PPC '26",
        logoUrl: PPC_LOGO_URL,
        ...PPC_PALETTE
      },
      'fullscreen-message': {
        footerNote: 'Annual Peace Prayer Convention 2026',
        ...PPC_PALETTE
      }
    }
  }
];

export function getPack(id: string): GraphicPack {
  return graphicPacks.find((pack) => pack.id === id) ?? graphicPacks[0];
}

export function packOverridesFor(packId: string, templateId: string): Record<string, string> {
  return getPack(packId).valueOverrides[templateId] ?? {};
}

/** Curated variant ids for a template under a pack, or undefined for "all". */
export function packVariantIdsFor(packId: string, templateId: string): string[] | undefined {
  return getPack(packId).variantChoices?.[templateId];
}

export function loadActivePackId(): string {
  const id = loadActivePackRaw();
  return id && graphicPacks.some((pack) => pack.id === id) ? id : 'house';
}

export function saveActivePackId(id: string) {
  saveActivePackRaw(id);
}
