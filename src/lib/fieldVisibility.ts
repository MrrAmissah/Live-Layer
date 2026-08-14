import { templateRegistry } from '../components/templates/registry';

/**
 * Hiding a field without deleting what is in it.
 *
 * Not every speaker has a title, and not every graphic wants the church line.
 * The operator's only way to leave one out was to CLEAR IT — which meant
 * retyping it the next time that person came up, so in practice the field went
 * to air unwanted rather than lose the words. An eye toggle keeps the text and
 * takes it off the graphic.
 *
 * ## Where it lives
 *
 * In `values`, as a comma-separated list under one key. `values` is a flat
 * `Record<string, string>` from the store through the realtime message to the
 * renderer, so a parallel structure would not survive the trip — it would have
 * to be threaded through the protocol, the rundown, the presets and the export.
 * A value rides free everywhere a graphic already goes, which is exactly the
 * property this needs: hidden on the desk means hidden on air, on every screen,
 * after a reload, and inside a rundown item saved last week.
 *
 * ## Where it is applied
 *
 * At the RENDER boundary and nowhere else — the output page and the preview —
 * so every template gets it without a single renderer knowing it exists. The
 * stored graphic keeps the words: Recent, presets and the rundown still show
 * what the operator typed, and un-hiding is one click rather than retyping.
 *
 * Deliberately NOT applied before `resolveGraphicReadiness`. A hidden field is
 * still filled in, and a scripture card whose verse is merely hidden should
 * fail the Take gate for being blank on screen rather than pass because the
 * words exist somewhere.
 */

export const HIDDEN_FIELDS_KEY = 'hiddenFields';

const split = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

/** The field ids this graphic is hiding. */
export function hiddenFieldIds(values: Record<string, string>): string[] {
  return split(values[HIDDEN_FIELDS_KEY]);
}

export function isFieldHidden(values: Record<string, string>, fieldId: string): boolean {
  return hiddenFieldIds(values).includes(fieldId);
}

/**
 * Turn a field's visibility on or off, returning new values.
 *
 * ALWAYS WRITES THE KEY, empty when nothing is hidden. Dropping it looked
 * tidier and did not work: every writer into a draft is a PATCH that merges, so
 * a returned object with the key missing left the previous value in place —
 * hiding worked and showing again did nothing at all, which is the "cannot turn
 * it back on" this fixes.
 *
 * An empty string reads back as nothing hidden (`hiddenFieldIds` filters it),
 * and `sameFieldValue` in the store treats empty and absent as the same for
 * this key, so a graphic that toggled once and toggled back is not counted as
 * edited.
 */
export function withFieldHidden(
  values: Record<string, string>,
  fieldId: string,
  hidden: boolean
): Record<string, string> {
  const next = new Set(hiddenFieldIds(values));
  if (hidden) next.add(fieldId);
  else next.delete(fieldId);
  return { ...values, [HIDDEN_FIELDS_KEY]: [...next].join(',') };
}

/**
 * Which fields an operator may hide on this template.
 *
 * Every text field except the one the graphic is ABOUT. A lower third without a
 * name, or a scripture card without a reference, is not a graphic with a field
 * turned off — it is an empty plate, and the toggle should not offer to make
 * one. Logos are excluded because they have their own control already.
 */
export function hideableFieldIds(templateId: string): string[] {
  const template = templateRegistry.find((entry) => entry.id === templateId);
  if (!template) return [];
  return template.fields
    .filter((field) => field.id !== template.primaryField)
    .filter((field) => field.type === 'text' || field.type === 'textarea')
    .map((field) => field.id);
}

/**
 * The values a renderer should draw: hidden fields blanked, everything else
 * untouched.
 *
 * Returns the SAME object when nothing is hidden, so the common case allocates
 * nothing and provokes no re-render.
 */
export function applyFieldVisibility(values: Record<string, string>): Record<string, string> {
  const hidden = hiddenFieldIds(values);
  if (!hidden.length) return values;
  const next = { ...values };
  for (const fieldId of hidden) next[fieldId] = '';
  return next;
}
