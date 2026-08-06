# Architecture

LiveLayer uses a two-surface architecture optimized for OBS:

- `Control Dock` (`/control`): a producer-facing interface for choosing templates, editing fields, and triggering graphics.
- `Output Renderer` (`/output`): a transparent browser page that renders the live graphic as an OBS Browser Source.

The control page sends messages to the output page using `BroadcastChannel`, mirrored to `localStorage` so `/output` can restore the last graphic after a refresh. This keeps the workflow local-first and allows the app to work across browser tabs or OBS dock/source instances.

### Transports

There are two, and the second is optional.

- **Local (default).** `BroadcastChannel` plus the `localStorage` mirror. Both surfaces must share an origin and a browser profile.
- **LAN relay (optional, beta).** A small local relay process (`npm run lan:relay`) forwards the same messages to another machine or a tablet. It is selected with `?relay=<url>`, which is **persisted**, so clearing it requires an explicit `?relay=off` — a relay configured once and later switched off at the source otherwise keeps absorbing every Take. Canonical redirects preserve `search` and `hash` so the relay parameter survives a route normalisation.

The relay is **transport only.** Uploaded assets, People, Saved Graphics, rundowns and presets live in the browser that created them and never travel through it; a remote operator sees commands, not libraries.

**Relay readiness is not an output acknowledgement.** A reachable socket is not readiness — an unrelated server, or a stray HTML page, will accept a connection. The relay identifies itself, and `lib/relayReadiness.ts` classifies the probe into explicit states (`ready`, `unreachable`, `not-relay`, `checking`, `local`) rather than reporting "connected" for anything that answers. Even `ready` means only that the relay is there: whether `/output` rendered a graphic is a separate fact, established per command by the acknowledgement protocol below and reflected in Program as `OUTPUT READY` / `OUTPUT ACTIVE` — never inferred from relay reachability.

The output surface stays transparent and only renders the active graphic. When the control page sends a `Take`, the output page plays the graphic in with animation. When the control page sends `Clear`, the output removes it. A `localStorage` mirror of the last message lets `/output` restore state on refresh.

Messaging is **two-way but strictly directional**: control commands, output reports. Output emits four event types through `lib/outputAck.ts` — `OUTPUT_APPLIED` / `OUTPUT_CLEARED` / `OUTPUT_FAILED`, each carrying the originating `commandId` and the output page's per-load session id, and a low-frequency `OUTPUT_STATUS` heartbeat with the OBS Browser binding's source state (`null` without the binding — a plain tab claims nothing either way). What an inbound message means for Program is one tested pure rule, `lib/programSync.ts`: **an acknowledgement confirms only the command whose id it carries** (a stale ack cannot confirm a newer Take), a published Clear stays `clearing` until the matching `OUTPUT_CLEARED`, remote commands are applied last-writer-wins by their own timestamp so every open control tells the same story, and confirmed claims decay to `UNVERIFIED` when the heartbeat goes stale (`lib/outputPresence.ts`). Even a confirmed, source-active reading is evidence about a page and a source — never "LIVE": nothing in the system observes an encoder or a stream.

The relay keeps a **snapshot with one validated slot per concern** (`scripts/relay-snapshot.mjs`): latest air-defining command, latest command-id-matched acknowledgement (reset when a new command lands), latest output status, and output last-seen. New SSE clients replay command → ack → status, so `/output` restores its graphic after a reconnect and a fresh control hydrates coherently — a heartbeat can never displace the command a reconnect needs, which is exactly the bug a single last-message slot would have had. This snapshot is also the only common ground between a dock in OBS CEF and a studio in the system browser: those are different browser processes and share no localStorage.

The output isolation guard was re-expressed for this: the invariant was never "output does not talk" but "output cannot COMMAND and cannot mutate control state, and reporting can never delay a graphic". `lib/outputChannel.ts` is receive-only by construction, `lib/outputAck.ts` is the closure's one transmitter (fire-and-forget, failure-swallowed, unable to name a command type), and `check-output-isolation.mjs` enforces the whole of it transitively — including the inverse: no control surface may mint an output event.

## Control surface

`/control` is a layout route with four workspaces inside it (`/control/studio`, `/control/scripture`, `/control/rundown`, `/control/library/:section`) and two responsive layouts, switched by a JS breakpoint at 1024px — the layouts are responsive, not separate routes: a guided **dock** below 1024px and a multi-panel **studio** dashboard above it. **One command owner:** the layout route itself owns the realtime channel, the publish path, the in-flight guard and both Take handlers, so a workspace can request a graphic but no workspace can air one. Workspaces receive only what they need through the outlet context. State lives in a **Zustand** store; presets, brand overrides, and recents persist to `localStorage` and are validated with **Zod** on read. The control preview and `/output` share the same renderer, so the preview is pixel-true to air. See `CONTROL_UI_UX.md`.

## Output rendering

Graphics are authored in absolute **1920×1080** pixels on a `GraphicStage` that scales uniformly to the Browser Source viewport (letterboxed), so composition is identical at any source size. A third route, `/setup`, is an OBS onboarding helper. See `DESIGN_SYSTEM.md` for the `--gfx-*` token contract and `TEMPLATE_SCHEMA.md` for template structure.

A build-time guard (`npm run check:output-isolation`) walks the real import closure from `OutputPage.tsx` and fails if the render path reaches Scripture providers, caches or hooks. The output surface renders what it is given; it never fetches.

## Scripture and the speech boundary

`/control/scripture` resolves a reference to a passage through a public provider, caches it locally, and stages it as an ordinary draft — nothing reaches air without a Take.

A **voice assist preview** sits beside it. It turns a *typed* transcript into candidate references, ranked, for the operator to choose between; there is no microphone and no speech provider. Spoken text is interpreted by `lib/scripture/spokenReference.ts`, which sits **in front of** the strict reference parser and never relaxes it — every candidate is validated through `parseScriptureReference`, and anything it rejects is discarded rather than shown.

Any future recogniser plugs in behind `TranscriptSource`, a discriminated union over which only `TranscriptEvent` (text, finality, segment identity, sequence, language, source id) crosses — no audio, no model, no credentials. See [ASR_EVALUATION.md](ASR_EVALUATION.md) for the evaluation harness, the DONDO audit, and the benchmark that must be run before any live capture ships.
