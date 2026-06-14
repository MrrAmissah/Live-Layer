# Architecture

LiveLayer uses a two-surface architecture optimized for OBS:

- `Control Dock` (`/control`): a producer-facing interface for choosing templates, editing fields, and triggering graphics.
- `Output Renderer` (`/output`): a transparent browser page that renders the live graphic as an OBS Browser Source.

The control page sends messages to the output page using `BroadcastChannel`. This keeps the workflow local-first and allows the app to work across browser tabs or OBS dock/source instances.

The output surface stays transparent and only renders the active graphic. When the control page sends a `Take`, the output page plays the graphic in with animation. When the control page sends `Clear`, the output removes it. A `localStorage` mirror of the last message lets `/output` restore state on refresh.

## Control surface

`/control` is one route with two responsive layouts, switched by a JS breakpoint at 1024px (no separate routes): a guided **dock** below 1024px and a multi-panel **studio** dashboard above it. State lives in a **Zustand** store; presets, brand overrides, and recents persist to `localStorage` and are validated with **Zod** on read. The control preview and `/output` share the same renderer, so the preview is pixel-true to air. See `CONTROL_UI_UX.md`.

## Output rendering

Graphics are authored in absolute **1920×1080** pixels on a `GraphicStage` that scales uniformly to the Browser Source viewport (letterboxed), so composition is identical at any source size. A third route, `/setup`, is an OBS onboarding helper. See `DESIGN_SYSTEM.md` for the `--gfx-*` token contract and `TEMPLATE_SCHEMA.md` for template structure.
