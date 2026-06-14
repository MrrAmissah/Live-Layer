import { templateRegistry } from '../templates/registry';
import TemplatePreview from '../templates/TemplatePreview';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import DraftPreviewNote from './DraftPreviewNote';

/**
 * Production monitor panel. Frames the preview-parity renderer (same stage,
 * scale, theme, and safe areas as /output) and labels what's loaded. The
 * background + safe-area controls live inside TemplatePreview; this panel only
 * supplies the surrounding chrome — the parity call-site stays untouched.
 */
export default function PreviewPanel() {
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftValues = useLiveLayerStore((state) => state.draftValues);
  const theme = useLiveLayerStore((state) => state.theme);
  const layout = useLiveLayerStore((state) => state.layout);

  const template = templateRegistry.find((item) => item.id === currentTemplateId);

  return (
    <Panel className="ll-fill" flush>
      <SectionHeader
        kicker="Draft preview"
        title={template?.name ?? 'Preview'}
        aside={
          <div className="preview-tags">
            {template ? <span className="ll-tag ll-tag--accent">{template.category}</span> : null}
            <span className="ll-tag">1920×1080</span>
          </div>
        }
      />
      <div className="ll-panel__body preview-panel__body">
        <TemplatePreview templateId={currentTemplateId} values={draftValues} theme={theme} layout={layout} />
      </div>
      <div className="preview-foot">
        <DraftPreviewNote />
      </div>
    </Panel>
  );
}
