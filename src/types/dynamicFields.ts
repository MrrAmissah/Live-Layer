export interface DynamicFieldContext {
  now: Date;
  locale: string;
  eventDateTime?: string;
  use24Hour?: boolean;
}

export type DynamicToken =
  | 'date'
  | 'time'
  | 'weekday'
  | 'month'
  | 'year'
  | 'datetime'
  | 'eventTime'
  | 'countdown';
