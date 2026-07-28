import TemplateFields from './TemplateFields';
import EventPackSummary from './EventPackSummary';
import DesignPresets from './DesignPresets';
import type { GraphicInstance } from '../../types/graphics';

/**
 * Design tab layout (studio): variant carousel + palette + event-pack summary
 * in the main column, with the presets companion beside it on wide desktops
 * and collapsed beneath at constrained widths (see `.design-tab` CSS). Every
 * control here is renderer- or store-backed; the cross-surface actions are
 * owner callbacks so this component holds no navigation of its own.
 */
export default function DesignTab({
  onOpenBrand,
  onLoadPreset,
  onBrowseSaved,
  onBrowseAssets
}: {
  onOpenBrand: () => void;
  onLoadPreset: (preset: GraphicInstance) => void;
  onBrowseSaved: () => void;
  onBrowseAssets: () => void;
}) {
  return (
    <div className="design-tab">
      <div className="design-tab__main">
        <TemplateFields section="design" />
        <EventPackSummary onOpenBrand={onOpenBrand} />
      </div>
      <aside className="design-tab__aside">
        <DesignPresets onLoad={onLoadPreset} onBrowseSaved={onBrowseSaved} onBrowseAssets={onBrowseAssets} />
      </aside>
    </div>
  );
}
