import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The control surface is a layout route with workspaces inside it. What matters
 * is not that the files exist but that the properties which made a single page
 * safe still hold once there are three URLs:
 *
 *  - exactly one owner of the realtime channel and the in-flight guard;
 *  - no workspace publishing anything;
 *  - old links still landing somewhere real.
 *
 * Asserted against source because this repo's vitest runs in node with no DOM —
 * the browser pass in the PR covers the rendered result.
 */
const read = (path: string) => readFileSync(path, 'utf8');

const app = read('src/App.tsx');
const controlPage = read('src/app/ControlPage.tsx');
const workspaces = {
  studio: read('src/app/workspaces/StudioWorkspace.tsx'),
  rundown: read('src/app/workspaces/RundownWorkspace.tsx'),
  library: read('src/app/workspaces/LibraryWorkspace.tsx'),
  // Every new workspace must be added here or the publish guard below silently
  // stops covering the surface it was written to cover.
  scripture: read('src/app/workspaces/ScriptureWorkspace.tsx')
};

describe('workspace routing', () => {
  it('nests the workspaces inside the control layout route', () => {
    expect(app).toMatch(/path="\/control"\s+element={<ControlPage/);
    for (const path of ['studio', 'rundown']) {
      expect(app, path).toContain(`path="${path}"`);
    }
    // Library keeps its sections addressable, so a link can point at People.
    expect(app).toContain('path="library/:section"');
  });

  it('canonicalises /control in the layout, so the dock gets it too', () => {
    // Redirect routes only run when the layout renders its outlet, and the dock
    // never does — canonicalPaths + ControlPage own this instead. The rules
    // themselves are asserted in controlPaths.test.ts.
    expect(controlPage).toContain('resolveCanonicalControlPath');
  });

  it('mounts Scripture as a workspace inside the layout, not as a sibling route', () => {
    // A top-level /scripture would sit outside ControlPage and so would need its
    // own channel and its own in-flight guard — two Takes that can race. The
    // reserved URL survives as a redirect instead.
    expect(app).toContain('path="scripture"');
    expect(app).toContain('<ScriptureWorkspace />');
    expect(app).toContain('path="/scripture"');
    expect(app).toContain('<ScriptureRedirect />');
    // The old placeholder page is gone: no empty room behind a linked feature.
    expect(app).not.toContain('ScripturePage');

    const controlBlock = app.slice(app.indexOf('path="/control"'), app.indexOf('path="/output"'));
    expect(controlBlock).toContain('path="scripture"');
  });

  it('leaves the dock untouched — deliberately, and consistently with every workspace', () => {
    /**
     * Below 1024px `ControlPage` returns `DockShell` before rendering its outlet,
     * so NO workspace route mounts there — measured at 820px, `/control/studio`,
     * `/control/rundown`, `/control/library/saved` and `/control/scripture` all
     * render the dock with one visible Take and nothing blank. Scripture is not a
     * special case, and rendering it ahead of the dock fallback would push the
     * desktop workspace into a ~380px tab strip.
     *
     * The dock's scripture entry point is the Quick Edit tab (a placeholder
     * until that stage lands — the redesigned dock never grows a scripture
     * ROUTE; it reaches scripture-card through the editor's own picker, which
     * inherits the strict parser and the error taxonomy).
     */
    const tabs = read('src/components/control/DockTabBar.tsx');
    const dock = read('src/components/control/DockShell.tsx');
    // Presence anchor: the dock's own tab set is still here and now four
    // (the operator redesign: Live · Queue · Quick Edit · More).
    expect(tabs).toContain('DockTab');
    expect(tabs).toContain("'live'");
    expect(tabs.toLowerCase()).not.toContain('scripture');
    expect(dock.toLowerCase()).not.toContain('scripture');
    // And the dock still renders no outlet, which is what makes the above true.
    expect(read('src/app/ControlPage.tsx')).toMatch(/if \(!isStudio\)[\s\S]{0,400}DockShell/);
  });

  it('links Scripture in the nav now that the feature exists', () => {
    // The inverse of the guard this replaces. That one asserted the nav did NOT
    // mention /scripture, which was right while the route was an empty placeholder
    // and would now hide a shipped workspace.
    const nav = read('src/components/control/StudioNav.tsx');
    expect(nav).toContain('/control/scripture');
    // Listed in the canonicaliser too, or ControlPage redirects to Studio before
    // the route element mounts — the failure mode has no error message.
    expect(read('src/app/workspaces/controlPaths.ts')).toContain("'scripture'");
  });
});

describe('one command owner', () => {
  it('keeps the channel, the take decision and the shell choice in the layout', () => {
    // The layout is the only thing mounted for every workspace, so it is the
    // only place a single in-flight guard can serialise commands.
    expect(controlPage).toContain('createRealtimeChannel');
    expect(controlPage).toContain('buildInstanceFromDraft');
    expect(controlPage).toContain('ControlShell');
    expect(controlPage).toContain('DockShell');
    expect(controlPage).toContain("useMediaQuery('(min-width: 1024px)')");
    expect(controlPage).toContain('sendingRef');
  });

  it('gives no workspace a way to publish', () => {
    for (const [name, source] of Object.entries(workspaces)) {
      expect(source, name).not.toContain('publishCommand');
      expect(source, name).not.toContain('createRealtimeChannel');
      expect(source, name).not.toContain('createMessage');
      expect(source, name).not.toContain('markProgram');
      expect(source, name).not.toContain('setActiveItem');
    }
  });

  it('routes every workspace through the layout for loading a graphic', () => {
    // The one handler that mutates the draft and navigates lives in the layout.
    expect(controlPage).toContain('openGraphicInEditor');
    expect(workspaces.studio).toContain('useWorkspace');
    expect(workspaces.library).toContain('useWorkspace');
  });
});

describe('live actions are one implementation', () => {
  const liveActions = read('src/components/control/LiveActions.tsx');
  const rail = read('src/components/control/ProgramRail.tsx');
  // The dock's one live-actions surface is now the pinned Program strip
  // (it replaced StickyLiveBar in the operator redesign).
  const dockBar = read('src/components/control/DockProgramStrip.tsx');
  const studioBar = read('src/components/control/StudioLiveBar.tsx');

  it('has every surface render the shared component', () => {
    for (const [name, source] of [
      ['rail', rail],
      ['dock bar', dockBar],
      ['studio bar', studioBar]
    ] as const) {
      expect(source, name).toContain('<LiveActions');
    }
  });

  it('leaves no surface with its own Take button', () => {
    for (const [name, source] of [
      ['rail', rail],
      ['dock bar', dockBar],
      ['studio bar', studioBar]
    ] as const) {
      // The className is the tell: only LiveActions may render one.
      expect(source, name).not.toMatch(/className="take-btn/);
      expect(source, name).not.toMatch(/className="clear-btn/);
    }
    expect(liveActions).toMatch(/take-btn/);
  });

  it('never confirms before airing — Take stays one click', () => {
    // Prose about Program confirmation is fine; a confirm *call* is not, so the
    // comments are stripped before looking.
    const code = liveActions.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bconfirm\s*\(/);
    expect(code).not.toMatch(/onClick={\s*\(\)\s*=>\s*setC/);
  });

  it('keeps the dock vocabulary out of the studio', () => {
    // "Update live" claims a state the studio cannot know; it is dock-only and
    // reaches LiveActions solely through the optional lastAction prop.
    expect(studioBar).not.toContain('lastAction');
    expect(rail).not.toContain('lastAction');
    expect(dockBar).toContain('lastAction');
  });

  it('keeps both guards on the take path', () => {
    // Button-level (disabled) and handler-level (the early return) — the first
    // is UX, the second is the safety.
    expect(liveActions).toContain('takeDisabled');
    expect(controlPage).toMatch(/if \(activeRundownId\)/);
  });
});

describe('corrections from review', () => {
  it('sends an invalid library section to a canonical URL instead of guessing', () => {
    // Rendering a default under `/control/library/rundowns` left the address bar
    // wrong and every section link inactive. The correction now lives with the
    // other canonical-path rules, so it applies to the dock as well — the
    // behaviour itself is asserted in controlPaths.test.ts.
    expect(controlPage).toContain('resolveCanonicalControlPath');
    const library = read('src/app/workspaces/LibraryWorkspace.tsx');
    expect(library).not.toContain('<Navigate');
  });

  it('points the skip link at whichever action set is visible', () => {
    // An anchor to a fixed wrapper reaches a display:none bar above 1024, where
    // the visible Take is in the rail — and a wrapper is not focusable anyway.
    const shell = read('src/components/control/ControlShell.tsx');
    expect(shell).toContain('focusLiveActions');
    expect(shell).toMatch(/getClientRects\(\)\.length > 0/);
    expect(shell).not.toContain('href="#live-actions"');
  });

  it('names a destination that exists in every studio recovery prompt', () => {
    // Rundown management moved out of Library, so "Library → Rundowns" became a
    // dead end for studio operators. The dock keeps its own Library tab.
    // StudioRundownPanel is studio-only, so it may name the workspace directly.
    // PresetControls is mounted by both layouts and therefore names neither —
    // see rundownDestination.test.ts.
    expect(read('src/components/control/StudioRundownPanel.tsx')).not.toContain('Library → Rundowns');
    expect(read('src/components/control/PresetControls.tsx')).toContain('noActiveRundownMessage(surface)');
    expect(read('src/components/control/StudioRundownPanel.tsx')).toMatch(/Rundown<\/strong> workspace/);
  });
});

describe('navigation does not pile up history', () => {
  it('only travels to Studio when it is somewhere else', () => {
    // Design presets and the queue's Edit both call this from inside Studio;
    // navigating to the URL you are already on pushes a duplicate entry and
    // Back stops appearing to work.
    // The travel now goes through `withUrlState` so it carries ?relay= — the
    // condition is what this test is about, and it must survive that change.
    expect(controlPage).toMatch(
      /if \(!location\.pathname\.startsWith\('\/control\/studio'\)\) navigate\(withUrlState\('\/control\/studio', location\)\)/
    );
  });

  it('still loads the graphic either way', () => {
    // The store write is unconditional — only the travel is conditional.
    const handler = controlPage.slice(controlPage.indexOf('const openGraphicInEditor'), controlPage.indexOf('const onTakeInstance'));
    expect(handler.indexOf('loadGraphicInstance')).toBeLessThan(handler.indexOf('location.pathname.startsWith'));
  });
});

describe('rundown management has one owner on screen', () => {
  const rail = read('src/components/control/ProgramRail.tsx');
  const panel = read('src/components/control/StudioRundownPanel.tsx');

  it('hands the editable list to the workspace that owns management', () => {
    // The rail rides along in every workspace, so without this an active rundown
    // rendered two independently scrolled editable copies of the same list.
    expect(rail).toContain("pathname.startsWith('/control/rundown')");
    expect(rail).toMatch(/<StudioRundownPanel showItems={!managingRundown}/);
  });

  it('keeps operation in the rail even when the list is elsewhere', () => {
    // Selected · live · next and Previous/Next are how a service is run; they
    // must not disappear with the list.
    const gated = panel.slice(panel.indexOf('{showItems ?'));
    expect(gated).toContain('rd-item-list');
    const alwaysOn = panel.slice(0, panel.indexOf('{showItems ?'));
    expect(alwaysOn).toContain('studio-rd__summary');
    expect(alwaysOn).toContain('Select previous rundown item');
    expect(alwaysOn).toContain('Select next rundown item');
  });

  it('defaults to showing the list, so no other caller loses it', () => {
    expect(panel).toMatch(/showItems = true/);
  });
});
