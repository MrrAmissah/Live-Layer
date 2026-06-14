export interface ScriptureTranslation {
  id: string;
  label: string;
  publicDomain?: boolean;
}

export interface ScriptureLookupResult {
  reference: string;
  text: string;
  translation: string;
  attribution?: string;
  providerId: string;
  fetchedAt: string;
}

export interface ScriptureProvider {
  id: string;
  label: string;
  requiresKey: boolean;
  translations: ScriptureTranslation[];
  lookup(reference: string, translation?: string): Promise<ScriptureLookupResult>;
  /**
   * Optional: return the highest verse number in a chapter, for verse hints in
   * the reference picker. Control-side only; degrade silently if unavailable.
   */
  fetchChapterVerseCount?(book: string, chapter: number, translation?: string): Promise<number>;
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
