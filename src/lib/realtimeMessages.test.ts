import { describe, expect, it } from 'vitest';
import { createSeenIds, parseRealtimeMessage } from './realtimeMessages';

/**
 * Output events get the same strictness the command types always had: a
 * malformed report is dropped at the door, never coerced — an ack that cannot
 * be matched honestly (no commandId) or attributed (no outputId) is worthless
 * and dangerous in equal measure.
 */

const envelope = { id: 'm-1', timestamp: 123 };

describe('parseRealtimeMessage — output events', () => {
  it('accepts a complete OUTPUT_APPLIED and preserves its fields', () => {
    const parsed = parseRealtimeMessage({
      ...envelope,
      type: 'OUTPUT_APPLIED',
      payload: { commandId: 'c-1', outputId: 'o-1', graphicId: 'g-1', templateId: 't-1' }
    });
    expect(parsed).toEqual({
      id: 'm-1',
      type: 'OUTPUT_APPLIED',
      payload: { commandId: 'c-1', outputId: 'o-1', graphicId: 'g-1', templateId: 't-1' },
      timestamp: 123
    });
  });

  it('rejects OUTPUT_APPLIED missing any identity field', () => {
    for (const payload of [
      { outputId: 'o', graphicId: 'g' }, // no commandId
      { commandId: 'c', graphicId: 'g' }, // no outputId
      { commandId: 'c', outputId: 'o' }, // no graphicId
      { commandId: '', outputId: 'o', graphicId: 'g' }, // empty string is not an id
      { commandId: 'c', outputId: 'o', graphicId: 'g', templateId: 7 } // wrong optional type
    ]) {
      expect(parseRealtimeMessage({ ...envelope, type: 'OUTPUT_APPLIED', payload })).toBeNull();
    }
  });

  it('rejects OUTPUT_CLEARED and OUTPUT_FAILED without their required fields', () => {
    expect(parseRealtimeMessage({ ...envelope, type: 'OUTPUT_CLEARED', payload: { commandId: 'c' } })).toBeNull();
    expect(
      parseRealtimeMessage({ ...envelope, type: 'OUTPUT_FAILED', payload: { commandId: 'c', outputId: 'o' } })
    ).toBeNull(); // a failure without a reason helps nobody
    expect(
      parseRealtimeMessage({
        ...envelope,
        type: 'OUTPUT_FAILED',
        payload: { commandId: 'c', outputId: 'o', reason: 'template missing' }
      })
    ).not.toBeNull();
  });

  it('OUTPUT_STATUS requires tri-state booleans — truthiness is not a reading', () => {
    const ok = { outputId: 'o', sourceActive: null, sourceVisible: false };
    expect(parseRealtimeMessage({ ...envelope, type: 'OUTPUT_STATUS', payload: ok })).not.toBeNull();
    for (const bad of [
      { outputId: 'o', sourceActive: 'true', sourceVisible: null },
      { outputId: 'o', sourceActive: 1, sourceVisible: null },
      { outputId: 'o', sourceActive: undefined, sourceVisible: null },
      { sourceActive: true, sourceVisible: true } // no outputId
    ]) {
      expect(parseRealtimeMessage({ ...envelope, type: 'OUTPUT_STATUS', payload: bad })).toBeNull();
    }
  });

  it('still rejects unknown types outright', () => {
    expect(parseRealtimeMessage({ ...envelope, type: 'OUTPUT_SOMETHING', payload: {} })).toBeNull();
  });
});

describe('createSeenIds — duplicate suppression across interleaved transports', () => {
  it('drops the A,B,A repeat a single last-id memory would re-deliver', () => {
    const seen = createSeenIds();
    expect(seen.add('A')).toBe(true);
    expect(seen.add('B')).toBe(true);
    expect(seen.add('A')).toBe(false); // the interleaving that motivated the set
  });

  it('is bounded: evicts oldest first and never grows past its limit', () => {
    const seen = createSeenIds(3);
    seen.add('1');
    seen.add('2');
    seen.add('3');
    seen.add('4'); // evicts '1'
    expect(seen.add('1')).toBe(true); // forgotten, as a bounded memory must
    expect(seen.add('4')).toBe(false); // recent ids are still remembered
  });
});
