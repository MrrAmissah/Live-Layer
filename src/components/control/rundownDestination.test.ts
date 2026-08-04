import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noActiveRundownMessage, rundownDestination } from './rundownDestination';

/**
 * The studio has a Rundown workspace; the dock has no workspace navigation and
 * keeps its rundown manager under Library → Rundowns. A shared surface that
 * names one of them is wrong for half the operators — which is precisely what
 * happened when the studio copy was corrected in a component the dock mounts.
 */
describe('rundown destination follows the layout', () => {
  it('names a place that exists in each layout', () => {
    expect(rundownDestination('studio')).toBe('the Rundown workspace');
    expect(rundownDestination('dock')).toBe('Library → Rundowns');
  });

  it('never offers the studio wording to the dock, or the reverse', () => {
    expect(noActiveRundownMessage('dock')).toContain('Library → Rundowns');
    expect(noActiveRundownMessage('dock')).not.toContain('workspace');
    expect(noActiveRundownMessage('studio')).toContain('Rundown workspace');
    expect(noActiveRundownMessage('studio')).not.toContain('Library →');
  });
});

describe('shared surfaces ask which layout they are in', () => {
  const presetControls = readFileSync('src/components/control/PresetControls.tsx', 'utf8');

  it('PresetControls takes a surface instead of hardcoding a destination', () => {
    // It is mounted by BOTH layouts, so a literal here is always wrong somewhere.
    expect(presetControls).toContain('noActiveRundownMessage(surface)');
    expect(presetControls).not.toContain('the Rundown workspace');
    expect(presetControls).not.toContain('Library → Rundowns');
  });

  it('the dock mount says it is the dock', () => {
    const dock = readFileSync('src/components/control/LibraryControls.tsx', 'utf8');
    expect(dock).toContain('<PresetControls surface="dock" />');
  });

  it('studio-only and dock-only surfaces may still speak for themselves', () => {
    // These mount in exactly one layout, so a literal is correct there.
    expect(readFileSync('src/components/control/StudioRundownPanel.tsx', 'utf8')).toContain('Rundown</strong> workspace');
    expect(readFileSync('src/components/control/RundownQueue.tsx', 'utf8')).toContain('Library → Rundowns');
  });
});
