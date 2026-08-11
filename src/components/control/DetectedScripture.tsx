import { useEffect } from 'react';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * The passage LiveLayer thinks was named — the dominant thing on the surface.
 *
 * The old layout put a manual reference form first, recents second, and voice
 * assist in a small box underneath. That is the wrong order for live operation.
 * Mid-service the operator is watching OBS and listening to a preacher, and the
 * questions they need answered in under two seconds are: *is it hearing me, what
 * does it think was said, and is that Scripture right?* The Bible text answers the
 * last one, so the Bible text is what gets the space.
 *
 * ## What it does not do
 *
 * Retrieval is automatic; **acceptance is not**. This renders a passage for the
 * operator to read and offers one button. It cannot stage, queue, publish or Take,
 * and the passage does not reach the graphic until `onAccept` is pressed — after
 * which a separate Take is still required. Automating the *reading* removed a
 * click that only ever delayed the decision; automating the decision would remove
 * the review this whole feature is built on.
 */

interface Props {
  reference: string;
  /** Why this reading was reached — including `heard "jon"` for a recovered book. */
  interpretation: string;
  passage: ScriptureLookupResult | null;
  resolving: boolean;
  accepted: boolean;
  canAccept: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  /** Fired once the passage is actually on screen, to close the latency timeline. */
  onRendered: () => void;
  /** The speaker is still talking — this reading may still change. */
  provisional?: boolean;
}

export default function DetectedScripture({
  reference,
  interpretation,
  passage,
  resolving,
  accepted,
  canAccept,
  onAccept,
  onDismiss,
  onRendered,
  provisional = false
}: Props) {
  useEffect(() => {
    // The operator metric ends when the verse is visible, not when it arrived.
    if (passage) onRendered();
    // `onRendered` is intentionally not a dependency: it closes over a ref and
    // re-running on every parent render would re-close a finished timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage]);

  return (
    <article
      className="detected"
      data-resolving={resolving || undefined}
      data-provisional={provisional || undefined}
      aria-live="polite"
    >
      <header className="detected__head">
        <h3 className="detected__ref">{reference || 'Listening…'}</h3>
        {passage ? <span className="ll-tag">{passage.translation}</span> : null}
        {/* Honest about what this is. A guess from speech still in progress must
            not look like a settled answer — the operator is deciding from it. */}
        <span className="detected__stage">{provisional ? 'Updating while you speak' : 'Ready to review'}</span>
      </header>

      {interpretation ? <p className="detected__why">{interpretation}</p> : null}

      {passage ? (
        <>
          <p className="detected__text">{passage.text}</p>
          {passage.attribution ? <p className="detected__attribution">{passage.attribution}</p> : null}
        </>
      ) : (
        /* A stated waiting state, sized like the text it will become, so the card
           does not jump when the passage lands and move the Accept button under a
           pointer that was already travelling toward it. */
        <p className="detected__text detected__text--pending">
          {resolving ? 'Retrieving the passage…' : 'No passage text yet.'}
        </p>
      )}

      <div className="detected__actions">
        <button type="button" className="btn btn--md" onClick={onAccept} disabled={!canAccept}>
          {accepted ? 'Accepted' : 'Accept into Scripture draft'}
        </button>
        <button type="button" className="btn btn--ghost btn--md" onClick={onDismiss}>
          Dismiss
        </button>
        {/* Said once, here, rather than repeated as prose around the panel: after
            Accept the graphic is prepared, and airing is still a separate press. */}
        <span className="detected__note">Accepting prepares the graphic — Take is separate.</span>
      </div>
    </article>
  );
}
