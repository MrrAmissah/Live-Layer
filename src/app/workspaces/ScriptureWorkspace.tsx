import { useMemo, useState, useSyncExternalStore } from 'react';
import WorkspacePanel from './WorkspacePanel';
import ScriptureLookupPanel from '../../components/control/ScriptureLookupPanel';
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

const SCRIPTURE_TEMPLATE_ID = 'scripture-card';

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
  const setTemplate = useLiveLayerStore((state) => state.setTemplate);
  const setFields = useLiveLayerStore((state) => state.setFields);
  const addToQuickQueue = useLiveLayerStore((state) => state.addToQuickQueue);
  const { activeRundownId, activeRundown, addDraftToRundown } = useRundowns();

  // Transient confirmations. Losing these on a workspace switch is correct —
  // they describe an action just taken, not state the operator is composing.
  const [notice, setNotice] = useState<string>('');

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
    setNotice(`${result.reference} is now the current graphic. Preview it, then Take when ready.`);
  };

  const queue = (result: ScriptureLookupResult, translationId: string) => {
    applyPassage(result);
    rememberScripturePassage(result, translationId);
    addToQuickQueue(result.reference);
    setNotice(`Added ${result.reference} to the quick queue — it is in the rail, not on air.`);
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
    const item = addDraftToRundown();
    setNotice(
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
      <ScriptureLookupPanel
        query={draft.query}
        translationId={draft.translationId}
        passage={draft.passage}
        fromCache={draft.fromCache}
        onQueryChange={(query) => setScriptureDraft({ query })}
        onTranslationChange={(translationId) => setScriptureDraft({ translationId, passage: null, fromCache: false })}
        onPassage={(passage, fromCache) => setScriptureDraft({ passage, fromCache })}
        onAccept={accept}
        onQueue={queue}
        onAddToRundown={addToRundown}
        rundownActive={Boolean(activeRundownId)}
        notice={notice}
        onDismissNotice={() => setNotice('')}
        currentGraphicReference={composing ? draftReference : ''}
      />
    </WorkspacePanel>
  );
}
