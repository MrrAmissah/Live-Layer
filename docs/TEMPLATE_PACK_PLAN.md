# Template Pack Plan

LiveLayer's expanded built-in template pack should cover common church and event
production moments while preserving the current `GraphicInstance` contract.

## Built now

| Template | Category | Purpose | Fields |
| --- | --- | --- | --- |
| Preacher Lower Third | Lower Third | speaker ID and role | `name`, `title`, `subtitle`, `logoUrl` |
| Scripture Card | Card | scripture reference and verse | `reference`, `verseText`, `translationLabel`, `themeTitle` |
| Announcement Banner | Banner | general announcements | `headline`, `body`, `dateTime`, `callToAction` |
| Quote Card | Card | sermon quotes and reflections | `quoteText`, `sourceName`, `sourceRole`, `themeTitle`, `translationLabel` |
| Event Banner | Banner | event/session promotion | `eventTitle`, `dateTime`, `location`, `callToAction`, `tag` |
| Sermon Title | Fullscreen | sermon intro/title moment | `sermonTitle`, `speakerName`, `churchName`, `seriesTitle`, `scriptureReference`, `date` |
| Fullscreen Message | Fullscreen | welcome, pause, prayer, and next-step messages | `headline`, `body`, `footerNote`, `callToAction` |

## Visual direction

- Templates should feel related, not cloned.
- Cards need strong editorial hierarchy and readable line lengths.
- Banners should be bold and fast to scan.
- Fullscreen templates should be calm, premium, and camera-safe.
- All templates should respect safe areas and the existing 1920 x 1080 stage.

## Registry requirements

Every template needs:

- a renderer in `src/components/templates/`
- a `TemplateDefinition` entry in `registry.ts`
- a renderer map entry in `templateRendererMap`
- scoped CSS in `src/styles.css`
- safe default values
- string-only fields unless the asset system is explicitly extended

## Compatibility

New templates should work automatically with:

- preview parity through `TemplatePreview`
- Take/Clear and `/output`
- dynamic field resolution in text fields
- Saved Graphics
- rundown snapshots
- selected-rundown import/export packs

Realtime messages and packs should keep storing ids and field values, not image
blobs or large data URLs.

## Future templates

- alternate lower thirds with headshot-forward layouts
- section opener
- worship lyric/title-safe card
- countdown card
- ticker or crawl
- scoreboard or simple game/event score
- split-screen speaker plus quote

## QA checklist

- Each template renders in `/control` preview and `/output`.
- Long text clamps or scales without overlapping.
- Layout size/position/density controls remain usable.
- Dynamic `{{date}}` and `{{time}}` tokens resolve on Take.
- Saved Graphics reload each template correctly.
- Rundowns can include each template.
- Export/import preserves snapshots without blobs in realtime messages.
- `npm run verify`, `npm run build`, `npm run smoke:routes`, and
  `git diff --check` pass before release.
