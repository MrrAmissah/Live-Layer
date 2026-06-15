import TemplatePreview from '../../templates/TemplatePreview';
import TemplateFields from '../TemplateFields';
import StepIntro from './StepIntro';
import DraftPreviewNote from '../DraftPreviewNote';
import EditTargetBanner from '../EditTargetBanner';
import LayoutControls from '../LayoutControls';
import DurationControl from '../DurationControl';
import { useEditTarget } from '../../../hooks/useEditTarget';

interface EditStepProps {
  onNext: () => void;
}

/**
 * Step 2 — edit the content. In rundown mode the editors target the SELECTED item
 * (text + layout + duration become the full item editor here, with the ad-hoc
 * draft preserved); in ad-hoc mode it's the draft (layout/duration stay on the
 * Live tab). The preview always reflects the edit target.
 */
export default function EditStep({ onNext }: EditStepProps) {
  const { templateId, values, theme, layout, isRundownItem, resetDraft } = useEditTarget();

  return (
    <div className="step">
      <StepIntro
        step="2"
        title={isRundownItem ? 'Edit the item' : 'Edit the text'}
        hint={isRundownItem ? 'Editing the selected rundown item — the preview updates as you type.' : 'Change the text. The preview updates as you type.'}
      />
      <EditTargetBanner />
      <div className="step-preview step-preview--sm">
        <TemplatePreview templateId={templateId} values={values} theme={theme} layout={layout} showControls={false} />
      </div>
      {isRundownItem ? null : <DraftPreviewNote />}
      <TemplateFields />
      {isRundownItem ? (
        <>
          <LayoutControls />
          <DurationControl />
        </>
      ) : (
        <button type="button" className="step-link" onClick={resetDraft}>
          Reset text to default
        </button>
      )}
      <button type="button" className="step-next" onClick={onNext}>
        Next: Go live →
      </button>
    </div>
  );
}
