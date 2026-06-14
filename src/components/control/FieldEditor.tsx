import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import TemplateFields from './TemplateFields';

/**
 * Content editor panel (studio mode). Chrome + reset around the shared
 * TemplateFields, which groups required content first and optional fields below
 * a divider so the operator's eye lands on what actually changes the graphic.
 */
export default function FieldEditor() {
  const resetDraft = useLiveLayerStore((state) => state.resetDraft);

  return (
    <Panel className="ll-fill">
      <SectionHeader
        kicker="Content"
        title="Edit fields"
        aside={
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetDraft}>
            Reset
          </button>
        }
      />
      <div className="ll-panel__body">
        <TemplateFields />
      </div>
    </Panel>
  );
}
