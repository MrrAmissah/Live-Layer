import { useEffect, useState } from 'react';
import {
  EMPTY_SERVICE_CONTEXT,
  loadServiceContext,
  saveServiceContext,
  serviceDynamicContext,
  type ServiceContext
} from '../lib/serviceContext';

/**
 * The service being prepared, shared by every authoring surface.
 *
 * A tiny module-level store rather than a slice of the main LiveLayer store,
 * for the same reason dock preferences are: nothing here touches graphics,
 * Program or packs, and the main store is already the largest file in the app.
 * Subscribers are notified so the Preview retimes the moment the operator
 * changes the start time.
 */
let current: ServiceContext = { ...EMPTY_SERVICE_CONTEXT };
let loaded = false;
const listeners = new Set<(context: ServiceContext) => void>();

function read(): ServiceContext {
  if (!loaded) {
    current = loadServiceContext();
    loaded = true;
  }
  return current;
}

export function setServiceContext(next: ServiceContext) {
  current = next;
  loaded = true;
  saveServiceContext(next);
  listeners.forEach((listener) => listener(next));
}

/** Read-once accessor for non-React callers (the Take snapshot path). */
export function getServiceContext(): ServiceContext {
  return read();
}

export function useServiceContext(): ServiceContext {
  const [context, setContext] = useState<ServiceContext>(read);
  useEffect(() => {
    listeners.add(setContext);
    setContext(read());
    return () => {
      listeners.delete(setContext);
    };
  }, []);
  return context;
}

/** What Preview resolves against — `undefined` when no real time is configured. */
export function useServiceDynamicContext(): { eventDateTime: string } | undefined {
  return serviceDynamicContext(useServiceContext());
}
