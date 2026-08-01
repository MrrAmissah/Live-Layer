import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The studio is an application frame: it occupies the viewport once and never
 * grows, and its columns scroll inside it. That contract lives in CSS, so it is
 * asserted against the stylesheet — the browser pass in the PR covers the
 * rendered result, and these guard the rules that produce it.
 */
const rawCss = readFileSync('src/styles.css', 'utf8')
  // Comments are stripped first: several of these rules explain in prose the very
  // constants they no longer use, and an absence check must not read the story.
  .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Split top-level rules from at-rule blocks.
 *
 * The previous helper ran one flat regex over the whole sheet, which had two
 * measured failure modes: the FIRST rule nested in an `@media` block was
 * swallowed (its selector was eaten by the at-rule prelude), and every
 * SUBSEQUENT nested rule leaked into the base bucket — so a frame rule that
 * became conditional on a breakpoint still satisfied a base-layer assertion.
 * Both were reproduced before this was rewritten.
 */
function splitBlocks(css: string): { base: string; atRules: Array<{ prelude: string; body: string }> } {
  const atRules: Array<{ prelude: string; body: string }> = [];
  let base = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@', i);
    if (at === -1) {
      base += css.slice(i);
      break;
    }
    base += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) break;
    // Walk to the matching brace so nested rules stay with their at-rule.
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    atRules.push({ prelude: css.slice(at, open).trim(), body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return { base, atRules };
}

const { base: baseCss, atRules } = splitBlocks(rawCss);

const rulesOf = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    selectors: match[1]
      .split(',')
      .map((entry) => entry.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
    body: match[2]
  }));

/** Declarations for a selector at the TOP level only — no at-rule leakage. */
const declarationsFor = (selector: string): string =>
  rulesOf(baseCss)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');

/**
 * Declarations for a selector across EVERY at-rule block with this prelude —
 * a stylesheet may state the same breakpoint more than once, and reading only
 * the first one silently misses whatever the later block says.
 */
const declarationsInAtRule = (preludeMatch: string, selector: string): string =>
  atRules
    .filter((rule) => rule.prelude.includes(preludeMatch))
    .flatMap((rule) => rulesOf(rule.body))
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');

describe('the studio frame is bounded', () => {
  it('occupies the viewport exactly once, and clips instead of growing', () => {
    const body = declarationsFor('.control-root--studio');
    // dvh for correctness, vh first as the fallback OBS CEF needs — the same
    // pair the dock frame already uses.
    expect(body).toMatch(/height:\s*100vh/);
    expect(body).toMatch(/height:\s*100dvh/);
    expect(body).toMatch(/overflow:\s*hidden/);
    expect(body).toMatch(/min-height:\s*0/);
  });

  it('the inner column fills that frame rather than asserting its own height', () => {
    const body = declarationsFor('.control-root--studio .control-inner');
    expect(body).toMatch(/height:\s*100%/);
    // The regression this replaces: a viewport-tall inner column beneath a 76px
    // command bar, which made the document grow with the queue.
    expect(body).not.toMatch(/min-height:\s*100vh/);
  });

  it('the grid measures the space the command bar leaves instead of hardcoding it', () => {
    const body = declarationsFor('.control-root .studio');
    expect(body).toMatch(/flex:\s*1/);
    expect(body).toMatch(/min-height:\s*0/);
    // Two constants for one bar (64px here, 76px on the bar) is the bug class.
    expect(body).not.toMatch(/calc\(100vh/);
  });

  it('all three columns scroll independently', () => {
    for (const column of ['studio__nav', 'studio__center', 'studio__rail']) {
      const body = declarationsFor(`.control-root .${column}`);
      expect(body, column).toMatch(/overflow-y:\s*auto/);
      expect(body, column).toMatch(/min-height:\s*0/);
    }
  });

  it('leaves the dock frame alone', () => {
    const dock = declarationsFor('.control-root--dock');
    expect(dock).toMatch(/height:\s*100dvh/);
    expect(dock).toMatch(/overflow:\s*hidden/);
  });

  it('keeps the reserved workspace bounded too', () => {
    const body = declarationsFor('.control-root .workspace-placeholder');
    expect(body).toMatch(/flex:\s*1/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });
});

describe('the layout boundary and the semantics around it are untouched', () => {
  it('still switches studio and dock at 1024px', () => {
    const controlPage = readFileSync('src/app/ControlPage.tsx', 'utf8');
    expect(controlPage).toContain("useMediaQuery('(min-width: 1024px)')");
  });

  it('still routes Take, Clear and the rundown through the same code paths', () => {
    const controlPage = readFileSync('src/app/ControlPage.tsx', 'utf8');
    // This PR is layout-only: the orchestrator keeps owning the realtime
    // channel and the take/clear decision.
    expect(controlPage).toContain('createRealtimeChannel');
    expect(controlPage).toContain('buildInstanceFromDraft');
    expect(controlPage).toContain('ControlShell');
    expect(controlPage).toContain('DockShell');
  });
});

describe('the reserved Scripture route stays provider-neutral', () => {
  const page = readFileSync('src/app/ScripturePage.tsx', 'utf8');

  it('is registered as its own route', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('path="/scripture"');
    expect(app).toContain('ScripturePage');
  });

  it('pulls in no AI, speech or quotation-detection dependency', () => {
    // The point of a placeholder is that nothing gets wired in by accident.
    for (const forbidden of [
      'openai',
      'anthropic',
      'whisper',
      'SpeechRecognition',
      'speechRecognition',
      'transcribe',
      'quotationDetect',
      'detectQuotation',
      'scriptureLookup'
    ]) {
      expect(page.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('does not link itself into the control surface yet', () => {
    const nav = readFileSync('src/components/control/StudioNav.tsx', 'utf8');
    expect(nav).not.toContain('/scripture');
  });
});

describe('the stacked studio at the breakpoint overlap', () => {
  /**
   * `ControlPage` picks the studio at `(min-width: 1024px)` and the stylesheet
   * stacks it at `(max-width: 1024px)`, so exactly 1024 gets a bounded frame
   * around a single-column stack. Something must own that overflow or the frame
   * clips Take and Program out of reach.
   */
  const studioRule = declarationsInAtRule('max-width: 1024px', '.control-root--studio .studio');

  it('exists at all — the overlap is real, not hypothetical', () => {
    expect(studioRule).not.toBe('');
  });

  it('gives the stack its own scrolling', () => {
    expect(studioRule).toMatch(/overflow-y:\s*auto/);
    // `height: auto` here fought the flex frame; the base rule sizes it now.
    expect(studioRule).not.toMatch(/height:\s*auto/);
  });

  it('lets each stacked region take its own height instead of a third of the frame', () => {
    // Scrolling alone was not enough: the grid had a fixed height to distribute,
    // so the regions were squeezed and their content spilled over each other.
    expect(studioRule).toMatch(/align-content:\s*start/);
    expect(studioRule).toMatch(/grid-auto-rows:\s*min-content/);
  });

  it('keeps each column out of the scrolling business, so nothing nests', () => {
    // Asserted per selector: a single match anywhere in the block would pass
    // even if one of the three columns had quietly regained a scroller.
    for (const column of ['studio__nav', 'studio__rail', 'studio__center']) {
      const rule = declarationsInAtRule('max-width: 1024px', `.control-root--studio .${column}`);
      expect(rule, column).toMatch(/overflow:\s*visible/);
    }
  });

  it('hands the live actions to the bar, so only one Take is in the tree', () => {
    // The rail's copy is display:none here; the bar is display:flex. Neither is
    // hidden with visibility/opacity, which would leave it in the a11y tree.
    const bar = declarationsInAtRule('max-width: 1024px', '.control-root--studio .studio-livebar');
    const railActions = declarationsInAtRule('max-width: 1024px', '.control-root--studio .program-rail__actions');
    expect(bar).toMatch(/display:\s*flex/);
    expect(railActions).toMatch(/display:\s*none/);
    // ...and above the breakpoint the bar is the hidden one.
    expect(declarationsFor('.control-root .studio-livebar')).toMatch(/display:\s*none/);
  });

  it('keeps the bar in the frame rather than over the content', () => {
    const bar = declarationsInAtRule('max-width: 1024px', '.control-root--studio .studio-livebar');
    // A flex row in the frame covers nothing, so no padding or scroll-padding
    // compensation is needed — and no z-index can put it over the pack dialog.
    expect(bar).toMatch(/flex:\s*none/);
    expect(bar).not.toMatch(/position:\s*(fixed|sticky|absolute)/);
  });
});

describe('the focus indicator is visible', () => {
  it('does not rely on a near-invisible ring after removing the outline', () => {
    // The base rule removes the native outline surface-wide, so the token has to
    // carry the whole indicator. A single low-alpha ring measured ~1.4:1 against
    // the panel it sits on — below what a focus indicator needs.
    const root = declarationsFor('.control-root');
    const token = /--ll-focus:\s*([^;]+);/.exec(root)?.[1] ?? '';
    expect(token).not.toBe('');
    const alphas = [...token.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\)/g)].map((m) => Number(m[1]));
    expect(Math.max(...alphas, 0)).toBeGreaterThan(0.5);
  });
});
