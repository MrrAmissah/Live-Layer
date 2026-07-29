import { memo, useMemo } from 'react';
import type { TemplateDefinition } from '../../types/graphics';
import { templateRendererMap } from '../templates/registry';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { createDraftValues } from '../../lib/draftSeed';
import type { ExplicitBrandKey } from '../../lib/storage';
import GraphicStage from '../graphics/GraphicStage';
import { getTemplateDisplayCategory } from '../../lib/templateMeta';

/**
 * A real miniature render of a template's default look — the actual renderer in
 * a scaled GraphicStage, so library rows show what a template produces rather
 * than a mock. Entrance animations are killed via CSS so it rests at its final
 * frame.
 *
 * The base values come from the SAME seed the store uses when that template is
 * selected (`createDraftValues`), so a thumbnail and the graphic you get by
 * clicking it can never disagree. Renderers redeclare their colours from
 * `values`, so seeding from `template.defaultValues` alone made the library
 * show the stock palette while the real graphic wore the operator's brand.
 *
 * `themeOverride` picks the other context: a thumbnail representing the visible
 * edit target renders with that target's theme rather than the brand default.
 */
/**
 * The values a thumbnail renders, in precedence order:
 *   template defaults → chosen brand → active event pack   (inside the seed)
 *   → valuesOverride  → explicit variantId
 *
 * Exported so the precedence is unit-tested directly: the component reads these
 * inputs from the store, which a static render cannot vary.
 */
/**
 * The theme a thumbnail renders with, merged over the template's declared theme
 * so a partial, empty or legacy stored theme still resolves every slot.
 *
 * Which context theme arrives is the CALLER's decision, never inferred here:
 *
 * - a library thumbnail represents a graphic that does not exist yet, so it
 *   wears the brand default;
 * - a thumbnail standing in for the visible edit target — the draft, a loaded
 *   preset, a selected rundown item — wears that target's captured theme, or it
 *   would disagree with the main preview and with what Take airs whenever the
 *   target carries no per-value colours.
 *
 * Explicit `undefined` entries never clobber a resolved slot.
 */
export function composeThumbTheme(
  templateTheme: TemplateDefinition['theme'] | undefined,
  contextTheme: Partial<TemplateDefinition['theme']> | undefined
): TemplateDefinition['theme'] {
  const merged: Record<string, unknown> = { ...(templateTheme ?? {}) };
  for (const [key, value] of Object.entries(contextTheme ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as unknown as TemplateDefinition['theme'];
}

export function composeThumbValues(
  templateId: string,
  activePackId: string,
  brandTheme: TemplateDefinition['theme'],
  explicitBrandKeys: Iterable<ExplicitBrandKey>,
  valuesOverride?: Record<string, string>,
  variantId?: string
): Record<string, string> {
  return {
    ...createDraftValues(templateId, activePackId, brandTheme, explicitBrandKeys),
    ...(valuesOverride ?? {}),
    ...(variantId ? { variantId } : {})
  };
}

const TemplateThumb = memo(function TemplateThumb({
  template,
  variantId,
  valuesOverride,
  themeOverride
}: {
  template: TemplateDefinition;
  /** Render a specific design variant (else the template default). */
  variantId?: string;
  /** Override the seeded values (e.g. the live draft, for a variant strip). */
  valuesOverride?: Record<string, string>;
  /**
   * The theme of the graphic this thumbnail stands in for. Supplied by callers
   * that represent the VISIBLE edit target; omitted by the template library,
   * whose rows represent graphics that do not exist yet and so wear the brand
   * default. Deliberately explicit — never inferred from `valuesOverride`.
   */
  themeOverride?: Partial<TemplateDefinition['theme']>;
}) {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const brandTheme = useLiveLayerStore((state) => state.brandTheme);
  const explicitBrandKeys = useLiveLayerStore((state) => state.explicitBrandKeys);
  const Renderer = templateRendererMap[template.id];

  const values = useMemo(
    () => composeThumbValues(template.id, activePackId, brandTheme, explicitBrandKeys, valuesOverride, variantId),
    [template, activePackId, brandTheme, explicitBrandKeys, variantId, valuesOverride]
  );
  const mergedTheme = useMemo(
    () => composeThumbTheme(template.theme, themeOverride ?? brandTheme),
    [template, themeOverride, brandTheme]
  );

  if (!Renderer) return <span className="tpl-thumb tpl-thumb--empty" aria-hidden />;
  const focus = getTemplateDisplayCategory(template) === 'lowerThird' ? 'lower-third' : 'full';

  return (
    <span className="tpl-thumb" aria-hidden>
      <GraphicStage theme={mergedTheme} backdrop="neutral" focus={focus}>
        <div className="gfx-layer" data-anim="fade" data-state="in">
          <Renderer values={values} theme={mergedTheme} />
        </div>
      </GraphicStage>
    </span>
  );
});

export default TemplateThumb;
