/**
 * How long the live Scripture path actually takes, stage by stage.
 *
 * The 0.649 s figure in `docs/ASR_EVALUATION.md` §9 measured endpointing plus model
 * inference on synthetic audio. The first human microphone test felt slower than
 * that, and it would be — the operator waits for a chain the benchmark never
 * timed: transport to the local service, the parser, a **Bible lookup**, and a
 * render. Optimising before measuring that chain would be guessing at which link
 * is slow.
 *
 * So this records one timeline per utterance and reports the number the operator
 * actually experiences:
 *
 *   **speaker stops → the strongest verse is on screen**
 *
 * ## What it must never do
 *
 * **No transcript, no audio, no passage text.** Timings only. A verbatim transcript
 * of a sermon carries the same content and the same obligations as a recording
 * (§7), and a performance log is exactly the sort of place that leaks in unnoticed.
 * The marks below are numbers and stage names; there is deliberately nowhere to put
 * a string.
 *
 * **No persistence.** Held in memory, bounded, gone when the tab closes.
 */

/** Stages, in the order the operator's audio passes through them. */
export type LatencyStage =
  /** Speech began — the clock the operator actually feels starts here. */
  | 'speech-start'
  /** First provisional transcript for this utterance came back. */
  | 'first-interim'
  /** First Scripture candidate from any revision. */
  | 'first-candidate'
  /** First verse text on screen, provisional or final. */
  | 'first-verse'
  /** Voice activity detected the end of the utterance. */
  | 'endpoint'
  /** PCM handed to the socket. */
  | 'sent'
  /** Transcript came back from the local service. */
  | 'transcript'
  /** Parser produced candidates. */
  | 'candidates'
  /** Bible lookup for the strongest candidate began. */
  | 'lookup-start'
  /** Passage text available. */
  | 'lookup-done'
  /** The strongest verse has been painted. */
  | 'rendered';

export interface UtteranceTimeline {
  id: number;
  /** Monotonic ms, from `performance.now()`. */
  marks: Partial<Record<LatencyStage, number>>;
  /** Model time as reported by the local service, which the browser cannot see. */
  inferenceSeconds?: number;
  /** True when the utterance produced no candidate — timings stop early. */
  refused?: boolean;
}

export interface LatencyBreakdown {
  /** Speech start → first provisional transcript. */
  firstInterimMs: number | null;
  /** Speech start → first Scripture candidate. */
  firstCandidateMs: number | null;
  /** Speech start → first verse on screen. The live-production metric. */
  firstVerseMs: number | null;
  /** Endpoint → the authoritative transcript. */
  finalAfterEndpointMs: number | null;
  /** Endpoint → strongest verse visible, in ms. */
  totalMs: number | null;
  transportMs: number | null;
  recogniseMs: number | null;
  parseMs: number | null;
  lookupMs: number | null;
  renderMs: number | null;
  inferenceMs: number | null;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/** Bounded: a long service must not accumulate timelines without limit. */
const MAX_TIMELINES = 50;

export interface LatencyRecorder {
  /** Open a timeline for a new utterance. Returns its id. */
  begin(): number;
  mark(id: number, stage: LatencyStage, at?: number): void;
  /** Model time the service reported, in seconds. */
  inference(id: number, seconds: number): void;
  refuse(id: number): void;
  breakdown(id: number): LatencyBreakdown | null;
  /** Completed timelines, oldest first. */
  timelines(): UtteranceTimeline[];
  summary(): LatencySummary | null;
  reset(): void;
}

export interface LatencySummary {
  samples: number;
  /** Speech start → first provisional transcript. */
  medianFirstInterimMs: number;
  /** Speech start → first Scripture candidate. */
  medianFirstCandidateMs: number;
  /** Speech start → first verse visible. THE live-production metric. */
  medianFirstVerseMs: number;
  medianTotalMs: number;
  p95TotalMs: number;
  medianRecogniseMs: number;
  medianLookupMs: number;
  medianParseMs: number;
  refusals: number;
}

const gap = (marks: UtteranceTimeline['marks'], from: LatencyStage, to: LatencyStage): number | null => {
  const a = marks[from];
  const b = marks[to];
  return a === undefined || b === undefined ? null : Math.max(0, b - a);
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export function createLatencyRecorder(): LatencyRecorder {
  let nextId = 0;
  let all: UtteranceTimeline[] = [];

  const find = (id: number) => all.find((t) => t.id === id);

  return {
    begin() {
      const id = (nextId += 1);
      all = [...all, { id, marks: {} }].slice(-MAX_TIMELINES);
      return id;
    },
    mark(id, stage, at) {
      const timeline = find(id);
      // First write wins: a stage cannot be re-timed by a late duplicate event.
      if (timeline && timeline.marks[stage] === undefined) timeline.marks[stage] = at ?? now();
    },
    inference(id, seconds) {
      const timeline = find(id);
      if (timeline) timeline.inferenceSeconds = seconds;
    },
    refuse(id) {
      const timeline = find(id);
      if (timeline) timeline.refused = true;
    },
    breakdown(id) {
      const timeline = find(id);
      if (!timeline) return null;
      const { marks } = timeline;
      return {
        // What the operator experiences while speaking.
        firstInterimMs: gap(marks, 'speech-start', 'first-interim'),
        firstCandidateMs: gap(marks, 'speech-start', 'first-candidate'),
        firstVerseMs: gap(marks, 'speech-start', 'first-verse'),
        finalAfterEndpointMs: gap(marks, 'endpoint', 'transcript'),
        totalMs: gap(marks, 'endpoint', 'rendered'),
        transportMs: gap(marks, 'sent', 'transcript'),
        recogniseMs: gap(marks, 'endpoint', 'transcript'),
        parseMs: gap(marks, 'transcript', 'candidates'),
        lookupMs: gap(marks, 'lookup-start', 'lookup-done'),
        renderMs: gap(marks, 'lookup-done', 'rendered'),
        inferenceMs: timeline.inferenceSeconds === undefined ? null : timeline.inferenceSeconds * 1000
      };
    },
    timelines: () => all,
    summary() {
      const done = all.filter((t) => t.marks.rendered !== undefined);
      if (!done.length) return null;
      const totals = done.map((t) => gap(t.marks, 'endpoint', 'rendered') ?? 0);
      const sorted = [...totals].sort((a, b) => a - b);
      const pick = (stage: LatencyStage, to: LatencyStage) =>
        median(done.map((t) => gap(t.marks, stage, to)).filter((n): n is number => n !== null));
      return {
        samples: done.length,
        medianFirstInterimMs: Math.round(pick('speech-start', 'first-interim')),
        medianFirstCandidateMs: Math.round(pick('speech-start', 'first-candidate')),
        medianFirstVerseMs: Math.round(pick('speech-start', 'first-verse')),
        medianTotalMs: Math.round(median(totals)),
        p95TotalMs: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0),
        medianRecogniseMs: Math.round(pick('endpoint', 'transcript')),
        medianLookupMs: Math.round(pick('lookup-start', 'lookup-done')),
        medianParseMs: Math.round(pick('transcript', 'candidates')),
        refusals: all.filter((t) => t.refused).length
      };
    },
    reset() {
      all = [];
      nextId = 0;
    }
  };
}

/**
 * One recorder for the session, reachable from the console during a human test.
 *
 * Deliberately not rendered in the operator UI: a live surface should show the
 * passage, not a stopwatch. `window.__liveLatency.summary()` is how the numbers get
 * read during validation.
 */
export const liveLatency = createLatencyRecorder();

if (typeof window !== 'undefined') {
  (window as unknown as { __liveLatency: LatencyRecorder }).__liveLatency = liveLatency;
}
