# Screenshot & demo capture guide

Shots for the README, a portfolio page, or a release post. Save PNGs into
`docs/assets/` using the filenames below so README and portfolio links resolve.

## Setup

1. `npm run dev` → app on `http://127.0.0.1:4173`.
2. Use a clean browser window (no extensions/bookmarks bar visible) for control shots.
3. Capture at a consistent device pixel ratio; crop out browser chrome.

## Control redesign visual QA

Before capturing final shots, make a quick manual pass at these widths. Browser
automation was not available during the redesign sprint, so these checks are the
source of truth for the final visual sign-off.

- Desktop studio (`/control`, ~1440-1600px): command bar lockup is readable, the
  preview reads as the main monitor, the right rail steps down from **Live** to
  **Look** to **Saved work**, and no panel text overflows.
- Tablet boundary (`/control`, ~1024px): crossing the breakpoint swaps studio
  and dock layouts cleanly, without horizontal scroll or clipped controls.
- OBS dock (`/control`, ~360-420px): status bar, tabs, selected graphic name,
  preview, and sticky Take/Clear bar all remain reachable and readable.
- Dock forms: Graphic, Edit, Live, Brand, and Library tabs scroll without content
  hiding behind the sticky live bar; focus rings are visible on buttons, tabs,
  inputs, scripture chips, and queue actions.
- Feature surfaces: Saved graphics, People, Rundowns, Import, scripture lookup,
  dynamic date/time helpers, and layout controls keep their existing behavior
  while using the quieter row/card treatment.
- `/setup`: diagnostics and setup copy still fit beneath the polished command bar.

## 1. `/control` — full studio view  → `livelayer-control.png`

- Open `http://127.0.0.1:4173/control` in a **wide** window (**≥ 1280px**, ideally
  ~1440–1600) so the three-column studio layout shows.
- Select **Scripture Card** (it fills the preview nicely), make sure fields have the
  default content, and let the preview render over the **Camera** backdrop.
- Frame the whole surface: left rail · large centre preview · right Take/Clear + brand + presets.

## 2. `/control` — OBS dock mode  → `control-dock.png`

- Either dock `/control` in OBS as a Custom Browser Dock at **~360–420px** wide, or
  resize a browser window to that width to trigger the dock layout.
- Capture the **Live** tab: sticky status bar on top (`LiveLayer · Local · <graphic> · Live`),
  the preview, and the sticky **Take live / Clear** bar pinned at the bottom.
- Optional second shot: the **Graphic** tab showing the radio-style template list.

## 3–5. `/output` overlays (over a backdrop)

Use the seed harness so the overlay sits over a simulated camera, not black glass:

- Open `http://127.0.0.1:4173/seed-test.html`, set **Background → Camera**.
- Click each template and capture the stage area (hide the top button bar in the crop):
  - **Preacher Lower Third** → `output-lower-third.png`
  - **Scripture Card** → `output-scripture.png`
  - **Announcement Banner** → `output-announcement.png`

## 6. Long-content stress  → `output-long-content.png`

- In `seed-test.html`, tick **long / stress content**, choose **Scripture** (longest verse),
  Background **Bright** to also show light-background contrast. Capture the stage.

## 7. OBS Browser Source setup (optional)  → `obs-setup.png`

- Screenshot the OBS **Browser Source** properties showing URL `…/output`, size
  `1920×1080`, and the transparent result over a camera/colour source in the scene.
  Good for proving the transparent compositing claim.

## Tips

- For motion/GIFs: trigger **Take** then **Clear** in `seed-test.html`; toggle the
  **fade crossfade** checkbox to contrast the slide build vs the fade.
- Toggle **safe-area guides** in the seed harness for a "broadcast-safe" annotated shot.
