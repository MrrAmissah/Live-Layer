import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGraphicReadiness, isGraphicReady, describeTakeBlock, SCRIPTURE_TEMPLATE_ID } from './graphicReadiness';
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

describe('the design chooser still shows designs', () => {
  /**
   * Caught in the browser, not by a test: once the renderer stopped inventing
   * content, the four scripture thumbnails in the variant strip all rendered the
   * empty placeholder whenever the draft was empty — the design chooser stopped
   * showing designs. They render the live draft precisely so the operator sees
   * their own copy in each design.
   *
   * The fix is scoped to that strip: empty content fields fall back to the
   * template's own declared `defaultValues`. That is the template's published
   * sample copy, the same thing the library row already renders, and it cannot
   * reach air — Preview and Take read `useLiveTakeContext`, which still refuses.
   */
  it('falls back to the template sample for the variant strip only', () => {
    const contentTab = readFileSync('src/components/control/ContentTab.tsx', 'utf8');
    expect(contentTab).toContain('const sampleValues');
    expect(contentTab).toContain('valuesOverride={sampleValues}');
    // The operator's own text must still win over the sample.
    expect(contentTab).toMatch(/String\(value\)\.trim\(\) !== ''\) sampleValues\[key\] = value/);
    // And the fallback must not have leaked into the airable path.
    const takeContext = readFileSync('src/hooks/useLiveTakeContext.ts', 'utf8');
    expect(takeContext).not.toContain('defaultValues');
  });

  it('renders a design for a scripture variant thumb built from template defaults', () => {
    // The strip's merge is `{...defaultValues, ...nonEmpty(values)}`; with an empty
    // draft that is the template's own sample, which must render as content.
    const template = templateRegistry.find((t) => t.id === SCRIPTURE_TEMPLATE_ID)!;
    const html = render({ ...(template.defaultValues as Record<string, string>) });
    expect(html).not.toContain('scripture-empty');
    expect(html).toContain('scripture-verse');
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

describe('a queue row that cannot air says so', () => {
  /**
   * Issue #22. The gate in `publishShow` worked — nothing aired and Program was
   * untouched — but the reason lived in `ControlPage` state that nothing rendered.
   * `LiveActions` shows its own reason from `useLiveTakeContext`, which describes
   * the draft or the selected rundown item and never a queue row, and rows call
   * `onTakeInstance` directly. So the row's Take silently did nothing.
   */
  const read = (p: string) => readFileSync(p, 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('asks readiness per item, on both queue surfaces', () => {
    // Per item, not once for the queue: a queue can hold a valid card and an
    // incomplete one at the same time.
    const panel = strip(read('src/components/control/QuickQueuePanel.tsx'));
    expect(panel).toContain('function itemReadiness(item: GraphicInstance)');
    expect(panel).toContain('resolveGraphicReadiness(item.templateId, item.values)');

    const rail = strip(read('src/components/control/RailQueue.tsx'));
    expect(rail).toContain('resolveGraphicReadiness(item.templateId, item.values)');
  });

  it('disables the row and carries the reason on both surfaces', () => {
    const panel = strip(read('src/components/control/QuickQueuePanel.tsx'));
    expect(panel).toContain('disabled={!itemReadiness(item).ready}');
    expect(panel).toContain('title={itemReadiness(item).reason || undefined}');
    expect(panel).toContain('aria-describedby');

    // The compact rail row is an icon button with no room for visible text, so
    // the reason has to reach the accessible name.
    const rail = strip(read('src/components/control/RailQueue.tsx'));
    expect(rail).toMatch(/disabled=\{!resolveGraphicReadiness\(item\.templateId, item\.values\)\.ready\}/);
    expect(rail).toContain('Cannot take');
  });

  it('leaves no unrendered refusal state behind in ControlPage', () => {
    // The dead state is the defect. `publishShow` still refuses — that is asserted
    // by "gates the publish path before anything is sent or recorded" above — but
    // it no longer pretends to report the reason.
    const controlPage = read('src/app/ControlPage.tsx');
    expect(controlPage).not.toContain('notReadyReason');
    expect(controlPage).toContain('resolveGraphicReadiness');
  });

  it('still refuses an unready item if a row is ever clicked anyway', () => {
    // The row being disabled is not the guarantee; the publish gate is.
    expect(resolveGraphicReadiness(SCRIPTURE_TEMPLATE_ID, { reference: 'John 3:16' }).ready).toBe(false);
    expect(resolveGraphicReadiness(SCRIPTURE_TEMPLATE_ID, VALID).ready).toBe(true);
  });
});

describe('why Take is blocked — one answer for every arm', () => {
  const READY_STATE = { ready: true, reason: '' } as const;
  const NOT_READY = { ready: false, reason: 'This Scripture card is empty.' } as const;

  it('never disables Take without saying why', () => {
    /**
     * The invariant that matters, over every combination: a greyed button with
     * no cause is the defect this replaced. `disabled` is true exactly when
     * `reason` is non-empty — neither can drift from the other, because a
     * single call returns both.
     */
    for (const rundownActive of [true, false]) {
      for (const hasSelection of [true, false]) {
        for (const readiness of [READY_STATE, NOT_READY]) {
          const block = describeTakeBlock({ rundownActive, hasSelection, readiness });
          expect(block.disabled, JSON.stringify({ rundownActive, hasSelection, readiness })).toBe(
            block.reason !== ''
          );
        }
      }
    }
  });

  it('explains the empty selection, which used to be the silent case', () => {
    const block = describeTakeBlock({ rundownActive: true, hasSelection: false, readiness: READY_STATE });
    expect(block.disabled).toBe(true);
    expect(block.reason).toMatch(/select/i);
    expect(block.reason).toMatch(/queue/i);
  });

  it('prefers the selection complaint over a content one', () => {
    // With no selection there is no target to judge; complaining about the
    // hidden ad-hoc draft would name a graphic the operator cannot see.
    const block = describeTakeBlock({ rundownActive: true, hasSelection: false, readiness: NOT_READY });
    expect(block.reason).toMatch(/select/i);
    expect(block.reason).not.toBe(NOT_READY.reason);
  });

  it('passes the existing readiness reason through untouched', () => {
    // No parallel vocabulary: the content sentence is the one readiness already
    // produces, verbatim.
    const block = describeTakeBlock({ rundownActive: false, hasSelection: false, readiness: NOT_READY });
    expect(block.reason).toBe(NOT_READY.reason);
  });

  it('allows Take when a selected item is airable', () => {
    const block = describeTakeBlock({ rundownActive: true, hasSelection: true, readiness: READY_STATE });
    expect(block).toEqual({ disabled: false, reason: '' });
  });

  it('allows Take on the draft when no rundown is active', () => {
    expect(describeTakeBlock({ rundownActive: false, hasSelection: false, readiness: READY_STATE })).toEqual({
      disabled: false,
      reason: ''
    });
  });
});
