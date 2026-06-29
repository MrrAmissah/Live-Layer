# Cloud Architecture

Cloud services should be optional. Live Take/Clear and `/output` rendering should
remain local/LAN-first so a service can continue without internet access.

## Local-first core

The current app stores operational data in browser storage:

- brand settings and Saved Graphics in `localStorage`
- uploaded assets in IndexedDB
- People and rundowns in local browser storage
- live output recovery from the last local realtime message

This keeps the OBS workflow fast and private, but it does not provide accounts,
team sharing, backups, or shared template packs.

## Vercel role

Vercel can host the optional web dashboard, documentation, template pack browser,
and account UI. It should not become a dependency for local OBS rendering.

Good fits:

- hosted marketing/docs
- hosted dashboard shell
- API routes for account actions
- template pack browsing and download metadata
- backups and restore endpoints

Avoid:

- requiring Vercel for Take/Clear
- requiring Vercel for `/output`
- routing live production commands through the public internet by default

## Supabase role

Supabase can provide optional persistent product data:

- accounts and team workspaces
- cloud-synced People/library data
- preset and rundown backups
- template pack ownership and installs
- audit trail for shared workspaces

Asset originals should be stored with explicit quotas and restore rules. The
local graphics host still needs cached assets before going live.

## Staged adoption

1. **Local**: current browser/OBS workflow remains the default.
2. **LAN**: graphics host shares commands, assets, libraries, and output recovery
   across trusted local devices.
3. **Optional cloud backup**: one-click backup and restore for local libraries.
4. **Optional team sync**: authenticated workspaces for shared packs and presets.
5. **Hosted dashboard**: manage packs, backups, and teams outside the OBS dock.

## Design rules

- Internet failure must not blank `/output`.
- Cloud sync should never push blobs into realtime SHOW_GRAPHIC messages.
- Operators must be able to choose local-only mode.
- Cloud restore should write through the same import/validation path as packs.
- Account features should be additive, not a prerequisite for live use.
