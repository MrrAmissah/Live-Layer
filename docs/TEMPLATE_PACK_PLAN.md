# Template Pack Plan

This sprint expands LiveLayer's built-in templates while preserving the existing
template contract: JSON-safe `GraphicInstance` snapshots, preview/output parity,
dynamic token resolution, layout controls where safe, and asset ids instead of
inline image data.

## Templates Built In This Sprint

### Quote Card

Purpose: sermon quotes, reflections, speaker excerpts, and key teaching moments.

Fields:

- `quoteText`
- `sourceName`
- `sourceRole`
- `themeTitle`
- `translationLabel`

Style: editorial card with strong quotation typography, source attribution, and
subtle category label. It should not look like the Scripture Card.

### Event Banner

Purpose: event/session announcement that can run as a lower/mid-screen banner.

Fields:

- `eventTitle`
- `dateTime`
- `location`
- `callToAction`
- `tag`

Style: bold horizontal information band with clear title, date/location cluster,
and CTA/status treatment.

### Sermon Title

Purpose: premium intro/title card before the preacher starts.

Fields:

- `sermonTitle`
- `speakerName`
- `churchName`
- `seriesTitle`
- `scriptureReference`
- `date`

Style: full-frame title composition with strong typography, optional series
context, speaker/church support, and broadcast-safe spacing.

### Fullscreen Message

Purpose: short service messages such as "Welcome", "Prayer Time", or "We'll Be
Right Back".

Fields:

- `headline`
- `body`
- `footerNote`
- `callToAction`

Style: clear full-screen readable message card, distinct from event and sermon
graphics.

## Future Templates

- alternate lower third styles
- testimony quote with headshot
- worship song lower third
- service schedule stack
- ticker/crawl
- countdown slate
- giving/info card
- baptism/dedication title card

## Template Registry Requirements

Each template needs:

- a stable `templateId`
- field definitions and defaults
- default theme and duration
- renderer support in the shared output renderer
- layout compatibility metadata if a template should opt out of some controls
- dynamic token support through existing field resolution

New templates should automatically work with Saved Graphics, Rundowns, and
selected-rundown import/export because those features store `GraphicInstance`
snapshots. Do not add special-case persistence unless the generic snapshot model
is insufficient.

## Control Library Grouping

The template list should group templates as:

- **Lower Third**: Preacher Lower Third
- **Card**: Scripture Card, Quote Card
- **Banner**: Announcement Banner, Event Banner
- **Fullscreen**: Sermon Title, Fullscreen Message

Dock mode must remain readable and quick to operate.

## QA Checklist

- `npm run verify`
- `npm run build`
- `npm run smoke:routes`
- `git diff --check`
- `/output` remains transparent.
- `SHOW_GRAPHIC` messages contain ids and field values only, no blobs/data URLs.
- Saved Graphics can save/load Quote Card, Event Banner, Sermon Title, and Fullscreen Message.
- Rundowns can include Quote Card, Event Banner, Sermon Title, and Fullscreen Message.
- Selected-rundown export/import preserves each new template snapshot.
- Dynamic fields resolve in text fields.
- Layout controls do not push content outside title-safe areas.
- Seed harness can render the new templates for screenshot and stress testing.

## Implementation Notes

- New templates are text-only in this pass; they do not introduce new asset slots.
- Registry categories are now **Lower Third**, **Card**, **Banner**, and
  **Fullscreen**.
- Rundown item titles derive from the new key fields (`quoteText`, `eventTitle`,
  `sermonTitle`, or `headline`) so queues stay readable.
- The seed harness includes buttons and stress samples for all seven built-in
  templates.
