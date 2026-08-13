import { useEffect, useMemo, useRef, useState } from 'react';
import Panel from '../components/control/Panel';
import SectionHeader from '../components/control/SectionHeader';
import SetupDiagnostics from '../components/control/SetupDiagnostics';

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
            <h1 className="setup-title">Connect LiveLayer to OBS</h1>
            <p className="setup-lead">
              Add the control page as a dock and the output page as a transparent browser source. Two surfaces, no install.
            </p>
          </div>

          <div className="setup-grid">
            <div className="setup-col">
              <Panel>
                <SectionHeader kicker="Step 1" title="Add the control dock" />
                <div className="ll-panel__body setup-body">
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
              </Panel>

              <Panel>
                <SectionHeader kicker="Step 2" title="Add your output screens" />
                <div className="ll-panel__body setup-body">
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
              </Panel>

              <Panel>
                <SectionHeader kicker="Step 3" title="Recommended OBS settings" />
                <div className="ll-panel__body">
                  <ul className="setup-list">
                    <li>Browser source size: 1920×1080</li>
                    <li>Enable transparent background</li>
                    <li>Refresh the browser when the scene becomes active</li>
                    <li>Use the dock for editing, the browser source for live output</li>
                  </ul>
                </div>
              </Panel>

              <Panel>
                <SectionHeader kicker="Optional" title="Send the OBS output over NDI" />
                <div className="ll-panel__body setup-body">
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
              </Panel>

              <Panel>
                <SectionHeader kicker="Optional" title="Control from a second machine" />
                <div className="ll-panel__body setup-body">
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
              </Panel>
            </div>

            {/* Live state only. The checklist that used to head this column
                restated the three steps immediately to its left, and its first
                item was "open /setup" — read on /setup. */}
            <div className="setup-col">
              <p className="setup-statusline" role="status" aria-live="polite">
                {copyHint || 'This column reports what is true on this machine right now.'}
              </p>
              <SetupDiagnostics />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
