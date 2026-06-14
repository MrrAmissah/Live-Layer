# Dynamic Date/Time Fields

Phase 2C adds optional dynamic date/time tokens for text fields. Operators can
type normal text as before, or insert tokens that resolve at render time in both
preview and `/output`.

## Supported tokens

- `{{date}}` → `14 June 2026`
- `{{time}}` → `10:30 AM`
- `{{weekday}}` → `Sunday`
- `{{month}}` → `June`
- `{{year}}` → `2026`
- `{{datetime}}` → `Sunday · 10:30 AM`
- `{{eventTime}}` → event time when a future event context exists; currently
  falls back to `10:30 AM`
- `{{countdown}}` → countdown when a future event context exists; currently
  falls back to `Starts soon`

Unknown tokens are left unchanged. For example, `{{unknown}}` renders as
`{{unknown}}`.

## Formatting defaults

- Device/browser time is used.
- Locale defaults to `en-GH`.
- Dates render as day month year, for example `14 June 2026`.
- Times render in 12-hour format by default, for example `10:30 AM`.
- 24-hour support is prepared in the resolver but no settings UI ships in 2C.

## Where tokens work

Tokens are resolved in the shared rendering path, so they work in preview and in
`/output`. Announcement Banner has a small Insert date/time helper for the
Date / Time field, and tokens typed manually in other text fields also resolve.

The raw field value remains unchanged in the editor and in saved presets. If a
user saves `{{date}} · {{time}}`, the preset stores exactly that string and
resolves again whenever it is loaded or taken live.

## Update intervals

LiveLayer avoids timers unless a graphic actually needs one:

- no dynamic tokens: no timer
- static tokens such as `{{date}}`, `{{weekday}}`, `{{month}}`, `{{year}}`: no
  repeating timer
- `{{time}}` and `{{datetime}}`: update once per minute
- `{{countdown}}`: update once per second

Timers clean up when the component unmounts or when the live graphic changes.

## Current limitations

- There is no event schedule UI yet, so `{{eventTime}}` and `{{countdown}}` use
  safe placeholders unless an event context is supplied by future work.
- There is no settings UI for locale, time zone, or 24-hour mode yet.
- Tokens are plain text. There is no visual token editor beyond the Announcement
  quick insert buttons.

## Manual test

1. Open `http://127.0.0.1:4173/control`.
2. Select Announcement Banner.
3. In Date / Time, choose **Use today's date**.
4. Confirm preview resolves to today's date.
5. Choose **Use current time**.
6. Confirm preview resolves to the current time.
7. Press Take.
8. Open `http://127.0.0.1:4173/output` and confirm the same value renders.
9. Save a preset while tokens are present.
10. Reload `/control`, load the preset, and confirm the token still resolves.
11. Type `{{unknown}}` and confirm it does not crash or disappear.
12. Type normal manual text such as `Saturday • 6:30 PM` and confirm it renders
    unchanged.
