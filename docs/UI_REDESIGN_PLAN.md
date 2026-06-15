# LiveLayer Control UI Redesign Plan

Focused redesign sprint for `/control`. This plan keeps the existing product
logic intact: no `/output` changes, no Take/Clear contract changes, no storage or
import/export behavior changes. The work is visual hierarchy, layout rhythm, and
operator confidence.

## Current Problems

- **Everything has similar weight.** Panels, cards, tabs, fields, and empty
  states all use comparable borders, backgrounds, and label styles, so the eye
  has to work too hard to find what matters.
- **The right column is crowded.** On-air actions, rundown controls, Brand, and
  Library all sit in one narrow stack. Take is dominant, but the panels below it
  compete instead of stepping down visually.
- **Library tabs are cramped.** Four equal tabs fit, but the typography and
  tight spacing make Library feel like a utility drawer rather than a polished
  production workspace.
- **The editor reads form-heavy.** Required fields, optional fields, dynamic
  inserts, and scripture controls use the same field cadence. Powerful, but a
  little dense for a live operator.
- **Scripture picker is control-dense.** Book suggestions, chapter chips, verse
  chips, range controls, translation, lookup, and feedback are correct but need
  clearer grouping and calmer active states.
- **Preview can feel like one more panel.** It should read as the main monitor:
  a deliberate 16:9 broadcast preview with stronger framing and clearer draft vs
  live meaning.
- **Repeated list patterns feel generic.** Template cards, presets, people,
  rundowns, queue items, and import summaries are individually useful, but they
  need a shared production-console language for selected/live/done/warning states.
- **Dock mode is usable but visually busy.** The fixed status/tabs/livebar model
  is right; the next pass should reduce chrome and keep the main path
  Graphic -> Edit -> Live unmistakable.

## Target Experience

The operator should immediately know:

1. What graphic or rundown item is selected.
2. What they are editing.
3. What will happen when Take is pressed.
4. What is currently live or cleared.
5. Where saved graphics, people, rundowns, and imports live.

The visual language should feel like broadcast-control software: graphite base,
low-noise panels, deliberate status lighting, a strong preview monitor, and one
dominant Take action.

## Layout Strategy

### Studio

Keep the existing three-zone model because it matches the product:

- Left: template/mode selection.
- Center: preview monitor, then edit controls.
- Right: live operation first, supporting configuration below.

Refine it by:

- giving the command bar stronger identity and lower clutter;
- making the preview panel visually read as the central monitor;
- making the right column a hierarchy: Live deck first, then compact Brand and
  Library surfaces;
- reducing same-weight card borders in secondary areas;
- making active/selected/live states more differentiated than plain cyan fills.

### Dock

Keep the step controller:

```text
Graphic -> Edit -> Live | Brand Library
```

Refine it by:

- reducing tab chrome and keeping step labels legible at 340-420px;
- keeping sticky Take/Clear visually stable;
- giving the active step more breathing room;
- keeping Brand and Library secondary without hiding them.

## Component Strategy

- **Panel primitive:** keep one `Panel` primitive, but tune its border, radius,
  head/body rhythm, and secondary-panel variants instead of introducing nested
  card stacks.
- **Command/status bars:** improve logo spacing, route/status badges, and live
  signal treatment. Do not replace the restored logo.
- **Buttons:** keep Take as the only loud control. Make secondary/ghost buttons
  quieter and more consistent. Use stronger disabled/focus states.
- **Tabs:** redesign Library and dock tabs with clearer active state, better
  spacing, and less equal-weight cyan.
- **Lists:** unify template, preset, people, rundown, queue, and import rows
  around compact scan patterns: title, metadata, state/action cluster.
- **Forms:** increase label/hint clarity, group optional fields, and give
  dynamic helpers/scripture lookup their own control bands.
- **States:** make selected, live, done, warning, and disabled visually distinct
  without adding new behavior.

## Implementation Slices

### UI-1: Control Shell And Tokens

Files likely touched:

- `src/styles.css`
- `src/components/control/CommandBar.tsx`
- `src/components/control/DockStatusBar.tsx`
- `docs/DESIGN_SYSTEM.md`

Changes:

- introduce clearer control-surface CSS variables inside `.control-root`;
- refine base spacing, panel radius, border intensity, typography scale;
- improve command bar and identity spacing;
- refine status badges and focus states.

Validation: `npm run verify`, `npm run build`, `npm run smoke:routes`.

### UI-2: Right Column

Files likely touched:

- `src/styles.css`
- `src/components/control/LiveActionsPanel.tsx`
- `src/components/control/BrandControls.tsx`
- `src/components/control/LibraryControls.tsx`

Changes:

- make Take/live status the unmistakable primary area;
- quiet Brand and Library panels;
- improve Library tabs and secondary actions;
- tighten layout/duration controls without making them cramped.

### UI-3: Edit Forms

Files likely touched:

- `src/styles.css`
- `src/components/control/TemplateFields.tsx`
- `src/components/control/ScriptureReferencePicker.tsx`
- `src/components/control/FieldEditor.tsx`

Changes:

- clearer required vs optional rhythm;
- better long-text spacing;
- calmer dynamic date/time helper chips;
- scripture picker sectioning and active states.

### UI-4: Library And Rundown Polish

Files likely touched:

- `src/styles.css`
- `src/components/control/PresetControls.tsx`
- `src/components/control/PeopleLibrary.tsx`
- `src/components/control/RundownLibrary.tsx`
- `src/components/control/StudioRundownPanel.tsx`
- `src/components/control/ImportPackPreview.tsx`

Changes:

- unify list row hierarchy;
- improve selected/live/done badges;
- improve empty states and import warnings;
- keep all existing actions and data flows.

### UI-5: Responsive And Accessibility QA

Files likely touched:

- `src/styles.css`
- `docs/SCREENSHOT_GUIDE.md`
- targeted component accessibility tweaks if discovered.

Checks:

- desktop `/control`;
- dock width around 340-420px;
- `/setup`;
- focus, disabled, overflow, contrast;
- route smoke.

## Risks And Guardrails

- **Do not touch `/output`.** Preview styling can change only inside the control
  shell; output renderer behavior stays fixed.
- **Do not alter Take/Clear logic.** Visual hierarchy may change, but handlers and
  realtime messages remain unchanged.
- **Do not break dock mode.** Any desktop polish must be checked at narrow OBS
  widths.
- **Avoid card-in-card buildup.** Use bands, rows, and subtle dividers rather than
  adding more bordered boxes.
- **Avoid a new logo.** The previous logo was restored by preference; this sprint
  improves usage and spacing only.
- **Keep commits atomic.** Each slice validates and pushes independently.

## Manual Visual Review

After each visual slice, inspect:

- `http://127.0.0.1:4173/control` at desktop width;
- `http://127.0.0.1:4173/control` at 360-420px dock width;
- `http://127.0.0.1:4173/setup`;
- Library tabs, Brand controls, Take/Clear, rundown queue, scripture picker, and
  saved graphics after a reload.

