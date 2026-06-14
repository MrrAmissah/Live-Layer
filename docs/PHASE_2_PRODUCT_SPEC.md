# LiveLayer — Phase 2 Product & Technical Specification

Status: **Living spec.** Phase 1 (the alpha) shipped the core OBS
loop, three templates, dock/studio control UI, preview parity, Take/Clear,
auto-hide, slide/fade motion, brand theming, and local presets. Phase 2 turns
LiveLayer from a demo into a real production tool **without** adding a backend,
auth, cloud, marketplace, Tauri, a native plugin, or a Canva-style builder.

This spec defines **what to build next and how to slice it safely**. Phase 2A
Local Asset System, Phase 2B People/Speaker Library, Phase 2C Dynamic
Date/Time Fields, Phase 2D Layout/Size Controls, and Phase 2E Scripture Lookup
are implemented; later Phase 2 slices remain future work. The
asset layer has its own deep-dive: [`LOCAL_ASSET_SYSTEM.md`](LOCAL_ASSET_SYSTEM.md),
People has [`PEOPLE_LIBRARY.md`](PEOPLE_LIBRARY.md), and dynamic fields have
[`DYNAMIC_FIELDS.md`](DYNAMIC_FIELDS.md). Layout controls are documented in
[`LAYOUT_PRESETS.md`](LAYOUT_PRESETS.md), and scripture lookup is documented in
[`SCRIPTURE_LOOKUP.md`](SCRIPTURE_LOOKUP.md).

---

## 1. Product rationale

Phase 1 proved the loop; Phase 2 removes the friction that stops a volunteer from
running a real service:

- **Real images.** URL-only logos/headshots fail offline and can't represent
  speakers. Operators need to upload and reuse local assets.
- **No retyping.** A **People library** means a speaker's name/role/church/photo
  is entered once and recalled in two taps.
- **Scripture without copy-paste gymnastics.** A **lookup** that fills the verse
  from a reference, with manual entry always available.
- **Automation.** **Dynamic date/time** fields so announcements don't need manual
  time editing every week.
- **Safe flexibility.** **Layout/size presets** that let operators adjust output
  without breaking broadcast-safe design.
- **A persistence model** that can hold all of the above and is ready for export
  and a future rundown.

Everything stays **local-first and OBS-safe**: `/output` stays transparent, the
Take/Clear message loop, the template registry, preview parity, and existing
presets are all preserved.

## 2. User workflows

**Upload & reuse a logo:** Brand → Upload logo → choose file → preview →
"Image saved locally" → it appears in the graphic and in `/output` on Take.

**Add a speaker once, reuse forever:** Library → People → Add person →
name/role/church + upload headshot → save. Next week: Library → People → search
→ Apply → fields auto-fill → Take.

**Scripture lookup:** Graphic = Scripture → type `John 3:16` → (choose
translation) → Look up → review/edit text → Take → optionally Save preset.

**Automatic announcement time:** announcement `dateTime` = `{{eventTime}}` or
`Sunday · {{time}}` → preview shows the resolved value → stays current on every Take.

**Adjust safely:** Live/Layout → Size: Medium, Position: Left → stays inside
title-safe → save with the preset.

## 3. Technical architecture

Built on the existing app (React + Vite + TS, `/control` dock+studio, transparent
`/output`, Zustand store, BroadcastChannel + localStorage mirror). New pieces:

- **Asset layer (IndexedDB).** Blobs live in IndexedDB; everything references
  assets **by id**. The `SHOW_GRAPHIC` message and its localStorage mirror carry
  ids only — **a Blob cannot survive `JSON.stringify`, and `/output` restores
  from that mirror on refresh, so ids are the only model that works.** Both
  surfaces resolve ids via one shared `useAsset(idOrUrl)` hook. See the asset doc.
- **Persistence abstraction.** A typed repository layer (`src/lib/store/*`) over
  localStorage (small structured records) and IndexedDB (blobs), versioned with
  additive migrations. Existing `lib/storage.ts` is wrapped, not broken.
- **Dynamic-field resolver.** One pure function applied **identically** in preview
  and `/output` at render time; a live timer runs only when a live token is present.
- **Layout resolver.** Beginner enums → safe-area-clamped CSS variables/transform
  on the renderer root, in the 1920×1080 authoring space, so it scales with
  `GraphicStage`.
- **Scripture provider abstraction.** A `ScriptureProvider` interface with a
  public-domain default; manual entry always available; results cached locally.

All graphics still flow `/control` → `SHOW_GRAPHIC` → `/output`; the payload gains
**asset ids, a `layout` object, and token-bearing values** (all JSON-safe).

## 4. Data models

Additive to `src/types/graphics.ts`. **Every new field is optional** so Phase-1
data keeps validating and rendering.

```ts
// --- assets (full model in LOCAL_ASSET_SYSTEM.md) ---
type AssetType = 'logo' | 'speaker-headshot' | 'event-logo' | 'background' | 'generic';
type AssetSource = 'uploaded' | 'url';
interface LocalAsset { id; type: AssetType; name; source: AssetSource;
  blobKey?; mimeType?; sizeBytes?; width?; height?; dataUrl?; url?; notes?;
  createdAt; updatedAt; }

// --- people / speakers ---
interface Person {
  id: string;
  displayName: string;
  title?: string;            // role
  organization?: string;     // church / ministry
  subtitle?: string;
  headshotAssetId?: string;  // -> LocalAsset
  logoAssetId?: string;      // -> LocalAsset
  defaultTemplateId?: string;
  defaultThemeId?: string;   // -> BrandKit, optional
  defaultLayoutId?: string;  // -> LayoutPreset, optional
  notes?: string;
  favorite?: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- scripture ---
interface ScriptureReference { book: string; chapter: number; verseStart: number; verseEnd?: number; raw: string; }
interface ScriptureLookupResult {
  reference: string;         // normalized "John 3:16"
  text: string;
  translation: string;       // "WEB", "KJV", ...
  attribution?: string;      // required copyright/credit line
  providerId: string;
  fetchedAt: string;
}
interface ScriptureProvider {
  id: string; label: string; requiresKey: boolean;
  translations: { id: string; label: string; public?: boolean }[];
  lookup(ref: string, translation?: string): Promise<ScriptureLookupResult>;
}
interface ScriptureCacheEntry { key: string /* ref+translation */; result: ScriptureLookupResult; favorite?: boolean; usedAt: string; }

// --- dynamic fields ---
interface DynamicFieldContext {
  now: Date;
  locale: string;            // default 'en-GH'
  timeZone?: string;         // default device tz
  hourCycle: 'h12' | 'h23';
  eventDateTime?: string;    // ISO, for {{eventTime}} / {{countdown}}
}

// --- layout / sizing ---
interface LayoutSettings {
  size?: 'small' | 'medium' | 'large';
  position?: 'left' | 'center' | 'full';
  density?: 'compact' | 'standard' | 'bold';
  safeMargin?: 'normal' | 'tight';
  // advanced (later, all optional, all clamped to safe area):
  offsetX?: number; offsetY?: number; scale?: number; fontScale?: number;
  logoScale?: number; headshotScale?: number;
}
interface LayoutPreset { id; name; templateId?: string; layout: LayoutSettings; createdAt; updatedAt; }

// --- brand kits (promotes today's single brand override to named kits) ---
interface BrandKit { id; name; theme: Partial<TemplateTheme>; logoAssetId?: string; createdAt; updatedAt; }

// --- app settings ---
interface AppSettings { locale; hourCycle; timeZone?; defaultBrandKitId?; storageVersion: number; }

// --- future rundown (model only, no UI in Phase 2) ---
interface RundownItem { id; order: number; label: string; presetId?: string; personId?: string; scriptureKey?: string; layoutId?: string; }
interface Rundown { id; name; items: RundownItem[]; createdAt; updatedAt; }
```

**Additive changes to existing types:**

```ts
interface TemplateTheme { /* …existing… */ logoAssetId?: string; } // alongside logoUrl
interface GraphicInstance {
  /* …existing id/templateId/values/theme/durationSeconds/… */
  assetRefs?: Record<string, string>;   // field/slot -> assetId (e.g. headshot)
  layout?: LayoutSettings;
  personId?: string;                     // provenance when filled from a Person
  // values may now contain dynamic tokens (e.g. "{{eventTime}}") — resolved at render
}
```

## 5. UI changes

Reuse the dock steps + studio panels; **no layout redesign**.

- **Brand step/panel** → upload-first (Upload / Replace / Remove / "Use URL
  instead" / Reset). See asset doc.
- **Library / People** → the secondary Library tab/panel contains Saved Graphics
  and People sections: search, favorites, recent usage, person cards, and Apply
  to lower third.
- **Edit step** → Scripture template gains a reference field + "Look up" + a
  translation selector + a small result/edit area; manual edit always available.
  Dynamic-token-aware fields show a resolved preview hint.
- **Live/Layout** → beginner Size / Position / Density / Safe-margin controls
  (segmented, like auto-hide); "Save layout".
- **Asset browser** → a lightweight picker (grid of `dataUrl` thumbnails) reused by
  Brand and People.

Everything stays plain-language; no `blob`/`base64`/`IndexedDB` in UI copy.

## 6. Local asset system (summary)

Upload → validate (PNG/JPG/WebP; reject SVG/oversize) → store **blob in
IndexedDB**, **reference by id**. Both surfaces resolve via `useAsset`; `/output`
`await img.decode()`s before animating to avoid flicker; missing assets degrade to
monogram/placeholder. Presets store ids, never blobs. The control surface and
`/output` share the same origin IndexedDB so uploaded logos persist across refresh
and restore flows as long as the browser/profile is the same. Full detail and the
`LocalAsset` model: [`LOCAL_ASSET_SYSTEM.md`](LOCAL_ASSET_SYSTEM.md).

## 7. Scripture lookup & licensing

- **Reference picker *(implemented)*.** The reference field is a guided
  book → chapter → verse picker (`ScriptureReferencePicker.tsx`): local book +
  chapter chips, provider-assisted verse chips (cached, silent-degrade), with
  direct typing always available. The reference string is the single source of
  truth. See [`SCRIPTURE_LOOKUP.md`](SCRIPTURE_LOOKUP.md).
- **Provider-ready, not provider-locked.** `ScriptureProvider` interface; ship a
  default, allow others later.
- **Default: public-domain / permissive** — `bible-api.com` (WEB, plus KJV-style),
  no API key, fine for simple references. **Manual paste is always the fallback.**
- **Later: `API.Bible`** for broader licensed translations (user supplies a key in
  settings). **ESV only if its API terms permit the intended use** — do not assume.
- **Do not bundle copyrighted translations** in the repo. Attribution lines from a
  provider must be displayed when required.
- **Caching:** recent lookups + favorites + last-used translation in localStorage;
  a manual edit to fetched text is preserved (never silently re-overwritten).
- **Error states:** offline / API down / reference not found / translation
  unavailable / missing key → each shows a clear message and **falls back to manual
  entry**; a lookup failure never blocks Take.

## 8. Dynamic date/time fields

- **Tokens** in field values, resolved at render: `{{date}}`, `{{time}}`,
  `{{weekday}}`, `{{month}}`, `{{year}}`, `{{eventTime}}`, `{{countdown}}`.
- **Resolver:** one pure `resolveDynamicFields(input, ctx: DynamicFieldContext): string`
  used **identically** by preview and `/output` (via `Intl.DateTimeFormat`).
- **Formatting:** device time first; `h12`/`h23` toggle; default locale `en-GH`
  (Ghana-friendly, e.g. `14 June 2026`, `Sunday · 10:30 AM`); per-field manual
  override always wins (a literal value with no tokens is passed through untouched).
- **Updates:** static tokens resolve once at Take. **Only** when a value contains a
  live token (`{{time}}` when shown as a clock, `{{countdown}}`) does `/output`
  start a timer — 1s for countdown, otherwise the coarsest interval that matters —
  so idle graphics never re-render and OBS CPU stays flat.
- **Presets store tokens, never resolved values**, so "current date" is always
  current. `eventDateTime` lives on the instance/layout for `{{eventTime}}`/`{{countdown}}`.

## 9. Layout & sizing

- **Beginner-safe first:** Size (Small/Medium/Large), Position (Left/Center/Full),
  Density (Compact/Standard/Bold), Safe margin (Normal/Tight) — enums that map to
  CSS variables / a transform on the renderer root.
- **Always safe-area aware:** transforms operate in the **1920×1080 authoring
  space** and are **clamped to the title-safe box** (`stage.ts`), so nothing can be
  dragged off-frame; they scale correctly under `GraphicStage`.
- **Advanced later:** numeric offsetX/Y, scale, fontScale, logo/headshot size — same
  clamps.
- **Attaches to:** the template (defaults), the `GraphicInstance` (`layout`), a
  saved `LayoutPreset`, a `Person` (`defaultLayoutId`), and a future `RundownItem`.
- Applied identically in preview and `/output`.

## 10. Persistence plan

Incremental, not a rewrite:

- **Keep localStorage** for small structured records: presets, people, brand kits,
  layout presets, scripture cache, app settings.
- **IndexedDB** only for blobs (asset bytes) — and as the eventual home for
  structured stores if they grow.
- **Introduce a thin repository abstraction** (`src/lib/store/`): `assets`,
  `people`, `presets`, `brandKits`, `layoutPresets`, `scriptureCache`, `settings`
  — each a typed CRUD module wrapping today's `lib/storage.ts`. Zod-validate on read.
- **Versioned schema + additive migrations** (`AppSettings.storageVersion`); a
  read that finds an older shape upgrades it in place. Phase-1 presets (with
  `logoUrl`, no `assetRefs`/`layout`) load unchanged.
- **Export/import** is prepared (stable ids, asset metadata) but **not built** in
  Phase 2.

**Open decision (see §15):** make the repository API **async from day one** (even
while backed by localStorage) so a later move to IndexedDB doesn't ripple through
callers — at the cost of changing store hydration from sync-at-init to
load-then-populate.

## 11. Implementation phases (safe slices)

Each slice is shippable, behind the unchanged Take/Clear contract, and leaves the
app working.

- **2A — Local Asset System** *(implemented)*. IndexedDB asset store + `useAsset`
  resolver → upload/validate/downscale → Brand upload UI → asset ids in presets
  → `/output` decode-before-animate for local logos. Speaker-headshot type is in
  the model for 2B, but no People/headshot UI ships in 2A.
- **2B — People/Speaker Library** *(implemented)*. Person CRUD + search +
  recent/favorite → headshot via 2A → "Apply" hydrates lower-third
  name/title/church/headshot/logo fields → `personId` provenance on the instance.
- **2C — Dynamic Date/Time Fields** *(implemented)*. `resolveDynamicFields` +
  `DynamicFieldContext` → announcement quick inserts → preview/output parity →
  live timer only when needed. Settings UI remains future work.
- **2D — Layout/Size Controls** *(implemented)*. Beginner enums + safe-area-aware
  data attributes → `layout` on the instance and saved graphics → preview/output
  parity. Named layout preset library remains future work.
- **2E — Scripture Lookup** *(implemented)*. `ScriptureProvider` abstraction +
  `bible-api.com` WEB/KJV default + manual fallback + local cache + error states.
- **2F — Persistence Upgrade.** Repository abstraction + versioned migrations +
  export/import *preparation* (no UI).
- **2G — Rundown Readiness.** Land the `Rundown`/`RundownItem` **models and id
  conventions only** — no rundown UI.

## 12. Risks

- **IndexedDB sharing across the OBS dock and Browser Source is browser-origin
  dependent and still needs manual OBS confirmation.** The implementation uses
  one same-origin IndexedDB database and the production build passes. **Mitigation:**
  the first production QA task is to set a graphic from the dock, refresh
  `/output`, confirm restore, then confirm the uploaded logo still renders.
  **Contingency if the spike fails:** the primary fallback becomes inlining small
  assets as a `dataUrl` in the `SHOW_GRAPHIC` message, **hard-capped to logos
  ~30–50KB** (it rides the ~5MB localStorage mirror shared with presets); larger
  assets simply aren't supported in that environment until packaged (Tauri).
- **Flicker / pop** if an image isn't ready when the build animates → `await
  img.decode()` before `data-state="in"`.
- **Storage bloat** → size reject + automatic downscale; IDB for blobs, not localStorage.
- **Dangling references** after asset deletion → degrade to placeholder; warn on
  delete; export must bundle blobs.
- **Dynamic-field timers** → only run when a live token is present; never a global
  per-second tick.
- **Scripture licensing** → public-domain default; never bundle copyrighted text;
  show attribution.
- **Migration regressions** → additive optional fields + versioned migration; a
  Phase-1 preset must load and render unchanged (acceptance criterion).
- **Transparency regressions** → `background` assets are in-graphic elements only;
  `/output` document background stays transparent (acceptance criterion).

## 13. Acceptance criteria

- **Phase-1 compatibility:** a saved preset with a `logoUrl` string and no
  `assetRefs`/`layout` loads and renders **identically** to today.
- **Asset by reference:** no image bytes ever appear in a `SHOW_GRAPHIC` message or
  its localStorage mirror; `/output` resolves ids itself and restores correctly
  after a refresh.
- **No flicker:** referenced images are decoded before the in-animation plays.
- **Degrade gracefully:** a missing/deleted/unresolved asset renders a
  monogram/placeholder, never an error or broken-image icon.
- **Transparency preserved:** default `/output` stays fully transparent; a
  `background` asset only fills where the user explicitly places it inside a graphic.
- **Tokens, not values:** presets persist dynamic tokens and asset **ids**, never
  resolved date/time strings or blobs; resolved values are current at render time.
- **Safe-area safety:** no layout setting can push content outside title-safe;
  transforms are clamped in 1920×1080 space and scale with `GraphicStage`.
- **Preview parity holds:** preview and `/output` resolve assets, tokens, and layout
  through the **same** code paths.
- **Loop preserved:** Take/Clear, auto-hide, slide/fade animation, the template
  registry, and existing presets all behave as in Phase 1.
- **People:** a person can be created with a headshot and reused to fill a lower
  third from Library → People → Apply. Deleting a person does not delete uploaded
  image assets; asset reference warnings remain future Library work.

## 14. What NOT to build yet

- Backend, database server, auth, accounts, cloud sync.
- Marketplace; template/preset sharing UI; multi-machine/network control.
- Tauri/Electron packaging; native OBS C++ plugin; OBS WebSocket automation.
- Full Canva-style visual builder; crop/zoom/filter editor.
- Full rundown/queue **UI** (only the data model in 2G).
- Export/import **UI** (only the model/metadata groundwork in 2F).
- SVG assets, animated images, video assets.
- Paid/licensed scripture translations by default (provider-ready only).

## 15. Open questions (answer before coding)

1. **Async storage API from day one?** Recommended (avoids a painful later refactor
   when structured stores move to IndexedDB), but it changes store hydration from
   sync-at-init to **load-then-populate** (a brief empty-then-filled state on first
   paint). Accept that one-time cost now, or stay sync and refactor later? *(Lean:
   async now.)*
2. **Auto-downscale on upload in 2A**, or only the hard size reject? Downscale keeps
   the library small and uploads fast but is slightly more code/CPU on upload.
   *(Lean: hard reject in 2A, downscale default-on in 2D/2F.)*
3. **Default locale/time format** — confirm `en-GH`, `14 June 2026`, and 12-hour
   `10:30 AM` as defaults (with toggles)?
4. **Scripture default translation** — start with WEB (modern, public domain) vs KJV
   (familiar, public domain)? *(Lean: WEB default, KJV available.)*
5. **People entry point** — resolved in 2B as a secondary **Library** tab with
   Saved Graphics and People sections to avoid top-level tab sprawl.

---

*Companion: [`LOCAL_ASSET_SYSTEM.md`](LOCAL_ASSET_SYSTEM.md). Context:
[`ARCHITECTURE.md`](ARCHITECTURE.md), [`TEMPLATE_SCHEMA.md`](TEMPLATE_SCHEMA.md),
[`CONTROL_UI_UX.md`](CONTROL_UI_UX.md), [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md),
[`ROADMAP.md`](ROADMAP.md).*
