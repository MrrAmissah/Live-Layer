import type { ScriptureProvider } from '../../types/scripture';
import { bibleApiProvider } from './bibleApiProvider';
import { createEsvProvider } from './esvApiProvider';
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

export const scriptureProviders: ScriptureProvider[] = [bibleApiProvider, esvProvider];
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
