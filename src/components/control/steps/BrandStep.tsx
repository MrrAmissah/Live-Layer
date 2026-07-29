import { useBrandReset } from '../../../hooks/useBrandReset';
import BrandControls from '../BrandControls';
import StepIntro from './StepIntro';

/** Secondary — brand colours + logo for the graphics. */
export default function BrandStep() {
  // Restores the graphic's own brand colours as well as the global default, so
  // the label is true: a reset visibly returns to the template colours.
  const resetBrand = useBrandReset();

  return (
    <div className="step">
      <StepIntro title="Brand colours" hint="Set the colours and logo used on your graphics." />
      <BrandControls />
      <button type="button" className="step-link" onClick={resetBrand}>
        Reset to template colours
      </button>
    </div>
  );
}
