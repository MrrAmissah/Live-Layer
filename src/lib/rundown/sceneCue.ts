/**
 * The OBS scene a rundown item names — one implementation, two callers.
 *
 * `ControlPage` reads it when a Take goes out (`docs/RUNDOWN-BRIDGE.md`), and
 * the rundown UI reads and writes it so an operator can actually enter one.
 * They were briefly two copies of the same regular expression, which is exactly
 * how a cue that looks set stops matching.
 *
 * ## Why it lives in the notes rather than the title
 *
 * Titles are AUTO-DERIVED from the graphic (`deriveItemTitle`) — the reference,
 * the speaker's name, the headline. So an untouched rundown holds things like
 * "Psalm 90:1", which names no scene, and worse: editing a graphic can silently
 * change its title and break a scene match that was working. Notes do not move
 * on their own. The title stays human on the desk; the cue drives OBS.
 *
 * The cue is one line in a freeform field, so an operator can keep ordinary
 * notes beside it — "mic 2 is hot" and `obs: The Word` in the same box.
 */

const CUE = /(?:^|\n)[ \t]*obs:[ \t]*(.+)/i;

/** The scene this item names, or undefined. */
export function readSceneCue(notes: string | undefined | null): string | undefined {
  const found = CUE.exec(notes ?? '')?.[1]?.trim();
  return found || undefined;
}

/**
 * Set, replace or remove the cue, leaving every other line of the note alone.
 *
 * An empty cue removes the line rather than writing `obs:` with nothing after
 * it — a bare prefix would read back as "no cue" anyway, and leaving it behind
 * makes a cleared cue look like a set one.
 */
export function writeSceneCue(notes: string | undefined | null, cue: string): string | undefined {
  const trimmed = cue.trim();
  const lines = (notes ?? '').split('\n');
  const rest = lines.filter((line) => !/^[ \t]*obs:/i.test(line));
  const next = trimmed ? [...rest, `obs: ${trimmed}`] : rest;
  const joined = next.join('\n').trim();
  return joined || undefined;
}

/**
 * What the bridge will actually send for this item.
 *
 * The cue wins; the title is the fallback, and it is a weak one for the reason
 * above. Undefined means the item names nothing and no scene switch is
 * attempted — inert rather than a guess, which matters because the bridge
 * refuses an unmatched label silently and the previous scene simply stays up.
 */
export function sceneLabelFor(item: { title?: string; notes?: string } | undefined): string | undefined {
  return readSceneCue(item?.notes) || item?.title || undefined;
}
