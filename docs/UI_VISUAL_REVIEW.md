# Control UI — Visual Review

A stronger, deliberately **obvious** pass on `/control`. The earlier redesign
(commits `2fa3c50`→`1350178`) changed tokens, gradients, per-panel tints and
spacing but **never moved `ControlShell` (the grid), `PreviewPanel`, or
`TemplatePreview`** — the silhouette never changed, so it read as the same dark
dashboard. This pass changes **structure, proportion, and zone identity**, which
is what the eye actually registers at a glance.

Visual only. No change to `/output`, Take/Clear behaviour, the realtime message
contract, import/export, rundown, storage, scripture, or People/asset logic.

## What you'll notice immediately

1. **Command bar.** The top bar is now a tall broadcast **faceplate** (~1.8× the
   old height) with a boxed, glowing LiveLayer mark and a row of framed status
   **modules** (SIGNAL · Local / SURFACE · /control / OUTPUT · OBS-ready) — not a
   thin row of small grey chips.
2. **Preview monitor.** The preview sits inside a real **monitor bezel**: a top
   rail with a pulsing green **tally light + "PREVIEW"**, an inset screen frame,
   and a bottom plate reading **`1920 × 1080` · PVW**. It reads as a reference
   monitor, not a card.
3. **Take button.** Take is now a big **"armed" hero** (~1.4× taller, amber→green
   on-air colour, a pulsing tally dot) inside a bordered **ON-AIR** module — the
   single loudest element on the surface.
4. **Right rail.** The right column reads as a stacked instrument deck: one
   **elevated On-Air module** on top, then visibly **recessed** (darker, flatter)
   Look and Saved-work panels below.
5. **Every panel header.** A short coloured **eyebrow bar** sits left of each
   panel's label, so the whole surface reads like a console of labelled
   instruments rather than repeated identical cards.
6. **Library tabs.** Saved / People / Rundowns / Import are now **large,
   even-sized buttons** with a clear active fill — not the cramped small-text row.
7. **Background.** The page has visible **depth** now — a soft console glow up top
   and darkened edges — so panels lift off the backdrop instead of sitting flat.
8. **Dock (narrow).** The dock keeps the same identity: boxed mark + tally pill in
   the status bar, the same big hero Take pinned at the bottom, and larger tabs.

## Desktop review checklist (≥1024px, best at ~1440–1600px)

- [ ] Command bar is clearly taller and reads as a console faceplate; the three
      status modules are framed and legible
- [ ] The preview is the strongest visual anchor — monitor bezel, green tally,
      `1920 × 1080 · PVW` plate
- [ ] Take is unmistakably the loudest control; the On-Air module is visually
      separated from the Look/Layout controls below it
- [ ] Right column reads top-to-bottom as **On-Air → Look → Saved work**, with the
      lower panels visibly recessed
- [ ] Every panel header shows the accent eyebrow bar
- [ ] Library tabs are large and easy to scan; the active tab is obvious
- [ ] Focus rings are still visible on buttons, inputs, tabs, chips, and the
      Take/Clear controls (Tab through them)

## Dock review checklist (~360–420px)

- [ ] Status bar shows the boxed mark + state pill; nothing overflows horizontally
- [ ] Tabs are readable and tappable; the active tab is obvious
- [ ] The preview monitor bezel scales down cleanly and doesn't dominate scroll
- [ ] The sticky **Take/Clear** bar stays pinned at the bottom on every tab and the
      Take hero is large
- [ ] Edit fields, scripture picker, and library rows are not squeezed; scrolling
      feels sane

## Known limitations

- This is a **visual/CSS** pass plus small JSX class/structure tweaks. No new
  features, no state moved, no responsive breakpoints changed.
- The command-bar status modules are **identity readouts**, not live telemetry —
  e.g. "OUTPUT · OBS-ready" is a readiness label, not a live on-air tally (wiring
  live state would touch Take/realtime logic, which is out of scope).
- The preview screen itself is left clean (bezel/tally/inset frame only — no
  scanlines or texture over the graphic) so preview parity with `/output` is
  unaffected.
- Not pixel-verified in this environment (no headless browser); `npm run verify`,
  `npm run build`, and `npm run smoke:routes` are green and the checklists above
  are the manual visual gate.
