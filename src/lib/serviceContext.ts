import { SERVICE_CONTEXT_KEY } from './storage';

/**
 * The production being prepared: "Sunday Service, 10 August 2026, 10:30".
 *
 * LiveLayer could already prepare a graphic well and had no idea what occasion
 * the graphic belonged to. That gap is why `{{eventTime}}` and `{{countdown}}`
 * could never resolve to anything real — the plumbing existed on
 * `DynamicFieldContext` and nothing ever supplied a value.
 *
 * DELIBERATELY TINY. A name and a start time, because those are the two things
 * the dynamic tokens need and the two an operator can answer without thinking.
 * It is not a calendar, not a schedule, and not a church-management record; the
 * word "service" is a label here, and the shape works equally for a convention
 * session or a conference evening.
 *
 * IT DOES NOT OWN THE EVENT PACK. `activePackId` keeps its own storage and its
 * own single owner. A `service.packId` beside it would be a second authority
 * over the same value, and the two would disagree the first time somebody
 * changed pack outside service setup.
 *
 * TIME IS LOCAL AND STORED AS TYPED. `startAt` holds exactly what the browser's
 * `datetime-local` control produces — `YYYY-MM-DDTHH:mm`, no zone, no offset —
 * because that is what the operator means: half past ten in this building. An
 * ISO instant would be converted on the way in and back on the way out, and
 * every one of those conversions is a chance to move a 10:30 service to 09:30
 * across a DST boundary. This tool runs on the machine in the room; a local
 * wall-clock contract is the honest one, and it round-trips through storage,
 * reload, rundown reuse, Take and the relay without arithmetic.
 */
export interface ServiceContext {
  /** What the operator calls it. May be empty while they are still typing. */
  name: string;
  /** Local wall-clock `YYYY-MM-DDTHH:mm`, or '' when not configured. */
  startAt: string;
}

export const EMPTY_SERVICE_CONTEXT: ServiceContext = { name: '', startAt: '' };

/** `YYYY-MM-DDTHH:mm`, the exact shape `<input type="datetime-local">` emits. */
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * True when the stored time is one the dynamic tokens can actually resolve.
 *
 * Shape alone is not enough: `2026-02-31T10:30` matches the pattern and is not
 * a day. Parsing it back and comparing the parts is what rejects it, and that
 * is what keeps `{{eventTime}}` from rendering `Invalid Date` on air.
 */
export function isConfiguredStart(startAt: string): boolean {
  if (!LOCAL_DATETIME.test(startAt)) return false;
  const [date, time] = startAt.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    parsed.getHours() === hour &&
    parsed.getMinutes() === minute
  );
}

function isServiceContext(value: unknown): value is ServiceContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<ServiceContext>;
  return typeof record.name === 'string' && typeof record.startAt === 'string';
}

export function loadServiceContext(): ServiceContext {
  try {
    const raw = localStorage.getItem(SERVICE_CONTEXT_KEY);
    if (!raw) return { ...EMPTY_SERVICE_CONTEXT };
    const parsed: unknown = JSON.parse(raw);
    if (!isServiceContext(parsed)) return { ...EMPTY_SERVICE_CONTEXT };
    // A stored time that no longer parses is dropped rather than carried
    // forward: an unconfigured service is honest, a broken one renders badly.
    return {
      name: parsed.name,
      startAt: isConfiguredStart(parsed.startAt) ? parsed.startAt : ''
    };
  } catch {
    return { ...EMPTY_SERVICE_CONTEXT };
  }
}

export function saveServiceContext(context: ServiceContext) {
  try {
    localStorage.setItem(SERVICE_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Quota or disabled storage: the context simply does not survive a reload.
  }
}

/**
 * The dynamic-field context a service implies, or `undefined` when there is no
 * real configured time.
 *
 * `undefined` is the whole point. Stage 4C made `{{eventTime}}` and
 * `{{countdown}}` stay visibly unresolved rather than inventing "10:30 AM" and
 * "Starts soon", and that behaviour must survive: a service with no start time
 * configured is still a service, and it must not start manufacturing one.
 */
export function serviceDynamicContext(context: ServiceContext): { eventDateTime: string } | undefined {
  return isConfiguredStart(context.startAt) ? { eventDateTime: context.startAt } : undefined;
}
