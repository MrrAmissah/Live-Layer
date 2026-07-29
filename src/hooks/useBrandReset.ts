import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useEditTarget } from './useEditTarget';
import { planBrandResetValues } from '../lib/brandWrites';

/**
 * "Reset brand" for every surface that offers it (the studio Brand tab, the
 * dock Brand step).
 *
 * Restores BOTH halves of what a brand swatch writes: the persisted global
 * default that seeds new graphics, and the visible target's own brand colours.
 * Resetting only the global default would leave the graphic painted in the
 * colour just discarded — the renderers read the per-graphic values — so the
 * action would appear to do nothing and the next Take would still air the old
 * colour.
 *
 * Target-aware, like the swatches: the ad-hoc draft, or the selected rundown
 * item. Never publishes; output only changes on the next Take.
 */
export function useBrandReset(): () => void {
  const resetTheme = useLiveLayerStore((state) => state.resetTheme);
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const { templateId, setFields } = useEditTarget();

  return () => {
    resetTheme();
    const values = planBrandResetValues(templateId, activePackId);
    // An unknown template yields no seed; leave the graphic alone rather than
    // blanking colours we cannot derive.
    if (Object.keys(values).length > 0) setFields(values);
  };
}
