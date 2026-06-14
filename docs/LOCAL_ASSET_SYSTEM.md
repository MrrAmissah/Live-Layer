# Local Asset System

How LiveLayer will handle user-provided images (logos, headshots, backgrounds)
in a **local-first, OBS-safe** way. This is the deep-dive behind Phase 2A of
[`PHASE_2_PRODUCT_SPEC.md`](PHASE_2_PRODUCT_SPEC.md).

## Why URL-only is not enough

Today a logo is a `logoUrl` string passed through to the `Medallion`. That fails
real production:

- **Offline / venue networks.** A remote URL won't load if the building's network
  is flaky or the laptop is offline — the logo silently disappears on air.
- **Hotlink rot.** URLs 404, change, or get rate-limited between rehearsal and service.
- **No real headshots.** Speaker photos are almost never available as a stable public URL.
- **No reuse.** Operators re-paste the same URL every week; there's no library.
- **Latency / flicker.** A network image can pop in mid-animation.

The fix: **upload once, store locally, reference forever** — with the URL field
kept as an advanced fallback.

## The one constraint that drives the whole design

`/control` sends graphics to `/output` over `BroadcastChannel`, **mirrored to
`localStorage`** so `/output` can restore the active graphic after a refresh
(OBS refreshes Browser Sources often). That mirror is `JSON.stringify`'d — **a
Blob cannot survive it.** Therefore:

> **Graphics reference assets by ID. Image bytes never travel through the
> message channel or localStorage. `/output` resolves the ID to a blob itself.**

This keeps the message small and JSON-safe, keeps the refresh-restore path
working, and is the only model that survives a `/output` reload.

## Same-origin requirement

Uploaded assets are stored in the browser's IndexedDB for the current origin.
That means `/control` and `/output` must use the exact same protocol, host, and
port.

Use one origin consistently, for example:

- `http://127.0.0.1:4173/control`
- `http://127.0.0.1:4173/output`

Do **not** mix `localhost` and `127.0.0.1`, and do **not** mix ports. To the
browser, `http://localhost:4173` and `http://127.0.0.1:4173` are different
origins with different IndexedDB stores, so an uploaded logo can appear in
`/control` but be missing in `/output`.

## Supported asset types

```ts
type AssetType =
  | 'logo'            // brand / ministry / event mark
  | 'speaker-headshot'// person photo for lower thirds
  | 'event-logo'      // per-event lockup
  | 'background'      // texture / fill element INSIDE a graphic (never the doc background)
  | 'generic';        // sponsor graphics, misc production images

type AssetSource = 'uploaded' | 'url';
```

**Phase 2A ships `logo` + `speaker-headshot`.** The other types are valid in the
model from day one but get UI later.

## Asset model

```ts
interface LocalAsset {
  id: string;                 // stable reference used everywhere
  type: AssetType;
  name: string;               // user-facing, defaults to filename
  source: AssetSource;        // 'uploaded' | 'url'

  // bytes (uploaded assets) — stored in IndexedDB, NOT in this record's store
  blobKey?: string;           // key into the asset-blob store (usually === id)
  mimeType?: string;          // 'image/png' | 'image/jpeg' | 'image/webp'
  sizeBytes?: number;
  width?: number;
  height?: number;
  dataUrl?: string;           // tiny downscaled preview for fast grids

  // url assets (fallback)
  url?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

The model intentionally carries **both** `blobKey` and `url` so the same type
covers uploaded and URL assets, and so export tooling can later resolve either.

## Storage approach

**IndexedDB for everything asset-related** (blobs can't go in localStorage, and
the metadata list will grow):

- Database `livelayer`, version-managed.
- Object store **`assetMeta`** — `LocalAsset` records (no raw Blob), keyed by `id`.
  Holds the small `dataUrl` thumbnail so the asset browser renders a grid **without
  loading full-size blobs**.
- Object store **`assetBlobs`** — `id → Blob`, read only when a full-resolution
  image is actually needed (preview/output render, export).

This implementation ships in Phase 2A. The control surface saves uploaded
logos as `LocalAsset` records with `logoAssetId` references in the draft values.
Presets store the `logoAssetId` inside `values`, not raw image bytes. `/output`
resolves the asset id from the last JSON-safe message and loads the blob from
IndexedDB at runtime.

Why not localStorage: base64 images bloat the ~5MB origin quota that presets also
share, and serializing them on every write is slow. Why a thin separation of meta
vs blob: listing the library stays cheap; only the rendered graphic loads bytes.

**Dependency:** none required — a ~60-line hand-rolled IndexedDB wrapper is
enough. If the raw API gets unwieldy, `idb` (Jake Archibald, ~1KB gzipped,
promise wrapper) is the only acceptable add. No other dependency.

## Upload pipeline

```
choose file → validate → read → measure (Image.decode) → make thumbnail
            → write blob + meta to IndexedDB → return LocalAsset
```

### Validation (2A, required)

- **Accept** `image/png`, `image/jpeg`, `image/webp`. Defer **SVG** (sanitization
  risk) — reject for now with a clear message.
- **Reject** unsupported types: *"That file type isn't supported. Use a PNG, JPG, or WebP."*
- **Hard size reject** above **12 MB**: *"That image is too large. Please choose a file under 12 MB."*
- **Warn** above a soft cap is deferred; normal large files are downscaled automatically.
- Read dimensions via `await img.decode()`; never block the UI thread on a huge image.
- Always show: thumbnail, name, dimensions, file size.

### Thumbnails / downscale

Generate the `dataUrl` thumbnail by drawing the decoded image to a small
`<canvas>`. Phase 2A also downscales stored raster images whose longest edge is
above 1600px, preserving PNG/WebP transparency by keeping the original MIME type.
If processing fails, the upload reports a friendly error instead of writing a
partial asset.

## How templates reference assets

1. Field/brand stores an **asset id**, e.g. `logoAssetId`, `headshotAssetId`
   (alongside the legacy `logoUrl` for back-compat).
2. A shared resolver hook is used by **both** surfaces so preview === output:

```ts
// reads assetMeta/assetBlobs, creates an object URL, revokes on unmount
function useAsset(idOrUrl?: string): { src?: string; status: 'idle'|'loading'|'ready'|'missing' }
```

3. Renderers ask for `logoAssetId` **first**, fall back to `logoUrl`, then to a
   monogram/placeholder. Existing templates change minimally (the `Medallion`
   already takes a resolved `src`).

### `/output` resolution + no flicker

On `SHOW_GRAPHIC`, `/output`:

1. Reads referenced asset ids from the message.
2. Loads each blob from IndexedDB and creates an object URL.
3. **`await img.decode()` for resolved local images before flipping
   `data-state="in"`.** Pre-resolve, *then* animate — so the build choreography
   does not play over a half-loaded image that pops.
4. Revokes object URLs when the graphic unmounts (no leaks across a long service).

If an asset can't be resolved (missing/cleared, or — see Risks — IndexedDB not
shared in this OBS setup), the renderer logs a warning and degrades to a
monogram/placeholder rather than erroring. If metadata exists but the full blob
is missing, the tiny saved `dataUrl` thumbnail may be used as an emergency
fallback; image bytes are still never inlined into `SHOW_GRAPHIC` messages.

## Preset integration

- Presets store **asset ids** (and any legacy `logoUrl`), never blobs.
- Loading a preset restores template + field values + layout + brand + **referenced
  asset ids**; images re-resolve through `useAsset`.
- **Dangling references degrade**: a preset pointing at a deleted asset falls back
  to the medallion monogram/placeholder. Reference counting and delete warnings
  are future Library work.

## Brand panel changes (beginner-friendly)

The Brand tab/step becomes upload-first, URL-optional:

- **Upload logo** → **Choose image** → thumbnail preview → **"Image saved locally"**
- **Replace image**, **Remove image**
- **"Use URL instead"** reveals the advanced URL field
- **Reset to template** restores default colours/logo

Labels stay plain. Never surface `blob`, `base64`, `object URL`, or `IndexedDB`
in the UI.

## Manual verification checklist

Use the same origin throughout this checklist, for example
`http://127.0.0.1:4173`.

1. Open `http://127.0.0.1:4173/control`.
2. Go to Brand and choose a PNG, JPG/JPEG, or WebP logo under 12 MB.
3. Confirm the Brand panel shows the logo preview and "Image saved locally".
4. Select the Preacher Lower Third and confirm the medallion uses the logo in
   preview.
5. Press Take.
6. Open `http://127.0.0.1:4173/output` and confirm the same logo renders.
7. Refresh `/output` and confirm the logo still renders from IndexedDB.
8. Save a preset, reload `/control`, load the preset, and confirm the logo
   returns.
9. Remove the logo and confirm the medallion falls back to the monogram.
10. In OBS, use the same `127.0.0.1:4173` origin for the Custom Browser Dock and
    Browser Source, then repeat upload → Take → Browser Source refresh.

## Lower-third speaker image (2B)

Phase 2B uses the asset system for People Library headshots. Minimal by design:

- Upload a headshot → preview → **object-fit: cover** inside a fixed safe slot in
  the lower third (the renderer gets a clean `src`, the slot clips).
- Remove / replace.
- Save the headshot with a Person profile; applying the person fills the lower
  third's `headshotAssetId`.

A crop/zoom editor is explicitly future work.

## Limitations (current plan)

- Local to one browser/origin; no sync, no server (by design).
- Verified in-browser by implementation and build; OBS-specific IndexedDB sharing
  still needs a manual dock + Browser Source check on the production machine.
- IndexedDB capacity is generous but finite; downscale + size caps keep it sane.
- SVG deferred. No animated images (GIF/APNG) targeted.
- No editing beyond cover-fit + automatic downscale; no crop/filters yet.
- Asset sharing across machines requires the future export/import packs.

## Future: crop / resize / export

- **Resize/compress:** canvas downscale on upload (optional in 2A; default-on later).
- **Crop/zoom:** a small focal-point + zoom editor for headshots (post-2A).
- **Export/import packs:** a `.livelayer` bundle (JSON manifest + an asset folder)
  containing presets, people, brand kits, layout presets, **and the referenced
  asset blobs** — because IDs alone are meaningless on another machine. This is
  *why* assets are first-class records with metadata, not anonymous blobs.

## Licensing

Uploaded images are **user-provided local production assets**. LiveLayer does not
bundle third-party imagery and does not copy reference samples into templates
(see `.gitignore` → `reference-samples/`). **Users are responsible for holding the
rights** to images they upload and display. The system provides capability, not
content. A short in-app note on first upload is sufficient; no enforcement.
