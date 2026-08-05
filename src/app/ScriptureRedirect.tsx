import { Navigate, useLocation } from 'react-router-dom';
import { SCRIPTURE_WORKSPACE } from './workspaces/controlPaths';

/**
 * `/scripture` → `/control/scripture`, carrying the query and hash.
 *
 * This replaces the placeholder page that reserved the URL. The workspace had to
 * move inside the `/control` layout to reach the one realtime channel and the one
 * Take, so the reserved address becomes a redirect rather than a dead end — no
 * empty room remains behind a linked feature.
 *
 * `search` and `hash` are not optional. `/setup` hands operators a LAN URL shaped
 * `…?relay=host:port`, the relay is read off the URL when the channel is built,
 * and a path-only redirect strips it — which on a machine with no stored relay
 * brings the controller up with no relay at all and its commands never reach the
 * remote output. That cost a P1 on the previous stage; the same shape fixes it.
 *
 * `replace`, so Back returns wherever the operator came from instead of bouncing
 * off the redirect.
 */
export default function ScriptureRedirect() {
  const location = useLocation();
  return (
    <Navigate to={{ pathname: SCRIPTURE_WORKSPACE, search: location.search, hash: location.hash }} replace />
  );
}
