import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGraphicReadiness, isGraphicReady, SCRIPTURE_TEMPLATE_ID } from './graphicReadiness';
import ScriptureCard from '../components/templates/ScriptureCard';
import { templateRegistry, templateRendererMap } from '../components/templates/registry';

/**
 * An empty Scripture card used to air a fabricated verse.
 *
 * `ScriptureCard` filled missing content with hardcoded defaults — the reference
 * became `'Scripture'` and the body became `'The Lord is my shepherd; I shall
 * not want.'` — so a card nobody had filled in rendered as a real, unattributed
 * passage. Nothing gated it: `takeDisabled` only considered rundown selection,
 * and no required-field validation existed anywhere in the draft or Take path.
 */

const THEME = { primaryColor: '#f8fafc', accentColor: '#1284ff', backgroundColor: 'transparent' };
const render = (values: Record<string, string>) =>
  renderToStaticMarkup(createElement(ScriptureCard, { values, theme: THEME }));

const VALID = { reference: 'John 3:16', verseText: 'For God so loved the world.', translationLabel: 'WEB' };

describe('the readiness rule', () => {
  it('refuses an empty Scripture card', () => {
    const r = resolveGraphicReadiness(SCRIPTURE_TEMPLATE_ID, {});
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it('refuses a reference with no verse text, and names the reference', () => {
    const r = resolveGraphicReadiness(SCRIPTURE_TEMPLATE_ID, { reference: 'John 3:16', verseText: '   ' });
    expect(r.ready).toBe(false);
    expect(r.reason).toContain('John 3:16');
  });

  /**
   * The explicit choice for verse-text-without-a-reference: **refused**. An
   * unattributed passage is what a congregation cannot follow, and the plate
   * renders a reference slot that previously showed the word "Scripture".
   */
  it('refuses verse text with no reference', () => {
    const r = resolveGraphicReadiness(SCRIPTURE_TEMPLATE_ID, { verseText: 'For God so loved the world.' });
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/reference/i);
  });

  it('accepts a populated card', () => {
    expect(isGraphicReady(SCRIPTURE_TEMPLATE_ID, VALID)).toBe(true);
  });

  /**
   * The rule is presence, not parseability — deliberately. A reference is free
   * text an operator may legitimately style, and refusing to air a fully
   * populated graphic mid-service over formatting is a worse failure than the one
   * being prevented. Reference *validity* is enforced at lookup instead.
   */
  it('accepts a populated card whose reference is styled rather than canonical', () => {
    expect(isGraphicReady(SCRIPTURE_TEMPLATE_ID, { ...VALID, reference: 'Psalm 23:1-2 (NIV)' })).toBe(true);
    expect(isGraphicReady(SCRIPTURE_TEMPLATE_ID, { ...VALID, reference: 'John 3:16 — The Message' })).toBe(true);
  });

  it('leaves every other template alone', () => {
    // Not a general required-field mechanism; other templates have deliberate
    // empty states and must keep them.
    for (const template of templateRegistry) {
      if (template.id === SCRIPTURE_TEMPLATE_ID) continue;
      expect(isGraphicReady(template.id, {}), template.id).toBe(true);
      expect(isGraphicReady(template.id, undefined), template.id).toBe(true);
    }
  });
});

describe('the renderer invents nothing', () => {
  it('contains no fabricated passage anywhere in its source', () => {
    const source = readFileSync('src/components/templates/ScriptureCard.tsx', 'utf8');
    // The exact string that used to air. Present only as prose in the docblock
    // explaining the removal, so the check is on a rendering fallback.
    expect(source).not.toMatch(/verseText\s*=\s*values\.verseText\?\.trim\(\)\s*\|\|\s*['"]/);
    expect(source).not.toMatch(/reference\s*=\s*values\.reference\?\.trim\(\)\s*\|\|\s*['"]/);
  });

  it('renders no verse and no invented reference when empty', () => {
    const html = render({});
    expect(html).not.toContain('shepherd');
    expect(html).not.toContain('scripture-verse');
    expect(html).not.toContain('scripture-ref');
    // Presence anchor: it renders something honest rather than nothing at all.
    expect(html).toContain('scripture-empty');
    expect(html).toContain('data-empty="true"');
  });

  it('renders no verse when the reference is present but the text is not', () => {
    const html = render({ reference: 'John 3:16' });
    expect(html).not.toContain('shepherd');
    expect(html).not.toContain('scripture-verse');
    expect(html).toContain('scripture-empty');
  });

  it('renders a populated card exactly as before', () => {
    const html = render(VALID);
    expect(html).toContain('For God so loved the world.');
    expect(html).toContain('John 3:16');
    expect(html).toContain('WEB');
    expect(html).toContain('scripture-verse');
    expect(html).not.toContain('scripture-empty');
  });

  it('still renders a populated legacy graphic that carries no translation label', () => {
    // Imported/legacy instances predate the label; they must not be gated.
    const html = render({ reference: 'Psalm 23:1-2', verseText: 'Yahweh is my shepherd: I shall lack nothing.' });
    expect(html).toContain('Yahweh is my shepherd');
    expect(html).not.toContain('scripture-empty');
  });

  it('keeps every other renderer unchanged for sparse values', () => {
    // A regression here would mean the gate leaked outside scripture.
    for (const template of templateRegistry) {
      if (template.id === SCRIPTURE_TEMPLATE_ID) continue;
      const Renderer = templateRendererMap[template.id];
      const html = renderToStaticMarkup(createElement(Renderer, { values: {}, theme: template.theme }));
      expect(html, template.id).not.toContain('scripture-empty');
    }
  });
});

describe('Preview and Take read the same rule', () => {
  it('is the single source both consult', () => {
    const takeContext = readFileSync('src/hooks/useLiveTakeContext.ts', 'utf8');
    const controlPage = readFileSync('src/app/ControlPage.tsx', 'utf8');
    const renderer = readFileSync('src/components/templates/ScriptureCard.tsx', 'utf8');

    for (const [name, source] of [
      ['take context (button + preview)', takeContext],
      ['publish path', controlPage],
      ['renderer', renderer]
    ] as const) {
      expect(source, name).toContain('resolveGraphicReadiness');
    }

    // The context computes readiness from the SAME object it hands to the
    // preview, so the button and the monitor cannot disagree.
    expect(takeContext).toContain('resolveGraphicReadiness(previewSource.templateId, previewSource.values)');
    expect(takeContext).toContain('const preview = previewSource');
  });

  it('gates the publish path before anything is sent or recorded', () => {
    const controlPage = readFileSync('src/app/ControlPage.tsx', 'utf8');
    // Comments stripped first: the docblock explains the ordering in prose and
    // names `markProgram` above the code, which would invert the comparison.
    const code = controlPage.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const body = code.slice(code.indexOf('const publishShow'), code.indexOf('const publishClear'));
    const gateAt = body.indexOf('resolveGraphicReadiness');
    const publishAt = body.indexOf('publishCommand');
    const markAt = body.indexOf('markProgram');
    expect(gateAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(-1);
    // Refusing must happen before the wire AND before any Program write.
    expect(gateAt).toBeLessThan(publishAt);
    expect(gateAt).toBeLessThan(markAt);
    expect(body).toMatch(/if \(!readiness\.ready\)[\s\S]{0,220}?return false;/);
  });
});
