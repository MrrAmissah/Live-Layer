import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  probeRelay,
  resolveRelayTransition,
  relayHost,
  type RelayStatusShape
} from './relayReadiness';

/**
 * PR #23's exact-head P2. `useRelayStatus` resolved the relay only inside an
 * effect keyed on `[pollMs, fetchImpl]`. The control layout stays mounted across
 * navigation, so changing `?relay=` had no effect until a full reload:
 *
 *  - the old relay kept being polled;
 *  - the old badge kept showing;
 *  - and because the persistence side effects live inside `getRealtimeRelayUrl`
 *    (clear on `off`, write on valid), **the stored relay was never cleared**.
 *
 * The transition rule and the generation guard are tested here; that the hook
 * actually depends on `location.search` is asserted at the bottom, because a
 * perfect rule wired to nothing is still the same bug.
 */

const A = 'http://10.0.0.5:4174';
const B = 'http://10.0.0.9:4174';
const readyA: RelayStatusShape = { connection: 'ready', host: relayHost(A), detail: '' };

const relayBody = { ok: true, clients: 1, hasLastMessage: false };
const jsonRes = (body: unknown, init: { ok?: boolean; status?: number; type?: string } = {}) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => init.type ?? 'application/json' },
    clone: () => ({ json: async () => body })
  }) as unknown as Response;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('the pre-probe transition', () => {
  it('goes straight to local when the relay is turned off', () => {
    // ?relay=off must not sit on a stale `ready` while a doomed probe finishes.
    const next = resolveRelayTransition(readyA, null);
    expect(next).toEqual({ connection: 'local', host: null, detail: '' });
  });

  it('shows checking against the NEW host when the relay changes', () => {
    const next = resolveRelayTransition(readyA, B);
    expect(next.connection).toBe('checking');
    expect(next.host).toBe('10.0.0.9:4174');
    // The old target's `ready` must never appear beside the new host label.
    expect(next.host).not.toBe(relayHost(A));
  });

  it('leaves an unchanged relay alone, so an unrelated search change does not flash', () => {
    // Re-running on `?foo=bar` must not blink `checking` at an operator mid-service.
    expect(resolveRelayTransition(readyA, A)).toBe(readyA);
  });

  it('moves from local to checking when a relay is configured', () => {
    const local: RelayStatusShape = { connection: 'local', host: null, detail: '' };
    expect(resolveRelayTransition(local, A)).toEqual({ connection: 'checking', host: relayHost(A), detail: '' });
  });

  it('treats a first render with no previous state as checking', () => {
    expect(resolveRelayTransition(null, A).connection).toBe('checking');
    expect(resolveRelayTransition(null, null).connection).toBe('local');
  });
});

describe('a stale probe cannot overwrite a newer relay', () => {
  it('discards A’s response once the generation has moved on', async () => {
    /**
     * Genuinely interleaved: A's probe is started, the generation advances (as it
     * would when the effect re-runs for B or for `off`), and only THEN does A
     * resolve. Written sequentially the guard never engages and this passes with
     * it deleted — proven at the bottom of this file.
     */
    const slow = deferred<Response>();
    let current = 1;
    const pending = probeRelay(A, {
      fetchImpl: (async () => slow.promise) as unknown as typeof fetch,
      isCurrent: () => current === 1
    });

    current = 2; // switched to B, or to off
    slow.resolve(jsonRes(relayBody));

    await expect(pending).resolves.toBeNull();
  });

  it('discards a stale FAILURE too, so an old outage cannot mark a good relay down', async () => {
    const slow = deferred<Response>();
    let current = 1;
    const pending = probeRelay(A, {
      fetchImpl: (async () => {
        await slow.promise;
        throw new TypeError('refused');
      }) as unknown as typeof fetch,
      isCurrent: () => current === 1
    });
    current = 2;
    slow.resolve(jsonRes(null));
    await expect(pending).resolves.toBeNull();
  });

  it('applies a result that is still current, and reports the probed host', async () => {
    const next = await probeRelay(B, {
      fetchImpl: (async () => jsonRes(relayBody)) as unknown as typeof fetch,
      isCurrent: () => true
    });
    expect(next).toEqual({ connection: 'ready', host: '10.0.0.9:4174', detail: '' });
  });

  it('classifies honestly through the probe path — malformed and false-positive cases hold', async () => {
    const ports = (res: Response | null) => ({
      fetchImpl: (async () => {
        if (!res) throw new TypeError('refused');
        return res;
      }) as unknown as typeof fetch,
      isCurrent: () => true
    });

    // The SPA-fallback false positive: 200, but HTML.
    const html = await probeRelay(A, ports(jsonRes(null, { type: 'text/html' })));
    expect(html?.connection).toBe('not-relay');

    // Nothing listening.
    const dead = await probeRelay(A, ports(null));
    expect(dead?.connection).toBe('unreachable');

    // A malformed relay URL still probes and reports honestly rather than throwing.
    const malformed = await probeRelay('not-a-url', ports(null));
    expect(malformed?.connection).toBe('unreachable');
    expect(malformed?.host).toBeNull();
  });
});

describe('the hook is wired to the URL, not to a global read', () => {
  const hook = readFileSync('src/hooks/useRelayStatus.ts', 'utf8');
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('depends on location.search, so a URL change recomputes the configuration', () => {
    // The literal defect: an effect that could not see the URL change.
    expect(code).toContain("const { search } = useLocation()");
    expect(code).toMatch(/\}, \[pollMs, injectedFetch, search\]\)/);
    expect(code).not.toMatch(/\}, \[pollMs, injectedFetch\]\)/);
  });

  it('reads the router location rather than window.location', () => {
    // An untracked global read is invisible to React and would be stale again.
    expect(code).not.toContain('window.location');
  });

  it('re-resolves the relay inside the effect, which is what applies ?relay=off', () => {
    // The clear-on-off side effect lives in getRealtimeRelayUrl, so it has to be
    // CALLED again — not cached from the initial render.
    const body = code.slice(code.indexOf('useEffect'), code.indexOf('return status'));
    expect(body).toContain('getRealtimeRelayUrl()');
    expect(body).toContain('resolveRelayTransition');
  });

  it('bumps the generation on cleanup, so a pending probe cannot land after a switch', () => {
    const cleanup = code.slice(code.indexOf('return () => {'), code.indexOf('return status'));
    expect(cleanup).toContain('generation.current += 1');
    expect(cleanup).toContain('clearInterval');
  });

  it('creates exactly one interval per effect run', () => {
    // A duplicate interval per render would multiply the poll rate against a
    // service that rate-limits.
    expect(code.match(/setInterval/g)?.length).toBe(1);
    expect(code.match(/clearInterval/g)?.length).toBe(1);
  });

  it('sets the transition before probing, not after', () => {
    // Anchored on the effect CALL, not the `useEffect` import, which also
    // contains the word and would slice in the import block.
    const body = code.slice(code.indexOf('useEffect(() =>'));
    const transitionAt = body.indexOf('resolveRelayTransition');
    const probeAt = body.indexOf('probeRelay');
    expect(transitionAt).toBeGreaterThan(-1);
    expect(probeAt).toBeGreaterThan(-1);
    expect(transitionAt).toBeLessThan(probeAt);
  });
});

describe('the probe calls fetch as a function, not as a method', () => {
  it('does not invoke fetchImpl off the ports object', () => {
    /**
     * `ports.fetchImpl(...)` invokes the real `fetch` as a METHOD of `ports`, so
     * `this` is that object and the browser throws "Illegal invocation" — every
     * probe then failed as `unreachable`, including against a healthy relay.
     * No unit test could catch it: a plain-function fake does not care about
     * `this`. It was found in the browser, and this pins the fix.
     */
    const source = readFileSync('src/lib/relayReadiness.ts', 'utf8');
    const body = source.slice(source.indexOf('export async function probeRelay'));
    expect(body).toContain('const { fetchImpl } = ports;');
    expect(body).not.toMatch(/await ports\.fetchImpl\(/);
  });

  it('rejects a this-sensitive fetch if the call shape regresses', async () => {
    // A fake that behaves like the real `fetch`: it refuses a foreign `this`.
    function strictFetch(this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(jsonRes(relayBody));
    }
    const next = await probeRelay(A, {
      fetchImpl: strictFetch as unknown as typeof fetch,
      isCurrent: () => true
    });
    expect(next?.connection).toBe('ready');
  });
});
