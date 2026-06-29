# Network Output Architecture

LiveLayer is local-first. The live production path should keep working when the
internet is down, with `/control` producing commands and `/output` rendering the
transparent OBS Browser Source.

## Current local browser mode

Today the standard workflow is one graphics machine:

- `http://127.0.0.1:4173/control` runs in an OBS Custom Browser Dock or browser.
- `http://127.0.0.1:4173/output` runs as an OBS Browser Source.
- Take/Clear messages move through `BroadcastChannel`, with a `localStorage`
  mirror for refresh recovery.
- Uploaded assets, People, Saved Graphics, and rundowns live in same-origin
  browser storage (`localStorage` and IndexedDB).

This is stable for one machine, but browser storage and BroadcastChannel do not
cross devices. Opening `/control` on a tablet does not automatically reach
`/output` on the OBS machine unless a network event bus is configured.

## Same-origin rule

For local storage to resolve uploaded assets, the control dock and output source
must use the exact same origin: scheme, host, and port.

Recommended same-machine pair:

- `http://127.0.0.1:4173/control`
- `http://127.0.0.1:4173/output`

Do not mix `localhost` and `127.0.0.1`. Do not mix ports.

## Beta LAN relay mode

The current beta LAN mode adds a dependency-free relay for live commands only.
Run both processes on the graphics machine:

```bash
npm run dev:lan
npm run lan:relay
```

Then use the graphics machine LAN IP:

- `http://192.168.x.x:4173/control?relay=http%3A%2F%2F192.168.x.x%3A4174`
- `http://192.168.x.x:4173/output?relay=http%3A%2F%2F192.168.x.x%3A4174`

`/setup` generates these URLs and includes a **Check LAN relay** diagnostic. Both
pages must point at the same relay URL.

## Proposed host mode

The next architecture step is a graphics-host process that owns shared state:

- event bus: WebSocket or Server-Sent Events for Take/Clear/live updates
- asset store: host-owned originals and thumbnails
- library store: People, presets, rundowns, and template packs
- output recovery: server-side last-live snapshot
- health: connected clients, output status, and relay errors

In that model, devices can use the same LAN host:

- operator laptop/tablet: `http://192.168.x.x:4173/control`
- OBS graphics host or second OBS PC: `http://192.168.x.x:4173/output`

The live path remains LAN-first and should not require cloud services.

## OBS connection

OBS should load `/output` as a transparent Browser Source at 1920 x 1080. In
same-machine mode, `127.0.0.1` is preferred. In LAN mode, the Browser Source uses
the graphics host LAN address and, during beta relay mode, the same `?relay=...`
parameter as `/control`.

## Risks

- Firewalls can block LAN ports.
- Mixed origins silently split asset storage.
- Browser refresh recovery is local until host-owned storage exists.
- A relay can carry commands without carrying image blobs or local libraries.
- Wi-Fi latency and dropouts can affect remote operation.

## Migration plan

1. Keep same-machine local mode as the default.
2. Harden beta LAN relay diagnostics and manual QA.
3. Add host-owned asset/library storage behind the LAN server.
4. Move Take/Clear/live recovery to a first-class event bus.
5. Add optional cloud backup and sync after LAN mode is reliable.
