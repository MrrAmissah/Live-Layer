import { describe, expect, it } from 'vitest';
import { defaultPresetName, resolvePresetName, templateDisplayName } from './presetNaming';
import { templateRegistry } from '../components/templates/registry';

const PREACHER = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;

describe('templateDisplayName', () => {
  it('names every registered template', () => {
    for (const template of templateRegistry) {
      expect(templateDisplayName(template.id)).toBe(template.name);
    }
  });

  it('degrades to the raw id for a template this build does not have', () => {
    expect(templateDisplayName('retired-template')).toBe('retired-template');
  });

  it('does not throw on an empty id', () => {
    expect(() => templateDisplayName('')).not.toThrow();
  });
});

describe('defaultPresetName', () => {
  it('names a draft after its template', () => {
    expect(defaultPresetName(false, 'ignored', PREACHER.id)).toBe(PREACHER.name);
  });

  it('names a rundown item after itself — what the operator sees in the queue', () => {
    expect(defaultPresetName(true, 'Opening speaker', PREACHER.id)).toBe('Opening speaker');
  });

  it('falls back to the template when an item has no usable title', () => {
    expect(defaultPresetName(true, '', PREACHER.id)).toBe(PREACHER.name);
    expect(defaultPresetName(true, '   ', PREACHER.id)).toBe(PREACHER.name);
  });

  it('ignores the source label entirely in draft mode', () => {
    // The draft has no title; passing one must not leak into the name.
    expect(defaultPresetName(false, 'Opening speaker', PREACHER.id)).toBe(PREACHER.name);
  });
});

describe('resolvePresetName', () => {
  it('prefers what the operator typed', () => {
    expect(resolvePresetName('My look', false, '', PREACHER.id)).toBe('My look');
    expect(resolvePresetName('  My look  ', true, 'Opening speaker', PREACHER.id)).toBe('My look');
  });

  it('falls back to the same rule as defaultPresetName when nothing is typed', () => {
    for (const [isItem, label] of [[false, ''], [true, 'Opening speaker'], [true, '']] as const) {
      expect(resolvePresetName('', isItem, label, PREACHER.id)).toBe(
        defaultPresetName(isItem, label, PREACHER.id)
      );
      expect(resolvePresetName('   ', isItem, label, PREACHER.id)).toBe(
        defaultPresetName(isItem, label, PREACHER.id)
      );
    }
  });

  it('never returns an empty name', () => {
    expect(resolvePresetName('', true, '', 'retired-template')).toBe('retired-template');
    expect(resolvePresetName('', false, '', PREACHER.id)).not.toBe('');
  });
});
