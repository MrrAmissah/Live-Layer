import { useLocation } from 'react-router-dom';
import TemplatePreview from '../templates/TemplatePreview';
import TemplateFields from './TemplateFields';
import DraftPreviewNote from './DraftPreviewNote';
import PersonFastSwap from './PersonFastSwap';
import LayoutControls from './LayoutControls';
import DurationControl from './DurationControl';
import LogoControls from './LogoControls';
import { Swatch } from './BrandControls';
import { useEditTarget } from '../../hooks/useEditTarget';
import { useRundowns } from '../../hooks/useRundowns';
import { useBrandSwatch } from '../../hooks/useBrandSwatch';
import { useBrandReset } from '../../hooks/useBrandReset';
import { getQueueCursors } from '../../lib/rundown/rundownStore';
import { graphicTitle, templateLabel } from '../../lib/graphicTitle';
import { BRAND_SWATCHES, type BrandSwatch } from '../../lib/brandWrites';
import { resolvePaletteColors, type PaletteFieldId } from '../../lib/visualState';
import { GFX_DEFAULT_ACCENT_2, GFX_DEFAULT_BRAND } from '../graphics/stage';
import { contentFieldExclusions } from '../../lib/contentFields';
import { Icon } from '../../lib/icons';

interface DockQuickEditTabProps {
  /** Jump to the Queue tab (the "Queue #N" chip, and the no-selection recovery). */
  onOpenQueue: () => void;
}

/**
 * Quick Edit tab: field editing for whatever Take would send — the selected
 * rundown item, or the ad-hoc draft when no rundown is active. Every write
 * goes through `useEditTarget`, so editing never touches Program; output only
 * changes on the next Take from the Program strip.
 *
 * The mockup's three-button row (Discard / Save to queue item / Save & Take)
 * is deliberately not built: writes through the edit target persist as you
 * type, so there is no buffered state to save or discard — and "Save & Take"
 * would be a second Take next to the Program strip's only one. The copy
 * states the real model instead of simulating a different one.
 */
export default function DockQuickEditTab({ onOpenQueue }: DockQuickEditTabProps) {
  const target = useEditTarget();
  const rd = useRundowns();
  const location = useLocation();

  // Rundown active but nothing selected: the editors would fall through to
  // the HIDDEN ad-hoc draft — a graphic Take cannot send while the rundown is
  // active. Refuse and route to the Queue tab instead of silently editing
  // something invisible.
  if (rd.activeRundown && !target.isRundownItem) {
    return (
      <div className="dock-tabpane dock-e">
        <section className="dock-card">
          <div className="dock-card__head">
            <span className="ll-kicker dock-e__kicker">Editing</span>
          </div>
          <p className="dock-card__hint">
            No queue item selected. Select an item in the Queue tab to edit it here.
          </p>
          <button type="button" className="btn btn--secondary btn--sm dock-e__gotoqueue" onClick={onOpenQueue}>
            <Icon name="queue" size={14} />
            Open Queue
          </button>
        </section>
      </div>
    );
  }

  const { selectedIndex } = getQueueCursors(rd.activeRundown);
  const title = target.isRundownItem
    ? target.sourceLabel
    : graphicTitle({ templateId: target.templateId, values: target.values });
  // Same origin, same query (a configured relay must survive the jump) — the
  // studio layout needs a window wider than a dock, hence a new tab.
  const studioHref = `/control/studio${location.search}`;

  return (
    <div className="dock-tabpane dock-e">
      <section className="dock-card">
        <div className="dock-e__head">
          <div className="dock-e__id">
            <span className="ll-kicker dock-e__kicker">Editing</span>
            <span className="dock-e__title" title={title}>{title}</span>
            <span className="dock-e__type">{templateLabel(target.templateId)}</span>
          </div>
          {target.isRundownItem && selectedIndex >= 0 ? (
            <button
              type="button"
              className="dock-e__chip"
              title="Open the Queue tab"
              onClick={onOpenQueue}
            >
              <Icon name="queue" size={13} />
              Queue #{selectedIndex + 1}
            </button>
          ) : null}
        </div>
        {/* The header above already names the target and, for a queue item, its
            position. `EditTargetBanner` said the same thing again in a second
            box, and the preview-only note said a third thing that never
            changed. Both are gone: one context treatment, and the fields start
            ~160px higher because of it. */}
        {/* Bare frame — the graphic itself, not the studio monitor chrome. */}
        <div className="dock-next__monitor">
          <TemplatePreview
            templateId={target.templateId}
            values={target.values}
            theme={target.theme}
            layout={target.layout}
            showControls={false}
            frame="bare"
          />
        </div>
        {/* The preview-only disclosure STAYS — it is the dock's core safety
            model, not filler. What went is the bordered card it sat in: one
            quiet caption line under the monitor instead of a panel. */}
        <div className="dock-e__note">
          <DraftPreviewNote />
          <a className="dock-e__studio" href={studioHref} target="_blank" rel="noopener noreferrer">
            Open in Studio
            <Icon name="external" size={13} />
          </a>
        </div>
      </section>

      <section className="dock-card">
        <div className="dock-card__head">
          <span className="ll-kicker">Content</span>
        </div>
        <TemplateFields section="content" excludeFieldIds={contentFieldExclusions(target.isRundownItem)} />
        {/* Right under the fields it fills, and it renders nothing at all on a
            template with no person to swap. */}
        <PersonFastSwap />
        {target.isRundownItem ? (
          <p className="dock-card__hint">Changes save to this queue item as you type.</p>
        ) : (
          <button type="button" className="step-link" onClick={target.resetDraft}>
            Reset text to default
          </button>
        )}
      </section>

      <details className="dock-card dock-panel">
        <summary className="dock-panel__summary">
          <span className="ll-kicker">Appearance</span>
          <Icon name="chevronDown" size={15} className="dock-panel__chev" />
        </summary>
        <div className="dock-panel__body">
          <TemplateFields section="variant" />
          <PaletteRow />
        </div>
      </details>

      {/* No dock-card__head here: LogoControls carries its own "Logo /
          Optional" field label, and a second LOGO kicker read as two panels. */}
      <section className="dock-card">
        <LogoControls />
      </section>

      <details className="dock-card dock-panel">
        <summary className="dock-panel__summary">
          <span className="ll-kicker">Layout</span>
          <Icon name="chevronDown" size={15} className="dock-panel__chev" />
        </summary>
        <div className="dock-panel__body">
          <LayoutControls />
          <DurationControl />
        </div>
      </details>
    </div>
  );
}

/**
 * The dock palette row: the TWO brand-editable swatches, not the mockup's
 * three. `colorText` belongs to Design's "Reset palette" (see useBrandReset),
 * so a third chip here would either write a field Brand doesn't own or be
 * decorative — both dishonest. The reset is `useBrandReset`, labelled for
 * what it actually does: restore Main/Accent to this template's pack seed.
 */
function PaletteRow() {
  const { templateId, values, theme: targetTheme } = useEditTarget();
  const applySwatch = useBrandSwatch();
  const resetBrand = useBrandReset();

  // Same resolution as BrandControls: what the graphic actually paints.
  const resolved = resolvePaletteColors(templateId, values, targetTheme);
  const swatchValue = (swatch: BrandSwatch, fallback: string): string =>
    resolved[BRAND_SWATCHES[swatch].field as PaletteFieldId] || fallback;

  return (
    <div className="dock-e__palette">
      <span className="field__label">
        <span>Palette</span>
        <button type="button" className="template-colors__reset" onClick={resetBrand}>
          Reset to pack colours
        </button>
      </span>
      <div className="brand-grid__swatches">
        <Swatch
          label={BRAND_SWATCHES.main.label}
          value={swatchValue('main', GFX_DEFAULT_BRAND)}
          onChange={(value) => applySwatch('main', value)}
        />
        <Swatch
          label={BRAND_SWATCHES.accent.label}
          value={swatchValue('accent', GFX_DEFAULT_ACCENT_2)}
          onChange={(value) => applySwatch('accent', value)}
        />
      </div>
      <p className="field__hint">
        Main and accent only — the full palette (surface, text) is edited in the studio Design tab.
      </p>
    </div>
  );
}
