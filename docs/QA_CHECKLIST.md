# LiveLayer QA Checklist

Manual QA for the alpha. Automated guards cover build, output isolation,
transparency, asset-id messages, and route smoke; the production OBS flow still
needs this hands-on checklist before a release or demo.

> **Fast visual QA without OBS:** open `http://127.0.0.1:4173/seed-test.html`
> (dev server port **4173**, set in `vite.config.ts`). It seeds each template into
> a real `/output` iframe over simulated **camera / dark / bright** backdrops,
> with toggles for **long / stress content**, **layout size**, **accent colour**,
> **lower-third style**, **dynamic date/time**, the **fade crossfade** variant,
> and **safe-area guides**.

> **Local asset origin rule:** use the same origin for every route during asset
> QA, for example `http://127.0.0.1:4173/control` and
> `http://127.0.0.1:4173/output`. Do not mix `localhost` with `127.0.0.1`, and
> do not mix ports. Uploaded assets are stored in same-origin IndexedDB.

> **Production / OBS run:** [`OBS_PRODUCTION_QA.md`](OBS_PRODUCTION_QA.md) has the
> end-to-end test; `/setup` → **Production readiness** runs live origin / storage /
> messaging checks.

## 1. Build & smoke

- [ ] `npm install` succeeds
- [ ] `npm run verify` passes
- [ ] `npm run build` is clean (tsc strict + vite, no errors/warnings)
- [ ] `npm run check:output-isolation` passes (output isolation + transparency + asset-id message guard)
- [ ] With `npm run dev` running, `npm run smoke:routes` returns 200 for `/control`, `/output`, `/setup`, and `/seed-test.html`
- [ ] `npm run dev` starts; `/control`, `/output`, `/setup` all load
- [ ] `/setup` → **Production readiness** shows **Uploaded asset originals** as OK, or explains thumbnail fallback / placeholder behavior for missing image blobs
- [ ] No console errors on any route

## 2. Control — OBS dock mode (narrow width)

Resize a window to ~360px, or dock `/control` in OBS at ~340–500px.

- [ ] Below 1024px the **dock** layout shows (tabs, not the studio grid)
- [ ] Sticky **status bar** stays visible: `LiveLayer · Local · <selected graphic> · Ready/Live/Cleared`
- [ ] Tabs switch one step at a time: **Graphic → Edit → Live**, plus secondary Brand / Library
- [ ] Sticky **Take / Clear** bar stays pinned at the bottom on every tab; middle content scrolls
- [ ] No control is hidden behind the bottom bar; no horizontal overflow
- [ ] Usable across ~340–500px; Take/Clear never hidden
- [ ] ~900px (tablet): the Graphic tab stays a clean **vertical** radio list (not side-by-side columns)

## 3. Control — full browser studio mode (desktop width)

- [ ] At ≥1024px the **studio** layout shows; ≥1180px is the three-column view
- [ ] Layout reads: left **rail** · centre **preview + editor** · right **actions + brand + library**
- [ ] Balanced, no dead black page gaps; preview is the prominent centrepiece
- [ ] Crossing the 1024px boundary flips dock ↔ studio cleanly with no flash

## 3A. Control redesign visual QA

- [ ] Desktop ~1440-1600px: command bar lockup is readable and the preview remains the strongest visual anchor
- [ ] Right column hierarchy reads top-to-bottom as **Live** → **Look** → **Saved work**
- [ ] Library tabs, saved graphics, People, Rundowns, Import, and empty states use calmer rows/cards without cramped labels
- [ ] Edit forms and scripture lookup sections have visible grouping, readable labels, and no clipped textarea/button text
- [ ] Dock ~360-420px: status bar, tabs, selected graphic name, preview, and sticky Take/Clear bar remain visible and usable
- [ ] Keyboard focus rings are visible on buttons, inputs, tabs, scripture chips, queue actions, and import/export controls

## 4. `/output` transparency

- [ ] `/output` shows no solid background in the browser (transparent body)
- [ ] `html`, `body`, `#root` stay transparent; no fallback colour bleeds through
- [ ] In OBS, the overlay composites over camera/video with no visible browser background
- [ ] Transparency works **without** custom CSS in the Browser Source

## 5. Take / Clear / auto-hide

- [ ] **Take** sends the graphic to `/output`; status flips to **Live**
- [ ] **Clear** removes it; status flips to **Cleared**; Take still available
- [ ] **Auto-hide** (Off / 3 / 6 / 10 / 15s) self-clears after the set time; **Off** = manual only
- [ ] Reloading `/output` mid-show restores the last active graphic if still within duration
- [ ] Take/Clear work identically from both dock (sticky bar) and studio (action deck)

## 6. Animation

- [ ] **Slide (default):** Take plays the per-element build — wipe, plate slide, masked text reveal, medallion/CTA pop
- [ ] **Slide exit:** Clear plays cleanly, no snap/flicker, unmounts ≈300ms (`GFX_OUT_MS`)
- [ ] **Fade (seed harness "fade crossfade"):** the whole graphic dissolves in as one unit — no per-element build
- [ ] **Fade exit:** pure opacity dissolve, no upward slide
- [ ] Rapid **Take** while a graphic is exiting cancels the unmount and shows the new one

## 7. Presets

- [ ] **Save** a preset with a name (defaults to template name if blank)
- [ ] Preset captures template id, field values, theme, and duration
- [ ] **Load** applies it to the editor predictably (template, fields, theme, duration)
- [ ] **Remove** deletes it; presets persist across a page reload (localStorage)

## 8. Brand

- [ ] Brand panel shows two swatches: **Main colour** (plate) and **Accent** (keylines) — no dead "Primary" swatch
- [ ] Changing **Main colour** updates the brand plate fill in preview and `/output`
- [ ] **Theme-aware accents:** on Lower Third, change **Accent** to cyan → decorative cap rail / left stripe / medallion ring update; change to red → **no gold/yellow remains**
- [ ] Take live → `/output` accent matches the preview accent (step parity)
- [ ] `/control` and `/output` are opened with the exact same protocol, host, and port
- [ ] **Logo upload** accepts PNG, JPG/JPEG, and WebP, rejects SVG/unsupported files, and rejects images over 12 MB
- [ ] **Logo upload** saves the image locally, shows "Image saved locally" in the Brand panel, and renders in the lower-third medallion
- [ ] A very large normal image is downscaled on upload and still preserves transparent PNG/WebP logos
- [ ] **Logo URL** still works as a fallback when upload is not used
- [ ] A broken Logo URL does not show a broken image icon; the medallion falls back to initials/monogram
- [ ] **Take** sends only the `logoAssetId` to `/output`; image bytes are not stored in localStorage messages or presets
- [ ] Refreshing `/output` after Take restores the uploaded logo from IndexedDB
- [ ] Saved presets preserve the uploaded `logoAssetId` and restore the logo after `/control` reload
- [ ] Removing the logo clears the uploaded asset reference and falls back to the medallion monogram
- [ ] **Reset** returns to the template's default colours
- [ ] A light brand (e.g. gold) keeps readable on-brand text (ink/white flip)

## 8A. Local asset verification

Use `http://127.0.0.1:4173` for every browser/OBS URL in this section.

- [ ] Open `http://127.0.0.1:4173/control`
- [ ] Brand → Choose image → upload a PNG, JPG/JPEG, or WebP logo
- [ ] Confirm the Brand panel preview appears and says "Image saved locally"
- [ ] Confirm the lower-third preview medallion shows the uploaded logo
- [ ] Press **Take**
- [ ] Open `http://127.0.0.1:4173/output` and confirm the logo appears
- [ ] Refresh `/output` and confirm the logo still appears
- [ ] Save a preset, reload `/control`, load the preset, and confirm the logo returns
- [ ] Remove the logo and confirm the medallion falls back to initials/monogram
- [ ] In OBS, set the Custom Browser Dock to `http://127.0.0.1:4173/control`
- [ ] In OBS, set the Browser Source to `http://127.0.0.1:4173/output`
- [ ] Repeat upload → Take → Browser Source refresh in OBS

## 9. Template switching

- [ ] Switching templates loads that template's default values and fields
- [ ] The preview, status-bar name, and editor all update together
- [ ] **Preacher Lower Third** exposes style variants as sub-options, not separate top-level templates
- [ ] Each lower-third style variant renders over Camera / Dark / Bright in `seed-test.html`
- [ ] Announcement, Event, and Quote variants render as sub-options and keep their sample-inspired layouts readable
- [ ] Radio selection is obvious; only one template selected at a time
- [ ] Template rail groups read clearly as **Lower Third**, **Card**, **Banner**, and **Fullscreen**
- [ ] New templates render in preview and `/output`: Quote Card, Event Banner, Sermon Title, Fullscreen Message
- [ ] `seed-test.html` can show every template over Camera / Dark / Bright backdrops
- [ ] Long / stress content stays inside title-safe for every new template
- [ ] Layout Size / Position / Density / Safe margin controls do not push new templates outside the frame
- [ ] Saved Graphics save/load each new template
- [ ] Rundowns can add, select, Take, and Clear each new template
- [ ] Selected-rundown export/import preserves new-template snapshots without adding blobs or data URLs to messages

## 9A. People Library

Use `http://127.0.0.1:4173` for every browser/OBS URL in this section.

- [ ] Open `/control` and go to **Library → People**
- [ ] Add a person with name, title, church/ministry, notes, and favorite status
- [ ] Upload a headshot; confirm it previews in the form/card
- [ ] A broken/missing headshot image does not break the lower third; it simply hides the headshot frame
- [ ] Save the person
- [ ] Search for the person and confirm the list filters
- [ ] Press **Apply** on the person card
- [ ] Confirm the selected graphic becomes **Preacher Lower Third**
- [ ] Confirm name/title/church fields populate in the draft
- [ ] Confirm the headshot appears in the lower-third preview
- [ ] Press **Take** and confirm `/output` renders the lower third with the headshot
- [ ] Refresh `/output`; the headshot should still render from IndexedDB
- [ ] Reload `/control`; the person should persist in Library → People
- [ ] Edit the person, save changes, and apply again
- [ ] Delete the person; confirm saved presets still load
- [ ] Existing Saved Graphics/Presets still save, load, and remove from Library → Saved graphics

## 9B. Dynamic date/time fields

Use `http://127.0.0.1:4173` for every browser/OBS URL in this section.

- [ ] Select **Announcement Banner**
- [ ] In Date / Time, choose **Use today's date**
- [ ] Confirm preview resolves to today's date, for example `14 June 2026`
- [ ] Choose **Use current time**
- [ ] Confirm preview resolves to the current time, for example `10:30 AM`
- [ ] Choose **Use date + time** and confirm both parts resolve
- [ ] Type `{{weekday}}` in the body or date/time field and confirm it resolves
- [ ] Type `{{unknown}}` and confirm it remains unchanged and does not crash
- [ ] Type normal manual text such as `Saturday • 6:30 PM` and confirm it renders unchanged
- [ ] Press **Take** and confirm `/output` resolves the same token values
- [ ] Save a preset with `{{date}} · {{time}}`
- [ ] Reload `/control`, load the preset, and confirm the raw tokens still resolve dynamically
- [ ] Confirm asset upload, People Library, Take/Clear, and Library → Saved graphics still work

## 9C. Layout controls

- [ ] Select **Preacher Lower Third**
- [ ] Go to **Live**
- [ ] Change Size: Small / Medium / Large and confirm preview changes safely
- [ ] Change Position: Left / Center / Full and confirm content remains usable
- [ ] Change Density: Compact / Standard / Bold and confirm text remains readable
- [ ] Change Safe margin: Normal / Tight and confirm content remains inside the frame
- [ ] Press **Take** and confirm `/output` matches preview
- [ ] Save a graphic in Library → Saved graphics
- [ ] Reload `/control`, load the saved graphic, and confirm layout settings persist

## 9D. Scripture lookup

- [ ] Select **Scripture Card**
- [ ] Enter `John 3:16`
- [ ] Choose WEB and press **Look up**
- [ ] Confirm reference, verse text, and translation fields fill
- [ ] Edit the returned verse manually
- [ ] Press **Take** and confirm `/output` shows the edited verse
- [ ] Repeat the lookup and confirm cached lookup message appears
- [ ] Try an invalid reference and confirm current fields are not overwritten
- [ ] Confirm manual paste still works without lookup

## 9D-i. Scripture reference picker (book → chapter → verse)

- [ ] Type `jo` → book chips John, Jonah, Job, Joel, Joshua; `jn`→John, `1 cor`→1 Corinthians, `rom`→Romans, `ps`→Psalms, `gen`→Genesis; `phil`→Philippians **and** Philemon
- [ ] Tap **John** → book fills; chapter chips **1–21** appear (local/instant)
- [ ] Tap **chapter 3** → verse hints load (chips 1..N) or Start/End inputs if offline
- [ ] Tap **verse 16** → reference reads `John 3:16` **and the verse text auto-loads** (preview tab + body match); the **to verse** select makes a range (e.g. `John 3:16-17`) and reloads
- [ ] Tap a different verse → text replaces; edit the verse text, then re-tap the **same** verse → your edit is **not** clobbered (no reference change = no reload)
- [ ] **Race guard:** on a slow network, rapidly tap several **uncached** verses (e.g. 16 → 17 → 18) → only the **last** reference's text applies; no flicker to an earlier verse, and the loading/error status reflects only the final request
- [ ] **Typed** references and the offline Start/End inputs do **not** auto-load — **Lookup scripture** (or Enter) fills them
- [ ] Direct typing still works: `Psalm 23:1-3`, `John 3:16-17`, `Romans 8:28`, `Genesis 1:1-2`
- [ ] Change translation **WEB → KJV** and Look up again → text updates
- [ ] **Offline / verse-fetch fails:** no error shown, chapter chips still work, verse falls back to typed numbers, Lookup/Take not blocked
- [ ] Verse hints do **not** fetch for the prefilled default (only after a chapter tap); repeat a chapter → cached, no network

## 9D-ii. Draft vs live separation (all templates)

- [ ] Take a Scripture live, then type a different reference while it is live → `/control` preview may change but `/output` does **not**
- [ ] Press Take → `/output` now updates to the new reference
- [ ] Repeat for Lower Third and Announcement (edit any field while live → `/output` unchanged until Take)
- [ ] Clear removes the live graphic
- [ ] Selecting a scripture suggestion while a graphic is live does **not** change `/output`

> **Rundown** is feature-complete for the current local-first phase. The sections
> below (§9E–9H) are the manual queue checks.

## 9E. Rundowns (R2 — build/manage)

- [ ] Library → **Rundowns** → create a rundown → it becomes active
- [ ] **+ Add current draft** with no active rundown shows "Create or select a rundown first."
- [ ] With an active rundown, **+ Add current draft** adds an item (title derived from the draft)
- [ ] Saved graphics → **+ Rundown** adds that Saved Graphic as a snapshot item
- [ ] Reorder ↑/↓, **duplicate** (⧉), **mark done** (✓ toggles strike-through), **delete** (✕) all work
- [ ] Selecting an item highlights it (sets selectedItemId) — **`/output` does not change**
- [ ] During **every** rundown action, `/output` stays unchanged (no Take fires)
- [ ] Rename the active rundown; delete a rundown (confirm prompt) clears its active state
- [ ] Reload `/control` → rundowns + items **persist**; `localStorage['livelayer.rundowns']` holds ids/tokens only (no `dataUrl`/blob)
- [ ] **Snapshot integrity:** add a Saved Graphic to a rundown, then edit/delete that Saved Graphic → the rundown item is **unchanged**

## 9F. Rundown live operation (R3)

- [ ] Active rundown with ≥3 items → **Live tab** shows the Rundown queue; the preview shows the **selected** item
- [ ] Sticky/deck Take is relabeled **"Take selected"**; it's **disabled** when nothing is selected (use **Select first item**)
- [ ] **Next ▶** / **◀ Previous** move the selection and update the preview — **`/output` does NOT change**
- [ ] **Take selected** → `/output` shows the selected item; the **LIVE** badge appears on that item; top status shows **Live**
- [ ] In dock mode, the sticky bar auto-hide readout matches the selected rundown item's captured duration
- [ ] Press **Next** after Take → selection moves, but `/output` stays on the previously taken item until **Take selected** again
- [ ] Taking does **not** auto-advance and does **not** mark done
- [ ] Toggle **done** (✓) in the queue — manual only
- [ ] **Clear** → `/output` blanks, the LIVE badge clears (activeItemId cleared); the **selected item stays selected**; nothing is marked done
- [ ] Reload `/control` → active rundown, selected item, and LIVE (activeItemId) all **persist**
- [ ] **No rundown active** → Live tab behaves exactly as before (ad-hoc draft Take/Clear unchanged)
- [ ] `/output` contract unchanged throughout (it only ever receives a GraphicInstance snapshot)

## 9G. Rundown — edit selected item (R4)

- [ ] Select an item → **Edit** tab shows "Editing rundown item · <title>" banner; editing the text updates the **preview**
- [ ] The ad-hoc draft is **not** changed (deselect the rundown / clear active rundown → the draft is exactly as you left it)
- [ ] Editing layout (Size/Position/Density/Safe margin) and duration on the Edit tab affects **only the selected item**
- [ ] Scripture item: book/chapter/verse picker + **auto-load** + typed Lookup all update the **selected item's** fields (race guard still works)
- [ ] Dynamic tokens stay **raw**: type `{{date}}` in an item field → `localStorage['livelayer.rundowns']` stores `{{date}}`, not the resolved date
- [ ] **Editing a live item:** with the selected item live, edit it → `/output` does **not** change; banner says "Take selected again"; press **Take selected** → `/output` updates
- [ ] **No mutation of sources:** the originating Saved Graphic and Person records are unchanged after editing the item
- [ ] **No realtime on edit:** editing never fires SHOW_GRAPHIC/CLEAR_ALL (only Take/Clear do)
- [ ] Reload `/control` → item edits persist; the editor targets the selected item
- [ ] Caret stays put while typing (no focus jump from per-keystroke commit)
- [ ] **Brand stays global:** with an item selected, the Brand area shows the "applies to new graphics" note; changing brand colours does not recolour the selected item
- [ ] **No rundown active** → editors edit the draft exactly as before (Take draft works)

## 9H. Rundown — studio queue panel (R5, desktop ≥1024px)

- [ ] At desktop width with an active rundown, the **studio queue panel** appears in the On-air actions column (full ordered list)
- [ ] Per item: order number, title, template type, **selected / LIVE / done** badges; **↑ ↓ duplicate ✕ done** controls all work (same R2 ops)
- [ ] Selecting an item from the studio panel updates the **preview + editor** (selectedItemId)
- [ ] Take selected / Clear are the **same** action-deck buttons (mode-aware) — the panel has no second Take
- [ ] Previous / Next move the selection; `/output` doesn't change until Take selected
- [ ] Empty states: no rundowns / none active / no items / none selected each show the right hint
- [ ] Deleting the selected or live item recovers safely (cursors clear; no crash)
- [ ] **Resize to dock width** → the compact dock queue (R3/R4) is unchanged and usable
- [ ] `/output`, Take/Clear, and ad-hoc mode (no rundown) are all unchanged

## 9I. Export Selected Rundown Pack (IE2)

- [ ] Build a rundown with a Lower Third (logo + headshot), a Scripture item, and an Announcement
- [ ] Library → Rundowns → **⤓ Export** (or the studio panel **Export**) downloads a `.livelayerpack` file
- [ ] Filename is safe: `livelayer-rundown-<safe-name>-<YYYY-MM-DD>.livelayerpack`
- [ ] Unzip it → `livelayer-pack.json` exists; `assets/` holds the referenced logo/headshot blobs
- [ ] Manifest `contents` has the rundown snapshot + referenced People; `summary` counts look right; **no scripture cache / API keys / local paths**
- [ ] Delete a referenced asset, then export → success message notes "N missing asset(s)"; export does **not** fail
- [ ] Export does **not** change `/output`, Take/Clear, or rundown operation

## 9J. Import Selected Rundown Pack (IE3 + IE4 safe import)

- [ ] **Idle:** Library → **Import** tab shows helper text + **Choose LiveLayer pack…**
- [ ] **Valid pack:** choose a pack exported in §9I → summary shows pack type, created date, and **rundown / item / people / asset / missing** counts
- [ ] Summary lists the rundown name, a few item titles, asset filenames, and template ids
- [ ] Confirmation text says existing data will not be overwritten
- [ ] **Import as new rundown** is enabled only for a valid `selected-rundown` pack
- [ ] Click **Import as new rundown** → success state says "Imported successfully"
- [ ] Imported rundown appears in Library → Rundowns and is the active rundown
- [ ] Imported `activeItemId` is cleared; first imported item is selected
- [ ] Referenced People are imported with new ids and remapped logo/headshot asset ids
- [ ] Uploaded logo/headshot assets display from IndexedDB after import
- [ ] Saved Graphics from the pack are not added as standalone Saved Graphics entries
- [ ] Importing the same pack again creates another separate rundown; it does not overwrite the previous import
- [ ] **Invalid file:** rename a `.txt`/`.png` to `.livelayerpack` → choose it → clear error (no crash, no raw stack)
- [ ] **No-manifest zip:** zip a random file, rename to `.livelayerpack` → "no livelayer-pack.json" error
- [ ] **Newer version:** hand-edit a pack's manifest `version` to `2`, re-zip → **blocked** with "made with a newer LiveLayer" message
- [ ] **Wrong selected-pack shape:** hand-edit a selected-rundown pack to contain two rundowns → import fails before writing with "exactly one rundown"
- [ ] **Missing asset warning:** delete an `assets/<id>` file from a pack zip → preview/import still work, warn, and the graphic falls back to placeholder/monogram
- [ ] **Malformed-but-parseable pack:** hand-edit a valid manifest so one item is junk (missing `.graphic`, `templateId` a number, `values` not an object, `theme` not an object, or `items` not an array), re-zip → preview renders without crashing; import either normalizes safe fields or fails with a clear "malformed" message before writing anything
- [ ] **Preview-only proof:** after choosing a file but before clicking import, **no new rundown appears**, no new People, no new assets
- [ ] Re-choosing the **same** file re-previews (no silent no-op)
- [ ] Preview and import do **not** change `/output`, Take/Clear, or rundown operation
- [ ] After import, `/output` remains unchanged until **Take selected**

## 10. Stress & contrast (seed harness)

- [ ] **Long text:** Lower Third long name steps the type down (not the band); Scripture 3-line verse and Announcement long headline/CTA stay inside title-safe — no overflow
- [ ] **Empty optionals:** missing logo / CTA still balance
- [ ] **Bright background:** all built-in templates stay legible over the **Bright** backdrop
- [ ] **Dark background:** all three stay legible over the **Dark** backdrop
- [ ] **Camera background:** legible over the simulated camera gradient
- [ ] Safe-area guides confirm text stays inside title-safe at all sizes

## 11. Output appearance

- [ ] Preacher Lower Third — compact, strong, lower-left title-safe
- [ ] Scripture Card — reverent, readable, broadcast-friendly
- [ ] Announcement Banner — reads as a live event graphic
- [ ] All render crisply and scale well at 1280×720 and 1920×1080

## Known limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
