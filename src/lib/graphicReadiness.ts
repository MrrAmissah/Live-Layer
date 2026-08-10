/**
 * Whether a graphic is fit to go on air — one rule, read by the renderer, the
 * preview and the Take path.
 *
 * This exists because an empty Scripture card used to air a fabricated verse.
 * `ScriptureCard` filled missing content with hardcoded defaults — reference
 * `'Scripture'` over `'The Lord is my shepherd; I shall not want.'` — so a card
 * the operator had not filled in rendered as a real, unattributed passage. On a
 * stream that is indistinguishable from a passage they chose, and nothing
 * anywhere flagged it: `takeDisabled` only ever considered rundown selection, and
 * no required-field validation existed in the draft or Take path.
 *
 * Deliberately NOT in `lib/scripture/`. The output bundle renders scripture
 * cards, and `check-output-isolation` forbids anything under `lib/scripture/`
 * from the render path — provider and cache code must never reach air. This is a
 * pure content rule with no provider dependency, so it belongs with the graphic
 * rules instead.
 */

export const SCRIPTURE_TEMPLATE_ID = 'scripture-card';

export interface GraphicReadiness {
  /** False when airing this would show fabricated or unattributed content. */
  ready: boolean;
  /** Operator-facing, naming the missing field. Empty when ready. */
  reason: string;
}

const READY: GraphicReadiness = { ready: true, reason: '' };

const blank = (value: string | undefined) => !value || !value.trim();

/**
 * The rule for scripture cards: **both** a reference and verse text must be
 * present. Nothing else is required, and nothing is inferred.
 *
 * Why non-empty rather than "the reference parses": the reference field is free
 * text an operator may legitimately style — `Psalm 23:1-2 (NIV)`, a translation
 * suffix, an em dash. Refusing to air a fully populated graphic mid-service over
 * a formatting nicety is a worse broadcast failure than the one being prevented,
 * and reference *validity* is already enforced where it belongs: at lookup, by
 * `parseScriptureReference`, before a passage can be accepted at all. What must
 * never happen is content being invented, and that needs only presence.
 *
 * Verse text with an empty reference is refused too: an unattributed passage on
 * screen is the thing the congregation cannot follow, and the plate renders a
 * reference slot that would otherwise sit empty or, before this, be filled with
 * the word "Scripture".
 */
export function resolveGraphicReadiness(
  templateId: string,
  values: Record<string, string> | undefined
): GraphicReadiness {
  // Every other template keeps its existing behaviour — this is not a general
  // required-field mechanism, and inventing one here would gate templates whose
  // empty states are deliberate.
  if (templateId !== SCRIPTURE_TEMPLATE_ID) return READY;

  const safe = values ?? {};
  const noReference = blank(safe.reference);
  const noVerse = blank(safe.verseText);

  if (noReference && noVerse) {
    return { ready: false, reason: 'This Scripture card is empty. Look up a passage before taking it live.' };
  }
  if (noVerse) {
    return {
      ready: false,
      reason: `"${safe.reference?.trim()}" has no verse text yet. Look it up, or paste the passage in.`
    };
  }
  if (noReference) {
    return { ready: false, reason: 'This passage has no reference. Add one so it can be attributed on screen.' };
  }
  return READY;
}

/** Convenience for surfaces that only need the boolean. */
export const isGraphicReady = (templateId: string, values: Record<string, string> | undefined): boolean =>
  resolveGraphicReadiness(templateId, values).ready;

/**
 * Why Take is unavailable — every reason it can be, in one place.
 *
 * `takeDisabled` always had two arms: the content is not airable, or a rundown
 * is active with no row selected. Only the first ever produced a sentence, so
 * the commonest case gave the operator a greyed button and silence.
 *
 * Returning both together is what makes them impossible to disagree: a caller
 * cannot render a disabled Take with no cause, because the disabled flag and
 * the reason come out of the same call. The invariant is tested directly —
 * `disabled` is true exactly when `reason` is non-empty.
 *
 * Selection is checked FIRST. When a rundown is active and nothing is selected
 * there is no target to judge, so a content complaint about the hidden ad-hoc
 * draft would name a graphic the operator cannot even see.
 */
export function describeTakeBlock(input: {
  rundownActive: boolean;
  hasSelection: boolean;
  readiness: GraphicReadiness;
}): { disabled: boolean; reason: string } {
  if (input.rundownActive && !input.hasSelection) {
    return {
      disabled: true,
      reason: 'No queue item selected. Choose one in the Queue tab, and Take sends that.'
    };
  }
  return input.readiness.ready
    ? { disabled: false, reason: '' }
    : { disabled: true, reason: input.readiness.reason };
}
