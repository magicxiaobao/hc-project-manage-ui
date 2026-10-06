import { useSyncExternalStore } from "react";
import { getAccessSnapshot, subscribeAccess } from "../../access/store";
/** Initialized by beforeLoad; components observe the same atomic snapshot. */
export function useAccessSnapshot() {
  return useSyncExternalStore(subscribeAccess, getAccessSnapshot, getAccessSnapshot);
}
