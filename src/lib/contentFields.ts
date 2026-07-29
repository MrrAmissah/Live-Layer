/**
 * Which schema fields the Content tab's main field list leaves out.
 *
 * In ordinary draft mode the logo is presented as a summary card that routes to
 * the Brand tab, where uploads and brand-wide logo state live — so `logoUrl` is
 * excluded from the text field list to avoid two competing editors.
 *
 * A selected RUNDOWN ITEM keeps the field inline as well. BrandControls now
 * edits the visible target, so the item's logo IS reachable from Brand — but a
 * queue-driven operator works down the Content tab, and a captured URL is worth
 * one direct text field rather than a tab switch. Nothing is excluded there.
 *
 * The two editors cannot disagree: writing a NON-EMPTY `logoUrl` anywhere
 * clears `logoAssetId` (see `applyLogoUrl`), because renderers prefer a ready
 * asset and would otherwise ignore the URL just typed. Emptying the field is
 * not a request to delete an upload — Brand's "Remove image" is.
 */
export function contentFieldExclusions(isRundownItem: boolean): string[] {
  return isRundownItem ? [] : ['logoUrl'];
}

/**
 * Whether the Content tab may offer the "Change in Brand" shortcut. Hidden for
 * a rundown item not because Brand is unable to edit it — it can, via the edit
 * target — but because the real `logoUrl` field is rendered inline there, and a
 * shortcut to a second editor for the same value is just a way to lose track of
 * which one you used.
 */
export function canManageLogoInBrand(isRundownItem: boolean): boolean {
  return !isRundownItem;
}

/**
 * Decode a filename for display, falling back to the raw value.
 *
 * `decodeURIComponent` throws a URIError on a malformed percent escape (a
 * trailing `%`, `%zz`, a lone surrogate). Operators paste logo URLs by hand, so
 * that input is reachable — and unguarded it would throw during render and take
 * the whole Content tab down. A slightly ugly filename beats a blank editor.
 */
export function safeDecodeFilename(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
