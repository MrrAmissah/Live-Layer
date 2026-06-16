# Cloud Architecture

Cloud services should expand LiveLayer's library and team workflows, not sit in
the critical live Take/Clear path. The production output must continue working
locally if the internet drops.

## Vercel Role

Vercel is a good future fit for:

- hosted marketing/docs
- optional hosted dashboard
- account entry point
- template pack browsing
- team workspace UI
- lightweight API routes for sync orchestration

Vercel should not be required for:

- OBS Browser Source rendering
- live `SHOW_GRAPHIC` / `CLEAR_ALL`
- local asset playback
- local rundown operation

## Supabase Role

Supabase is a good future fit for:

- accounts and team membership
- cloud backups of presets, rundowns, people, and brand kits
- shared template pack metadata
- optional asset backup storage
- audit history for workspace changes

Supabase should not become the source of truth for an active live output during
a service. The local machine or LAN host should own the live state.

## Data Boundaries

Live-critical local state:

- current draft/live graphic
- Take/Clear event stream
- uploaded asset originals needed for the active show
- active rundown queue

Cloud-friendly state:

- backups
- team libraries
- template pack catalogs
- brand kits
- people libraries
- non-live rundown preparation

## Staged Adoption

1. **Local**: current browser/OBS workflow, no account.
2. **LAN**: graphics host with WebSocket event bus and host-owned assets.
3. **Optional cloud backup**: signed-in users can back up and restore libraries.
4. **Optional team sync**: shared libraries and rundowns sync before production.
5. **Hosted dashboard**: browser dashboard for prep, pack browsing, and workspace
   management.

Each stage should be usable without forcing the next stage.

## Template Marketplace and Packs

Template packs can start as local `.livelayerpack` imports. Cloud can later add:

- searchable catalog
- version metadata
- previews and sample data
- publisher attribution
- team-approved packs
- update notifications

Downloaded packs should become local assets before showtime so `/output` does
not depend on the marketplace during live production.

## Reliability Rules

- Live output does not wait on cloud reads.
- Cloud sync is explicit and recoverable.
- If cloud sync fails, local production continues.
- Realtime live transport is LAN/local, not cloud-first.
- Import/export remains available as the offline escape hatch.

