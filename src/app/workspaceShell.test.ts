import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The studio is an application frame: it occupies the viewport once and never
 * grows, and its columns scroll inside it. That contract lives in CSS, so it is
 * asserted against the stylesheet — the browser pass in the PR covers the
 * rendered result, and these guard the rules that produce it.
 */
const css = readFileSync('src/styles.css', 'utf8')
  // Comments are stripped first: several of these rules explain in prose the very
  // constants they no longer use, and an absence check must not read the story.
  .replace(/\/\*[\s\S]*?\*\//g, '');

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
  selectors: match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/\s+/g, ' '))
    .filter(Boolean),
  body: match[2]
}));

/** Every declaration written for a selector, across all the rules that name it. */
const declarationsFor = (selector: string): string =>
  rules
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
