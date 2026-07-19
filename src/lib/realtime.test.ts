import { describe, expect, it, vi } from 'vitest';
import { createMessage, publishCommand } from './realtime';

const message = createMessage('CLEAR_ALL', {});

describe('publishCommand — success must be explicit', () => {
  it('returns true and posts once when the channel accepts the command', () => {
    const post = vi.fn();
    expect(publishCommand({ post }, message)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(message);
  });

  it('treats a missing channel as failure, not silent success', () => {
    // Before the channel is created (or after close) nothing reaches output.
    expect(publishCommand(null, message)).toBe(false);
    expect(publishCommand(undefined, message)).toBe(false);
  });

  it('returns false when the transport throws', () => {
    const post = vi.fn(() => {
      throw new DOMException('closed', 'InvalidStateError');
    });
    expect(publishCommand({ post }, message)).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not swallow the failure into a retry or a second post', () => {
    const post = vi.fn(() => {
      throw new Error('boom');
    });
    publishCommand({ post }, message);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
