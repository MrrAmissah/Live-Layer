# LiveLayer QA Checklist

Manual QA for the alpha (there are no automated tests yet). Work top to bottom
before a release or a demo.

> **Fast visual QA without OBS:** open `http://127.0.0.1:4173/seed-test.html`
> (dev server port **4173**, set in `vite.config.ts`). It seeds each template into
> a real `/output` iframe over simulated **camera / dark / bright** backdrops,
> with toggles for **long / stress content**, the **fade crossfade** variant, and
> **safe-area guides**.

> **Local asset origin rule:** use the same origin for every route during asset
> QA, for example `http://127.0.0.1:4173/control` and
> `http://127.0.0.1:4173/output`. Do not mix `localhost` with `127.0.0.1`, and
> do not mix ports. Uploaded assets are stored in same-origin IndexedDB.

## 1. Build & smoke

- [ ] `npm install` succeeds
- [ ] `npm run build` is clean (tsc strict + vite, no errors/warnings)
- [ ] `npm run dev` starts; `/control`, `/output`, `/setup` all load
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
- [ ] Radio selection is obvious; only one template selected at a time

## 9A. People Library

Use `http://127.0.0.1:4173` for every browser/OBS URL in this section.

- [ ] Open `/control` and go to **Library → People**
- [ ] Add a person with name, title, church/ministry, notes, and favorite status
- [ ] Upload a headshot; confirm it previews in the form/card
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

## 10. Stress & contrast (seed harness)

- [ ] **Long text:** Lower Third long name steps the type down (not the band); Scripture 3-line verse and Announcement long headline/CTA stay inside title-safe — no overflow
- [ ] **Empty optionals:** missing logo / CTA still balance
- [ ] **Bright background:** all three templates stay legible over the **Bright** backdrop
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
