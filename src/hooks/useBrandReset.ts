import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useEditTarget } from './useEditTarget';
import { planBrandResetValues } from '../lib/brandWrites';

/**
 * "Reset brand" for every surface that offers it (the studio Brand tab, the
 * dock Brand step).
 *
 * Restores the visible target's own brand colours — that is what the renderers
 * read, so a theme-only reset would leave the graphic painted in the colour
 * just discarded. It follows the same target semantics as the swatches:
 *
 * - Draft mode: also resets the persisted global brand, because the draft is
 *   the next new graphic and the default seeds the ones after it.
 * - Selected rundown item: restores that item only. The brand default is not
 *   touched, exactly as when recolouring the item by hand.
 *
 * The reset values are resolved BEFORE anything is mutated: an unresolvable
 * template must leave the surface exactly as it was, never reset the brand
 * while the graphic in front of the operator keeps its old colours.
 *
 * `colorSurface` / `colorText` / `colorSecondary` stay with Design's "Reset
 * palette". Never publishes; output only changes on the next Take.
 */
export function useBrandReset(): () => void {
  const resetTheme = useLiveLayerStore((state) => state.resetTheme);
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const { isRundownItem, templateId, setFields } = useEditTarget();

  return () => {
    const values = planBrandResetValues(templateId, activePackId);
    // All-or-nothing: no seed means no reset, not a half-applied one.
    if (Object.keys(values).length === 0) return;
    if (!isRundownItem) resetTheme();
    setFields(values);
  };
}
