import type { DynamicFieldContext, DynamicToken } from '../types/dynamicFields';

const TOKEN_RE = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
const SUPPORTED_TOKENS = new Set<DynamicToken>([
  'date',
  'time',
  'weekday',
  'month',
  'year',
  'datetime',
  'eventTime',
  'countdown'
]);

export const DEFAULT_DYNAMIC_FIELD_CONTEXT = {
  locale: 'en-GH',
  use24Hour: false
};

function normaliseToken(value: string): DynamicToken | null {
  const token = value.trim();
  return SUPPORTED_TOKENS.has(token as DynamicToken) ? (token as DynamicToken) : null;
}

function formatDate(date: Date, context: DynamicFieldContext) {
  return new Intl.DateTimeFormat(context.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatTime(date: Date, context: DynamicFieldContext) {
  return new Intl.DateTimeFormat(context.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !context.use24Hour
  }).format(date);
}

function formatWeekday(date: Date, context: DynamicFieldContext) {
  return new Intl.DateTimeFormat(context.locale, { weekday: 'long' }).format(date);
}

function formatMonth(date: Date, context: DynamicFieldContext) {
  return new Intl.DateTimeFormat(context.locale, { month: 'long' }).format(date);
}

function parseEventDate(context: DynamicFieldContext) {
  if (!context.eventDateTime) return null;
  const date = new Date(context.eventDateTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCountdown(context: DynamicFieldContext) {
  const eventDate = parseEventDate(context);
  if (!eventDate) return 'Starts soon';

  const diffSeconds = Math.max(0, Math.floor((eventDate.getTime() - context.now.getTime()) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `Starts in ${hours}:${mm}:${ss}`;
  }
  return `Starts in ${mm}:${ss}`;
}

function resolveToken(token: DynamicToken, context: DynamicFieldContext) {
  const eventDate = parseEventDate(context);
  switch (token) {
    case 'date':
      return formatDate(context.now, context);
    case 'time':
      return formatTime(context.now, context);
    case 'weekday':
      return formatWeekday(context.now, context);
    case 'month':
      return formatMonth(context.now, context);
    case 'year':
      return String(context.now.getFullYear());
    case 'datetime':
      return `${formatWeekday(context.now, context)} · ${formatTime(context.now, context)}`;
    case 'eventTime':
      return eventDate ? formatTime(eventDate, context) : '10:30 AM';
    case 'countdown':
      return formatCountdown(context);
    default:
      return `{{${token}}}`;
  }
}

export function resolveDynamicFields(input: string, context: DynamicFieldContext): string {
  if (!input) return input;
  return input.replace(TOKEN_RE, (match, rawToken: string) => {
    const token = normaliseToken(rawToken);
    if (!token) return match;
    return resolveToken(token, context);
  });
}

export function hasDynamicFields(input?: string): boolean {
  if (!input) return false;
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(input);
  while (match) {
    if (normaliseToken(match[1])) return true;
    match = TOKEN_RE.exec(input);
  }
  return false;
}

export function hasLiveDynamicFields(input?: string): boolean {
  if (!input) return false;
  return /\{\{\s*(time|datetime|countdown)\s*\}\}/.test(input);
}

export function getDynamicUpdateInterval(values: Record<string, string>): number | null {
  const allValues = Object.values(values);
  if (!allValues.some(hasDynamicFields)) return null;
  if (allValues.some((value) => /\{\{\s*countdown\s*\}\}/.test(value))) return 1000;
  if (allValues.some(hasLiveDynamicFields)) return 60_000;
  return null;
}

export function getNextDynamicUpdateDelay(values: Record<string, string>, now = new Date()): number | null {
  const interval = getDynamicUpdateInterval(values);
  if (!interval) return null;
  if (interval === 1000) return Math.max(100, 1000 - now.getMilliseconds());
  const msUntilNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
  return Math.max(100, msUntilNextMinute);
}

export function resolveDynamicValueMap(
  values: Record<string, string>,
  context: DynamicFieldContext
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, resolveDynamicFields(value, context)])
  );
}
