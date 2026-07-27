import { useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useEditTarget } from '../../hooks/useEditTarget';
import { templateRegistry } from '../templates/registry';
import { describeTemplate } from '../../lib/templateMeta';
import { Icon } from '../../lib/icons';
import type { GraphicInstance } from '../../types/graphics';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));
const COMPACT_COUNT = 4;

function presetLabel(preset: GraphicInstance): string {
  return preset.presetName?.trim() || describeTemplate(templateById.get(preset.templateId), preset.templateId).label;
}

/**
 * Compact presets companion for the Design tab. Uses the real preset slice and
 * edit-target-aware save/apply — it is NOT the full PresetControls surface (no
 * rename, remove, add-to-rundown, or destructive reset).
 *
 * The actions follow the visible edit target. In draft mode they save/load the
 * ad-hoc draft (Load via the owner's openGraphicInEditor). When a rundown item
 * is selected — the item the editor and preview are showing — Save serializes
 * that item and "Apply to item" copies a preset's payload onto it, never the
 * hidden draft, and never publishes.
 */
export default function DesignPresets({
  onLoad,
  onSaved,
  onSaveMessage,
  onBrowseSaved,
  onBrowseAssets
}: {
  /** Draft-mode load: routes through the owner (loads draft + reveals editor). */
  onLoad: (preset: GraphicInstance) => void;
  onSaved?: () => void;
  onSaveMessage?: (text: string) => void;
  onBrowseSaved: () => void;
  onBrowseAssets: () => void;
}) {
  const presets = useLiveLayerStore((state) => state.presets);
  const { isRundownItem, sourceLabel, templateId, saveAsPreset, applyPreset } = useEditTarget();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const shown = presets.slice(0, COMPACT_COUNT);
  const saveLabel = isRundownItem ? 'Save item as preset' : 'Save current as preset';
  const loadLabel = isRundownItem ? 'Apply to item' : 'Load';
  const defaultName = isRundownItem
    ? sourceLabel || describeTemplate(templateById.get(templateId), templateId).label
    : describeTemplate(templateById.get(templateId), templateId).label;

  const commitSave = () => {
    const label = name.trim() || defaultName;
    saveAsPreset(label); // draft → ad-hoc draft; rundown → the selected item
    setName('');
    setSaving(false);
    onSaveMessage?.(`Saved “${label}”`);
    onSaved?.();
  };

  // Draft keeps the existing owner-routed load; a rundown item receives the
  // payload in place (no view change, no publish).
  const loadPreset = (preset: GraphicInstance) => (isRundownItem ? applyPreset(preset) : onLoad(preset));

  return (
    <section className="design-presets" aria-label="Presets">
      <div className="design-presets__head">
        <span className="ll-kicker">Presets</span>
        {presets.length > 0 ? <span className="design-presets__count">{presets.length}</span> : null}
      </div>

      {isRundownItem ? (
        <p className="design-presets__note">
          Preset actions apply to the selected rundown item. Live output doesn’t change until you Take.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="design-presets__empty">Save a look here to recall it in one click.</p>
      ) : (
        <ul className="design-presets__list">
          {shown.map((preset) => (
            <li key={preset.id} className="design-presets__row">
              <span className="design-presets__body">
                <span className="design-presets__name">{presetLabel(preset)}</span>
                <span className="design-presets__type">
                  <Icon name={describeTemplate(templateById.get(preset.templateId), preset.templateId).icon} size={11} />
                  {describeTemplate(templateById.get(preset.templateId), preset.templateId).label}
                </span>
              </span>
              <button
                type="button"
                className="design-presets__load"
                aria-label={`${loadLabel}: ${presetLabel(preset)}`}
                onClick={() => loadPreset(preset)}
              >
                {loadLabel}
              </button>
            </li>
          ))}
        </ul>
      )}

      {saving ? (
        <div className="design-presets__save">
          <input
            className="field__input"
            autoFocus
            value={name}
            placeholder="Preset name…"
            aria-label="Preset name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSave();
              if (event.key === 'Escape') setSaving(false);
            }}
          />
          <button type="button" className="btn btn--secondary btn--sm" onClick={commitSave}>
            Save
          </button>
        </div>
      ) : (
        <button type="button" className="design-presets__action" onClick={() => setSaving(true)}>
          <Icon name="plus" size={14} />
          {saveLabel}
        </button>
      )}

      <div className="design-presets__links">
        <button type="button" className="design-presets__link" onClick={onBrowseSaved}>
          Browse all
        </button>
        <button type="button" className="design-presets__link" onClick={onBrowseAssets}>
          Browse assets
        </button>
      </div>
    </section>
  );
}
