import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Wiring guards for output→control acknowledgement and cross-client Program
 * sync — source-level, like the rest of this repo's structural tests (node
 * environment, no DOM). The behaviour rules live in `lib/programSync.test.ts`;
 * this file pins that the pages actually USE them, because the original defect
 * was exactly a wiring hole: `createRealtimeChannel(() => undefined)` threw
 * away every inbound message, so a studio Take never reached the dock and no
 * acknowledgement could ever land.
 */
const read = (path: string) => readFileSync(path, 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const controlPage = read('src/app/ControlPage.tsx');
const outputPage = read('src/app/OutputPage.tsx');

describe('control receives (the bug that started this stage)', () => {
  it('no longer discards inbound messages', () => {
    expect(stripComments(controlPage)).not.toContain('createRealtimeChannel(() => undefined)');
  });

  it('routes every inbound message through the tested reducer via the store', () => {
    expect(controlPage).toContain('applyRealtimeMessage(message)');
    expect(read('src/store/useLiveLayerStore.ts')).toContain('reduceRealtimeMessage(');
  });

  it('records Clear as pending with the command id the acknowledgement must match', () => {
    expect(controlPage).toContain('markProgramClearing({ commandId })');
    expect(stripComments(controlPage)).not.toContain('markProgramClear()');
  });
});

describe('output acknowledges at the commit point', () => {
  it('receives through the receive-only channel, never the control transport', () => {
    expect(outputPage).toContain("from '../lib/outputChannel'");
    expect(outputPage).not.toMatch(/from ['"][^'"]*lib\/realtime['"]/);
    expect(stripComments(outputPage)).not.toContain('createRealtimeChannel');
  });

  it('sends OUTPUT_APPLIED only after the prepared graphic is committed for rendering', () => {
    const code = stripComments(outputPage);
    // Both the prepared path and the documented asset-fallback path: commit
    // first (setShowing(true)), acknowledge after.
    const commits = code.match(/setShowing\(true\);\s*ackApplied\(\);/g) ?? [];
    expect(commits).toHaveLength(2);
    // A superseded request is never acknowledged — the guard precedes both acks.
    const staleGuards = code.match(/if \(showRequestId\.current !== requestId\) return;/g) ?? [];
    expect(staleGuards.length).toBeGreaterThanOrEqual(2);
  });

  it('answers CLEAR/HIDE with OUTPUT_CLEARED carrying that command id', () => {
    expect(outputPage).toContain("createOutputEvent('OUTPUT_CLEARED'");
    expect(outputPage).toMatch(/OUTPUT_CLEARED',\s*\{\s*commandId: message\.id/);
  });

  it('reports an unrenderable template as OUTPUT_FAILED with a reason', () => {
    expect(outputPage).toContain("createOutputEvent('OUTPUT_FAILED'");
    expect(outputPage).toContain('is not available in this build');
  });

  it('heartbeats at the shared conservative cadence with the OBS reading attached', () => {
    expect(outputPage).toContain("createOutputEvent('OUTPUT_STATUS'");
    expect(outputPage).toContain('OUTPUT_HEARTBEAT_MS');
    expect(outputPage).toContain('subscribeObsSourceState');
  });
});

describe('the vocabulary stays in one place', () => {
  it('no control component hardcodes the new claims — programStatus.ts owns them', () => {
    const dir = 'src/components/control';
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.tsx')) continue;
      const code = stripComments(read(`${dir}/${name}`));
      for (const claim of ['OUTPUT READY', 'OUTPUT ACTIVE', 'SOURCE INACTIVE', 'Output page applied']) {
        if (code.includes(claim)) offenders.push(`${name}: ${claim}`);
      }
    }
    expect(offenders).toEqual([]);
    // Positive anchor: the claims do exist, exactly where they belong.
    const vocabulary = read('src/lib/programStatus.ts');
    for (const claim of ['OUTPUT READY', 'OUTPUT ACTIVE', 'SOURCE INACTIVE']) {
      expect(vocabulary).toContain(claim);
    }
  });

  it('every Program surface passes the output reading and a live clock to the vocabulary', () => {
    for (const path of [
      'src/components/control/DockProgramStrip.tsx',
      'src/components/control/ProgramRail.tsx',
      'src/components/control/StudioLiveBar.tsx'
    ]) {
      const source = read(path);
      expect(source, path).toMatch(/describeProgramStatus\(program, output(Status)?, now\)/);
      // Awake surfaces: staleness is derived from `now`, so a surface that
      // never ticks would leave OUTPUT ACTIVE latched after OBS closes.
      expect(source, path).toContain('useTicks(programClockMs(program, Date.now()))');
    }
  });
});
