import type { OutputStatusMap, OutputStatusState, ProgramState } from '../types/program';
import { outputPresence, stalledOutputs } from './outputPresence';
import { screenDisplayName } from './scriptureOutputs';

/**
 * The one place Program status becomes words.
 *
 * The vocabulary is still deliberately careful, and each claim states exactly
 * what evidence backs it:
 *
 *  - SENT             — we published the command; nothing has answered yet.
 *  - OUTPUT READY     — the output PAGE acknowledged applying this exact
 *                       command (`commandId` matched). It says nothing about
 *                       whether an OBS source is compositing that page.
 *  - OUTPUT ACTIVE    — additionally, the page's host binding reported the
 *                       source active, and that reading is fresh.
 *  - SOURCE HIDDEN    — the page applied it and the source may even be active,
 *                       but the host says it is hidden (the OBS eye is off), so
 *                       nothing of it is reaching the scene. Checked BEFORE
 *                       active, because a hidden source can still report
 *                       `sourceActive: true` and calling that ACTIVE was the
 *                       defect a real OBS test found.
 *  - SOURCE INACTIVE  — the page applied it, but the host says the source is
 *                       not active (hidden scene, disabled source).
 *  - UNVERIFIED       — we knew something once and can't verify it now
 *                       (reload, or the output heartbeat went stale). A stale
 *                       heartbeat DOWNGRADES ready/active claims — OUTPUT
 *                       ACTIVE must never latch after OBS closes.
 *
 * "LIVE" / "ON AIR" / "Confirmed" remain banned everywhere: even a matched
 * acknowledgement plus an active source is evidence about a page and a source,
 * not about an encoder or a stream.
 *
 * Shared by every Program surface (rail, dock strip, studio live bar) because
 * two copies of a vocabulary this careful is exactly how a surface starts
 * claiming more than it knows.
 */
export interface ProgramStatusWords {
  /** Compact uppercase pill. */
  pill:
    | 'SENT'
    | 'OUTPUT READY'
    | 'OUTPUT ACTIVE'
    | 'SOURCE HIDDEN'
    | 'SOURCE INACTIVE'
    | 'UNVERIFIED'
    | 'FAILED'
    | 'CLEAR';
  /** Sentence-case phrase for surfaces with room. */
  phrase:
    | 'Awaiting output'
    | 'Output page applied the graphic'
    | 'OBS source active'
    | 'OBS source hidden'
    | 'OBS source not active'
    | 'Output status is stale'
    | 'Output couldn’t render it'
    | 'Clearing — awaiting output'
    | 'Not confirmed'
    | 'Send failed'
    | 'Clear';
}

export function describeProgramStatus(
  program: Pick<ProgramState, 'status' | 'confirmation' | 'outputFailure'>,
  output: OutputStatusState | null = null,
  now: number = Date.now()
): ProgramStatusWords {
  switch (program.status) {
    case 'showing': {
      // Output told us it COULDN'T render this command — worth more than any
      // liveness reading, so it is checked first.
      if (program.outputFailure) {
        return { pill: 'FAILED', phrase: 'Output couldn’t render it' };
      }
      if (program.confirmation !== 'confirmed') {
        // No acknowledgement yet — the honest default, exactly as before.
        return { pill: 'SENT', phrase: 'Awaiting output' };
      }
      // Confirmed claims survive only while the output heartbeat is fresh.
      if (outputPresence(output, now) !== 'fresh') {
        return { pill: 'UNVERIFIED', phrase: 'Output status is stale' };
      }
      /**
       * Visibility outranks activity. OBS reports these independently, and
       * toggling the eye leaves `sourceActive: true` while `sourceVisible` goes
       * false — so reading only `sourceActive` kept claiming OUTPUT ACTIVE for a
       * source contributing nothing to the scene. A hidden source is named
       * hidden rather than folded into "inactive", because those are different
       * things for an operator to fix.
       */
      if (output?.sourceVisible === false) {
        return { pill: 'SOURCE HIDDEN', phrase: 'OBS source hidden' };
      }
      if (output?.sourceActive === false) {
        return { pill: 'SOURCE INACTIVE', phrase: 'OBS source not active' };
      }
      if (output?.sourceActive === true) {
        // Active, and visibility is either true or simply not reported.
        return { pill: 'OUTPUT ACTIVE', phrase: 'OBS source active' };
      }
      // No host binding (plain browser tab): the page applied it; active
      // state is unknown and stays unclaimed.
      return { pill: 'OUTPUT READY', phrase: 'Output page applied the graphic' };
    }
    case 'clearing':
      // The clear went out; nothing has confirmed the graphic is gone. Claims
      // nothing, so it needs no staleness downgrade.
      return { pill: 'SENT', phrase: 'Clearing — awaiting output' };
    case 'recovering':
      return { pill: 'UNVERIFIED', phrase: 'Not confirmed' };
    case 'failed':
      return { pill: 'FAILED', phrase: 'Send failed' };
    default:
      return { pill: 'CLEAR', phrase: 'Clear' };
  }
}

/**
 * WHICH screen went quiet — the sentence the pill cannot say.
 *
 * `describeProgramStatus` reduces the whole rig to one phrase, and with several
 * browser sources up that phrase falls to UNVERIFIED without saying which
 * source to go and look at. That is precisely the failure two outputs
 * introduce: the split screen can die mid-service while the main one keeps the
 * heartbeat alive, and "Output status is stale" sends the operator hunting.
 *
 * Returns null while every known screen is reporting, which is the normal case
 * and must render nothing at all — a permanent warning row is a warning nobody
 * reads.
 */
export function describeStalledScreens(outputs: OutputStatusMap, now: number): string | null {
  const stalled = stalledOutputs(outputs, now);
  if (!stalled.length) return null;
  // One is the case worth naming. Beyond that the rig has a bigger problem than
  // which source it is, and listing four names in a status card helps nobody.
  if (stalled.length === 1) return `${screenDisplayName(stalled[0].screen)} has stopped reporting`;
  return `${stalled.length} output screens have stopped reporting`;
}
