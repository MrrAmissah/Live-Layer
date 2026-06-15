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
        title="Graphics, people & packs"
        aside={<span className="ll-count" title="Saved graphics">{presetCount} saved</span>}
      />
      <div className="ll-panel__body">
        <LibraryControls />
      </div>
    </Panel>
  );
}
