import type { ScriptureProvider } from '../../types/scripture';
import { bibleApiProvider } from './bibleApiProvider';
import { createEsvProvider } from './esvApiProvider';
import { getBibleProvider } from './getBibleProvider';
import { loadEsvApiKey } from '../storage';

/**
 * Providers, in the order the picker offers their translations.
 *
 * The ESV is listed unconditionally but reports NO translations until a key is
 * stored, so it costs nothing and shows nothing until someone has one. That is
 * why the key is read through a function rather than captured here: a key
 * entered mid-session works on the next lookup, with no reload.
 */
export const esvProvider = createEsvProvider({ apiKey: loadEsvApiKey });

/**
 * Order here is picker order. `bibleApiProvider` leads because it carries the
 * public-domain English texts this church reads; `getBibleProvider` adds French,
 * with no key, so it sits with them rather than behind them; the ESV is last and
 * contributes nothing until a key is stored.
 */
export const scriptureProviders: ScriptureProvider[] = [
  bibleApiProvider,
  getBibleProvider,
  esvProvider
];
export const defaultScriptureProvider = bibleApiProvider;

/**
 * Every translation on offer, across providers, in picker order.
 *
 * A single flat list because the operator chooses a TRANSLATION, not a service
 * — "ESV" is the thing they want, and which company serves it is our problem.
 * The ESV contributes nothing until a key is stored, so this list is exactly
 * the public-domain set on a machine that has never been given one.
 */
export function availableTranslations() {
  return scriptureProviders.flatMap((provider) => provider.translations);
}

/**
 * The translation an operator gets before they choose one: the KJV.
 *
 * It used to be whatever stood first in the list — the WEB — which was not a
 * decision about this church so much as an accident of array order. This
 * congregation reads the King James aloud, and a card that has to be re-picked
 * to the right translation on every lookup is a step to forget under pressure.
 *
 * A CONSTANT, RESOLVED THROUGH THE LIST, not a re-ordering of it. Moving the
 * KJV to the top of `bibleApiProvider.translations` would set this default as a
 * side effect of presentation order, so the next person who alphabetises the
 * picker would silently change what goes to air. The picker may be ordered
 * however reads best; this says what is CHOSEN.
 *
 * The fallback matters on a machine with an unusual provider set: if nothing
 * offers the KJV, the first available translation is still better than a
 * hard-coded id nobody can serve.
 */
export const DEFAULT_TRANSLATION_ID = 'kjv';

export function defaultTranslationId(): string {
  const offered = availableTranslations();
  return offered.some((translation) => translation.id === DEFAULT_TRANSLATION_ID)
    ? DEFAULT_TRANSLATION_ID
    : (offered[0]?.id ?? DEFAULT_TRANSLATION_ID);
}

/**
 * Which provider serves this translation.
 *
 * Falls back to the default rather than throwing: a translation id saved before
 * a key was removed would otherwise break the lookup outright, where the
 * fallback merely fails to find it and says so in the usual way.
 */
export function providerForTranslation(translationId: string): ScriptureProvider {
  const found = scriptureProviders.find((provider) =>
    provider.translations.some((translation) => translation.id === translationId)
  );
  return found ?? defaultScriptureProvider;
}
