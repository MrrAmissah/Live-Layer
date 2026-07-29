import { useState } from 'react';
import Panel from './Panel';
import ContentTab from './ContentTab';
import DesignTab from './DesignTab';
import BrandTab from './BrandTab';
import { useEditTarget } from '../../hooks/useEditTarget';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import type { StudioView } from './StudioNav';
import type { GraphicInstance } from '../../types/graphics';

type EditorTab = 'content' | 'design' | 'brand' | 'motion' | 'advanced';

export interface FieldEditorProps {
  /** Switch the studio destination (Design → Saved graphics / Assets). */
  onNavigate?: (view: StudioView) => void;
  /** Load a stored graphic into this editor (Design presets → Load). */
  onLoadGraphic?: (graphic: GraphicInstance) => void;
}

const TABS: Array<{ id: EditorTab; label: string; enabled: boolean }> = [
  { id: 'content', label: 'Content', enabled: true },
  { id: 'design', label: 'Design', enabled: true },
  { id: 'brand', label: 'Brand', enabled: true },
  // Motion and Advanced are visible but accessibly disabled until their
  // migration stages — they must never open an empty view.
  { id: 'motion', label: 'Motion', enabled: false },
  { id: 'advanced', label: 'Advanced', enabled: false }
];

/**
 * Contextual editor (studio). Tabs scope the controls: Content (schema-backed
 * text fields + character guidance), Design (variant + palette), Brand (save,
 * event pack + brand, overrides). Motion and Advanced are disabled until later stages implement
 * them — never shown as clickable empty tabs. In rundown mode the Content tab
 * also carries the item's layout/duration, preserving today's behaviour.
 */
export default function FieldEditor({ onNavigate, onLoadGraphic }: FieldEditorProps = {}) {
  const { isRundownItem, resetDraft } = useEditTarget();
  const resetTheme = useLiveLayerStore((state) => state.resetTheme);
  const [tab, setTab] = useState<EditorTab>('content');

  // Reset acts on whatever the visible tab edits, and says so. A generic
  // "Reset" on the Brand tab used to wipe the draft instead of the brand.
  const reset =
    tab === 'brand'
      ? {
          label: 'Reset brand',
          run: resetTheme,
          // Scoped wording: this restores the brand that SEEDS new graphics. The
          // colours on the graphic in front of you live in its own values and
          // are reset from the Design tab's "Reset palette".
          title: 'Restore the default brand colours used to seed new graphics'
        }
      : { label: 'Reset graphic', run: resetDraft, title: 'Restore this template’s default content and design' };

  return (
    <Panel className="ll-fill editor-panel">
      <div className="editor-head">
        <span className="ll-kicker">{isRundownItem ? 'Rundown item' : 'Edit graphic'}</span>
        {!isRundownItem || tab === 'brand' ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset.run} title={reset.title}>
            {reset.label}
          </button>
        ) : null}
      </div>

      <div className="editor-tabs" role="tablist" aria-label="Editor sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-disabled={!t.enabled || undefined}
            disabled={!t.enabled}
            title={t.enabled ? undefined : 'Available in a later stage'}
            className={`editor-tab${tab === t.id ? ' editor-tab--active' : ''}${t.enabled ? '' : ' editor-tab--disabled'}`}
            onClick={() => t.enabled && setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ll-panel__body editor-body">
        {tab === 'content' ? <ContentTab onManageLogo={() => setTab('brand')} /> : null}
        {tab === 'design' ? (
          <DesignTab
            onOpenBrand={() => setTab('brand')}
            onLoadPreset={(preset) => onLoadGraphic?.(preset)}
            onBrowseSaved={() => onNavigate?.('saved')}
            onBrowseAssets={() => onNavigate?.('assets')}
          />
        ) : null}
        {tab === 'brand' ? <BrandTab /> : null}
      </div>
    </Panel>
  );
}
