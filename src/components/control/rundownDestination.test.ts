import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noActiveRundownMessage, rundownDestination } from './rundownDestination';

/**
 * The studio has a Rundown workspace; the dock has no ROUTER navigation (it
 * renders no outlet) — it navigates by tabs, and its rundown manager is the
 * Queue tab. A shared surface that names one layout's destination is wrong for
 * half the operators — which is precisely what happened when the studio copy
 * was corrected in a component the dock mounts, and again when the dock's
 * Library tab was retired while the dock wording still said "Library →
 * Rundowns". The invariant under test: each layout is told a place that
 * exists IN THAT LAYOUT, and never the other's.
 */
describe('rundown destination follows the layout', () => {
  it('names a place that exists in each layout', () => {
    expect(rundownDestination('studio')).toBe('the Rundown workspace');
    expect(rundownDestination('dock')).toBe('the Queue tab');
  });

  it('never offers the studio wording to the dock, or the reverse', () => {
    expect(noActiveRundownMessage('dock')).toContain('Queue tab');
    expect(noActiveRundownMessage('dock')).not.toContain('workspace');
    // The retired dock destination must never come back either.
    expect(noActiveRundownMessage('dock')).not.toContain('Library');
    expect(noActiveRundownMessage('studio')).toContain('Rundown workspace');
    expect(noActiveRundownMessage('studio')).not.toContain('Queue tab');
  });
});

describe('shared surfaces ask which layout they are in', () => {
  const presetControls = readFileSync('src/components/control/PresetControls.tsx', 'utf8');

  it('PresetControls takes a surface instead of hardcoding a destination', () => {
    // It is mounted by BOTH layouts, so a literal here is always wrong somewhere.
    expect(presetControls).toContain('noActiveRundownMessage(surface)');
    expect(presetControls).not.toContain('the Rundown workspace');
    expect(presetControls).not.toContain('the Queue tab');
  });

  it('the dock mount says it is the dock', () => {
    const dock = readFileSync('src/components/control/LibraryControls.tsx', 'utf8');
    expect(dock).toContain('<PresetControls surface="dock" />');
  });

  it('studio-only and dock-only surfaces may still speak for themselves', () => {
    // These mount in exactly one layout, so a literal is correct there.
    expect(readFileSync('src/components/control/StudioRundownPanel.tsx', 'utf8')).toContain('Rundown</strong> workspace');
    expect(readFileSync('src/components/control/RundownQueue.tsx', 'utf8')).toContain('the Queue tab');
    expect(readFileSync('src/components/control/RundownQueue.tsx', 'utf8')).not.toContain('Library → Rundowns');
  });
});
