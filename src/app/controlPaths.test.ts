import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCanonicalControlPath, LIBRARY_SECTIONS } from './workspaces/controlPaths';

/**
 * Canonicalisation has to be layout-independent. Redirect *routes* only run when
 * the layout renders its outlet, and the dock never does — so as route elements
 * they silently skipped every window narrower than 1024px.
 */
describe('canonical control paths', () => {
  it('leaves a canonical workspace URL alone', () => {
    for (const path of ['/control/studio', '/control/rundown', ...LIBRARY_SECTIONS.map((s) => `/control/library/${s}`)]) {
      expect(resolveCanonicalControlPath(path), path).toBeNull();
    }
  });

  it('sends the bare control path to a workspace', () => {
    expect(resolveCanonicalControlPath('/control')).toBe('/control/studio');
    expect(resolveCanonicalControlPath('/control/')).toBe('/control/studio');
  });

  it('sends an unknown workspace to Studio', () => {
    expect(resolveCanonicalControlPath('/control/nope')).toBe('/control/studio');
    expect(resolveCanonicalControlPath('/control/studio/extra')).toBe('/control/studio');
  });

  it('sends a sectionless or unknown library section to the first section', () => {
    expect(resolveCanonicalControlPath('/control/library')).toBe('/control/library/saved');
    expect(resolveCanonicalControlPath('/control/library/rundowns')).toBe('/control/library/saved');
    expect(resolveCanonicalControlPath('/control/library/foo')).toBe('/control/library/saved');
    expect(resolveCanonicalControlPath('/control/library/people/extra')).toBe('/control/library/people');
  });

  it('is not any other route’s business', () => {
    for (const path of ['/output', '/setup', '/scripture', '/', '/controlled', '/control-x']) {
      expect(resolveCanonicalControlPath(path), path).toBeNull();
    }
  });
});

describe('the redirect runs for both layouts', () => {
  const controlPage = readFileSync('src/app/ControlPage.tsx', 'utf8');

  it('canonicalises before choosing a shell', () => {
    const redirectAt = controlPage.indexOf('resolveCanonicalControlPath');
    const dockAt = controlPage.indexOf('if (!isStudio)');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeLessThan(dockAt);
  });

  it('lets the layout match every /control/* URL, so it can canonicalise them', () => {
    // Without an index and a catch-all child, a path like `/control/library`
    // matches no child, the sibling top-level `*` wins, and the URL is rewritten
    // to `/control` before the layout ever sees it — a Library link silently
    // becoming Studio. Measured: that is exactly what happened.
    const app = readFileSync('src/App.tsx', 'utf8');
    const controlBlock = app.slice(app.indexOf('path="/control"'), app.indexOf('path="/output"'));
    expect(controlBlock).toContain('<Route index element={null} />');
    expect(controlBlock).toContain('<Route path="*" element={null} />');
  });

  it('is the only owner — the children match, they do not redirect', () => {
    // The index and catch-all children exist to make the layout match; the
    // redirecting is ControlPage's, so no <Navigate> belongs in this block.
    const app = readFileSync('src/App.tsx', 'utf8');
    const controlBlock = app.slice(app.indexOf('path="/control"'), app.indexOf('path="/output"'));
    expect(controlBlock).not.toContain('Navigate');
  });
});
