import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useEditTarget } from '../../hooks/useEditTarget';
import { usePackSwitchGuard } from '../../hooks/usePackSwitchGuard';
import { getPack, graphicPacks } from '../../lib/packs';

/**
 * Section B — the active event pack, backed only by real pack data
 * (`activePackId` + `graphicPacks`).
 *
 * Draft mode offers the real switcher through the shared guard, so an edited
 * draft still gets its confirmation before being re-seeded.
 *
 * With a rundown item selected the pack is READ-ONLY. Switching from here would
 * re-seed the hidden ad-hoc draft — a target the operator cannot see from this
 * surface — while leaving the visible item untouched; that is exactly the silent
 * mismatch this stage set out to remove. The pack remains switchable from the
 * command bar and the Design tab, where the draft is the subject.
 *
 * Deliberately NOT shown — none of it is backed by data: pack editing, a pack
 * logo, named palettes, typography, or last-updated timestamps.
 */
export default function BrandEventPack() {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const { requestPackChange } = usePackSwitchGuard();
  const { isRundownItem } = useEditTarget();
  const pack = getPack(activePackId);

  if (isRundownItem) {
    return (
      <div className="brand-pack">
        <div className="brand-pack__readonly">
          <span className="brand-pack__name">{pack.name}</span>
          <span className="brand-pack__state">Active</span>
        </div>
        <p className="field__hint">
          Event packs seed new graphics. Changing the pack does not alter the selected rundown item,
          so it can’t be switched from here — use the command bar or the Design tab.
        </p>
      </div>
    );
  }

  return (
    <div className="brand-pack">
      <div className="layout-seg pack-seg">
        {graphicPacks.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`layout-seg__btn${option.id === activePackId ? ' layout-seg__btn--active' : ''}`}
            aria-pressed={option.id === activePackId}
            onClick={() => requestPackChange(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
      <p className="field__hint">
        {pack.description} Applies to new graphics; switching re-seeds the current draft.
      </p>
    </div>
  );
}
