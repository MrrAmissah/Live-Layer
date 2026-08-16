import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TONE_BY_PILL } from '../lib/programStatus';
import { SCRIPTURE_OUTPUT_SCREENS } from '../lib/scriptureOutputs';

/**
 * THE GUIDE HAS TO STAY TRUE, AND A HELP PAGE IS THE WORST PLACE FOR A STALE FACT.
 *
 * Somebody reads it when they are already lost, and believes it. So the page
 * DERIVES the things that have an owner — the workspace list from `StudioNav`,
 * the status vocabulary from `programStatus.ts`, the screens from
 * `scriptureOutputs.ts` — and hand-writes only the English, which has none.
 *
 * These tests hold the seam: add a workspace or a status pill without a line of
 * explanation and it fails here, rather than rendering a blank cell to a
 * volunteer mid-service.
 */
const guide = readFileSync('src/app/GuidePage.tsx', 'utf8');
const nav = readFileSync('src/components/control/StudioNav.tsx', 'utf8');

describe('the guide explains everything it lists', () => {
  it('has words for every Program status pill', () => {
    for (const pill of Object.keys(TONE_BY_PILL)) {
      // Quoted keys for the multi-word pills, bare for the rest.
      const key = /\s/.test(pill) ? `'${pill}':` : `${pill}:`;
      expect(guide, `no explanation for ${pill}`).toContain(key);
    }
  });

  it('has words for every workspace the nav offers', () => {
    const labels = [...nav.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
    expect(labels.length).toBeGreaterThan(3);
    for (const label of labels) {
      expect(guide, `no explanation for the ${label} workspace`).toContain(`${label}: {`);
    }
  });
});

describe('the guide reads its facts rather than repeating them', () => {
  it('enumerates the pills from programStatus.ts', () => {
    // The import is the point: `programSyncWiring.test.ts` forbids a control
    // component hardcoding these claims so that one file stays their author. A
    // hand-copied list here would be exactly the second copy that rule exists
    // to prevent, just outside the directory it scans.
    expect(guide).toContain("import { TONE_BY_PILL } from '../lib/programStatus'");
    expect(guide).toContain('Object.entries(TONE_BY_PILL)');
  });

  it('takes the workspace list and the screens from their own modules', () => {
    expect(guide).toContain("import { CONTROL_WORKSPACES } from '../components/control/StudioNav'");
    expect(guide).toContain('CONTROL_WORKSPACES.map');
    expect(guide).toContain('SCRIPTURE_OUTPUT_SCREENS.map');
    // Screens print their OWN hint, so a screen's description lives in one place.
    expect(guide).toContain('{screen.hint}');
    expect(SCRIPTURE_OUTPUT_SCREENS.every((screen) => screen.hint.length > 20)).toBe(true);
  });
});

describe('the guide is a page, not a place you work', () => {
  it('is a top-level route beside /setup', () => {
    /**
     * Not a sixth workspace. The left nav is places you work; this is what
     * things mean — and a `/control/*` child would additionally have to be
     * listed in `controlPaths.ts` or `ControlPage` canonicalises it away to
     * Studio before it can mount, which is how a Library link once resolved to
     * Studio at every width.
     */
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('path="/guide"');
    const paths = readFileSync('src/app/workspaces/controlPaths.ts', 'utf8');
    expect(paths).not.toContain("'guide'");
  });

  it('is reachable from the control surface without knowing the URL', () => {
    const bar = readFileSync('src/components/control/CommandBar.tsx', 'utf8');
    expect(bar).toContain("openRoute('/guide')");
  });

  it('changes nothing — it is safe to open with the stream running', () => {
    /**
     * A help page that could take, clear or write is a hazard in the exact
     * moment it is opened. It reads, and links.
     */
    for (const forbidden of ['setFields(', 'publishCommand', 'localStorage.setItem', 'useLiveLayerStore']) {
      expect(guide, `the guide should not call ${forbidden}`).not.toContain(forbidden);
    }
  });
});
