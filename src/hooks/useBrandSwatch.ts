import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useEditTarget } from './useEditTarget';
import { planBrandColorWrite, type BrandSwatch } from '../lib/brandWrites';

/**
 * Apply a Brand colour swatch to whatever is visible.
 *
 * The whole decision lives here rather than in `BrandControls` so it is
 * reachable from a test: the component renders chips and calls this, and holds
 * no branching of its own. (A static render cannot fire a change handler, so a
 * decision left inside the component is unreachable by every test in this
 * suite — which is exactly how it went uncovered.)
 *
 * A swatch always writes the visible target's own colour field, because that is
 * what the renderers read. Whether it ALSO moves the persisted brand default
 * depends on the target: the draft is the next new graphic, so its colour is the
 * new default; a selected rundown item is a captured graphic, and recolouring
 * one item in a queue must not redefine every graphic made afterwards.
 *
 * Program is never touched — output changes only on the next Take.
 */
export function useBrandSwatch(): (swatch: BrandSwatch, value: string) => void {
  const setTheme = useLiveLayerStore((state) => state.setTheme);
  const { isRundownItem, setFields } = useEditTarget();

  return (swatch, value) => {
    const write = planBrandColorWrite(swatch, value, isRundownItem);
    if (Object.keys(write.theme).length > 0) setTheme(write.theme);
    setFields(write.values);
  };
}
