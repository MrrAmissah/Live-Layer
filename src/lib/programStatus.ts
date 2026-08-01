import type { ProgramState } from '../types/program';

/**
 * The one place Program status becomes words.
 *
 * The vocabulary is deliberately careful: control publishes commands and cannot
 * know what output painted, so nothing here may read as a confident,
 * acknowledged "live" (see `types/program.ts`). `showing` means we sent it and
 * are awaiting output, not that output confirmed it.
 *
 * Shared because the studio now shows this in two places — the Program rail and
 * the sticky strip the stacked layout needs — and two copies of a vocabulary
 * this careful is exactly how a surface starts claiming more than it knows.
 */
export interface ProgramStatusWords {
  /** Compact uppercase pill. */
  pill: 'SENT' | 'UNVERIFIED' | 'FAILED' | 'CLEAR';
  /** Sentence-case phrase for surfaces with room. */
  phrase: 'Awaiting output' | 'Not confirmed' | 'Send failed' | 'Clear';
}

export function describeProgramStatus(program: Pick<ProgramState, 'status'>): ProgramStatusWords {
  switch (program.status) {
    case 'showing':
      return { pill: 'SENT', phrase: 'Awaiting output' };
    case 'recovering':
      return { pill: 'UNVERIFIED', phrase: 'Not confirmed' };
    case 'failed':
      return { pill: 'FAILED', phrase: 'Send failed' };
    default:
      return { pill: 'CLEAR', phrase: 'Clear' };
  }
}
