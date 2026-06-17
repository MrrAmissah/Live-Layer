import { ExternalLink, Settings, Signal, UserRound } from 'lucide-react';

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
          <span className="cmd-mod__val"><span className="cmd-mod__dot" aria-hidden />Local</span>
        </div>
        <div className="cmd-mod cmd-mod--route">
          <span className="cmd-mod__val">/control</span>
        </div>
        <div className="cmd-mod cmd-mod--out">
          <span className="cmd-mod__val"><Signal size={15} aria-hidden />OBS Ready</span>
        </div>
      </div>

      <div className="cmd-bar__right">
        <button type="button" className="btn btn--ghost btn--md" onClick={() => openRoute('/output?debug=1')}>
          <ExternalLink size={17} aria-hidden />
          Preview Output
        </button>
        <button type="button" className="btn btn--ghost btn--md" onClick={() => openRoute('/setup')}>
          <Settings size={17} aria-hidden />
          Setup
        </button>
        <span className="cmd-avatar" aria-label="Operator">
          <UserRound size={17} aria-hidden />
        </span>
      </div>
    </header>
  );
}
