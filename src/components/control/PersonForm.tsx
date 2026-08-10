import { useEffect, useState, type ChangeEvent } from 'react';
import { saveUploadedAsset } from '../../lib/assets/assetStore';
import { validateImageFile } from '../../lib/assets/imageProcessing';
import { useAsset } from '../../hooks/useAsset';
import SavedImagePicker from './SavedImagePicker';
import type { AssetType } from '../../types/assets';

/**
 * Module-level so the arrays keep a stable identity across renders — the picker
 * effects depend on `accept`, and a fresh literal each render would re-read the
 * asset store on every keystroke in this form.
 */
const HEADSHOT_TYPES: readonly AssetType[] = ['speaker-headshot'];
const PERSON_LOGO_TYPES: readonly AssetType[] = ['logo', 'event-logo'];
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
  const [pickingHeadshot, setPickingHeadshot] = useState(false);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const headshot = useAsset(form.headshotAssetId);
  const personLogo = useAsset(form.logoAssetId);
  const showLogo = Boolean(personLogo.src && !logoFailed);
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

  /**
   * The same reset the headshot has, which the logo was missing: a Person whose
   * logo failed to load left `logoFailed` true, so switching to a Person with a
   * perfectly good logo kept it hidden.
   */
  useEffect(() => {
    setLogoFailed(false);
  }, [personLogo.src]);

  const update = (field: keyof PersonProfileInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  /**
   * A person's logo through the same pipeline as their headshot — same
   * validation, same asset store, same error handling — differing only in the
   * AssetType it is saved under. Requiring the operator to go and upload it via
   * some other graphic's Brand controls first was workflow coupling, not a
   * safety property.
   *
   * Its own uploading flag, so "Saving image…" can never describe the wrong
   * media slot.
   */
  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      setError(validation);
      return;
    }

    setIsUploadingLogo(true);
    try {
      const asset = await saveUploadedAsset(file, 'logo');
      update('logoAssetId', asset.id);
      setLogoFailed(false);
      // Same staleness rule as the headshot: the saved list predates this upload.
      setPickingLogo(false);
    } catch (uploadError) {
      setError(messageForUploadError(uploadError));
    } finally {
      setIsUploadingLogo(false);
      event.target.value = '';
    }
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
      // The saved list predates this upload; leaving it open would omit the
      // asset that is now selected.
      setPickingHeadshot(false);
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
          {/* The headshot is probably already on this machine. */}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPickingHeadshot((open) => !open)}>
            Use saved headshot
          </button>
          {isUploading ? <span className="field__hint" role="status" aria-live="polite">Saving image...</span> : null}
        </div>
      </div>

      {pickingHeadshot ? (
        <SavedImagePicker
          accept={HEADSHOT_TYPES}
          selectedAssetId={form.headshotAssetId || undefined}
          onSelect={(assetId) => {
            // Person form state ONLY. No graphic, no rundown item, no Program —
            // those receive a person's images later, through People fast-swap.
            update('headshotAssetId', assetId);
            setHeadshotFailed(false);
            setPickingHeadshot(false);
          }}
          onCancel={() => setPickingHeadshot(false)}
          emptyHint="No saved headshots yet. Upload one and it becomes reusable for any person."
        />
      ) : null}

      {/**
        * PERSON / MINISTRY LOGO.
        *
        * `logoAssetId` was already stored, sanitised by the People store,
        * remapped by rundown-pack import, and consumed by stage 4B's
        * `personFieldPatch` for templates that render a logo — with no UI
        * anywhere, so it could only ever arrive by importing a pack. That is an
        * unfinished surface rather than a deliberate one, so it is authorable
        * here. It belongs to the PERSON, not to the current graphic's brand:
        * fast-swap copies it onto a graphic later, and only where the template
        * actually draws a logo.
        */}
      <div className="person-media">
        {showLogo ? (
          <img src={personLogo.src} alt="" className="person-media__img" onError={() => setLogoFailed(true)} />
        ) : (
          <div className="person-media__empty">No logo</div>
        )}
        <div className="person-media__actions">
          <span className="field__hint">Applied by People swap where the template shows a logo.</span>
          <label className="btn btn--secondary btn--sm" htmlFor="person-logo-upload">
            {form.logoAssetId ? 'Replace logo' : 'Upload logo'}
          </label>
          <input id="person-logo-upload" className="field__file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPickingLogo((open) => !open)}>
            Use saved logo
          </button>
          {form.logoAssetId ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => update('logoAssetId', '')}>
              Remove logo
            </button>
          ) : null}
          {isUploadingLogo ? <span className="field__hint" role="status" aria-live="polite">Saving logo...</span> : null}
        </div>
      </div>

      {pickingLogo ? (
        <SavedImagePicker
          accept={PERSON_LOGO_TYPES}
          selectedAssetId={form.logoAssetId || undefined}
          onSelect={(assetId) => {
            update('logoAssetId', assetId);
            setLogoFailed(false);
            setPickingLogo(false);
          }}
          onCancel={() => setPickingLogo(false)}
          emptyHint="No saved logos yet. Upload one here and it becomes reusable for any person or graphic."
        />
      ) : null}

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
