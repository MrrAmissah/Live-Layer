import TemplateList from '../TemplateList';
import StepIntro from './StepIntro';

interface TemplateStepProps {
  onNext: () => void;
}

/** Step 1 — choose a graphic, then move on to editing its text. */
export default function TemplateStep({ onNext }: TemplateStepProps) {
  return (
    <div className="step">
      <StepIntro step="1" title="Choose a graphic" hint="Choose the graphic you want to show." />
      <TemplateList />
      <button type="button" className="step-next" onClick={onNext}>
        Next: Edit text →
      </button>
    </div>
  );
}
