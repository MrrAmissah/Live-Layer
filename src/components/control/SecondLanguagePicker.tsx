import { useState } from 'react';
import type { ScriptureLookupResult } from '../../types/scripture';
import {
  availableTranslations,
  describeTranslation,
  providerForTranslation
} from '../../lib/scripture/providers';
import { getCachedScripture, saveCachedScripture } from '../../lib/scripture/scriptureCache';
import { runScriptureLookup } from '../../lib/scripture/runLookup';

/**
 * "The same verse, in another language" — one choice, no retyping.
 *
 * The dual split screen shows one passage twice, and the only thing in question
 * is the LANGUAGE: the reference is already on the card. Filling the second
 * well used to mean switching translation, retyping the reference and looking
 * it up again — reported from the desk as too slow for production.
 *
 * ## Why this is a component rather than markup in one panel
 *
 * It first lived inline in `ScriptureLookupPanel`, which is the Scripture
 * page. But the scripture card is also edited in Studio's Content tab, and
 * THAT is where the three second-passage fields render as ordinary text boxes —
 * so an operator working in Studio still met "type it again", which is exactly
 * the complaint. One component, used by both surfaces, is the only way the two
 * cannot drift into offering different speeds for the same job.
 *
 * ## It does not disturb what is on screen
 *
 * `runScriptureLookup` is called directly rather than through
 * `useScriptureLookup`. That hook owns a surface's displayed passage and status
 * line, so borrowing it would blank the verse the operator is reading and
 * replace it with the translation they only wanted ALONGSIDE. Calling the
 * function keeps the cache and the provider routing and touches nothing else.
 */

interface Props {
  /** The reference to fetch. Empty disables the control. */
  reference: string;
  /** The translation already on the card, filtered out of the choices. */
  currentTranslationId: string;
  /** Called with the fetched passage and the translation id chosen. */
  onFilled: (passage: ScriptureLookupResult, translationId: string) => void;
  /** Shown above the select. */
  label?: string;
}

export default function SecondLanguagePicker({
  reference,
  currentTranslationId,
  onFilled,
  label = 'Add second language'
}: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const choose = async (id: string) => {
    if (!id || !reference.trim()) return;
    setBusy(true);
    setNote('');
    try {
      const outcome = await runScriptureLookup(reference, id, {
        provider: providerForTranslation(id),
        getCached: getCachedScripture,
        saveCached: saveCachedScripture,
        /**
         * Nothing can supersede this: it is not a surface's own lookup, so
         * there is no newer request to lose to.
         */
        isCurrent: () => true,
        online: typeof navigator === 'undefined' || navigator.onLine !== false
      });
      if (outcome.kind === 'fresh' || outcome.kind === 'cached') {
        onFilled(outcome.result, id);
        setNote('');
      } else {
        const chosen = availableTranslations().find((item) => item.id === id)?.label ?? id;
        // Naming the first passage as unchanged matters: the operator is one
        // press from Take and needs to know nothing moved under them.
        setNote(`Couldn’t get ${reference} in ${chosen}. The first passage is unchanged.`);
      }
    } catch {
      setNote('That translation could not be reached. The first passage is unchanged.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="second-lang">
      <label className="second-lang__row">
        <span className="second-lang__label">{busy ? 'Fetching…' : label}</span>
        <select
          className="field__input"
          value=""
          disabled={busy || !reference.trim()}
          onChange={(event) => void choose(event.target.value)}
        >
          <option value="">Choose…</option>
          {availableTranslations()
            /* Not the one already on the card: a passage beside itself in the
               same translation is two of the same thing. */
            .filter((item) => item.id !== currentTranslationId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {describeTranslation(item)}
              </option>
            ))}
        </select>
      </label>
      {note ? (
        <p className="second-lang__note" role="status" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>
  );
}
