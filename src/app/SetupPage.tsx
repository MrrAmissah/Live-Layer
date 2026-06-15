import { useMemo, useState } from 'react';
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
        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpen}>
          {openLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * OBS onboarding. Same content as before, restyled onto the control-surface
 * design language (panels + buttons) so /setup and /control feel like one app.
 */
export default function SetupPage() {
  const controlUrl = useMemo(() => `${window.location.origin}/control`, []);
  const outputUrl = useMemo(() => `${window.location.origin}/output`, []);
  const [copyHint, setCopyHint] = useState('');

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(`${label} copied`);
      window.setTimeout(() => setCopyHint(''), 2500);
    } catch {
      setCopyHint(`Unable to copy ${label}`);
    }
  };

  return (
    <div className="control-root">
      <div className="control-inner setup-inner">
        <header className="cmd-bar">
          <div className="cmd-bar__left">
            <span className="cmd-logo">
              <img className="cmd-logo__mark" src="/livelayer-mark.svg" alt="" aria-hidden="true" />
              LiveLayer
            </span>
            <span className="cmd-divider" aria-hidden />
            <span className="cmd-badge cmd-badge--route">/setup</span>
          </div>
          <div className="cmd-bar__right">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.open(controlUrl, '_blank')}>
              Open control
            </button>
          </div>
        </header>

        <div className="setup-grid">
          <div className="setup-col">
            <div className="setup-head">
              <h1 className="setup-title">Connect LiveLayer to OBS</h1>
              <p className="setup-lead">
                Add the control page as a dock and the output page as a transparent browser source. Two surfaces, no install.
              </p>
            </div>

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
              <SectionHeader kicker="Step 2" title="Add the output source" />
              <div className="ll-panel__body setup-body">
                <p className="setup-text">
                  Add the output page as an OBS Browser Source. Enable <strong>transparent</strong> background at 1920×1080 (or your scene resolution).
                </p>
                <UrlRow
                  url={outputUrl}
                  label="Output URL"
                  onCopy={() => copyToClipboard(outputUrl, 'Output URL')}
                  onOpen={() => window.open(`${outputUrl}?debug=1`, '_blank')}
                  openLabel="Debug"
                />
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
          </div>

          <div className="setup-col">
            <Panel className="setup-aside">
              <SectionHeader kicker="Checklist" title="Quick start" />
              <div className="ll-panel__body setup-body">
                <ol className="setup-steps">
                  <li>Open <code className="setup-kbd">/setup</code> to copy the OBS URLs.</li>
                  <li>Add <code className="setup-kbd">/control</code> as an OBS dock.</li>
                  <li>Add <code className="setup-kbd">/output</code> as a browser source.</li>
                  <li>Pick a template, edit values, press Take.</li>
                  <li>Use the debug output to verify transparency.</li>
                </ol>
                <p className="setup-statusline">{copyHint || 'Copy either URL and open it to verify the connection.'}</p>
              </div>
            </Panel>
            <SetupDiagnostics />
          </div>
        </div>
      </div>
    </div>
  );
}
