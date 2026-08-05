import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScriptureCard from './ScriptureCard';

/**
 * Verse text is third-party input on its way to air.
 *
 * It arrives from a public HTTP endpoint, is written into `values.verseText`, and
 * is rendered by the output bundle inside OBS. Nothing in that path is signed or
 * validated, so the renderer is the last place a hostile or merely broken payload
 * can be caught. React escapes text children by default — these tests hold that
 * property still true, and pin the one place it is NOT automatic.
 */

const XSS = '<img src=x onerror=alert(1)>';

// The theme is irrelevant to escaping; a valid one is supplied because the
// renderer's prop type requires the three mandatory colours.
const THEME = { primaryColor: '#f8fafc', accentColor: '#1284ff', backgroundColor: 'transparent' };

function render(values: Record<string, string>) {
  return renderToStaticMarkup(createElement(ScriptureCard, { values, theme: THEME }));
}

describe('ScriptureCard renders provider text as text', () => {
  it('escapes markup in the verse, the reference and the translation label', () => {
    const html = render({
      reference: `"><script>alert(1)</script>`,
      verseText: XSS,
      translationLabel: '<b>WEB</b>',
      themeTitle: '<i>Theme</i>'
    });

    /**
     * No live ELEMENT from any field. Deliberately not asserting that the string
     * "onerror" is absent — it survives inside `&lt;img src=x onerror=alert(1)&gt;`,
     * which is inert text and exactly the correct output. Asserting on the word
     * rather than the markup would fail on a renderer that is behaving.
     */
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<b>WEB<\/b>/i);

    /**
     * Presence anchor. Without it this passes when the renderer silently drops
     * the field — which would satisfy every assertion above while putting a blank
     * plate on air.
     */
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps a hostile value out of the inline style, where escaping would not save it', () => {
    /**
     * The one non-text path: colours are spread into `style`. A CSS custom
     * property is a real injection surface, so `colorVars` allow-lists strict hex
     * and drops anything else. This asserts that gate holds for scripture cards.
     */
    const html = render({
      reference: 'John 3:16',
      verseText: 'text',
      colorBrand: 'url(javascript:alert(1))',
      colorAccent: 'red; background:url(x)',
      colorSurface: '#112233'
    });

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('url(');
    // The valid one survives, so the filter is filtering rather than blanking.
    expect(html).toContain('#112233');
  });

  it('renders ordinary passage text unharmed', () => {
    const html = render({
      reference: 'John 3:16',
      verseText: 'For God so loved the world — “that” he gave his one and only Son.',
      translationLabel: 'WEB'
    });
    expect(html).toContain('For God so loved the world');
    expect(html).toContain('John 3:16');
    expect(html).toContain('WEB');
  });
});
