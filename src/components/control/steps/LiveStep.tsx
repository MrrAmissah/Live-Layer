import type { LastAction } from '../StatusBadge';
import TemplatePreview from '../../templates/TemplatePreview';
import DurationControl from '../DurationControl';
import LastActionLine from '../LastActionLine';
import StepIntro from './StepIntro';
import LayoutControls from '../LayoutControls';
import DraftPreviewNote from '../DraftPreviewNote';
import RundownQueue from '../RundownQueue';
import { useLiveTakeContext } from '../../../hooks/useLiveTakeContext';

interface LiveStepProps {
  lastAction: LastAction;
  lastTakenAt: number | null;
}

/**
 * Step 3 — the production monitor and the live settings. Take/Clear live in the
 * always-visible sticky bar below. In rundown mode the preview shows the SELECTED
 * item (what Take fires) and the queue controls replace the draft layout/duration
 * controls; in ad-hoc mode it's the draft.
 */
export default function LiveStep({ lastAction, lastTakenAt }: LiveStepProps) {
  const { preview, rundownActive } = useLiveTakeContext();

  return (
    <div className="step">
      <StepIntro
        step="3"
        title={rundownActive ? 'Run the rundown' : 'Take it live'}
        hint={
          rundownActive
            ? 'Select an item, check the preview, then press Take selected below.'
            : "Check the draft below, then press Take to send it live. Clear removes what's live."
        }
      />
      <div className="step-preview step-preview--lg">
        <TemplatePreview templateId={preview.templateId} values={preview.values} theme={preview.theme} layout={preview.layout} showControls={false} />
      </div>
      {rundownActive ? (
        <RundownQueue />
      ) : (
        <>
          <DraftPreviewNote />
          <LayoutControls />
          <DurationControl />
        </>
      )}
      <LastActionLine lastAction={lastAction} lastTakenAt={lastTakenAt} />
    </div>
  );
}
