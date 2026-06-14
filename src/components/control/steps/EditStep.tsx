import { useLiveLayerStore } from '../../../store/useLiveLayerStore';
import TemplatePreview from '../../templates/TemplatePreview';
import TemplateFields from '../TemplateFields';
import StepIntro from './StepIntro';
import DraftPreviewNote from '../DraftPreviewNote';

interface EditStepProps {
  onNext: () => void;
}

/** Step 2 — edit the graphic's text, with a live thumbnail above the fields. */
export default function EditStep({ onNext }: EditStepProps) {
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftValues = useLiveLayerStore((state) => state.draftValues);
  const theme = useLiveLayerStore((state) => state.theme);
  const layout = useLiveLayerStore((state) => state.layout);
  const resetDraft = useLiveLayerStore((state) => state.resetDraft);

  return (
    <div className="step">
      <StepIntro step="2" title="Edit the text" hint="Change the text. The preview updates as you type." />
      <div className="step-preview step-preview--sm">
        <TemplatePreview templateId={currentTemplateId} values={draftValues} theme={theme} layout={layout} showControls={false} />
      </div>
      <DraftPreviewNote />
      <TemplateFields />
      <button type="button" className="step-link" onClick={resetDraft}>
        Reset text to default
      </button>
      <button type="button" className="step-next" onClick={onNext}>
        Next: Go live →
      </button>
    </div>
  );
}
