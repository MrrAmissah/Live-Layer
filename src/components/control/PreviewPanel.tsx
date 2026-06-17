import TemplatePreview from '../templates/TemplatePreview';
import Panel from './Panel';
import DraftPreviewNote from './DraftPreviewNote';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';

/**
 * Production monitor panel. Frames the preview-parity renderer. In rundown mode
 * it shows the SELECTED item (what the deck Take fires), so the studio preview
 * always matches what Take will air; otherwise the ad-hoc draft.
 */
export default function PreviewPanel() {
  const { preview, rundownActive } = useLiveTakeContext();

  return (
    <Panel className="ll-fill preview-console" flush>
      <div className="ll-panel__body preview-panel__body">
        <TemplatePreview templateId={preview.templateId} values={preview.values} theme={preview.theme} layout={preview.layout} />
      </div>
      {rundownActive ? null : (
        <div className="preview-foot">
          <span className="preview-foot__dot" aria-hidden />
          <DraftPreviewNote />
        </div>
      )}
    </Panel>
  );
}
