import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * "THE SCRIPTURE PREVIEW SEEMS STUCK TO THE OLD VERSION."
 *
 * It was not stuck. Changing the Translation empties the lookup panel and
 * starts no lookup — deliberate, so a graphic never changes under an operator
 * who only wanted to browse — which means the staged card keeps the words and
 * the label it was given until a new passage replaces them. What was missing
 * was any way to KNOW that: the one line describing the staged graphic named
 * its reference and not its version, so the select could read KJV over a WEB
 * card with nothing on screen connecting the two.
 *
 * Asserted against source. These live in stateful components and this repo's
 * vitest runs in node with no DOM, so each check is paired with a presence
 * anchor and cannot pass on a file that lost the code entirely.
 */
const panel = readFileSync('src/components/control/ScriptureLookupPanel.tsx', 'utf8');
const workspace = readFileSync('src/app/workspaces/ScriptureWorkspace.tsx', 'utf8');

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the panel can say which version is on the graphic', () => {
  it('is given the staged card’s translation label, not just its reference', () => {
    const code = stripComments(workspace);
    expect(code).toContain('draftValues.translationLabel');
    expect(code).toContain('currentGraphicTranslation=');
    // Both are gated on `composing` together: naming a version for a graphic
    // that is not a scripture card would describe someone else's graphic.
    expect(code).toMatch(/currentGraphicTranslation=\{composing \? draftTranslation : ''\}/);
  });

  it('compares the staged version against the selected one', () => {
    const code = stripComments(panel);
    expect(code).toContain('const versionsDiffer');
    // Case-insensitive: the two labels arrive from different sources
    // (`result.translation` on the graphic, `translation.label` in the picker).
    expect(code).toMatch(/toLowerCase\(\)\s*!==\s*selectedLabel\.toLowerCase\(\)/);
  });

  it('names the version and the action when the two disagree', () => {
    const code = stripComments(panel);
    expect(code).toContain('stagedGraphicLine');
    expect(code).toContain('Translation is set to');
    // The way out has to be in the sentence. "They differ" without "look it up
    // again" leaves the operator knowing something is wrong and not what to do.
    expect(code).toMatch(/Look it up again/);
  });

  it('still names the version when they agree, rather than falling silent', () => {
    // The reference-only sentence is what made this invisible in the first
    // place; the version is now always part of describing the staged graphic.
    const code = stripComments(panel);
    expect(code).toMatch(/The current graphic is \$\{currentGraphicReference\}\$\{stagedVersion/);
  });
});

describe('the duplicate translation tag is gone', () => {
  it('no longer prints the selected translation twice', () => {
    /**
     * The tag read `KJV` directly beneath a select reading "KJV — King James
     * Version". Reported as redundant, and it was.
     */
    const code = stripComments(panel);
    expect(code).not.toContain('{translation?.label ?? translationId.toUpperCase()}</span>');
  });

  it('keeps naming the translation in TEXT everywhere it matters', () => {
    /**
     * The rule the tag existed for outlives it: WEB and KJV of one verse are
     * different on-air content, so the translation is never signalled by colour
     * alone. The select spells it out, the retrieved passage carries its own
     * tag, and the staged-graphic line names it too.
     */
    const code = stripComments(panel);
    expect(code).toContain('{passage.translation}');
    expect(code).toContain('{item.label} — {item.name ?? item.label}');
    expect(code).toContain('selectedLabel');
  });
});
