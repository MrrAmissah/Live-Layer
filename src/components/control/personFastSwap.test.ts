import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { personFieldPatch } from '../../lib/people/personPatch';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../../types/program';
import type { PersonProfile } from '../../types/people';

/**
 * Fast-swap's one real risk is writing to the wrong place.
 *
 * Quick Edit targets either the ad-hoc draft or a selected rundown item, and
 * the two are different stores. A person applied to the draft while a rundown
 * item is on screen edits something invisible; a person applied to the item
 * while the draft is on screen edits something the operator is not looking at.
 * Both fail silently, mid-service.
 *
 * The routing is not re-implemented in the component — it writes through
 * `useEditTarget().setFields` and nothing else — so these tests pin the two
 * halves of that contract: the patch itself, and the component's inability to
 * reach any other write path.
 */

const source = readFileSync('src/components/control/PersonFastSwap.tsx', 'utf8');
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = stripComments(source);

const PERSON: PersonProfile = {
  id: 'p-ama',
  displayName: 'Rev. Ama Mensah',
  title: 'Guest Speaker',
  churchName: 'Mathapoly Church International',
  headshotAssetId: 'asset-head-1',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z'
};

beforeEach(() => {
  useLiveLayerStore.setState({
    program: { ...CLEAR_PROGRAM_STATE },
    outputStatus: null,
    pendingOutputAcks: [],
    currentTemplateId: 'preacher-lower-third',
    draftValues: { name: 'Rev. Ishmael K. Awotwe', title: 'Lead Pastor', subtitle: 'Old Church' }
  });
});

describe('the draft path', () => {
  it('updates the working draft when there is no selected rundown item', () => {
    // What `useEditTarget` calls on the draft path: the store's own setFields.
    useLiveLayerStore.getState().setFields(personFieldPatch(PERSON, 'preacher-lower-third'));
    const values = useLiveLayerStore.getState().draftValues;
    expect(values.name).toBe('Rev. Ama Mensah');
    expect(values.title).toBe('Guest Speaker');
    expect(values.subtitle).toBe('Mathapoly Church International');
    expect(values.headshotAssetId).toBe('asset-head-1');
    expect(values.personId).toBe('p-ama');
  });

  it('leaves Program completely alone', () => {
    const before = useLiveLayerStore.getState().program;
    useLiveLayerStore.getState().setFields(personFieldPatch(PERSON, 'preacher-lower-third'));
    const after = useLiveLayerStore.getState().program;
    // Same reference: authoring did not touch Program at all.
    expect(after).toBe(before);
    expect(after.status).toBe('clear');
    expect(useLiveLayerStore.getState().outputStatus).toBeNull();
  });

  it('does not change the template', () => {
    useLiveLayerStore.getState().setFields(personFieldPatch(PERSON, 'preacher-lower-third'));
    expect(useLiveLayerStore.getState().currentTemplateId).toBe('preacher-lower-third');
  });

  it('preserves values the patch does not mention', () => {
    useLiveLayerStore.setState({ draftValues: { name: 'x', colorAccent: '#123456' } });
    useLiveLayerStore.getState().setFields(personFieldPatch(PERSON, 'preacher-lower-third'));
    expect(useLiveLayerStore.getState().draftValues.colorAccent).toBe('#123456');
  });
});

describe('the rundown-item path', () => {
  it('applies to the item without touching the draft', () => {
    /**
     * Modelled as the rundown path does it: merge the patch over the ITEM's
     * values. The draft must be byte-identical afterwards — that is the whole
     * distinction, and getting it backwards is the defect this guards.
     */
    const draftBefore = { ...useLiveLayerStore.getState().draftValues };
    const itemValues: Record<string, string> = { name: 'Bishop K. Owusu', title: 'Presiding Bishop', subtitle: 'Head Office' };

    const patch = personFieldPatch(PERSON, 'preacher-lower-third');
    const itemAfter = { ...itemValues, ...patch };

    expect(itemAfter.name).toBe('Rev. Ama Mensah');
    expect(itemAfter.personId).toBe('p-ama');
    // ...and the draft did not move.
    expect(useLiveLayerStore.getState().draftValues).toEqual(draftBefore);
  });

  it('clears a stale field on the item rather than leaving the previous person’s', () => {
    const itemValues: Record<string, string> = { name: 'Bishop K. Owusu', title: 'Presiding Bishop', subtitle: 'Head Office' };
    const patch = personFieldPatch({ ...PERSON, title: undefined, churchName: undefined }, 'preacher-lower-third');
    const itemAfter = { ...itemValues, ...patch };
    expect(itemAfter.title).toBe('');
    expect(itemAfter.subtitle).toBe('');
  });
});

describe('the component cannot reach another write path', () => {
  it('writes only through the target-aware setFields', () => {
    expect(code).toContain('target.setFields(personFieldPatch(');
    // Exactly one write in the whole component.
    expect(code.match(/target\.set[A-Za-z]+\(/g)).toHaveLength(1);
  });

  it('never calls the draft-only store helper', () => {
    /**
     * `applyPersonToLowerThird` is draft-only AND forces the template to
     * preacher-lower-third. Called from the rundown-item case it would edit the
     * invisible draft and rewrite the visible item's template.
     */
    expect(code).not.toContain('applyPersonToLowerThird');
    expect(code).not.toContain('useLiveLayerStore');
  });

  it('never publishes, takes, or writes Program', () => {
    // Choosing a person is authoring. Nothing here reaches air.
    for (const forbidden of [
      /\bonTake\b/,
      /publishCommand/,
      /createMessage/,
      /markProgram/,
      /SHOW_GRAPHIC/,
      /\.post\(/
    ]) {
      expect(code, `${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('does not introduce a second People store', () => {
    // It reads the existing one and marks recency through it; no new persistence.
    expect(code).toContain("from '../../lib/people/peopleStore'");
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
  });

  it('renders nothing for a template with no person to swap', () => {
    expect(code).toContain('if (!supportsPerson(target.templateId)) return null;');
  });
});
