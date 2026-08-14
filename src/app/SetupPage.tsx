import { useEffect, useMemo, useRef, useState } from 'react';
import SetupDiagnostics from '../components/control/SetupDiagnostics';

/**
 * One step, as a step.
 *
 * The page used generic panels with a kicker reading "Step 1", so three
 * sequential instructions carried exactly the same visual weight as two
 * optional reference sections below them — nothing said where the required
 * part ended. A numbered badge and a shared frame make the sequence legible
 * before a word is read, which is the whole job of an onboarding page.
 */
function Step({
  n,
  title,
  children
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="setup-step">
      <span className="setup-step__n" aria-hidden>{n}</span>
      <div className="setup-step__body">
        <h2 className="setup-step__title">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function UrlRow({
  url,
  label,
  onCopy,
  onOpen,
  openLabel
}: {
  url: string;
  label: string;
  onCopy: () => void;
  onOpen: () => void;
  openLabel: string;
}) {
  return (
    <div className="setup-url">
      <code className="setup-url__value">{url}</code>
      <div className="setup-url__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCopy} aria-label={`Copy ${label}`}>
          Copy
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpen} aria-label={`${openLabel} ${label}`}>
          {openLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * OBS onboarding — three steps and the live state of this machine.
 *
 * It used to hand out two URLs, and there are four output screens. An operator
 * following this page could not configure the split or house sources at all,
 * which made it not merely long but WRONG. Screens knows about all four, shows
 * a live preview of each and builds each address with the relay already in it,
 * so this page stops being a second, poorer source of the same thing and sends
 * the operator there.
 *
 * The rest was duplication. Each URL appeared three times — in its step, again
 * in a "Quick start" checklist that restated the steps sitting beside it, and
 * again in the diagnostics rail — so the page read as five ways to copy two
 * strings. One place each now: the dock URL here, because the dock is this
 * page's own subject, and every output screen on Screens.
 *
 * What stays in the rail is only what is TRUE RIGHT NOW — origin, storage,
 * transport — because that is the half a static document cannot carry.
 */
export default function SetupPage() {
  const controlUrl = useMemo(() => `${window.location.origin}/control`, []);
  const outputUrl = useMemo(() => `${window.location.origin}/output`, []);
  const relayUrl = useMemo(() => `${window.location.protocol}//${window.location.hostname}:4174`, []);
  const lanControlUrl = useMemo(() => `${controlUrl}?relay=${encodeURIComponent(relayUrl)}`, [controlUrl, relayUrl]);
  const lanOutputUrl = useMemo(() => `${outputUrl}?relay=${encodeURIComponent(relayUrl)}`, [outputUrl, relayUrl]);
  /** Same rule the diagnostics used: name the trap the operator is standing in. */
  const isLocalhost = useMemo(() => window.location.hostname === 'localhost', []);
  const [copyHint, setCopyHint] = useState('');
  const copyTimerRef = useRef<number | undefined>(undefined);

  const flashCopyHint = (text: string) => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    setCopyHint(text);
    copyTimerRef.current = window.setTimeout(() => {
      setCopyHint('');
      copyTimerRef.current = undefined;
    }, 2500);
  };

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopyHint(`${label} copied`);
    } catch {
      flashCopyHint(`Unable to copy ${label}`);
    }
  };

  return (
    <div className="control-root">
      <div className="control-inner setup-inner">
        <header className="cmd-bar">
          <div className="cmd-bar__brand">
            <span className="cmd-logo">
              <img className="cmd-logo__mark" src="/livelayer-mark.svg" alt="" aria-hidden="true" />
            </span>
            <span className="cmd-logo__copy">
              <span className="cmd-logo__name">LiveLayer</span>
              <span className="cmd-logo__sub">Setup &amp; OBS</span>
            </span>
          </div>
          <div className="cmd-cluster" role="group" aria-label="Surface">
            <div className="cmd-mod cmd-mod--route">
              <span className="cmd-mod__label">Surface</span>
              <span className="cmd-mod__val">/setup</span>
            </div>
          </div>
          <div className="cmd-bar__right">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.open(controlUrl, '_blank')}>
              Open control
            </button>
          </div>
        </header>

        {/* The command bar spans the viewport like every other surface; the
            content below is a centred reading column. Without this wrapper the
            page inherited the studio's full-bleed `.control-inner` frame and
            sat pinned to the left edge with no gutters. */}
        <main className="setup-main">
          <div className="setup-head">
            <p className="setup-eyebrow">Three steps, no install</p>
            <h1 className="setup-title">Connect LiveLayer to OBS</h1>
            <p className="setup-lead">
              One page becomes your control dock, and each output screen becomes a transparent browser
              source. Everything runs on this machine.
            </p>
            {/**
              * The origin, stated once, at the top.
              *
              * It is the single fact that decides whether the whole setup works
              * — the dock and every source must use this exact address or they
              * are different browsers to the storage layer and share nothing.
              * It was buried in the diagnostics column, below the fold, under a
              * heading about readiness.
              */}
            <div className="setup-origin">
              <p className="setup-origin__row">
                <span className="setup-origin__label">Use this address everywhere</span>
                <code className="setup-origin__value">{window.location.origin}</code>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  onClick={() => copyToClipboard(window.location.origin, 'Origin')}
                >
                  Copy
                </button>
              </p>
              <p className="setup-origin__why">
                The dock and every browser source must use this <em>exact</em> address. Mixing
                <code> localhost</code> and <code> 127.0.0.1</code> makes them different origins:
                they stop sharing Take/Clear and your uploaded logos.
                {isLocalhost ? ' You are on localhost — 127.0.0.1 is recommended for both.' : ''}
              </p>
            </div>
          </div>

          <div className="setup-grid">
            <div className="setup-col">
              <Step n={1} title="Add the control dock">
                <div className="setup-body">
                  <p className="setup-text">
                    Add the control page to OBS as a Custom Browser Dock — where you choose templates, edit fields, and press Take.
                  </p>
                  <UrlRow
                    url={controlUrl}
                    label="Control URL"
                    onCopy={() => copyToClipboard(controlUrl, 'Control URL')}
                    onOpen={() => window.open(controlUrl, '_blank')}
                    openLabel="Open"
                  />
                </div>
              </Step>

              <Step n={2} title="Add your output screens">
                <div className="setup-body">
                  <p className="setup-text">
                    Each OBS Browser Source is one screen — the full-frame one, the split-screen scene,
                    the house projectors. <strong>Screens</strong> lists them all with the exact address
                    for each, a live preview of what it is rendering, and whether it is reporting.
                  </p>
                  <div className="setup-actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => window.open(`${controlUrl}/screens`, '_blank')}
                    >
                      Open Screens
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => window.open(`${outputUrl}?debug=1`, '_blank')}
                    >
                      Preview output
                    </button>
                  </div>
                  <p className="setup-note">
                    Enable <strong>transparent</strong> background on every one, at 1920×1080 or your
                    scene resolution.
                  </p>
                </div>
              </Step>

              <Step n={3} title="Set each browser source up like this">
                <div className="setup-body">
                  <ul className="setup-list">
                    <li>Browser source size: 1920×1080</li>
                    <li>Enable transparent background</li>
                    <li>Refresh the browser when the scene becomes active</li>
                    <li>Use the dock for editing, the browser source for live output</li>
                  </ul>
                </div>
              </Step>

              {/**
                * Everything below is OPTIONAL and now reads that way.
                *
                * NDI and second-machine control were full panels with the same
                * weight as the three required steps, so the page looked like
                * five things to do. Collapsed, the required path is the page and
                * the rest is there when wanted.
                */}
              <details className="setup-advanced">
                <summary className="setup-advanced__summary">
                  Optional — NDI to another machine, and controlling from a tablet
                </summary>

                <div className="setup-advanced__body">
                <div className="setup-sub">
                  <h3 className="setup-sub__title">Send the OBS output over NDI</h3>
                  <div className="setup-body">
                  <p className="setup-text">
                    LiveLayer does not emit native NDI. To send graphics to another PC or Mac today, render
                    <code className="setup-kbd">/output</code> inside OBS on the graphics machine, then use
                    OBS with DistroAV/NDI to send the finished scene or program feed across the network.
                  </p>
                  <ul className="setup-list">
                    <li>Install the same NDI runtime/plugin workflow on the sending and receiving machines.</li>
                    <li>In OBS, keep the LiveLayer Browser Source above the camera/video layer.</li>
                    <li>Enable OBS NDI output for the scene/program you want to send.</li>
                    <li>On the second machine, receive that NDI feed in OBS or another NDI-compatible app.</li>
                  </ul>
                  <p className="setup-text">
                    This sends rendered video only. Control and Take/Clear still run on the local graphics
                    machine until LiveLayer has a LAN event bus.
                  </p>
                  </div>
                </div>

                <div className="setup-sub">
                  <h3 className="setup-sub__title">Control from a second machine</h3>
                  <div className="setup-body">
                  <p className="setup-text">
                    A tablet or second PC can drive the desk. On the graphics machine run
                    <code className="setup-kbd">npm run dev:lan</code> and
                    <code className="setup-kbd">npm run lan:relay</code>, then open this control URL there.
                  </p>
                  <UrlRow
                    url={lanControlUrl}
                    label="LAN Control URL"
                    onCopy={() => copyToClipboard(lanControlUrl, 'LAN Control URL')}
                    onOpen={() => window.open(lanControlUrl, '_blank')}
                    openLabel="Open"
                  />
                  <p className="setup-note">
                    Output screens take the relay automatically — the addresses on Screens already
                    include it. Check the connection with <strong>Check LAN relay</strong> in the
                    column beside this one.
                  </p>
                  <p className="setup-text">
                    This relays live commands only. Uploaded asset libraries, People, presets, and saved
                    rundowns are still stored per browser until host-owned asset storage is added.
                  </p>
                  </div>
                </div>
                </div>
              </details>
            </div>

            {/* Live state only. The checklist that used to head this column
                restated the three steps immediately to its left, and its first
                item was "open /setup" — read on /setup. */}
            <div className="setup-col setup-col--aside">
              <p className="setup-statusline" role="status" aria-live="polite">
                {copyHint || 'Checks below report what is true on this machine right now.'}
              </p>
              <SetupDiagnostics />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
