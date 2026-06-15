# OBS Production QA Pack

How to verify LiveLayer in a real OBS production setup before a service. This
pack complements the granular [`QA_CHECKLIST.md`](QA_CHECKLIST.md); start here for
the end-to-end run, the OBS wiring, and the regression guardrails.

## Before you start — the one rule that breaks everything

`/control` and `/output` share Take/Clear, presets, and **uploaded images** only
when they run on the **exact same origin** (scheme + host + port). The most common
production failure is mixing hosts:

- ✅ dock `http://127.0.0.1:4173/control` + source `http://127.0.0.1:4173/output`
- ❌ dock `http://localhost:4173/control` + source `http://127.0.0.1:4173/output`
  → different origins → Take never reaches output, uploaded logos won't resolve.

**Use `127.0.0.1` for both.** Open `/setup` → **Production readiness** to see this
page's origin, copy the matching URLs, and run the capability checks.

## OBS wiring

1. **Output** — add a **Browser Source**: URL `http://127.0.0.1:4173/output`,
   **width 1920 / height 1080**, transparent background on. Place it **above** your
   camera/video sources.
2. **Control** — `View → Docks → Custom Browser Docks…` → add
   `http://127.0.0.1:4173/control`.
3. For stable testing, serve the **production build**: `npm run build`, then a
   static server / `npm run preview` on the same port.
4. Refresh the Browser Source after starting the app; `/output` recovers the last
   graphic from `localStorage`.

## Production smoke test (run in order)

1. `/setup` → **Run storage test** → localStorage, IndexedDB, BroadcastChannel all OK.
2. `/control` → **Brand → Upload logo** → "Image saved locally".
3. **Library → People → Add person** with a headshot → save.
4. **Apply** the person to the Lower Third → name/role/headshot fill.
5. **Live tab → Layout** → change Size/Position.
6. **Take live** → confirm the lower third (logo + headshot) on `/output`.
7. **Clear** → `/output` empties.
8. **Save graphic** (preset).
9. **Reload `/control`** (F5).
10. **Load** the saved graphic → confirm the uploaded logo/headshot **return** (asset
    ids resolved from IndexedDB).
11. Select **Scripture**.
12. Pick **John → 3 → 16**.
13. Confirm the verse **auto-loads** (reference tab + verse body match).
14. **Take live**.
15. **Edit the verse after Take** → `/output` does **not** change until you Take again.
16. Select **Announcement**.
17. **Insert date/time** (or type `{{date}} · {{time}}`).
18. **Take live**.
19. Confirm `/output` shows the resolved date/time.
20. **Refresh `/output`** (right-click source → Refresh) → confirm the graphic
    **recovers** — this is the real same-origin / cross-context proof.

If step 10 or 20 fails, the dock and source are not on the same origin.

## Feature QA (run from real `/control`)

Detailed per-feature checklists live in [`QA_CHECKLIST.md`](QA_CHECKLIST.md):

- **Lower Third** — normal vs long name/title, person+headshot, logo, layout sizes, accent colour.
- **Scripture** — book/chapter/verse picker, auto-load, range, typed + Lookup, manual paste, WEB/KJV, fast-tap race guard, offline fallback.
- **Announcement** — normal/long, dynamic `{{date}}` / `{{time}}` / `{{weekday}}`.
- **Rundown** — build a service rundown, run it live (Take selected / Next), edit a
  selected item, dock vs studio queue. Full pack: [`RUNDOWN_QA.md`](RUNDOWN_QA.md).
- **Output** — Take, Clear, refresh recovery, transparency, preview-vs-output match.

## Output-rendering harness (no OBS needed)

`http://127.0.0.1:4173/seed-test.html` seeds each template into a real `/output`
iframe over simulated camera/dark/bright backdrops, with toggles for long content,
**layout size**, **accent colour** (theme-aware keylines), **dynamic date/time**,
the fade variant, and safe-area guides. Use it for fast rendering/legibility QA;
use real `/control` for assets, People, and the scripture picker.

## Regression guardrails (architecture invariants — keep true)

Verified in this pass by source inspection:

- `/output` (`OutputPage.tsx`) imports **no** control store; it reacts only to
  `SHOW_GRAPHIC` / `CLEAR_ALL` realtime messages.
- `/output` **never fetches scripture** (no provider import).
- **Draft editing never mutates live output** — Take sends a deep-cloned snapshot
  (`buildGraphicInstance`); `/output` only changes on the next Take.
- **Saved Graphics & messages store asset *ids*, not bytes** — no `dataUrl`/Blob in
  presets or the `livelayer:lastMessage` payload; resolved image URLs are created
  only on `/output` after receiving the message.
- **People store `headshotAssetId` / `logoAssetId`** (ids), not image bytes.
- **Dynamic fields save raw tokens** (`{{date}}`); resolution happens at render.
- **Layout settings persist** in Saved Graphics (`savePreset` stores `layout`).
- **Scripture manual edits are preserved** unless the reference changes; the
  auto-load race guard applies only the latest selection.
- **Lower-third accents follow theme variables** (`--gfx-accent-2` from the Brand
  "Accent" swatch); no hardcoded gold in template CSS.

## Known limitations affecting production

See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) — local-first/single-machine,
manual OBS setup, scripture lookup needs network (manual paste fallback), and
import/export is currently selected-rundown only.
