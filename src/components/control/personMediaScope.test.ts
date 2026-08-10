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

describe('the person logo is fully authorable, not half', () => {
  it('uploads through the existing pipeline, not a new one', () => {
    expect(form).toMatch(/saveUploadedAsset\(file, 'logo'\)/);
    expect(form).toContain('validateImageFile(file)');
    // One upload helper, called for each media slot — the import makes three
    // occurrences, so count the CALLS.
    expect(form.match(/saveUploadedAsset\(file,/g)?.length).toBe(2);
  });

  it('offers upload, saved reuse and removal', () => {
    expect(form).toMatch(/Upload logo|Replace logo/);
    expect(form).toMatch(/Use saved logo/);
    expect(form).toMatch(/Remove logo/);
  });

  it('no longer sends the operator to another graphic to upload one', () => {
    expect(form).not.toMatch(/Brand controls/);
  });

  it('a logo upload writes the person form only', () => {
    expect(form).toMatch(/saveUploadedAsset\(file, 'logo'\);[\s\S]{0,120}update\('logoAssetId', asset\.id\)/);
  });

  it('closes a stale saved-logo picker after upload', () => {
    expect(form).toMatch(/update\('logoAssetId', asset\.id\)[\s\S]{0,200}?setPickingLogo\(false\)/);
  });

  it('uses its own uploading flag, so the wrong slot cannot claim to be saving', () => {
    expect(form).toContain('isUploadingLogo');
    expect(form).toMatch(/Saving logo/);
  });
});

describe('a failed logo preview does not outlive its person', () => {
  it('resets the failure when the logo source changes', () => {
    /**
     * The headshot already did this; the logo did not. So a Person whose logo
     * failed to load left the flag true, and the next Person's perfectly good
     * logo stayed hidden behind it.
     */
    expect(form).toMatch(/useEffect\(\(\) => \{\s*setLogoFailed\(false\);\s*\}, \[personLogo\.src\]\)/);
  });

  it('keeps the headshot equivalent reset', () => {
    expect(form).toMatch(/setHeadshotFailed\(false\)/);
  });
});
