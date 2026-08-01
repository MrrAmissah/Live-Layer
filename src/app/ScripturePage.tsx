import { Link } from 'react-router-dom';

/**
 * Route-level space for the Scripture workspace.
 *
 * Deliberately a placeholder: it reserves `/scripture` as its own destination —
 * a workspace with its own bounded frame, not a panel bolted onto `/control` —
 * so the surface can be built without re-routing later. The control surface is
 * unchanged and does not link here yet; a nav entry lands with the feature, not
 * before it, so an operator can't walk into an empty room mid-service.
 *
 * Nothing here reaches for scripture lookup, speech recognition, quotation
 * detection or any AI provider. Those are separate decisions with their own
 * provider-neutral interfaces, and this file exists precisely so none of them
 * gets wired in as a side effect of the layout work.
 */
export default function ScripturePage() {
  return (
    <div className="control-root control-root--studio">
      <div className="control-inner">
        <header className="cmd-bar">
          <div className="cmd-bar__brand">
            <div className="cmd-logo__copy">
              <span className="cmd-logo__name">Scripture</span>
            </div>
          </div>
          <div className="cmd-bar__right">
            <Link className="btn btn--secondary btn--sm" to="/control">
              Back to Control
            </Link>
          </div>
        </header>

        <main className="workspace-placeholder">
          <div className="workspace-placeholder__body">
            <h1 className="workspace-placeholder__title">Scripture workspace</h1>
            <p className="workspace-placeholder__hint">
              This route is reserved. Scripture graphics are still driven from the Control surface —
              choose the Scripture Card template there.
            </p>
            <p className="workspace-placeholder__hint">
              When this workspace lands it will own reference entry, translation choice and verse
              queueing in a bounded frame of its own, the way Control does.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
