/** Opens an app route in a new tab (output source / setup dock helpers). */
function openRoute(path: string) {
  window.open(`${window.location.origin}${path}`, '_blank');
}

/**
 * Top command bar. Identity + operating-mode readouts on the left, quick
 * links to the OBS surfaces on the right. Deliberately compact so it reads as
 * a hardware faceplate, not a web header.
 */
export default function CommandBar() {
  return (
    <header className="cmd-bar">
      <div className="cmd-bar__left">
        <span className="cmd-logo">
          <img className="cmd-logo__mark" src="/livelayer-mark.svg" alt="" aria-hidden="true" />
          <span className="cmd-logo__copy">
            <span className="cmd-logo__name">LiveLayer</span>
            <span className="cmd-logo__sub">Control room</span>
          </span>
        </span>
        <span className="cmd-divider" aria-hidden />
        <span className="cmd-badge cmd-badge--live">
          <span className="cmd-badge__dot" aria-hidden />
          Local
        </span>
        <span className="cmd-badge cmd-badge--route">/control</span>
        <span className="cmd-hint">
          <span className="cmd-hint__key" aria-hidden />
          OBS-ready output
        </span>
      </div>
      <div className="cmd-bar__right">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => openRoute('/output?debug=1')}>
          Output debug
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => openRoute('/setup')}>
          Setup
        </button>
      </div>
    </header>
  );
}
