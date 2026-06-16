# Network Output Architecture

LiveLayer's live path stays local-first. The current app is excellent for a
single production machine: `/control` and `/output` run on the same browser
origin, messages travel through `BroadcastChannel`, and the last live message is
mirrored into `localStorage` for refresh recovery. That model is intentionally
simple, transparent, and OBS-friendly.

The next architecture step is **LAN host mode**: one machine runs LiveLayer as a
graphics host, and other devices on the same network open `/control` or
`/output` from that host. This enables an operator laptop, tablet, or a second
OBS PC to control or receive graphics without requiring cloud sync.

## Current Mode: Single-Machine Browser Loop

Current URLs usually look like:

- `http://127.0.0.1:4173/control`
- `http://127.0.0.1:4173/output`

Both routes must use the exact same origin. `BroadcastChannel`, `localStorage`,
and IndexedDB are scoped by protocol, host, and port, so `localhost` and
`127.0.0.1` are different storage/messaging spaces.

This mode supports:

- OBS Custom Browser Dock for `/control`
- OBS Browser Source for `/output`
- refresh recovery through `localStorage`
- uploaded assets through same-origin IndexedDB
- no internet dependency for live Take/Clear

## Why Browser Storage Is Not Enough Across Devices

`BroadcastChannel`, `localStorage`, and IndexedDB do not cross machines. If a
control laptop opens its own local `http://127.0.0.1:4173/control`, that is a
different origin and a different app instance from the OBS PC's
`http://127.0.0.1:4173/output`.

Across devices, LiveLayer needs one shared local authority:

- a host process serving `/control`, `/output`, and assets
- an event bus that can deliver Take/Clear from any connected control surface to
  every connected output surface
- one storage location for uploaded asset originals and operator data

## Proposed LAN Host Mode

In LAN host mode, the graphics host runs LiveLayer and listens on the local
network. Other devices use the host's LAN IP.

Example:

- Host PC: `192.168.1.50`
- Operator control: `http://192.168.1.50:4173/control`
- OBS Browser Source: `http://192.168.1.50:4173/output`
- Setup diagnostics: `http://192.168.1.50:4173/setup`

The same-origin rule still applies: do not mix IPs, hostnames, or ports. If the
operator uses `http://192.168.1.50:4173/control`, OBS should use
`http://192.168.1.50:4173/output`.

## Event Bus Proposal

Add a local event bus hosted by the LiveLayer server:

- WebSocket endpoint such as `ws://192.168.1.50:4173/live`
- `SHOW_GRAPHIC` and `CLEAR_ALL` remain the stable live message names
- messages stay JSON-safe and continue to reference uploaded images by asset id
- connected `/output` pages receive the latest live event immediately
- late-joining `/output` pages request or receive the current live snapshot
- `/control` can remain optimistic but should show connection/host status

The local browser-only path can stay in place as the default. The WebSocket bus
is an additive transport, not a replacement for the current message contract.

## Storage and Assets

Single-machine mode stores structured data in `localStorage` and asset blobs in
IndexedDB. LAN mode needs a host-owned storage layer because each client browser
has its own IndexedDB.

Migration path:

1. Keep current IndexedDB/localStorage for local-only mode.
2. Introduce a host storage adapter for LAN mode.
3. Serve uploaded asset blobs through local host URLs while live messages still
   carry asset ids.
4. Keep import/export packs as the bridge between local profiles and host mode.

Do not inline image bytes in `SHOW_GRAPHIC` messages. That rule protects OBS
performance, refresh recovery, and import/export compatibility.

## OBS Browser Source

Near-term LAN OBS setup:

1. Start LiveLayer on the graphics host with LAN binding enabled.
2. Open `/setup` from the OBS machine using the host LAN URL.
3. Add Browser Source URL `http://192.168.1.50:4173/output`.
4. Use a `1920x1080` Browser Source.
5. Confirm transparent output and refresh recovery.

The OBS machine does not need cloud access for live operation. It only needs
network access to the LiveLayer host.

## Risks

- Local firewalls may block the host port.
- Wi-Fi latency or packet loss can delay live actions.
- Multiple controllers need clear conflict behavior.
- Asset resolution must move from browser-local IndexedDB to host-served blobs.
- HTTPS may be needed later for stricter browser APIs, but LAN HTTP is simpler
  for the first local host implementation.

## Migration Plan

1. Preserve current local mode and test coverage.
2. Define transport abstraction around `SHOW_GRAPHIC` and `CLEAR_ALL`.
3. Add WebSocket transport behind a feature flag or setup toggle.
4. Add host diagnostics to `/setup`.
5. Add LAN asset serving while preserving asset-id-only live messages.
6. Run production QA with two machines: control device and OBS output device.

