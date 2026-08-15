import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AS_CHOSEN,
  DEFAULT_SCRIPTURE_OUTPUTS,
  SCRIPTURE_OUTPUT_SCREENS,
  readOutputScreen,
  resolveScreenValues,
  sanitizeScriptureOutputs,
  screenRenders,
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
    expect(readOutputScreen('?screen=house')).toBe('house');
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

/**
 * THE THREE SCREEN LAYOUTS DIVERGED, AND STAYING DIVERGED IS THE POINT.
 *
 * `wide`'s plate paints a card, so the variant paints type only. `tall`'s plate
 * stopped painting one on 13 Aug — a fixed 610-tall card left ~200px of dead
 * ground under both the short verse and the longest passage, because only this
 * side knows the text — so the variant paints its own, fitted. `house` paints
 * nothing at all and is read across a field at night.
 *
 * They shared selectors once and a refactor would happily re-merge them. These
 * read the stylesheet because that is where the divergence lives.
 */
describe('who paints the card', () => {
  const css = read('src/styles.css');

  it('leaves wide painting type only — the plate still has its card', () => {
    expect(css).toMatch(/\.gfx-scripture\[data-variant='split-wide'\] \.scripture-plate \{[^}]*background: none !important/);
  });

  it('has tall paint a ground fitted to the verse, and NOTHING the artwork draws', () => {
    const band = /\.gfx-scripture\[data-variant='split-tall'\] \.scripture-band \{([^}]*)\}/.exec(css)?.[1] ?? '';
    // Content-height is the property that had to move to this side: only here
    // is the text known, and a fixed card left dead ground at both ends of the
    // range.
    expect(band).toContain('height: auto');
    expect(band).toMatch(/background: linear-gradient/);
    /**
     * THE BORDER AND THE QUOTE MARK ARE ON THE BACKGROUND IMAGE.
     *
     * Both were briefly painted here, while the plate had dropped its card.
     * They are drawn by hand in the artwork now, so painting them again puts a
     * gold rule inside a gold rule and two quote marks on one card — which is
     * exactly what shipped for one round.
     */
    expect(band).not.toMatch(/\bborder:/);
    expect(css).not.toMatch(/\[data-variant='split-tall'\] \.scripture-band::before/);
  });

  it('never lets the two share a card rule again', () => {
    // The selector they used to share. If it comes back, one of them is wrong.
    expect(css).not.toMatch(/\[data-variant='split-wide'\] \.scripture-plate,\s*\n\.gfx-scripture\[data-variant='split-tall'\] \.scripture-plate/);
  });

  it('gives house no card, no border and no chrome', () => {
    const plate = /\.gfx-scripture\[data-variant='house-wall'\] \.scripture-plate \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(plate).toContain('background: none !important');
    expect(plate).toContain('box-shadow: none');
    // Reference above, verse centred, and nothing else — the translation label
    // is deliberately dropped at this distance.
    expect(css).toMatch(/\[data-variant='house-wall'\] \.scripture-translation \{\s*\n?\s*display: none/);
  });

  it('sets house larger than any other layout', () => {
    // Read across a field at night. The plate's own preview uses 82/64 as
    // FLOORS, so every band here has to clear them.
    const size = (variant: string, cls: string) =>
      Number(
        new RegExp(`\\[data-variant='${variant}'\\] \\.scripture-verse${cls} \\{ font-size: (\\d+)px`).exec(css)?.[1] ?? 0
      );
    expect(size('house-wall', '-xl')).toBeGreaterThan(size('split-tall', '-xl'));
    expect(size('house-wall', '')).toBeGreaterThan(size('split-tall', ''));
    expect(size('house-wall', '-sm')).toBeGreaterThanOrEqual(64); // the long-verse floor
    expect(size('house-wall', '-xl')).toBeGreaterThanOrEqual(82); // the short-verse floor
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

  it('keeps the live ?screen= contract intact', () => {
    // Both split scenes in OBS carry a browser source at
    // `.../output?relay=...&screen=split`. These four ids and the param name
    // are a running production setup, not an implementation detail.
    expect(SCRIPTURE_OUTPUT_SCREENS.map((s) => s.id)).toEqual(['main', 'scripture', 'split', 'house']);
    expect(readOutputScreen('?relay=http://192.168.1.4:4174&screen=split')).toBe('split');
    expect(readOutputScreen('?relay=http://192.168.1.4:4174&screen=house')).toBe('house');
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
    expect(scriptureLookFor('split', { main: AS_CHOSEN, scripture: AS_CHOSEN, split: 'gone', house: 'house-wall' })).toBeNull();
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
  const verse = { variantId: 'classic-band', reference: 'Psalm 90:1', verseText: 'Lord…' };
  const outputs = sanitizeScriptureOutputs({ split: 'split-tall' });

  it('re-skins a scripture card on a screen that names a look', () => {
    expect(resolveScreenValues('scripture-card', verse, 'split', outputs).variantId).toBe('split-tall');
  });

  it('leaves the operator’s own variant alone on a screen set to as-chosen', () => {
    expect(resolveScreenValues('scripture-card', verse, 'main', outputs).variantId).toBe('classic-band');
  });

  it('touches NOTHING else — the blast radius is one template', () => {
    // The rule that keeps this safe. A general mechanism is wrong about every
    // graphic on air; a scripture-only one can only ever be wrong about
    // scripture cards, and a 12-day convention has no second chance.
    const l3 = { variantId: 'modern-minimal', name: 'Rev. Ishmael K. Awotwe' };
    for (const templateId of ['preacher-lower-third', 'performer-lower-third', 'quote-card', 'fullscreen-message', 'announcement-banner']) {
      expect(resolveScreenValues(templateId, l3, 'split', outputs), templateId).toBe(l3);
    }
    expect(resolveScreenValues(null, l3, 'split', outputs)).toBe(l3);
  });

  it('returns the same object when it changes nothing, so no render is provoked', () => {
    expect(resolveScreenValues('scripture-card', verse, 'main', outputs)).toBe(verse);
  });

  it('never mutates what it was given', () => {
    const before = { ...verse };
    resolveScreenValues('scripture-card', verse, 'split', outputs);
    expect(verse).toEqual(before);
  });

  /**
   * ONE implementation, called by both surfaces. A Screens page that resolved
   * the look its own way would show the operator something no screen is
   * rendering the first time the two drifted.
   */
  it('is the only resolution either surface performs', () => {
    for (const path of ['src/app/OutputPage.tsx', 'src/components/control/ScreenCard.tsx']) {
      const source = read(path);
      expect(source, path).toContain('resolveScreenValues(');
      // Nobody re-derives it: no local scriptureLookFor call, no literal id.
      expect(source, path).not.toMatch(/scriptureLookFor\(/);
      expect(source, path).not.toMatch(/'scripture-card'/);
    }
  });

  it('overrides the RENDERED values and never the stored graphic', () => {
    const source = read('src/app/OutputPage.tsx');
    expect(source).toContain('<resolved.Renderer values={outputValues}');
    expect(source).not.toMatch(/setActiveGraphic\([^)]*variantId/);
  });
});

/**
 * WHICH COMMANDS A SCREEN IS ADDRESSED BY.
 *
 * Reported from the desk: with a verse up on the split scene, taking a lower
 * third replaced it — so the composition the split scene exists to hold came
 * apart because the operator addressed the stream. A scoped screen is the
 * answer, and the acknowledgement rule is the part that keeps it honest.
 */
describe('what a screen will render at all', () => {
  it('lets the MAIN screen carry anything, as it always has', () => {
    for (const template of ['scripture-card', 'preacher-lower-third', 'quote-card', 'fullscreen-message']) {
      expect(screenRenders('main', template), template).toBe(true);
    }
  });

  it('leaves main as the ONLY screen a lower third can reach', () => {
    /**
     * The rule in the operator's words: the lower thirds, the announcements
     * "and others too be strict for the main screen". It was unstatable while a
     * fourth screen (`lower`) also carried everything — that screen is retired,
     * and this asserts the shape rather than the absence, so re-adding a second
     * `scope: 'all'` screen fails here rather than on air.
     */
    const carriesEverything = SCRIPTURE_OUTPUT_SCREENS.filter((s) => s.scope === 'all');
    expect(carriesEverything.map((s) => s.id)).toEqual(['main']);
  });

  it('degrades a retired screen to main rather than to a source that renders nothing', () => {
    // `?screen=lower` was a real address. An overlay that shows more than
    // expected is visible and recoverable; one that silently draws nothing is a
    // mystery to debug mid-service.
    expect(readOutputScreen('?screen=lower')).toBe('main');
  });

  it('keeps the scripture, split and house screens to scripture', () => {
    expect(screenRenders('scripture', 'scripture-card')).toBe(true);
    expect(screenRenders('split', 'scripture-card')).toBe(true);
    expect(screenRenders('house', 'scripture-card')).toBe(true);
    for (const template of ['preacher-lower-third', 'performer-lower-third', 'quote-card', 'announcement-banner', 'fullscreen-message']) {
      expect(screenRenders('scripture', template), template).toBe(false);
      expect(screenRenders('split', template), template).toBe(false);
      expect(screenRenders('house', template), template).toBe(false);
    }
  });

  it('treats a graphic with no template as not addressed to a scoped screen', () => {
    expect(screenRenders('split', null)).toBe(false);
    expect(screenRenders('split', undefined)).toBe(false);
  });

  it('is enforced BEFORE the acknowledgement, not after', () => {
    /**
     * The load-bearing half. `OUTPUT_APPLIED` means "I put this on screen", so a
     * screen that ignored a command must not confirm the Take on behalf of one
     * that rendered it — otherwise the desk reads OUTPUT ACTIVE because the
     * house wall replied about a lower third it never showed.
     */
    const source = read('src/app/OutputPage.tsx');
    const guard = source.indexOf('if (!screenRenders(screen, graphic.templateId)) return;');
    const ack = source.indexOf("createOutputEvent('OUTPUT_APPLIED'");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(ack);
  });

  it('never filters a clear', () => {
    // Clear means clear, on every screen. An operator reaching for it in a
    // hurry must not have to work out which screens were listening.
    const source = read('src/app/OutputPage.tsx');
    const clearBlock = source.slice(source.indexOf("message.type === 'HIDE_GRAPHIC'"));
    expect(clearBlock.slice(0, 400)).not.toContain('screenRenders');
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
