import { useId, useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useEditTarget } from '../../hooks/useEditTarget';
import { templateRegistry } from '../templates/registry';
import { createDraftValues } from '../../lib/draftSeed';
import { describeOverrideCount, findVisualOverrides } from '../../lib/visualOverrides';
import { getPack } from '../../lib/packs';
import { Icon } from '../../lib/icons';

/**
 * Section C — how the visible graphic differs, visually, from what its template
 * and the active event pack would produce right now.
 *
 * The comparison is against a freshly computed seed, so the wording is
 * "compared with <pack>" rather than any claim about what this graphic
 * inherited when it was created — a rundown item captured under a different
 * pack has no stored provenance to appeal to.
 *
 * Collapsed by default: it is a check, not a control, and expanding it must not
 * cost vertical space on the constrained studio widths.
 */
export default function GraphicOverrides() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const theme = useLiveLayerStore((state) => state.theme);
  const { templateId, values } = useEditTarget();

  const known = templateRegistry.some((template) => template.id === templateId);
  const seed = createDraftValues(templateId, activePackId, theme);
  const overrides = known ? findVisualOverrides(values, seed) : [];
  const summary = known ? describeOverrideCount(overrides.length) : 'Comparison unavailable';

  return (
    <div className="gfx-overrides">
      <button
        type="button"
        className="gfx-overrides__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="gfx-overrides__summary">{summary}</span>
        <span className="gfx-overrides__chevron" data-open={open || undefined}>
          <Icon name="chevronDown" size={15} />
        </span>
      </button>

      <div id={panelId} className="gfx-overrides__panel" hidden={!open}>
        {!known ? (
          <p className="field__hint">
            This graphic uses a template this build doesn’t have, so there is nothing to compare it with.
          </p>
        ) : overrides.length === 0 ? (
          <p className="field__hint">Compared with {getPack(activePackId).name} — nothing changed.</p>
        ) : (
          <>
            <p className="field__hint">Compared with {getPack(activePackId).name}:</p>
            <ul className="gfx-overrides__list">
              {overrides.map((override) => (
                <li key={override.id} className="gfx-overrides__row">
                  <span className="gfx-overrides__label">{override.label}</span>
                  <span className="gfx-overrides__value">{override.value || '—'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
