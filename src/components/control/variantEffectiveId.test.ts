import { describe, expect, it } from 'vitest';
import { resolveEffectiveVariantId } from './TemplateFields';

const variants = [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }];

describe('resolveEffectiveVariantId — normalize the carousel selection', () => {
  it('keeps a known id unchanged', () => {
    expect(resolveEffectiveVariantId(variants, 'beta')).toBe('beta');
    expect(resolveEffectiveVariantId(variants, 'alpha')).toBe('alpha');
  });

  it('resolves an unknown id to the first variant', () => {
    expect(resolveEffectiveVariantId(variants, 'does-not-exist')).toBe('alpha');
  });

  it('resolves an empty requested id to the first variant', () => {
    expect(resolveEffectiveVariantId(variants, '')).toBe('alpha');
  });

  it('returns an empty string when there are no variants (no throw)', () => {
    expect(() => resolveEffectiveVariantId([], 'anything')).not.toThrow();
    expect(resolveEffectiveVariantId([], 'anything')).toBe('');
    expect(resolveEffectiveVariantId([], '')).toBe('');
  });

  it('normalization is needed exactly when the effective id differs from the request', () => {
    // The component fires onChange once precisely under this condition.
    const needsNormalize = (reqId: string) => {
      const eff = resolveEffectiveVariantId(variants, reqId);
      return variants.length > 0 && eff !== '' && eff !== reqId;
    };
    expect(needsNormalize('beta')).toBe(false); // known → no write
    expect(needsNormalize('unknown')).toBe(true); // unknown → one write to 'alpha'
    expect(needsNormalize('alpha')).toBe(false); // already first → no write
  });
});
