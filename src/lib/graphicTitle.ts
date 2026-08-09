import { templateRegistry } from '../components/templates/registry';
import { describeTemplate } from './templateMeta';
import type { IconName } from './icons';

/**
 * THE display title for a graphic, in one place.
 *
 * This used to exist four times with slightly different fallbacks
 * (ProgramRail's `graphicLabel`, RailQueue's `itemLabel`, DesignPresets'
 * `presetLabel`, plus the store's `deriveItemTitle`). The first three are
 * consolidated here; `deriveItemTitle` stays in `rundownStore` on purpose —
 * it derives a PERSISTED item title at creation time without registry access,
 * and changing it would rewrite stored rundowns.
 */

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));

export interface GraphicTitleSource {
  templateId: string;
  values: Record<string, string>;
  presetName?: string;
}

/** Operator-facing title: preset name → primary field → name field → template. */
export function graphicTitle(graphic: GraphicTitleSource): string {
  const template = templateById.get(graphic.templateId);
  const primary = template?.primaryField;
  return (
    graphic.presetName?.trim() ||
    (primary ? graphic.values[primary] : '') ||
    graphic.values.name ||
    template?.name ||
    graphic.templateId
  );
}

/** Human template-type label for a possibly-unknown template id. */
export function templateLabel(templateId: string): string {
  return describeTemplate(templateById.get(templateId), templateId).label;
}

/** Title + type label + type glyph in one read — queue rows, Program identity. */
export function describeGraphic(graphic: GraphicTitleSource): {
  title: string;
  typeLabel: string;
  icon: IconName;
} {
  const meta = describeTemplate(templateById.get(graphic.templateId), graphic.templateId);
  return { title: graphicTitle(graphic), typeLabel: meta.label, icon: meta.icon };
}
