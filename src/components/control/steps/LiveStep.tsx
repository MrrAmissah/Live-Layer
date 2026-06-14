import { useLiveLayerStore } from '../../../store/useLiveLayerStore';
import type { LastAction } from '../StatusBadge';
import TemplatePreview from '../../templates/TemplatePreview';
import DurationControl from '../DurationControl';
import LastActionLine from '../LastActionLine';
import StepIntro from './StepIntro';
import LayoutControls from '../LayoutControls';
import DraftPreviewNote from '../DraftPreviewNote';

interface LiveStepProps {
  lastAction: LastAction;
  lastTakenAt: number | null;
}

/**
 * Step 3 — the production monitor and the live settings. Take/Clear live in the
 * always-visible sticky bar below (that bar is this step's Take too), so this
 * view focuses on a big preview, the auto-hide setting, and the live status.
 */
export default function LiveStep({ lastAction, lastTakenAt }: LiveStepProps) {
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftValues = useLiveLayerStore((state) => state.draftValues);
  const theme = useLiveLayerStore((state) => state.theme);
  const layout = useLiveLayerStore((state) => state.layout);

  return (
    <div className="step">
      <StepIntro step="3" title="Take it live" hint="Check the draft below, then press Take to send it live. Clear removes what's live." />
      <div className="step-preview step-preview--lg">
        <TemplatePreview templateId={currentTemplateId} values={draftValues} theme={theme} layout={layout} showControls={false} />
      </div>
      <DraftPreviewNote />
      <LayoutControls />
      <DurationControl />
      <LastActionLine lastAction={lastAction} lastTakenAt={lastTakenAt} />
    </div>
  );
}
