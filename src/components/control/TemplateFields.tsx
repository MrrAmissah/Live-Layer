import { templateRegistry } from '../templates/registry';
import { useEditTarget } from '../../hooks/useEditTarget';
import type { TemplateField } from '../../types/graphics';
import { resolveDynamicFields } from '../../lib/dynamicFields';
import type { ReactNode } from 'react';
import ScriptureReferencePicker from './ScriptureReferencePicker';

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

  return (
    <label className="field">
      <span className="field__label">
        <span>{field.label}</span>
        {field.optional ? <span className="field__opt">Optional</span> : null}
      </span>
      {field.type === 'textarea' ? (
        <textarea
          className="field__textarea"
          value={value}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="field__input"
          type={field.type === 'url' ? 'url' : 'text'}
          value={value}
          placeholder={field.placeholder}
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
 * The content fields for the currently selected template: required fields
 * first, optional fields below a divider. Shared verbatim by the studio
 * `FieldEditor` panel and the dock `EditStep`; owns its own store subscription.
 */
export default function TemplateFields() {
  const { templateId: currentTemplateId, values: draftValues, setField } = useEditTarget();

  const template = templateRegistry.find((item) => item.id === currentTemplateId);
  const required = template?.fields.filter((field) => !field.optional) ?? [];
  const optional = template?.fields.filter((field) => field.optional) ?? [];

  return (
    <div className="field-grid">
      {required.map((field) => (
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
      {optional.length > 0 ? (
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
