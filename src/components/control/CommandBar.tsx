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
      <div className="cmd-bar__brand">
        <span className="cmd-logo">
          <img className="cmd-logo__mark" src="/livelayer-mark.svg" alt="" aria-hidden="true" />
        </span>
        <span className="cmd-logo__copy">
          <span className="cmd-logo__name">LiveLayer</span>
          <span className="cmd-logo__sub">Broadcast control</span>
        </span>
      </div>

      <div className="cmd-cluster" role="group" aria-label="Session status">
        <span className="cmd-status"><span className="cmd-mod__dot" aria-hidden />Local session</span>
        <span className="cmd-route">/control</span>
        <span className="cmd-status cmd-status--muted">Same machine OBS</span>
      </div>

      <div className="cmd-bar__right">
        <button type="button" className="btn btn--ghost btn--md" onClick={() => openRoute('/output?debug=1')}>
          Preview Output
        </button>
        <button type="button" className="btn btn--ghost btn--md" onClick={() => openRoute('/setup')}>
          Setup
        </button>
      </div>
    </header>
  );
}
