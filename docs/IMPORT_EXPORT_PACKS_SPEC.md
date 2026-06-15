# Import / Export Packs — Design Spec

Status: **IE1–IE3 shipped** (pure helpers + Selected-Rundown export + import
**preview**); IE4 safe import next. Designs how LiveLayer backs up and moves data
between machines (it's local-first, so this is the only way to share or migrate).
Import so far is **read-only preview** — no data is written until IE4.

> **Top-line invariant:** import/export is pure **control-surface data movement** —
> it reads/writes `localStorage` + IndexedDB only. It **never** touches `/output`,
> the realtime channel, or Take/Clear. Importing data does **not** auto-take
> anything on air. Frame the whole feature as low-risk because of this.

## Why

LiveLayer keeps everything in this browser's `localStorage` + IndexedDB. Operators
need to: back up before an event, move a setup to another laptop, and share a
service rundown with another media operator — preserving rundowns, Saved Graphics,
People, and the uploaded **logos/headshots** those reference.

## What we already have

- **Assets** in IndexedDB (`assetStore`: `getAsset(id)`, `getAssetBlob(id)`, `listAssets()`, `saveAsset(asset, blob)`); `LocalAsset` metadata is small (ids + a compact `dataUrl` preview), blobs are separate.
- **Saved Graphics** (`livelayer.presets` → `GraphicInstance[]`), **People** (`livelayer.people` → `PersonProfile[]`, asset ids only), **Brand** (`livelayer.brand` → theme), **Rundowns** (`livelayer.rundowns` → `{ version, rundowns }`, snapshots with ids + raw tokens).
- **Reference helpers** (`rundownReferences.ts`): `collectRundownAssetIds`, `collectRundownPersonIds`, `collectRundownTemplateIds`, `estimateRundownStorageSize` — the IE1 groundwork.

## Pack types

1. **Full Backup Pack** — all rundowns + Saved Graphics + People + brand + all referenced assets + version metadata. (Migration / disaster recovery.)
2. **Selected Rundown Pack** — one rundown + its referenced People + referenced assets + template ids + version metadata. (Share a service.)
3. **People / Assets Pack** — People profiles + their headshots/logos.
4. **Saved Graphics Pack** — selected Saved Graphics + referenced assets (+ their layout/theme/tokens, which are already inside the `GraphicInstance`).

**Recommendation:** ship **Selected Rundown Pack** first (the highest-value sharing
use case and the smallest surface), then Full Backup. People/Assets and Saved
Graphics packs are thin variations of the same machinery — add as needed.

## File format — `.livelayerpack` (ZIP)

A ZIP archive (binary blobs belong in a real container, not base64):

```
livelayer-pack/
  livelayer-pack.json        ← manifest (records, ids only)
  assets/
    <assetId>.png
    <assetId>.webp
```

**Dependency:** add **`fflate`** (~8KB gzipped, MIT, tree-shakeable, sync zip/unzip)
at IE2. It's the one justified new dependency. **Base64-in-JSON is rejected** —
+33% size, the whole pack held in memory as one string, and we'd abandon it the
moment Full Backup ships. IE1 (types + pure helpers) needs no dependency.

### Manifest schema

```jsonc
{
  "format": "livelayer-pack",
  "version": 1,                 // pack-format version
  "createdAt": "2026-06-15T10:30:00.000Z",
  "app": { "name": "LiveLayer", "schemaVersion": 1 },
  "packType": "rundown",        // "full" | "rundown" | "people" | "savedGraphics"
  "contents": {
    "rundowns": [ /* Rundown[] (snapshots, ids + raw tokens) */ ],
    "savedGraphics": [ /* GraphicInstance[] */ ],
    "people": [ /* PersonProfile[] */ ],
    "brand": { /* TemplateTheme, optional */ },
    "assets": [ /* LocalAsset metadata — file lives in assets/<id>.<ext> */ ]
  },
  "summary": {                  // precomputed for fast import preview
    "rundowns": 1, "savedGraphics": 0, "people": 2, "assets": 3,
    "templateIds": ["preacher-lower-third", "scripture-card"]
  }
}
```

Excluded by design (see Data safety): scripture **cache**, recents, diagnostics,
API keys, machine details, file paths.

## Asset handling

- **Collect:** for the pack's records, gather referenced asset ids
  (`collectRundownAssetIds` for rundowns; add `collectGraphicAssetIds(graphic)` and
  `collectPeopleAssetIds(people)` helpers for the other pack types).
- **Retrieve:** `getAssetBlob(id)` per id → add to the zip as `assets/<id>.<ext>`
  (ext from `LocalAsset.mimeType`); add the `LocalAsset` metadata to `contents.assets`.
- **Missing blob → warn + skip, never fail.** The asset is omitted from the zip; its
  metadata may still be included, and on import the referencing record keeps a
  dangling id → degrades to the existing **monogram/placeholder** fallback. Export
  reports a "N assets missing" warning.
- **Dedup:** **not** in IE2–IE4 — remap every asset to a new id unconditionally
  (simplest, correct, non-destructive); re-importing the same pack twice duplicates
  blobs, which is acceptable. Content-hash dedup (SHA-256 of the blob) is an **IE5
  / Full-Backup optimization**, not a first-slice requirement.

## Import behavior — non-destructive via full ID remap

**Default and only mode for IE4: keep both / generate new ids.** Nothing existing is
ever overwritten. Import order is load-bearing — **assets first**, then records:

1. **Restore assets.** For each `assets/<oldId>` blob + its metadata: mint a
   **new** asset id, `saveAsset(newAsset, blob)` into IndexedDB, and record
   `assetIdMap[oldId] = newId`.
2. **Rewrite + import records** against `assetIdMap` (and a `personIdMap` built the
   same way). Then assign each rundown/item/graphic/person a **new** id.

### The reference paths that must be rewritten (the hard 20%)

Asset ids appear in **multiple** places inside a `GraphicInstance` — rewrite **every**
occurrence:

- `graphic.values.logoAssetId`
- `graphic.values.headshotAssetId`
- every value in `graphic.assetRefs` (e.g. `{ logo, headshot }`)
- `graphic.personId` → via `personIdMap`
- `PersonProfile.headshotAssetId`, `PersonProfile.logoAssetId` → via `assetIdMap`
- rundown `selectedItemId` / `activeItemId` → via the item-id map (or just clear them on import)

**Worked example.** A rundown item's graphic references logo `a1` and headshot `a2`:

```jsonc
// in pack
{ "values": { "logoAssetId": "a1", "headshotAssetId": "a2", "name": "Anna" },
  "assetRefs": { "logo": "a1", "headshot": "a2" }, "personId": "p7" }

// after import (assetIdMap {a1→a9, a2→aA}, personIdMap {p7→pK})
{ "values": { "logoAssetId": "a9", "headshotAssetId": "aA", "name": "Anna" },
  "assetRefs": { "logo": "a9", "headshot": "aA" }, "personId": "pK" }
```

Imported records get fresh ids, so they coexist with existing data; `activeItemId`
should be cleared on import (nothing is live on import).

### Import preview (IE3) — required before any write

Parse the manifest and show: # rundowns / Saved Graphics / People / assets, and
**unsupported template ids**. The latter is a **warning, not a blocker** — an
imported graphic with an unknown `templateId` already degrades gracefully (the
renderer returns `null`, verified in R6); compute it via `collectRundownTemplateIds`
against the registry. Operator **confirms** before IE4 writes anything.

## Data safety

- **Export only:** rundowns / Saved Graphics / People / brand / referenced assets.
- **Never export:** `livelayer.scriptureCache`, `livelayer.chapterVerseCache`,
  `livelayer.recent`, diagnostics, API keys, local file paths, machine details, or
  whole Bible databases.
- **Scripture text vs cache (concrete):** `graphic.values.verseText` **does** export
  (it's part of the graphic the operator built); the scripture **cache** does **not**
  — IE2 must not sweep `livelayer.scriptureCache` into the pack.
- **Licensing note (in-app + docs):** users are responsible for the rights/licensing
  of uploaded media and copied scripture text they export or share.

## Versioning & migrations

- Manifest carries **`version`** (pack format) + **`app.schemaVersion`**.
- **Newer pack than this app supports → block import with a clear message** ("This
  pack was made with a newer LiveLayer; update to import it.").
- **Older pack → migrate** (additive, the same forward-only pattern as the store
  migrations). Unmigratable → block with a message.
- A corrupt/invalid manifest → reject before any write (validation in IE3).

## UI placement

- **Library → Export / Import** is the home (a small section/tab alongside Saved
  Graphics / People / Rundowns). Import always opens the **preview + confirm** modal.
- **Rundowns → "Export this rundown"** — a per-rundown action (Selected Rundown Pack).
- **Setup → Backup / Restore** — Full Backup export + restore (the disaster-recovery surface).
- Keep the dock uncluttered: export is a button; import is button → preview → confirm.

## Implementation phases

- **IE1 — Pack spec + pure helpers. ✅ Done.** `types/exportPack.ts` (manifest +
  summary + asset-entry + warning types); `collectGraphicAssetIds` /
  `collectPeopleAssetIds` added to `rundownReferences.ts`; pure helpers in
  `lib/export/exportPackManifest.ts` (`createSelectedRundownManifest`,
  `buildPackSummary`, `safePackFilename`/`buildPackFilename`, `getPackAssetPath`,
  `encodeManifestJson`). (`validateManifest`/`summarizeManifest`/`remapPackIds`
  belong to IE3/IE4 — not built.)
- **IE2 — Export Selected Rundown Pack. ✅ Done.** `lib/export/exportRundownPack.ts`
  (`fflate` `zipSync`): snapshots the rundown (clears `activeItemId`), loads
  referenced People + asset blobs from IndexedDB, builds the manifest, zips
  `livelayer-pack.json` + `assets/<id>.<ext>`, downloads
  `livelayer-rundown-<name>-<date>.livelayerpack`. Missing blobs **warn + skip**;
  URL assets carry their `url` (no file). Export action on each `RundownCard` and
  the studio panel header. Reads localStorage + IndexedDB only — no `/output`,
  realtime, or scripture-cache access.
- **IE3 — Import preview. ✅ Done.** `lib/export/importPackPreview.ts` (`fflate`
  `unzipSync` with a name-collecting `filter` so only `livelayer-pack.json` is
  decompressed): `parseLiveLayerPackFile(file)` → `validatePackManifest(unknown)`
  (blockers: not-a-pack / wrong `format`, **newer `version` → blocked**, missing
  `contents`, missing `rundowns` for selected-rundown, non-array `assets`) →
  `summarizePackManifest(manifest, zipEntries)` (counts, rundown names, sample item
  titles, asset filenames; `findUnsupportedTemplateIds` vs the registry,
  `findMissingAssetFiles` vs the zip). Soft issues are **warnings, not blockers**
  (unsupported pack type, unsupported template, missing asset file, empty rundown,
  url-only assets). UI: **Library → Import** tab (`ImportPackPreview.tsx`) — choose
  a `.livelayerpack`, see the summary + warnings; the Import button is **disabled
  ("Import comes next (IE4)")**. **Strictly read-only** — no localStorage, no
  IndexedDB, no realtime, no `/output`; pack strings are React-escaped (never
  injected as HTML) and length-capped.
- **IE4 — Safe import.** Restore asset blobs (new ids), remap references, import
  records with new ids, confirm-gated, non-destructive.
- **IE5 — Full Backup / Restore.** Export all; restore with confirmation; optional
  asset content-hash dedup; the **merge vs replace** decision (open question).
- **IE6 — Polish / QA.** Error states, large-file/memory handling, partial-failure
  recovery, docs, manual tests.

**Ship first: IE1 + IE2** (export a rundown), then IE3 + IE4 (import). Full Backup
(IE5) after the rundown round-trip is proven.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Large asset blobs / browser memory | Selected packs are small; stream/zip incrementally; Full Backup warns on size via `estimateRundownStorageSize`. |
| Corrupt pack | Validate manifest before any write (IE3); reject with a clear message. |
| Missing asset blobs | Warn + skip on export; degrade to monogram on import (existing fallback). |
| Unsupported templates | Warning, not blocker — graphic renders nothing, no crash (R6-verified). |
| ID conflicts / duplicate people/assets | Full remap → new ids, never overwrite; dedup deferred to IE5. |
| Copyrighted media / scripture | In-app + docs licensing note; user responsibility. |
| Importing a future app version | Block on newer `version`/`schemaVersion`. |
| Partial import failure | Import is staged (assets → records); on failure, roll back the new ids written so far, or import atomically per record with a report. |
| localStorage quota on import | `safeWrite` already swallows quota errors; surface a "storage full" message and stop. |

## Open questions (for the user — not pre-decided)

1. **Rundown import + Saved Graphics:** does importing a rundown also add its
   referenced Saved Graphics as standalone Library entries, or only the rundown's
   self-contained snapshots? (Snapshots are independent; `source.presetId`
   provenance would dangle → "snapshots only, provenance informational" is the clean
   default — but it's a product call.)
2. **Full Backup restore — merge or replace?** Merge (remap, keep both) is
   consistent with everything else; replace (wipe + restore) is what people often
   expect from "restore a backup." Recommend offering **both** with replace behind a
   strong confirm, but confirm the default.
3. Pack file extension/MIME — `.livelayerpack` (ZIP) confirmed?
4. Should People/Assets and Saved Graphics packs ship at all, or is Rundown + Full
   Backup enough for now?
