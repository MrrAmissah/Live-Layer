import { useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { outputForScreen, outputPresence } from '../../lib/outputPresence';
import {
  AS_CHOSEN,
  resolveScreenValues,
  screenSourceUrl,
  type ScriptureOutputScreenInfo
} from '../../lib/scriptureOutputs';
import { getRealtimeRelayUrl } from '../../lib/relayConfig';
import { templateRegistry } from '../templates/registry';
import { SCRIPTURE_TEMPLATE_ID } from '../../lib/graphicReadiness';
import TemplatePreview from '../templates/TemplatePreview';
import { Icon } from '../../lib/icons';
import { useTicks, ago } from '../../hooks/useTicks';
import { OUTPUT_HEARTBEAT_MS } from '../../lib/outputPresence';
import type { OutputStatusState } from '../../types/program';

interface Props {
  screen: ScriptureOutputScreenInfo;
}

const FALLBACK_THEME = {
  primaryColor: '#f8fafc',
  accentColor: '#0E7C86',
  backgroundColor: 'transparent'
};

interface Pill {
  label: string;
  /**
   * The same vocabulary the Program pill uses (`lib/programStatus.ts`), so the
   * two surfaces cannot say the same thing in different colours. This card
   * answers per screen what that one answers for the rig.
   */
  tone: 'live' | 'ready' | 'attention' | 'failed' | 'idle';
  detail: string;
}

/**
 * What this screen's card says about itself, in the vocabulary the rest of the
 * product already uses — no invented states, and never a claim about a screen
 * that has not spoken.
 *
 * "Not connected" is deliberately a different answer from "Stale". Nothing has
 * ever reported for this screen, which on a page whose whole job is setup is
 * the most common and most useful reading: the browser source has not been
 * created yet, or its URL is wrong. Calling that stale would describe a failure
 * that never happened.
 */
function describeScreen(status: OutputStatusState | null, now: number): Pill {
  if (!status) {
    return {
      label: 'Not connected',
      tone: 'idle',
      detail: 'No browser source has reported this screen. Add one with the address below.'
    };
  }
  if (status.failure) {
    // Worth more than any liveness reading: the page is alive and telling us it
    // cannot render what it was sent, which on a second screen used to be
    // completely silent.
    return { label: 'Can’t render', tone: 'failed', detail: status.failure.reason };
  }
  if (outputPresence(status, now) !== 'fresh') {
    return {
      label: 'Stale',
      tone: 'attention',
      detail: `Stopped reporting ${ago(status.lastSeenAt, now)}. The source may have crashed or been removed.`
    };
  }
  if (status.sourceVisible === false) {
    // Gold, not red: on a two-scene rig this is the NORMAL state of whichever
    // screen is not live, and it is only worth acting on if it is the one that
    // should be carrying.
    return { label: 'Hidden', tone: 'attention', detail: 'The page is up, but OBS says the source is hidden — normal for a scene that is not live.' };
  }
  if (status.sourceActive === false) {
    return { label: 'Not active', tone: 'attention', detail: 'The page is up, but OBS says the source is not in the live scene.' };
  }
  if (status.sourceActive === true) {
    return { label: 'Active', tone: 'live', detail: 'OBS reports this source active.' };
  }
  /**
   * Blue, not green: the page is reporting but nothing has measured a source,
   * so it claims less than Active and must not be coloured as if it claimed the
   * same.
   *
   * THE DETAIL IS THE POINT HERE. This state and a plain browser tab look
   * identical from the desk — same pill, same colour — and only one of them is
   * worth investigating. Saying which turns a correct reading that FEELS like a
   * bug into a known fact about the rig, which matters more in production than
   * any wording: an operator who cannot tell those apart has to treat every one
   * of them as a fault.
   *
   * The wording deliberately does not repeat the pill's words. That vocabulary
   * lives in `lib/programStatus.ts` and a guard in `programSyncWiring.test.ts`
   * keeps it there — a second copy in a card is how two surfaces start saying
   * almost the same thing.
   */
  return {
    label: 'Connected',
    tone: 'ready',
    detail:
      status.hosted === true
        ? 'OBS is hosting this page but has not reported source state. Some obs-browser builds never send it — the graphic is still going out.'
        : status.hosted === false
          ? 'A browser tab, not an OBS source. Source state cannot be measured here, so this is as much as this screen can ever report.'
          : 'The page is reporting. It has not said whether OBS is hosting it, so source state is unknown.'
  };
}

/**
 * One output screen, as a card.
 *
 * A settings row could carry the picker and the URL. It could not carry the
 * PREVIEW, and the preview is why this page exists: two outputs are worth
 * having because they differ, and a page that cannot show the difference is a
 * dropdown with extra steps.
 *
 * The preview resolves through `resolveScreenValues` — the same function
 * `/output` renders through. Not a similar one: a preview that worked out the
 * look its own way would show the operator something no screen is rendering the
 * first time the two drifted, which is worse than showing nothing.
 *
 * It previews PROGRAM, not the draft. The card claims to show what this screen
 * is rendering right now, and the draft is what the operator is preparing —
 * putting it here would make the claim false every time they typed.
 */
export default function ScreenCard({ screen }: Props) {
  const outputs = useLiveLayerStore((state) => state.outputs);
  const scriptureOutputs = useLiveLayerStore((state) => state.scriptureOutputs);
  const setScriptureOutput = useLiveLayerStore((state) => state.setScriptureOutput);
  const program = useLiveLayerStore((state) => state.program);
  const [copied, setCopied] = useState(false);

  // Presence decays with the clock, so the card has to tick or a dead screen
  // would keep reading Active until something else re-rendered the page.
  const now = useTicks(OUTPUT_HEARTBEAT_MS);
  const status = outputForScreen(outputs, screen.id, now);
  const pill = describeScreen(status, now);

  const variants = templateRegistry.find((template) => template.id === SCRIPTURE_TEMPLATE_ID)?.variants ?? [];
  const snapshot = program.status === 'showing' || program.status === 'recovering' ? program.snapshot : null;
  // Same merge `/output` performs: a graphic's theme is an OVERRIDE of its
  // template's, not a whole theme, so previewing the override alone would drop
  // every colour the operator never touched.
  const definition = snapshot ? templateRegistry.find((t) => t.id === snapshot.templateId) : null;
  const theme = { ...(definition?.theme ?? FALLBACK_THEME), ...(snapshot?.theme ?? {}) };
  const url = screenSourceUrl(screen, window.location.origin, getRealtimeRelayUrl());

  const copy = () => {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false)
    );
  };

  return (
    <section className="screen-card" data-tone={pill.tone}>
      <header className="screen-card__head">
        <span className="screen-card__glyph" aria-hidden>
          <Icon name={screen.icon} size={20} />
        </span>
        <span className="screen-card__title">
          <span className="screen-card__name">{screen.name}</span>
          <span className="screen-card__hint">{screen.hint}</span>
        </span>
        <span className="screen-card__pill" data-tone={pill.tone} title={pill.detail} role="status">
          {pill.label}
        </span>
      </header>

      <div className="screen-card__monitor">
        {snapshot ? (
          <TemplatePreview
            templateId={snapshot.templateId}
            values={resolveScreenValues(snapshot.templateId, snapshot.values, screen.id, scriptureOutputs)}
            theme={theme}
            layout={snapshot.layout}
            showControls={false}
            frame="bare"
          />
        ) : (
          /* Honest empty state. "Nothing on air" is a fact; rendering the draft
             here would dress up a guess as a report. */
          <p className="screen-card__empty">Nothing on air — this screen is transparent.</p>
        )}
      </div>

      <p className="screen-card__detail">{pill.detail}</p>

      <label className="screen-card__field">
        <span className="screen-card__label">Scripture look</span>
        <span className="ls-select screen-card__select">
          <select
            value={scriptureOutputs[screen.id]}
            aria-label={`${screen.name} scripture look`}
            onChange={(event) => setScriptureOutput(screen.id, event.target.value)}
          >
            {/* First, and the default for the main screen: this screen renders
                whatever the operator picked on the graphic, so presets and
                rundown items keep their own look. */}
            <option value={AS_CHOSEN}>Use the graphic’s own look</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={15} />
        </span>
      </label>

      <div className="screen-card__url">
        <code className="screen-card__address">{url}</code>
        <button type="button" className="btn btn--secondary btn--xs screen-card__copy" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
