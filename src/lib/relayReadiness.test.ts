import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyRelayProbe, canAcceptCommands, type RelayProbe } from './relayReadiness';

/**
 * The bug this rule exists for, reproduced against the running app before it was
 * written (issue #20):
 *
 *   GET  127.0.0.1:4173/health  -> 200 text/html   (the dev server's SPA index)
 *   POST 127.0.0.1:4173/message -> 404
 *
 * The old check was `res.ok ? 'connected' : 'unreachable'`, so that read as
 * "Relay connected" while every command failed. Worse than an outage, because
 * `realtime.ts` returns the relay's answer and discards the successful local
 * delivery — the overlay shows the graphic while Program records FAILED.
 */

const probe = (over: Partial<RelayProbe> = {}): RelayProbe => ({
  ok: true,
  status: 200,
  contentType: 'application/json',
  body: { ok: true, clients: 0, hasLastMessage: false },
  ...over
});

describe('a real relay is the only thing reported ready', () => {
  it('accepts the relay’s own /health shape', () => {
    // Matches scripts/livelayer-lan-relay.mjs: { ok, clients, hasLastMessage }.
    expect(classifyRelayProbe(probe()).connection).toBe('ready');
    expect(classifyRelayProbe(probe()).detail).toBe('');
  });

  it('accepts a relay with clients attached', () => {
    expect(classifyRelayProbe(probe({ body: { ok: true, clients: 3, hasLastMessage: true } })).connection).toBe('ready');
  });
});

describe('the SPA-fallback false positive', () => {
  it('does NOT report ready for a 200 HTML body', () => {
    const verdict = classifyRelayProbe(probe({ contentType: 'text/html', body: null }));
    expect(verdict.connection).toBe('not-relay');
    // And it names the actual mistake, which is nearly always the port.
    expect(verdict.detail).toMatch(/port/i);
  });

  it('does not report ready for JSON that is not a relay', () => {
    // Some other service on that port answering 200 with JSON.
    for (const body of [{ ok: true }, { status: 'up' }, { ok: 'true', clients: 0 }, [], 'ok', 42]) {
      const verdict = classifyRelayProbe(probe({ body }));
      expect(verdict.connection, JSON.stringify(body)).toBe('not-relay');
    }
  });

  it('treats a missing content-type as not-a-relay rather than ready', () => {
    expect(classifyRelayProbe(probe({ contentType: null, body: null })).connection).toBe('not-relay');
  });
});

describe('failures are distinguished, not merged', () => {
  it('reports unreachable when nothing answered', () => {
    // A rejected fetch: refused connection, DNS, CORS, timeout.
    const verdict = classifyRelayProbe(null);
    expect(verdict.connection).toBe('unreachable');
    expect(verdict.detail).toMatch(/running/i);
  });

  it('reports unreachable, with the code, on a non-2xx', () => {
    for (const status of [404, 500, 502, 401]) {
      const verdict = classifyRelayProbe(probe({ ok: false, status }));
      expect(verdict.connection, String(status)).toBe('unreachable');
      expect(verdict.detail).toContain(String(status));
    }
  });

  it('never reports ready for anything that is not a verified relay', () => {
    const notReady: RelayProbe[] = [
      probe({ ok: false, status: 404 }),
      probe({ contentType: 'text/html', body: null }),
      probe({ body: { ok: false, clients: 0 } }),
      probe({ body: null })
    ];
    for (const p of notReady) expect(classifyRelayProbe(p).connection).not.toBe('ready');
    expect(classifyRelayProbe(null).connection).not.toBe('ready');
  });
});

describe('only ready or local can accept a command', () => {
  it.each([
    ['ready', true],
    ['local', true],
    ['checking', false],
    ['not-relay', false],
    ['unreachable', false]
  ] as const)('%s -> %s', (connection, expected) => {
    expect(canAcceptCommands(connection)).toBe(expected);
  });
});

describe('the header cannot say connected for a non-relay', () => {
  it('has no label that claims a connection, and one label per state', () => {
    const bar = readFileSync('src/components/control/CommandBar.tsx', 'utf8');
    // The old wording is gone; `ready` is the only positive claim.
    expect(bar).not.toContain("'Relay connected'");
    expect(bar).toContain("ready: 'Relay ready'");
    expect(bar).toContain("'not-relay': 'Not a relay'");
    // Presence anchor: the reason is rendered, not just computed.
    expect(bar).toContain('relay.detail');
  });

  it('reports the verdict rather than inferring it from res.ok', () => {
    const hook = readFileSync('src/hooks/useRelayStatus.ts', 'utf8');
    // The hook delegates the probe AND the classification to `probeRelay`, so it
    // has no opportunity to invent a verdict of its own.
    expect(hook).toContain('probeRelay');
    expect(hook).toContain('resolveRelayTransition');
    // The exact shape of the original bug must not come back.
    expect(hook).not.toMatch(/res\.ok \? 'connected'/);
    expect(hook).not.toMatch(/connection: res\.ok/);
    // A non-JSON body is the signal, so it must not be swallowed as unreachable.
    // That now lives in probeRelay.
    expect(readFileSync('src/lib/relayReadiness.ts', 'utf8')).toMatch(/catch \{\s*body = null;/);
  });
});
