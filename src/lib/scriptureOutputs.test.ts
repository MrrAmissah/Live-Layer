import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AS_CHOSEN,
  DEFAULT_SCRIPTURE_OUTPUTS,
  SCRIPTURE_OUTPUT_SCREENS,
  readOutputScreen,
  sanitizeScriptureOutputs,
  scriptureLookFor,
  scriptureVariantIds
} from './scriptureOutputs';
import { templateRegistry } from '../components/templates/registry';
import { reduceRealtimeMessage } from './programSync';
import { parseRealtimeMessage } from './realtimeMessages';
import { CLEAR_PROGRAM_STATE } from '../types/program';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/**
 * Scripture Outputs: one Take, a different look on each screen.
 *
 * The tests that matter here are not about the picker. They are about the
 * BOUNDARY — that this re-skins scripture and only scripture — and about the
 * two ways a screen could end up rendering something nobody configured.
 */
describe('which screen a page is', () => {
  it('is the main screen for every URL that exists today', () => {
    // The compatibility promise. An OBS source already pointed at /output must
    // keep working with no edit, six days before a convention.
    expect(readOutputScreen('')).toBe('main');
    expect(readOutputScreen('?debug=1')).toBe('main');
    expect(readOutputScreen('?relay=http://192.168.1.4:4174')).toBe('main');
  });

  it('reads the named screens', () => {
    expect(readOutputScreen('?screen=split')).toBe('split');
    expect(readOutputScreen('?screen=lower')).toBe('lower');
    expect(readOutputScreen('?debug=1&screen=split')).toBe('split');
    expect(readOutputScreen('?screen=SPLIT')).toBe('split');
    expect(readOutputScreen('?screen= split ')).toBe('split');
  });

  it('treats an unknown screen as the main screen, never as an error', () => {
    // A typo in an OBS source URL must render the ordinary card. A blank scene
    // mid-service is a far worse answer than the wrong-but-working one.
    expect(readOutputScreen('?screen=splt')).toBe('main');
    expect(readOutputScreen('?screen=')).toBe('main');
  });
});

describe('what each screen looks like', () => {
  it('ships defaults that every build can actually render', () => {
    // A default naming a variant this build dropped would put a screen on a
    // look nobody configured — the same defect as a rundown item that cannot
    // air, one level down.
    const known = [AS_CHOSEN, ...scriptureVariantIds()];
    expect(known.length).toBeGreaterThan(2);
    for (const [screen, variantId] of Object.entries(DEFAULT_SCRIPTURE_OUTPUTS)) {
      expect(known, `default for ${screen}`).toContain(variantId);
    }
  });

  it('leaves the main screen exactly as it behaves today', () => {
    // THE COMPATIBILITY RULE. Presets, Recent and every rundown item carry a
    // variantId the operator picked; a main screen hard-wired to one look would
    // ignore all of them and turn the library's variant picker into a control
    // with no effect for scripture.
    expect(DEFAULT_SCRIPTURE_OUTPUTS.main).toBe(AS_CHOSEN);
    expect(scriptureLookFor('main', DEFAULT_SCRIPTURE_OUTPUTS)).toBeNull();
  });

  it('gives the split screen its own look out of the box', () => {
    // The ask: set the verse once, and the split scene renders its own way
    // without anybody switching anything mid-service.
    expect(scriptureLookFor('split', DEFAULT_SCRIPTURE_OUTPUTS)).toBe('split-wide');
  });

  it('lets a screen be set back to the graphic’s own look', () => {
    const outputs = sanitizeScriptureOutputs({ split: AS_CHOSEN });
    expect(outputs.split).toBe(AS_CHOSEN);
    expect(scriptureLookFor('split', outputs)).toBeNull();
  });

  it('has a default for every screen Settings lists, and lists every screen it defaults', () => {
    expect(SCRIPTURE_OUTPUT_SCREENS.map((s) => s.id).sort()).toEqual(
      Object.keys(DEFAULT_SCRIPTURE_OUTPUTS).sort()
    );
  });

  it('keeps a stored look this build still ships', () => {
    const next = sanitizeScriptureOutputs({ split: 'split-tall' });
    expect(next.split).toBe('split-tall');
    expect(next.main).toBe(DEFAULT_SCRIPTURE_OUTPUTS.main);
  });

  it('falls back to the default when a stored look no longer resolves', () => {
    // Variant ids persist in localStorage across releases. A renamed variant
    // costs a reset to the default look, not a screen rendering nothing.
    expect(sanitizeScriptureOutputs({ split: 'variant-that-was-renamed' }).split).toBe(
      DEFAULT_SCRIPTURE_OUTPUTS.split
    );
  });

  it('drops screens it does not know and survives junk', () => {
    const next = sanitizeScriptureOutputs({ ghost: 'split-tall', split: 'split-tall' });
    expect(next).toEqual({ ...DEFAULT_SCRIPTURE_OUTPUTS, split: 'split-tall' });
    expect(sanitizeScriptureOutputs(null)).toEqual(DEFAULT_SCRIPTURE_OUTPUTS);
    expect(sanitizeScriptureOutputs('nonsense')).toEqual(DEFAULT_SCRIPTURE_OUTPUTS);
    expect(sanitizeScriptureOutputs({ split: 42 })).toEqual(DEFAULT_SCRIPTURE_OUTPUTS);
  });

  it('refuses to name a look the build cannot render, so the graphic keeps its own', () => {
    expect(scriptureLookFor('split', { main: AS_CHOSEN, lower: AS_CHOSEN, split: 'gone' })).toBeNull();
    expect(scriptureLookFor('split', DEFAULT_SCRIPTURE_OUTPUTS)).toBe(DEFAULT_SCRIPTURE_OUTPUTS.split);
  });

  it('offers only variants that belong to scripture-card', () => {
    const scripture = new Set(scriptureVariantIds());
    expect(scripture.has(AS_CHOSEN)).toBe(false); // it is a setting, not a variant
    const lowerThird = templateRegistry.find((t) => t.id === 'preacher-lower-third');
    for (const variant of lowerThird?.variants ?? []) {
      expect(scripture.has(variant.id), `${variant.id} is a lower-third variant`).toBe(false);
    }
  });
});

/**
 * THE BOUNDARY.
 *
 * Scoped to scripture on purpose: a scripture-only feature can only ever be
 * wrong about scripture cards, while a general one is wrong about every graphic
 * on air. These read the source because the gate is one expression, and one
 * expression is exactly the kind of thing a later edit generalises "for free".
 */
describe('the scripture-only gate', () => {
  const source = read('src/app/OutputPage.tsx');

  it('is written against SCRIPTURE_TEMPLATE_ID, not a string literal', () => {
    expect(source).toMatch(/activeGraphic\?\.templateId !== SCRIPTURE_TEMPLATE_ID\) return renderedValues/);
    expect(source).not.toMatch(/templateId === 'scripture-card'/);
  });

  it('overrides the RENDERED values and never the stored graphic', () => {
    // `activeGraphic` is what OUTPUT_APPLIED acknowledges and what Recent,
    // presets and the rundown show. Writing the role's variant back into it
    // would rewrite the operator's own choice.
    expect(source).toMatch(/\{ \.\.\.renderedValues, variantId: look \}/);
    expect(source).not.toMatch(/setActiveGraphic\([^)]*variantId/);
  });

  it('hands the overridden values to the renderer, so the gate is not decorative', () => {
    expect(source).toContain('<resolved.Renderer values={outputValues}');
    expect(source).not.toContain('<resolved.Renderer values={renderedValues}');
  });
});

describe('the mapping on the wire', () => {
  // Chrome control and an OBS CEF browser source share no localStorage, so a
  // setting that only persists locally never reaches the screen it configures.
  const message = (payload: unknown) => ({
    id: 'so-1',
    type: 'SET_SCRIPTURE_OUTPUTS',
    payload,
    timestamp: 1
  });

  it('parses a flat screen -> variant record', () => {
    const parsed = parseRealtimeMessage(message({ split: 'split-tall' }));
    expect(parsed?.type).toBe('SET_SCRIPTURE_OUTPUTS');
    expect(parsed?.payload).toEqual({ split: 'split-tall' });
  });

  it('rejects anything that is not one', () => {
    expect(parseRealtimeMessage(message({ split: 7 }))).toBeNull();
    expect(parseRealtimeMessage(message('split-tall'))).toBeNull();
  });

  it('never touches Program — it changes how a card is painted, not what is on air', () => {
    const parsed = parseRealtimeMessage(message({ split: 'split-tall' }));
    const change = reduceRealtimeMessage(
      { program: { ...CLEAR_PROGRAM_STATE }, outputs: {} },
      parsed!,
      1000
    );
    expect(change).toEqual({});
  });

  it('is published by the control surface whenever it changes', () => {
    const control = read('src/app/ControlPage.tsx');
    expect(control).toMatch(/createMessage\('SET_SCRIPTURE_OUTPUTS', scriptureOutputs\)/);
    expect(control).toMatch(/\}, \[scriptureOutputs\]\)/);
  });

  it('is retained by the relay in its own slot, ahead of the command', () => {
    // Its own slot because a burst of commands must not evict the only copy a
    // cross-browser output will ever see; ahead of the command so a restored
    // card is painted the way this screen is configured from the first frame.
    const relay = read('scripts/relay-snapshot.mjs');
    expect(relay).toMatch(/scriptureOutputs: message/);
    expect(relay).toMatch(/\[snapshot\.scriptureOutputs, snapshot\.command, snapshot\.ack, snapshot\.status\]/);
  });
});
