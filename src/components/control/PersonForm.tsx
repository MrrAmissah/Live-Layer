import { useEffect, useState, type ChangeEvent } from 'react';
import { saveUploadedAsset } from '../../lib/assets/assetStore';
import { validateImageFile } from '../../lib/assets/imageProcessing';
import { useAsset } from '../../hooks/useAsset';
import type { PersonProfile, PersonProfileInput } from '../../types/people';

interface PersonFormProps {
  person?: PersonProfile | null;
  onSave: (input: PersonProfileInput, id?: string) => Promise<void>;
  onCancel: () => void;
}

const EMPTY_FORM: PersonProfileInput = {
  displayName: '',
  title: '',
  churchName: '',
  subtitle: '',
  notes: '',
  headshotAssetId: '',
  logoAssetId: '',
  favorite: false
};

function messageForUploadError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === 'unsupported-file-type') return 'Use a PNG, JPG, or WebP image.';
    if (error.message === 'file-too-large') return 'Choose an image under 12 MB.';
  }
  return 'Unable to save this image.';
}

export default function PersonForm({ person, onSave, onCancel }: PersonFormProps) {
  const [form, setForm] = useState<PersonProfileInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const headshot = useAsset(form.headshotAssetId);
  const showHeadshot = Boolean(headshot.src && !headshotFailed);

  useEffect(() => {
    setForm(person ? {
      displayName: person.displayName,
      title: person.title ?? '',
      churchName: person.churchName ?? '',
      subtitle: person.subtitle ?? '',
      notes: person.notes ?? '',
      headshotAssetId: person.headshotAssetId ?? '',
      logoAssetId: person.logoAssetId ?? '',
      favorite: Boolean(person.favorite)
    } : EMPTY_FORM);
    setError(null);
  }, [person]);

  useEffect(() => {
    setHeadshotFailed(false);
  }, [headshot.src]);

  const update = (field: keyof PersonProfileInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleHeadshotChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      setError(validation);
      return;
    }

    setIsUploading(true);
    try {
      const asset = await saveUploadedAsset(file, 'speaker-headshot');
      update('headshotAssetId', asset.id);
    } catch (uploadError) {
      setError(messageForUploadError(uploadError));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!form.displayName.trim()) {
      setError('Add a speaker name before saving.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(form, person?.id);
      if (!person) setForm(EMPTY_FORM);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message === 'person-name-required'
        ? 'Add a speaker name before saving.'
        : 'Unable to save this person.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="person-form">
      <div className="person-form__grid">
        <label className="field">
          <span className="field__label"><span>Name</span></span>
          <input className="field__input" value={form.displayName} placeholder="Speaker name" onChange={(event) => update('displayName', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label"><span>Title</span><span className="field__opt">Optional</span></span>
          <input className="field__input" value={form.title} placeholder="Lead Pastor" onChange={(event) => update('title', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label"><span>Church / ministry</span><span className="field__opt">Optional</span></span>
          <input className="field__input" value={form.churchName} placeholder="Grace Harbor Church" onChange={(event) => update('churchName', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label"><span>Subtitle</span><span className="field__opt">Optional</span></span>
          <input className="field__input" value={form.subtitle} placeholder="Guest speaker, event, campus" onChange={(event) => update('subtitle', event.target.value)} />
        </label>
      </div>

      <div className="person-media">
        {showHeadshot ? (
          <img src={headshot.src} alt="" className="person-media__img" onError={() => setHeadshotFailed(true)} />
        ) : (
          <div className="person-media__empty">No photo</div>
        )}
        <div className="person-media__actions">
          <label className="btn btn--secondary btn--sm" htmlFor="person-headshot-upload">
            {form.headshotAssetId ? 'Replace headshot' : 'Upload headshot'}
          </label>
          <input id="person-headshot-upload" className="field__file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleHeadshotChange} />
          {form.headshotAssetId ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => update('headshotAssetId', '')}>
              Remove headshot
            </button>
          ) : null}
          {isUploading ? <span className="field__hint" role="status" aria-live="polite">Saving image...</span> : null}
        </div>
      </div>

      <label className="field">
        <span className="field__label"><span>Notes</span><span className="field__opt">Optional</span></span>
        <textarea className="field__textarea" value={form.notes} rows={3} placeholder="Production notes, pronunciation, service context" onChange={(event) => update('notes', event.target.value)} />
      </label>

      <label className="person-fav">
        <input type="checkbox" checked={Boolean(form.favorite)} onChange={(event) => update('favorite', event.target.checked)} />
        <span>Favorite</span>
      </label>

      {error ? <div className="field__hint field__hint--error" role="alert">{error}</div> : null}

      <div className="person-form__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving...' : person ? 'Save changes' : 'Save person'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
