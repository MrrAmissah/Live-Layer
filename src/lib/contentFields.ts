/**
 * Which schema fields the Content tab's main field list leaves out.
 *
 * In ordinary draft mode the logo is presented as a summary card that routes to
 * the Brand tab, where uploads and brand-wide logo state live — so `logoUrl` is
 * excluded from the text field list to avoid two competing editors.
 *
 * A selected RUNDOWN ITEM is different: it carries its own captured values, and
 * BrandControls writes global draft/brand state that explicitly does not apply
 * to it. Excluding `logoUrl` there would leave the item's captured logo with no
 * editor at all, so in rundown mode nothing is excluded and the field renders
 * through TemplateFields/useEditTarget as before.
 */
export function contentFieldExclusions(isRundownItem: boolean): string[] {
  return isRundownItem ? [] : ['logoUrl'];
}

/**
 * Whether the Content tab may offer the "Change in Brand" shortcut. Hidden for
 * a rundown item because Brand cannot edit that item — and we deliberately show
 * no replacement control there, since the real field is rendered inline instead.
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
