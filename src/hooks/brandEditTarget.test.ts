import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildInstanceFromDraft, useLiveLayerStore } from '../store/useLiveLayerStore';
import { useEditTarget, type EditTarget } from './useEditTarget';
import { useBrandReset } from './useBrandReset';
import { useBrandSwatch } from './useBrandSwatch';
import { planBrandColorWrite, planBrandResetValues, planLogoWrite } from '../lib/brandWrites';
import { defaultBrandTheme, loadBrandOverrides, loadExplicitBrandKeys } from '../lib/storage';
import { createDraftValues } from '../lib/draftSeed';
import { templateRegistry } from '../components/templates/registry';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import { collectGraphicAssetIds } from '../lib/rundown/rundownReferences';
import {
  addItem,
  clearAllRundowns,
  createRundown,
  deleteItem,
  getRundown,
  setActiveRundown,
  setSelectedItem,
  updateItem
} from '../lib/rundown/rundownStore';
import type { GraphicInstance } from '../types/graphics';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  clearAllRundowns();
  useLiveLayerStore.setState({
    currentTemplateId: 'preacher-lower-third',
    draftValues: { name: 'Draft name', colorBrand: '#0d2095', colorAccent: '#E8B93C', logoUrl: 'https://draft.test/l.png' },
    theme: { primaryColor: '#f8fafc', accentColor: '#0d2095', backgroundColor: 'transparent', accent2Color: '#1284ff' },
    brandTheme: { primaryColor: '#f8fafc', accentColor: '#0d2095', backgroundColor: 'transparent', accent2Color: '#1284ff' },
    explicitBrandKeys: [],
    activePackId: 'house',
    presets: [],
    program: { ...CLEAR_PROGRAM_STATE }
  });
});

/**
 * Capture the live EditTarget the Brand controls receive. Rendering is enough:
 * the hook is evaluated during render, and the returned setters close over the
 * same state the real component writes through.
 */
function readEditTarget(): EditTarget {
  let captured: EditTarget | null = null;
  function Probe() {
    captured = useEditTarget();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!captured) throw new Error('edit target was not captured');
  return captured;
}

/** Capture the live "Reset brand" action the Brand surfaces are wired to. */
function readBrandReset(): () => void {
  let captured: (() => void) | null = null;
  function Probe() {
    captured = useBrandReset();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!captured) throw new Error('brand reset was not captured');
  return captured;
}

function makeGraphic(overrides: Partial<GraphicInstance> = {}): GraphicInstance {
  return {
    id: 'graphic-1',
    templateId: 'preacher-lower-third',
    values: {
      name: 'Item name',
      title: 'Item title',
      colorBrand: '#111111',
      colorAccent: '#222222',
      logoUrl: 'https://item.test/l.png'
    },
    theme: {},
    layout: {},
    durationSeconds: 6,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  };
}

/** An ACTIVE rundown with two items, the FIRST selected. */
function seedRundown() {
  const rundown = createRundown('Service')!;
  const first = addItem(rundown.id, { graphic: makeGraphic({ id: 'graphic-1' }), title: 'First' })!;
  const second = addItem(rundown.id, { graphic: makeGraphic({ id: 'graphic-2' }), title: 'Second' })!;
  setActiveRundown(rundown.id);
  setSelectedItem(rundown.id, first.id);
  return { rundownId: rundown.id, first, second };
}

const draft = () => useLiveLayerStore.getState().draftValues;

describe('Brand colour writes — draft mode', () => {
  it('updates the global brand default and the visible draft colour together', () => {
    const target = readEditTarget();
    const write = planBrandColorWrite('main', '#ff0000');
    useLiveLayerStore.getState().setTheme(write.theme);
    target.setFields(write.values);

    expect(useLiveLayerStore.getState().theme.accentColor).toBe('#ff0000');
    expect(draft().colorBrand).toBe('#ff0000');
  });

  it('preserves unrelated draft values', () => {
    const target = readEditTarget();
    target.setFields(planBrandColorWrite('accent', '#00ff00').values);

    expect(draft().colorAccent).toBe('#00ff00');
    expect(draft().name).toBe('Draft name');
    expect(draft().colorBrand).toBe('#0d2095');
    expect(draft().logoUrl).toBe('https://draft.test/l.png');
  });

  it('leaves Program untouched', () => {
    const before = useLiveLayerStore.getState().program;
    const target = readEditTarget();
    target.setFields(planBrandColorWrite('main', '#ff0000').values);
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Brand colour writes — selected rundown item', () => {
  it('updates the selected item, not the hidden draft', () => {
    const { rundownId, first } = seedRundown();
    const target = readEditTarget();
    expect(target.mode).toBe('rundown-item');

    const write = planBrandColorWrite('main', '#ff0000');
    useLiveLayerStore.getState().setTheme(write.theme);
    target.setFields(write.values);

    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.values.colorBrand).toBe('#ff0000');
    // The global default still moves — it seeds FUTURE graphics — but the
    // invisible draft's own colour must not.
    expect(useLiveLayerStore.getState().theme.accentColor).toBe('#ff0000');
    expect(draft().colorBrand).toBe('#0d2095');
  });

  it('preserves the item’s unrelated values and its siblings', () => {
    const { rundownId, first, second } = seedRundown();
    readEditTarget().setFields(planBrandColorWrite('accent', '#00ff00').values);

    const rundown = getRundown(rundownId)!;
    const edited = rundown.items.find((entry) => entry.id === first.id)!;
    const untouched = rundown.items.find((entry) => entry.id === second.id)!;

    expect(edited.graphic.values.colorAccent).toBe('#00ff00');
    expect(edited.graphic.values.name).toBe('Item name');
    expect(edited.graphic.values.title).toBe('Item title');
    expect(untouched.graphic.values.colorAccent).toBe('#222222');
  });

  it('preserves item id, graphic id, ordering and the active selection', () => {
    const { rundownId, first, second } = seedRundown();
    const before = getRundown(rundownId)!;
    const orderBefore = before.items.map((entry) => entry.id);

    readEditTarget().setFields(planBrandColorWrite('main', '#ff0000').values);

    const after = getRundown(rundownId)!;
    expect(after.items.map((entry) => entry.id)).toEqual(orderBefore);
    expect(after.items[0].id).toBe(first.id);
    expect(after.items[1].id).toBe(second.id);
    expect(after.items[0].graphic.id).toBe('graphic-1');
    expect(after.selectedItemId).toBe(first.id);
    expect(after.id).toBe(rundownId);
  });

  it('leaves Program untouched', () => {
    seedRundown();
    const before = useLiveLayerStore.getState().program;
    readEditTarget().setFields(planBrandColorWrite('main', '#ff0000').values);
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Brand logo writes', () => {
  it('writes an upload to the draft as one atomic pair', () => {
    const target = readEditTarget();
    target.setFields(planLogoWrite({ type: 'asset', assetId: 'asset-9' }));
    expect(draft().logoAssetId).toBe('asset-9');
    expect(draft().logoUrl).toBe('');
    expect(draft().name).toBe('Draft name');
  });

  it('writes a URL to the draft and clears any upload', () => {
    useLiveLayerStore.setState({
      draftValues: { ...draft(), logoAssetId: 'asset-old' }
    });
    readEditTarget().setFields(planLogoWrite({ type: 'url', url: 'https://new.test/l.png' }));
    expect(draft().logoUrl).toBe('https://new.test/l.png');
    expect(draft().logoAssetId).toBe('');
  });

  it('removes both from the draft', () => {
    readEditTarget().setFields(planLogoWrite({ type: 'clear' }));
    expect(draft().logoUrl).toBe('');
    expect(draft().logoAssetId).toBe('');
  });

  it('writes the upload to the SELECTED ITEM, never the hidden draft', () => {
    const { rundownId, first } = seedRundown();
    readEditTarget().setFields(planLogoWrite({ type: 'asset', assetId: 'asset-9' }));

    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.values.logoAssetId).toBe('asset-9');
    expect(item.graphic.values.logoUrl).toBe('');
    expect(item.graphic.id).toBe('graphic-1');
    // The draft's own logo is exactly as it was.
    expect(draft().logoUrl).toBe('https://draft.test/l.png');
    expect(draft().logoAssetId).toBeUndefined();
  });

  it('removes the item’s logo without disturbing its content', () => {
    const { rundownId, first } = seedRundown();
    readEditTarget().setFields(planLogoWrite({ type: 'clear' }));

    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.values.logoUrl).toBe('');
    expect(item.graphic.values.logoAssetId).toBe('');
    expect(item.graphic.values.name).toBe('Item name');
  });
});

describe('Preset save targeting', () => {
  it('saves the ad-hoc draft in draft mode', () => {
    readEditTarget().saveAsPreset('From draft');
    const presets = useLiveLayerStore.getState().presets;
    expect(presets).toHaveLength(1);
    expect(presets[0].presetName).toBe('From draft');
    expect(presets[0].values.name).toBe('Draft name');
  });

  it('saves the selected rundown item when one is selected', () => {
    const { rundownId, first } = seedRundown();
    readEditTarget().saveAsPreset('From item');

    const presets = useLiveLayerStore.getState().presets;
    expect(presets).toHaveLength(1);
    expect(presets[0].presetName).toBe('From item');
    expect(presets[0].values.name).toBe('Item name');
    // A preset is an independent copy: new id, item untouched.
    expect(presets[0].id).not.toBe('graphic-1');
    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.id).toBe('graphic-1');
    expect(getRundown(rundownId)!.selectedItemId).toBe(first.id);
  });

  it('never publishes — Program is unchanged by a save', () => {
    const before = useLiveLayerStore.getState().program;
    readEditTarget().saveAsPreset('Anything');
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Logo URL supersedes an upload on every surface', () => {
  it('clears the draft’s stored asset when a URL is typed generically', () => {
    useLiveLayerStore.setState({ draftValues: { ...draft(), logoAssetId: 'asset-1', logoUrl: '' } });
    // The generic field write — what the Content tab and the dock Edit step do.
    useLiveLayerStore.getState().setField('logoUrl', 'https://typed.test/l.png');
    expect(draft().logoUrl).toBe('https://typed.test/l.png');
    expect(draft().logoAssetId).toBe('');
    expect(draft().name).toBe('Draft name');
  });

  it('keeps the draft’s stored asset when the URL box is merely emptied', () => {
    useLiveLayerStore.setState({ draftValues: { ...draft(), logoAssetId: 'asset-1' } });
    useLiveLayerStore.getState().setField('logoUrl', '');
    expect(draft().logoAssetId).toBe('asset-1');
  });

  it('clears the SELECTED ITEM’s stored asset when a URL is typed', () => {
    const { rundownId, first } = seedRundown();
    // Give the item an upload the way the Brand tab now can.
    readEditTarget().setFields(planLogoWrite({ type: 'asset', assetId: 'asset-1' }));
    // Then type a URL through the generic field path.
    readEditTarget().setField('logoUrl', 'https://typed.test/l.png');

    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.values.logoUrl).toBe('https://typed.test/l.png');
    expect(item.graphic.values.logoAssetId).toBe('');
    expect(item.graphic.values.name).toBe('Item name');
    expect(item.graphic.id).toBe('graphic-1');
  });

  it('leaves other fields’ generic writes untouched by the rule', () => {
    readEditTarget().setField('name', 'Renamed');
    expect(draft().name).toBe('Renamed');
    expect(draft().logoUrl).toBe('https://draft.test/l.png');
  });
});

/* --- Brand TARGET semantics --------------------------------------------- *
 * A swatch always writes the visible graphic. Whether it also redefines the
 * global brand default depends on what is visible: the draft is the next new
 * graphic, a rundown item is a captured one.
 * ------------------------------------------------------------------------ */

const houseDefaults = () =>
  templateRegistry.find((template) => template.id === 'preacher-lower-third')!.defaultValues;

/**
 * The swatch write the Brand controls actually perform. Captured from the real
 * hook rather than re-implemented here: a test that rebuilds the component's
 * branching cannot fail when the component stops branching correctly.
 */
function applySwatch(_target: EditTarget, swatch: 'main' | 'accent', value: string) {
  const captured: Array<(s: 'main' | 'accent', v: string) => void> = [];
  function Probe() {
    captured.push(useBrandSwatch());
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const apply = captured[0];
  if (!apply) throw new Error('brand swatch was not captured');
  apply(swatch, value);
}

describe('Swatch write — draft mode moves the brand default with it', () => {
  it('changes both the global default and the draft', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(useLiveLayerStore.getState().theme.accentColor).toBe('#ff0000');
    expect(draft().colorBrand).toBe('#ff0000');
  });

  it('preserves every unrelated draft value', () => {
    applySwatch(readEditTarget(), 'accent', '#00ff00');
    expect(draft().colorAccent).toBe('#00ff00');
    expect(draft().colorBrand).toBe('#0d2095');
    expect(draft().name).toBe('Draft name');
    expect(draft().logoUrl).toBe('https://draft.test/l.png');
  });
});

describe('Swatch write — a selected rundown item leaves the brand alone', () => {
  it('changes the item only', () => {
    const { rundownId, first } = seedRundown();
    applySwatch(readEditTarget(), 'main', '#ff0000');
    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.values.colorBrand).toBe('#ff0000');
  });

  it('leaves the global brand byte-identical', () => {
    seedRundown();
    const themeBefore = useLiveLayerStore.getState().theme;
    applySwatch(readEditTarget(), 'main', '#ff0000');
    // Same object reference: setTheme was never called.
    expect(useLiveLayerStore.getState().theme).toBe(themeBefore);
    expect(useLiveLayerStore.getState().theme.accentColor).toBe('#0d2095');
  });

  it('leaves the hidden draft byte-identical', () => {
    seedRundown();
    const draftBefore = draft();
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(draft()).toBe(draftBefore);
  });

  it('does not change isDraftDirty', () => {
    useLiveLayerStore.setState({
      draftValues: createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), [])
    });
    const dirtyBefore = useLiveLayerStore.getState().isDraftDirty();
    seedRundown();
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(dirtyBefore);
    expect(dirtyBefore).toBe(false);
  });

  it('preserves item id, graphic id, ordering, selection and active rundown', () => {
    const { rundownId, first, second } = seedRundown();
    applySwatch(readEditTarget(), 'accent', '#00ff00');
    const rundown = getRundown(rundownId)!;
    expect(rundown.items.map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(rundown.items[0].graphic.id).toBe('graphic-1');
    expect(rundown.items[1].graphic.values.colorAccent).toBe('#222222');
    expect(rundown.selectedItemId).toBe(first.id);
    expect(rundown.id).toBe(rundownId);
  });

  it('leaves Program unchanged', () => {
    seedRundown();
    const before = useLiveLayerStore.getState().program;
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Brand reset — draft mode', () => {
  it('restores the global default and the draft colours', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    applySwatch(readEditTarget(), 'accent', '#00ff00');

    readBrandReset()();

    expect(draft().colorBrand).toBe(houseDefaults().colorBrand);
    expect(draft().colorAccent).toBe(houseDefaults().colorAccent);
    expect(useLiveLayerStore.getState().theme.accentColor).toBe(defaultBrandTheme().accentColor);
    expect(useLiveLayerStore.getState().theme.accent2Color).toBe(defaultBrandTheme().accent2Color);
  });

  it('leaves content and the rest of the palette to other actions', () => {
    useLiveLayerStore.setState({
      draftValues: { ...draft(), colorSurface: '#123456', colorText: '#654321', colorSecondary: '#abcdef' }
    });
    readBrandReset()();
    expect(draft().name).toBe('Draft name');
    expect(draft().colorSurface).toBe('#123456');
    expect(draft().colorText).toBe('#654321');
    expect(draft().colorSecondary).toBe('#abcdef');
  });

  it('leaves Program unchanged', () => {
    const before = useLiveLayerStore.getState().program;
    readBrandReset()();
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Brand reset — selected rundown item', () => {
  it('restores the item’s colours only', () => {
    const { rundownId, first } = seedRundown();
    applySwatch(readEditTarget(), 'main', '#ff0000');

    readBrandReset()();

    const item = getRundown(rundownId)!.items.find((entry) => entry.id === first.id)!;
    expect(item.graphic.values.colorBrand).toBe(houseDefaults().colorBrand);
    expect(item.graphic.values.colorAccent).toBe(houseDefaults().colorAccent);
    expect(item.graphic.values.name).toBe('Item name');
  });

  it('leaves the global brand, the hidden draft and isDraftDirty untouched', () => {
    useLiveLayerStore.setState({
      draftValues: createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), [])
    });
    seedRundown();
    const themeBefore = useLiveLayerStore.getState().theme;
    const draftBefore = draft();
    const dirtyBefore = useLiveLayerStore.getState().isDraftDirty();

    readBrandReset()();

    expect(useLiveLayerStore.getState().theme).toBe(themeBefore);
    expect(draft()).toBe(draftBefore);
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(dirtyBefore);
  });

  it('preserves item identity, ordering and selection', () => {
    const { rundownId, first, second } = seedRundown();
    readBrandReset()();
    const rundown = getRundown(rundownId)!;
    expect(rundown.items.map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(rundown.items[0].graphic.id).toBe('graphic-1');
    expect(rundown.selectedItemId).toBe(first.id);
    expect(rundown.id).toBe(rundownId);
  });

  it('leaves Program unchanged', () => {
    seedRundown();
    const before = useLiveLayerStore.getState().program;
    readBrandReset()();
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

/* The draft-mode twin of this case cannot be exercised here: useEditTarget
   reads currentTemplateId from zustand, which renderToStaticMarkup pins to the
   module-init snapshot. The all-or-nothing guard itself is template-agnostic
   and is covered directly by planBrandResetValues in brandWrites.test.ts. */
describe('Brand reset — unresolvable template', () => {
  it('performs no partial reset: the brand is not wiped while the graphic keeps its colours', () => {
    const rundown = createRundown('Service')!;
    const graphic = { ...makeGraphic({ id: 'graphic-x' }), templateId: 'retired-template' };
    const item = addItem(rundown.id, { graphic, title: 'Legacy' })!;
    setActiveRundown(rundown.id);
    setSelectedItem(rundown.id, item.id);

    // Move the brand away from its default first, so a stray reset would show.
    useLiveLayerStore.getState().setTheme({ accentColor: '#ff0000' });
    const themeBefore = useLiveLayerStore.getState().theme;
    const valuesBefore = getRundown(rundown.id)!.items[0].graphic.values;

    readBrandReset()();

    expect(useLiveLayerStore.getState().theme).toBe(themeBefore);
    expect(useLiveLayerStore.getState().theme.accentColor).toBe('#ff0000');
    expect(getRundown(rundown.id)!.items[0].graphic.values).toEqual(valuesBefore);
  });
});

/* --- Explicit brand markers ---------------------------------------------- *
 * Which swatches the operator actually chose is tracked, not inferred from
 * value equality — otherwise deliberately picking the built-in default is
 * silently discarded on the next template switch or reload.
 * ------------------------------------------------------------------------ */

const DEFAULT_ACCENT2 = defaultBrandTheme().accent2Color!;
const markers = () => useLiveLayerStore.getState().explicitBrandKeys;

describe('Explicit brand markers — draft swatches', () => {
  beforeEach(() => {
    useLiveLayerStore.setState({ theme: defaultBrandTheme(), explicitBrandKeys: [] });
  });

  it('marks the swatch a draft write touched, and only that one', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(markers()).toEqual(['accentColor']);
    applySwatch(readEditTarget(), 'accent', '#00ff00');
    expect(markers()).toEqual(['accentColor', 'accent2Color']);
  });

  it('marks a choice that equals the built-in default', () => {
    applySwatch(readEditTarget(), 'accent', DEFAULT_ACCENT2);
    expect(markers()).toEqual(['accent2Color']);
    expect(useLiveLayerStore.getState().theme.accent2Color).toBe(DEFAULT_ACCENT2);
  });

  it('persists the marker so a reload restores the choice', () => {
    applySwatch(readEditTarget(), 'accent', DEFAULT_ACCENT2);
    expect(loadExplicitBrandKeys()).toEqual(['accent2Color']);
  });

  it('carries a default-equal choice through a template switch', () => {
    // Preacher ships gold; the operator picks the built-in electric blue.
    applySwatch(readEditTarget(), 'accent', DEFAULT_ACCENT2);
    useLiveLayerStore.getState().setTemplate('quote-card');
    expect(draft().colorAccent).toBe(DEFAULT_ACCENT2);
    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    expect(draft().colorAccent).toBe(DEFAULT_ACCENT2);
  });

  it('does not mark anything for a non-brand theme write', () => {
    useLiveLayerStore.getState().setTheme({ surfaceColor: '#123456' });
    expect(markers()).toEqual([]);
  });

  it('never marks twice for the same swatch', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    applySwatch(readEditTarget(), 'main', '#00ff00');
    expect(markers()).toEqual(['accentColor']);
  });
});

describe('Explicit brand markers — reset and clear', () => {
  it('draft reset clears the markers and restores template-specific colours', () => {
    applySwatch(readEditTarget(), 'accent', DEFAULT_ACCENT2);
    readBrandReset()();

    expect(markers()).toEqual([]);
    expect(loadExplicitBrandKeys()).toEqual([]);
    expect(draft().colorAccent).toBe(houseDefaults().colorAccent);
    // A later template still gets its OWN accent, not the discarded choice.
    useLiveLayerStore.getState().setTemplate('quote-card');
    const quote = templateRegistry.find((t) => t.id === 'quote-card')!.defaultValues;
    expect(draft().colorAccent).toBe(quote.colorAccent);
  });

  it('clearLocalData clears marker state and its persistence', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(loadExplicitBrandKeys()).toEqual(['accentColor']);

    useLiveLayerStore.getState().clearLocalData();

    expect(markers()).toEqual([]);
    expect(localStorage.getItem('livelayer.brandExplicit')).toBeNull();
    expect(loadExplicitBrandKeys()).toEqual([]);
  });
});

describe('Explicit brand markers — a rundown item never touches them', () => {
  it('an item swatch leaves the markers byte-identical', () => {
    useLiveLayerStore.setState({ theme: defaultBrandTheme(), explicitBrandKeys: [] });
    seedRundown();
    const before = markers();
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(markers()).toBe(before);
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('an item swatch leaves an existing marker set untouched', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000'); // draft choice first
    const before = markers();
    seedRundown();
    applySwatch(readEditTarget(), 'accent', '#00ff00');
    expect(markers()).toBe(before);
    expect(markers()).toEqual(['accentColor']);
  });

  it('an item reset leaves the markers and the theme untouched', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    const themeBefore = useLiveLayerStore.getState().theme;
    const markersBefore = markers();

    seedRundown();
    readBrandReset()();

    expect(markers()).toBe(markersBefore);
    expect(useLiveLayerStore.getState().theme).toBe(themeBefore);
    expect(loadExplicitBrandKeys()).toEqual(['accentColor']);
  });

  it('leaves Program unchanged', () => {
    seedRundown();
    const before = useLiveLayerStore.getState().program;
    applySwatch(readEditTarget(), 'main', '#ff0000');
    readBrandReset()();
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('isDraftDirty uses the same seed inputs as seeding', () => {
  it('a draft brand choice does not make the draft dirty', () => {
    useLiveLayerStore.setState({
      theme: defaultBrandTheme(),
      explicitBrandKeys: [],
      currentTemplateId: 'preacher-lower-third',
      draftValues: createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), [])
    });
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(false);

    applySwatch(readEditTarget(), 'accent', DEFAULT_ACCENT2);

    // The seed moved with the choice, so the draft is still "clean" and the
    // pack-switch guard cannot warn about edits nobody made.
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(false);
  });

  it('still reports a real content edit as dirty', () => {
    useLiveLayerStore.setState({
      draftValues: createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), [])
    });
    useLiveLayerStore.getState().setField('name', 'Someone Else');
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(true);
  });
});

/* --- theme vs brandTheme ------------------------------------------------- *
 * `theme` belongs to the CURRENT graphic and travels with it. `brandTheme` is
 * the persisted default that seeds FUTURE graphics. Loading a stored graphic
 * must move the first and never the second.
 * ------------------------------------------------------------------------ */

const brandTheme = () => useLiveLayerStore.getState().brandTheme;
const currentTheme = () => useLiveLayerStore.getState().theme;

function storedGraphic(overrides: Partial<GraphicInstance> = {}): GraphicInstance {
  return {
    id: 'preset-1',
    templateId: 'quote-card',
    presetName: 'Loaded look',
    values: { quote: 'Stored quote', colorBrand: '#654321', colorAccent: '#123456' },
    theme: { primaryColor: '#111111', accentColor: '#654321', backgroundColor: 'transparent', accent2Color: '#123456' },
    layout: {},
    durationSeconds: 9,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  };
}

describe('Loading a stored graphic never redefines the brand default', () => {
  beforeEach(() => {
    useLiveLayerStore.setState({
      theme: defaultBrandTheme(),
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: []
    });
    // An explicit House Style choice the operator expects to keep.
    applySwatch(readEditTarget(), 'accent', DEFAULT_ACCENT2);
  });

  it('leaves brandTheme untouched', () => {
    const before = brandTheme();
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    expect(brandTheme()).toBe(before);
    expect(brandTheme().accent2Color).toBe(DEFAULT_ACCENT2);
  });

  it('leaves the explicit markers untouched', () => {
    const before = markers();
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    expect(markers()).toBe(before);
    expect(markers()).toEqual(['accent2Color']);
  });

  it('writes neither brand storage key', () => {
    const brandRaw = localStorage.getItem('livelayer.brand');
    const markerRaw = localStorage.getItem('livelayer.brandExplicit');
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    expect(localStorage.getItem('livelayer.brand')).toBe(brandRaw);
    expect(localStorage.getItem('livelayer.brandExplicit')).toBe(markerRaw);
  });

  it('gives the loaded graphic its own theme, so preview/save/Take stay faithful', () => {
    const graphic = storedGraphic();
    useLiveLayerStore.getState().loadGraphicInstance(graphic);
    expect(currentTheme().accentColor).toBe('#654321');
    expect(currentTheme().accent2Color).toBe('#123456');
    expect(draft().quote).toBe('Stored quote');
    // What a Take or a save would serialize is the loaded snapshot's theme.
    const instance = buildInstanceFromDraft(useLiveLayerStore.getState());
    expect(instance.theme.accentColor).toBe('#654321');
  });

  it('seeds the NEXT template from the brand default, not the loaded snapshot', () => {
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    useLiveLayerStore.getState().setTemplate('preacher-lower-third');

    expect(draft().colorAccent).toBe(DEFAULT_ACCENT2);
    expect(draft().colorAccent).not.toBe('#123456');
    // The new graphic wears the brand, not the snapshot's theme.
    expect(currentTheme().accent2Color).toBe(DEFAULT_ACCENT2);
    expect(currentTheme().accentColor).not.toBe('#654321');
  });

  it('produces the same future seed before and after a reload', () => {
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    const beforeReload = draft().colorAccent;

    // A reload rebuilds state from storage alone.
    const reloaded = createDraftValues(
      'preacher-lower-third',
      'house',
      loadBrandOverrides(),
      loadExplicitBrandKeys()
    );
    expect(reloaded.colorAccent).toBe(beforeReload);
  });

  it('still lets a pack switch re-clothe the draft in the brand', () => {
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    useLiveLayerStore.getState().setActivePack('house');
    expect(currentTheme().accent2Color).toBe(DEFAULT_ACCENT2);
  });
});

describe('theme and brandTheme move together only for a draft swatch', () => {
  beforeEach(() => {
    useLiveLayerStore.setState({
      theme: defaultBrandTheme(),
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: []
    });
  });

  it('a draft swatch updates both', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(currentTheme().accentColor).toBe('#ff0000');
    expect(brandTheme().accentColor).toBe('#ff0000');
    expect(loadBrandOverrides().accentColor).toBe('#ff0000');
  });

  it('a rundown-item swatch updates neither', () => {
    seedRundown();
    const themeBefore = currentTheme();
    const brandBefore = brandTheme();
    applySwatch(readEditTarget(), 'main', '#ff0000');
    expect(currentTheme()).toBe(themeBefore);
    expect(brandTheme()).toBe(brandBefore);
  });

  it('a draft reset restores both and clears the markers', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    readBrandReset()();
    expect(currentTheme().accentColor).toBe(defaultBrandTheme().accentColor);
    expect(brandTheme().accentColor).toBe(defaultBrandTheme().accentColor);
    expect(markers()).toEqual([]);
  });

  it('a rundown-item reset leaves both alone', () => {
    applySwatch(readEditTarget(), 'main', '#ff0000');
    const themeBefore = currentTheme();
    const brandBefore = brandTheme();
    seedRundown();
    readBrandReset()();
    expect(currentTheme()).toBe(themeBefore);
    expect(brandTheme()).toBe(brandBefore);
  });

  it('an ordinary field edit does not touch either', () => {
    const themeBefore = currentTheme();
    const brandBefore = brandTheme();
    useLiveLayerStore.getState().setField('name', 'Someone Else');
    expect(currentTheme()).toBe(themeBefore);
    expect(brandTheme()).toBe(brandBefore);
  });

  it('leaves Program unchanged across every path', () => {
    const before = useLiveLayerStore.getState().program;
    applySwatch(readEditTarget(), 'main', '#ff0000');
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    useLiveLayerStore.getState().setTemplate('preacher-lower-third');
    readBrandReset()();
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

/* --- rundown asset bookkeeping ------------------------------------------ *
 * collectGraphicAssetIds unions values.*AssetId, assetRefs AND the legacy
 * theme.logoAssetId, so a values-only write leaves an export bundling an image
 * the operator removed. The invariant lives at the write boundary.
 * ------------------------------------------------------------------------ */

function seedRundownWithLogo(graphicOverrides: Partial<GraphicInstance> = {}) {
  const rundown = createRundown('Service')!;
  const base = makeGraphic({
    id: 'graphic-1',
    values: { name: 'Item name', logoAssetId: 'asset-logo', logoUrl: '' },
    assetRefs: { logo: 'asset-logo' },
    ...graphicOverrides
  });
  const first = addItem(rundown.id, { graphic: base, title: 'First' })!;
  const second = addItem(rundown.id, { graphic: makeGraphic({ id: 'graphic-2' }), title: 'Second' })!;
  setActiveRundown(rundown.id);
  setSelectedItem(rundown.id, first.id);
  return { rundownId: rundown.id, first, second };
}

const itemGraphic = (rundownId: string, itemId: string) =>
  getRundown(rundownId)!.items.find((entry) => entry.id === itemId)!.graphic;

describe('Rundown logo writes keep assetRefs and the legacy theme pointer in step', () => {
  it('an upload records values and assetRefs together', () => {
    const { rundownId, first } = seedRundownWithLogo({ values: { name: 'Item name' }, assetRefs: {} });
    readEditTarget().setFields(planLogoWrite({ type: 'asset', assetId: 'asset-new' }));

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.logoAssetId).toBe('asset-new');
    expect(g.assetRefs).toEqual({ logo: 'asset-new' });
    expect(collectGraphicAssetIds(g)).toEqual(['asset-new']);
  });

  it('Remove image clears values, assetRefs and the legacy theme pointer', () => {
    const { rundownId, first } = seedRundownWithLogo({
      theme: { primaryColor: '#fff', accentColor: '#0d2095', backgroundColor: 'transparent', logoAssetId: 'asset-logo' }
    });
    readEditTarget().setFields(planLogoWrite({ type: 'clear' }));

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.logoAssetId).toBe('');
    expect(g.values.logoUrl).toBe('');
    expect(g.assetRefs).toEqual({});
    expect(g.theme.logoAssetId).toBeUndefined();
    // The export would no longer bundle it.
    expect(collectGraphicAssetIds(g)).toEqual([]);
  });

  it('a typed URL supersedes the upload everywhere', () => {
    const { rundownId, first } = seedRundownWithLogo({
      theme: { primaryColor: '#fff', accentColor: '#0d2095', backgroundColor: 'transparent', logoAssetId: 'asset-logo' }
    });
    // The generic field path — the Content tab and the dock Edit step.
    readEditTarget().setField('logoUrl', 'https://typed.test/l.png');

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.logoUrl).toBe('https://typed.test/l.png');
    expect(g.values.logoAssetId).toBe('');
    expect(g.assetRefs).toEqual({});
    expect(g.theme.logoAssetId).toBeUndefined();
    expect(collectGraphicAssetIds(g)).toEqual([]);
  });

  it('clearing an empty URL box preserves the upload', () => {
    const { rundownId, first } = seedRundownWithLogo();
    readEditTarget().setField('logoUrl', '');

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.logoAssetId).toBe('asset-logo');
    expect(g.assetRefs).toEqual({ logo: 'asset-logo' });
    expect(collectGraphicAssetIds(g)).toEqual(['asset-logo']);
  });

  it('reconciles headshots through the generic field path', () => {
    const { rundownId, first } = seedRundownWithLogo({
      values: { name: 'Item name', headshotAssetId: 'asset-face' },
      assetRefs: { headshot: 'asset-face' }
    });
    readEditTarget().setField('headshotAssetId', '');
    expect(itemGraphic(rundownId, first.id).assetRefs).toEqual({});
  });

  it('preserves unknown refs while removing the logo', () => {
    const { rundownId, first } = seedRundownWithLogo({
      assetRefs: { logo: 'asset-logo', background: 'asset-bg' }
    });
    readEditTarget().setFields(planLogoWrite({ type: 'clear' }));
    expect(itemGraphic(rundownId, first.id).assetRefs).toEqual({ background: 'asset-bg' });
  });

  it('leaves an unrelated edit’s asset bookkeeping alone', () => {
    const { rundownId, first } = seedRundownWithLogo();
    readEditTarget().setField('name', 'Renamed');

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.name).toBe('Renamed');
    expect(g.assetRefs).toEqual({ logo: 'asset-logo' });
  });

  it('preserves identity, ordering, selection and Program', () => {
    const { rundownId, first, second } = seedRundownWithLogo();
    const programBefore = useLiveLayerStore.getState().program;

    readEditTarget().setFields(planLogoWrite({ type: 'clear' }));

    const rundown = getRundown(rundownId)!;
    expect(rundown.items.map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(rundown.items[0].graphic.id).toBe('graphic-1');
    expect(rundown.items[1].graphic.values.name).toBe('Item name');
    expect(rundown.selectedItemId).toBe(first.id);
    expect(rundown.id).toBe(rundownId);
    expect(useLiveLayerStore.getState().program).toBe(programBefore);
  });

  it('leaves the draft path unchanged — no assetRefs are stored on the draft', () => {
    useLiveLayerStore.setState({ draftValues: { name: 'Draft name', logoAssetId: 'asset-draft' } });
    readEditTarget().setFields(planLogoWrite({ type: 'clear' }));
    expect(draft().logoAssetId).toBe('');
    // buildInstanceFromDraft still derives refs from the current values.
    expect(buildInstanceFromDraft(useLiveLayerStore.getState()).assetRefs).toEqual({});
  });

  it('derives draft assetRefs from values on Take/save', () => {
    useLiveLayerStore.setState({ draftValues: { name: 'Draft name' } });
    readEditTarget().setFields(planLogoWrite({ type: 'asset', assetId: 'asset-draft' }));
    expect(buildInstanceFromDraft(useLiveLayerStore.getState()).assetRefs).toEqual({ logo: 'asset-draft' });
  });
});

/* --- A writer captured before an await must not undo later edits --------- *
 * `saveUploadedAsset` decodes the image and writes IndexedDB, so the callback
 * that finally stores the logo runs long after the render that created it.
 * Every test here deliberately captures the EditTarget FIRST, edits the item
 * behind its back, and only then writes through the captured setter — calling
 * readEditTarget() again after the edit would pass with or without the fix.
 * ------------------------------------------------------------------------ */
describe('Item writers resolve the item when they run, not when they rendered', () => {
  /** Edit the item directly, the way another surface would while an upload runs. */
  const editBehindItsBack = (rundownId: string, itemId: string, values: Record<string, string>) => {
    const current = itemGraphic(rundownId, itemId);
    updateItem(rundownId, itemId, { graphic: { ...current, values: { ...current.values, ...values } } });
  };

  it('an upload that lands after a content edit merges instead of reverting it', () => {
    const { rundownId, first } = seedRundownWithLogo({ values: { name: 'Item name' }, assetRefs: {} });
    const captured = readEditTarget(); // the render that started the upload

    editBehindItsBack(rundownId, first.id, { name: 'Typed while saving' });
    captured.setFields(planLogoWrite({ type: 'asset', assetId: 'asset-new' }));

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.name).toBe('Typed while saving');
    expect(g.values.logoAssetId).toBe('asset-new');
    expect(g.assetRefs).toEqual({ logo: 'asset-new' });
  });

  it('the single-field path is latest-based too', () => {
    const { rundownId, first } = seedRundownWithLogo({ values: { name: 'Item name' } });
    const captured = readEditTarget();

    editBehindItsBack(rundownId, first.id, { colorBrand: '#123456' });
    captured.setField('name', 'Renamed');

    const g = itemGraphic(rundownId, first.id);
    expect(g.values.colorBrand).toBe('#123456');
    expect(g.values.name).toBe('Renamed');
  });

  it('a stale logo write reconciles against the item’s CURRENT theme', () => {
    const { rundownId, first } = seedRundownWithLogo({ values: { name: 'Item name' } });
    const captured = readEditTarget();

    // A legacy pointer and an unrelated theme edit both arrive after the
    // capture. Dropping the pointer is not enough on its own — reverting the
    // whole theme would do that too — so the surviving slot is what proves the
    // reconciliation read the current theme rather than replacing it.
    const current = itemGraphic(rundownId, first.id);
    updateItem(rundownId, first.id, {
      graphic: { ...current, theme: { ...current.theme, logoAssetId: 'asset-legacy', surfaceColor: '#abcdef' } }
    });
    captured.setFields(planLogoWrite({ type: 'asset', assetId: 'asset-new' }));

    const g = itemGraphic(rundownId, first.id);
    expect(g.theme.logoAssetId).toBeUndefined();
    expect(g.theme.surfaceColor).toBe('#abcdef');
    expect(collectGraphicAssetIds(g)).toEqual(['asset-new']);
  });

  it('a captured layout write merges over the latest layout', () => {
    const { rundownId, first } = seedRundownWithLogo();
    const captured = readEditTarget();

    const current = itemGraphic(rundownId, first.id);
    updateItem(rundownId, first.id, { graphic: { ...current, layout: { ...current.layout, size: 'large' } } });
    captured.setLayout({ position: 'center' });

    const g = itemGraphic(rundownId, first.id);
    expect(g.layout).toMatchObject({ size: 'large', position: 'center' });
  });

  it('saves the item as it is at click time, not as it rendered', () => {
    const { rundownId, first } = seedRundownWithLogo({ values: { name: 'Item name' } });
    const captured = readEditTarget();

    editBehindItsBack(rundownId, first.id, { name: 'Final name' });
    captured.saveAsPreset('Saved');

    const { presets } = useLiveLayerStore.getState();
    const preset = presets[presets.length - 1];
    expect(preset.values.name).toBe('Final name');
  });

  // Guards the fallback in `latest()` rather than the fresh read itself:
  // updateItem already matches nothing for a deleted id, and this must stay
  // true now that a captured snapshot can be handed to it.
  it('a write for an item deleted mid-upload is dropped, not resurrected', () => {
    const { rundownId, first, second } = seedRundownWithLogo();
    const captured = readEditTarget();

    deleteItem(rundownId, first.id);
    captured.setFields(planLogoWrite({ type: 'asset', assetId: 'asset-new' }));

    expect(getRundown(rundownId)!.items.map((entry) => entry.id)).toEqual([second.id]);
  });
});

/* --- Reset brand is scoped to the two brand slots ------------------------ *
 * "Reset brand" restores the brand default. It must not restyle the graphic
 * in front of the operator: primaryColor / surfaceColor / backgroundColor
 * describe that graphic, and on a legacy snapshot without matching colour
 * VALUES they are what the renderer actually paints.
 * ------------------------------------------------------------------------ */
describe('Brand reset preserves non-brand theme slots', () => {
  const loadedTheme = {
    primaryColor: '#111111',
    accentColor: '#654321',
    backgroundColor: 'transparent',
    surfaceColor: '#abcdef',
    accent2Color: '#123456'
  };

  beforeEach(() => {
    useLiveLayerStore.setState({
      theme: { ...loadedTheme },
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: []
    });
  });

  it('restores only the two brand slots on the current graphic', () => {
    readBrandReset()();
    const theme = currentTheme();
    expect(theme.accentColor).toBe(defaultBrandTheme().accentColor);
    expect(theme.accent2Color).toBe(defaultBrandTheme().accent2Color);
    // Everything else belongs to the graphic, and to Design's Reset palette.
    expect(theme.primaryColor).toBe('#111111');
    expect(theme.surfaceColor).toBe('#abcdef');
  });

  it('still returns the persisted default whole', () => {
    readBrandReset()();
    expect(brandTheme()).toEqual(defaultBrandTheme());
    expect(markers()).toEqual([]);
  });

  it('does not restyle what the next Take or save would carry', () => {
    readBrandReset()();
    const instance = buildInstanceFromDraft(useLiveLayerStore.getState());
    expect(instance.theme.primaryColor).toBe('#111111');
    expect(instance.theme.surfaceColor).toBe('#abcdef');
    expect(instance.theme.accentColor).toBe(defaultBrandTheme().accentColor);
  });

  it('leaves a freshly seeded template on the full brand default', () => {
    // A new graphic is not the loaded one, so it wears brandTheme entirely.
    readBrandReset()();
    useLiveLayerStore.getState().setTemplate('quote-card');
    expect(currentTheme()).toEqual(defaultBrandTheme());
  });

  it('leaves Program unchanged', () => {
    const before = useLiveLayerStore.getState().program;
    readBrandReset()();
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Repairing a dead variant id must not repaint the graphic', () => {
  it('setFields writes the id alone, while setField merges the variant palette', () => {
    const { rundownId, first } = seedRundown();
    const before = itemGraphic(rundownId, first.id).values;

    // What the Design tab's normalization effect now does.
    readEditTarget().setFields({ variantId: 'split-bar' });
    const normalized = itemGraphic(rundownId, first.id).values;
    expect(normalized.variantId).toBe('split-bar');
    expect(normalized.colorBrand).toBe(before.colorBrand);
    expect(normalized.colorAccent).toBe(before.colorAccent);

    // What an operator CHOOSING a variant does — palette comes with it.
    readEditTarget().setField('variantId', 'signature-medallion');
    const chosen = itemGraphic(rundownId, first.id).values;
    expect(chosen.variantId).toBe('signature-medallion');
    expect(chosen.colorBrand).not.toBe(before.colorBrand);
  });
});

describe('Applying a person starts a new graphic on the brand', () => {
  it('re-clothes the draft in brandTheme rather than a loaded snapshot theme', () => {
    useLiveLayerStore.setState({
      brandTheme: { ...defaultBrandTheme(), accentColor: '#00ff00' },
      explicitBrandKeys: ['accentColor']
    });
    // A loaded preset installs its own theme on the current graphic...
    useLiveLayerStore.getState().loadGraphicInstance(storedGraphic());
    expect(currentTheme().accentColor).toBe('#654321');

    useLiveLayerStore.getState().applyPersonToLowerThird({
      id: 'person-1', displayName: 'Rev. Someone', title: 'Guest', churchName: 'Elsewhere'
    } as never);

    // ...but switching template starts a new graphic, so it wears the brand.
    expect(useLiveLayerStore.getState().currentTemplateId).toBe('preacher-lower-third');
    expect(currentTheme().accentColor).toBe('#00ff00');
    expect(brandTheme().accentColor).toBe('#00ff00');
  });

  it('leaves Program unchanged', () => {
    const before = useLiveLayerStore.getState().program;
    useLiveLayerStore.getState().applyPersonToLowerThird({ id: 'p', displayName: 'X' } as never);
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('isDraftDirty ignores a hex-case-only difference', () => {
  it('re-picking the colour already in use is not an edit', () => {
    useLiveLayerStore.setState({
      currentTemplateId: 'preacher-lower-third',
      theme: defaultBrandTheme(),
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: [],
      draftValues: createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), [])
    });
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(false);

    // The registry declares #E8B93C; a colour input always emits lowercase.
    const gold = houseDefaults().colorAccent;
    expect(gold).not.toBe(gold.toLowerCase());
    useLiveLayerStore.getState().setField('colorAccent', gold.toLowerCase());

    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(false);
  });

  it('still reports a genuine colour change as dirty', () => {
    useLiveLayerStore.setState({
      draftValues: createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), [])
    });
    useLiveLayerStore.getState().setField('colorAccent', '#ff0000');
    expect(useLiveLayerStore.getState().isDraftDirty()).toBe(true);
  });
});
