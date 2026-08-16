import { useMemo, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import { useChapterVerses } from '../../hooks/useChapterVerses';
import {
  availableTranslations,
  defaultTranslationId,
  describeTranslation
} from '../../lib/scripture/providers';
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
  const translations = availableTranslations();
  // Not `translations[0]` — picker order is presentation, and it decided what
  // went to air. `defaultTranslationId()` is the choice, stated once.
  const [translation, setTranslation] = useState(defaultTranslationId);

  // Mirror of the latest intended reference, so a slow response can be discarded
  // if the operator has since moved to a different verse/reference.
  const latestReference = useRef(reference);
  latestReference.current = reference;

  const parsed = useMemo(() => parseReference(reference), [reference]);
  const bookSuggestions = useMemo(() => suggestBibleBooks(reference), [reference]);
  const showBookChips = parsed.book === null && bookSuggestions.length > 0;
  const chapters = parsed.book ? chapterNumbers(parsed.book) : [];
  /**
   * VERSE CHIPS WHENEVER THERE IS A CHAPTER TO ASK ABOUT — no gate.
   *
   * There used to be one, and it was false on first render so that the
   * graphic's prefilled reference cost nothing until somebody touched the
   * picker. Reported from the desk: "the choose verse being an input sometimes
   * still comes back on refresh… it changes to the correct one when we click a
   * different verse". That was the gate, exactly as written — after a reload
   * the box held a real reference and the picker still showed two number
   * inputs until the operator interacted, which reads as the fix for this not
   * having worked rather than as a deliberate saving.
   *
   * The saving it protected has since evaporated. The fetch is debounced by
   * 400ms in `useChapterVerses`, and its answer is cached in localStorage per
   * provider, translation, book and chapter — so the seeded reference costs ONE
   * request, once, per machine, and every reload afterwards is free. That is
   * not worth a picker that looks broken on refresh.
   */
  const verseHints = useChapterVerses(
    parsed.book,
    parsed.chapter,
    translation,
    Boolean(parsed.book && parsed.chapter)
  );

  const pickBook = (name: string) => {
    onReferenceChange(buildReference(name));
  };
  /**
   * CHOOSING A CHAPTER CHOOSES VERSE 1 WITH IT.
   *
   * It used to set `Book chapter` with no verse, which left the picker in a
   * half-chosen state — and the operator one Take away from airing whatever
   * verse the PREVIOUS reference had ended on, simply because they had not got
   * round to the verse row yet. A chapter with no verse is not a thing anybody
   * means to put on screen; verse 1 is what "I have moved to chapter 3" means.
   *
   * It loads the text too, the same way a verse chip does, so the reference on
   * the preview and the words under it can never disagree.
   */
  const pickChapter = (chapter: number) => {
    if (!parsed.book) return;
    const ref = buildReference(parsed.book, chapter, 1);
    onReferenceChange(ref);
    void runLookup(ref);
  };
  const runLookup = async (ref: string) => {
    const found = await lookup(ref, translation);
    if (!found) return; // stale (hook seq guard) or failed — reference stands, hint shows the error
    // Reference-match guard: ignore if the operator moved to a different reference
    // while this request was in flight (e.g. tapped a newer verse).
    if (latestReference.current !== ref) return;
    const { result } = found;
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
          onChange={(event) => onReferenceChange(event.target.value)}
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
          <span className="ref-picker__label">
            Choose chapter — {parsed.book}
            {/* The count, because a grid of 150 and a grid of 4 look like the
                same control until you read the numbers in them. */}
            <span className="ref-picker__count">{chapters.length}</span>
          </span>
          {/*
            A GRID THAT SHOWS EVERY CHAPTER, not a 112px window onto them.

            This row was `--scroll`: a fixed-height box with its own scrollbar,
            so Psalms showed about three rows of a hundred and fifty and the
            operator hunted for chapter 119 inside a viewport smaller than the
            list. A nested scroller is also the worst thing to hit on a trackpad
            mid-service — the wheel either moves the inner box or the page, and
            which one is a guess.

            `auto-fill` adapts to the WIDTH, so the same markup is a tight strip
            in the OBS dock and a wide block in the studio; wrapping adapts to
            the COUNT, so Jude is one chip and Psalms is a full board. Nothing is
            capped: the surrounding page already scrolls, and one honest scroll
            beats two competing ones.
          */}
          <div className="ref-picker__row ref-picker__row--grid">
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
          <span className="ref-picker__label">
            Choose verse
            {verseHints.verseCount ? (
              <span className="ref-picker__count">{verseHints.verseCount}</span>
            ) : null}
          </span>
          {verseHints.verseCount ? (
            <>
              {/* Same adaptive grid as the chapters above, for the same reason:
                  Psalm 119 has 176 verses and a 112px window onto them is not a
                  picker, it is a search. */}
              <div className="ref-picker__row ref-picker__row--grid">
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
            {/* Was the bare code. `LSG`, `DRA` and `OEB-CW` say nothing at all
                to an operator who has not met them, and the list passed a dozen
                when French arrived. Same words as the Scripture workspace's
                picker, from the same function, so the two cannot drift. */}
            {translations.map((item) => (
              <option key={item.id} value={item.id}>
                {describeTranslation(item)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--secondary btn--sm ref-picker__lookup" onClick={onLookup} disabled={status === 'loading'}>
          {status === 'loading' ? 'Looking…' : 'Look up'}
        </button>
      </div>

      <div className={`field__hint ${status === 'error' ? 'field__hint--error' : ''}`} role={status === 'error' ? 'alert' : undefined}>
        {message || 'Tap a verse to load it, or type a reference and Look up. Edit the text below before taking live.'}
      </div>
    </div>
  );
}
