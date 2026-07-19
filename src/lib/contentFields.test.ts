import { describe, expect, it } from 'vitest';
import { canManageLogoInBrand, contentFieldExclusions } from './contentFields';
import { templateRegistry } from '../components/templates/registry';

describe('Content tab field exclusions', () => {
  it('excludes logoUrl from the main field list in draft mode', () => {
    // Draft mode presents the logo as a summary that routes to Brand, so the
    // raw field must not also appear in the text field list.
    expect(contentFieldExclusions(false)).toContain('logoUrl');
  });

  it('retains logoUrl for a selected rundown item', () => {
    // BrandControls writes global draft/brand state and cannot edit a captured
    // rundown item, so the item's own logo field has to render inline.
    expect(contentFieldExclusions(true)).not.toContain('logoUrl');
    expect(contentFieldExclusions(true)).toEqual([]);
  });

  it('offers the Brand shortcut only where Brand can actually apply', () => {
    expect(canManageLogoInBrand(false)).toBe(true);
    expect(canManageLogoInBrand(true)).toBe(false);
  });

  it('leaves a real logoUrl field reachable for every template that defines one', () => {
    const withLogo = templateRegistry.filter((t) => t.fields.some((f) => f.id === 'logoUrl'));
    expect(withLogo.length).toBeGreaterThan(0); // guards the premise of this fix
    for (const template of withLogo) {
      const excluded = contentFieldExclusions(true);
      const visible = template.fields.filter((f) => !excluded.includes(f.id));
      expect(visible.some((f) => f.id === 'logoUrl')).toBe(true);
    }
  });
});
