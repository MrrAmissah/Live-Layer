import { templateRegistry, templateRendererMap } from '../templates/registry';
import GraphicStage from '../graphics/GraphicStage';
import { useEditTarget } from '../../hooks/useEditTarget';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import type { TemplateDefinition, TemplateField } from '../../types/graphics';
import { resolveDynamicFields } from '../../lib/dynamicFields';
import { packVariantIdsFor } from '../../lib/packs';
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ScriptureReferencePicker from './ScriptureReferencePicker';
import { Icon } from '../../lib/icons';
import { resolveResetPalette } from '../../lib/variantPalette';
import { composeThumbTheme } from './TemplateThumb';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const COLOR_FIELDS = [
  { id: 'colorBrand', label: 'Main' },
  { id: 'colorAccent', label: 'Accent' },
  { id: 'colorSurface', label: 'Surface' },
  { id: 'colorText', label: 'Text' },
  { id: 'colorSecondary', label: 'Second' }
] as const;

type TemplateVariant = NonNullable<(typeof templateRegistry)[number]['variants']>[number];
type VariantGroupId = 'all' | 'classic' | 'broadcast' | 'event' | 'compact';

/**
 * The variant id the carousel should actually treat as selected: the requested
 * one when it exists, else the first available variant, else '' when there are
 * none. A persisted graphic can carry a `variantId` that no longer exists in the
 * registry (legacy/imported presets), and graphic validation accepts arbitrary
 * strings — so every selection concern (index, active card, aria-checked,
 * tabindex, paging, browser) must key off this normalized value, not the raw
 * request, or no card ends up selected or tabbable.
 */
export function resolveEffectiveVariantId(variants: Pick<TemplateVariant, 'id'>[], requestedId: string): string {
  if (variants.some((variant) => variant.id === requestedId)) return requestedId;
  return variants[0]?.id ?? '';
}

const VARIANT_GROUPS: Array<{ id: VariantGroupId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'classic', label: 'Classic' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'event', label: 'Event' },
  { id: 'compact', label: 'Compact' }
];

function colorValue(value: string | undefined, fallback: string): string {
  const next = value?.trim();
  return next && HEX_COLOR.test(next) ? next : fallback;
}

function variantGroupFor(variant: TemplateVariant): Exclude<VariantGroupId, 'all'> {
  const text = `${variant.name} ${variant.description}`.toLowerCase();

  if (/\b(strip|runner|alert|tab|ribbon|communion|offering|tag)\b/.test(text)) {
    return 'compact';
  }

  if (/\b(event|festival|celebration|conference|hosted)\b/.test(text)) {
    return 'event';
  }

  if (/\b(broadcast|blue|gradient|venue|ministry|soft|slate|angled|bold)\b/.test(text)) {
    return 'broadcast';
  }

  return 'classic';
}

function FieldRow({
  field,
  value,
  onChange,
  children
}: {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  const resolvedPreview = resolveDynamicFields(value, {
    now: new Date(),
    locale: 'en-GH',
    use24Hour: false
  });

  const cap = field.maxLength;
  const overRecommended = field.recommendedLength !== undefined && value.length > field.recommendedLength;
  const overMax = cap !== undefined && value.length > cap;

  return (
    <label className="field">
      <span className="field__label">
        <span>
          {field.label}
          {field.optional ? <span className="field__opt">Optional</span> : null}
        </span>
        {cap !== undefined ? (
          <span className={`field__count${overMax ? ' field__count--over' : overRecommended ? ' field__count--warn' : ''}`}>
            {value.length} / {cap}
          </span>
        ) : null}
      </span>
      {field.type === 'textarea' ? (
        <textarea
          className="field__textarea"
          value={value}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          maxLength={cap}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="field__input"
          type={field.type === 'url' ? 'url' : 'text'}
          value={value}
          placeholder={field.placeholder}
          maxLength={cap}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {children}
      {resolvedPreview !== value ? (
        <span className="field__hint">Preview: {resolvedPreview}</span>
      ) : null}
    </label>
  );
}

function DateTimeInsertHelper({ onInsert }: { onInsert: (value: string) => void }) {
  const options = [
    { label: "Use today's date", value: '{{date}}' },
    { label: 'Use current time', value: '{{time}}' },
    { label: 'Use weekday', value: '{{weekday}}' },
    { label: 'Use date + time', value: '{{date}} · {{time}}' },
    { label: 'Countdown', value: '{{countdown}}' }
  ];

  return (
    <div className="dynamic-insert" aria-label="Insert date/time">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="dynamic-insert__btn"
          onClick={(event) => {
            event.preventDefault();
            onInsert(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Real miniature render of a variant: the actual template renderer inside a
 * scaled GraphicStage, using the visible target's values and palette,
 * so the picker shows exactly what each design produces. Entrance animations
 * are killed via CSS so thumbs rest at their final frame. Memoized — with the
 * picker feeding it deferred values, the ~13 mini-stages reconcile off the
 * keystroke-critical path.
 */
const VariantThumb = memo(function VariantThumb({
  templateId,
  variantId,
  values,
  theme
}: {
  templateId: string;
  variantId: string;
  values: Record<string, string>;
  /** The VISIBLE target's theme, routed from the owner. Reading the store theme
   *  here showed the hidden draft's colours whenever a rundown item was
   *  selected, so the picker disagreed with the preview and with Take. */
  theme: Partial<TemplateDefinition['theme']>;
}) {
  const template = templateRegistry.find((item) => item.id === templateId);
  const Renderer = templateRendererMap[templateId];
  const mergedTheme = useMemo(() => composeThumbTheme(template?.theme, theme), [template, theme]);
  const thumbValues = useMemo(() => ({ ...values, variantId }), [values, variantId]);
  if (!template || !Renderer) return null;
  const focus = template.category === 'Lower Third' ? 'lower-third' : 'full';
  return (
    <span className="variant-thumb" aria-hidden>
      <GraphicStage theme={mergedTheme} backdrop="neutral" focus={focus}>
        <div className="gfx-layer" data-anim="fade" data-state="in">
          <Renderer values={thumbValues} theme={mergedTheme} />
        </div>
      </GraphicStage>
    </span>
  );
});

/**
 * Design-variant carousel: a horizontal, scrollable strip of real
 * TemplateThumb renders with prev/next paging and roving-tabindex keyboard
 * navigation. `variants` is already pack-curated by the caller, which also
 * appends the current selection if it is off-list — so an off-list variant
 * always has a card and a valid position. The full search + group-filter grid
 * is preserved behind the "Browse all variants" disclosure.
 */
function TemplateVariantPicker({
  templateId,
  draftValues,
  targetTheme,
  variants,
  value,
  onChange
}: {
  templateId: string;
  draftValues: Record<string, string>;
  /** The visible target's theme — see VariantThumb. */
  targetTheme: Partial<TemplateDefinition['theme']>;
  variants: TemplateVariant[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  // Set only when selection moves via keyboard, so the effect below moves DOM
  // focus to the new card. Never set on click/preset-load/template-switch — an
  // unconditional focus move would steal focus whenever the variant changes for
  // an unrelated reason.
  const focusSelectedRef = useRef(false);
  // Thumbnails render from deferred values: typing paints the fields and main
  // preview first, and the mini-stages catch up in a background render.
  const thumbValues = useDeferredValue(draftValues);

  // One effective id drives every selection concern below. When the requested
  // id is unknown it resolves to the first variant, so a card is always active
  // and tabbable even for a stale/imported variantId.
  const effectiveValue = resolveEffectiveVariantId(variants, value);

  // Persist the normalization once when the requested id was invalid, so the
  // stored graphic stops carrying a dead variantId. Deliberately does NOT set
  // focusSelectedRef — this is an automatic correction, not a user navigation,
  // so it must not steal focus.
  useEffect(() => {
    if (variants.length > 0 && effectiveValue && effectiveValue !== value) {
      onChange(effectiveValue);
    }
  }, [variants, effectiveValue, value, onChange]);

  const selectedIndex = Math.max(0, variants.findIndex((variant) => variant.id === effectiveValue));
  const selectedVariant = variants[selectedIndex];

  // Paging is bounded: clamp to [0, length-1] so prev/next can never step off
  // either end. Compares against the effective id so paging is correct even
  // before an invalid request has been normalized away.
  const goTo = (index: number, viaKeyboard = false) => {
    const clamped = Math.min(variants.length - 1, Math.max(0, index));
    const next = variants[clamped];
    if (next && next.id !== effectiveValue) {
      if (viaKeyboard) focusSelectedRef.current = true;
      onChange(next.id);
    }
  };

  // Keep the selected card in view as selection moves (click, keyboard, paging);
  // move focus with it only when the change came from the keyboard, so roving
  // tabindex and the focus ring track the selection during arrow navigation.
  useEffect(() => {
    const card = trackRef.current?.querySelector<HTMLElement>(`[data-variant="${effectiveValue}"]`);
    card?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (focusSelectedRef.current) {
      card?.focus();
      focusSelectedRef.current = false;
    }
  }, [effectiveValue]);

  // No variants: nothing to select or render (parent normally guards this).
  if (variants.length === 0 || !selectedVariant) return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        goTo(selectedIndex - 1, true);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        goTo(selectedIndex + 1, true);
        break;
      case 'Home':
        event.preventDefault();
        goTo(0, true);
        break;
      case 'End':
        event.preventDefault();
        goTo(variants.length - 1, true);
        break;
      default:
        break;
    }
  };

  const atStart = selectedIndex <= 0;
  const atEnd = selectedIndex >= variants.length - 1;

  return (
    <div className="variant-carousel">
      <div className="variant-carousel__head">
        <span className="ll-kicker">Design variant</span>
        <span className="variant-carousel__pos" aria-live="polite">
          {selectedVariant.name} · {selectedIndex + 1} of {variants.length}
        </span>
      </div>

      <div className="variant-carousel__viewport">
        <button
          type="button"
          className="variant-carousel__nav variant-carousel__nav--prev"
          aria-label="Previous design variant"
          disabled={atStart}
          onClick={() => goTo(selectedIndex - 1)}
        >
          <Icon name="chevronLeft" size={18} />
        </button>

        <div
          ref={trackRef}
          className="variant-carousel__track"
          role="radiogroup"
          aria-label="Design variant"
          onKeyDown={onKeyDown}
        >
          {variants.map((variant) => {
            const active = effectiveValue === variant.id;
            return (
              <button
                key={variant.id}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                data-variant={variant.id}
                className={`variant-card${active ? ' variant-card--active' : ''}`}
                onClick={() => onChange(variant.id)}
              >
                <span className="variant-card__preview" aria-hidden>
                  <VariantThumb templateId={templateId} variantId={variant.id} values={thumbValues} theme={targetTheme} />
                  {active ? (
                    <span className="variant-card__check" aria-hidden>
                      <Icon name="check" size={13} />
                    </span>
                  ) : null}
                </span>
                <span className="variant-card__name">{variant.name}</span>
                <span className="variant-card__desc">{variant.description}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="variant-carousel__nav variant-carousel__nav--next"
          aria-label="Next design variant"
          disabled={atEnd}
          onClick={() => goTo(selectedIndex + 1)}
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <button
        type="button"
        className="variant-carousel__browse"
        aria-expanded={browseOpen}
        onClick={() => setBrowseOpen((open) => !open)}
      >
        <Icon name={browseOpen ? 'chevronDown' : 'chevronRight'} size={14} />
        Browse all variants
      </button>

      {browseOpen ? (
        <VariantBrowser
          templateId={templateId}
          thumbValues={thumbValues}
          targetTheme={targetTheme}
          variants={variants}
          value={effectiveValue}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

/**
 * The full searchable, group-filtered variant grid — unchanged behaviour, now
 * living behind the carousel's "Browse all variants" disclosure so it is never
 * lost, just not the first-glance surface.
 */
function VariantBrowser({
  templateId,
  thumbValues,
  targetTheme,
  variants,
  value,
  onChange
}: {
  templateId: string;
  thumbValues: Record<string, string>;
  /** The visible target's theme — see VariantThumb. */
  targetTheme: Partial<TemplateDefinition['theme']>;
  variants: TemplateVariant[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<VariantGroupId>('all');
  const enabledGroups = useMemo(() => {
    const groups = new Set<VariantGroupId>(['all']);
    variants.forEach((variant) => groups.add(variantGroupFor(variant)));
    return VARIANT_GROUPS.filter((group) => groups.has(group.id));
  }, [variants]);
  const filteredVariants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return variants.filter((variant) => {
      const matchesGroup = groupId === 'all' || variantGroupFor(variant) === groupId;
      const matchesQuery =
        !normalizedQuery ||
        variant.name.toLowerCase().includes(normalizedQuery) ||
        variant.description.toLowerCase().includes(normalizedQuery);
      return matchesGroup && matchesQuery;
    });
  }, [groupId, query, variants]);

  return (
    <div className="variant-browser">
      <input
        className="field__input"
        type="search"
        value={query}
        placeholder="Search design samples"
        aria-label="Search design samples"
        onChange={(event) => setQuery(event.target.value)}
      />
      {enabledGroups.length > 2 ? (
        <div className="dynamic-insert" aria-label="Filter design samples">
          {enabledGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="dynamic-insert__btn"
              aria-pressed={groupId === group.id}
              onClick={(event) => {
                event.preventDefault();
                setGroupId(group.id);
              }}
            >
              {group.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="variant-picker__grid">
        {filteredVariants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={value === variant.id}
            data-variant={variant.id}
            className={`variant-choice ${value === variant.id ? 'variant-choice--active' : ''}`}
            onClick={() => onChange(variant.id)}
          >
            <span className="variant-choice__preview" aria-hidden>
              <VariantThumb templateId={templateId} variantId={variant.id} values={thumbValues} theme={targetTheme} />
            </span>
            <span className="variant-choice__name">
              <span>{variant.name}</span>
              {value === variant.id ? <span className="variant-choice__active">Selected</span> : null}
            </span>
            <span className="variant-choice__desc">{variant.description}</span>
          </button>
        ))}
      </div>
      {filteredVariants.length === 0 ? (
        <span className="field__hint">No design samples match that search.</span>
      ) : null}
    </div>
  );
}

function TemplateColorControls({
  template,
  values,
  setField,
  setFields
}: {
  template: (typeof templateRegistry)[number];
  values: Record<string, string>;
  setField: (key: string, value: string) => void;
  setFields: (patch: Record<string, string>) => void;
}) {
  const defaults = template.defaultValues;
  // "Reset palette" restores the selected variant's signature palette when it
  // has one, else the template's palette defaults — the shared rule.
  const resetPalette = resolveResetPalette(template.id, values.variantId);
  const canReset = COLOR_FIELDS.some(
    (field) => resetPalette[field.id] !== undefined && colorValue(values[field.id], defaults[field.id]) !== resetPalette[field.id]
  );

  return (
    <div className="template-colors">
      <span className="field__label">
        <span>Appearance / palette</span>
        <span className="template-colors__aside">
          <span className="field__meta">{COLOR_FIELDS.length} swatches</span>
          {canReset ? (
            <button
              type="button"
              className="template-colors__reset"
              // One atomic write — a per-field loop clobbers itself on a rundown
              // item, where each setField starts from the same stale snapshot.
              onClick={() => setFields(resetPalette)}
            >
              Reset palette
            </button>
          ) : null}
        </span>
      </span>
      <div className="template-colors__grid" aria-label="Template colour controls">
        {COLOR_FIELDS.map((field) => {
          const value = colorValue(values[field.id], defaults[field.id]);
          return (
            <label key={field.id} className="template-color">
              <input
                type="color"
                className="template-color__input"
                value={value}
                onChange={(event) => setField(field.id, event.target.value)}
                aria-label={`${field.label} colour`}
              />
              <span className="template-color__label">{field.label}</span>
              <span className="template-color__hex">{value.toUpperCase()}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The content fields for the currently selected template: required fields
 * first, optional fields below a divider. Shared verbatim by the studio
 * `FieldEditor` panel and the dock `EditStep`; owns its own store subscription.
 */
/**
 * `section` lets the studio editor tabs render just the content fields
 * (Content tab) or just the design controls (Design tab). The dock's single
 * form omits the prop and renders everything ('all'), unchanged.
 */
export default function TemplateFields({
  section = 'all',
  excludeFieldIds
}: {
  section?: 'all' | 'content' | 'design';
  /** Field ids rendered elsewhere (e.g. logo in the Content tab's Logo block). */
  excludeFieldIds?: string[];
}) {
  const { templateId: currentTemplateId, values: draftValues, theme: targetTheme, setField, setFields } = useEditTarget();
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const showDesign = section === 'all' || section === 'design';
  const showContent = section === 'all' || section === 'content';
  const excluded = new Set(excludeFieldIds ?? []);

  const template = templateRegistry.find((item) => item.id === currentTemplateId);
  const required = template?.fields.filter((field) => !field.optional && !excluded.has(field.id)) ?? [];
  const optional = template?.fields.filter((field) => field.optional && !excluded.has(field.id)) ?? [];

  // Packs may curate the design-sample list; the operator's current pick
  // stays offered even if it's off-list so an open draft never jumps styles.
  const packVariants = useMemo(() => {
    if (!template?.variants?.length) return [];
    const curated = packVariantIdsFor(activePackId, template.id);
    if (!curated) return template.variants;
    const currentId = draftValues.variantId;
    const list = curated
      .map((id) => template.variants?.find((variant) => variant.id === id))
      .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));
    if (currentId && !list.some((variant) => variant.id === currentId)) {
      const current = template.variants.find((variant) => variant.id === currentId);
      if (current) list.push(current);
    }
    return list;
  }, [template, activePackId, draftValues.variantId]);

  return (
    <div className="field-grid">
      {showDesign && packVariants.length && template ? (
        <TemplateVariantPicker
          templateId={template.id}
          draftValues={draftValues}
          targetTheme={targetTheme}
          variants={packVariants}
          value={draftValues.variantId ?? template.defaultValues.variantId ?? packVariants[0].id}
          onChange={(value) => setField('variantId', value)}
        />
      ) : null}
      {showDesign && template ? (
        <TemplateColorControls template={template} values={draftValues} setField={setField} setFields={setFields} />
      ) : null}
      {showContent && required.map((field) => (
        <div key={field.id} className="field-stack">
          {currentTemplateId === 'scripture-card' && field.id === 'reference' ? (
            <ScriptureReferencePicker
              reference={draftValues.reference ?? ''}
              onReferenceChange={(reference) => setField('reference', reference)}
              onApply={(values) => {
                setField('reference', values.reference);
                setField('verseText', values.verseText);
                setField('translationLabel', values.translationLabel);
              }}
            />
          ) : (
            <FieldRow
              field={field}
              value={draftValues[field.id] ?? ''}
              onChange={(value) => setField(field.id, value)}
            >
              {currentTemplateId === 'announcement-banner' && field.id === 'dateTime' ? (
                <DateTimeInsertHelper onInsert={(value) => setField(field.id, value)} />
              ) : null}
            </FieldRow>
          )}
        </div>
      ))}
      {showContent && optional.length > 0 ? (
        <div className="field-grid__optional">
          <span className="field-grid__divider">Optional</span>
          {optional.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={draftValues[field.id] ?? ''}
              onChange={(value) => setField(field.id, value)}
            >
              {currentTemplateId === 'announcement-banner' && field.id === 'dateTime' ? (
                <DateTimeInsertHelper onInsert={(value) => setField(field.id, value)} />
              ) : null}
            </FieldRow>
          ))}
        </div>
      ) : null}
    </div>
  );
}
