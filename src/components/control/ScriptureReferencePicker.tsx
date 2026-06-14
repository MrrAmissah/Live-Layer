import { useMemo, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import { useChapterVerses } from '../../hooks/useChapterVerses';
import { buildReference, parseReference, suggestBibleBooks } from '../../lib/scripture/bibleBooks';
import { chapterNumbers, numberRange } from '../../lib/scripture/bibleStructure';

interface Props {
  reference: string;
  onReferenceChange: (reference: string) => void;
  onApply: (values: { reference: string; verseText: string; translationLabel: string }) => void;
}

/**
 * Beginner-friendly Scripture reference picker: type or tap a book → chapter →
 * verse, then Look up. The reference string is the single source of truth — both
 * direct typing and chip taps build it — so there is no dual-state drift.
 * Tapping chips only edits the draft reference; only the explicit Look up button
 * fills the verse text (which the operator then edits in the field below).
 */
export default function ScriptureReferencePicker({ reference, onReferenceChange, onApply }: Props) {
  const { provider, status, message, lookup } = useScriptureLookup();
  const [translation, setTranslation] = useState(provider.translations[0]?.id ?? 'web');
  // Verse hints fetch only after an explicit chapter tap — never for the prefilled default.
  const [versesRequested, setVersesRequested] = useState(false);

  const parsed = useMemo(() => parseReference(reference), [reference]);
  const bookSuggestions = useMemo(() => suggestBibleBooks(reference), [reference]);
  const showBookChips = parsed.book === null && bookSuggestions.length > 0;
  const chapters = parsed.book ? chapterNumbers(parsed.book) : [];
  const verseHints = useChapterVerses(parsed.book, parsed.chapter, translation, versesRequested);

  const pickBook = (name: string) => {
    setVersesRequested(false);
    onReferenceChange(buildReference(name));
  };
  const pickChapter = (chapter: number) => {
    if (!parsed.book) return;
    setVersesRequested(true);
    onReferenceChange(buildReference(parsed.book, chapter));
  };
  const runLookup = async (ref: string) => {
    const result = await lookup(ref, translation);
    if (!result) return; // silent on failure — the reference stands, hint shows the error
    onApply({ reference: result.reference, verseText: result.text, translationLabel: result.translation });
  };

  // Picking a verse via chips auto-loads its text (cached) so the preview's
  // reference and verse never disagree — like Bible presentation software.
  // It fires only when the reference actually changes: switching verses replaces
  // the text, while editing the verse without changing the reference is
  // preserved. Typed references and the offline number inputs do NOT auto-load
  // (they keep the explicit Lookup button).
  const setVerse = (verseStart?: number, verseEnd?: number, autoLoad = false) => {
    if (!parsed.book || !parsed.chapter) return;
    const ref = buildReference(parsed.book, parsed.chapter, verseStart, verseEnd);
    if (ref === reference) return;
    onReferenceChange(ref);
    if (autoLoad) void runLookup(ref);
  };

  const onLookup = () => runLookup(reference);

  const verseActive = (verse: number) =>
    parsed.verseStart !== undefined &&
    verse >= parsed.verseStart &&
    verse <= (parsed.verseEnd ?? parsed.verseStart);

  return (
    <div className="ref-picker">
      <div className="ref-picker__section">
        <span className="ref-picker__label">Choose book</span>
        <input
          className="field__input"
          value={reference}
          placeholder="e.g. John 3:16 or Psalm 23:1-3"
          aria-label="Scripture reference"
          onChange={(event) => {
            setVersesRequested(false);
            onReferenceChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onLookup();
            }
          }}
        />
        {showBookChips ? (
          <div className="ref-picker__row" role="listbox" aria-label="Book suggestions">
            {bookSuggestions.map((book) => (
              <button
                key={book.name}
                type="button"
                className="ref-chip"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickBook(book.name)}
              >
                {book.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {parsed.book ? (
        <div className="ref-picker__section">
          <span className="ref-picker__label">Choose chapter — {parsed.book}</span>
          <div className="ref-picker__row ref-picker__row--scroll">
            {chapters.map((chapter) => (
              <button
                key={chapter}
                type="button"
                className={`ref-chip ref-chip--num ${parsed.chapter === chapter ? 'ref-chip--active' : ''}`}
                onClick={() => pickChapter(chapter)}
              >
                {chapter}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {parsed.book && parsed.chapter ? (
        <div className="ref-picker__section">
          <span className="ref-picker__label">Choose verse</span>
          {verseHints.verseCount ? (
            <>
              <div className="ref-picker__row ref-picker__row--scroll">
                {numberRange(verseHints.verseCount).map((verse) => (
                  <button
                    key={verse}
                    type="button"
                    className={`ref-chip ref-chip--num ${verseActive(verse) ? 'ref-chip--active' : ''}`}
                    onClick={() => setVerse(verse, undefined, true)}
                  >
                    {verse}
                  </button>
                ))}
              </div>
              {parsed.verseStart ? (
                <label className="ref-picker__range">
                  <span>to verse</span>
                  <select
                    className="field__input"
                    value={parsed.verseEnd ?? ''}
                    onChange={(event) => setVerse(parsed.verseStart, event.target.value ? Number(event.target.value) : undefined, true)}
                  >
                    <option value="">— single</option>
                    {numberRange(verseHints.verseCount)
                      .filter((verse) => verse > (parsed.verseStart ?? 0))
                      .map((verse) => (
                        <option key={verse} value={verse}>
                          {verse}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : (
            <div className="ref-picker__verse-inputs">
              <input
                className="field__input"
                type="number"
                min={1}
                placeholder="Start"
                value={parsed.verseStart ?? ''}
                onChange={(event) => setVerse(Number(event.target.value) || undefined, parsed.verseEnd, false)}
              />
              <span>to</span>
              <input
                className="field__input"
                type="number"
                min={1}
                placeholder="End (optional)"
                value={parsed.verseEnd ?? ''}
                onChange={(event) => setVerse(parsed.verseStart, event.target.value ? Number(event.target.value) : undefined, false)}
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="ref-picker__actions">
        <label className="ref-picker__translation">
          <span className="ref-picker__label">Translation</span>
          <select
            className="field__input"
            value={translation}
            onChange={(event) => setTranslation(event.target.value)}
          >
            {provider.translations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--secondary btn--sm ref-picker__lookup" onClick={onLookup} disabled={status === 'loading'}>
          {status === 'loading' ? 'Looking…' : 'Lookup scripture'}
        </button>
      </div>

      <div className={`field__hint ${status === 'error' ? 'field__hint--error' : ''}`}>
        {message || 'Tap a verse to load it, or type a reference and Look up. Edit the text below before taking live.'}
      </div>
    </div>
  );
}
