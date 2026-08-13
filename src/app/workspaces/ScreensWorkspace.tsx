import WorkspacePanel from './WorkspacePanel';
import ScreenCard from '../../components/control/ScreenCard';
import { SCRIPTURE_OUTPUT_SCREENS } from '../../lib/scriptureOutputs';

/**
 * Screens — the output screens, visible.
 *
 * This began life as a row in the dock's Settings tab, and the operator was
 * right to reject it: *"the setup screens is squeezed into the library, it
 * needs to have its own page/button so the two screen outputs are visible like
 * FreeShow does."* FreeShow gives Stage a top-level tab beside Show and Edit,
 * with panels that show what each output is doing — not a settings sub-page.
 *
 * So this is a workspace, listed beside Studio and Scripture, and every screen
 * is a card carrying the four things a settings row could not:
 *
 *  - **A live preview**, resolved through the same `resolveScreenValues` that
 *    `/output` renders through. Two outputs exist because they DIFFER; a page
 *    that cannot show the difference is a dropdown with extra steps.
 *  - **Its own presence pill.** Every other Program surface reduces the whole
 *    rig to one phrase through `worstOutput`, which is right for a status pill
 *    and useless for finding the screen that died. Here each card answers for
 *    itself, including "Can't render" — which used to be silent on any screen
 *    but the first.
 *  - **The complete address**, copyable, relay included. Making the operator
 *    append `?screen=split` to a relay URL by hand is where a typo becomes a
 *    scene rendering the wrong look, silently, because an unknown screen falls
 *    back to main.
 *  - **The look picker**, next to the preview of what it does.
 *
 * It configures presentation only. Nothing here publishes, and there is no Take
 * on this page — the one command owner stays in `ControlPage`, as it does for
 * every workspace.
 */
export default function ScreensWorkspace() {
  return (
    <WorkspacePanel kicker="Screens">
      <p className="screens-intro">
        Each OBS browser source renders scripture its own way. Point a source at one of the
        addresses below and it stays that screen — nothing to switch while a verse is on air.
      </p>
      <div className="screens-grid">
        {SCRIPTURE_OUTPUT_SCREENS.map((screen) => (
          <ScreenCard key={screen.id} screen={screen} />
        ))}
      </div>
    </WorkspacePanel>
  );
}
