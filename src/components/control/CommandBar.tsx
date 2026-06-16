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
        <div className="cmd-mod cmd-mod--live">
          <span className="cmd-mod__label">Signal</span>
          <span className="cmd-mod__val"><span className="cmd-mod__dot" aria-hidden />Local</span>
        </div>
        <div className="cmd-mod cmd-mod--route">
          <span className="cmd-mod__label">Surface</span>
          <span className="cmd-mod__val">/control</span>
        </div>
        <div className="cmd-mod cmd-mod--out">
          <span className="cmd-mod__label">Output</span>
          <span className="cmd-mod__val">OBS-ready</span>
        </div>
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
