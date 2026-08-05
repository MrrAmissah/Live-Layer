/**
 * What went wrong with a passage lookup, as a rule rather than a string.
 *
 * The hook used to collapse every failure except an empty reference into one
 * sentence — "Unable to look that up." A 404 for a verse that does not exist, a
 * 429, a dead relay and a laptop with no wifi are four different recoveries, and
 * mid-service the operator has seconds to pick one. Stating the classification
 * here (rather than inside a hook that cannot be rendered in this repo's node
 * test environment) is the same move `resolveTakeOutcome` made for take/clear.
 */

export type ScriptureFailureKind =
  | 'reference-required'
  | 'reference-invalid'
  | 'not-found'
  | 'rate-limited'
  | 'provider-unavailable'
  | 'offline'
  | 'translation-mismatch';

export interface ScriptureFailure {
  kind: ScriptureFailureKind;
  message: string;
}

/** Thrown by a provider so the classifier can tell HTTP outcomes apart. */
export class ScriptureHttpError extends Error {
  constructor(public readonly status: number) {
    super(`lookup-failed-${status}`);
    this.name = 'ScriptureHttpError';
  }
}

/** Thrown when a provider answers with text for a translation we did not ask for. */
export class ScriptureTranslationMismatchError extends Error {
  constructor(
    public readonly requested: string,
    public readonly received: string
  ) {
    super(`translation-mismatch-${requested}-${received}`);
    this.name = 'ScriptureTranslationMismatchError';
  }
}

export interface FailureContext {
  /** The canonical reference the operator asked for, when there is one. */
  reference?: string;
  /** Label of the translation requested, for messages that name it. */
  translation?: string;
  /** `navigator.onLine`, passed in so this stays pure. */
  online?: boolean;
}

/**
 * Classify a thrown lookup error.
 *
 * Offline wins over transport failure: a fetch on a disconnected machine rejects
 * with a generic TypeError, and telling the operator the Bible service is down
 * sends them debugging the wrong thing.
 */
export function classifyScriptureError(error: unknown, context: FailureContext = {}): ScriptureFailure {
  const { reference, translation, online = true } = context;
  const named = reference ? `"${reference}"` : 'that reference';

  if (error instanceof ScriptureTranslationMismatchError) {
    return {
      kind: 'translation-mismatch',
      message: `The Bible service returned ${error.received.toUpperCase()} text for a ${error.requested.toUpperCase()} request, so ${named} was not saved. Try again or pick another translation.`
    };
  }

  if (error instanceof Error && error.message === 'reference-required') {
    return { kind: 'reference-required', message: 'Enter a scripture reference, for example John 3:16.' };
  }

  if (error instanceof ScriptureHttpError) {
    if (error.status === 404) {
      return {
        kind: 'not-found',
        message: `No passage found for ${named}${translation ? ` in ${translation.toUpperCase()}` : ''}. Check the chapter and verse.`
      };
    }
    if (error.status === 429) {
      return {
        kind: 'rate-limited',
        message: 'The Bible service is busy. Wait a few seconds, then look up again.'
      };
    }
    return {
      kind: 'provider-unavailable',
      message: `The Bible service returned an error (${error.status}). Recent passages still work, or paste the verse text in.`
    };
  }

  if (error instanceof Error && error.message === 'lookup-not-found') {
    return {
      kind: 'not-found',
      message: `No passage found for ${named}${translation ? ` in ${translation.toUpperCase()}` : ''}. Check the chapter and verse.`
    };
  }

  if (!online) {
    return {
      kind: 'offline',
      message: `You're offline, and ${named} isn't saved yet. Recent passages still work.`
    };
  }

  return {
    kind: 'provider-unavailable',
    message: "Can't reach the Bible service. Recent passages still work, or paste the verse text in."
  };
}

/** A failure the operator can retry as-is (as opposed to one they must edit). */
export const isRetryable = (kind: ScriptureFailureKind): boolean =>
  kind === 'rate-limited' || kind === 'provider-unavailable' || kind === 'offline' || kind === 'translation-mismatch';
