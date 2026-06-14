import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import LibraryControls from './LibraryControls';

export default function LibraryPanel() {
  const presetCount = useLiveLayerStore((state) => state.presets.length);

  return (
    <Panel>
      <SectionHeader
        kicker="Library"
        title="Saved graphics & people"
        aside={<span className="ll-count">{presetCount}</span>}
      />
      <div className="ll-panel__body">
        <LibraryControls />
      </div>
    </Panel>
  );
}
