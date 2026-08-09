import { templateRegistry } from '../../components/templates/registry';
import { rendersHeadshot, rendersLogo } from '../templateCapabilities';
import type { PersonProfile } from '../../types/people';

/**
 * A saved person, turned into a field patch for whatever template is in front
 * of the operator.
 *
 * This is the authoring half of "fast swap": the guest speaker changed, and the
 * operator has ten seconds. It produces a PATCH — a plain values object — and
 * deliberately nothing else, so the caller can hand it to whichever edit target
 * is live (`useEditTarget().setFields`) and the same mapping serves the ad-hoc
 * draft and a selected rundown item identically.
 *
 * WHAT IT DELIBERATELY IS NOT. It does not switch template. The store's older
 * `applyPersonToLowerThird` does — it forces `currentTemplateId` and writes the
 * draft directly — which is right for "start a lower third for this person" and
 * completely wrong here: changing a selected rundown item's template out from
 * under the operator is worse than not offering the swap. Fast-swap is offered
 * only where the current template already carries person fields
 * (`supportsPerson`), which is a scope guard rather than a limitation.
 *
 * MAPPING COMES FROM TWO PLACES, because the truth is in two places:
 *
 *  - the registry's declared `fields`, for text the operator would otherwise
 *    type (name / title / subtitle);
 *  - `templateCapabilities`, for asset slots the RENDERER supports but the
 *    registry never declares, because they are chosen through the asset picker
 *    rather than a text box. Filtering on declared fields alone would drop the
 *    headshot — the most visible part of a person swap.
 *
 * Assets are carried as IDs. A stored id is a reference the renderer resolves;
 * bytes never enter a graphic's values.
 */

/** Registry field ids this module knows how to fill from a person. */
const TEXT_SOURCES: ReadonlyArray<{ field: string; from: (person: PersonProfile) => string | undefined }> = [
  { field: 'name', from: (person) => person.displayName },
  { field: 'title', from: (person) => person.title },
  // A church is the subtitle when there is one; a free-text subtitle is the
  // fallback, which is what `applyPersonToLowerThird` already does.
  { field: 'subtitle', from: (person) => person.churchName || person.subtitle }
];

function declaredFieldIds(templateId: string): Set<string> {
  const template = templateRegistry.find((item) => item.id === templateId);
  return new Set((template?.fields ?? []).map((field) => field.id));
}

/**
 * True when this template can show enough of a person to be worth offering.
 * A name alone is the bar: a template with no name field is not a person
 * graphic, and swapping into it would write values nothing renders.
 */
export function supportsPerson(templateId: string): boolean {
  return declaredFieldIds(templateId).has('name');
}

export function personFieldPatch(person: PersonProfile, templateId: string): Record<string, string> {
  const declared = declaredFieldIds(templateId);
  const patch: Record<string, string> = {};

  for (const source of TEXT_SOURCES) {
    if (!declared.has(source.field)) continue;
    // Written even when empty: leaving the previous speaker's title next to a
    // new speaker's name is the failure this feature exists to prevent.
    patch[source.field] = source.from(person)?.trim() ?? '';
  }

  // `personId` is how a graphic remembers which person it came from —
  // `buildInstanceFromDraft` already carries it into the instance, and the
  // picker reads it back to show which person is currently applied.
  patch.personId = person.id;

  if (rendersHeadshot(templateId)) {
    patch.headshotAssetId = person.headshotAssetId ?? '';
  }

  if (rendersLogo(templateId) && person.logoAssetId) {
    patch.logoAssetId = person.logoAssetId;
    /**
     * Same rule the store applies: an uploaded asset supersedes a typed URL, and
     * leaving both would let the URL silently win in some renderers. Setting it
     * explicitly ALSO makes the patch path-independent — the draft path merges
     * values plainly while the rundown path reconciles asset bookkeeping, and a
     * patch that relied on either one's cleanup would behave differently
     * depending on what the operator happened to have selected.
     */
    if (declared.has('logoUrl')) patch.logoUrl = '';
  }

  return patch;
}
