import Panel from './Panel';
import SectionHeader from './SectionHeader';
import TemplateFields from './TemplateFields';
import EditTargetBanner from './EditTargetBanner';
import LayoutControls from './LayoutControls';
import DurationControl from './DurationControl';
import { useEditTarget } from '../../hooks/useEditTarget';

/**
 * Content editor panel (studio mode). In rundown mode it edits the SELECTED item
 * (text + layout + duration + banner); in ad-hoc mode it's the draft (layout/
 * duration live in the action deck). Routes through the shared edit target.
 */
export default function FieldEditor() {
  const { isRundownItem, resetDraft } = useEditTarget();

  return (
    <Panel className="ll-fill">
      <SectionHeader
        kicker={isRundownItem ? 'Rundown item' : 'Content'}
        title={isRundownItem ? 'Edit item' : 'Edit graphic'}
        aside={
          isRundownItem ? null : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetDraft}>
              Reset
            </button>
          )
        }
      />
      <div className="ll-panel__body">
        <EditTargetBanner />
        <TemplateFields />
        {isRundownItem ? (
          <div className="field-editor__layout">
            <LayoutControls />
            <DurationControl />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
