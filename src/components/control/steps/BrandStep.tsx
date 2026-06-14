import { useLiveLayerStore } from '../../../store/useLiveLayerStore';
import BrandControls from '../BrandControls';
import StepIntro from './StepIntro';

/** Secondary — brand colours + logo for the graphics. */
export default function BrandStep() {
  const resetTheme = useLiveLayerStore((state) => state.resetTheme);

  return (
    <div className="step">
      <StepIntro title="Brand colours" hint="Set the colours and logo used on your graphics." />
      <BrandControls />
      <button type="button" className="step-link" onClick={resetTheme}>
        Reset to template colours
      </button>
    </div>
  );
}
