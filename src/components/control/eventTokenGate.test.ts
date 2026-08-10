import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDynamicFields, DEFAULT_DYNAMIC_FIELD_CONTEXT } from '../../lib/dynamicFields';
import { serviceDynamicContext } from '../../lib/serviceContext';

/**
 * WHEN THE OPERATOR IS ALLOWED TO INSERT AN EVENT TOKEN.
 *
 * Stage 4C withdrew the countdown button on a specific finding: `{{eventTime}}`
 * and `{{countdown}}` resolve from `eventDateTime`, nothing supplied it, so the
 * button could only ever hand the operator placeholder text. The stated
 * condition for its return was an event time that is a real, configurable
 * thing — and the gate has to BE that condition, not a proxy for it. Offering
 * the tokens because a service merely exists, or because a start time is
 * present but unparseable, would reintroduce exactly the withdrawn defect.
 */

const fields = readFileSync('src/components/control/TemplateFields.tsx', 'utf8');

describe('the two event tokens are gated on a real configured start time', () => {
  it('gates the options on the service, not on anything else', () => {
    expect(fields).toMatch(/const configured = isConfiguredStart\(useServiceContext\(\)\.startAt\)/);
    expect(fields).toMatch(/\.\.\.\(configured[\s\S]*?\{\{eventTime\}\}[\s\S]*?\{\{countdown\}\}[\s\S]*?\: \[\]\)/);
  });

  it('offers both tokens, so the pair returns together', () => {
    // A countdown with no way to state the time it counts to is half a feature.
    expect(fields).toContain("value: '{{eventTime}}'");
    expect(fields).toContain("value: '{{countdown}}'");
  });

  it('leaves the always-available tokens ungated', () => {
    // `{{date}}`, `{{time}}` and `{{weekday}}` resolve from the clock and never
    // needed a service; hiding them behind setup would be a regression.
    const ungated = fields.slice(fields.indexOf('const options = ['), fields.indexOf('...(configured'));
    for (const token of ['{{date}}', '{{time}}', '{{weekday}}']) {
      expect(ungated, token).toContain(token);
    }
  });

  it('says what is missing instead of hiding the controls silently', () => {
    // An operator who cannot find countdown has no way to learn what it needs.
    expect(fields).toMatch(/configured \? null : \(/);
    expect(fields).toMatch(/Set the service start time/);
  });
});

describe('the field hint resolves against the same service as the plate', () => {
  it('passes the live service context into the per-field preview', () => {
    expect(fields).toMatch(/resolveDynamicFields\(value, \{[\s\S]*?eventDateTime: useServiceDynamicContext\(\)\?\.eventDateTime/);
  });

  it('one value cannot read two ways on two surfaces', () => {
    // The behavioural statement behind that wiring: with a service configured,
    // neither surface leaves the token unresolved.
    const context = serviceDynamicContext({ name: 'S', startAt: '2026-08-10T10:30' })!;
    const resolved = resolveDynamicFields('{{eventTime}}', {
      ...DEFAULT_DYNAMIC_FIELD_CONTEXT,
      now: new Date('2026-08-10T09:00:00'),
      eventDateTime: context.eventDateTime
    });
    expect(resolved).not.toContain('{{');
  });
});

describe('a dock-only operator can set the thing the hint asks for', () => {
  /**
   * The dock reads the service already — the two buttons appear there when one
   * is configured. Without somewhere to set it, an operator working inside OBS
   * would watch controls appear and disappear, be told to "set the service
   * start time", and have nowhere to do it.
   */
  const settings = readFileSync('src/components/control/DockSettingsTab.tsx', 'utf8');

  it('offers both service fields in the dock’s Settings tab', () => {
    expect(settings).toContain("<span className=\"ll-kicker\">Service</span>");
    expect(settings).toContain("type=\"datetime-local\"");
    expect(settings).toContain('setServiceContext({ ...service, startAt: event.target.value })');
  });

  it('writes through the same store the studio does, not a second copy', () => {
    // Two writers with their own state is how the dock and the studio end up
    // disagreeing about which service is being prepared.
    expect(settings).toContain("from '../../hooks/useServiceContext'");
    expect(settings).not.toMatch(/localStorage|useState<ServiceContext>/);
  });

  it('costs no dock height outside the tab the operator opened', () => {
    // Not a popover, not a header row: the dock's vertical budget is the thing
    // stage 4B spent itself defending.
    expect(settings).not.toMatch(/createPortal|position: 'absolute'/);
  });
});

describe('an unparseable stored time is not a configured one', () => {
  it('produces no dynamic context, so the buttons stay withdrawn', () => {
    for (const bad of ['', 'soon', '2026-02-31T10:30', '2026-08-10']) {
      expect(serviceDynamicContext({ name: 'S', startAt: bad }), bad).toBeUndefined();
    }
  });
});
