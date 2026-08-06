# Architecture

LiveLayer uses a two-surface architecture optimized for OBS:

- `Control Dock` (`/control`): a producer-facing interface for choosing templates, editing fields, and triggering graphics.
- `Output Renderer` (`/output`): a transparent browser page that renders the live graphic as an OBS Browser Source.

The control page sends messages to the output page using `BroadcastChannel`. This keeps the workflow local-first and allows the app to work across browser tabs or OBS dock/source instances.

The output surface stays transparent and only renders the active graphic. When the control page sends a `Take`, the output page plays the graphic in with animation. When the control page sends `Clear`, the output removes it. A `localStorage` mirror of the last message lets `/output` restore state on refresh.

Messaging is currently **one-way**: control publishes, output renders. The control client therefore knows what it *commanded*, never what output is actually showing — the Program state models this honestly (`showing` + `unconfirmed`, and `recovering` after a reload). Roadmap: a future production-hardening stage adds an output→control acknowledgement carrying the originating `commandId`, at which point confirmation can flip to `confirmed`. Emission and consumption ship together; no partial protocol surface lands before then.

## Control surface

`/control` is a layout route with four workspaces inside it (`/control/studio`, `/control/scripture`, `/control/rundown`, `/control/library/:section`) and two responsive layouts, switched by a JS breakpoint at 1024px — the layouts are responsive, not separate routes: a guided **dock** below 1024px and a multi-panel **studio** dashboard above it. State lives in a **Zustand** store; presets, brand overrides, and recents persist to `localStorage` and are validated with **Zod** on read. The control preview and `/output` share the same renderer, so the preview is pixel-true to air. See `CONTROL_UI_UX.md`.

## Output rendering

Graphics are authored in absolute **1920×1080** pixels on a `GraphicStage` that scales uniformly to the Browser Source viewport (letterboxed), so composition is identical at any source size. A third route, `/setup`, is an OBS onboarding helper. See `DESIGN_SYSTEM.md` for the `--gfx-*` token contract and `TEMPLATE_SCHEMA.md` for template structure.

A build-time guard (`npm run check:output-isolation`) walks the real import closure from `OutputPage.tsx` and fails if the render path reaches Scripture providers, caches or hooks. The output surface renders what it is given; it never fetches.

## Scripture and the speech boundary

`/control/scripture` resolves a reference to a passage through a public provider, caches it locally, and stages it as an ordinary draft — nothing reaches air without a Take.

A **voice assist preview** sits beside it. It turns a *typed* transcript into candidate references, ranked, for the operator to choose between; there is no microphone and no speech provider. Spoken text is interpreted by `lib/scripture/spokenReference.ts`, which sits **in front of** the strict reference parser and never relaxes it — every candidate is validated through `parseScriptureReference`, and anything it rejects is discarded rather than shown.

Any future recogniser plugs in behind `TranscriptSource`, a discriminated union over which only `TranscriptEvent` (text, finality, segment identity, sequence, language, source id) crosses — no audio, no model, no credentials. See [ASR_EVALUATION.md](ASR_EVALUATION.md) for the evaluation harness, the DONDO audit, and the benchmark that must be run before any live capture ships.
