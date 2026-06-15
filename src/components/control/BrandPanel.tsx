import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import BrandControls from './BrandControls';

/**
 * Brand panel (studio mode). Chrome + reset around the shared BrandControls.
 * Secondary by design but tidy.
 */
export default function BrandPanel() {
  const resetTheme = useLiveLayerStore((state) => state.resetTheme);

  return (
    <Panel>
      <SectionHeader
        kicker="Brand"
        title="Look"
        aside={
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetTheme}>
            Reset
          </button>
        }
      />
      <div className="ll-panel__body">
        <BrandControls />
      </div>
    </Panel>
  );
}
