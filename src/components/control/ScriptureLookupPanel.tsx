import { useEffect, useMemo, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import {
  parseScriptureReference,
  formatCanonicalReference,
  formatSpans,
  type CanonicalReference,
  type VerseSpan
} from '../../lib/scripture/parseReference';
import { readScriptureRecents, type ScriptureRecent } from '../../lib/scripture/scriptureRecents';
import type { ScriptureLookupResult } from '../../types/scripture';

interface Props {
  query: string;
  translationId: string;
  passage: ScriptureLookupResult | null;
  fromCache: boolean;
  onQueryChange: (query: string) => void;
  onTranslationChange: (translationId: string) => void;
  onPassage: (passage: ScriptureLookupResult | null, fromCache: boolean) => void;
  onAccept: (passage: ScriptureLookupResult, translationId: string) => void;
  onQueue: (passage: ScriptureLookupResult, translationId: string) => void;
  onAddToRundown: (passage: ScriptureLookupResult, translationId: string) => void;
  rundownActive: boolean;
  notice: string;
  /** Increments on every accepted action, so recents refresh even when the notice repeats. */
  recentsVersion: number;
  onDismissNotice: () => void;
  /** Reference currently on the graphic draft, when it is a scripture card. */
  currentGraphicReference: string;
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
  onQueue,
  onAddToRundown,
  rundownActive,
  notice,
  recentsVersion,
  onDismissNotice,
  currentGraphicReference
}: Props) {
  const { provider, status, message, failure, lookup, reset, cancel } = useScriptureLookup();
  const [recents, setRecents] = useState<ScriptureRecent[]>([]);
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
  const translation = provider.translations.find((item) => item.id === translationId);

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
    onTranslationChange(next);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
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

  const openRecent = (recent: ScriptureRecent) => {
    /**
     * Cancel anything in flight FIRST.
     *
     * Reopening a recent starts no lookup of its own, so a request already in
     * flight still passed the hook's request-id check and overwrote the restored
     * passage when it landed. The translation guard above does not catch it: a
     * recent in the SAME translation as the pending request clears that check.
     * `reset` bumps the request id, so the older lookup resolves to null.
     */
    reset();
    // No fetch: the stored result is complete, so this works with no network.
    onQueryChange(recent.result.reference);
    onTranslationChange(recent.translationId);
    onPassage(recent.result, true);
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
              {provider.translations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} — {item.name ?? item.label}
                  {item.partial ? ` (${item.partial})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn--secondary btn--md scripture-ws__lookup" disabled={pending}>
            {pending ? 'Looking…' : 'Look up'}
          </button>
        </div>

        <div className="scripture-ws__meta">
          {/* Translation is named in text, never by colour alone — WEB and KJV of
              one verse are different on-air content, and airing the wrong one is a
              real mistake. */}
          <span className="ll-tag">{translation?.label ?? translationId.toUpperCase()}</span>
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
        <p className="scripture-ws__empty">
          {currentGraphicReference
            ? `The current graphic is ${currentGraphicReference}. Look up a reference to replace it.`
            : 'No passage retrieved yet.'}
        </p>
      )}

      {notice ? (
        <p className="scripture-ws__notice" role="status" aria-live="polite">
          {notice}{' '}
          <button type="button" className="btn btn--ghost btn--xs" onClick={onDismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}

      <section className="scripture-ws__recents" aria-label="Recent passages">
        <span className="ll-kicker">Recent passages</span>
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
