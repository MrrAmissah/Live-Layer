import { useMemo } from 'react';
import { useChapterVerses } from '../../hooks/useChapterVerses';
import { buildReference, parseReference, suggestBibleBooks } from '../../lib/scripture/bibleBooks';
import { chapterNumbers, numberRange } from '../../lib/scripture/bibleStructure';
import { useQuickTake } from '../../app/quickTake';

/**
 * Book → chapter → verse, by tapping. The part of choosing a passage that does
 * not involve a keyboard.
 *
 * ## Why this is its own component
 *
 * It lived inside `ScriptureReferencePicker`, which is Studio's Content tab —
 * so the Scripture page, the surface built for this exact job, had a text box
 * and nothing else. Reported as the page being "dry": the operator who opened
 * the page named after the task got less help than the one who opened the
 * template editor.
 *
 * Lifting it rather than copying it, because the two would drift. The grids
 * carry a lot of hard-won behaviour — a chapter tap means verse 1, a verse tap
 * loads the text, the count sits in the label, the rows wrap instead of
 * scrolling — and every one of those was a separate correction. A second copy
 * would have started as a duplicate and ended as a different picker.
 *
 * ## What it does NOT own
 *
 * The reference string, the translation, and what happens when a verse is
 * chosen. It edits a string and reports picks; the surface decides whether that
 * means "fill the draft", "run a lookup", or both. That is what lets Studio keep
 * its template-field behaviour and the Scripture page keep its review panel,
 * from one implementation.
 */
interface Props {
  /** The reference being built. The single source of truth — this holds none. */
  reference: string;
  /** Which translation's verse counts to ask for. Display hint only. */
  translationId: string;
  onReferenceChange: (reference: string) => void;
  /**
   * The operator chose a chapter or verse and wants the words.
   *
   * `air` is true only on a double-click with Quick take armed — the surface
   * still decides whether it honours that.
   */
  onPick?: (reference: string, options: { air: boolean }) => void;
}

export default function ScriptureReferenceGrid({
  reference,
  translationId,
  onReferenceChange,
  onPick
}: Props) {
  const quickTake = useQuickTake();
  const parsed = useMemo(() => parseReference(reference), [reference]);
  const bookSuggestions = useMemo(() => suggestBibleBooks(reference), [reference]);
  const showBookChips = parsed.book === null && bookSuggestions.length > 0;
  const chapters = parsed.book ? chapterNumbers(parsed.book) : [];

  /**
   * VERSE CHIPS WHENEVER THERE IS A CHAPTER TO ASK ABOUT — no gate.
   *
   * There used to be one, false on first render, so a prefilled reference cost
   * nothing until somebody touched the picker. Reported from the desk: "the
   * choose verse being an input sometimes still comes back on refresh". That was
   * the gate — after a reload the box held a real reference and the picker still
   * showed two number inputs, which reads as the fix not having worked.
   *
   * The saving it protected has evaporated: `useChapterVerses` debounces by
   * 400ms and caches per provider, translation, book and chapter, so a seeded
   * reference costs one request, once, per machine.
   */
  const verseHints = useChapterVerses(
    parsed.book,
    parsed.chapter,
    translationId,
    Boolean(parsed.book && parsed.chapter)
  );

  const pickBook = (name: string) => onReferenceChange(buildReference(name));

  /**
   * CHOOSING A CHAPTER CHOOSES VERSE 1 WITH IT.
   *
   * It used to set `Book chapter` with no verse, which left the picker
   * half-chosen — and the operator one Take from airing whatever verse the
   * PREVIOUS reference ended on. A chapter with no verse is not something anyone
   * means to put on screen; verse 1 is what "I have moved to chapter 3" means.
   */
  const pickChapter = (chapter: number) => {
    if (!parsed.book) return;
    const ref = buildReference(parsed.book, chapter, 1);
    onReferenceChange(ref);
    onPick?.(ref, { air: false });
  };

  const setVerse = (verseStart?: number, verseEnd?: number, load = false, air = false) => {
    if (!parsed.book || !parsed.chapter) return;
    const ref = buildReference(parsed.book, parsed.chapter, verseStart, verseEnd);
    /**
     * A double-click on the verse ALREADY loaded must still air it. The early
     * return exists so re-selecting the same verse does not refetch, and it
     * would otherwise make the second click of a double-click do nothing — the
     * common case, because the first click selected that very verse.
     */
    if (ref === reference) {
      if (air) onPick?.(ref, { air: true });
      return;
    }
    onReferenceChange(ref);
    if (load) onPick?.(ref, { air });
  };

  const verseActive = (verse: number) =>
    parsed.verseStart !== undefined &&
    verse >= parsed.verseStart &&
    verse <= (parsed.verseEnd ?? parsed.verseStart);

  return (
    <>
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

            This row was a fixed-height box with its own scrollbar, so Psalms
            showed about three rows of a hundred and fifty. A nested scroller is
            also the worst thing to hit on a trackpad mid-service — the wheel
            either moves the inner box or the page, and which one is a guess.
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
            {verseHints.verseCount ? <span className="ref-picker__count">{verseHints.verseCount}</span> : null}
          </span>
          {verseHints.verseCount ? (
            <>
              <div className="ref-picker__row ref-picker__row--grid">
                {numberRange(verseHints.verseCount).map((verse) => (
                  <button
                    key={verse}
                    type="button"
                    className={`ref-chip ref-chip--num ${verseActive(verse) ? 'ref-chip--active' : ''}`}
                    onClick={() => setVerse(verse, undefined, true)}
                    /* Single click only loads it. The second click is what airs,
                       and only while the switch is on. */
                    onDoubleClick={() => setVerse(verse, undefined, true, quickTake.enabled)}
                    title={
                      quickTake.enabled && !quickTake.blocked
                        ? `Double-click to put verse ${verse} on air`
                        : undefined
                    }
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
                    onChange={(event) =>
                      setVerse(parsed.verseStart, event.target.value ? Number(event.target.value) : undefined, true)
                    }
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
            /* Offline, or a provider with no verse counts. The number inputs do
               NOT auto-load — they keep the explicit Look up button. */
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
                onChange={(event) =>
                  setVerse(parsed.verseStart, event.target.value ? Number(event.target.value) : undefined, false)
                }
              />
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
