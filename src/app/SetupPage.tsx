import { useEffect, useMemo, useRef, useState } from 'react';
import SetupDiagnostics from '../components/control/SetupDiagnostics';
import { loadEsvApiKey, saveEsvApiKey } from '../lib/storage';
import { Icon } from '../lib/icons';
// The address the browser dials, imported rather than retyped: a setup page
// naming a different port from the one the code connects to is worse than one
// that names none.
import { DEFAULT_SPEECH_SERVICE } from '../lib/scripture/liveTranscriptSource';

/**
 * What to run so the Scripture microphone works.
 *
 * NO `--repo` AND NO `--engine`. Both default correctly now — `--engine` is
 * `whisper` and `--repo` is empty, meaning "the checkpoint that engine ships
 * with". `docs/OBS_SETUP.md` still pins the previous recogniser's checkpoint
 * (`--repo …/w2v-bert-en`), which since the engine changed would hand a
 * w2v-BERT repo to Whisper. A setup page that prints a command nobody has run
 * is worse than one that prints none, so this is the command from
 * `docs/LIVE_SCRIPTURE_GATE.md`, which is the one that is actually used.
 *
 * `HF_HOME` keeps the model cache with the rest of the evaluation rig rather
 * than in the user's home default — without it the first run re-downloads
 * several gigabytes that are already on the machine.
 */
/**
 * Named here rather than typed into the prose, so the page cannot promise a
 * filename or a Node version that has moved. Both are single sources: the
 * archive `scripts/package-release.mjs` writes is `livelayer-<version>.zip`
 * from `package.json`, and the floor is `engines.node`.
 *
 * Read through Vite's `define`-free path — a literal here, checked by a test
 * against `package.json`, because importing the manifest into the bundle would
 * ship the whole thing to the browser to print two strings.
 */
const APP_VERSION = '0.1.0';
const NODE_FLOOR = '22 or newer';

const SPEECH_SERVICE_COMMAND =
  'HF_HOME=~/LiveLayer-ASR-Eval/hf \\\n  ~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/server.py --verbose';

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
  const [esvKey, setEsvKey] = useState(() => loadEsvApiKey());
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
            {/* The pair completed. Setup answers "what is wrong with this
                machine"; Guide answers "what does this button do" — and an
                operator who lands on the wrong one should not have to know the
                other exists. */}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => window.open(`${window.location.origin}/guide`, '_self')}
            >
              Guide
            </button>
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
                  Optional — the Scripture microphone, the ESV, NDI, and controlling from a tablet
                </summary>

                <div className="setup-advanced__body">
                {/**
                  * THE MICROPHONE NEEDS A SECOND PROCESS, AND NOTHING SAID SO.
                  *
                  * "Start listening" is on the Scripture page whether or not the
                  * recogniser is running, and when it is not the operator gets a
                  * refusal with no way to find out what to start. The command
                  * lived only in `docs/`, which is not where someone standing at
                  * the desk ten minutes before a service is looking.
                  *
                  * Optional on purpose, and first in this block rather than
                  * promoted to a numbered step: Scripture is fully usable by
                  * typing, the microphone is unvalidated, and a fourth required
                  * step would say the opposite of both.
                  */}
                <div className="setup-sub">
                  <h3 className="setup-sub__title">
                    <Icon name="mic" size={16} />
                    Turn on the Scripture microphone
                  </h3>
                  <div className="setup-body">
                    <p className="setup-text">
                      The Scripture page can listen and turn a spoken reference into candidates you
                      review. It needs a recogniser running <strong>on this machine</strong> — the
                      model never enters the browser, no audio leaves the machine, and nothing is
                      written to disk. Without it, <strong>Start listening</strong> refuses and you
                      type the reference, which is the normal way to work.
                    </p>
                    <p className="setup-text">
                      In a terminal, from the LiveLayer folder:
                    </p>
                    <pre className="setup-pre"><code>{SPEECH_SERVICE_COMMAND}</code></pre>
                    <div className="setup-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => copyToClipboard(SPEECH_SERVICE_COMMAND, 'Recogniser command')}
                      >
                        Copy command
                      </button>
                    </div>
                    <p className="setup-note">
                      Wait for it to report that it is listening on{' '}
                      <code className="setup-kbd">{DEFAULT_SPEECH_SERVICE.replace('ws://', '')}</code> —
                      loading the model takes a few seconds. <code className="setup-kbd">--verbose</code>{' '}
                      prints timings and <strong>never</strong> prints a transcript, so the terminal is
                      safe to leave on screen. Then open Scripture and press{' '}
                      <strong>Start listening</strong>; the browser asks for microphone permission once.
                    </p>
                    <p className="setup-note">
                      First time on a machine, the Python environment and the model have to be
                      installed — that is in{' '}
                      <code className="setup-kbd">scripts/asr-benchmark/README.md</code>. And treat what
                      it hears as a suggestion: it is unvalidated, it refuses more often than it
                      answers, and nothing reaches air without an Accept and a separate Take.
                    </p>
                  </div>
                </div>

                <div className="setup-sub">
                  <h3 className="setup-sub__title">Add the ESV</h3>
                  <div className="setup-body">
                    <p className="setup-text">
                      The built-in translations are public-domain texts, which is why they need no
                      account. The ESV is Crossway&rsquo;s, and they give API access away for
                      non-commercial use — get a key at <code className="setup-kbd">api.esv.org</code>,
                      paste it here, and ESV appears in the translation picker.
                    </p>
                    <label className="field">
                      <span className="field__label"><span>ESV API key</span></span>
                      <input
                        className="field__input"
                        type="password"
                        value={esvKey}
                        placeholder="Paste your Crossway API key"
                        onChange={(event) => {
                          setEsvKey(event.target.value);
                          saveEsvApiKey(event.target.value);
                        }}
                      />
                      <span className="field__hint">
                        Stored in this browser only, sent nowhere but Crossway, and cleared by
                        &ldquo;Reset all local data&rdquo;. Leave empty and nothing changes.
                      </span>
                    </label>
                  </div>
                </div>

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
                  <h3 className="setup-sub__title">
                    <Icon name="screenMain" size={16} />
                    Run LiveLayer on another machine
                  </h3>
                  <div className="setup-body">
                    <p className="setup-text">
                      This is <strong>installing</strong> it somewhere else — a backup laptop, the
                      church&rsquo;s other rig. It is not the same as the section below, which is a
                      tablet <em>driving</em> this machine.
                    </p>
                    <p className="setup-text">
                      No repository, no <code className="setup-kbd">npm install</code>, no toolchain.
                      The other machine needs <strong>Node {NODE_FLOOR}</strong> from{' '}
                      <code className="setup-kbd">nodejs.org</code> and nothing else. On this machine,
                      build the archive:
                    </p>
                    <pre className="setup-pre"><code>npm run package</code></pre>
                    <p className="setup-note">
                      That writes <code className="setup-kbd">out/livelayer-{APP_VERSION}.zip</code> —
                      the built app plus the two dependency-free servers. Copy it across on a USB
                      stick, unpack it anywhere, and from inside the unpacked folder run:
                    </p>
                    <pre className="setup-pre"><code>node scripts/serve-dist.mjs</code></pre>
                    <p className="setup-note">
                      It prints the exact control and output addresses to paste into OBS on that
                      machine. Keep <code className="setup-kbd">dist</code> and{' '}
                      <code className="setup-kbd">scripts</code> side by side — the server looks for
                      the build next to its own folder. A <code className="setup-kbd">RUNME.txt</code>{' '}
                      in the archive says all of this again, for whoever opens it without you there.
                    </p>
                    <p className="setup-note">
                      <strong>Your work does not travel with it.</strong> Logos, speaker photos, saved
                      graphics, presets and rundowns live in the browser that made them — a different
                      machine is a different origin and starts empty. That is expected, not a failed
                      copy. Export a rundown as a{' '}
                      <code className="setup-kbd">.livelayerpack</code> from Library and import it
                      there; it carries the graphics and the images they reference.
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
                  <UrlRow
                    url={lanOutputUrl}
                    label="LAN Output URL"
                    onCopy={() => copyToClipboard(lanOutputUrl, 'LAN Output URL')}
                    onOpen={() => window.open(`${lanOutputUrl}&debug=1`, '_blank')}
                    openLabel="Debug"
                  />
                  {/**
                    * THE RELAY OUTPUT ADDRESS BELONGS HERE, and removing it was
                    * wrong.
                    *
                    * The reasoning was that Screens builds every address with
                    * the relay already in it — true only when the control page
                    * ITSELF was opened with `?relay=`. On the graphics machine
                    * it usually is not: control is local, so `getRealtimeRelayUrl()`
                    * returns nothing and Screens hands out plain addresses. The
                    * operator setting up a second machine then had no
                    * relay-bearing output URL anywhere in the product.
                    *
                    * This page can always build one, because it derives the
                    * relay from its own hostname rather than from stored config.
                    */}
                  <p className="setup-note">
                    That is the main screen. For the split or house scenes, add
                    <code className="setup-kbd">&amp;screen=split</code> or
                    <code className="setup-kbd">&amp;screen=house</code> to it — or open
                    <strong> Screens</strong> on a browser that already has the relay and copy
                    each address whole. Check the link with <strong>Check LAN relay</strong> beside
                    this column.
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
