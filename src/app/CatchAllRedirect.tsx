import { Navigate, useLocation } from 'react-router-dom';
import { withUrlState } from '../lib/navigateTo';
import { DEFAULT_WORKSPACE } from './workspaces/controlPaths';

/**
 * The top-level catch-all, carrying the query and hash.
 *
 * This was `<Navigate to="/control" replace />`. It is the one navigation whose
 * search loss is unrecoverable rather than merely inconvenient: every other site
 * drops `?relay=` after `getRealtimeRelayUrl` has already persisted it, so the
 * session and a reload survive on the stored value. An unmatched URL is different
 * — nothing has read the param yet, so rewriting the path first means the value is
 * gone before anything could store it, and a fresh machine or profile comes up
 * with no relay at all.
 *
 * That is reachable by ordinary means: a hand-shortened `/?relay=host:port`, a
 * typo in a pasted link, a bookmark from an older route. See issue #19.
 *
 * It targets the canonical workspace rather than `/control`, so the URL settles in
 * one redirect instead of two — `/control` would only be canonicalised again by
 * `ControlPage`.
 */
export default function CatchAllRedirect() {
  const location = useLocation();
  return <Navigate to={withUrlState(DEFAULT_WORKSPACE, location)} replace />;
}
