import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DYNAMIC_FIELD_CONTEXT, resolveDynamicFields } from './dynamicFields';

describe('tokens the app cannot back must not invent an answer', () => {
  /**
   * `{{eventTime}}` returned '10:30 AM' and `{{countdown}}` returned 'Starts
   * soon' whenever no event datetime was configured — and nothing in the
   * product configures one: every caller resolves with no context. So those
   * were not fallbacks, they were the only values an operator could ever get,
   * rendered on air as though somebody had set them.
   */
  const noEvent = { ...DEFAULT_DYNAMIC_FIELD_CONTEXT, now: new Date('2026-08-09T14:30:00Z') };

  it('leaves eventTime visibly unresolved rather than inventing a time', () => {
    const out = resolveDynamicFields('Doors {{eventTime}}', noEvent);
    expect(out).not.toMatch(/10:30/);
    expect(out).toContain('{{eventTime}}');
  });

  it('leaves countdown visibly unresolved rather than implying it is counting', () => {
    const out = resolveDynamicFields('{{countdown}}', noEvent);
    expect(out).not.toMatch(/soon/i);
    expect(out).toContain('{{countdown}}');
  });

  it('still resolves both when a real event datetime IS supplied', () => {
    // The tokens are not broken — they are honest. Given real backing they work.
    const withEvent = { ...noEvent, eventDateTime: '2026-08-09T15:00:00Z' };
    expect(resolveDynamicFields('{{eventTime}}', withEvent)).not.toContain('{{');
    expect(resolveDynamicFields('{{countdown}}', withEvent)).not.toContain('{{');
  });

  it('the insert helper does not offer a control with no backing', () => {
    /**
     * The rule has not changed; its backing has. `{{countdown}}` was withdrawn
     * because nothing in the product supplied `eventDateTime`, and the stated
     * condition for its return was an event time that is a real, configurable
     * thing. The service is now that, so the button is offered only against a
     * configured start time and is otherwise still absent. The gate itself is
     * covered in `components/control/eventTokenGate.test.ts`.
     */
    const source = readFileSync('src/components/control/TemplateFields.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).toMatch(/\.\.\.\(configured[\s\S]*?value: '\{\{countdown\}\}'/);
    // ...while the tokens that always resolve are still offered unconditionally.
    expect(source.slice(0, source.indexOf('...(configured'))).toMatch(/value: '\{\{date\}\}'/);
  });
});
