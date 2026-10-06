import { freeze, readonlySet, type AccessSnapshot } from "./snapshot";

function empty(userId: string | null, sessionGeneration: number, revision: number): AccessSnapshot {
  return freeze({
    userId,
    sessionGeneration,
    revision,
    status: "idle",
    fetchedAt: 0,
    authorities: readonlySet<string>([]),
    menuTree: [],
    routeAccessIndex: [],
    visibleNavigation: [],
    definitions: [],
    grantedCodes: readonlySet<string>([]),
    diagnostics: [],
    error: null,
    fingerprint: "",
  });
}
let snapshot = empty(null, 0, 0);
const listeners = new Set<() => void>();
export const getAccessSnapshot = () => snapshot;
export function subscribeAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
let publicationReason = "session";
export const getPublicationReason = () => publicationReason;
export function publishAccess(next: AccessSnapshot, reason = "session"): void {
  publicationReason = reason;
  snapshot = freeze(next);
  listeners.forEach((listener) => listener());
}
/** Called synchronously by every auth lifecycle boundary, before any remote logout. */
export function resetAccess(userId: string | null, sessionGeneration: number): void {
  publishAccess(empty(userId, sessionGeneration, snapshot.revision + 1));
}
export function suspendAccess(userId: string, sessionGeneration: number): void {
  publishAccess({ ...empty(userId, sessionGeneration, snapshot.revision), status: "loading" });
}
