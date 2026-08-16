import { useMemo, useState, useSyncExternalStore } from 'react';
import WorkspacePanel from './WorkspacePanel';
import ScriptureLookupPanel from '../../components/control/ScriptureLookupPanel';
import VoiceAssistPreview from '../../components/control/VoiceAssistPreview';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useRundowns } from '../../hooks/useRundowns';
import { rundownDestination, noActiveRundownMessage } from '../../components/control/rundownDestination';
import { MAX_ITEMS_PER_RUNDOWN } from '../../lib/rundown/rundownStore';
import {
  getScriptureDraft,
  subscribeScriptureDraft,
  setScriptureDraft
} from '../../lib/scripture/scriptureDraftStore';
import { rememberScripturePassage } from '../../lib/scripture/scriptureRecents';
import type { ScriptureLookupResult } from '../../types/scripture';
// Imported, not redeclared: this is the id the output's scripture-only gate is
// written against (`lib/scriptureOutputs.ts`), and a second copy of it is a
// second thing to keep in step.
import { SCRIPTURE_TEMPLATE_ID } from '../../lib/graphicReadiness';

/**
 * Scripture — finding a passage and staging it.
 *
 * Lives inside the `/control` layout rather than at a top-level `/scripture`
 * precisely so it does not need a command owner of its own: the realtime channel,
 * the in-flight guard and the only Take/Clear stay in `ControlPage`, and the
 * Program rail that renders them is on screen here as it is in every workspace.
 * A sibling route would have meant a second channel and a second guard, i.e. two
 * Takes that can race.
 *
 * So this workspace has no Take. Its terminal verbs are staging verbs — set the
 * graphic, queue it, add it to a rundown — and airing stays one deliberate press
 * of the one Take. Nothing here touches Program.
 */
export default function ScriptureWorkspace() {
  const draft = useSyncExternalStore(subscribeScriptureDraft, getScriptureDraft, getScriptureDraft);
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftReference = useLiveLayerStore((state) => state.draftValues.reference ?? '');
  // The version on the staged card, so the panel can say when it is not the one
  // the picker is set to — the "stuck to the old version" report.
  const draftTranslation = useLiveLayerStore((state) => state.draftValues.translationLabel ?? '');
  const setTemplate = useLiveLayerStore((state) => state.setTemplate);
  const setFields = useLiveLayerStore((state) => state.setFields);
  const addToQuickQueue = useLiveLayerStore((state) => state.addToQuickQueue);
  const { activeRundownId, activeRundown, addDraftToRundown } = useRundowns();

  // Transient confirmations. Losing these on a workspace switch is correct —
  // they describe an action just taken, not state the operator is composing.
  const [notice, setNotice] = useState<string>('');
  /**
   * Bumped on every accepted action, so the recents list refreshes even when two
   * actions produce the SAME notice text — accepting John 3:16 in WEB and then in
   * KJV yields an identical sentence, React skips the re-render, and the panel's
   * effect never re-read the list. A counter cannot collide the way a message can.
   */
  const [acceptedCount, setAcceptedCount] = useState(0);
  const recordAccepted = (message: string) => {
    setNotice(message);
    setAcceptedCount((count) => count + 1);
  };

  const translationLabelFor = (result: ScriptureLookupResult) => result.translation;

  /**
   * Write an accepted passage into the shared graphic draft.
   *
   * `setTemplate` reseeds the draft from the active event pack, so it runs only
   * when the operator is not already composing a scripture card — calling it
   * unconditionally would discard their chosen variant, theme title and duration
   * every time they applied a new verse.
   *
   * The three fields land in ONE `setFields`. Three sequential `setField` calls
   * each start from the same render-time snapshot, which is how the reference and
   * verse text were once silently dropped and only the translation label survived.
   */
  const applyPassage = (result: ScriptureLookupResult) => {
    if (currentTemplateId !== SCRIPTURE_TEMPLATE_ID) setTemplate(SCRIPTURE_TEMPLATE_ID);
    setFields({
      reference: result.reference,
      verseText: result.text,
      translationLabel: translationLabelFor(result)
    });
  };

  const accept = (result: ScriptureLookupResult, translationId: string) => {
    applyPassage(result);
    // Recents record ACCEPTED passages, not every lookup — otherwise the four
    // references someone typed while hunting would bury the one they chose.
    rememberScripturePassage(result, translationId);
    /**
     * "Then Take when ready" is only true in draft mode.
     *
     * With a rundown active, `ControlPage.onTake` returns through the rundown
     * branch: it airs the SELECTED ITEM and never falls through to the draft (and
     * with nothing selected Take is disabled outright). Telling the operator to
     * Take would send them pressing a button that cannot air what they just set —
     * mid-service, that reads as the app being broken.
     */
    recordAccepted(
      activeRundownId
        ? `${result.reference} is now the current graphic — but a rundown is active, so Take fires the selected rundown item. Add this passage to the rundown to air it.`
        : `${result.reference} is now the current graphic. Preview it, then Take when ready.`
    );
  };

  const queue = (result: ScriptureLookupResult, translationId: string) => {
    applyPassage(result);
    rememberScripturePassage(result, translationId);
    /**
     * The translation belongs in the label.
     *
     * `presetName` is what the quick-queue rail shows, and it wins over the
     * graphic's own fields — so queueing John 3:16 in WEB and again in KJV gave
     * two rows reading `John 3:16`, indistinguishable. The compact rail puts a
     * Take button directly on that row, so the operator picks between them with
     * nothing to tell them apart, and they are different on-air content. Same
     * rule as the passage tag and every recents entry: translation is readable
     * text wherever a passage is identified.
     */
    addToQuickQueue(`${result.reference} · ${result.translation}`);
    recordAccepted(
      activeRundownId
        ? `Added ${result.reference} to the quick queue — it is in the rail, not on air. A rundown is active, so Take fires the selected rundown item.`
        : `Added ${result.reference} to the quick queue — it is in the rail, not on air.`
    );
  };

  const addToRundown = (result: ScriptureLookupResult, translationId: string) => {
    if (!activeRundownId) {
      setNotice(noActiveRundownMessage('studio'));
      return;
    }
    /**
     * Check the cap BEFORE touching anything.
     *
     * `addDraftToRundown` builds from the shared draft, so the passage has to be
     * applied first — which meant a full rundown left the operator with a
     * "couldn't add" notice *and* a silently changed current graphic. Nothing may
     * change on a failed action, so the one case that can fail is tested up front.
     */
    if ((activeRundown?.items.length ?? 0) >= MAX_ITEMS_PER_RUNDOWN) {
      setNotice(
        `${rundownDestination('studio')} is full at ${MAX_ITEMS_PER_RUNDOWN} items — nothing was changed. Remove an item first.`
      );
      return;
    }

    applyPassage(result);
    rememberScripturePassage(result, translationId);
    /**
     * Name the item and record its provenance rather than letting
     * `deriveItemTitle` guess. That helper reads `values.reference`, so one verse
     * added in two translations produced two rows titled the same, and the rail
     * offers Take from that row. `{type:'scripture'}` already exists in
     * `RundownItemSource` and is read on pack import, but nothing produced it
     * until now.
     */
    const item = addDraftToRundown({
      title: `${result.reference} · ${result.translation}`,
      source: { type: 'scripture', reference: result.reference }
    });
    recordAccepted(
      item
        ? `Added ${result.reference} to the active rundown — manage the order in ${rundownDestination('studio')}.`
        : `Couldn't add ${result.reference} to the rundown, but it is now the current graphic.`
    );
  };

  const composing = useMemo(
    () => currentTemplateId === SCRIPTURE_TEMPLATE_ID && draftReference.trim().length > 0,
    [currentTemplateId, draftReference]
  );

  return (
    <WorkspacePanel kicker="Scripture">
      {/*
        ONE permanent slot for the live panel, always first.

        Two rules meet here, and they were learned separately and expensively.

        The first: the live panel belongs at the top, because mid-service the
        operator is listening to a preacher and watching for a verse, and a manual
        query box above that is the right layout for preparing and the wrong one
        for running. The obvious way to express that is to render the panel in one
        of two places depending on whether the microphone is open.

        That is a bug, and it was shipped. Moving a component between two positions
        in the children array makes React unmount the old one and mount a fresh
        one — so the panel that owns the MICROPHONE was destroyed and recreated at
        the exact moment the operator pressed Start. The new instance came up with
        listening false while the old instance's `getUserMedia` was still in
        flight: Chrome reported the microphone in use and LiveLayer offered to
        start listening, with no control that could turn it off.

        The second: even done purely in CSS, moving it is wrong for the operator.
        The control they just pressed changed position — Start sat below the lookup
        panel, and the Stop that replaced it appeared at the top — so pressing a
        button meant looking for it again, at the moment Stop matters most.

        So it is rendered once, in one slot, at the top, in both states. Starting
        and stopping change what the strip says, never where it is.
      */}
      <div className="scripture-workspace">
        <div className="scripture-workspace__live">
          <VoiceAssistPreview onAccept={accept} translationId={draft.translationId} />
        </div>
        <div className="scripture-workspace__manual">
          <ScriptureLookupPanel
            query={draft.query}
            translationId={draft.translationId}
            passage={draft.passage}
            fromCache={draft.fromCache}
            onQueryChange={(query) => setScriptureDraft({ query })}
            onTranslationChange={(translationId) =>
              setScriptureDraft({ translationId, passage: null, fromCache: false })
            }
            onPassage={(passage, fromCache) => setScriptureDraft({ passage, fromCache })}
            onAccept={accept}
            onQueue={queue}
            onAddToRundown={addToRundown}
            rundownActive={Boolean(activeRundownId)}
            notice={notice}
            recentsVersion={acceptedCount}
            onDismissNotice={() => setNotice('')}
            currentGraphicReference={composing ? draftReference : ''}
            currentGraphicTranslation={composing ? draftTranslation : ''}
          />
        </div>
      </div>
    </WorkspacePanel>
  );
}
