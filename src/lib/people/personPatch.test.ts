import { describe, expect, it } from 'vitest';
import { personFieldPatch, supportsPerson } from './personPatch';
import type { PersonProfile } from '../../types/people';

/**
 * Fast-swap's mapping. The patch is the whole product of this module: what it
 * returns is handed to whichever edit target is live, so the same object has to
 * be correct for the ad-hoc draft and for a selected rundown item.
 */

const person = (overrides: Partial<PersonProfile> = {}): PersonProfile => ({
  id: 'p-1',
  displayName: 'Rev. Ama Mensah',
  title: 'Guest Speaker',
  churchName: 'Mathapoly Church International',
  headshotAssetId: 'asset-head-1',
  logoAssetId: 'asset-logo-1',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  ...overrides
});

describe('which templates are offered a person at all', () => {
  it('offers the two lower thirds', () => {
    expect(supportsPerson('preacher-lower-third')).toBe(true);
    expect(supportsPerson('performer-lower-third')).toBe(true);
  });

  it('does not offer templates with no name field', () => {
    // Writing person values into a scripture card would store fields nothing
    // renders, and offering the control would imply it does something.
    expect(supportsPerson('scripture-card')).toBe(false);
    expect(supportsPerson('announcement-banner')).toBe(false);
    expect(supportsPerson('no-such-template')).toBe(false);
  });
});

describe('the fields a person fills', () => {
  it('fills name, role and church on a preacher lower third', () => {
    const patch = personFieldPatch(person(), 'preacher-lower-third');
    expect(patch.name).toBe('Rev. Ama Mensah');
    expect(patch.title).toBe('Guest Speaker');
    expect(patch.subtitle).toBe('Mathapoly Church International');
  });

  it('falls back to the free-text subtitle when there is no church', () => {
    const patch = personFieldPatch(
      person({ churchName: undefined, subtitle: 'Visiting from Kumasi' }),
      'preacher-lower-third'
    );
    expect(patch.subtitle).toBe('Visiting from Kumasi');
  });

  it('CLEARS stale identity text, rather than leaving the last person’s', () => {
    // The failure this feature exists to prevent: a new speaker's name beside
    // the previous speaker's title. Applies to identity text and the headshot;
    // the logo is deliberately preserved (see the asset tests below).
    const patch = personFieldPatch(person({ title: undefined, churchName: undefined }), 'preacher-lower-third');
    expect(patch.title).toBe('');
    expect(patch.subtitle).toBe('');
  });

  it('records which person the graphic came from', () => {
    expect(personFieldPatch(person(), 'preacher-lower-third').personId).toBe('p-1');
  });

  it('trims what it writes', () => {
    const patch = personFieldPatch(person({ displayName: '  Rev. Ama Mensah  ' }), 'preacher-lower-third');
    expect(patch.name).toBe('Rev. Ama Mensah');
  });
});

describe('assets are references, and only where the renderer shows them', () => {
  it('carries the headshot as an id on a template that draws one', () => {
    const patch = personFieldPatch(person(), 'preacher-lower-third');
    expect(patch.headshotAssetId).toBe('asset-head-1');
  });

  it('never writes a headshot id into a template that draws none', () => {
    // Guarded by capability, not by the registry's declared fields — the
    // registry does not declare headshotAssetId anywhere, so a declared-field
    // filter would have dropped the face from every template.
    const patch = personFieldPatch(person(), 'event-banner');
    expect('headshotAssetId' in patch).toBe(false);
  });

  it('clears the headshot when the new person has none', () => {
    const patch = personFieldPatch(person({ headshotAssetId: undefined }), 'preacher-lower-third');
    expect(patch.headshotAssetId).toBe('');
  });

  it('supersedes a typed logo URL when the person brings a logo asset', () => {
    // Path-independent on purpose: the draft path merges values plainly and the
    // rundown path reconciles asset bookkeeping, so the patch cannot rely on
    // either one's cleanup.
    const patch = personFieldPatch(person(), 'preacher-lower-third');
    expect(patch.logoAssetId).toBe('asset-logo-1');
    expect(patch.logoUrl).toBe('');
  });

  it('PRESERVES the existing logo when the person has none — deliberately', () => {
    /**
     * The asymmetry is intentional, and matches the pre-existing person helper.
     * Text and headshot are that PERSON's identity, so a new person without
     * them must clear the last person's. A logo is usually the CHURCH's, set
     * once for the event: wiping it because a guest speaker has no personal
     * logo would strip the house brand off the graphic mid-service.
     *
     * So: an incoming person logo replaces the current one; the absence of one
     * leaves whatever the graphic already carries.
     */
    const patch = personFieldPatch(person({ logoAssetId: undefined }), 'preacher-lower-third');
    expect('logoAssetId' in patch).toBe(false);
    expect('logoUrl' in patch).toBe(false);
  });

  it('writes only string values — never a blob, a File or an object', () => {
    const patch = personFieldPatch(person(), 'preacher-lower-third');
    for (const [key, value] of Object.entries(patch)) {
      expect(typeof value, key).toBe('string');
      expect(value).not.toMatch(/^\s*(data|blob):/i);
    }
  });
});

describe('what the patch deliberately does not contain', () => {
  it('never changes the template', () => {
    // Switching a selected rundown item's template out from under the operator
    // is worse than not offering the swap at all.
    const patch = personFieldPatch(person(), 'preacher-lower-third');
    expect('templateId' in patch).toBe(false);
    expect('currentTemplateId' in patch).toBe(false);
  });

  it('never carries Program, duration, layout or theme', () => {
    const patch = personFieldPatch(person(), 'preacher-lower-third');
    for (const forbidden of ['program', 'status', 'durationSeconds', 'layout', 'theme', 'commandId']) {
      expect(forbidden in patch, forbidden).toBe(false);
    }
  });

  it('writes only fields the template actually declares, plus known asset slots', () => {
    const patch = personFieldPatch(person(), 'performer-lower-third');
    const allowed = new Set(['name', 'title', 'subtitle', 'personId', 'headshotAssetId', 'logoAssetId', 'logoUrl']);
    for (const key of Object.keys(patch)) expect(allowed.has(key), key).toBe(true);
  });
});
