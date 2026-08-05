import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCanonicalControlPath, resolveLegacyScripturePath, LIBRARY_SECTIONS } from './workspaces/controlPaths';

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

  it('corrects separators the router will not match', () => {
    // `filter(Boolean)` hides a doubled slash from the parser, but the router
    // does not ignore it: `library/:section` matched nothing and the workspace
    // rendered blank. Rebuild-and-compare catches these without a special case.
    expect(resolveCanonicalControlPath('/control/library//saved')).toBe('/control/library/saved');
    expect(resolveCanonicalControlPath('/control//rundown')).toBe('/control/rundown');
    expect(resolveCanonicalControlPath('/control//')).toBe('/control/studio');
    // A trailing slash alone is already normalised away before comparing.
    expect(resolveCanonicalControlPath('/control/studio/')).toBeNull();
    // `//control/...` is not under /control at all — the app's top-level
    // catch-all owns that, and this function correctly declines it.
    expect(resolveCanonicalControlPath('//control//studio')).toBeNull();
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

  it('carries the query and hash across the redirect', () => {
    // `/setup` hands out the LAN control URL as `/control?relay=…` and the
    // realtime channel reads that param when it is constructed. A path-only
    // redirect drops it, and because <Navigate> is a child its effect runs
    // BEFORE the channel effect — so the controller would come up with no relay
    // and its commands would never reach the remote output.
    expect(controlPage).toMatch(/to={{\s*pathname: canonical,\s*search: location\.search,\s*hash: location\.hash\s*}}/);
  });

  it('is the only owner — the children match, they do not redirect', () => {
    // The index and catch-all children exist to make the layout match; the
    // redirecting is ControlPage's, so no <Navigate> belongs in this block.
    const app = readFileSync('src/App.tsx', 'utf8');
    const controlBlock = app.slice(app.indexOf('path="/control"'), app.indexOf('path="/output"'));
    expect(controlBlock).not.toContain('Navigate');
  });
});

describe('the Scripture workspace is a canonical /control path', () => {
  it('treats /control/scripture as already canonical', () => {
    /**
     * The trap this pins. If `scripture` is missing from `WORKSPACES`, this
     * returns `/control/studio`, and because ControlPage renders that redirect
     * BEFORE it renders the outlet, the Scripture route element never mounts —
     * the URL silently becomes Studio with no error anywhere. `App.tsx` reads
     * like the route table, so the gate is easy to miss. It is exactly how a
     * Library link resolved to Studio at every width in the previous stage.
     */
    expect(resolveCanonicalControlPath('/control/scripture')).toBeNull();
  });

  it('normalises the malformed spellings the router will not match', () => {
    expect(resolveCanonicalControlPath('/control/scripture/')).toBeNull();
    expect(resolveCanonicalControlPath('/control//scripture')).toBe('/control/scripture');
    // Scripture has no sub-sections, so an extra segment is trimmed rather than
    // rendering a blank workspace.
    expect(resolveCanonicalControlPath('/control/scripture/anything')).toBe('/control/scripture');
  });
});

describe('the reserved /scripture URL redirects into the layout', () => {
  it('resolves the legacy top-level URL and its variants', () => {
    for (const path of ['/scripture', '/scripture/', '/scripture//', '/scripture/anything']) {
      expect(resolveLegacyScripturePath(path), path).toBe('/control/scripture');
    }
  });

  it('declines every other route, including the destination itself', () => {
    // Returning a value for /control/scripture would redirect it to itself.
    for (const path of ['/control/scripture', '/control', '/output', '/setup', '/', '/scriptures', '/scripture-x']) {
      expect(resolveLegacyScripturePath(path), path).toBeNull();
    }
  });

  it('carries search and hash, and replaces rather than pushes', () => {
    // Same reason as the /control redirect: /setup hands out `?relay=…`, and the
    // channel reads that param when it is constructed. `replace` so Back does not
    // bounce off the redirect.
    const redirect = readFileSync('src/app/ScriptureRedirect.tsx', 'utf8');
    expect(redirect).toMatch(
      /to={{\s*pathname: SCRIPTURE_WORKSPACE,\s*search: location\.search,\s*hash: location\.hash\s*}}/
    );
    expect(redirect).toContain('replace');
  });
});
