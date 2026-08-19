import { useMemo } from 'react';
import { templateRegistry } from '../templates/registry';
import { rendersLogo } from '../../lib/templateCapabilities';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useEditTarget } from '../../hooks/useEditTarget';
import { packVariantIdsFor } from '../../lib/packs';
import { Icon } from '../../lib/icons';
import EditTargetBanner from './EditTargetBanner';
import TemplateFields from './TemplateFields';
import PersonFastSwap from './PersonFastSwap';
import TemplateThumb from './TemplateThumb';
import LayoutControls from './LayoutControls';
import { canManageLogoInBrand, contentFieldExclusions, safeDecodeFilename } from '../../lib/contentFields';
import DurationControl from './DurationControl';

function logoName(values: Record<string, string>): string | null {
  const url = values.logoUrl?.trim();
  if (url) return safeDecodeFilename(url.split('/').pop() || url);
  if (values.logoAssetId?.trim()) return 'Stored asset';
  return null;
}

/** Compact current-logo summary. Change routes to the Brand tab where uploads
 *  live; position/scale are intentionally omitted (no renderer support). */
function LogoSummary({
  values,
  onManage,
  canManage
}: {
  values: Record<string, string>;
  onManage: () => void;
  canManage: boolean;
}) {
  const name = logoName(values);
  const src = values.logoResolvedSrc?.trim() || values.logoUrl?.trim() || '';
  return (
    <div className="logo-summary">
      <span className="ll-kicker">Logo</span>
      <div className="logo-summary__body">
        <span className="logo-summary__thumb">
          {src ? <img src={src} alt="" /> : <Icon name="image" size={20} />}
        </span>
        <span className="logo-summary__meta">
          <span className="logo-summary__name">{name ?? 'No logo set'}</span>
          {/* Brand cannot edit a captured rundown item, so the shortcut is
              hidden there rather than replaced with a control that misleads. */}
          {canManage ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={onManage}>
              Change in Brand
            </button>
          ) : (
            <span className="logo-summary__hint">Edited with this item’s fields</span>
          )}
        </span>
      </div>
    </div>
  );
}

/** Compact design-variant strip — quick switching without leaving Content
 *  (the full picker + palette live in the Design tab). */
function DesignVariantStrip() {
  // The strip stands in for the VISIBLE graphic, so it renders with that
  // target's theme — the draft's, a loaded preset's, or the selected rundown
  // item's — not the brand default.
  const { templateId, values, theme: targetTheme, setField } = useEditTarget();
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const template = templateRegistry.find((t) => t.id === templateId);

  const variants = useMemo(() => {
    if (!template?.variants?.length) return [];
    const curated = packVariantIdsFor(activePackId, template.id);
    const base = curated
      ? curated.map((id) => template.variants?.find((v) => v.id === id)).filter((v): v is NonNullable<typeof v> => Boolean(v))
      : template.variants;
    const currentId = values.variantId;
    if (currentId && !base.some((v) => v.id === currentId)) {
      const current = template.variants.find((v) => v.id === currentId);
      if (current) return [...base, current];
    }
    return base;
  }, [template, activePackId, values.variantId]);

  if (!template || variants.length < 2) return null;
  const active = values.variantId ?? template.defaultValues.variantId ?? variants[0].id;

  /**
   * A design sample, not on-air content.
   *
   * These thumbnails exist to show what each variant LOOKS like, and they render
   * the live draft so the operator sees their own copy in the design. Once
   * `ScriptureCard` stopped inventing content for an empty card, an empty draft
   * turned all four scripture thumbnails into the same placeholder — the design
   * chooser stopped showing designs.
   *
   * So empty content fields fall back to the template's own declared
   * `defaultValues` HERE ONLY. That is not the fabrication that was removed: it is
   * the template's published sample copy, it is the same thing the library row
   * already renders, and it cannot reach air — Preview and Take read
   * `useLiveTakeContext`, which is a different path and still refuses an empty
   * card. `values` wins wherever the operator has actually typed something.
   */
  const sampleValues: Record<string, string> = { ...template.defaultValues };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') sampleValues[key] = value;
  }

  return (
    <div className="variant-strip">
      <span className="ll-kicker">Design variant</span>
      <div className="variant-strip__row" role="radiogroup" aria-label="Design variant">
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={active === variant.id}
            className={`variant-strip__item${active === variant.id ? ' variant-strip__item--active' : ''}`}
            onClick={() => setField('variantId', variant.id)}
            title={variant.name}
          >
            <span className="variant-strip__thumb">
              <TemplateThumb
                template={template}
                variantId={variant.id}
                valuesOverride={sampleValues}
                themeOverride={targetTheme ?? {}}
              />
            </span>
            <span className="variant-strip__name">{variant.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Content tab (studio): a two-column layout — schema-backed text fields with
 * character guidance on the left, current-logo summary on the right — over a
 * compact design-variant strip, matching Full-studio01. In rundown mode the
 * item's layout/duration controls are included, preserving today's behaviour.
 */
export default function ContentTab({ onManageLogo }: { onManageLogo: () => void }) {
  const { templateId, values, isRundownItem } = useEditTarget();
  /**
   * THE LOGO CARD ONLY APPEARS FOR TEMPLATES THAT PAINT A LOGO.
   *
   * It used to appear for all of them, and `rendersLogo` — which has said
   * `scripture-card: false` all along — was consulted by nothing here. So
   * editing a scripture card offered a logo the card cannot show, and the
   * offer cost 232px of the field column: the chapter grid was squeezed into
   * half the width it had available while a control with no effect sat beside
   * it. Two faults from one missing check, and the second is the one the
   * operator feels.
   */
  const showLogo = rendersLogo(templateId);

  return (
    <div className="content-tab">
      <div className="content-tab__grid" data-side={showLogo ? 'logo' : 'none'}>
        <div className="content-tab__fields">
          <EditTargetBanner />
          {/**
            * THE SAME QUICK SEARCH THE DOCK HAS.
            *
            * It rendered only in `DockQuickEditTab`, so it existed below 1024px
            * and nowhere above it — and the operator controlling from the second
            * machine over the relay is on a laptop, which is the studio layout.
            * The person who most needs to find a name quickly was the one
            * surface that never offered it.
            *
            * `PersonFastSwap` returns null unless the current template carries
            * person fields, so this costs nothing on a scripture card or an
            * announcement, and it writes through the same target-aware path here
            * as it does in the dock.
            */}
          <PersonFastSwap />
          <TemplateFields section="content" excludeFieldIds={contentFieldExclusions(isRundownItem)} />
        </div>
        {showLogo ? (
          <div className="content-tab__side">
            <LogoSummary values={values} onManage={onManageLogo} canManage={canManageLogoInBrand(isRundownItem)} />
          </div>
        ) : null}
      </div>
      <DesignVariantStrip />
      {isRundownItem ? (
        <div className="field-editor__layout">
          <LayoutControls />
          <DurationControl />
        </div>
      ) : null}
    </div>
  );
}
