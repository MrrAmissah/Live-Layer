import TemplatePreview from '../templates/TemplatePreview';
import Panel from './Panel';
import DraftPreviewNote from './DraftPreviewNote';
import { Icon } from '../../lib/icons';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';

/**
 * Production monitor panel. Frames the preview-parity renderer. In rundown mode
 * it shows the SELECTED item (what the deck Take fires), so the studio preview
 * always matches what Take will air; otherwise the ad-hoc draft. The draft
 * reassurance rides in the monitor's own integrated bottom strip.
 */
export default function PreviewPanel() {
  const { preview, rundownActive } = useLiveTakeContext();

  return (
    <Panel className="ll-fill preview-console" flush>
      <div className="ll-panel__body preview-panel__body">
        <TemplatePreview
          templateId={preview.templateId}
          values={preview.values}
          theme={preview.theme}
          layout={preview.layout}
          footer={
            rundownActive ? (
              <span className="preview-note">
                <Icon name="queue" size={13} />
                Showing the selected rundown item — Take fires this graphic.
              </span>
            ) : (
              <span className="preview-note">
                <Icon name="edit" size={13} />
                <DraftPreviewNote />
              </span>
            )
          }
        />
      </div>
    </Panel>
  );
}
