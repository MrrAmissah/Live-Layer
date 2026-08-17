import { useEffect, useMemo, useRef, useState } from 'react';
import { createOutputChannel, loadLastRealtimeMessage } from '../lib/outputChannel';
import { createOutputEvent, getOutputSessionId, sendOutputEvent } from '../lib/outputAck';
import { obsHostPresent, subscribeObsSourceState, type ObsBridgeDiagnostics } from '../lib/obsSource';
import { subscribeObsHostDiagnostics, type ObsHostDiagnostics } from '../lib/obsHostDiagnostics';
import { OUTPUT_HEARTBEAT_MS } from '../lib/outputPresence';
import { templateRegistry, templateRendererMap } from '../components/templates/registry';
import GraphicStage from '../components/graphics/GraphicStage';
import { GFX_OUT_MS, resolveAnimationVariant } from '../components/graphics/stage';
import { GraphicInstance, RealtimeMessage, TemplateTheme } from '../types/graphics';
import { decodeImage, resolveAssetSource } from '../lib/assets/assetStore';
import { useDynamicValues } from '../hooks/useDynamicValues';
import { applyFieldVisibility } from '../lib/fieldVisibility';
import {
  loadScriptureOutputs,
  readOutputScreen,
  resolveScreenValues,
  sanitizeScriptureOutputs,
  screenRenders,
  type ScriptureOutputMap
} from '../lib/scriptureOutputs';

const FALLBACK_THEME: TemplateTheme = {
  primaryColor: '#f8fafc',
  accentColor: '#0E7C86',
  backgroundColor: 'transparent'
};
const EMPTY_VALUES: Record<string, string> = {};

/** `not seen` is a different answer from `false`, and the difference is the diagnosis. */
function eventLabel(flag: boolean | null | undefined): string {
  return flag === null || flag === undefined ? 'not seen' : String(flag);
}

/**
 * Wall clock, deliberately not an age: an age is computed when the chip renders
 * and the chip renders when an event arrives, so it would read "0s ago" in a
 * screenshot taken minutes later. A time of day cannot go stale.
 */
function clockLabel(at: number | null | undefined): string {
  if (at === null || at === undefined) return 'none';
  return new Date(at).toLocaleTimeString();
}

/**
 * "arrived, shaped differently" must never render as "not seen" — if OBS names
 * the scene under a key this build does not read, the keys it DID send are the
 * finding, and calling that silence would end the enquiry at the wrong answer.
 */
function sceneLabel(signals: ObsHostDiagnostics | null): string {
  if (!signals || signals.sceneEvents === 0) return 'not seen';
  if (signals.lastSceneName) return signals.lastSceneName;
  if (signals.lastSceneDetailKeys?.length) return `detail keys: ${signals.lastSceneDetailKeys.join(', ')}`;
  return 'arrived, no readable detail';
}

export default function OutputPage() {
  const [activeGraphic, setActiveGraphic] = useState<GraphicInstance | null>(null);
  const [showing, setShowing] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const resolvedAssetUrls = useRef<string[]>([]);
  const showRequestId = useRef(0);
  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  /**
   * WHICH SCREEN THIS IS. A browser source's identity is its address and
   * nothing else — there is no per-source setting OBS could carry — so this is
   * read once from the URL and never changes for the life of the page. An
   * absent or unknown `screen` is the main screen, which is what keeps every
   * existing /output URL working untouched.
   */
  const screen = useMemo(() => readOutputScreen(window.location.search), []);
  /**
   * What each screen LOOKS like. Seeded from this browser's own settings (a
   * same-browser rig needs no broadcast at all) and then kept current by
   * SET_SCRIPTURE_OUTPUTS, which is the only path that works when the control
   * surface is Chrome and this page is OBS CEF — the two share no localStorage.
   */
  const [scriptureOutputs, setScriptureOutputs] = useState<ScriptureOutputMap>(() => loadScriptureOutputs());
  // Display-only, and only under ?debug=1. Nothing here reaches Program truth,
  // OUTPUT_STATUS, or the relay — it exists so one screenshot of the real
  // Browser Source says which bridge is delivering, instead of another blind
  // code-and-test cycle.
  const [bridge, setBridge] = useState<ObsBridgeDiagnostics | null>(null);
  // Separate state for a separate question: the OBS source bridge is silent on
  // the rig, so this records whether the HOST's own signals arrive at all.
  const [hostSignals, setHostSignals] = useState<ObsHostDiagnostics | null>(null);

  const revokeResolvedAssets = () => {
    resolvedAssetUrls.current.forEach((url) => URL.revokeObjectURL(url));
    resolvedAssetUrls.current = [];
  };

  // Force a fully transparent document for OBS Browser Source. The control
  // surface paints its own dark background; the :root fallback color must not
  // bleed through here (its pseudo-class specificity beats plain `html`).
  useEffect(() => {
    document.documentElement.classList.add('gfx-transparent');
    document.body.classList.add('gfx-transparent');
    return () => {
      document.documentElement.classList.remove('gfx-transparent');
      document.body.classList.remove('gfx-transparent');
    };
  }, []);

  useEffect(() => {
    const prepareGraphic = async (graphic: GraphicInstance): Promise<GraphicInstance> => {
      const resolvedValues: Record<string, string> = { ...graphic.values };
      const slots = [
        { assetId: graphic.values.logoAssetId?.trim(), valueKey: 'logoResolvedSrc' },
        { assetId: graphic.values.headshotAssetId?.trim(), valueKey: 'headshotResolvedSrc' }
      ];

      await Promise.all(slots.map(async (slot) => {
        if (!slot.assetId) return;
        const src = await resolveAssetSource(slot.assetId);
        if (!src) return;
        await decodeImage(src);
        if (src.startsWith('blob:')) {
          resolvedAssetUrls.current.push(src);
        }
        resolvedValues[slot.valueKey] = src;
      }));

      return {
        ...graphic,
        values: resolvedValues
      };
    };

    /**
     * Acknowledgements are REPORTS, sent fire-and-forget through
     * `lib/outputAck.ts` — they can carry only OUTPUT_* events, never a
     * command, and a dead relay costs nothing on the render path.
     *
     * OUTPUT_APPLIED's commit point: the command parsed (the channel already
     * validated it), its assets resolved — or the documented fallback of
     * rendering without them was selected — and the graphic was handed to
     * React state for rendering. A superseded request (a newer SHOW arrived
     * while assets loaded) is never acknowledged: it was not applied.
     */
    const applyMessage = (message: RealtimeMessage) => {
      if (message.type === 'SHOW_GRAPHIC') {
        const graphic = message.payload as GraphicInstance;
        /**
         * IS THIS COMMAND ADDRESSED TO THIS SCREEN?
         *
         * The split and house scenes are compositions built around scripture —
         * a camera squeezed to one side, or a wall in a field. A lower third
         * arriving in that column does not replace the graphic, it dismantles
         * the scene, and the operator who sent it was addressing the stream.
         *
         * A screen that is not addressed does NOTHING: it keeps what it has,
         * and it sends no acknowledgement. Staying silent is the load-bearing
         * half — `OUTPUT_APPLIED` means "I put this on screen", so a screen
         * that ignored the command must not confirm the Take on behalf of one
         * that did. Program is confirmed by the screens that actually rendered
         * it, which is what makes the desk's reading true.
         */
        if (!screenRenders(screen, graphic.templateId)) return;
        const ackApplied = () =>
          sendOutputEvent(
            createOutputEvent('OUTPUT_APPLIED', {
              commandId: message.id,
              outputId: getOutputSessionId(),
              graphicId: graphic.id,
              templateId: graphic.templateId
            })
          );
        // A template this build cannot render is a real failure the operator
        // must hear about — the output stays transparent for this graphic.
        if (!templateRendererMap[graphic.templateId]) {
          sendOutputEvent(
            createOutputEvent('OUTPUT_FAILED', {
              commandId: message.id,
              outputId: getOutputSessionId(),
              graphicId: graphic.id,
              reason: `Template "${graphic.templateId}" is not available in this build`
            })
          );
          return;
        }
        const elapsed = Date.now() - message.timestamp;
        if (graphic.durationSeconds > 0 && elapsed >= graphic.durationSeconds * 1000) {
          setShowing(false);
          setActiveGraphic(null);
          // Applied per the command's own auto-hide semantics: the graphic's
          // window had already passed, so committing "nothing" IS honouring it.
          ackApplied();
          return;
        }
        const requestId = showRequestId.current + 1;
        showRequestId.current = requestId;
        revokeResolvedAssets();
        prepareGraphic(graphic)
          .then((prepared) => {
            if (showRequestId.current !== requestId) return;
            setActiveGraphic(prepared);
            setShowing(true);
            ackApplied();
          })
          .catch(() => {
            if (showRequestId.current !== requestId) return;
            // Documented fallback: render without the resolved assets rather
            // than dropping the graphic. Applied, minus its images.
            setActiveGraphic(graphic);
            setShowing(true);
            ackApplied();
          });
      }
      if (message.type === 'HIDE_GRAPHIC' || message.type === 'CLEAR_ALL') {
        showRequestId.current += 1;
        setShowing(false);
        sendOutputEvent(
          createOutputEvent('OUTPUT_CLEARED', {
            commandId: message.id,
            outputId: getOutputSessionId()
          })
        );
      }
      if (message.type === 'SET_SCRIPTURE_OUTPUTS') {
        // Configuration, not a command: it changes how a scripture card is
        // painted here, never what is on air. Nothing is acknowledged, because
        // there is no command to acknowledge and an ack would be a claim about
        // a graphic this message says nothing about.
        setScriptureOutputs(sanitizeScriptureOutputs(message.payload));
      }
      // OUTPUT_* events (including this page's own, echoed back by the
      // transports) carry no rendering instruction and fall through untouched.
    };

    const channel = createOutputChannel(applyMessage);
    const last = loadLastRealtimeMessage();
    if (last?.type === 'SHOW_GRAPHIC') {
      applyMessage(last);
    }

    return () => {
      channel.close();
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
      }
      revokeResolvedAssets();
    };
  }, []);

  /**
   * Presence heartbeat + host-source state. OUTPUT_STATUS goes out immediately,
   * on every accepted OBS Browser binding event (`window.obsstudio`, see
   * `lib/obsSource.ts`), and then every OUTPUT_HEARTBEAT_MS — deliberately slow;
   * this page shares a CPU with an encoder. When the page dies the heartbeats
   * stop, and controls derive UNVERIFIED from the silence (`outputPresence`).
   * Without the binding, `sourceActive` stays null: hosted-by-OBS is the only
   * thing that can claim an OBS source state.
   */
  useEffect(() => {
    const source = { sourceActive: null as boolean | null, sourceVisible: null as boolean | null };
    const sendStatus = () =>
      sendOutputEvent(
        createOutputEvent('OUTPUT_STATUS', {
          outputId: getOutputSessionId(),
          sourceActive: source.sourceActive,
          sourceVisible: source.sourceVisible,
          // Which screen this is, so a desk watching two browser sources can
          // name the one that stopped instead of reporting a session id.
          screen,
          // Read at send time, not captured once: an OBS binding can arrive
          // after this page mounted, and a page that says "not hosted" forever
          // because of when it happened to load would be its own small lie.
          hosted: obsHostPresent()
        })
      );
    // The subscription emits the initial (unknown) state synchronously, which
    // doubles as the "output page is here" first heartbeat.
    const unsubscribe = subscribeObsSourceState(
      (state) => {
        source.sourceActive = state.sourceActive;
        source.sourceVisible = state.sourceVisible;
        sendStatus();
      },
      undefined,
      // `debugMode` is read once from the URL and never changes for this page,
      // so this effect stays mount-once.
      debugMode ? setBridge : undefined
    );
    const timer = window.setInterval(sendStatus, OUTPUT_HEARTBEAT_MS);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  /**
   * Host-signal diagnostics (`lib/obsHostDiagnostics.ts`), under ?debug=1 only.
   *
   * Its OWN effect and its OWN state, deliberately not folded into the presence
   * effect above: that effect's callback calls `sendStatus()`, and sharing it is
   * precisely how a diagnostic reading turns into Program truth by accident.
   * Nothing here sends, and nothing here writes `source`.
   */
  useEffect(() => {
    // `debugMode` is read once from the URL and never changes for this page.
    if (!debugMode) return;
    return subscribeObsHostDiagnostics(setHostSignals);
  }, []);

  useEffect(() => {
    // Always cancel any pending timer first. A SHOW arriving while an
    // unmount timer is pending (e.g. restore-on-refresh) must cancel it,
    // otherwise the new graphic gets unmounted mid-show.
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!showing) {
      if (!activeGraphic) return;
      // Unmount after the CSS exit transition (GFX_OUT_MS) plus a small buffer.
      hideTimer.current = window.setTimeout(() => {
        setActiveGraphic(null);
        revokeResolvedAssets();
      }, GFX_OUT_MS + 80);
      return;
    }

    const durationSeconds = activeGraphic?.durationSeconds ?? 0;
    if (durationSeconds > 0) {
      hideTimer.current = window.setTimeout(() => setShowing(false), durationSeconds * 1000);
    }
  }, [showing, activeGraphic]);

  const resolved = useMemo(() => {
    if (!activeGraphic) return null;
    const Renderer = templateRendererMap[activeGraphic.templateId];
    if (!Renderer) return null;
    const definition = templateRegistry.find((item) => item.id === activeGraphic.templateId);
    const theme: TemplateTheme = { ...(definition?.theme ?? FALLBACK_THEME), ...activeGraphic.theme };
    const anim = resolveAnimationVariant(definition?.animation, activeGraphic.animationOverride);
    return { Renderer, theme, anim };
  }, [activeGraphic]);
  /**
   * Program resolves from the context its own Take captured — never from
   * anything the control surface currently believes. That is the whole reason
   * `dynamicContext` rides inside the instance.
   */
  const renderedValues = useDynamicValues(
    activeGraphic?.values ?? EMPTY_VALUES,
    activeGraphic?.dynamicContext
  );

  /**
   * THE SCRIPTURE-ONLY GATE (`lib/scriptureOutputs.ts#resolveScreenValues`).
   *
   * Shared with the Screens page preview rather than written twice: a preview
   * that resolved the look its own way would show the operator something no
   * screen is rendering the moment the two drifted.
   *
   * Applied to the values handed to the RENDERER only — `activeGraphic` is
   * untouched, so `OUTPUT_APPLIED` still acknowledges the command as it was
   * sent and Recent, presets and the rundown keep the look the operator picked.
   */
  const outputValues = useMemo(
    () =>
      // Hidden fields are blanked at the render boundary — one place, every
      // template, and the stored graphic keeps the words (`lib/fieldVisibility.ts`).
      applyFieldVisibility(
        resolveScreenValues(activeGraphic?.templateId, renderedValues, screen, scriptureOutputs)
      ),
    [activeGraphic?.templateId, renderedValues, screen, scriptureOutputs]
  );

  useEffect(() => {
    if (!activeGraphic) return;
    if (!templateRendererMap[activeGraphic.templateId]) {
      console.warn(`[LiveLayer] Template "${activeGraphic.templateId}" is not available in this build. Output will stay transparent for this graphic.`);
    }
  }, [activeGraphic?.templateId]);

  return (
    <div className="output-root">
      <GraphicStage theme={resolved?.theme} backdrop="transparent" showSafeAreas={debugMode}>
        {resolved && activeGraphic ? (
          <div
            key={activeGraphic.id}
            className="gfx-layer"
            data-anim={resolved.anim}
            data-state={showing ? 'in' : 'out'}
            data-size={activeGraphic.layout?.size}
            data-position={activeGraphic.layout?.position}
            data-density={activeGraphic.layout?.density}
            data-safe-margin={activeGraphic.layout?.safeMargin}
            /**
             * WHICH SCREEN THIS IS, in the DOM, so a layout can differ per
             * screen without a renderer knowing screens exist.
             *
             * The main scene composites a ticker across the foot of frame, and
             * scripture's bottom-anchored variants sat inside it — the verse cut
             * through the bar. The scripture SCREENS have no ticker, so the
             * offset must not follow the card there, and the only thing that
             * can tell them apart at render time is this.
             */
            data-screen={screen}
          >
            <resolved.Renderer values={outputValues} theme={resolved.theme} />
          </div>
        ) : null}
      </GraphicStage>
      {debugMode ? (
        <div className="gfx-debug-chip">
          <div>DEBUG MODE</div>
          <div>Template: {activeGraphic?.templateId ?? 'none'}</div>
          <div>Screen: {screen}</div>
          <div>Scripture look: {scriptureOutputs[screen]}</div>
          <div>Duration: {activeGraphic?.durationSeconds ?? 0}s</div>
          <div>{showing ? 'Visible' : 'Hidden'}</div>
          <div>OBS binding: {bridge?.binding ?? 'waiting'}</div>
          <div>OBS plugin: {bridge?.pluginVersion ?? 'unknown'}</div>
          <div>active event: {eventLabel(bridge?.activeEvent)}</div>
          <div>visible event: {eventLabel(bridge?.visibleEvent)}</div>
          <div>last event path: {bridge?.lastPath ?? 'none'}</div>
          <div>page visibility: {hostSignals?.visibilityState ?? 'unknown'}</div>
          <div>document.hidden: {hostSignals ? String(hostSignals.hidden) : 'unknown'}</div>
          <div>visibility changes: {hostSignals?.visibilityChanges ?? 0}</div>
          <div>hidden ever seen: {hostSignals?.hiddenSeen ? 'yes' : 'no'}</div>
          <div>last visibility change: {clockLabel(hostSignals?.lastVisibilityChangeAt)}</div>
          <div>scene events: {hostSignals?.sceneEvents ?? 0}</div>
          <div>last scene event: {sceneLabel(hostSignals)}</div>
        </div>
      ) : null}
    </div>
  );
}
