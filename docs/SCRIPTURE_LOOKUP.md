# Scripture Lookup

Phase 2E adds a small scripture lookup helper for the existing Scripture Card.
Lookup is a control-side fill helper: it populates editable fields, then
`/output` renders the filled text. `/output` never calls the scripture API.

## Provider

The first provider is `bible-api.com`, using its browser-friendly JSON API. It
supports user-typed references such as `John 3:16`, `Psalm 23:1-2`, and
`Matthew 5:14-16`, and supports a `translation` URL parameter.

LiveLayer enables:

- WEB
- KJV

Manual entry always remains available, and the lookup result can be edited
before Take.

## Reference picker (book → chapter → verse)

The Scripture Card reference field is a guided **Scripture Reference Picker**
(`ScriptureReferencePicker.tsx`). The operator can **type directly** or **tap**
through the reference; both build the same string — the reference string is the
single source of truth, so there is no draft/picker drift.

1. **Choose book** — type a book name/abbreviation; a chip strip of matches appears
   (local, instant). `jo` → John, Jonah, Job, Joel, Joshua · `jn` → John · `1 cor`
   → 1 Corinthians · `ps` → Psalms · `rom` → Romans · `gen` → Genesis · `phil` →
   Philippians **and** Philemon (both shown). Tapping a book fills its canonical name.
2. **Choose chapter** — once the book resolves, chapter chips `1..N` appear from
   **local** chapter counts (`bibleStructure.ts` / `BibleBookMeta.chapterCount`),
   no network. John → 1–21, Psalms → 1–150, Romans → 1–16.
3. **Choose verse** — after a chapter is **tapped**, verse hints load: the picker
   fetches the chapter once (provider-assisted), caches the verse count, and shows
   verse chips. Tapping a verse selects a single verse; an optional **to verse**
   select extends it to a range. If verse hints are unavailable (offline/typed
   reference), compact **Start / End** number inputs appear instead.

Direct typing always works: `John 3:16`, `John 3:16-17`, `Psalm 23:1-3`,
`Genesis 1:1-2`, `Romans 8:28`. Helpers in `bibleBooks.ts`: `suggestBibleBooks`,
`normalizeBibleBook`, `splitReference`, `parseReference`, `buildReference`.

**Auto-load on verse pick.** Tapping a verse chip (or the *to verse* range select)
**auto-loads** that passage's text from cache/provider, so the preview's reference
tab and verse body never disagree — the genre-standard behavior in Bible
presentation software. It fires **only when the reference actually changes**, so
switching verses replaces the text while a manual edit to the *current* verse is
preserved. Tapping book/chapter only (incomplete passage), a **typed** reference,
and the offline **Start/End** number inputs do **not** auto-load — they use the
explicit **Lookup scripture** button (or Enter). All of this edits the **draft**
only; `/output` changes solely on **Take**, and `/output` never fetches scripture.

## Cache

- **Lookups:** `localStorage` key `livelayer.scriptureCache`, keyed
  `provider:translation:reference`, capped at 50. Cache hits fill immediately, no network.
- **Chapter verse counts** (for verse hints): a separate `localStorage` key
  `livelayer.chapterVerseCache`, keyed `provider:translation:book:chapter`, capped
  at 60. Selecting a previously-seen chapter shows verse chips with no network.

## Failure behavior

If the provider is offline, rate-limited, unavailable, or cannot find the
reference:

- the current fields are left untouched
- a short error is shown
- Take live is not blocked
- the user can paste or type scripture manually

**Verse hints degrade silently:** a failed/slow/offline chapter fetch shows **no**
error and never blocks anything — verse chips simply don't appear and the operator
types the verse (or uses the Start/End inputs). Verse hints also do not fetch for
the prefilled default reference; they load only after an explicit chapter tap.

## Licensing

LiveLayer does not bundle Bible text in the repo and does not ship copyrighted
translations by default. Future providers for licensed translations should be
explicit and should carry required attribution/copyright text.

## Draft vs live (important)

Editing scripture fields — typing a reference, selecting a suggestion, running a
lookup, or editing verse text — only changes the **draft/preview**. It never
changes the currently live `/output`. The live graphic changes **only** on the
next **Take live** (and **Clear** removes it). This holds for every template, not
just Scripture:

- `/output` is a separate page that reacts only to `SHOW_GRAPHIC` / `CLEAR_ALL`
  realtime messages; it never reads the control store.
- **Take** sends a **deep-cloned snapshot** of the draft (`buildGraphicInstance`
  in `ControlPage.tsx`), so the on-air graphic shares no object references with
  editable draft state — later edits cannot mutate what is live.
- The `/control` preview (Edit thumbnail / Live monitor) intentionally mirrors the
  draft, so it *does* update as you type. That is the preview, not the output.

## Current limitations

- No API key providers yet.
- No full Bible browsing or multi-result picker.
- **Chapter** chips are local/instant; **verse** chips need one (cached) network
  fetch per chapter — offline, verse selection falls back to typed numbers.
- Verse hints assume the provider returns a `verses[]` array (bible-api.com does).
- No automatic verse history UI beyond local cache.
- Provider availability is not guaranteed, so manual paste is part of the
  intended workflow.

## Manual test

1. Open `/control`.
2. Select Scripture Card.
3. Enter `John 3:16`.
4. Choose WEB and press Look up.
5. Confirm reference, verse text, and translation fields fill.
6. Edit the verse text manually.
7. Take live and confirm `/output` shows the edited text.
8. Repeat the same lookup and confirm the cache message appears.
9. Try a bad reference and confirm the fields remain editable.
