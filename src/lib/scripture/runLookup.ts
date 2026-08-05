import type { ScriptureLookupResult, ScriptureProvider } from '../../types/scripture';
import { scriptureCacheKey } from './referenceParser';
import { parseScriptureReference, type ReferenceProblem } from './parseReference';
import { classifyScriptureError, type ScriptureFailure } from './lookupOutcome';

/**
 * One lookup, stated as a rule instead of hidden inside a hook.
 *
 * The sequencing this performs — parse, consult the cache, fetch, discard if a
 * newer request has started, only then write — is the part that actually has to
 * be right, and it was previously unreachable by any test: it lived in
 * `useScriptureLookup` behind `useRef`/`useState`, and this repo's vitest runs in
 * node with no DOM and no testing-library, so there was no way to interleave two
 * requests and assert the older one loses. A stale-async test written against the
 * hook could only have run the two calls sequentially, where the guard never
 * engages and the assertion passes whether or not the guard exists.
 *
 * So the decision moves here behind an `isCurrent` port, the same move
 * `resolveTakeOutcome` made for take/clear. The hook keeps the ref; this keeps
 * the rule.
 */

export interface LookupPorts {
  provider: Pick<ScriptureProvider, 'id' | 'lookup'>;
  getCached: (key: string) => Promise<ScriptureLookupResult | null>;
  saveCached: (key: string, result: ScriptureLookupResult) => Promise<void>;
  /** False once a newer request has started. Checked after every await. */
  isCurrent: () => boolean;
  online?: boolean;
}

export type LookupOutcome =
  | { kind: 'stale' }
  | { kind: 'invalid'; problem: ReferenceProblem; message: string }
  | { kind: 'cached'; result: ScriptureLookupResult; canonical: string }
  | { kind: 'fresh'; result: ScriptureLookupResult; canonical: string }
  | { kind: 'failed'; failure: ScriptureFailure; canonical: string };

export async function runScriptureLookup(
  reference: string,
  translation: string,
  ports: LookupPorts
): Promise<LookupOutcome> {
  /**
   * Parse before asking anyone. The chip parser degrades what it cannot read
   * into a bare book, so `John 3:16,18` once reached the provider as `John` — a
   * request for the whole book, answered with a plausible-looking passage.
   */
  const parsed = parseScriptureReference(reference);
  if (!parsed.ok) {
    return { kind: 'invalid', problem: parsed.problem, message: parsed.message };
  }

  const canonical = parsed.reference.canonical;
  // Keyed by provider AND translation, so WEB and KJV of one verse never collide.
  const key = scriptureCacheKey(ports.provider.id, translation, canonical);

  try {
    const cached = await ports.getCached(key);
    if (!ports.isCurrent()) return { kind: 'stale' };
    if (cached) return { kind: 'cached', result: cached, canonical };

    const result = await ports.provider.lookup(canonical, translation);

    /**
     * Guard BEFORE the write, not after. The save used to run first, so a
     * response the operator had already moved on from was still persisted — the
     * discarded answer quietly became the cached one for that reference, and the
     * cache has no TTL to age it out.
     */
    if (!ports.isCurrent()) return { kind: 'stale' };
    await ports.saveCached(key, result);
    return { kind: 'fresh', result, canonical };
  } catch (error) {
    if (!ports.isCurrent()) return { kind: 'stale' };
    return {
      kind: 'failed',
      canonical,
      failure: classifyScriptureError(error, {
        reference: canonical,
        translation,
        online: ports.online ?? true
      })
    };
  }
}
