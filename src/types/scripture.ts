export interface ScriptureTranslation {
  /** Provider translation id, e.g. `kjv`. Sent as the request parameter. */
  id: string;
  /** Short display code shown on the graphic, e.g. `KJV`. */
  label: string;
  /** Full name, so the choice is legible as text and not just a code. */
  name?: string;
  language?: string;
  publicDomain?: boolean;
  /**
   * Set when the translation does not cover the whole canon. Surfaced in the UI
   * because a Genesis lookup against a New-Testament-only text returns "not
   * found", which reads as a broken service rather than a missing book.
   */
  partial?: string;
}

export interface ScriptureLookupResult {
  reference: string;
  text: string;
  translation: string;
  attribution?: string;
  providerId: string;
  fetchedAt: string;
}

/**
 * Injected transport, so a provider can be exercised without a network and
 * without patching globals — the same shape `postToRelay` takes.
 */
export interface ScriptureProviderDeps {
  fetchImpl?: typeof fetch;
}

export interface ScriptureProvider {
  id: string;
  label: string;
  requiresKey: boolean;
  translations: ScriptureTranslation[];
  lookup(reference: string, translation?: string, deps?: ScriptureProviderDeps): Promise<ScriptureLookupResult>;
  /**
   * Optional: return the highest verse number in a chapter, for verse hints in
   * the reference picker. Control-side only; degrade silently if unavailable.
   */
  fetchChapterVerseCount?(
    book: string,
    chapter: number,
    translation?: string,
    deps?: ScriptureProviderDeps
  ): Promise<number>;
}

/** A reference under construction in the picker (derived from the reference string). */
export interface ScriptureSelection {
  book?: string;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
  translation: string;
}

export interface ScriptureCacheEntry {
  key: string;
  result: ScriptureLookupResult;
  usedAt: string;
}
