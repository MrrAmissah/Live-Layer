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
  liveTab: read('src/components/control/DockLiveTab.tsx'),
  editTab: read('src/components/control/DockQuickEditTab.tsx')
};
const liveActions = read('src/components/control/LiveActions.tsx');
// Queue surfaces render the ALLOWED per-row LIVE marker (a record of our own
// command), so they take the honesty checks separately — see below.
const queue = read('src/components/control/RundownQueue.tsx');
const queueTab = read('src/components/control/DockQueueTab.tsx');
const css = read('src/styles.css');

describe('an item association is not an acknowledgement', () => {
  /**
   * `activeItemId` is the rundown item behind our last successful command. It is
   * not output acknowledgement — messaging is one-way — so no dock surface may
   * turn it into a claim that the item is on air.
   */
  const dockQueues = [
    ['DockQueueTab', read('src/components/control/DockQueueTab.tsx')],
    ['RundownQueue', read('src/components/control/RundownQueue.tsx')]
  ] as const;

  it('labels the marked row LAST SENT, never an on-air claim', () => {
    for (const [name, source] of dockQueues) {
      const code = stripComments(source);
      expect(code, `${name} must mark the row`).toMatch(/rd-sent">LAST SENT</);
      // The banned vocabulary, in the forms a JSX text node can take.
      for (const claim of [/['"`>]LIVE\b/, /['"`>]ON AIR\b/i, /['"`>]On air\b/, /['"`>]PROGRAM</]) {
        expect(code, `${name}: ${claim}`).not.toMatch(claim);
      }
    }
  });

  it('drives the marker from the item id, not from Program confirmation', () => {
    // The marker must not be wired to a confirmation field — there is none to read.
    for (const [name, source] of dockQueues) {
      const code = stripComments(source);
      expect(code, name).toMatch(/activeItemId|liveItemId|isLive/);
      expect(code, `${name} must not read a confirmation`).not.toMatch(/confirmation/);
    }
  });
});

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

  it('dropped the meta grid but kept the disclosures (stage 2b)', () => {
    // "Status: …" duplicated the chip and "Canvas 1920 × 1080" printed a
    // constant — 60px of chrome carrying no information. Gone.
    expect(files.strip).not.toContain('1920 × 1080');
    expect(files.strip).not.toContain('__meta');
    expect(files.strip).not.toContain('__rule');
    // The honest sentences are the reason the strip is trustworthy — they stay.
    expect(files.strip).toContain('Reloaded — can’t confirm what output is showing');
    expect(files.strip).toContain('Command didn’t send — output may still show the previous graphic');
  });

  it('drives the status chip colour off the real status, never hardcoded green', () => {
    expect(files.strip).toContain('data-status={program.status}');
    const chipRules = css.match(/\.dock-program__chip\[data-status='\w+'\]/g) ?? [];
    // All four Program statuses have their own treatment.
    expect(new Set(chipRules).size).toBe(4);
  });
});

describe('the header event switcher (stage 2b)', () => {
  it('routes every pack change through the shared destructive-switch guard', () => {
    // A pack switch re-seeds the draft and can destroy unsaved edits. The
    // header dropdown is one tap away, so it MUST go through the same
    // usePackSwitchGuard as the studio's CommandBar — and never call
    // setActivePack itself, which would bypass the confirmation.
    expect(files.header).toContain('usePackSwitchGuard');
    expect(files.header).toMatch(/requestPackChange\(event\.target\.value\)/);
    expect(stripComments(files.header)).not.toContain('setActivePack');
  });

  it('replaced the event block rather than duplicating it', () => {
    // The 56px full-bleed EVENT block is gone from the header, and the
    // footer's copy of the pack name went with it.
    expect(files.header).not.toContain('dock-event');
    expect(files.footer).not.toContain('getPack');
    expect(files.footer).not.toContain('__pack');
  });

  it('polls the relay once in the shell and shares it with header and footer', () => {
    // Header dot and footer line are the same reading — two useRelayStatus
    // mounts would double the probe traffic against the relay.
    expect(files.shell).toContain('useRelayStatus()');
    expect(files.header).not.toContain('useRelayStatus(');
    expect(files.footer).not.toContain('useRelayStatus(');
    expect(files.shell).toContain('<DockHeader relay={relay} />');
    expect(files.shell).toContain('<DockFooter relay={relay} />');
  });
});

describe('the compact-strip preference (stage 2b)', () => {
  it('is honoured by the strip and persisted under a livelayer key', () => {
    // The strip reads the flag NOW so stage 3's More-tab toggle cannot ship
    // dead (the exact failure mode that got the mockup's toggle cut in
    // stage 1: a control wired to nothing).
    expect(files.strip).toContain('useDockPrefs');
    expect(files.strip).toContain('compactProgramStrip');
    expect(files.strip).toContain('dock-program--compact');
    const storage = read('src/lib/storage.ts');
    expect(storage).toContain("dockPrefs: 'livelayer.dockPrefs'");
    // Strict opt-in: a malformed record must fall back to the regular strip.
    expect(storage).toContain('raw.compactProgramStrip === true');
  });

  it('is no longer a per-tab variant — one strip geometry on every tab', () => {
    expect(files.shell).not.toContain('variant=');
    expect(files.strip).not.toMatch(/'tall'/);
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
    for (const [name, source] of Object.entries({ queue, queueTab })) {
      expect(source, name).not.toContain('<LiveActions');
      expect(source, name).not.toMatch(/className="take-btn/);
    }
  });
});

describe('the blocked-Take reason survives (issue #22)', () => {
  it('is still rendered by the shared LiveActions the strip mounts', () => {
    expect(files.strip).toContain('<LiveActions');
    // The reason must be RENDERED conditionally on itself — not merely
    // computed, and not gated on anything else.
    expect(liveActions).toMatch(/\{notReadyReason \? \(\s*<p className="live-actions__blocked"/);
    expect(liveActions).toMatch(/\{notReadyReason\}/);
    // And the dock grid gives the reason its own full-width row BELOW the
    // buttons (grid-row 2): the reason may appear and disappear, and under
    // the buttons is the one place it can do that without moving Take out
    // from under the operator's pointer (stage 2b fixed-height contract).
    expect(css).toMatch(/\.dock-program__actions \.live-actions__blocked\s*\{[^}]*grid-row: 2/);
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
    expect(queue).toMatch(/isLive \? <span className="rd-sent">LAST SENT<\/span>/);
  });
});

describe('the Queue tab (stage 2)', () => {
  it('renders LIVE only as the per-row command marker, and stays honest otherwise', () => {
    const code = stripComments(queueTab);
    /**
     * No carve-out any more. This used to allow one LIVE — the row marker for the
     * item behind our last command — on the grounds that it meant something
     * narrower than the Program strip's banned claim. That was the same
     * unverifiable assertion in a smaller typeface: `activeItemId` records what we
     * SENT, and an operator reading LIVE on a row has been told OBS confirmed it.
     * The row now says LAST SENT, which stays true after a reload, through an
     * unverified state, and while a previous item remains the last success.
     */
    expect(code).toContain('LAST SENT');
    expect(code).toContain('activeItemId');
    expect(code).not.toMatch(/['"`>]LIVE\b/);
    expect(code).not.toMatch(/['"`>]ON AIR\b/i);
    expect(code).not.toMatch(/['"`>]PROGRAM<\//);
    expect(code.toLowerCase()).not.toContain('fps');
    expect(code).not.toContain('Online');
    expect(code).not.toContain('OBS');
    expect(code).not.toMatch(/['"`]Confirmed/);
  });

  it('gives the selected item Preview and Edit — and deliberately NO Take', () => {
    // The mockup draws a TAKE in the selected-action bar; the Program strip
    // already owns the dock's single Take, so none is built here.
    expect(queueTab).toContain('onPreviewSelected');
    expect(queueTab).toContain('onEditSelected');
    expect(stripComments(queueTab)).not.toMatch(/['"`>]Take\b/i);
  });

  it('reorders with explicit ±1 moves, never a drag handle', () => {
    expect(queueTab).toContain('moveItemUp');
    expect(queueTab).toContain('moveItemDown');
    expect(queueTab).not.toContain('draggable');
    expect(queueTab).not.toContain('dragHandle');
  });

  it('searches through the shared filter (behaviour in dockQueueEdit.test.ts)', () => {
    expect(queueTab).toContain('filterRundownItems(items, query)');
  });

  it('surfaces the item-cap refusal instead of swallowing it', () => {
    // addItem returns undefined at MAX_ITEMS_PER_RUNDOWN; every add path
    // routes its result through the guard, which says so out loud.
    expect(queueTab).toContain('MAX_ITEMS_PER_RUNDOWN');
    expect(queueTab).toContain('Rundown is full');
    expect(stripComments(queueTab)).toMatch(/if \(!added\) flash\(/);
  });

  it('surfaces the rundown-cap refusal from the picker too', () => {
    expect(queueTab).toContain('MAX_RUNDOWNS');
    expect(stripComments(queueTab)).toMatch(/if \(!created\) \{/);
  });
});

describe('the Quick Edit tab (stage 2)', () => {
  const editCode = stripComments(files.editTab);

  it('edits through useEditTarget only — the path that never touches Program', () => {
    expect(files.editTab).toContain('useEditTarget');
    expect(editCode).not.toContain('markProgram');
    expect(editCode).not.toContain('publishCommand');
    expect(editCode).not.toContain('SHOW_GRAPHIC');
  });

  it('builds no second Take and no fake buffered-save model', () => {
    // The mockup's action row (Discard / Save to queue item / Save & Take) is
    // omitted: writes persist as you type, so a Save/Discard would simulate a
    // buffer that does not exist, and Save & Take would be a second Take.
    expect(editCode).not.toContain('Save & Take');
    expect(editCode).not.toContain('Save to queue item');
    expect(editCode).not.toContain('Discard');
    // The real model is stated instead.
    expect(files.editTab).toContain('Changes save to this queue item as you type');
  });

  it('refuses to edit the hidden draft while a rundown is active with no selection', () => {
    expect(editCode).toMatch(/rd\.activeRundown && !target\.isRundownItem/);
    expect(files.editTab).toContain('No queue item selected');
  });

  it('ships the two brand swatches, not the mockup’s three', () => {
    // colorText is Design's (see useBrandReset) — a third chip would either
    // write a field Brand doesn't own or be decorative.
    expect(editCode.match(/<Swatch/g)).toHaveLength(2);
    expect(editCode).toContain('BRAND_SWATCHES.main');
    expect(editCode).toContain('BRAND_SWATCHES.accent');
    expect(editCode).not.toContain('colorText');
  });

  it('labels the reset for what it does — the pack-seed brand reset, not Design’s', () => {
    expect(files.editTab).toContain('useBrandReset');
    expect(files.editTab).toContain('Reset to pack colours');
    expect(editCode).not.toContain('Reset palette');
  });

  it('reuses the shared preview-only notice verbatim', () => {
    expect(files.editTab).toContain('<DraftPreviewNote />');
    expect(read('src/components/control/DraftPreviewNote.tsx')).toContain(
      'Editing updates preview only — changes go live when you press Take.'
    );
  });

  it('keeps the studio link on the same origin with the query preserved', () => {
    // A configured relay lives in the query; dropping it would hand the
    // operator a studio that publishes nowhere.
    expect(editCode).toContain('`/control/studio${location.search}`');
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
