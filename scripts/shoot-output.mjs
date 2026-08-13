// Screenshot /output at true broadcast size.
//
//   node scripts/shoot-output.mjs --template scripture-card --variant split-column
//   node scripts/shoot-output.mjs --template preacher-lower-third --variant modern-minimal --case long
//   node scripts/shoot-output.mjs --all-variants preacher-lower-third
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
// Chrome DevTools Protocol over Node's native WebSocket — no dependencies. The
// pattern is borrowed from Nine3-Design-Hub/tools/render.mjs, which builds its
// own scene URLs and so could not be pointed at a Live Layer route.
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
    nologo: { name: 'Ps. Ato Mensah', title: 'Guest Speaker', subtitle: '', logoUrl: '' }
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
const outDir = path.join(ROOT, 'out', 'shots');
fs.mkdirSync(outDir, { recursive: true });

// --- CDP ---------------------------------------------------------------------

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`cannot reach ${wsUrl}`)), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result);
  });
  const raw = new Set();
  ws.addEventListener('message', (event) => raw.forEach((fn) => fn(event)));
  return {
    on: (_type, fn) => raw.add(fn),
    send(method, params = {}, sessionId) {
      id += 1;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close: () => ws.close()
  };
}

const evaluate = async (cdp, sessionId, expression) => {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId
  );
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'evaluate failed');
  return result.value;
};

async function launchChrome(startUrl) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelayer-shot-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--hide-scrollbars',
      // The output is a transparent overlay; a white default background would
      // make every screenshot a lie about what OBS composites.
      '--default-background-color=00000000',
      '--disable-gpu',
      '--no-first-run',
      // Chrome headless opens no page target unless given a URL, and this script
      // attaches to the PAGE rather than creating one — so without this it waits
      // for a target that never arrives.
      startUrl
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not report a debugging URL')), 20000);
    child.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
  });
  // The port is the one thing we need from that URL: connecting to the PAGE
  // target directly avoids `Target.attachToTarget` and its flattened sessions,
  // which is one moving part fewer in a script whose only job is a screenshot.
  const port = Number(new URL(wsUrl).port);
  return { child, wsUrl, port, userDataDir };
}

/**
 * The page target ALREADY AT the wanted URL.
 *
 * Attaching to whatever page exists first gets `about:blank`, and navigating
 * that to `http://` is a cross-process navigation: Chrome swaps the renderer,
 * the execution context this session enabled is destroyed, and every later
 * `Runtime.evaluate` hangs forever with no error — the script simply stops.
 * That is the whole bug. Chrome is launched pointing at the URL, so the right
 * move is to wait for the target that is already there rather than to steer a
 * blank one into it.
 */
async function pageTarget(devtoolsPort) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const list = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`).then((r) => r.json());
    const page = list.find((t) => t.type === 'page');
    if (page?.webSocketDebuggerUrl) return page;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Chrome never opened a page target at ${url}`);
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
      id: `shot-${Date.now()}`,
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
       await new Promise(r => setTimeout(r, 350));
       document.querySelectorAll('*').forEach(n =>
         n.getAnimations?.().forEach(a => { try { a.finish(); } catch {} }));
       await new Promise(r => setTimeout(r, 120));
       return true;
     })()`
  );

  console.log(`  [shoot] capturing ${variantId}…`);
  const shot = await cdp.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false },
    sessionId
  );
  console.log(`  [shoot] captureScreenshot returned keys=${Object.keys(shot ?? {})} bytes=${shot?.data?.length ?? 'none'}`);
  const file = path.join(outDir, `${templateId}--${variantId}${label ? `--${label}` : ''}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`  [shoot] wrote ${file}`);
  return file;
}

// --- main --------------------------------------------------------------------

const templateId = opt.template || opt['all-variants'] || 'scripture-card';
const caseName = opt.case || 'short';
const values = CASES[templateId]?.[caseName] ?? CASES[templateId]?.short ?? {};

console.log('[shoot] launching chrome…');
const { child, port: devtoolsPort, userDataDir } = await launchChrome(`http://127.0.0.1:${port}/output`);
const page = await pageTarget(devtoolsPort);
console.log(`[shoot] page target: ${page.url}`);
const cdp = await cdpConnect(page.webSocketDebuggerUrl);
const sessionId = undefined; // connected to the page directly; no session needed
try {
  await cdp.send('Page.enable', {}, sessionId);

  /**
   * Navigate BEFORE enabling Runtime, and enable it afterwards.
   *
   * Chrome opens `about:blank` regardless of the URL on its command line, so a
   * navigation to `http://` always happens — and that is cross-process: the
   * renderer is swapped and the execution context enabled beforehand is
   * destroyed. `Runtime.evaluate` then hangs forever against a context that no
   * longer exists, with no error, and the script simply stops with the page
   * loaded and nothing captured. Enabling Runtime after the load binds to the
   * context that actually exists.
   */
  const loaded = new Promise((resolve) => {
    cdp.on?.('message', (event) => {
      if (JSON.parse(event.data ?? '{}').method === 'Page.loadEventFired') resolve();
    });
    setTimeout(resolve, 10000);
  });
  console.log('[shoot] navigating…');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/output` }, sessionId);
  await loaded;
  await cdp.send('Runtime.enable', {}, sessionId);
  console.log('[shoot] loaded and Runtime enabled');
  console.log('[shoot] metrics…');
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  // Transparent, so what lands on disk is what OBS composites over the camera.
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);

  console.log('[shoot] page settling…');
  await new Promise((r) => setTimeout(r, 2200));
  const where = await evaluate(cdp, sessionId, 'location.pathname');
  console.log(`[shoot] page is at ${where}`);

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
  }

  for (const variantId of variants) {
    const file = await shoot(cdp, sessionId, { templateId, variantId, values, label: caseName });
    console.log(`${variantId.padEnd(24)} -> ${path.relative(ROOT, file)}`);
  }
} finally {
  cdp.close();
  child.kill();
  /**
   * Chrome keeps writing to its profile for a moment after SIGTERM, so an
   * immediate recursive delete races it and throws ENOTEMPTY — which would fail
   * the script AFTER the screenshot had already been written, and make a
   * successful run look broken.
   */
  await new Promise((r) => setTimeout(r, 400));
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A stray temp profile is not worth failing a render over; the OS reaps it.
  }
}
