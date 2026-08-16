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

describe('reopening a stored row keeps the selected version', () => {
  /**
   * Every recent row used to call `onTranslationChange(recent.translationId)`,
   * so a list captured under the old default dragged the picker back to it on
   * every click. That was the rest of "I still see WEB".
   */
  it('no longer lets a stored row move the picker', () => {
    const code = stripComments(panel);
    expect(code).toContain('const openRecent');
    expect(code).not.toContain('onTranslationChange(recent.translationId)');
  });

  it('skips the network when the row is already the selected version', () => {
    // Reopening must still work offline for the common case — the stored result
    // IS the answer when the versions already agree.
    const code = stripComments(panel);
    expect(code).toMatch(/recent\.translationId === translationId/);
    expect(code).toContain('onPassage(recent.result, true)');
  });

  it('does not paint the old version while the new one loads', () => {
    /**
     * THE SAFETY PROPERTY. Showing the stored copy first would put the old
     * wording in the passage panel with a live "Set as current graphic" beside
     * it, so a quick operator could stage the version they had just navigated
     * away from. An empty panel under "Looking…" cannot be staged.
     */
    const code = stripComments(panel);
    const clearAt = code.indexOf('onPassage(null, false)');
    const fetchAt = code.indexOf('void reopenInSelected(recent)');
    expect(clearAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(clearAt);
  });

  it('falls back to the stored copy, and says that is what happened', () => {
    /**
     * Offline, or a reference the selected translation does not carry, must not
     * leave the operator with nothing where a passage was one click away — and
     * silently serving the old version to someone who selected a new one is the
     * bug this whole change exists to fix, so the fallback names itself.
     */
    const code = stripComments(panel);
    expect(code).toContain('const reopenInSelected');
    expect(code).toMatch(/setReopenNote\(\s*`Couldn’t get/);
    expect(code).toContain('this is the saved ${recent.result.translation} copy');
  });

  it('guards the fetch the same way a typed lookup is guarded', () => {
    // The operator can change translation mid-flight here exactly as they can
    // during a typed lookup; the same two guards have to apply.
    const code = stripComments(panel);
    const body = code.slice(code.indexOf('const reopenInSelected'));
    expect(body).toContain('if (!alive.current) return');
    expect(body).toMatch(/latestTranslation\.current !== requested/);
  });
});

describe('the operator can empty the recents list', () => {
  it('wires the clear helper that had no caller', () => {
    const code = stripComments(panel);
    expect(code).toContain('clearScriptureRecents');
    expect(code).toContain('setRecents([])');
  });

  it('does not sweep up saved passages', () => {
    /**
     * Recents roll over on their own; Saved passages are a deliberate keep. A
     * control sitting on the recents header must not empty the list beside it.
     */
    const code = stripComments(panel);
    const head = code.slice(code.indexOf('scripture-ws__recents-head'));
    const clearBlock = head.slice(0, head.indexOf('</div>'));
    expect(clearBlock).toContain('clearScriptureRecents');
    expect(clearBlock).not.toContain('setFavorites');
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
    /**
     * The select spells the full name out through `describeTranslation`, which
     * both pickers now share — this used to assert the inline JSX and so failed
     * the moment the two surfaces were given one voice. What matters is that
     * the option carries more than a bare code, not how it is assembled.
     */
    expect(code).toContain('describeTranslation(item)');
    expect(code).toContain('selectedLabel');
  });
});
