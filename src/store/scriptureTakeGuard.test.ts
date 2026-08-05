import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveLayerStore } from './useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import { resolveGraphicReadiness } from '../lib/graphicReadiness';
import { createMessage, publishCommand } from '../lib/realtime';
import type { GraphicInstance } from '../types/graphics';

/**
 * The publish-path gate, exercised as the rule ControlPage applies rather than
 * through the component — this repo's vitest runs in node with no DOM.
 *
 * `publishShow` is reproduced here ONLY as far as the ordering under test: gate,
 * then publish, then mark. The ordering itself is asserted against the real
 * source in `graphicReadiness.test.ts`, so this cannot drift into testing a copy
 * of the rule while the real one changes — the two checks fail for different
 * reasons.
 */

/** A channel whose post succeeds. `publishCommand` expects a PublishResult, not a boolean. */
const okChannel = () => ({ post: vi.fn(async () => ({ ok: true, transport: 'local' }) as const), close: vi.fn() });

function instance(values: Record<string, string>, templateId = 'scripture-card'): GraphicInstance {
  return {
    id: 'g1',
    templateId,
    values,
    theme: {},
    durationSeconds: 6,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

/** The gate as `publishShow` applies it, with the side effects observable. */
async function attemptTake(graphic: GraphicInstance, channel: Parameters<typeof publishCommand>[0]) {
  const readiness = resolveGraphicReadiness(graphic.templateId, graphic.values);
  if (!readiness.ready) return { published: false, reason: readiness.reason };

  const { markProgramShowing } = useLiveLayerStore.getState();
  const message = createMessage('SHOW_GRAPHIC', graphic);
  const result = await publishCommand(channel, message);
  if (result.ok) {
    markProgramShowing({ snapshot: graphic, commandId: message.id, source: { sourceType: 'draft', sourceId: null } });
  }
  return { published: result.ok, reason: '' };
}

beforeEach(() => {
  useLiveLayerStore.setState({ program: { ...CLEAR_PROGRAM_STATE }, quickQueue: [], recent: [] });
});

const VALID = { reference: 'John 3:16', verseText: 'For God so loved the world.', translationLabel: 'WEB' };

describe('a Scripture graphic that would fabricate content cannot air', () => {
  it.each([
    ['an empty draft', {}],
    ['a reference with no verse text', { reference: 'John 3:16' }],
    ['verse text with no reference', { verseText: 'For God so loved the world.' }]
  ])('%s is refused, and nothing is published', async (_label, values) => {
    const channel = okChannel();
    const outcome = await attemptTake(instance(values), channel as never);

    expect(outcome.published).toBe(false);
    expect(outcome.reason.length).toBeGreaterThan(10);
    // Nothing reached the wire — the refusal is not a failed send.
    expect(channel.post).not.toHaveBeenCalled();
  });

  it('leaves Program byte-identical when it refuses', async () => {
    const before = useLiveLayerStore.getState().program;
    const channel = okChannel();

    await attemptTake(instance({}), channel as never);

    // Reference identity, not value equality: a same-value rewrite would pass
    // `toEqual` while still having replaced the object.
    expect(useLiveLayerStore.getState().program).toBe(before);
    expect(useLiveLayerStore.getState().program.status).toBe('clear');
    expect(useLiveLayerStore.getState().recent).toHaveLength(0);
  });

  it('does not disturb a graphic already on air', async () => {
    // The worst version of this bug: a refused Take clearing or overwriting the
    // Program record of something genuinely live.
    const live = instance(VALID);
    const channel = okChannel();
    await attemptTake(live, channel as never);
    const airborne = useLiveLayerStore.getState().program;
    expect(airborne.status).toBe('showing');

    await attemptTake(instance({}), channel as never);
    expect(useLiveLayerStore.getState().program).toBe(airborne);
    expect(useLiveLayerStore.getState().program.status).toBe('showing');
  });

  it('airs a valid Scripture graphic', async () => {
    const channel = okChannel();
    const outcome = await attemptTake(instance(VALID), channel as never);

    expect(outcome.published).toBe(true);
    expect(channel.post).toHaveBeenCalled();
    expect(useLiveLayerStore.getState().program.status).toBe('showing');
  });

  it('airs a valid rundown or queue item unchanged', async () => {
    // Queue/rundown items are the same shape and go through the same gate.
    const channel = okChannel();
    const queued = { ...instance(VALID), id: 'q-1' };
    expect((await attemptTake(queued, channel as never)).published).toBe(true);
  });

  it('does not gate other templates', async () => {
    const channel = okChannel();
    const bare = instance({}, 'preacher-lower-third');
    expect((await attemptTake(bare, channel as never)).published).toBe(true);
  });
});
