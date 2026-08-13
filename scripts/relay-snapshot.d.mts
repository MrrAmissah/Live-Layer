/**
 * Hand-written declarations for `relay-snapshot.mjs` (the relay must stay a
 * plain-node script, so the implementation cannot be TypeScript). Keep in sync
 * with the .mjs — `src/lib/relaySnapshot.test.ts` exercises the real runtime
 * behaviour, so a drift here breaks types, not truth.
 */
import type { RealtimeMessage } from '../src/types/graphics';

export interface RelaySnapshot {
  command: RealtimeMessage | null;
  ack: RealtimeMessage | null;
  status: RealtimeMessage | null;
  scriptureOutputs: RealtimeMessage | null;
  outputLastSeenAt: number | null;
}

export type RelayValidation =
  | { ok: true; message: RealtimeMessage }
  | { ok: false; error: string };

export function createRelaySnapshot(): RelaySnapshot;
export function validateRelayMessage(value: unknown): RelayValidation;
export function reduceRelaySnapshot(
  snapshot: RelaySnapshot,
  message: RealtimeMessage,
  now: number
): RelaySnapshot;
export function snapshotReplay(snapshot: RelaySnapshot): RealtimeMessage[];
