import { useMemo, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import {
  availableTranslations,
  defaultTranslationId,
  describeTranslation
} from '../../lib/scripture/providers';
import { useQuickTake } from '../../app/quickTake';
import ScriptureReferenceGrid from './ScriptureReferenceGrid';
import SecondLanguagePicker from './SecondLanguagePicker';
import { Icon } from '../../lib/icons';

interface Props {
  reference: string;
  onReferenceChange: (reference: string) => void;
  onApply: (values: { reference: string; verseText: string; translationLabel: string }) => void;
  /**
   * Fill the card's SECOND passage — the dual screen's lower well.
   *
   * Optional so a surface with no use for it simply omits the control. It
   * exists here as well as on the Scripture page because THIS is where the
   * second-passage fields render as ordinary text boxes, so without it an
   * operator working in Studio still had to type the reference again — the
   * exact complaint the chooser was built to answer.
   */
  onApplySecond?: (values: { reference: string; verseText: string; translationLabel: string }) => void;
}

/**
 * Beginner-friendly Scripture reference picker: type or tap a book → chapter →
 * verse, then Look up. The reference string is the single source of truth — both
 * direct typing and chip taps build it — so there is no dual-state drift.
 * Tapping chips only edits the draft reference; only the explicit Look up button
 * fills the verse text (which the operator then edits in the field below).
 */
export default function ScriptureReferencePicker({
  reference,
  onReferenceChange,
  onApply,
  onApplySecond
}: Props) {
  const { provider, status, message, lookup } = useScriptureLookup();
  const quickTake = useQuickTake();
  const translations = availableTranslations();
  // Not `translations[0]` — picker order is presentation, and it decided what
  // went to air. `defaultTranslationId()` is the choice, stated once.
  const [translation, setTranslation] = useState(defaultTranslationId);

  // Mirror of the latest intended reference, so a slow response can be discarded
  // if the operator has since moved to a different verse/reference.
  const latestReference = useRef(reference);
  latestReference.current = reference;

  const runLookup = async (ref: string, airIt = false) => {
    const found = await lookup(ref, translation);
    if (!found) return; // stale (hook seq guard) or failed — reference stands, hint shows the error
    // Reference-match guard: ignore if the operator moved to a different reference
    // while this request was in flight (e.g. tapped a newer verse).
    if (latestReference.current !== ref) return;
    const { result } = found;
    onApply({ reference: result.reference, verseText: result.text, translationLabel: result.translation });
    /**
     * AIR IT ONLY AFTER THE WORDS ARE IN. `onApply` writes the passage into the
     * draft and `takeNow` publishes that draft, so calling them the other way
     * round — or in parallel — would air the PREVIOUS verse. React batches the
     * state write, but `takeNow` reads the store directly rather than a
     * rendered prop, so the ordering here is what makes it correct.
     */
    if (airIt && quickTake.enabled && !quickTake.blocked) quickTake.takeNow();
  };

  const onLookup = () => runLookup(reference);

  return (
    <div className="ref-picker">
      <div className="ref-picker__section">
        <span className="ref-picker__label">Choose book</span>
        <input
          className="field__input"
          value={reference}
          placeholder="e.g. John 3:16 or Psalm 23:1-3"
          aria-label="Scripture reference"
          onChange={(event) => onReferenceChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              // Armed, Enter looks up AND airs — the keyboard path for
              // verse-by-verse while someone is preaching.
              void runLookup(reference, quickTake.enabled);
            }
          }}
        />
      </div>

      {/* The grids themselves live in `ScriptureReferenceGrid`, shared with the
          Scripture page. They were only here, which is why that page — the one
          named after this job — had a text box and nothing else. */}
      <ScriptureReferenceGrid
        reference={reference}
        translationId={translation}
        onReferenceChange={onReferenceChange}
        onPick={(ref, { air }) => void runLookup(ref, air)}
      />

      <div className="ref-picker__actions">
        <label className="ref-picker__translation">
          <span className="ref-picker__label">Translation</span>
          <select
            className="field__input"
            value={translation}
            onChange={(event) => setTranslation(event.target.value)}
          >
            {/* Was the bare code. `LSG`, `DRA` and `OEB-CW` say nothing at all
                to an operator who has not met them, and the list passed a dozen
                when French arrived. Same words as the Scripture workspace's
                picker, from the same function, so the two cannot drift. */}
            {translations.map((item) => (
              <option key={item.id} value={item.id}>
                {describeTranslation(item)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--secondary btn--sm ref-picker__lookup" onClick={onLookup} disabled={status === 'loading'}>
          {status === 'loading' ? 'Looking…' : 'Look up'}
        </button>
      </div>

      {/* The same chooser the Scripture page offers, so the two surfaces cannot
          drift into different speeds for one job. */}
      {onApplySecond ? (
        <SecondLanguagePicker
          reference={reference}
          currentTranslationId={translation}
          onFilled={(result) =>
            onApplySecond({
              reference: result.reference,
              verseText: result.text,
              translationLabel: result.translation
            })
          }
        />
      ) : null}

      {/**
        * The switch, and the badge that makes it impossible to miss.
        *
        * Off is the default and off is the promise: nothing here airs. On, this
        * surface is hot and says so, because someone else standing at the desk
        * has to be able to see that a double-click is now a broadcast.
        */}
      <div className="ref-picker__quick">
        <label className="ref-picker__quick-switch">
          <input
            type="checkbox"
            checked={quickTake.enabled}
            onChange={(event) => quickTake.setEnabled(event.target.checked)}
          />
          <span>Quick take</span>
        </label>
        {quickTake.enabled && !quickTake.blocked ? (
          <span className="ref-picker__quick-live">
            <Icon name="broadcast" size={12} />
            Double-click a verse, or press Enter, to put it on air
          </span>
        ) : null}
        {quickTake.enabled && quickTake.blocked ? (
          <span className="ref-picker__quick-blocked">{quickTake.blocked}</span>
        ) : null}
      </div>

      <div className={`field__hint ${status === 'error' ? 'field__hint--error' : ''}`} role={status === 'error' ? 'alert' : undefined}>
        {message || 'Tap a verse to load it, or type a reference and Look up. Edit the text below before taking live.'}
      </div>
    </div>
  );
}
