import { useEffect, useState } from 'react';
import Panel from './Panel';
import SectionHeader from './SectionHeader';
import { deleteAsset, getAssetBlob, saveAsset } from '../../lib/assets/assetStore';

type CheckState = 'pending' | 'ok' | 'warn' | 'fail';
interface Check {
  label: string;
  state: CheckState;
  detail: string;
}

// Namespaced so it can never collide with a real crypto.randomUUID() asset id.
const DIAG_ASSET_ID = '__livelayer_diag__';

function probeLocalStorage(): Check {
  const label = 'Save presets & settings (localStorage)';
  try {
    const key = DIAG_ASSET_ID;
    localStorage.setItem(key, '1');
    const ok = localStorage.getItem(key) === '1';
    localStorage.removeItem(key);
    return { label, state: ok ? 'ok' : 'fail', detail: ok ? 'Available' : 'Read-back failed' };
  } catch {
    return { label, state: 'fail', detail: 'Blocked — presets won’t persist (private mode?)' };
  }
}

function probeIndexedDB(): Check {
  const label = 'Store uploaded images (IndexedDB)';
  const ok = typeof indexedDB !== 'undefined' && indexedDB !== null;
  return {
    label,
    state: ok ? 'ok' : 'fail',
    detail: ok ? 'Available in this page — OBS must use the same origin (see below)' : 'Unavailable — uploaded logos/headshots won’t persist'
  };
}

function probeBroadcastChannel(): Check {
  const label = 'Send graphics Control → Output (BroadcastChannel)';
  const ok = typeof BroadcastChannel !== 'undefined';
  return {
    label,
    state: ok ? 'ok' : 'warn',
    detail: ok ? 'Available' : 'Missing — falls back to localStorage signalling (still works same-origin)'
  };
}

const PILL: Record<CheckState, string> = {
  pending: 'diag-pill--pending',
  ok: 'diag-pill--ok',
  warn: 'diag-pill--warn',
  fail: 'diag-pill--fail'
};
const PILL_LABEL: Record<CheckState, string> = { pending: '…', ok: 'OK', warn: 'Check', fail: 'Fail' };

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="diag-check">
      <span className={`diag-pill ${PILL[check.state]}`}>{PILL_LABEL[check.state]}</span>
      <span className="diag-check__text">
        <span className="diag-check__label">{check.label}</span>
        <span className="diag-check__detail">{check.detail}</span>
      </span>
    </div>
  );
}

/**
 * Production diagnostics for `/setup`: shows this page's origin, the same-origin
 * rule that uploaded images and Take/Clear depend on, and quick capability
 * checks. The checks prove this page works — they do NOT prove the OBS dock and
 * Browser Source share storage; the real end-to-end test is Take → refresh
 * `/output` → confirm it returns.
 */
export default function SetupDiagnostics() {
  const origin = window.location.origin;
  const isLocalhost = window.location.hostname === 'localhost';
  const controlUrl = `${origin}/control`;
  const outputUrl = `${origin}/output`;

  const [checks, setChecks] = useState<Check[]>([]);
  const [assetTest, setAssetTest] = useState<Check>({
    label: 'Read/write a test image to local storage',
    state: 'pending',
    detail: 'Not run yet — tap “Run storage test”.'
  });
  const [copyHint, setCopyHint] = useState('');

  useEffect(() => {
    // Cheap, read-only-ish checks run automatically; the asset write-test is opt-in.
    setChecks([probeLocalStorage(), probeIndexedDB(), probeBroadcastChannel()]);
  }, []);

  const runAssetTest = async () => {
    setAssetTest({ label: 'Read/write a test image to local storage', state: 'pending', detail: 'Testing…' });
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      setAssetTest({ label: 'Read/write a test image to local storage', state: 'fail', detail: 'IndexedDB unavailable in this browser/context.' });
      return;
    }
    const now = new Date().toISOString();
    try {
      const blob = new Blob(['livelayer-diagnostic'], { type: 'text/plain' });
      await saveAsset(
        { id: DIAG_ASSET_ID, type: 'generic', name: 'diagnostic', source: 'uploaded', blobKey: DIAG_ASSET_ID, createdAt: now, updatedAt: now },
        blob
      );
      const readBack = await getAssetBlob(DIAG_ASSET_ID);
      const ok = !!readBack && readBack.size === blob.size;
      setAssetTest({
        label: 'Read/write a test image to local storage',
        state: ok ? 'ok' : 'fail',
        detail: ok ? 'Wrote and read back a test image — local image storage works here.' : 'Wrote but could not read back the test image.'
      });
    } catch {
      setAssetTest({ label: 'Read/write a test image to local storage', state: 'fail', detail: 'Write/read failed — storage may be blocked (private mode?).' });
    } finally {
      // Always clean up the throwaway record, even if the read/assert threw.
      try {
        await deleteAsset(DIAG_ASSET_ID);
      } catch {
        /* ignore cleanup errors */
      }
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(`${label} copied`);
    } catch {
      setCopyHint(`Copy ${label} manually`);
    }
    window.setTimeout(() => setCopyHint(''), 2500);
  };

  return (
    <Panel className="setup-aside">
      <SectionHeader kicker="Diagnostics" title="Production readiness" />
      <div className="ll-panel__body setup-body">
        <div className="diag-origin">
          <span className="diag-origin__label">This page’s origin</span>
          <code className="setup-url__value">{origin}</code>
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => copy(origin, 'Origin')}>Copy</button>
        </div>

        <div className="diag-warn">
          <strong>Use the same origin everywhere.</strong> Add the OBS dock and the
          Browser Source at the <em>exact same</em> address. Don’t mix
          <code> localhost</code> and <code> 127.0.0.1</code> — they are different
          origins and won’t share Take/Clear or your uploaded logos/headshots.
          {isLocalhost ? ' You’re on localhost; 127.0.0.1 is recommended — use it for both.' : ''}
        </div>

        <div className="diag-urls">
          <div className="setup-url">
            <code className="setup-url__value">{controlUrl}</code>
            <div className="setup-url__actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => copy(controlUrl, 'Control URL')}>Copy control</button>
            </div>
          </div>
          <div className="setup-url">
            <code className="setup-url__value">{outputUrl}</code>
            <div className="setup-url__actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => copy(outputUrl, 'Output URL')}>Copy output</button>
            </div>
          </div>
        </div>

        <div className="diag-checks">
          {checks.map((check) => (
            <CheckRow key={check.label} check={check} />
          ))}
          <CheckRow check={assetTest} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={runAssetTest}>Run storage test</button>
        </div>

        <p className="diag-real">
          <strong>Real check:</strong> these only prove this page works. The true
          end-to-end test is: Take a graphic, then refresh <code>/output</code> and
          confirm it returns. If it doesn’t, the dock and source aren’t on the same origin.
        </p>

        <ul className="setup-list">
          <li>Browser Source size: 1920 × 1080</li>
          <li>Enable transparent background; place the source above camera/video</li>
          <li>For stable testing, serve the production build (`npm run build` → preview)</li>
        </ul>

        <p className="setup-statusline">{copyHint || 'Run the checks above before going live.'}</p>
      </div>
    </Panel>
  );
}
