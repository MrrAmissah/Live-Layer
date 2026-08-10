import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInstanceFromDraft, useLiveLayerStore } from '../store/useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import { SERVICE_CONTEXT_KEY } from './storage';
import { parseRealtimeMessage } from './realtimeMessages';

/**
 * AUTHORING CONTEXT IS NOT PROGRAM CONTEXT.
 *
 * The failure this whole design exists to prevent: a countdown graphic is taken
 * for the 10:30 service, the operator then sets up the 19:00 evening session,
 * and the graphic already on air silently retimes itself — because Output
 * resolved `{{countdown}}` from whatever the control surface currently believed.
 *
 * The fix is that a Take FREEZES the context into the instance it publishes.
 * Program reads that; Preview reads the live one; they are allowed to differ,
 * and the difference is the feature.
 */

const store = new Map<string, string>();
const setService = (startAt: string) =>
  store.set(SERVICE_CONTEXT_KEY, JSON.stringify({ name: 'S', startAt }));

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
  useLiveLayerStore.setState({
    program: { ...CLEAR_PROGRAM_STATE },
    currentTemplateId: 'announcement-banner',
    draftValues: { headline: 'Doors at {{eventTime}} · {{countdown}}' },
    layout: {},
    durationSeconds: 6
  });
});

const take = () => buildInstanceFromDraft(useLiveLayerStore.getState());

describe('a Take captures the context it was taken with', () => {
  it('freezes the configured start time into the published instance', () => {
    setService('2026-08-10T10:30');
    expect(take().dynamicContext).toEqual({ eventDateTime: '2026-08-10T10:30' });
  });

  it('captures the DATETIME, never a rendered countdown', () => {
    // A resolved "00:12:04" would freeze on air. The datetime keeps ticking.
    setService('2026-08-10T10:30');
    const captured = take().dynamicContext!;
    expect(captured.eventDateTime).toBe('2026-08-10T10:30');
    expect(JSON.stringify(captured)).not.toMatch(/\d\d:\d\d:\d\d/);
  });

  it('captures nothing when no service time is configured', () => {
    setService('');
    // Not an empty object — absent, so an unconfigured Take stays unresolved.
    expect(take().dynamicContext).toBeUndefined();
  });
});

describe('changing the service afterwards cannot retime what is on air', () => {
  it('the taken instance keeps its own context when the service moves', () => {
    setService('2026-08-10T10:30');
    const onAir = take();

    // The operator now prepares the evening session.
    setService('2026-08-10T19:00');

    expect(onAir.dynamicContext).toEqual({ eventDateTime: '2026-08-10T10:30' });
  });

  it('a later Take publishes the new context, as it should', () => {
    setService('2026-08-10T10:30');
    const morning = take();
    setService('2026-08-10T19:00');
    const evening = take();

    expect(morning.dynamicContext?.eventDateTime).toBe('2026-08-10T10:30');
    expect(evening.dynamicContext?.eventDateTime).toBe('2026-08-10T19:00');
  });

  it('editing the service never touches Program', () => {
    const before = useLiveLayerStore.getState().program;
    setService('2026-08-10T19:00');
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('Output reads the captured context, Preview reads the live one', () => {
  it('Output resolves from the graphic, structurally', () => {
    const output = readFileSync('src/app/OutputPage.tsx', 'utf8');
    expect(output).toMatch(/useDynamicValues\(\s*activeGraphic\?\.values[\s\S]*?activeGraphic\?\.dynamicContext/);
    // It must not reach for authoring state at all.
    expect(output).not.toMatch(/useServiceContext|loadServiceContext|getServiceContext/);
  });

  it('Preview resolves from the live service context', () => {
    const preview = readFileSync('src/components/templates/TemplatePreview.tsx', 'utf8');
    expect(preview).toContain('useServiceDynamicContext()');
  });
});

describe('the context survives the wire, and older messages still work', () => {
  const instance = (extra: Record<string, unknown> = {}) => ({
    id: 'g1', templateId: 'announcement-banner', values: { headline: 'x' }, theme: {},
    durationSeconds: 6, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    ...extra
  });
  const message = (payload: unknown) => JSON.stringify({ id: 'm1', type: 'SHOW_GRAPHIC', timestamp: 1, payload });

  it('carries the captured context across the relay', () => {
    const parsed = parseRealtimeMessage(JSON.parse(message(instance({ dynamicContext: { eventDateTime: '2026-08-10T10:30' } }))));
    expect((parsed?.payload as { dynamicContext?: unknown })?.dynamicContext).toEqual({ eventDateTime: '2026-08-10T10:30' });
  });

  it('accepts a graphic authored before service context existed', () => {
    expect(parseRealtimeMessage(JSON.parse(message(instance())))).not.toBeNull();
  });

  it('rejects a malformed context rather than coercing it', () => {
    // A bad datetime reaching Output renders as garbage on air.
    for (const bad of [{ eventDateTime: 5 }, [], 'x']) {
      expect(parseRealtimeMessage(JSON.parse(message(instance({ dynamicContext: bad })))), JSON.stringify(bad)).toBeNull();
    }
  });
});
