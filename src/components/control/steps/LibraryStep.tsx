import LibraryControls from '../LibraryControls';
import StepIntro from './StepIntro';

/** Secondary — saved graphics and reusable people. */
export default function LibraryStep() {
  return (
    <div className="step">
      <StepIntro title="Library" hint="Recall saved graphics or apply a saved speaker to the lower third." />
      <LibraryControls />
    </div>
  );
}
