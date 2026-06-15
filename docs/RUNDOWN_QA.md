# Rundown / Queue Mode — QA & Closeout

Rundown is **feature-complete for this phase** (R1–R6) across dock and studio. This
is the manual QA pack and the closeout reference. Full design rationale:
[`RUNDOWN_QUEUE_SPEC.md`](RUNDOWN_QUEUE_SPEC.md).

> **In-session caveat:** the build agent has no headless browser, so the rundown
> UI is build-verified, not pixel-verified. Run the checklists below on the machine
> (and the operate/output steps in real OBS — see [`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md)).

## What shipped (R1–R6)

- **R1** typed model + versioned `livelayer.rundowns` store (ids/tokens only, no blobs).
- **R2** Library → Rundowns: create/rename/delete, set active, add current draft / Saved Graphic, reorder ↑↓, duplicate, delete, mark done.
- **R3** Live-tab queue: select / Previous / Next, **Take selected** (mode-aware sticky/deck Take), Clear, LIVE badge.
- **R4** edit the selected item in place (text + layout + duration) via `useEditTarget`; ad-hoc draft preserved.
- **R5** studio queue panel (full list + management + badges).
- **R6** guards, dedup, export-readiness helpers, this doc.

## Dock workflow (< 1024px)

Library → **Rundowns** (build) → **Edit** tab (edit the selected item) → **Live**
tab (compact queue: select/Next/Prev; the sticky **Take selected** fires it).

## Studio workflow (≥ 1024px)

Everything visible at once: the **On-air actions** column hosts the full
`StudioRundownPanel` (ordered list + reorder/duplicate/delete/done + badges); the
field editor edits the selected item; the deck **Take selected** fires it.

## R6 guards (defensive)

- **Soft caps:** `MAX_RUNDOWNS = 50`, `MAX_ITEMS_PER_RUNDOWN = 100`. `createRundown`/
  `addItem` return `undefined` at the cap; the UI shows a friendly "limit reached" /
  "rundown is full" message.
- **Sanitize on read:** malformed rundowns/items are dropped; a missing title falls
  back to the derived title (or template id); a missing rundown name → "Untitled rundown".
- **Cursor repair:** a `selectedItemId`/`activeItemId` that no longer matches an item,
  or an `activeRundownId` with no rundown, is treated as cleared — editors fall back
  to the draft, the queue shows the empty state, no crash.
- **Malformed localStorage:** `read()` try/catches and returns empty state.
- **Unknown template id:** the control preview shows an unsupported-template
  placeholder; `/output` still avoids crashing and renders no unknown graphic.

## Import / export pack support

`src/lib/rundown/rundownReferences.ts` backs selected-rundown pack export/import:
`collectRundownAssetIds`, `collectRundownPersonIds`, `collectRundownTemplateIds`,
and `estimateRundownStorageSize` enumerate referenced people, templates, and local
assets without touching `/output`.

## Manual QA checklist

### Build / manage (Library → Rundowns)
1. Create a rundown · 2. Rename it · 3. Set it active · 4. Add current draft ·
5. Add a Saved Graphic (Saved graphics → **+ Rundown**) · 6. Reorder ↑/↓ ·
7. Duplicate an item · 8. Mark done · 9. Delete an item · 10. Reload `/control` ·
11. Confirm rundowns + items **persist**.

### Operate (Live tab / studio deck)
1. Select an item · 2. Preview shows the selected item · 3. **Take selected** ·
4. `/output` shows it · 5. **Next** · 6. Preview changes, `/output` does **not** ·
7. **Take selected** · 8. `/output` updates · 9. **Clear** · 10. `activeItemId`
clears (LIVE badge gone), selection **stays**.

### Edit selected item
1. Select · 2. Edit text · 3. Edit layout · 4. Edit duration · 5. Scripture picker
(scripture item) · 6. Preview updates · 7. `/output` **unchanged** until Take ·
8. Take selected again · 9. `/output` updates. (Banner shows "Take selected again"
when the item is live.)

### Dock / studio
1. Below 1024px → compact dock queue · 2. Above 1024px → full studio panel ·
3. No overflow either way · 4. Resize across 1024 → clean switch.

### Guards
1. Create 50 rundowns → 51st shows "limit reached" · 2. Add 100 items → 101st shows
"rundown is full" · 3. Delete the selected/live item → recovers, no crash ·
4. (Dev) corrupt `localStorage['livelayer.rundowns']` → app loads with empty rundowns, no crash.

### Regression (must still work)
Asset upload · People Library · Scripture picker (+ auto-load + race guard) ·
Dynamic fields (raw tokens) · Saved Graphics · **ad-hoc mode when no rundown is
active** (edit draft, Take draft) · `/output` transparent + only changes on Take.

## Future work (not in this phase)

- **Full Backup / restore** — selected-rundown packs are shipped; full project
  backup remains intentionally out of this phase.
- **Take Next** — a one-press "advance + fire" control (selection + Take in one action).
- **Auto-advance** — optional post-Take selection move (default off, opt-in).
- **Drag-and-drop reorder** — replace/augment the Up/Down buttons.
- **Per-item brand/logo editing** — currently brand is global; the item keeps its
  captured theme.
