# OBS Setup

> **Verify your setup:** open `/setup` → **Production readiness** for this page's
> origin, copy-able control/output URLs, and localStorage / IndexedDB /
> BroadcastChannel checks. For the full end-to-end run, see
> [`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md). For stable testing, serve the
> production build: `npm run build`, then `npm run start` (or `npm run preview`).

## Same-origin rule for local assets

Use the exact same origin for the control dock and output source. Uploaded
images are stored in same-origin IndexedDB, so the protocol, host, and port must
match.

Recommended pair:

- Control Dock: `http://127.0.0.1:4173/control`
- Output Source: `http://127.0.0.1:4173/output`

Do **not** mix `localhost` and `127.0.0.1`. Do **not** mix ports. For example,
`http://localhost:4173/control` and `http://127.0.0.1:4173/output` are different
origins, and uploaded logos may not resolve in `/output`.

The dev and preview servers bind to `127.0.0.1:4173` with strict port `4173`; if
that port is already busy, start-up fails instead of silently moving to another
port. Fix the port conflict before opening OBS.

`npm run start` — the dependency-free server for a built `dist/`, used when the
machine has Node 22+ but no `node_modules` — uses the same `127.0.0.1:4173` so an
operator keeps the assets and libraries they built up in dev. Moving it with
`--port` moves the origin: uploaded images and saved libraries do not follow, and
both OBS entries must be updated together.

It also refuses to start on a port browsers block outright (the WHATWG bad-port
list — `4190`, `6000`, `6697` and the rest). A Browser Source is Chromium, so
such a port would show an empty source with no error anywhere in OBS to explain
it; the server names a working alternative instead.

## Control Dock

1. In OBS, open `View > Docks > Custom Browser Docks`.
2. Add a new dock and set the URL to `http://127.0.0.1:4173/control`.
3. Use a dock size such as `1280x800` or `1600x900`.

## Output Source

A rig can run several output sources. Each one declares **which screen it is**
in its URL, and scripture renders its own look per screen — the operator sets a
verse once and the split scene, the house projectors and the full-frame source
each show it their own way, with nothing to switch mid-service.

| screen | URL | what it is |
|---|---|---|
| main | `/output` | the full-frame source. Any URL without a screen is this one. |
| lower | `/output?screen=lower` | a source that only carries the band at the foot of frame. |
| split | `/output?screen=split` | the scene where the camera is scaled down and scripture owns the rest. |
| house | `/output?screen=house` | the venue projectors and LED wall. Never reaches program. |

**Copy these from the Screens page in the control surface, not from here.** It
builds each address for your actual origin with the relay already included, and
shows a live preview of what that screen is rendering. An address with a typo in
`?screen=` falls back to the main screen without saying so.

Only scripture varies by screen. Every other template renders identically on all
of them.

1. In OBS, add a new `Browser` source.
2. Set the URL to `http://127.0.0.1:4173/output` (or one of the screen URLs above).
3. Set width to `1920` and height to `1080`.
4. Leave `Shutdown source when not visible` **unchecked** — see below.
5. Make sure `Local file` is unchecked and `Control audio via OBS` is disabled.
6. Ensure `Custom CSS` is empty.

## Shutdown source when not visible

Leave this **OFF** on the LiveLayer output source.

- **OFF** — the output page stays loaded when the source is hidden, so its
  heartbeat keeps arriving and the control surfaces keep reporting on a page they
  can still hear from.
- **ON** — OBS unloads the whole page when the source is hidden. An unloaded page
  sends nothing, so the surfaces fall back to **UNVERIFIED · Output status is
  stale** once the heartbeat goes quiet. That is honest — nothing is claimed that
  cannot be checked — but it cannot tell you *why*, and it takes the staleness
  window to appear.

Turning it OFF buys heartbeat continuity. **It does not guarantee that OBS will
tell the page its source was hidden** — see the next section.

`Refresh browser when scene becomes active` is fine to leave on: the output page
restores the current graphic from the relay snapshot when it loads.

## What the output status can and cannot tell you

**`OUTPUT READY` is the highest state LiveLayer can guarantee on the tested
configuration.** It means exactly one thing: *the output page received and applied
the graphic*. The output page establishes it by acknowledging the command itself,
so it needs nothing from OBS.

The richer labels — **`OUTPUT ACTIVE`**, **`SOURCE HIDDEN`**, **`SOURCE
INACTIVE`** — are **opportunistic**. They appear only when OBS actually delivers a
source-specific reading, and they are never promised. No reading means
`OUTPUT READY`; an absent reading is never converted into active, hidden or
inactive.

### What the tested rig demonstrated

Measured on **obs-browser 2.26.9, macOS**, with the Browser Source's own eye
toggled directly and `Shutdown source when not visible` OFF:

| Signal | Observed |
| --- | --- |
| `window.obsstudio` binding | present |
| `obsSceneChanged` (global) | **working** — 3 events, last scene `PPC · Live` |
| `obsSourceActiveChanged` | never arrived |
| `obsSourceVisibleChanged` | never arrived |
| legacy `onActiveChange` / `onVisibilityChange` | never arrived |
| document `visibilitychange` on the eye toggle | never arrived |

The source did leave the OBS canvas as expected, and the dock and studio stayed
at `OUTPUT READY` throughout — reporting what they could verify and claiming
nothing beyond it.

So on this rig the general OBS JavaScript bridge works, while source-specific
active/visibility telemetry is not available or not reliable. **That is a
statement about the configuration tested here, not a claim about obs-browser in
general.** Other versions and platforms may deliver these events, and LiveLayer
reads them the moment they arrive — the listeners are always attached (see
below), so nothing needs changing if your rig does deliver them.

Reading exact scene-item visibility regardless of the page bridge would require a
different integration boundary — an OBS control channel rather than the events
OBS chooses to hand the page. That is deliberately out of scope here.

### How the page listens

LiveLayer attaches its listeners **independently of whether `window.obsstudio`
exists at that instant**. An earlier version returned early when the binding was
missing when the page mounted, so a binding injected a moment later was never
noticed and the readings stayed unknown forever. The `obsSourceActiveChanged` /
`obsSourceVisibleChanged` listeners are now installed unconditionally, and the
legacy `onActiveChange` / `onVisibilityChange` callbacks are installed as soon as
a binding appears, within a bounded window.

Diagnostics for all of this are available at `/output?debug=1` — binding
presence, plugin version, which events have arrived and by which path, plus the
page's own visibility and scene-event counters. That overlay never appears on a
normal `/output`, and none of it reaches the reported status.

## Recommended settings

- Set the browser source to transparent background.
- Place the source above your background or camera layer.
- Use `Transform > Edit Transform` to scale or position if needed.

## Workflow

- Control graphics from `/control`.
- The output page displays the active overlay.
- Press `Clear` to remove the overlay from the scene.

## Beta LAN control

The default workflow is still same-machine. For beta second-PC or tablet control,
run LiveLayer and the relay on the graphics machine:

```bash
npm run dev:lan
npm run lan:relay
```

Then open `/setup` from the graphics machine's LAN URL and copy the LAN relay
pairs. They look like:

- Control: `http://192.168.1.50:4173/control?relay=http%3A%2F%2F192.168.1.50%3A4174`
- Output: `http://192.168.1.50:4173/output?relay=http%3A%2F%2F192.168.1.50%3A4174`

Use the LAN Control URL on the controller device and the LAN Output URL in OBS.
Both pages must point at the same relay. Add `?relay=off` to disable a stored
relay URL in that browser.

Limitations: the relay carries live commands only. Uploaded assets, People,
presets, and saved rundowns still live in each browser's local storage until
LiveLayer has host-owned asset/library storage.

## Sending to another PC or Mac with NDI

LiveLayer does **not** emit native NDI. The supported workflow is to use OBS as
the renderer and NDI bridge:

1. Run LiveLayer and OBS on the graphics machine.
2. Add `http://127.0.0.1:4173/output` as the transparent OBS Browser Source.
3. Place that Browser Source above the camera/video sources in the OBS scene.
4. Install and configure an OBS NDI workflow such as DistroAV/NDI.
5. Enable NDI output for the OBS scene/program you want to send.
6. On the second PC or Mac, receive that NDI feed in OBS or another
   NDI-compatible app.

This sends the rendered OBS video feed across the network. It does **not** make
`/control` share uploaded assets or libraries with a second computer. Use the
LAN control relay above for beta Take/Clear from a second device.

## Speech assist (validation stage — optional, off by default)

The Scripture workspace can listen to a microphone and turn a spoken reference into
candidate passages for you to review. **It is unvalidated**: it has never been
measured on real church audio, it refuses far more often than it answers, and every
suggestion still needs reading before you accept it. Typing works exactly as before,
whether the microphone is on or not, and nothing reaches air without an Accept and a
separate Take.

It needs a local recogniser running on this machine. Nothing is uploaded and no
audio is stored:

```sh
~/LiveLayer-ASR-Eval/venv/bin/python scripts/speech-service/server.py \
  --repo ~/LiveLayer-ASR-Eval/models/w2v-bert-en
```

Full setup — the virtualenv and the model download — is in
[`scripts/asr-benchmark/README.md`](../scripts/asr-benchmark/README.md); the
evidence behind it, including what it still gets wrong, is
[`ASR_EVALUATION.md`](ASR_EVALUATION.md) §9.

With the service running, open `/control/scripture` and press **Start listening**.
The browser will ask for microphone permission once. If you refuse it, or the
service is not running, the panel says so and you type the reference — which is the
normal way to work and is never slower than it was.

## Verifying the overlay

- Put the Browser source **above an actual camera/video scene** (not a black
  background) and confirm the graphic is opaque where it should be and the rest
  of the frame stays fully transparent.
- `Take` should play the build-in animation; `Clear` should play a clean
  exit (≈300ms) with no snap or flicker. Conservative operators can switch a
  graphic to the `fade` crossfade variant.
- Refresh the Browser source while a graphic is live — it should restore the
  last active graphic (state is recovered from local storage).
- Upload a logo in the control dock, Take it live, refresh the Browser source,
  and confirm the logo still appears. If it falls back to initials, re-check that
  both URLs use the exact same host and port.
- Test the `/control` dock at a narrow width (~340px); Take/Clear must stay
  reachable.
- For fast QA without OBS, use `http://127.0.0.1:4173/seed-test.html` — it
  drives a real `/output` over simulated backdrops with toggles for long content,
  **layout size**, **accent colour**, **dynamic date/time**, fade, and safe-area guides.
