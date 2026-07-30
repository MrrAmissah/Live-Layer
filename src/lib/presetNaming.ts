import { templateRegistry } from '../components/templates/registry';
import { describeTemplate } from './templateMeta';

const templateById = new Map(templateRegistry.map((template) => [template.id, template]));

/** Display name for a possibly-unknown template id. */
export function templateDisplayName(templateId: string): string {
  return describeTemplate(templateById.get(templateId), templateId).label;
}

/**
 * The name a save falls back to when the operator types nothing. A selected
 * rundown item is named after itself (that is what the operator sees in the
 * queue); the ad-hoc draft is named after its template.
 *
 * Shared by every save surface so "Save" means the same thing — and produces
 * the same label — in the Brand tab, the Design tab and Saved graphics.
 */
export function defaultPresetName(
  isRundownItem: boolean,
  sourceLabel: string,
  templateId: string
): string {
  const fallback = templateDisplayName(templateId);
  if (!isRundownItem) return fallback;
  return sourceLabel.trim() || fallback;
}

/** The final preset name for a typed value, applying the shared fallback. */
export function resolvePresetName(
  typed: string,
  isRundownItem: boolean,
  sourceLabel: string,
  templateId: string
): string {
  return typed.trim() || defaultPresetName(isRundownItem, sourceLabel, templateId);
}
