import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SERVICE_CONTEXT,
  isConfiguredStart,
  loadServiceContext,
  saveServiceContext,
  serviceDynamicContext
} from './serviceContext';
import { SERVICE_CONTEXT_KEY } from './storage';
import { resolveDynamicFields, DEFAULT_DYNAMIC_FIELD_CONTEXT } from './dynamicFields';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
});

describe('the configured start time', () => {
  it('accepts what the datetime-local control emits', () => {
    expect(isConfiguredStart('2026-08-10T10:30')).toBe(true);
  });

  it('rejects a shape that is not a local datetime', () => {
    for (const bad of ['', '2026-08-10', '10:30', '2026-08-10T10:30:00Z', 'soon']) {
      expect(isConfiguredStart(bad), bad).toBe(false);
    }
  });

  it('rejects a date that matches the pattern but is not a day', () => {
    // The check that stops `Invalid Date` reaching air.
    expect(isConfiguredStart('2026-02-31T10:30')).toBe(false);
    expect(isConfiguredStart('2026-13-01T10:30')).toBe(false);
    expect(isConfiguredStart('2026-08-10T25:30')).toBe(false);
  });
});

describe('local wall-clock time survives a round trip', () => {
  it('stores and reloads 10:30 as 10:30, with no arithmetic', () => {
    saveServiceContext({ name: 'Sunday Service', startAt: '2026-08-10T10:30' });
    expect(loadServiceContext()).toEqual({ name: 'Sunday Service', startAt: '2026-08-10T10:30' });
  });

  it('does not shift across a DST boundary', () => {
    /**
     * The failure this contract exists to prevent: an ISO instant would be
     * converted in and back out, and a spring-forward boundary is where those
     * conversions move a 10:30 service to 09:30 or 11:30. The stored string is
     * what the operator typed, so there is nothing to shift.
     */
    for (const startAt of ['2026-03-29T10:30', '2026-10-25T10:30', '2026-12-25T18:00']) {
      saveServiceContext({ name: 'S', startAt });
      expect(loadServiceContext().startAt, startAt).toBe(startAt);
    }
  });

  it('drops a stored time that no longer parses rather than carrying it', () => {
    store.set(SERVICE_CONTEXT_KEY, JSON.stringify({ name: 'Legacy', startAt: 'whenever' }));
    expect(loadServiceContext()).toEqual({ name: 'Legacy', startAt: '' });
  });

  it('falls back safely on a malformed or unreadable record', () => {
    store.set(SERVICE_CONTEXT_KEY, 'not json');
    expect(loadServiceContext()).toEqual(EMPTY_SERVICE_CONTEXT);
    store.set(SERVICE_CONTEXT_KEY, JSON.stringify([1, 2, 3]));
    expect(loadServiceContext()).toEqual(EMPTY_SERVICE_CONTEXT);
    store.set(SERVICE_CONTEXT_KEY, JSON.stringify({ name: 5 }));
    expect(loadServiceContext()).toEqual(EMPTY_SERVICE_CONTEXT);
  });
});

describe('tokens only become real when the time is real', () => {
  const at = (now: string, eventDateTime?: string) =>
    ({ ...DEFAULT_DYNAMIC_FIELD_CONTEXT, now: new Date(now), eventDateTime });

  it('offers no dynamic context while the service has no start time', () => {
    expect(serviceDynamicContext({ name: 'Sunday Service', startAt: '' })).toBeUndefined();
    expect(serviceDynamicContext({ name: '', startAt: 'nonsense' })).toBeUndefined();
  });

  it('keeps stage 4C truthfulness — no invented time without a service', () => {
    const out = resolveDynamicFields('{{eventTime}} {{countdown}}', at('2026-08-10T09:00:00'));
    expect(out).toContain('{{eventTime}}');
    expect(out).toContain('{{countdown}}');
    expect(out).not.toMatch(/10:30|soon/i);
  });

  it('resolves both once a real start time is configured', () => {
    const context = serviceDynamicContext({ name: 'Sunday Service', startAt: '2026-08-10T10:30' });
    expect(context).toEqual({ eventDateTime: '2026-08-10T10:30' });
    const out = resolveDynamicFields('{{eventTime}}', at('2026-08-10T09:00:00', context!.eventDateTime));
    expect(out).not.toContain('{{');
  });
});
