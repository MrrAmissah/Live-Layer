# People / Speaker Library

Phase 2B adds a local People Library for reusable speaker profiles. It is built
for the common church/event workflow: save a preacher once, then apply their
name, title, church, and photo to a lower third quickly during production.

## What it stores

People are stored as small local records in `localStorage` under
`livelayer.people`. Uploaded headshots still use the Phase 2A Local Asset System:
the profile stores only a `headshotAssetId`, and the image blob lives in
IndexedDB.

Each person can store:

- display name
- title or role
- church/ministry name
- optional subtitle
- optional production notes
- optional headshot asset id
- favorite flag
- last-used timestamp

People records are separate from saved graphics/presets. Existing presets keep
working unchanged.

## How to use it

1. Open `/control`.
2. Go to **Library**.
3. Choose **People**.
4. Add a person and optionally upload a headshot.
5. Save the person.
6. Select **Preacher Lower Third** or press **Apply** from the person card.
7. The lower-third draft is filled with the person's name, title, church, and
   headshot.
8. Press **Take** when ready.

Applying a person updates `lastUsedAt`, so recently used people float higher in
the list. Favorites stay at the top.

## Asset behavior

Headshots are uploaded through the existing asset validation and IndexedDB
pipeline:

- PNG, JPG/JPEG, and WebP are accepted.
- Files over 12 MB are rejected.
- Very large images are downscaled on upload.
- The profile stores an asset id, not image bytes.
- `/output` resolves the headshot from IndexedDB using the same origin rule as
  logos.

Use the same origin for `/control` and `/output`, for example:

- `http://127.0.0.1:4173/control`
- `http://127.0.0.1:4173/output`

Do not mix `localhost` and `127.0.0.1`.

## Current limitations

- No import/export pack yet.
- No duplicate detection.
- No crop/zoom editor; headshots use a fixed circular cover-fit slot.
- Deleting a person does not delete uploaded image assets, because assets may be
  reused later.
- People are local to the current browser/origin.

## Future plan

Later phases can add asset picking from a full library, import/export bundles,
duplicate merging, person-to-brand defaults, and optional crop/focal-point
controls. Those are intentionally outside Phase 2B.
