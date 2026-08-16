import { useEffect, useMemo, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import {
  parseScriptureReference,
  formatCanonicalReference,
  formatSpans,
  type CanonicalReference,
  type VerseSpan
} from '../../lib/scripture/parseReference';
import { Icon } from '../../lib/icons';
import {
  clearScriptureRecents,
  readScriptureRecents,
  type ScriptureRecent
} from '../../lib/scripture/scriptureRecents';
import {
  isScriptureFavorite,
  readScriptureFavorites,
  toggleScriptureFavorite,
  type ScriptureFavorite
} from '../../lib/scripture/scriptureFavorites';
import type { ScriptureLookupResult } from '../../types/scripture';
import {
  availableTranslations,
  describeTranslation,
  providerForTranslation
} from '../../lib/scripture/providers';
import { getCachedScripture, saveCachedScripture } from '../../lib/scripture/scriptureCache';
import { runScriptureLookup } from '../../lib/scripture/runLookup';

interface Props {
  query: string;
  translationId: string;
  passage: ScriptureLookupResult | null;
  fromCache: boolean;
  onQueryChange: (query: string) => void;
  onTranslationChange: (translationId: string) => void;
  onPassage: (passage: ScriptureLookupResult | null, fromCache: boolean) => void;
  onAccept: (passage: ScriptureLookupResult, translationId: string) => void;
  /**
   * Put this passage in the SECOND half of the card — the dual screen's lower
   * well. Optional, so a surface that has no use for it simply does not pass it
   * and the button is not offered.
   */
  onAcceptSecond?: (passage: ScriptureLookupResult, translationId: string) => void;
  onQueue: (passage: ScriptureLookupResult, translationId: string) => void;
  onAddToRundown: (passage: ScriptureLookupResult, translationId: string) => void;
  rundownActive: boolean;
  notice: string;
  /** Increments on every accepted action, so recents refresh even when the notice repeats. */
  recentsVersion: number;
  onDismissNotice: () => void;
  /** Reference currently on the graphic draft, when it is a scripture card. */
  currentGraphicReference: string;
  /**
   * The VERSION that graphic is carrying — its `translationLabel`.
   *
   * Reported from the desk as "the scripture preview seems stuck to the old
   * version". It was not stuck; it was correct and unexplained. Changing this
   * panel's Translation empties the panel and starts no lookup by design, so
   * the staged card keeps the words and the label it was given until a new
   * passage replaces it — and the only line describing that graphic named its
   * reference and not its version, so an operator reading "KJV" in the select
   * and seeing WEB on the preview had nothing on screen tying the two together.
   */
  currentGraphicTranslation: string;
}

/**
 * Reference entry, retrieval, review and staging — the operator-facing half of
 * the Scripture workspace.
 *
 * Two surfaces, deliberately separate: the STATUS line and the PASSAGE panel.
 * Status changes on every keystroke and every request; the passage panel changes
 * only on a successful, still-wanted result or an explicit operator action. A
 * failed lookup therefore never blanks the passage the operator was reading —
 * mid-service, losing the verse you already found because a later search failed
 * is worse than the failure itself.
 *
 * There is no Take here, and no Clear. `LiveActions` in the Program rail is the
 * only place those exist, and it is already on screen.
 */
export default function ScriptureLookupPanel({
  query,
  translationId,
  passage,
  fromCache,
  onQueryChange,
  onTranslationChange,
  onPassage,
  onAccept,
  onAcceptSecond,
  onQueue,
  onAddToRundown,
  rundownActive,
  notice,
  recentsVersion,
  onDismissNotice,
  currentGraphicReference,
  currentGraphicTranslation
}: Props) {
  const { provider, status, message, failure, lookup, reset, cancel } = useScriptureLookup();
  const [recents, setRecents] = useState<ScriptureRecent[]>([]);
  const [favorites, setFavorites] = useState<ScriptureFavorite[]>([]);
  const [saveNotice, setSaveNotice] = useState('');
  /**
   * Set only when reopening a stored row could not produce the selected version
   * and fell back to the stored one. Separate from `saveNotice` because they can
   * both be true and describe different actions.
   */
  const [reopenNote, setReopenNote] = useState('');
  /** Which second language is being fetched, so its row can say so. */
  const [secondBusy, setSecondBusy] = useState('');
  const [secondNote, setSecondNote] = useState('');
  const [offline, setOffline] = useState(false);

  /**
   * Re-read after every accepted action.
   *
   * Keyed on a counter rather than the notice text: accepting John 3:16 in WEB
   * and then in KJV produces the SAME sentence, so React skipped the update and
   * the list never refreshed — the second translation was missing from recents
   * until something else happened to change the message.
   */
  useEffect(() => {
    setRecents(readScriptureRecents());
    setFavorites(readScriptureFavorites());
  }, [recentsVersion]);

  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const parsed = useMemo(() => parseScriptureReference(query), [query]);
  const pending = status === 'loading';
  const translation = availableTranslations().find((item) => item.id === translationId);

  /**
   * Locally invalid input is shown as guidance while typing, not as an error —
   * "John" is a correct halfway state on the way to "John 3:16", and shouting at
   * every keystroke trains the operator to ignore the line that also carries real
   * failures. It becomes an error only once they ask for a lookup.
   */
  const typingHint = !parsed.ok && query.trim().length > 0 ? parsed.message : '';

  /**
   * Mirror of the translation currently selected, so an in-flight request can be
   * discarded if the operator switches before it lands.
   *
   * The hook's request-id guard does NOT cover this. It only invalidates when a
   * NEWER LOOKUP starts, and changing the translation starts no lookup — it just
   * clears the panel. So a WEB request begun before the switch still passed the
   * id check and repopulated the panel with WEB wording while the select read
   * KJV, and that passage could then be staged. Mislabelled text on air is the
   * exact failure this surface exists to prevent, one level up from the cache
   * guard in the provider.
   *
   * Only the translation is compared. A result for a reference the operator has
   * since edited-but-not-submitted is still the passage they asked for, and the
   * passage panel is a separate surface from the reference box — discarding it
   * would throw away a legitimate answer.
   */
  const latestTranslation = useRef(translationId);
  latestTranslation.current = translationId;

  /**
   * WHAT IS ON THE GRAPHIC, INCLUDING WHICH VERSION.
   *
   * "The scripture preview seems stuck to the old version." It is not stuck: a
   * translation change empties this panel and starts no lookup on purpose (see
   * `changeTranslation`), so the staged card keeps the words and the label it
   * was given until a new passage replaces them. That is right — a graphic must
   * not silently change under an operator — but the line describing it named
   * only the reference, so the select could read KJV over a WEB card with
   * nothing on screen connecting the two.
   *
   * The mismatch is stated in the operator's own terms, with the action that
   * resolves it. Both labels come from the same short form (`result.translation`
   * on the graphic, `translation.label` in the picker), so they compare
   * like for like.
   */
  const selectedLabel = translation?.label ?? translationId.toUpperCase();
  const stagedVersion = currentGraphicTranslation.trim();
  const versionsDiffer =
    Boolean(stagedVersion) && stagedVersion.toLowerCase() !== selectedLabel.toLowerCase();

  const stagedGraphicLine = !currentGraphicReference
    ? 'No passage retrieved yet.'
    : versionsDiffer
      ? `The current graphic is ${currentGraphicReference} in ${stagedVersion}, and Translation is set to ${selectedLabel}. Look it up again to put ${selectedLabel} on the graphic.`
      : `The current graphic is ${currentGraphicReference}${stagedVersion ? ` (${stagedVersion})` : ''}. Look up a reference to replace it.`;

  /**
   * False once this panel is gone.
   *
   * The workspace's draft is a module store, so it outlives the component — which
   * means an await that resolves after the operator has navigated away still
   * writes into it. The concrete case: start a lookup, switch to Library, choose
   * "Reset all local data", and the in-flight response repopulates the scratchpad
   * the reset had just cleared. The hook's request id does not help; nothing
   * cancelled the request, it simply has no surface left to land on.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      /**
       * Cancel the request itself, not just its continuation. The check below
       * runs after `lookup()` returns — by which point `runScriptureLookup` has
       * already written the fetched passage to the cache, because its
       * `isCurrent()` port is the hook's request id and unmounting does not move
       * it. So leaving Scripture to run "Reset all local data" let the pending
       * response repopulate the cache the reset had just cleared.
       */
      cancel();
    };
  }, []);

  const runLookup = async (reference: string) => {
    setReopenNote('');
    const requested = translationId;
    const found = await lookup(reference, requested);
    if (!alive.current) return; // the panel is gone; the draft store is not ours to write
    if (!found) return; // stale, or a failure the hook has already reported
    if (latestTranslation.current !== requested) {
      /**
       * The hook has already written "Found …" by this point — it resolves the
       * request before this guard sees it. Returning alone would leave that
       * success on the status line above a passage panel the translation switch
       * emptied, so the surface would report finding something it is not showing.
       * `reset` puts the status back to idle for the discarded result.
       */
      reset();
      return;
    }
    // The provenance travels with the result. Hardcoding `false` here made a
    // cache hit render as a fresh fetch, so the "from saved copy" label — the one
    // thing distinguishing a stored passage from a confirmed current one —
    // never appeared on the path that most often serves one.
    onPassage(found.result, found.fromCache);
  };

  /**
   * Editing the reference retires the previous failure.
   *
   * The error line is assertive and suppresses the typing hint, so after a failed
   * lookup the operator typed a correction while an alert still described the
   * reference they had just replaced — the loudest text on screen naming input
   * that no longer existed. Clearing on the first keystroke also restores the
   * live guidance for what they are typing now.
   */
  const changeQuery = (next: string) => {
    /**
     * A settled result belongs to the reference that produced it.
     *
     * `message` takes precedence over `typingHint`, so once a lookup settled the
     * status line kept announcing it — "Found John 3:16." above someone typing
     * Romans 8 — and the live guidance for what they were typing now stayed
     * hidden behind it. Both outcomes are retired on the first keystroke.
     *
     * `loading` is deliberately left alone: that message is still true, the
     * request is still wanted, and cancelling on every keystroke would abandon a
     * lookup the operator had just submitted with Enter.
     */
    if (status === 'error' || status === 'success') reset();
    // The fallback note describes a row that was reopened, not the reference
    // being typed now.
    setReopenNote('');
    onQueryChange(next);
  };

  /**
   * Switching translation cancels the request, it does not merely outlive it.
   *
   * The comparison in `runLookup` discards the wrong-translation result, but only
   * once it arrives — until then `status` stays `loading`, which keeps Look up
   * disabled. So the operator switched WEB→KJV and then could not search, for as
   * long as a request they had already abandoned took to finish. `reset` bumps
   * the request id and returns the status to idle, so the button is usable
   * immediately and the comparison becomes a second line of defence rather than
   * the only one.
   */
  const changeTranslation = (next: string) => {
    reset();
    setReopenNote('');
    onTranslationChange(next);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    /**
     * Enter submits even though the Look up button is disabled — the disabled
     * attribute stops the click, not the form. So an operator who pressed Enter
     * twice fired a second provider request while the first was still out, and
     * this service rate-limits at roughly 15 requests per 30 seconds per IP:
     * duplicate submits spend a budget shared by every operator on the LAN, to
     * get an answer already on its way.
     */
    if (pending) return;
    void runLookup(query);
  };

  /** Rebuild the reference from adjusted spans, then re-retrieve it. */
  const adjust = (next: VerseSpan[], reference: CanonicalReference) => {
    const rebuilt = formatCanonicalReference(reference.book, reference.chapter, next);
    onQueryChange(rebuilt);
    void runLookup(rebuilt);
  };

  // Range controls act on the reference of the passage under review, so they can
  // never disagree with the text on screen.
  const reviewed = useMemo(() => (passage ? parseScriptureReference(passage.reference) : null), [passage]);
  const reviewedRef = reviewed?.ok ? reviewed.reference : null;
  const spans = reviewedRef?.spans ?? [];
  const bounds = spans.length ? { first: spans[0].start, last: spans[spans.length - 1].end } : null;

  /**
   * Edit the OUTER edges while leaving any gap intact.
   *
   * Operating on `[{start: first, end: last}]` would have been simpler and wrong:
   * extending `John 3:16,18` would have produced `John 3:16-19`, quietly adding
   * verse 17 the operator had deliberately excluded. Same silent-reinterpretation
   * failure the parser exists to prevent, one layer up. `mergeSpans` in the parser
   * collapses the result if an edit closes the gap, so `16,17,18` still
   * canonicalises to `16-18`.
   */
  const editEdge = (edge: 'first' | 'last', delta: -1 | 1): VerseSpan[] => {
    const next = spans.map((span) => ({ ...span }));
    if (edge === 'first') {
      const head = next[0];
      head.start += delta;
      // A span trimmed past its own end is gone, not inverted.
      if (head.start > head.end) next.shift();
    } else {
      const tail = next[next.length - 1];
      tail.end += delta;
      if (tail.end < tail.start) next.pop();
    }
    return next;
  };

  /** How many verses are selected in total — 1 means trimming would empty it. */
  const selectedCount = spans.reduce((total, span) => total + (span.end - span.start + 1), 0);

  /**
   * REOPENING A STORED ROW KEEPS THE VERSION THE OPERATOR HAS SELECTED.
   *
   * It used to do the opposite — `onTranslationChange(recent.translationId)` —
   * so every row dragged the picker back to whatever it was captured in. After
   * the default moved to the King James that was the whole of "I still see
   * WEB": a list of passages saved in the old version, each one silently
   * resetting the picker on click. These rows are references the operator
   * reaches for again, not a version they are choosing.
   *
   * The saved copy is NOT painted while the new version loads, and that is the
   * careful part. Showing it first would put the old wording in the passage
   * panel with a live "Set as current graphic" beside it — an operator who
   * clicked through quickly could stage the version they had just navigated
   * away from, which is precisely the mislabelled-text-on-air failure this
   * surface exists to prevent. An empty panel under "Looking…" cannot be
   * staged. It comes back only as the fallback below, named as such.
   */
  const openRecent = (recent: ScriptureRecent) => {
    /**
     * Cancel anything in flight FIRST.
     *
     * A request already in flight would otherwise still pass the hook's
     * request-id check and overwrite whatever this restores. The translation
     * guard does not catch it: a recent in the SAME translation as the pending
     * request clears that check. `reset` bumps the request id, so the older
     * lookup resolves to null.
     */
    reset();
    setReopenNote('');
    onQueryChange(recent.result.reference);

    if (recent.translationId === translationId) {
      // Already the selected version: the stored result IS the answer, so this
      // still works with no network at all.
      onPassage(recent.result, true);
      return;
    }

    onPassage(null, false);
    void reopenInSelected(recent);
  };

  /**
   * Fetch a stored row's reference in the CURRENTLY selected version, falling
   * back to the stored copy when that cannot be had.
   *
   * The fallback is the whole reason this is not just `runLookup`: offline, or
   * a reference the selected translation does not carry, must not leave the
   * operator with nothing where a passage used to be one click away. What they
   * get back is the old version, so it says so — silently serving WEB to
   * someone who selected KJV is the bug this function exists to fix.
   */
  const reopenInSelected = async (recent: ScriptureRecent) => {
    const requested = translationId;
    const requestedLabel = availableTranslations().find((item) => item.id === requested)?.label
      ?? requested.toUpperCase();
    const found = await lookup(recent.result.reference, requested);
    if (!alive.current) return;
    // Same guard as `runLookup`: the operator may have moved on mid-flight.
    if (latestTranslation.current !== requested) {
      reset();
      return;
    }
    if (found) {
      onPassage(found.result, found.fromCache);
      return;
    }
    onPassage(recent.result, true);
    setReopenNote(
      `Couldn’t get ${recent.result.reference} in ${requestedLabel} — this is the saved ${recent.result.translation} copy.`
    );
  };

  /**
   * A favourite reopens through the SAME path as a recent: identical record
   * shape, so the in-flight cancellation and the no-fetch restore both apply
   * unchanged. Nothing here asks the provider.
   */
  const openSaved = openRecent;

  /**
   * Fetch THIS passage's reference in another language and fill the second half.
   *
   * Deliberately NOT the panel's own `lookup`: that hook owns the displayed
   * passage and the status line, so using it would blank the verse the operator
   * is looking at and replace it with the translation they only wanted
   * alongside. Calling `runScriptureLookup` with the same ports keeps the cache
   * and the provider routing while leaving this surface alone.
   */
  const addSecondLanguage = async (id: string) => {
    if (!passage || !id || !onAcceptSecond) return;
    setSecondBusy(id);
    setSecondNote('');
    try {
      const outcome = await runScriptureLookup(passage.reference, id, {
        provider: providerForTranslation(id),
        getCached: getCachedScripture,
        saveCached: saveCachedScripture,
        // This request is not racing anything: it is not the surface's own
        // lookup and nothing else can supersede it.
        isCurrent: () => true,
        online: typeof navigator === 'undefined' || navigator.onLine !== false
      });
      if (!alive.current) return;
      if (outcome.kind === 'fresh' || outcome.kind === 'cached') {
        onAcceptSecond(outcome.result, id);
      } else {
        const label = availableTranslations().find((item) => item.id === id)?.label ?? id;
        setSecondNote(`Couldn’t get ${passage.reference} in ${label}. The first passage is unchanged.`);
      }
    } catch {
      if (alive.current) setSecondNote('That translation could not be reached. The first passage is unchanged.');
    } finally {
      if (alive.current) setSecondBusy('');
    }
  };

  const saved = passage ? isScriptureFavorite(passage, translationId) : false;
  const onToggleSaved = () => {
    if (!passage) return;
    const outcome = toggleScriptureFavorite(passage, translationId);
    setFavorites(outcome.entries);
    /**
     * A refusal must be visible. Saved passages do not rotate — at capacity the
     * operator decides what leaves — so a silent no-op would read as a broken
     * button rather than as a full list.
     */
    /**
     * The two refusals need different words. "Full" is a decision the operator
     * can act on; a storage failure is the device refusing to keep it, and
     * telling someone to delete a passage would not help.
     */
    setSaveNotice(
      outcome.reason === 'full'
        ? 'Saved passages is full — remove one before saving another.'
        : outcome.reason === 'storage-failed'
          ? 'Couldn’t save this passage on this device. It stays open here, but it won’t be there after a refresh.'
          : ''
    );
  };

  const stagingDisabled = !passage || pending;

  return (
    <div className="scripture-ws">
      <form className="scripture-ws__search" role="search" aria-label="Scripture lookup" onSubmit={submit}>
        <div className="scripture-ws__row">
          <label className="scripture-ws__field">
            <span className="field__label">Reference</span>
            <input
              className="field__input"
              value={query}
              placeholder="e.g. John 3:16, Psalm 23:1-3, 1 Cor 13:4-7"
              aria-label="Scripture reference"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => changeQuery(event.target.value)}
            />
          </label>
          <label className="scripture-ws__field scripture-ws__field--translation">
            <span className="field__label">Translation</span>
            <select
              className="field__input"
              value={translationId}
              onChange={(event) => changeTranslation(event.target.value)}
            >
              {availableTranslations().map((item) => (
                <option key={item.id} value={item.id}>
                  {describeTranslation(item)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn--secondary btn--md scripture-ws__lookup" disabled={pending}>
            {pending ? 'Looking…' : 'Look up'}
          </button>
        </div>

        <div className="scripture-ws__meta">
          {/*
            The tag that used to sit here said `KJV` directly beneath a select
            reading "KJV — King James Version", and was removed as the duplicate
            it was. The rule it existed for is unaffected: translation is still
            named in TEXT and never by colour alone — WEB and KJV of one verse
            are different on-air content — by the select itself, by the retrieved
            passage's own tag, by every recents row, and by the line below that
            describes the staged graphic.

            The coverage note stays, and it IS a repeat — the option string ends
            with the same "(New Testament only)". It is kept on purpose: that
            tail is the part of a long option an operator skims past, and the
            thing it predicts is a lookup that fails mid-service. The offline tag
            is not a repeat at all.
          */}
          {translation?.partial ? <span className="scripture-ws__note">{translation.partial}</span> : null}
          {offline ? (
            <span className="ll-tag ll-tag--warn">Offline — saved passages only</span>
          ) : null}
        </div>
      </form>

      {/*
        Both live regions are always mounted. Toggling `role` on a single element
        means the region does not exist at the moment its content changes, and the
        change can go unannounced. Progress and success are polite: a settling
        search must not interrupt someone verifying what is on air. Errors are
        assertive, because they block the action just requested.
      */}
      <p className="field__hint scripture-ws__status" role="status" aria-live="polite">
        {status === 'error' ? '' : message || typingHint || 'Type a reference and press Look up. Nothing goes on air until you press Take.'}
      </p>
      <p className="field__hint field__hint--error scripture-ws__status" role="alert">
        {status === 'error' ? message : ''}
      </p>

      {status === 'error' && failure === 'rate-limited' ? (
        <p className="scripture-ws__note">
          The service limits how often it can be asked. Recent passages below still work without it.
        </p>
      ) : null}

      {passage ? (
        <section className="scripture-ws__passage" aria-label="Retrieved passage">
          <header className="scripture-ws__passage-head">
            <h3 className="scripture-ws__ref">{passage.reference}</h3>
            <span className="ll-tag">{passage.translation}</span>
            {fromCache ? <span className="scripture-ws__note">from saved copy</span> : null}
            {/* Saving is not using: this writes a favourite, never a recent. */}
            <button
              type="button"
              className={`btn btn--ghost btn--xs scripture-ws__save${saved ? ' is-saved' : ''}`}
              onClick={onToggleSaved}
              aria-pressed={saved}
            >
              <Icon name={saved ? 'bookmark' : 'plus'} size={13} />
              {saved ? 'Saved' : 'Save passage'}
            </button>
          </header>
          <p className="scripture-ws__text">{passage.text}</p>
          {passage.attribution ? (
            <p className="scripture-ws__attribution">{passage.attribution}</p>
          ) : null}

          {reviewedRef && bounds ? (
            <div className="scripture-ws__range" role="group" aria-label="Verse range">
              {/* The canonical spans, not first-to-last: a readout of "16-18" over
                  a passage that is verses 16 and 18 claims a verse that is not
                  there. */}
              <span className="scripture-ws__range-readout">
                {reviewedRef.book} {reviewedRef.chapter}:{formatSpans(spans)}
              </span>
              {/* Native buttons: real tab stops, Enter/Space, and the surface's
                  focus ring with no extra CSS. Each label states the resulting
                  reference, so one press is predictable before it is pressed. */}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={pending || bounds.first <= 1}
                aria-label={`Include verse ${bounds.first - 1} — ${reviewedRef.book} ${reviewedRef.chapter}:${formatSpans(editEdge('first', -1))}`}
                onClick={() => adjust(editEdge('first', -1), reviewedRef)}
              >
                ‹ Verse before
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                /* No upper bound is asserted here: verse counts vary per chapter
                   and are provider-assisted, so a local guess would either block
                   a valid verse or invent one. Extending past the end returns an
                   honest "no passage found" and leaves the current text standing. */
                disabled={pending}
                aria-label={`Include verse ${bounds.last + 1} — ${reviewedRef.book} ${reviewedRef.chapter}:${formatSpans(editEdge('last', 1))}`}
                onClick={() => adjust(editEdge('last', 1), reviewedRef)}
              >
                Verse after ›
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={pending || selectedCount <= 1}
                aria-label={`Drop verse ${bounds.first} — ${reviewedRef.book} ${reviewedRef.chapter}:${formatSpans(editEdge('first', 1))}`}
                onClick={() => adjust(editEdge('first', 1), reviewedRef)}
              >
                − First
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={pending || selectedCount <= 1}
                aria-label={`Drop verse ${bounds.last} — ${reviewedRef.book} ${reviewedRef.chapter}:${formatSpans(editEdge('last', -1))}`}
                onClick={() => adjust(editEdge('last', -1), reviewedRef)}
              >
                − Last
              </button>
            </div>
          ) : null}

          {/*
            Staging only. These lock while a lookup is in flight so a passage can
            never be committed with a reference that has already moved on.
          */}
          <div className="scripture-ws__actions">
            <button
              type="button"
              className="btn btn--md"
              disabled={stagingDisabled}
              onClick={() => passage && onAccept(passage, translationId)}
            >
              Set as current graphic
            </button>
            {/**
              * ONE CHOICE, NOT A SECOND SEARCH.
              *
              * This was a button that staged whatever was on screen, so filling
              * the dual screen's lower well meant switching translation, typing
              * the reference again and looking it up again — reported from the
              * desk as too slow for production, and it was: the reference is
              * already known, only the language is in question.
              *
              * Picking a language fetches THIS passage's reference in it and
              * fills the second half. The panel's own passage is untouched,
              * because the fetch goes through `runScriptureLookup` directly
              * rather than the hook that owns this surface's state — same
              * cache, same provider routing, no effect on what is displayed.
              */}
            {onAcceptSecond ? (
              <label className="scripture-ws__second">
                <span className="scripture-ws__second-label">
                  {secondBusy ? 'Fetching…' : 'Add second language'}
                </span>
                <select
                  className="field__input"
                  value=""
                  disabled={stagingDisabled || Boolean(secondBusy)}
                  onChange={(event) => void addSecondLanguage(event.target.value)}
                >
                  <option value="">Choose…</option>
                  {availableTranslations()
                    /* Not the one already on the card: a passage beside itself
                       in the same translation is two of the same thing. */
                    .filter((item) => item.id !== translationId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {describeTranslation(item)}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="btn btn--secondary btn--md"
              disabled={stagingDisabled}
              onClick={() => passage && onQueue(passage, translationId)}
            >
              Add to quick queue
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--md"
              disabled={stagingDisabled}
              onClick={() => passage && onAddToRundown(passage, translationId)}
            >
              Add to rundown
            </button>
          </div>
          {rundownActive ? (
            <p className="scripture-ws__note">
              A rundown is active, so Take fires the selected rundown item — add this passage to the rundown, then
              select it there.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="scripture-ws__empty">{stagedGraphicLine}</p>
      )}

      {notice ? (
        <p className="scripture-ws__notice" role="status" aria-live="polite">
          {notice}{' '}
          <button type="button" className="btn btn--ghost btn--xs" onClick={onDismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}

      {secondNote ? (
        <p className="scripture-ws__note" role="status" aria-live="polite">{secondNote}</p>
      ) : null}

      {reopenNote ? (
        <p className="scripture-ws__note" role="status" aria-live="polite">{reopenNote}</p>
      ) : null}

      {saveNotice ? (
        <p className="scripture-ws__note" role="status" aria-live="polite">{saveNotice}</p>
      ) : null}

      {favorites.length ? (
        <section className="scripture-ws__recents" aria-label="Saved passages">
          <span className="ll-kicker">Saved passages</span>
          <div className="scripture-ws__recent-row" role="group" aria-label="Reopen a saved passage">
            {favorites.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="scripture-ws__recent"
                onClick={() => openSaved(entry)}
                title={`${entry.result.reference} · ${entry.result.translation}`}
              >
                <span className="scripture-ws__recent-ref">{entry.result.reference}</span>
                <span className="ll-tag">{entry.result.translation}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="scripture-ws__recents" aria-label="Recent passages">
        <div className="scripture-ws__recents-head">
          <span className="ll-kicker">Recent passages</span>
          {/*
            Clearing is the operator's own action and nothing else's. The list
            rolls over on its own, but a list captured under a translation the
            church has since moved off stays useful-looking and is not — which
            is how a row saved in the old version keeps getting reached for.
            `clearScriptureRecents` existed with no way to call it.

            Recents only. Saved passages are a deliberate keep and are not swept
            up by a control labelled for the list beside them.
          */}
          {recents.length ? (
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              onClick={() => {
                clearScriptureRecents();
                setRecents([]);
                setReopenNote('');
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {recents.length ? (
          <div className="scripture-ws__recent-row" role="group" aria-label="Reopen a recent passage">
            {recents.map((recent) => (
              <button
                key={recent.key}
                type="button"
                className="scripture-ws__recent"
                onClick={() => openRecent(recent)}
              >
                <span className="scripture-ws__recent-ref">{recent.result.reference}</span>
                <span className="scripture-ws__recent-tag">{recent.result.translation}</span>
                <span className="scripture-ws__recent-snip">{recent.result.text.slice(0, 48)}…</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="scripture-ws__note">
            Passages you use appear here, so you can reopen one without retyping it.
          </p>
        )}
      </section>
    </div>
  );
}
