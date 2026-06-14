import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_DYNAMIC_FIELD_CONTEXT,
  getNextDynamicUpdateDelay,
  resolveDynamicValueMap
} from '../lib/dynamicFields';
import type { DynamicFieldContext } from '../types/dynamicFields';

export function useDynamicValues(
  values: Record<string, string>,
  context?: Partial<Omit<DynamicFieldContext, 'now'>>
) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;
    let active = true;

    const schedule = () => {
      const current = new Date();
      const delay = getNextDynamicUpdateDelay(values, current);
      if (!delay) return;
      timer = window.setTimeout(() => {
        if (!active) return;
        setNow(new Date());
        schedule();
      }, delay);
    };

    setNow(new Date());
    schedule();

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [values]);

  return useMemo(() => resolveDynamicValueMap(values, {
    now,
    locale: context?.locale ?? DEFAULT_DYNAMIC_FIELD_CONTEXT.locale,
    use24Hour: context?.use24Hour ?? DEFAULT_DYNAMIC_FIELD_CONTEXT.use24Hour,
    eventDateTime: context?.eventDateTime
  }), [values, now, context?.locale, context?.use24Hour, context?.eventDateTime]);
}
