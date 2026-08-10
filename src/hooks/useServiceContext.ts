import { useSyncExternalStore } from 'react';
import {
  getServiceContext,
  serviceDynamicContext,
  subscribeServiceContext,
  type ServiceContext
} from '../lib/serviceContext';

/**
 * React binding for the live service. The store itself lives in
 * `lib/serviceContext`, so the non-React Take path reads the same value the
 * operator is looking at rather than a second copy from storage.
 */
export function useServiceContext(): ServiceContext {
  return useSyncExternalStore(subscribeServiceContext, getServiceContext, getServiceContext);
}

/** What Preview resolves against — `undefined` when no real time is configured. */
export function useServiceDynamicContext(): { eventDateTime: string } | undefined {
  return serviceDynamicContext(useServiceContext());
}

export { setServiceContext, getServiceContext } from '../lib/serviceContext';
