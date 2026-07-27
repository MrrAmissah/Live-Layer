import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { graphicPacks, getPack } from '../../lib/packs';
import { Icon } from '../../lib/icons';

/**
 * Honest event-pack summary for the Design tab. Every field is backed by real
 * pack data (`activePackId` + `graphicPacks`): the active pack's name, whether
 * it is the default house style, and a one-line note that packs curate the
 * variant choices. "Open Brand" hands off to the functional Brand tab.
 *
 * Deliberately NOT shown — none of it is backed by data today: typography,
 * last-updated timestamps, a pack logo, an "override brand" mode, or a
 * pack-editing action. See the Stage 2 audit.
 */
export default function EventPackSummary({ onOpenBrand }: { onOpenBrand: () => void }) {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const setActivePack = useLiveLayerStore((state) => state.setActivePack);
  const pack = getPack(activePackId);
  const isDefault = pack.id === 'house';
  const curatesVariants = Boolean(pack.variantChoices && Object.keys(pack.variantChoices).length > 0);

  return (
    <section className="pack-summary" aria-label="Event pack">
      <div className="pack-summary__head">
        <span className="ll-kicker">Event pack</span>
        <button type="button" className="pack-summary__brand-link" onClick={onOpenBrand}>
          Open Brand
          <Icon name="chevronRight" size={13} />
        </button>
      </div>

      <label className="pack-summary__row">
        <span className="pack-summary__select">
          <select
            value={activePackId}
            aria-label="Active event pack"
            onChange={(event) => setActivePack(event.target.value)}
          >
            {graphicPacks.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={15} />
        </span>
        <span className={`pack-summary__state${isDefault ? ' pack-summary__state--default' : ''}`}>
          {isDefault ? 'Default' : 'Active'}
        </span>
      </label>

      <p className="pack-summary__note">
        {curatesVariants
          ? `“${pack.name}” curates the design variants offered for its templates.`
          : `“${pack.name}” offers the full variant set for every template.`}
      </p>
    </section>
  );
}
