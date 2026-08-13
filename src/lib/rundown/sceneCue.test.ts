import { describe, expect, it } from 'vitest';
import { readSceneCue, sceneLabelFor, writeSceneCue } from './sceneCue';

/**
 * The cue that makes the OBS bridge fire.
 *
 * It lives in the item's notes rather than its title because titles are
 * AUTO-DERIVED from the graphic — so an untouched rundown says "Psalm 90:1",
 * which names no scene, and worse, editing a graphic can silently change a
 * title and break a match that was working. Notes do not move on their own.
 */
describe('reading a cue', () => {
  it('finds it on its own line', () => {
    expect(readSceneCue('obs: The Word')).toBe('The Word');
  });

  it('finds it among ordinary notes, whatever the case or spacing', () => {
    expect(readSceneCue('mic 2 is hot\n  OBS:   Offering  \nlights down')).toBe('Offering');
  });

  it('is undefined when there is none', () => {
    expect(readSceneCue('remember the lights')).toBeUndefined();
    expect(readSceneCue('')).toBeUndefined();
    expect(readSceneCue(undefined)).toBeUndefined();
  });

  it('does not read a cue out of the middle of a sentence', () => {
    // "ask the obs: operator" is a note, not a cue.
    expect(readSceneCue('ask the obs: operator about this')).toBeUndefined();
  });

  it('treats a bare prefix as no cue', () => {
    expect(readSceneCue('obs:')).toBeUndefined();
    expect(readSceneCue('obs:    ')).toBeUndefined();
  });
});

describe('writing a cue', () => {
  it('adds one to an empty note', () => {
    expect(writeSceneCue(undefined, 'Praise')).toBe('obs: Praise');
  });

  it('replaces an existing one without disturbing the rest', () => {
    // The operator's own notes are not ours to lose.
    expect(writeSceneCue('mic 2 is hot\nobs: Praise\nlights down', 'The Word')).toBe(
      'mic 2 is hot\nlights down\nobs: The Word'
    );
  });

  it('removes the line when the cue is cleared', () => {
    // Not `obs:` with nothing after it — a bare prefix reads back as no cue
    // anyway, and leaving it makes a cleared cue look like a set one.
    expect(writeSceneCue('obs: Praise', '')).toBeUndefined();
    expect(writeSceneCue('mic 2 is hot\nobs: Praise', '   ')).toBe('mic 2 is hot');
  });

  it('round-trips', () => {
    const notes = writeSceneCue('lights down', 'Offering');
    expect(readSceneCue(notes)).toBe('Offering');
  });

  it('never accumulates duplicates', () => {
    let notes = writeSceneCue(undefined, 'A');
    notes = writeSceneCue(notes, 'B');
    notes = writeSceneCue(notes, 'C');
    expect(notes).toBe('obs: C');
  });
});

describe('what the bridge is actually sent', () => {
  it('prefers the cue over the title', () => {
    expect(sceneLabelFor({ title: 'Rev. Mensah — Welcome', notes: 'obs: The Word' })).toBe('The Word');
  });

  it('falls back to the title, weakly', () => {
    expect(sceneLabelFor({ title: 'Praise' })).toBe('Praise');
  });

  it('names nothing when there is nothing to name', () => {
    // No label means no fetch, which is how an unnamed item stays inert rather
    // than switching OBS to whatever it guesses.
    expect(sceneLabelFor(undefined)).toBeUndefined();
    expect(sceneLabelFor({ title: '', notes: '' })).toBeUndefined();
  });
});
