import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The redesigned dock operator shell (stage 1: shell + tabs + Program strip +
 * Live tab). Two families of guarantee, both asserted against source because
 * this repo's vitest runs in node with no DOM:
 *
 *  1. HONESTY. This app's messaging is one-way — control publishes, output
 *     renders, and no acknowledgement path exists. The dock therefore may not
 *     claim "LIVE" as a Program status, print an fps it has no source for,
 *     report "Online", or name an OBS connection it cannot verify. Every
 *     status word must come from `lib/programStatus.ts`.
 *
 *  2. ONE TAKE. Exactly one live-actions surface mounts in the dock tree —
 *     the pinned Program strip — with the blocked-Take reason still rendered
 *     (issue #22: a Take that silently no-ops).
 */
const read = (path: string) => readFileSync(path, 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const files = {
  shell: read('src/components/control/DockShell.tsx'),
  tabbar: read('src/components/control/DockTabBar.tsx'),
  header: read('src/components/control/DockHeader.tsx'),
  footer: read('src/components/control/DockFooter.tsx'),
  strip: read('src/components/control/DockProgramStrip.tsx'),
  liveTab: read('src/components/control/DockLiveTab.tsx')
};
const liveActions = read('src/components/control/LiveActions.tsx');
const queue = read('src/components/control/RundownQueue.tsx');
const css = read('src/styles.css');

describe('the tab set', () => {
  it('is exactly the four expected ids, in order', () => {
    const ids = [...files.tabbar.matchAll(/\{ id: '(\w+)'/g)].map((match) => match[1]);
    expect(ids).toEqual(['live', 'queue', 'edit', 'more']);
    expect(files.tabbar).toContain("export type DockTab = 'live' | 'queue' | 'edit' | 'more'");
  });

  it('encodes the tone split as data, not as a per-tab class', () => {
    // One render path reads the tone off the tab record…
    expect(files.tabbar).toContain('data-tone={tab.tone}');
    expect(files.tabbar).not.toMatch(/data-tone="(live|config)"/);
    // …the split itself is live+queue vs edit+more…
    expect(files.tabbar.match(/tone: 'live'/g)).toHaveLength(2);
    expect(files.tabbar.match(/tone: 'config'/g)).toHaveLength(2);
    // …and the CSS keys the active indicator off the same attribute. Green
    // never recolours the label (no `color` in the live rule); config does.
    const liveRule = /\.dock-tab\[data-tone='live'\]\[aria-current\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const configRule = /\.dock-tab\[data-tone='config'\]\[aria-current\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    // `(?<![-\w])color:` matches the standalone property, not the `color:`
    // inside `border-bottom-color:`.
    expect(liveRule).toContain('border-bottom-color');
    expect(liveRule).not.toMatch(/(?<![-\w])color:/);
    expect(configRule).toContain('border-bottom-color');
    expect(configRule).toMatch(/(?<![-\w])color:/);
  });
});

describe('the Program strip is honest', () => {
  it('takes every status word from lib/programStatus.ts', () => {
    // Presence anchors: the vocabulary source and the real clock source.
    expect(files.strip).toContain('describeProgramStatus');
    expect(files.strip).toContain('takenAt');
  });

  it('never claims what the app cannot know', () => {
    for (const [name, source] of Object.entries(files)) {
      const code = stripComments(source);
      // No confident on-air claim. (The per-queue-row LIVE marker in
      // RundownQueue is different and allowed: it records our own command.)
      expect(code, `${name}: LIVE`).not.toMatch(/['"`>]LIVE\b/);
      // No fps — the app has no fps source anywhere.
      expect(code.toLowerCase(), `${name}: fps`).not.toContain('fps');
      // No "Online" — nothing reads navigator.onLine, and internet
      // reachability says nothing about whether output renders.
      expect(code, `${name}: Online`).not.toContain('Online');
      expect(code, `${name}: navigator.onLine`).not.toContain('navigator.onLine');
      // No claimed OBS connection — there is no way to verify one.
      expect(code, `${name}: OBS`).not.toContain('OBS');
      // 'confirmed' is never written anywhere in this codebase's UI copy.
      expect(code, `${name}: Confirmed`).not.toMatch(/['"`]Confirmed/);
    }
  });

  it('words the 1920×1080 row as the authoring canvas, not a measured output', () => {
    expect(files.strip).toContain('1920 × 1080');
    expect(files.strip).toContain('Canvas');
    expect(files.strip).not.toContain('Output resolution');
  });

  it('drives the status chip colour off the real status, never hardcoded green', () => {
    expect(files.strip).toContain('data-status={program.status}');
    const chipRules = css.match(/\.dock-program__chip\[data-status='\w+'\]/g) ?? [];
    // All four Program statuses have their own treatment.
    expect(new Set(chipRules).size).toBe(4);
  });
});

describe('exactly one Take in the dock tree', () => {
  it('mounts one Program strip, above the per-tab content', () => {
    expect(files.shell.match(/<DockProgramStrip/g)).toHaveLength(1);
  });

  it('mounts only the active tab (an OBS dock shares CPU with an encoder)', () => {
    for (const tab of ['live', 'queue', 'edit', 'more']) {
      expect(files.shell).toContain(`tab === '${tab}' ?`);
    }
  });

  it('lets no dock surface but the strip render live actions', () => {
    expect(files.strip.match(/<LiveActions/g)).toHaveLength(1);
    for (const [name, source] of Object.entries(files)) {
      if (name === 'strip') continue;
      expect(source, name).not.toContain('<LiveActions');
      expect(source, name).not.toMatch(/className="take-btn/);
    }
    expect(queue).not.toContain('<LiveActions');
    expect(queue).not.toMatch(/className="take-btn/);
  });
});

describe('the blocked-Take reason survives (issue #22)', () => {
  it('is still rendered by the shared LiveActions the strip mounts', () => {
    expect(files.strip).toContain('<LiveActions');
    // The reason must be RENDERED conditionally on itself — not merely
    // computed, and not gated on anything else.
    expect(liveActions).toMatch(/\{notReadyReason \? \(\s*<p className="live-actions__blocked"/);
    expect(liveActions).toMatch(/\{notReadyReason\}/);
    // And the dock grid gives the reason its own full-width row.
    expect(css).toMatch(/\.dock-program__actions \.live-actions__blocked\s*\{[^}]*grid-column: 1 \/ -1/);
  });
});

describe('the dock queue promises only what the store can do', () => {
  it('reorders with explicit up/down, never a drag handle', () => {
    // moveItem is a ±1 adjacent swap; a drag handle would promise
    // drop-anywhere reordering the store cannot perform.
    expect(queue).toContain('moveItemUp');
    expect(queue).toContain('moveItemDown');
    expect(queue).not.toContain('dragHandle');
    expect(queue).not.toContain('draggable');
  });

  it('keeps the LIVE row marker meaning "the item we last commanded"', () => {
    expect(queue).toContain('activeItemId');
    expect(queue).toMatch(/isLive \? <span className="rd-live">LIVE<\/span>/);
  });
});

describe('dock-scoped tokens', () => {
  it('overrides live/danger/shadow/radius inside the dock only', () => {
    const dockRoot = /\.control-root--dock\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(dockRoot).toContain('--ll-live: #22bb44');
    expect(dockRoot).toContain('--ll-danger: #fd3837');
    expect(dockRoot).toContain('--ll-shadow-panel: none');
    // The surface-wide tokens are untouched (studio and /output keep mint/rose).
    const controlRoot = /\.control-root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(controlRoot).toContain('--ll-live: #36e27a');
    expect(controlRoot).toContain('--ll-danger: #f43f5e');
    expect(controlRoot).toContain('--ll-blue: #2f95f8');
  });

  it('retires cyan within the dock block', () => {
    // The dock section runs from its banner comment to the first stage anchor.
    const start = css.indexOf('dock operator shell');
    const end = css.indexOf('/* == dock: queue tab ==');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const dockCss = css.slice(start, end);
    expect(dockCss).not.toContain('34, 211, 238'); // --ll-accent cyan rgb
    expect(dockCss).not.toContain('22d3ee');
  });
});
