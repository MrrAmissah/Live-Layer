import { memo, useMemo } from 'react';
import type { TemplateDefinition } from '../../types/graphics';
import { templateRendererMap } from '../templates/registry';
import { packOverridesFor } from '../../lib/packs';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import GraphicStage from '../graphics/GraphicStage';
import { getTemplateDisplayCategory } from '../../lib/templateMeta';

/**
 * A real miniature render of a template's default look — the actual renderer in
 * a scaled GraphicStage, wearing the active event pack, so library rows show
 * what a template produces rather than a mock. Entrance animations are killed
 * via CSS so it rests at its final frame.
 */
const TemplateThumb = memo(function TemplateThumb({
  template,
  variantId,
  valuesOverride
}: {
  template: TemplateDefinition;
  /** Render a specific design variant (else the template default). */
  variantId?: string;
  /** Override the seeded values (e.g. the live draft, for a variant strip). */
  valuesOverride?: Record<string, string>;
}) {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const storeTheme = useLiveLayerStore((state) => state.theme);
  const Renderer = templateRendererMap[template.id];

  const values = useMemo(
    () => ({
      ...template.defaultValues,
      ...packOverridesFor(activePackId, template.id),
      ...(valuesOverride ?? {}),
      ...(variantId ? { variantId } : {})
    }),
    [template, activePackId, variantId, valuesOverride]
  );
  const mergedTheme = useMemo(() => ({ ...template.theme, ...storeTheme }), [template, storeTheme]);

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
