import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { AS_CHOSEN, SCRIPTURE_OUTPUT_SCREENS } from '../../lib/scriptureOutputs';
import { templateRegistry } from '../templates/registry';
import { SCRIPTURE_TEMPLATE_ID } from '../../lib/graphicReadiness';
import { Icon } from '../../lib/icons';

/**
 * Scripture Outputs — the setup, not a URL trick.
 *
 * The operator asked for what the pro tools do: set the verse once and let the
 * split screen render its own look, instead of switching variants mid-service.
 * Two halves make that true, and one without the other is the hack he did not
 * want — the browser source's URL says WHICH screen it is, and this panel says
 * what each screen LOOKS like.
 *
 * Showing the URL beside each row is the point of the panel. It is the only
 * place the mapping is visible: an operator staring at a split scene rendering
 * the wrong card needs to see that this row and that OBS source are the same
 * thing, and no error message can tell them that.
 *
 * SCRIPTURE ONLY. The picker lists `scripture-card`'s variants because the look
 * applies to scripture cards and nothing else — every other template renders
 * the variant the operator chose, untouched (`lib/scriptureOutputs.ts`).
 */
export default function ScriptureOutputsPanel() {
  const outputs = useLiveLayerStore((state) => state.scriptureOutputs);
  const setScriptureOutput = useLiveLayerStore((state) => state.setScriptureOutput);
  const variants = templateRegistry.find((template) => template.id === SCRIPTURE_TEMPLATE_ID)?.variants ?? [];

  return (
    <div className="scr-out">
      <p className="dock-set__hint scr-out__intro">
        Each OBS browser source renders scripture its own way. Point a source at the address
        shown and it stays that screen — nothing to switch while a verse is on air.
      </p>
      {SCRIPTURE_OUTPUT_SCREENS.map((screen) => (
        <div className="scr-out__row" key={screen.id}>
          <span className="scr-out__label">
            <span className="scr-out__name">{screen.name}</span>
            <span className="scr-out__url">{screen.url}</span>
          </span>
          <span className="ls-select scr-out__select">
            <select
              value={outputs[screen.id]}
              aria-label={`${screen.name} scripture look`}
              onChange={(event) => setScriptureOutput(screen.id, event.target.value)}
            >
              {/* First, and the default for the main screen: a screen set to
                  this renders exactly what the operator picked on the graphic,
                  so presets and rundown items keep their own look. */}
              <option value={AS_CHOSEN}>Use the graphic&rsquo;s own look</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={15} />
          </span>
          <span className="scr-out__hint">{screen.hint}</span>
        </div>
      ))}
    </div>
  );
}
