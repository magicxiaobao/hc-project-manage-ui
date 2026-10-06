import { matchPage } from "./route-manifest";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useAuthStore } from "../api/auth-store";
import { setQueryCacheClearer } from "../query/session";
import { canAccess } from "./snapshot";
import { getAccessSnapshot, getPublicationReason, subscribeAccess } from "./store";
import { isAccessQuery, requestAccessRefresh, setAccessQueryClient } from "./service";

/** Browser-only lifecycle. QueryClient is owned by this router, never a module singleton. */
export function bindAccessRuntime(router: AnyRouter, queryClient: QueryClient): () => void {
  setAccessQueryClient(queryClient);
  setQueryCacheClearer(() => {
    void queryClient.cancelQueries();
    queryClient.clear();
  });
  let revision = getAccessSnapshot().revision;
  const unsubscribe = subscribeAccess(() => {
    const next = getAccessSnapshot();
    if (next.revision === revision) return;
    revision = next.revision;
    router.clearCache();
    // Revocation/account changes also discard page caches; never reuse another user's data.
    void queryClient.cancelQueries({ predicate: (query) => !isAccessQuery(query) });
    queryClient.removeQueries({ predicate: (query) => !isAccessQuery(query) });
    if (next.status === "idle") {
      void queryClient.cancelQueries({ predicate: isAccessQuery });
      queryClient.removeQueries({ predicate: isAccessQuery });
    }
    // beforeLoad already checks its final target. Recursively invalidating there loops.
    if (getPublicationReason() === "navigation") return;
    queueMicrotask(() => {
      if (getAccessSnapshot() !== next) return;
      const path = router.state.location.pathname;
      if (path === "/login" || path === "/403") {
        void router.invalidate();
        return;
      }
      if (!useAuthStore.getState().isAuthenticated) {
        void router.navigate({
          to: "/login",
          search: { redirect: router.state.location.href },
          replace: true,
          ignoreBlocker: true,
        });
      } else if (next.status === "ready" && matchPage(path) && !canAccess(next, path)) {
        void router.navigate({ to: "/403", replace: true, ignoreBlocker: true });
      } else {
        void router.invalidate();
      }
    });
  });
  const focus = () => requestAccessRefresh("focus");
  const visible = () => {
    if (document.visibilityState === "visible") requestAccessRefresh("visibility");
  };
  const online = () => requestAccessRefresh("online");
  window.addEventListener("focus", focus);
  window.addEventListener("online", online);
  document.addEventListener("visibilitychange", visible);
  return () => {
    unsubscribe();
    setAccessQueryClient(null);
    setQueryCacheClearer(null);
    window.removeEventListener("focus", focus);
    window.removeEventListener("online", online);
    document.removeEventListener("visibilitychange", visible);
  };
}
