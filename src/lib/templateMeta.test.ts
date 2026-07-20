import { describe, expect, it } from 'vitest';
import { describeTemplate, getTemplateIcon } from './templateMeta';
import { templateRegistry } from '../components/templates/registry';

const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;

describe('describeTemplate — unknown template fallback', () => {
  it('describes a known template with its own icon and name', () => {
    const d = describeTemplate(preacher, preacher.id);
    expect(d.known).toBe(true);
    expect(d.label).toBe(preacher.name);
    expect(d.icon).toBe(getTemplateIcon(preacher));
  });

  it('falls back safely when the template id is not in the registry', () => {
    // A queued or on-air entry can outlive its template (registry edit, pack
    // removal). The rail must degrade, not throw.
    const d = describeTemplate(undefined, 'removed-template-id');
    expect(d.known).toBe(false);
    expect(d.icon).toBe('layers'); // a real IconName, so <Icon> still renders
    expect(d.label).toBe('removed-template-id'); // raw id stays identifiable
  });

  it('uses a readable label when the id is empty', () => {
    expect(describeTemplate(undefined, '').label).toBe('Unknown template');
  });

  it('never throws for any registry template', () => {
    for (const t of templateRegistry) {
      expect(() => describeTemplate(t, t.id)).not.toThrow();
      expect(describeTemplate(t, t.id).icon).toBeTruthy();
    }
  });
});
