import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withUrlState, linkTo } from './navigateTo';

/**
 * Issue #19. Audited on the merge base: **1 of 8** navigations in the control
 * surface preserved `search`. `/setup` hands operators a LAN URL shaped
 * `…/control?relay=host:port`, and `getRealtimeRelayUrl` reads that param when the
 * realtime channel is constructed.
 */

const loc = { search: '?relay=10.0.0.5%3A7071&foo=bar', hash: '#top' };

describe('withUrlState', () => {
  it('carries both search and hash onto a new pathname', () => {
    expect(withUrlState('/control/studio', loc)).toEqual({
      pathname: '/control/studio',
      search: '?relay=10.0.0.5%3A7071&foo=bar',
      hash: '#top'
    });
  });

  it('carries empty values through unchanged, rather than inventing them', () => {
    expect(withUrlState('/control/studio', { search: '', hash: '' })).toEqual({
      pathname: '/control/studio',
      search: '',
      hash: ''
    });
  });

  it('preserves ?relay=off, which is the ONLY way to clear a stored relay', () => {
    // `realtime.ts` persists a valid relay on first sight and falls back to it,
    // so dropping the param does not clear it — an explicit `off` does. A helper
    // that silently discarded search would make the escape hatch unreachable.
    const cleared = withUrlState('/control/studio', { search: '?relay=off', hash: '' });
    expect(cleared).toMatchObject({ search: '?relay=off' });
  });

  it('linkTo is the same rule, for NavLink/Link', () => {
    expect(linkTo('/control/library/saved', loc)).toEqual(withUrlState('/control/library/saved', loc));
  });
});

describe('every control-surface navigation carries URL state', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('leaves no bare-string navigate() in the control surface', () => {
    /**
     * The literal shape of the original defect. `navigate('/control/...')` drops
     * search and hash; the helper form does not.
     */
    for (const file of [
      'src/app/ControlPage.tsx',
      'src/components/control/FieldEditor.tsx'
    ]) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/navigate\('\/control[^']*'\)/);
      // Presence anchor: it still navigates, via the helper.
      expect(code, file).toContain('withUrlState(');
    }
  });

  it('routes the workspace switcher and the library sub-nav through linkTo', () => {
    // These are the primary NavLinks; both dropped search on the merge base.
    expect(read('src/components/control/StudioNav.tsx')).toContain('linkTo(workspace.to, location)');
    expect(read('src/app/workspaces/LibraryWorkspace.tsx')).toMatch(/linkTo\(`\/control\/library\/\$\{entry\.id\}`, location\)/);
  });

  it('makes the top-level catch-all carry search — the one unrecoverable case', () => {
    /**
     * Every other site drops the param AFTER `getRealtimeRelayUrl` has persisted
     * it, so the session and a reload survive on the stored value. An unmatched
     * URL is different: nothing has read it yet, so rewriting the path first
     * loses it before anything could store it, and a fresh profile comes up with
     * no relay at all. Reachable by a hand-shortened `/?relay=…` or a stale
     * bookmark.
     */
    const app = read('src/App.tsx');
    expect(app).not.toMatch(/<Navigate to="\/control" replace \/>/);
    expect(app).toContain('<CatchAllRedirect />');

    const redirect = read('src/app/CatchAllRedirect.tsx');
    expect(redirect).toContain('withUrlState(DEFAULT_WORKSPACE, location)');
    // `replace`, so Back does not trap on the redirect.
    expect(redirect).toContain('replace');
  });

  it('does not memoize the editor navigation against a stale location', () => {
    /**
     * `openGraphicInEditor` reads `search` and `hash` through `withUrlState`, so
     * depending on `pathname` alone leaves it holding a stale location whenever
     * only the query changes while the route stays mounted. The bad case is real:
     * with the URL changed to `?relay=off`, a stale closure navigates carrying the
     * OLD `?relay=host:port` and silently restores a relay the operator just
     * turned off — the exact error this helper exists to prevent.
     */
    const controlPage = read('src/app/ControlPage.tsx');
    const handler = controlPage.slice(
      controlPage.indexOf('const openGraphicInEditor'),
      controlPage.indexOf('const onTakeInstance')
    );
    expect(handler).toContain('[navigate, location]');
    expect(handler).not.toContain('[navigate, location.pathname]');
  });

  it('keeps the two canonical redirects preserving search, as they already did', () => {
    // Regression guard: these were the 1-of-8 that were already right.
    expect(read('src/app/ControlPage.tsx')).toMatch(
      /to={{\s*pathname: canonical,\s*search: location\.search,\s*hash: location\.hash\s*}}/
    );
    expect(read('src/app/ScriptureRedirect.tsx')).toMatch(
      /to={{\s*pathname: SCRIPTURE_WORKSPACE,\s*search: location\.search,\s*hash: location\.hash\s*}}/
    );
  });
});
