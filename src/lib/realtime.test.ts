import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMessage, postToRelay, publishCommand, type PublishResult } from './realtime';

const message = createMessage('CLEAR_ALL', {});

/** Stand-in for the relay-backed channel: post resolves to a PublishResult. */
const channelOf = (result: PublishResult | (() => Promise<PublishResult>)) => ({
  post: vi.fn(typeof result === 'function' ? result : async () => result)
});

afterEach(() => vi.restoreAllMocks());

describe('publishCommand — transport result is awaited, never assumed', () => {
  it('reports success for a local transport', async () => {
    const channel = channelOf({ ok: true, transport: 'local' });
    await expect(publishCommand(channel, message)).resolves.toEqual({ ok: true, transport: 'local' });
    expect(channel.post).toHaveBeenCalledTimes(1);
  });

  it('treats a missing channel as failure, not silent success', async () => {
    await expect(publishCommand(null, message)).resolves.toMatchObject({ ok: false, reason: 'no-channel' });
    await expect(publishCommand(undefined, message)).resolves.toMatchObject({ ok: false, reason: 'no-channel' });
  });

  it('reports success when the relay answers 2xx', async () => {
    const channel = channelOf({ ok: true, transport: 'relay' });
    const result = await publishCommand(channel, message);
    expect(result).toEqual({ ok: true, transport: 'relay' });
  });

  it('reports failure when the relay answers non-2xx', async () => {
    const channel = channelOf({ ok: false, transport: 'relay', reason: 'http', detail: 'Relay responded 502' });
    const result = await publishCommand(channel, message);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'http' });
  });

  it('reports failure when the relay fetch rejects', async () => {
    const channel = channelOf({ ok: false, transport: 'relay', reason: 'network', detail: 'Failed to fetch' });
    await expect(publishCommand(channel, message)).resolves.toMatchObject({ ok: false, reason: 'network' });
  });

  it('reports failure when the relay times out', async () => {
    const channel = channelOf({ ok: false, transport: 'relay', reason: 'timeout' });
    await expect(publishCommand(channel, message)).resolves.toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('converts a thrown transport into a failure result', async () => {
    const channel = { post: vi.fn(async () => { throw new Error('boom'); }) };
    const result = await publishCommand(channel, message);
    expect(result.ok).toBe(false);
    expect(channel.post).toHaveBeenCalledTimes(1); // no retry
  });

  it('sends exactly one post per command', async () => {
    const channel = channelOf({ ok: true, transport: 'relay' });
    await publishCommand(channel, message);
    await publishCommand(channel, message);
    expect(channel.post).toHaveBeenCalledTimes(2); // one per call, never doubled
    expect(channel.post).toHaveBeenNthCalledWith(1, message);
  });
});

/** Exercises the real relay implementation, not a stand-in. */
describe('postToRelay — the actual relay transport', () => {
  const ok = (status = 200) => ({ ok: status >= 200 && status < 300, status }) as Response;

  it('succeeds on HTTP 200 and issues exactly one POST', async () => {
    const fetchImpl = vi.fn(async () => ok(200));
    const result = await postToRelay('http://lan:4174', message, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: true, transport: 'relay' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://lan:4174/message');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).id).toBe(message.id);
  });

  it('fails on a non-2xx response and does not retry', async () => {
    const fetchImpl = vi.fn(async () => ok(502));
    const result = await postToRelay('http://lan:4174', message, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false, transport: 'relay', reason: 'http' });
    expect((result as { detail: string }).detail).toContain('502');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails when fetch rejects (relay down / CORS / network drop)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await postToRelay('http://lan:4174', message, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false, transport: 'relay', reason: 'network' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails with a timeout when the relay never answers', async () => {
    // Honour the abort signal the way fetch does, so the bound is real.
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );
    const result = await postToRelay('http://lan:4174', message, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20
    });
    expect(result).toMatchObject({ ok: false, transport: 'relay', reason: 'timeout' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

/**
 * The caller contract these results exist to protect: Program / Recent /
 * rundown-cursor / clear transitions happen only on ok:true. Modelled here
 * against the same decision the ControlPage handlers make.
 */
describe('failed publish must not transition operator state', () => {
  const applyTake = async (channel: Parameters<typeof publishCommand>[0]) => {
    const state = { program: 'clear' as string, recent: 0, rundownCursor: null as string | null };
    const result = await publishCommand(channel, message);
    if (result.ok) {
      state.program = 'showing';
      state.recent += 1;
      state.rundownCursor = 'item-1';
    }
    return state;
  };

  it('leaves Program, Recent and the rundown cursor untouched after a relay failure', async () => {
    const state = await applyTake(channelOf({ ok: false, transport: 'relay', reason: 'http' }));
    expect(state).toEqual({ program: 'clear', recent: 0, rundownCursor: null });
  });

  it('advances them only on success', async () => {
    const state = await applyTake(channelOf({ ok: true, transport: 'relay' }));
    expect(state).toEqual({ program: 'showing', recent: 1, rundownCursor: 'item-1' });
  });

  it('leaves the previous Program state intact when Clear fails', async () => {
    let program = 'showing';
    const result = await publishCommand(channelOf({ ok: false, transport: 'relay', reason: 'timeout' }), message);
    if (result.ok) program = 'clear';
    expect(program).toBe('showing');
  });
});
