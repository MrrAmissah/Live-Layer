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
  library: read('src/app/workspaces/LibraryWorkspace.tsx')
};

describe('workspace routing', () => {
  it('nests the workspaces inside the control layout route', () => {
    expect(app).toMatch(/path="\/control"\s+element={<ControlPage/);
    for (const path of ['studio', 'rundown', 'library']) {
      expect(app, path).toContain(`path="${path}"`);
    }
    // Library keeps its sections addressable, so a link can point at People.
    expect(app).toContain('path="library/:section"');
  });

  it('keeps /control working by sending it to a real workspace', () => {
    // An index route, not a dead layout with an empty outlet.
    expect(app).toMatch(/<Route index element={<Navigate to="\/control\/studio" replace/);
  });

  it('sends an unknown /control/* path somewhere real instead of blank', () => {
    const controlBlock = app.slice(app.indexOf('path="/control"'), app.indexOf('path="/output"'));
    expect(controlBlock).toMatch(/path="\*"\s+element={<Navigate to="\/control\/studio"/);
  });

  it('leaves the reserved Scripture route unlinked', () => {
    expect(app).toContain('path="/scripture"');
    // Still not in the nav: a nav entry lands with the feature.
    expect(read('src/components/control/StudioNav.tsx')).not.toContain('/scripture');
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
  const dockBar = read('src/components/control/StickyLiveBar.tsx');
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
    // `/control/library/rundowns` matches the dynamic route before the wildcard,
    // so rendering a default there left the address bar wrong and every section
    // link inactive — content and navigation disagreeing about where you are.
    const library = read('src/app/workspaces/LibraryWorkspace.tsx');
    expect(library).toMatch(/if \(!isSection\(section\)\) return <Navigate to="\/control\/library\/saved" replace/);
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
    for (const file of [
      'src/components/control/StudioRundownPanel.tsx',
      'src/components/control/PresetControls.tsx'
    ]) {
      expect(read(file), file).not.toContain('Library → Rundowns');
    }
    expect(read('src/components/control/StudioRundownPanel.tsx')).toMatch(/Rundown<\/strong> workspace/);
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
