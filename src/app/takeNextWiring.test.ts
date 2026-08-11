import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const controlPage = read('src/app/ControlPage.tsx');
const liveActions = read('src/components/control/LiveActions.tsx');

/**
 * Take Next is the second control in this app that can put a graphic on air, and
 * the first that CHOOSES which one. These pin the properties that make that safe
 * — the ones a refactor could quietly drop while every unit test stayed green,
 * because they are about wiring rather than about a pure function.
 */

describe('Take Next goes through the one publish boundary', () => {
  const handler = controlPage.slice(
    controlPage.indexOf('const onTakeNext'),
    controlPage.indexOf('const onClear')
  );

  it('exists and is not empty', () => {
    expect(handler.length).toBeGreaterThan(200);
  });

  it('publishes through publishShow, not a channel of its own', () => {
    expect(handler).toContain('publishShow(');
    // A second createMessage/publishCommand path would be a second Take.
    expect(handler).not.toContain('createMessage(');
    expect(handler).not.toContain('publishCommand(');
  });

  it('runs inside runCommand, so it shares the one in-flight guard', () => {
    // Without this, a slow relay plus a held shortcut sends the whole rundown.
    expect(handler).toMatch(/=>\s*runCommand\(async \(\) => \{/);
    // …and the publish is inside it, not merely alongside it.
    expect(handler.indexOf('runCommand(')).toBeLessThan(handler.indexOf('publishShow('));
  });

  it('re-decides its target at press time rather than trusting a rendered cue', () => {
    expect(handler).toContain('planTakeNext(');
    expect(handler).toContain('getRundown(');
  });

  it('advances BOTH cursors, and only after the command is out', () => {
    // The selection must move or the next press repeats this item; activeItemId
    // must move because this is now what was last sent. Both belong inside the
    // success branch — a cursor that moved without a graphic going out is a
    // cursor lying about where the operator is.
    expect(handler).toMatch(/if \(await publishShow\([\s\S]*?\)\) \{[\s\S]*?setSelectedItem\([\s\S]*?setActiveItem\([\s\S]*?\}/);
  });

  it('never marks an item done, so an aired item stays reachable', () => {
    expect(handler).not.toContain('toggleItemDone');
    expect(handler).not.toContain('done:');
  });

  it('does nothing at all when the plan refuses', () => {
    expect(handler).toMatch(/if \(!plan\.item\) return;/);
  });
});

describe('the shortcut cannot become a second decision', () => {
  it('is bound once, at the container that owns the handler', () => {
    expect(controlPage).toContain("window.addEventListener('keydown'");
    expect(controlPage).toContain('isTakeNextShortcut(');
    // Reached through a ref, so re-creating onTakeNext each render cannot
    // detach and re-attach the listener mid-service.
    expect(controlPage).toContain('onTakeNextRef.current()');
  });

  it('binds no shortcut to Take or Clear', () => {
    // Every extra keyboard route to air is another way to air by accident.
    const listener = controlPage.slice(controlPage.indexOf("window.addEventListener('keydown'") - 700);
    expect(listener).not.toMatch(/onTake\(\)|onClear\(\)/);
  });
});

describe('the surfaces cannot disagree with the decision', () => {
  it('renders the cue and the button from the same plan', () => {
    expect(liveActions).toContain('takeNext.disabled');
    expect(liveActions).toContain('takeNextCue');
    // The cue element IS the button's stated cause, so they cannot drift.
    expect(liveActions).toMatch(/aria-describedby=\{`take-next-cue-\$\{surface\}`\}/);
  });

  it('offers Take Next only while a rundown is running', () => {
    // In draft mode there is no "next"; a permanently dead control teaches the
    // operator to ignore one they will need later.
    expect(liveActions).toMatch(/const showTakeNext = rundownActive && Boolean\(onTakeNext\)/);
  });

  it('never re-implements the handler', () => {
    expect(liveActions).not.toContain('planTakeNext');
    expect(liveActions).not.toContain('setSelectedItem');
  });

  it('keeps Take and Clear adjacent, with progression below them', () => {
    // Clear is the control muscle memory must find mid-service; inserting Take
    // Next between the pair would move it.
    expect(liveActions.indexOf('onClick={onClear}')).toBeLessThan(liveActions.indexOf('onClick={onTakeNext}'));
  });
});
