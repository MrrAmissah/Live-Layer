import { useMemo } from 'react';
import { templateRegistry } from '../templates/registry';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import TemplateCard from './TemplateCard';

interface TemplateListProps {
  /** Notify the parent after a template is chosen (e.g. dock auto-advance). */
  onAfterSelect?: () => void;
}

/**
 * Category-grouped list of selectable template presets. Shared verbatim by the
 * studio `TemplateRail` and the dock `TemplateStep`; it owns its own store
 * subscription so either consumer can drop it in with no wiring.
 */
export default function TemplateList({ onAfterSelect }: TemplateListProps) {
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const currentVariantId = useLiveLayerStore((state) => state.draftValues.variantId);
  const setTemplate = useLiveLayerStore((state) => state.setTemplate);
  const setField = useLiveLayerStore((state) => state.setField);

  const grouped = useMemo(() => {
    return templateRegistry.reduce<Record<string, typeof templateRegistry>>((acc, template) => {
      (acc[template.category] ??= []).push(template);
      return acc;
    }, {});
  }, []);

  return (
    <div className="tpl-rail" role="radiogroup" aria-label="Choose a graphic">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="tpl-rail__group">
          <p className="tpl-rail__cat">
            <span>{category}</span>
            <span className="tpl-rail__cat-count">{items.length}</span>
          </p>
          <div className="tpl-rail__list">
            {items.map((template) => (
              <div key={template.id} className="tpl-card-wrap">
                <TemplateCard
                  template={template}
                  active={template.id === currentTemplateId}
                  onSelect={() => {
                    setTemplate(template.id);
                    onAfterSelect?.();
                  }}
                />
                {template.id === currentTemplateId && template.variants?.length ? (
                  <div className="tpl-variants" aria-label={`${template.name} variants`}>
                    <span className="tpl-variants__label">Styles</span>
                    {template.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        title={variant.description}
                        aria-pressed={currentVariantId === variant.id}
                        className={`tpl-variant ${currentVariantId === variant.id ? 'tpl-variant--active' : ''}`}
                        onClick={() => setField('variantId', variant.id)}
                      >
                        <span className="tpl-variant__name">{variant.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
