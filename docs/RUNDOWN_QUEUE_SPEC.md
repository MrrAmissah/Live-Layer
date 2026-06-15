# Rundown / Queue Mode — Design Spec

Status: **R1-R6 shipped for the current local-first phase.** This documents how an
operator prepares a list of graphics, orders them, and walks them live during a
service. It layers on Phase 2 **without changing `/output`'s contract** (still
reacts only to `SHOW_GRAPHIC` / `CLEAR_ALL`, still resolves assets from
IndexedDB, still resolves dynamic tokens at render). See
[`RUNDOWN_QA.md`](RUNDOWN_QA.md) for the closeout checklist.

## Vision & core loop

```
Prepare service graphics → arrange in order → preview next → Take → Next → Take
```

A media operator builds a "Sunday Morning Service" rundown (announcement →
worship title → scripture → sermon lower third → closing announcement), then runs
it: select an item, check the preview, Take it live, move to the next, Take.

## The model in one paragraph

A **Rundown** is a named, ordered list of **Rundown Items**. Each item is a
**deep-cloned snapshot of a `GraphicInstance`** — the exact fields, layout, asset
ids, person id, and *raw* dynamic tokens captured when it was added. Items are
**independent** (not live-linked to the Saved Graphic / person they came from), so
editing an item never changes its source and vice-versa. Taking an item posts the
existing `SHOW_GRAPHIC` message with its snapshot, so live output behaves exactly
as it does today.

---

## Design questions answered

1. **What is a Rundown?** A named, ordered list of graphics for one service/event.
2. **What is a Rundown Item?** A titled, independent snapshot of a `GraphicInstance` + provenance + a `done` flag.
3. **How does a Saved Graphic become an item?** "Add to rundown" deep-clones the Saved Graphic's `GraphicInstance` into a new item (`source: { type:'savedGraphic', presetId }`).
4. **Can an item be edited independently?** Yes — it owns its own snapshot; editing it touches nothing else.
5. **Does editing the source update the item?** No. **Snapshot, not live link** (see Risks: live-linking causes on-air surprises).
6. **How does the operator preview current/next?** The **selected** item renders in the same preview-parity `TemplatePreview` used everywhere; the queue shows the **next** item's title.
7. **How does Take work?** Take posts `SHOW_GRAPHIC` with the **selected** item's snapshot (deep-cloned at post time); that item becomes `activeItemId` (live).
8. **How does Clear work?** Clear posts `CLEAR_ALL`, blanks `/output`, and sets `activeItemId = null`. It does **not** reorder, delete, or mark anything done — it only answers "nothing is live now."
9. **How does "Next" work?** Advances `selectedItemId` to the next item (preview updates). By default it does **not** fire (see §Take/Next semantics).
10. **How does "Previous" work?** Moves `selectedItemId` to the prior item; preview-only.
11. **How are done/current/upcoming shown?** Derived: `live` = `activeItemId`, `selected` = `selectedItemId`, `done` = the item's persisted `done` flag, else `upcoming`. A pulsing **LIVE** badge marks the active item; a highlight marks the selected one.
12. **How are scriptures added quickly?** From the Scripture flow, "Add to rundown" snapshots the current scripture draft (`source: scripture`).
13. **How are people/speakers added quickly?** From Library → People, "Add to rundown" applies the person to a lower third and snapshots it (`source: person`).
14. **How are announcements added quickly?** "Add to rundown" from the announcement draft (`source: draft`/`manual`).
15. **How does it fit the dock flow?** No new primary tab. **Management** lives in **Library**; **operation** is a compact **queue strip on the Live tab**.
16. **How does it fit studio?** A richer queue **column/panel** (full ordered list, drag-reorder, per-item actions) beside the preview + Take deck.
17. **Missing asset?** Preview and `/output` degrade to the monogram/placeholder via the existing `resolveAssetSource` fallback — never a crash.
18. **Dynamic fields?** Items store **raw tokens** (`{{date}}`). They resolve at render/Take via `useDynamicValues`, so a rundown built yesterday shows today's date when taken today. **Never resolved at add-time.**
19. **Layout settings?** Stored inside each item's `GraphicInstance.layout` (already part of the snapshot).
20. **Future import/export?** A rundown exports as a `.livelayerpack` (manifest of snapshots, ids only) plus its referenced asset blobs bundled from IndexedDB; ids enumerate what to bundle. Now designed in [`IMPORT_EXPORT_PACKS_SPEC.md`](IMPORT_EXPORT_PACKS_SPEC.md) — the R6 `rundownReferences` helpers feed it.

---

## Data model

Additive new types (`src/types/rundown.ts`); reuses `GraphicInstance` unchanged.

```ts
export interface Rundown {
  id: string;
  name: string;                 // "Sunday Morning Service"
  items: RundownItem[];         // ordered
  activeItemId?: string;        // currently LIVE on /output (null when cleared)
  selectedItemId?: string;      // preview/edit cursor (independent of live)
  createdAt: string;
  updatedAt: string;
}

export interface RundownItem {
  id: string;
  title: string;                // auto-derived (scripture ref / person name / headline), editable
  graphic: GraphicInstance;     // deep-cloned snapshot — ids + raw tokens, no blobs
  source?: RundownItemSource;   // provenance only
  done?: boolean;               // operator-set; the only persisted status
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type RundownItemSource =
  | { type: 'draft' }
  | { type: 'savedGraphic'; presetId: string }
  | { type: 'person'; personId: string }
  | { type: 'scripture'; reference: string }
  | { type: 'manual' };
```

**Refinement vs the brief:** the persisted item status is reduced to a single
`done` flag; `live`/`selected`/`upcoming` are **derived** from the rundown's
`activeItemId` / `selectedItemId` (single source of truth). This directly prevents
the "queue status out of sync" risk — there is no per-item status to keep aligned.

---

## Storage

- **localStorage key `livelayer.rundowns`**, consistent with presets (`livelayer:*`)
  and people (`livelayer.people`). A versioned wrapper for future migration:
  `{ version: 1, rundowns: Rundown[] }`.
- **Ids only, no blobs.** An item's `GraphicInstance` carries asset **ids** and raw
  tokens; image bytes stay in IndexedDB (resolved at render, same as everywhere).
- **Size:** a 30-item rundown ≈ ~30 KB JSON; localStorage's ~5 MB holds many
  rundowns comfortably. A soft cap (e.g. warn past ~50 items) keeps it sane.
- **Async note:** sync localStorage matches the current presets/people stores. If
  the structured stores later move to the IndexedDB/async abstraction, rundowns
  move with them — the repository API is the only caller.

---

## UI placement & mode semantics

**No new primary dock tab** (avoids tab sprawl, keeps the beginner Graphic → Edit
→ Live flow). Two surfaces:

- **Library → Rundowns** (build/manage): create/rename/delete rundowns; list items;
  reorder (up/down buttons in dock, drag in studio); duplicate; delete; mark done.
  "Add to rundown" appears in the draft editor, Saved Graphics, and People.
- **Live tab → queue strip** (operate): when a rundown is *active*, a compact strip
  shows **selected item · next item**, with **Take**, **Next ▶**, **Previous ◀**,
  and the existing **Clear**. Studio shows the full ordered list as a column.

### Two modes — define the sticky bar explicitly

The dock's sticky bottom bar changes meaning by mode (state both so no third
behavior is invented):

- **Ad-hoc mode** (no rundown active): **Take live** takes the **draft** (today's behavior, unchanged).
- **Rundown mode** (a rundown is active): **Take live** takes the **selected item**;
  **Next ▶** advances the selection (preview only); an optional **Take next**
  combined control advances *and* fires as one deliberate press. **Clear** is
  identical in both modes (blank `/output`, `activeItemId = null`).

A clear mode indicator (e.g. the status bar shows the active rundown's name)
tells the operator which Take they're about to press.

---

## Decision: editing a rundown item (the load-bearing one)

The selected rundown item **is the edit surface in rundown mode** — not the
shared ad-hoc draft loaded-and-written-back. Concretely:

- When a rundown item is selected, the **Edit** and **Live** tabs bind to *that
  item's* working copy. Edits update the item (and autosave the rundown) and the
  preview; **`/output` is unchanged until Take** (this is exactly Flow 3).
- **Draft fate:** the ad-hoc draft (`store.draftValues`) is **preserved, not
  clobbered** — selecting a rundown item stashes/leaves the ad-hoc draft intact;
  it returns when no item is selected / no rundown is active. No mid-service
  data-loss surprise.
- **Take semantics:** in rundown mode Take fires the **selected item's current
  (possibly just-edited) state**; in ad-hoc mode Take fires the draft. Never
  ambiguous because the mode is explicit.

**Implementation consideration (flag for R-phase):** the editors
(`TemplateFields`, the scripture picker, `LayoutControls`, `BrandControls`)
currently hardcode `useLiveLayerStore` draft slices. Supporting "edit the selected
item" needs a small **edit-target indirection** — the store exposes a current edit
context (`draft` | `rundownItem:<id>`) and routes `setField`/`setTheme`/`setLayout`
accordingly. This is additive and is the first thing R4 must design.

> **Rejected alternative:** "load item into the shared draft, write back on save."
> Simpler wiring, but it clobbers in-progress ad-hoc work and makes Take ambiguous
> (draft vs live item). Documented as the fallback only if the indirection proves
> too costly.

## Decision: Take / Next / auto-advance

**Default to explicit Next** — `Next ▶`, `Previous ◀`, and `Take` are distinct
operator actions, matching the brief's "Take → Next → Take." A labeled **Take
next** button is offered as the one-press "advance + fire" convenience.

**Implicit auto-advance is opt-in** (a rundown setting), default **off**. Rationale:
a silent post-Take jump means the operator presses Take expecting to re-fire/adjust
what's live and instead fires the *next* graphic on air — a sharp edge for a
beginner-first live tool. Explicit advance keeps "what will Take fire?" answerable
at a glance.

---

## Interaction flows

**Flow 1 — Build a service rundown:** Library → New rundown "Sunday Morning" → Add
announcement (from draft) → Add scripture (from scripture flow) → Add lower third
(from a Person) → reorder with up/down → autosaved.

**Flow 2 — Run it live:** open the rundown (Live tab strip appears) → select item 1
→ check preview → **Take** (item 1 = live) → **Next ▶** → **Take** (item 2 = live) →
**Clear** when done → mark items **done**.

**Flow 3 — Emergency change:** pastor changes the scripture → operator (with the
scripture item selected) edits the reference/verse → **preview updates, `/output`
unchanged** → **Take** to push the change live.

**Flow 4 — Saved Graphic → rundown:** load a Saved Graphic → **Add to rundown** →
edit it in the rundown → the original Saved Graphic is untouched (snapshot).

**Flow 5 — Missing asset:** an item references a deleted headshot → preview and
`/output` show the monogram fallback → no crash; deleting an asset referenced by a
rundown should later warn ("used by N rundown items").

---

## Technical risks & mitigations

- **Shared-object mutation (draft/live/rundown):** deep-clone on add, on update, and
  again at Take-post time (reuse the existing `snapshot()` discipline). Items never
  share references with the draft or each other.
- **Saving too much data:** snapshots are JSON-small (ids + tokens, no blobs); soft
  item cap + localStorage quota guarding (existing `safeWrite` try/catch).
- **Stale asset references:** degrade to fallback (`resolveAssetSource`); warn on
  asset delete; export bundles blobs so ids mean something off-machine.
- **Dynamic fields resolving too early:** store raw tokens; resolve only at
  render/Take — never at add-time. (Covered by reusing `useDynamicValues`.)
- **Selected vs live confusion:** two cursors (`selectedItemId` vs `activeItemId`),
  a LIVE badge, and the explicit mode indicator; Take fires the selected item only.
- **Queue status desync:** only `done` is persisted; live/selected derived — nothing
  to keep in sync.
- **Dock crowding:** no new tab; the queue strip is compact and only appears when a
  rundown is active; full management stays in Library/studio.
- **Import/export compatibility:** versioned storage wrapper, ids-only snapshots,
  and bundled referenced asset blobs for selected-rundown packs; Full Backup comes later.

---

## Implementation phases (shipped sequence)

- **R1 — Data + store (no UI). ✅ Done.** `types/rundown.ts` (model +
  `RundownItemInput`); `lib/rundown/rundownStore.ts` — versioned localStorage CRUD
  under `livelayer.rundowns` (`{ version: 1, rundowns, activeRundownId }`) with
  `listRundowns`/`getRundown`/`createRundown`/`updateRundown`/`deleteRundown`/
  `setActiveRundown`, `addItem`/`updateItem`/`deleteItem`/`duplicateItem`/`moveItem`,
  `setSelectedItem`/`setActiveItem`/`toggleItemDone`, plus pure helpers
  (`createRundownItemFromGraphic`, `cloneRundownGraphic`, `deriveItemTitle`,
  `getSelectedItem`/`getNextItem`/`getPreviousItem`). Every snapshot is deep-cloned
  (`structuredClone`); ids/tokens only, no blobs. **No UI, no zustand slice, no
  runtime change yet** — the module is unimported until R2, so the JS bundle is
  unchanged. The hook (`useRundowns`) is deferred to R2 (an unwired hook would be
  dead code now). Manual verification (browser console on `/control`):
  `const r = await import('/src/lib/rundown/rundownStore.ts')` is not available in
  the production build; instead verify in dev by importing in a scratch component,
  or in R2 via the hook.

  > **Manual smoke (dev):** in a scratch import — `createRundown('Test')`,
  > `addItem(id, { graphic, source:{type:'draft'} })`, `moveItem`, `duplicateItem`,
  > `toggleItemDone`, reload → `listRundowns()` returns the persisted data; confirm
  > the stored JSON under `localStorage['livelayer.rundowns']` contains **no**
  > `dataUrl`/blob, only asset ids and raw `{{tokens}}`.
- **R2 — Library: build. ✅ Done.** A **Rundowns** tab in `LibraryControls`
  (alongside Saved Graphics + People — no new dock tab). `useRundowns` hook wraps
  the R1 store with a module-level pub-sub so consumers stay in sync. Operator can
  create/rename/delete rundowns, set one active, **Add current draft**, **Add to
  rundown** from a Saved Graphic, and reorder (↑/↓), duplicate, delete, mark done,
  and select items. All snapshots deep-clone; deleting a rundown clears
  `activeRundownId`, deleting an item clears `selectedItemId`. **No live operation,
  no Take/Clear, no `/output` change** (verified: no rundown refs in
  OutputPage/ControlPage/realtime). Selecting an item only sets `selectedItemId`.
  Components: `RundownLibrary`, `RundownCard`, `RundownItemList`, `RundownItemCard`.
  Person → rundown is deferred to R3 (added via the apply-then-add flow).
- **R3 — Operate (Live). ✅ Done.** A `RundownQueue` section on the Live tab (dock
  `LiveStep` + studio `LiveActionsPanel`): active rundown name, selected/next,
  **Previous/Next**, a compact list with **LIVE** (`activeItemId`) + done badges,
  and a "Select first item" affordance. **Take/Clear are NOT duplicated here** —
  see the sticky-bar decision below. A shared `useLiveTakeContext()` is the single
  source for the Take label, disabled state, and preview source, so the Live preview
  (dock + studio `PreviewPanel`) shows the **selected item** — exactly what Take
  fires. Take/Clear reuse the existing realtime path; `/output` is untouched.

  **Sticky-bar decision (one canonical Take, no ambiguity):** the existing sticky
  bar (dock) / action-deck (studio) Take button is the only Take. `ControlPage.onTake`
  is mode-aware — active rundown → deep-clone + `SHOW_GRAPHIC` the **selected item**
  + set `activeItemId` (no auto-advance, no mark-done); else the ad-hoc draft Take
  (byte-identical). It is relabeled **"Take selected"** and **disabled** when a
  rundown is active with no selection (active rundown + no selection is a **no-op**,
  never the draft). `onClear` posts `CLEAR_ALL` and clears `activeItemId` (does not
  mark done). No auto-advance, no Take Next, no edit-selected-item (R4).
- **R4 — Edit selected item. ✅ Done.** `useEditTarget()` is the single abstraction
  every content/layout/duration editor reads & writes through: draft mode returns
  the exact store setters (ad-hoc byte-equivalent); rundown-item mode targets the
  selected item's snapshot via `updateItem` (deep-clones on write — the ad-hoc
  draft, Saved Graphics, and People are never touched). `TemplateFields` (+ the
  scripture picker via its props), `LayoutControls`, and `DurationControl` route
  through it. In rundown mode the **Edit surface** (dock `EditStep` + studio
  `FieldEditor`) becomes the full item editor (text + layout + duration) with an
  `EditTargetBanner` ("Editing rundown item · draft preserved", plus "Take selected
  again to update output" when the item is live); the Live tab stays the R3 queue.
  Edits commit per keystroke so the preview updates live, but **never post a
  realtime message** — `/output` changes only on the next Take selected. Raw
  dynamic tokens stay raw; `isLive` derives from the persisted `activeItemId`.
  **BrandControls stays global** (edits `store.theme`) — the item keeps its
  captured theme/logo; a note appears in the Brand area when a rundown item is
  selected. Per-item theme/logo editing is deferred.
- **R5 — Studio queue panel. ✅ Done.** `StudioRundownPanel` (studio only — mounts
  in `LiveActionsPanel`, which renders at ≥1024px; the dock keeps the compact
  `RundownQueue`). Shows the active rundown name + item count, a Selected/Live/Next
  summary, Previous/Next, and the **full ordered list** with per-item move ↑/↓,
  duplicate, delete, done toggle, select, and **selected / LIVE / done** badges
  (reuses `RundownItemCard`). **Additive UI only** — reuses the R2/R3/R4 hooks and
  ops (no new state, no second queue, no second Take path); Take/Clear stay the
  mode-aware action-deck buttons above it. Empty states cover no-rundowns /
  none-active / no-items / none-selected. `/output`, realtime, and Take/Clear are
  untouched (verified). Reorder is Up/Down buttons — no drag-and-drop.
- **R6 — Polish, QA, export-readiness. ✅ Done.** Soft caps (`MAX_RUNDOWNS = 50`,
  `MAX_ITEMS_PER_RUNDOWN = 100`) with friendly limit messages; **sanitize-on-read**
  (drops malformed records, repairs dangling `selectedItemId`/`activeItemId`/
  `activeRundownId`, falls back missing titles/names); shared `getQueueCursors`
  helper (dedups the dock + studio queues); pure export-readiness helpers in
  `rundownReferences.ts` (`collectRundownAssetIds`/`collectRundownPersonIds`/
  `collectRundownTemplateIds`/`estimateRundownStorageSize`, now used by selected
  import/export packs);
  and the full manual QA pack in [`RUNDOWN_QA.md`](RUNDOWN_QA.md). No `/output`,
  realtime, or Take/Clear change. **Rundown is feature-complete for this phase.**

Each phase is shippable and leaves `/output`, Take/Clear, presets, assets, People,
scripture, dynamic fields, and layout untouched.

## Open questions for the operator

1. **Auto-advance** — default off (recommended) or on? (Risk vs convenience.)
2. **One active rundown at a time** (recommended) or multiple open?
3. **Mark done** — manual only, or auto-mark the previous item when a later one is taken?
4. **Reorder UX in dock** — up/down buttons (recommended) vs drag on touch.
5. **Take-next button** — ship the combined "advance + fire" control in R3, or defer to R6?
