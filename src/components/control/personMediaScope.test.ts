import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A Person's images belong to the PERSON.
 *
 * PersonForm sits in the Library while a graphic and possibly a selected
 * rundown item are live elsewhere. Choosing a headshot here must change the
 * person record and nothing else — the copy onto a graphic happens later and
 * deliberately, through stage 4B's People fast-swap, and only for templates
 * that render the field.
 */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const form = strip(readFileSync('src/components/control/PersonForm.tsx', 'utf8'));

describe('Person image edits reach the Person and nothing else', () => {
  it('writes only through the form updater', () => {
    expect(form).toContain("update('headshotAssetId', assetId)");
    expect(form).toContain("update('logoAssetId', assetId)");
  });

  it('cannot reach a graphic, a rundown item or Program', () => {
    for (const forbidden of [
      /useLiveLayerStore/,
      /useEditTarget/,
      /setFields/,
      /updateItem/,
      /markProgram/,
      /applyPersonToLowerThird/,
      /personFieldPatch/
    ]) {
      expect(form, `${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('stores asset IDs, never bytes', () => {
    for (const forbidden of [/getAssetBlob/, /URL\.createObjectURL/, /dataUrl/, /new Blob/]) {
      expect(form, `${forbidden}`).not.toMatch(forbidden);
    }
  });
});

describe('the two Person image slots accept the right kinds', () => {
  it('a headshot slot takes headshots', () => {
    expect(form).toMatch(/HEADSHOT_TYPES[^=]*=\s*\['speaker-headshot'\]/);
  });

  it('a person logo slot takes logos, not faces', () => {
    expect(form).toMatch(/PERSON_LOGO_TYPES[^=]*=\s*\['logo', 'event-logo'\]/);
  });

  it('declares both at module level, so the picker does not re-read on each keystroke', () => {
    // The picker's effect depends on `accept`; a fresh literal per render would
    // hit the asset store on every character typed into this form.
    expect(form).toMatch(/^const HEADSHOT_TYPES/m);
    expect(form).toMatch(/^const PERSON_LOGO_TYPES/m);
  });
});

describe('the person logo is reachable at all', () => {
  it('has UI, having previously been settable only by importing a pack', () => {
    /**
     * `logoAssetId` was stored, sanitised, remapped on import and consumed by
     * fast-swap — with no control anywhere. That is an unfinished surface, not
     * a deliberate one.
     */
    expect(form).toContain("update('logoAssetId', '')");
    expect(form).toMatch(/Use saved logo|Change logo/);
  });

  it('says whose logo it is, so it is not mistaken for the graphic brand', () => {
    expect(form).toMatch(/Applied by People swap/);
  });
});

describe('an upload does not leave a stale saved list', () => {
  it('closes the headshot picker once the upload becomes the selection', () => {
    expect(form).toMatch(/update\('headshotAssetId', asset\.id\)[\s\S]*?setPickingHeadshot\(false\)/);
  });
});
