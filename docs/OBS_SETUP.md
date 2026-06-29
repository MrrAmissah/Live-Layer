# OBS Setup

> **Verify your setup:** open `/setup` → **Production readiness** for this page's
> origin, copy-able control/output URLs, and localStorage / IndexedDB /
> BroadcastChannel checks. For the full end-to-end run, see
> [`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md). For stable testing, serve the
> production build (`npm run build`, then a static server / `npm run preview`).

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

## Control Dock

1. In OBS, open `View > Docks > Custom Browser Docks`.
2. Add a new dock and set the URL to `http://127.0.0.1:4173/control`.
3. Use a dock size such as `1280x800` or `1600x900`.

## Output Source

1. In OBS, add a new `Browser` source.
2. Set the URL to `http://127.0.0.1:4173/output`.
3. Set width to `1920` and height to `1080`.
4. Enable `Shutdown source when not visible` if you want to save resources.
5. Make sure `Local file` is unchecked and `Control audio via OBS` is disabled.
6. Ensure `Custom CSS` is empty.

## Recommended settings

- Set the browser source to transparent background.
- Place the source above your background or camera layer.
- Use `Transform > Edit Transform` to scale or position if needed.

## Workflow

- Control graphics from `/control`.
- The output page displays the active overlay.
- Press `Clear` to remove the overlay from the scene.

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
`/control` work from a second computer; Take/Clear still need the same local
browser/OBS context until LiveLayer has a LAN event bus.

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
