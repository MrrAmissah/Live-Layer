import { templateRegistry } from '../templates/registry';
import TemplatePreview from '../templates/TemplatePreview';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import DraftPreviewNote from './DraftPreviewNote';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';

/**
 * Production monitor panel. Frames the preview-parity renderer. In rundown mode
 * it shows the SELECTED item (what the deck Take fires), so the studio preview
 * always matches what Take will air; otherwise the ad-hoc draft.
 */
export default function PreviewPanel() {
  const { preview, rundownActive } = useLiveTakeContext();
  const template = templateRegistry.find((item) => item.id === preview.templateId);

  return (
    <Panel className="ll-fill" flush>
      <SectionHeader
        kicker={rundownActive ? 'Selected item' : 'Draft preview'}
        title={template?.name ?? 'Preview'}
        aside={
          <div className="preview-tags">
            {template ? <span className="ll-tag ll-tag--accent">{template.category}</span> : null}
            <span className="ll-tag">1920×1080</span>
          </div>
        }
      />
      <div className="ll-panel__body preview-panel__body">
        <TemplatePreview templateId={preview.templateId} values={preview.values} theme={preview.theme} layout={preview.layout} />
      </div>
      {rundownActive ? null : (
        <div className="preview-foot">
          <DraftPreviewNote />
        </div>
      )}
    </Panel>
  );
}
