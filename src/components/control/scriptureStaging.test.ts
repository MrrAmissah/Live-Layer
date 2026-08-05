import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Two Codex findings on `b466e02`, both about an action that half-succeeds.
 *
 * Asserted against source: these live in stateful components, and this repo's
 * vitest runs in node with no DOM and no testing-library. Each check is paired
 * with a presence anchor so it cannot pass on a file that lost the code entirely.
 */
const panel = readFileSync('src/components/control/ScriptureLookupPanel.tsx', 'utf8');
const workspace = readFileSync('src/app/workspaces/ScriptureWorkspace.tsx', 'utf8');

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('an in-flight lookup cannot outlive its translation', () => {
  /**
   * The hook's request-id guard only invalidates when a NEWER LOOKUP starts.
   * Changing the translation starts none — it clears the panel — so a WEB request
   * begun before the switch still passed the id check and repopulated the panel
   * with WEB wording while the select read KJV. That passage could then be staged,
   * putting mislabelled text on air.
   */
  it('captures the requested translation and compares it before applying a result', () => {
    const code = stripComments(panel);
    expect(code).toContain('const requested = translationId');
    expect(code).toMatch(/latestTranslation\.current\s*!==\s*requested/);

    // Order matters: the comparison must sit between the await and onPassage.
    const awaitAt = code.indexOf('await lookup(reference, requested)');
    const guardAt = code.indexOf('latestTranslation.current !== requested');
    const applyAt = code.indexOf('onPassage(found.result');
    // Each anchor asserted present FIRST. `indexOf` returns -1 when a symbol is
    // gone, and `-1 < n` is true — so an ordering assertion alone passes when the
    // code it orders has been deleted.
    expect(awaitAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(-1);
    expect(applyAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(awaitAt);
    expect(applyAt).toBeGreaterThan(guardAt);
  });

  it('clears the success status it is discarding, not just the result', () => {
    // The hook resolves the request — writing "Found …" — before this guard runs,
    // so returning alone leaves a success message above an emptied passage panel.
    const code = stripComments(panel);
    const guardAt = code.indexOf('latestTranslation.current !== requested');
    const resetAt = code.indexOf('reset();', guardAt);
    const returnAt = code.indexOf('return;', guardAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(resetAt).toBeGreaterThan(-1);
    expect(resetAt).toBeLessThan(returnAt);
  });

  it('keeps the mirror fresh on every render, or the comparison reads a stale value', () => {
    const code = stripComments(panel);
    expect(code).toMatch(/latestTranslation\.current\s*=\s*translationId/);
  });

  it('cancels a pending lookup before restoring a recent passage', () => {
    /**
     * Reopening a recent starts no lookup, so an in-flight request still passed
     * the hook's id check and overwrote the restored passage on arrival. The
     * translation comparison does not cover it — a recent in the SAME translation
     * as the pending request clears that check.
     */
    const code = stripComments(panel);
    const openAt = code.indexOf('const openRecent');
    const resetAt = code.indexOf('reset();', openAt);
    const restoreAt = code.indexOf('onPassage(recent.result, true)', openAt);
    expect(openAt).toBeGreaterThan(-1);
    expect(resetAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeGreaterThan(-1);
    // Cancel first, then restore — the other order leaves the same race open.
    expect(resetAt).toBeLessThan(restoreAt);
  });

  it('carries the cache flag with the result rather than hardcoding it', () => {
    /**
     * `onPassage(result, false)` made a cache hit render as a fresh fetch, so the
     * "from saved copy" label never appeared on the path that most often serves
     * one. The flag cannot be read off the hook's state here — that state has not
     * re-rendered yet at this point in the await, so it would report the previous
     * lookup's value.
     */
    const code = stripComments(panel);
    expect(code).toContain('onPassage(found.result, found.fromCache)');
    expect(code).not.toMatch(/onPassage\([^)]*,\s*false\s*\)/);
  });
});

describe('a failed rundown add changes nothing', () => {
  /**
   * `addDraftToRundown` builds from the shared draft, so the passage must be
   * applied first — which meant a rundown at its cap produced a "couldn't add"
   * notice AND a silently changed current graphic. The cap is now tested before
   * anything is written.
   */
  it('checks the item cap before applying the passage or recording a recent', () => {
    const code = stripComments(workspace);
    const capAt = code.indexOf('MAX_ITEMS_PER_RUNDOWN');
    const applyAt = code.indexOf('applyPassage(result);\n    rememberScripturePassage');
    expect(capAt).toBeGreaterThan(-1);
    expect(applyAt).toBeGreaterThan(-1);
    expect(capAt).toBeLessThan(applyAt);
    // Bails out rather than falling through to the write.
    expect(code).toMatch(/>=\s*MAX_ITEMS_PER_RUNDOWN\)\s*\{[\s\S]{0,220}?return;/);
  });

  it('says nothing was changed when it refuses, and admits the staging when it cannot', () => {
    expect(workspace).toContain('nothing was changed');
    // The residual case — add fails for a reason the cap check did not catch —
    // must not claim the graphic is untouched, because by then it is not.
    expect(workspace).toContain('but it is now the current graphic');
  });
});

describe('the staging notice tells the truth about how Take will behave', () => {
  /**
   * `ControlPage.onTake` returns through the rundown branch when a rundown is
   * active: it airs the SELECTED ITEM and never falls through to the draft, and
   * with nothing selected Take is disabled. So "Preview it, then Take when ready"
   * is only true in draft mode — with a rundown active it points the operator at
   * a button that cannot air what they just set.
   */
  it('does not promise Take will air the draft while a rundown is active', () => {
    const code = stripComments(workspace);
    // Every notice that mentions Take must be gated on the rundown state.
    const takeReady = code.indexOf('Take when ready');
    expect(takeReady).toBeGreaterThan(-1);
    const gate = code.lastIndexOf('activeRundownId', takeReady);
    expect(gate).toBeGreaterThan(-1);
    // The rundown-mode branch names what Take actually does instead.
    expect(code).toContain('Take fires the selected rundown item');
  });

  it('still names the rundown branch in the panel note, not only in the notice', () => {
    // Presence anchor: the standing note and the transient notice are separate
    // surfaces, and the note is what an operator sees before acting.
    expect(panel).toContain('Take fires the selected rundown item');
  });
});

describe('the workspace still stages rather than airs', () => {
  it('renders no Take or Clear of its own', () => {
    // Presence anchor lives in workspaceRoutes.test.ts, which asserts LiveActions
    // is the only file containing the take-btn class.
    for (const [name, source] of [
      ['panel', panel],
      ['workspace', workspace]
    ] as const) {
      expect(source, name).not.toMatch(/className="take-btn/);
      expect(source, name).not.toMatch(/className="clear-btn/);
      expect(stripComments(source), name).not.toContain('publishCommand');
      expect(stripComments(source), name).not.toContain('markProgram');
    }
  });

  it('writes the draft through one atomic setFields', () => {
    const code = stripComments(workspace);
    // Three sequential setField calls each start from the same render-time
    // snapshot, which is how the reference and verse text were once dropped and
    // only the translation label survived.
    expect(code).toContain('setFields({');
    expect(code.match(/setField\(/g)).toBeNull();
  });
});
