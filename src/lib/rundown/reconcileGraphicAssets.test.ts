import { describe, expect, it } from 'vitest';
import { collectGraphicAssetIds, reconcileGraphicAssets } from './rundownReferences';
import type { GraphicInstance } from '../../types/graphics';

function graphic(overrides: Partial<GraphicInstance> = {}): GraphicInstance {
  return {
    id: 'g-1',
    templateId: 'preacher-lower-third',
    values: { name: 'Speaker', logoAssetId: 'asset-logo', logoUrl: '' },
    theme: {},
    assetRefs: { logo: 'asset-logo' },
    layout: {},
    durationSeconds: 6,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  };
}

/** What the Brand "Remove image" button writes. */
const REMOVE = { logoAssetId: '', logoUrl: '' };

describe('reconcileGraphicAssets — assetRefs follow the values', () => {
  it('records an upload against its ref', () => {
    const base = graphic({ values: { name: 'Speaker' }, assetRefs: {} });
    const next = reconcileGraphicAssets(
      base,
      { ...base.values, logoAssetId: 'asset-new', logoUrl: '' },
      ['logoAssetId', 'logoUrl']
    );
    expect(next.assetRefs).toEqual({ logo: 'asset-new' });
  });

  it('drops the ref when the upload is removed', () => {
    const next = reconcileGraphicAssets(graphic(), { ...graphic().values, ...REMOVE }, Object.keys(REMOVE));
    expect(next.values.logoAssetId).toBe('');
    expect(next.assetRefs).toEqual({});
  });

  it('drops the ref when a real URL supersedes the upload', () => {
    const next = reconcileGraphicAssets(
      graphic(),
      { name: 'Speaker', logoAssetId: '', logoUrl: 'https://x.test/l.png' },
      ['logoUrl']
    );
    expect(next.assetRefs).toEqual({});
  });

  it('keeps the upload when only an empty URL box is cleared', () => {
    const base = graphic({ values: { name: 'Speaker', logoAssetId: 'asset-logo', logoUrl: '' } });
    const next = reconcileGraphicAssets(base, { ...base.values, logoUrl: '' }, ['logoUrl']);
    expect(next.values.logoAssetId).toBe('asset-logo');
    expect(next.assetRefs).toEqual({ logo: 'asset-logo' });
  });

  it('reconciles headshots by the same rule', () => {
    const base = graphic({
      values: { headshotAssetId: 'asset-face' },
      assetRefs: { headshot: 'asset-face' }
    });
    expect(reconcileGraphicAssets(base, { headshotAssetId: 'asset-other' }, ['headshotAssetId']).assetRefs)
      .toEqual({ headshot: 'asset-other' });
    expect(reconcileGraphicAssets(base, { headshotAssetId: '' }, ['headshotAssetId']).assetRefs)
      .toEqual({});
  });

  it('preserves unrelated and unknown refs instead of rebuilding', () => {
    const base = graphic({
      values: { logoAssetId: 'asset-logo' },
      assetRefs: { logo: 'asset-logo', background: 'asset-bg', future: 'asset-x' }
    });
    const next = reconcileGraphicAssets(base, { logoAssetId: '' }, ['logoAssetId']);
    expect(next.assetRefs).toEqual({ background: 'asset-bg', future: 'asset-x' });
  });

  it('leaves a ref alone when its value key is absent from the write', () => {
    const base = graphic({ values: { name: 'Speaker' }, assetRefs: { logo: 'asset-legacy' } });
    const next = reconcileGraphicAssets(base, { name: 'Renamed' }, ['name']);
    expect(next.assetRefs).toEqual({ logo: 'asset-legacy' });
  });

  it('does not invent an assetRefs object for a graphic that never had one', () => {
    const base = graphic({ values: { name: 'Speaker' }, assetRefs: undefined });
    expect(reconcileGraphicAssets(base, { name: 'Renamed' }, ['name']).assetRefs).toBeUndefined();
  });
});

describe('reconcileGraphicAssets — the legacy theme.logoAssetId pointer', () => {
  const legacy = () =>
    graphic({
      values: { name: 'Speaker' },
      assetRefs: {},
      theme: { primaryColor: '#ffffff', accentColor: '#0d2095', backgroundColor: 'transparent', logoAssetId: 'asset-legacy' }
    });

  it('is cleared by Remove image, even with no value-level upload', () => {
    const next = reconcileGraphicAssets(legacy(), { name: 'Speaker', ...REMOVE }, Object.keys(REMOVE));
    expect(next.theme?.logoAssetId).toBeUndefined();
  });

  it('is cleared when a real URL supersedes it', () => {
    const next = reconcileGraphicAssets(
      legacy(),
      { name: 'Speaker', logoUrl: 'https://x.test/l.png' },
      ['logoUrl']
    );
    expect(next.theme?.logoAssetId).toBeUndefined();
  });

  it('survives an unrelated edit', () => {
    const next = reconcileGraphicAssets(legacy(), { name: 'Renamed' }, ['name']);
    expect(next.theme?.logoAssetId).toBe('asset-legacy');
  });

  it('survives clearing an empty URL box', () => {
    const next = reconcileGraphicAssets(legacy(), { name: 'Speaker', logoUrl: '' }, ['logoUrl']);
    expect(next.theme?.logoAssetId).toBe('asset-legacy');
  });

  it('leaves every other theme field untouched', () => {
    const next = reconcileGraphicAssets(legacy(), { name: 'Speaker', ...REMOVE }, Object.keys(REMOVE));
    expect(next.theme).toEqual({
      primaryColor: '#ffffff',
      accentColor: '#0d2095',
      backgroundColor: 'transparent'
    });
  });
});

describe('collectGraphicAssetIds after a removal', () => {
  it('no longer reports an asset the operator removed', () => {
    const before = graphic({
      theme: { primaryColor: '#fff', accentColor: '#0d2095', backgroundColor: 'transparent', logoAssetId: 'asset-logo' }
    });
    expect(collectGraphicAssetIds(before)).toContain('asset-logo');

    const reconciled = { ...before, ...reconcileGraphicAssets(before, { ...before.values, ...REMOVE }, Object.keys(REMOVE)) };
    expect(collectGraphicAssetIds(reconciled)).not.toContain('asset-logo');
    expect(collectGraphicAssetIds(reconciled)).toEqual([]);
  });

  it('still reports assets the removal did not touch', () => {
    const before = graphic({
      values: { logoAssetId: 'asset-logo', headshotAssetId: 'asset-face' },
      assetRefs: { logo: 'asset-logo', headshot: 'asset-face' }
    });
    const reconciled = { ...before, ...reconcileGraphicAssets(before, { ...before.values, ...REMOVE }, Object.keys(REMOVE)) };
    expect(collectGraphicAssetIds(reconciled)).toEqual(['asset-face']);
  });
});
