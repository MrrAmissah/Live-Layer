// Screenshot /output at true broadcast size.
//
//   node scripts/shoot-output.mjs --template scripture-card --variant split-column
//   node scripts/shoot-output.mjs --template preacher-lower-third --variant modern-minimal --case long
//   node scripts/shoot-output.mjs --all-variants preacher-lower-third
//   node scripts/shoot-output.mjs --all-variants scripture-card --screen split --matte 0b1020
//   node scripts/shoot-output.mjs --variant split-wide --screen split --plate ../Nine3-Design-Hub/out/still/split.png
//
// Why this exists: a variant that looks fine in the library's preview card can
// fall apart at 1920×1080, because the preview is a scaled-down stage and the
// things that break — optical margins, a hairline that rounds to nothing, text
// that wraps one word too early — are exactly what scaling hides. Nothing in
// this repo judged a graphic at the size it actually goes to air.
//
// It drives the real /output route rather than rendering components in
// isolation, so what is captured is what OBS gets: the same transparency, the
// same stage scaling, the same renderer, the same CSS.
//
// Chrome DevTools Protocol over Node's native WebSocket — no dependencies.
//
// THE TRANSPORT HALF IS COPIED FROM Nine3-Design-Hub/tools/render.mjs, and the
// reason is worth recording because four rewrites of this script failed without
// it. Earlier versions connected straight to the page target — "one moving part
// fewer", the comment said. It was the moving part that was missing. Chrome
// always opens `about:blank` first, so pointing it at an http:// URL is a
// CROSS-PROCESS navigation: the renderer is swapped and the page-level session
// dies with it. Moving `Runtime.enable` before or after the navigation both
// hung, because the session itself was gone — a later probe answered `Session
// with given id not found`, which is the actual diagnosis.
//
// render.mjs never hits this because it connects to the BROWSER endpoint and
// creates its own target with `Target.attachToTarget({ flatten: true })`. A
// flattened session survives the renderer swap. That is the fix, and it is why
// the sequence below is reproduced rather than reinvented: browser endpoint →
// createTarget(about:blank) → attach flattened → enable → metrics → navigate →
// wait for load.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1920;
const HEIGHT = 1080;

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Sample content per template. Long/short are the cases that break layouts. */
const CASES = {
  'scripture-card': {
    short: {
      reference: 'Psalm 90:1',
      verseText: 'Lord, thou hast been our dwelling place in all generations.',
      translationLabel: 'KJV',
      themeTitle: 'God Our Help in Ages Past'
    },
    long: {
      reference: '1 Corinthians 13:4-7',
      verseText:
        'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up, doth not behave itself unseemly, seeketh not her own, is not easily provoked, thinketh no evil; rejoiceth not in iniquity, but rejoiceth in the truth.',
      translationLabel: 'KJV',
      themeTitle: 'God Our Help in Ages Past'
    }
  },
  'preacher-lower-third': {
    short: { name: 'Ps. Ato Mensah', title: 'Guest Speaker', subtitle: 'PPC 2026' },
    long: {
      name: 'Rev. Dr. Emmanuel Kwabena Owusu-Ansah',
      title: 'General Overseer, Mathapoly Church International',
      subtitle: 'Annual Peace Prayer Convention 2026'
    },
    nologo: { name: 'Ps. Ato Mensah', title: 'Guest Speaker', subtitle: '', logoUrl: '' },
    /**
     * Name only — no role row AT ALL.
     *
     * This is not an edge case any more. `hasRoleRow` in the renderer is
     * `title || subtitle`, and the eye toggle blanks both at the render
     * boundary, so an operator hiding the title and the church line takes the
     * whole role plate out of the DOM. Every variant's trailing furniture,
     * underbar and badge centring is measured against a two-row stack; this is
     * the case that shows what happens when the second row is gone.
     */
    nameonly: { name: 'Ps. Ato Mensah', title: '', subtitle: '' }
  },
  'performer-lower-third': {
    short: { name: 'The Promised Land Choir', title: 'Ministration', subtitle: 'PPC 2026' },
    long: {
      name: 'Mathapoly Church International Mass Choir & Worship Team',
      title: 'Praise, Worship and Special Ministration',
      subtitle: 'Annual Peace Prayer Convention 2026'
    }
  },
  'quote-card': {
    short: { quoteText: 'God is our refuge and strength.', attribution: 'Psalm 46:1' },
    long: {
      quoteText:
        'Prayer is not overcoming God’s reluctance; it is laying hold of His highest willingness, and the church that prays together is the church that stands together through every season.',
      attribution: 'Annual Peace Prayer Convention 2026'
    }
  }
};

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    opt[key] = !next || next.startsWith('--') ? true : (i += 1, next);
  }
}

const port = Number(opt.port || 4173);
/**
 * Which output screen to photograph (`src/lib/scriptureOutputs.ts`). The split
 * screens are the reason a 1920x1080 harness matters at all — their geometry is
 * a contract with an OBS scene, and a scaled preview cannot show whether the
 * camera hole is where the scene expects it.
 */
/**
 * NOTE: for a scripture card, `--screen` BEATS `--variant` — that is the whole
 * point of Scripture Outputs, and it will silently photograph the screen's
 * configured look instead of the one you named. To shoot a specific variant,
 * leave `--screen` off (the main screen is `as-chosen`).
 */
const screen = typeof opt.screen === 'string' ? opt.screen : '';
/**
 * `--matte 0b1020` paints an opaque ground behind the page.
 *
 * Off by default, because a transparent capture is the truth about what OBS
 * composites. But the split variants paint white type meant to sit on a dark
 * plate that lives in a SEPARATE OBS source, so a transparent shot of one
 * viewed on white looks like a card with no verse in it — which is exactly the
 * wrong conclusion, and the one this harness nearly produced. A matte is how
 * you judge those without pretending the graphic draws its own background.
 */
/**
 * `--plate out/still/split.png` composites the shot over the real OBS artwork.
 *
 * The split variants are TYPE ONLY — the card, its gold edge and the quote mark
 * cut into its top rule all belong to a different OBS source. Judging their
 * composition without that layer is guessing, and the geometry that matters
 * (does the verse clear the notch, does the label sit on the card's bottom
 * rule) is only visible with both. Read from disk and inlined as a data URI, so
 * production artwork never has to be copied into this repo to be used.
 */
const plate = typeof opt.plate === 'string' ? path.resolve(ROOT, opt.plate) : null;
if (plate && !fs.existsSync(plate)) {
  console.error(`\u2717 no plate at ${plate}`);
  process.exit(1);
}
const plateDataUri = plate
  ? `data:image/png;base64,${fs.readFileSync(plate).toString('base64')}`
  : null;

const matte = typeof opt.matte === 'string' ? opt.matte.replace(/^#/, '') : null;
const matteColor = matte
  ? {
      r: parseInt(matte.slice(0, 2), 16) || 0,
      g: parseInt(matte.slice(2, 4), 16) || 0,
      b: parseInt(matte.slice(4, 6), 16) || 0,
      a: 1
    }
  : { r: 0, g: 0, b: 0, a: 0 };
const outputUrl = `http://127.0.0.1:${port}/output${screen ? `?screen=${encodeURIComponent(screen)}` : ''}`;
const outDir = path.join(ROOT, 'out', 'shots');
fs.mkdirSync(outDir, { recursive: true });

// --- CDP, copied from Nine3-Design-Hub/tools/render.mjs ----------------------

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error
          ? reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`))
          : resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new CDP(ws)));
      ws.addEventListener('error', (e) => reject(new Error('ws error: ' + (e.message || 'unknown'))));
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  close() {
    this.ws.close();
  }
}

/**
 * Launch Chrome and read its BROWSER-level endpoint from DevToolsActivePort.
 *
 * The file, not stderr: stderr's URL is the same one, but the file is written
 * only once the port is genuinely listening, which removes a race that made
 * failures look intermittent.
 */
async function launchChrome() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelayer-shot-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--mute-audio',
      '--hide-scrollbars',
      // Deterministic pixels, so two runs of this script are comparable.
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--font-render-hinting=none',
      /**
       * NO `--default-background-color=00000000` HERE.
       *
       * Transparency is set through `Emulation.setDefaultBackgroundColorOverride`
       * below, and passing both KILLS THE SESSION: the override arrives, the
       * target answers `Inspector.detached`, and every later call fails with
       * "Session with given id not found". That is the error this harness spent
       * four rewrites chasing while the diagnosis was aimed at navigation
       * timing. One transparency mechanism, not two.
       */
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const [devtoolsPort, wsPath] = fs.readFileSync(portFile, 'utf8').split('\n');
      if (devtoolsPort && wsPath) {
        return { child, userDataDir, wsUrl: `ws://127.0.0.1:${devtoolsPort.trim()}${wsPath.trim()}` };
      }
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  child.kill();
  throw new Error('Chrome did not expose a DevTools port within 20s');
}

/**
 * Our own page target, attached FLATTENED, configured while still blank.
 *
 * The order is load-bearing (see the header): metrics and Runtime are enabled
 * on `about:blank`, and only then does the navigation happen. A flattened
 * session outlives the renderer swap, so the context is still there afterwards.
 */
async function openPage(cdp, url, width, height) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  // Transparent by default, so what lands on disk is what OBS composites over
  // the camera; `--matte` swaps in an opaque ground for judging light-on-dark
  // designs whose plate is a different source.
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: matteColor }, sessionId);

  const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  return sessionId;
}

const evaluate = async (cdp, sessionId, expression) => {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId
  );
  if (exceptionDetails) {
    throw new Error('page error: ' + (exceptionDetails.exception?.description || exceptionDetails.text));
  }
  return result.value;
};

/**
 * The app has mounted and the output route is listening.
 *
 * Without this the SHOW_GRAPHIC below can be posted into a page whose
 * BroadcastChannel subscriber does not exist yet — the message is delivered to
 * nobody and the screenshot is of an empty stage, which reads as a broken
 * variant rather than a race.
 */
/**
 * Put the plate BEHIND the page, not in it.
 *
 * A fixed layer at z-index -1 shows through because `/output` forces a
 * transparent document for OBS — which means this composite is honest: if the
 * graphic painted its own background the plate would disappear, and that is
 * exactly the fault worth seeing.
 */
async function mountPlate(cdp, sessionId) {
  if (!plateDataUri) return;
  await evaluate(
    cdp,
    sessionId,
    `(() => {
       const el = document.createElement('div');
       el.style.cssText = 'position:fixed;inset:0;z-index:-1;background-size:cover;background-image:url("${plateDataUri}")';
       document.body.appendChild(el);
       return true;
     })()`
  );
}

async function waitForOutput(cdp, sessionId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(cdp, sessionId, '!!document.querySelector(".output-root")');
    if (ready) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`/output never mounted within ${timeoutMs}ms`);
}

// --- the shot ----------------------------------------------------------------

async function shoot(cdp, sessionId, { templateId, variantId, values, label }) {
  const now = new Date().toISOString();
  const graphic = {
    id: `shot-${variantId}`,
    templateId,
    createdAt: now,
    updatedAt: now,
    durationSeconds: 0,
    values: { variantId, ...values },
    theme: {}
  };

  await evaluate(
    cdp,
    sessionId,
    `new BroadcastChannel('livelayer:graphics').postMessage(${JSON.stringify({
      id: `shot-${Date.now()}-${variantId}`,
      type: 'SHOW_GRAPHIC',
      payload: graphic,
      timestamp: Date.now()
    })}); true`
  );

  /**
   * Settle the entry animations before capturing.
   *
   * Not cosmetic: a headless page is `visibilityState: hidden`, so Chrome does
   * not advance animation timelines at all — every graphic would otherwise be
   * photographed frozen on the first frame of its slide-in, which is exactly
   * the state that hides whether the composition is right. `finish()` puts each
   * one at its resting position deterministically, which is also what makes two
   * runs of this script comparable.
   */
  await evaluate(
    cdp,
    sessionId,
    `(async () => {
       await new Promise(r => setTimeout(r, 400));
       document.querySelectorAll('*').forEach(n =>
         n.getAnimations?.().forEach(a => { try { a.finish(); } catch {} }));
       await new Promise(r => setTimeout(r, 150));
       return true;
     })()`
  );

  const shot = await cdp.send(
    'Page.captureScreenshot',
    { format: 'png', fromSurface: true, captureBeyondViewport: false },
    sessionId
  );
  const suffix = [screen || null, plate ? 'plate' : null, label || null].filter(Boolean).join('--');
  const file = path.join(outDir, `${templateId}--${variantId}${suffix ? `--${suffix}` : ''}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

// --- main --------------------------------------------------------------------

const templateId = opt.template || opt['all-variants'] || 'scripture-card';
const caseName = opt.case || 'short';
const values = CASES[templateId]?.[caseName] ?? CASES[templateId]?.short ?? {};

const { child, userDataDir, wsUrl } = await launchChrome();
const cdp = await CDP.connect(wsUrl);

let exitCode = 0;
try {
  const sessionId = await openPage(cdp, outputUrl, WIDTH, HEIGHT);
  await waitForOutput(cdp, sessionId);
  await mountPlate(cdp, sessionId);
  console.log(`\u25b8 ${outputUrl}  ${WIDTH}x${HEIGHT}${plate ? `  over ${path.basename(plate)}` : ''}`);

  let variants = [opt.variant || 'blue-quote-card'];
  if (opt['all-variants']) {
    variants = await evaluate(
      cdp,
      sessionId,
      `(async () => {
         const m = await import('/src/components/templates/registry.ts');
         const t = m.templateRegistry.find(x => x.id === ${JSON.stringify(templateId)});
         return t ? t.variants.map(v => v.id) : [];
       })()`
    );
    if (!variants.length) throw new Error(`no variants found for template "${templateId}"`);
  }

  for (const variantId of variants) {
    const file = await shoot(cdp, sessionId, { templateId, variantId, values, label: caseName });
    console.log(`  ${variantId.padEnd(24)} -> ${path.relative(ROOT, file)}`);
  }
} catch (err) {
  console.error(`\u2717 ${err.message}`);
  exitCode = 1;
} finally {
  try {
    cdp.close();
  } catch {}
  /**
   * Chrome keeps writing to its profile for a moment after SIGTERM, so an
   * immediate recursive delete races it and throws ENOTEMPTY — which would fail
   * the script AFTER the screenshots had already been written, and make a
   * successful run look broken.
   */
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      resolve();
    }, 5000);
  });
  for (let i = 0; i < 5; i += 1) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
process.exit(exitCode);
