import { describe, expect, it, vi } from 'vitest';
import { createOutputEvent, getOutputSessionId, sendOutputEvent } from './outputAck';
import type { OutputEventMessage } from '../types/graphics';

/**
 * The output surface's one transmitter. Two properties carry the design:
 * it can only construct OUTPUT_* events, and NOTHING that goes wrong while
 * reporting may reach the render path — no throw, no await, no retry storm.
 * (The construction constraint is also enforced at build time by
 * check-output-isolation.mjs; these tests pin the runtime behaviour.)
 */

const applied = (): OutputEventMessage =>
  createOutputEvent('OUTPUT_APPLIED', {
    commandId: 'cmd-1',
    outputId: getOutputSessionId(),
    graphicId: 'g-1'
  });

describe('createOutputEvent', () => {
  it('stamps a fresh id and timestamp on a typed OUTPUT_* envelope', () => {
    const a = applied();
    const b = applied();
    expect(a.type).toBe('OUTPUT_APPLIED');
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
    expect(Number.isFinite(a.timestamp)).toBe(true);
  });

  it('keeps one output session id for the page lifetime', () => {
    expect(getOutputSessionId()).toBe(getOutputSessionId());
    expect(getOutputSessionId().length).toBeGreaterThan(0);
  });
});

describe('sendOutputEvent — fire-and-forget, failure-tolerant', () => {
  it('reports locally AND to the relay when one is configured', () => {
    const postLocal = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const event = applied();
    sendOutputEvent(event, { postLocal, relayUrl: 'http://lan:4174', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(postLocal).toHaveBeenCalledWith(event);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://lan:4174/message');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).type).toBe('OUTPUT_APPLIED');
  });

  it('reports locally and skips the network entirely without a relay', () => {
    const postLocal = vi.fn();
    const fetchImpl = vi.fn();
    sendOutputEvent(applied(), { postLocal, relayUrl: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(postLocal).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns void — nothing for the render path to await', () => {
    const result = sendOutputEvent(applied(), { postLocal: () => undefined, relayUrl: null });
    expect(result).toBeUndefined();
  });

  it('never throws when the relay fetch rejects', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('relay is down')));
    expect(() =>
      sendOutputEvent(applied(), {
        postLocal: () => undefined,
        relayUrl: 'http://lan:4174',
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).not.toThrow();
    // Let the rejection settle: an unhandled rejection would fail the suite.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('never throws when the fetch implementation itself throws synchronously', () => {
    const fetchImpl = (() => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    expect(() =>
      sendOutputEvent(applied(), { postLocal: () => undefined, relayUrl: 'http://lan:4174', fetchImpl })
    ).not.toThrow();
  });

  it('never throws when the local channel throws', () => {
    expect(() =>
      sendOutputEvent(applied(), {
        postLocal: () => {
          throw new Error('channel closed');
        },
        relayUrl: null
      })
    ).not.toThrow();
  });

  it('sends exactly one request per event — no retry can duplicate a report', () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('down')));
    sendOutputEvent(applied(), {
      postLocal: () => undefined,
      relayUrl: 'http://lan:4174',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('getting the report out of a browser with no sockets left', () => {
  /**
   * THE FAULT THIS ANSWERS, read off `/output?debug=1` on the rig:
   *
   *     last send: failed   detail: no answer in 4000ms
   *     sent ok: 0 · failed: 5
   *
   * while the SSE stream on the SAME origin kept delivering and a curl POST
   * from the same machine answered 202. Chromium allows six connections per
   * host; OBS's browser sources share one socket pool; every source holds an
   * EventSource open to the relay for the whole service. Five or six of them
   * exhaust the pool, and every POST then queues behind connections that never
   * close until our own abort fires.
   */
  const beaconEvent = () =>
    createOutputEvent('OUTPUT_APPLIED', {
      commandId: 'cmd-1',
      outputId: getOutputSessionId(),
      graphicId: 'g-1',
      templateId: 'preacher-lower-third'
    }) as OutputEventMessage;

  it('hands the report to the beacon path instead of the page’s socket pool', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('Blob', class { constructor(public parts: unknown[], public opts: { type: string }) {} });
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}')));

    sendOutputEvent(beaconEvent(), { postLocal: () => undefined, relayUrl: 'http://lan:4174' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    // And it did NOT also take a socket.
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uses a CORS-safelisted content type, so no preflight takes a SECOND socket', () => {
    /**
     * `application/json` is not safelisted, so every ack was really two
     * requests — the preflight and the POST — against a pool that had none to
     * give. The relay parses the body and never inspects the header.
     */
    const seen: { type?: string } = {};
    vi.stubGlobal('navigator', { sendBeacon: () => true });
    vi.stubGlobal(
      'Blob',
      class {
        constructor(_parts: unknown[], opts: { type: string }) {
          seen.type = opts.type;
        }
      }
    );
    sendOutputEvent(beaconEvent(), { postLocal: () => undefined, relayUrl: 'http://lan:4174' });
    expect(seen.type).toMatch(/^text\/plain/);
    vi.unstubAllGlobals();

    // The fetch fallback carries the same rule.
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}')));
    sendOutputEvent(beaconEvent(), {
      postLocal: () => undefined,
      relayUrl: 'http://lan:4174',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['content-type']).toMatch(/^text\/plain/);
  });

  it('falls back to the socket path rather than dropping a refused beacon', () => {
    // `sendBeacon` returns false when it will not take the payload. Losing the
    // report there would be worse than the queueing it was meant to avoid.
    vi.stubGlobal('navigator', { sendBeacon: () => false });
    vi.stubGlobal('Blob', class { constructor(public p: unknown[], public o: { type: string }) {} });
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}')));
    sendOutputEvent(beaconEvent(), {
      postLocal: () => undefined,
      relayUrl: 'http://lan:4174',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
