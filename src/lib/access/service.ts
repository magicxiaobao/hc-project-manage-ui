import type { QueryClient } from "@tanstack/react-query";
import { authApi, isCanonicalUserId } from "../api/auth";
import { getSessionGeneration, useAuthStore } from "../api/auth-store";
import { api, HttpResponseError } from "../api/client";
import { systemApi } from "../api/system";
import type { MenuResponse } from "../api/system-types";
import { queryKeys } from "../query/keys";
import { deriveSnapshot, validateUser, type AccessSnapshot } from "./snapshot";
import { getAccessSnapshot, publishAccess, suspendAccess, subscribeAccess } from "./store";

let client: QueryClient | null = null;
let inflight: {
  generation: number;
  userId: string;
  promise: Promise<AccessSnapshot>;
  queryClient: QueryClient;
} | null = null;
let round = 0;
let lastReady: AccessSnapshot | null = null;

const isForbidden = (error: unknown): boolean =>
  error instanceof HttpResponseError && error.httpStatus === 403;

export class AccessLoadError extends Error {
  constructor() {
    super("权限信息加载失败，请重试");
    this.name = "AccessLoadError";
  }
}
export function setAccessQueryClient(value: QueryClient | null): void {
  client = value;
}
export function isAccessQuery(query: { queryKey: readonly unknown[] }): boolean {
  return (query.queryKey[3] as { kind?: string } | undefined)?.kind === "accessSnapshot";
}
export async function refreshAccess({
  force = false,
  reason = "navigation",
  queryClient = client,
}: {
  force?: boolean;
  reason?: string;
  queryClient?: QueryClient | null;
} = {}): Promise<AccessSnapshot> {
  const auth = useAuthStore.getState(),
    generation = getSessionGeneration(),
    userId = auth.user?.userId;
  if (!auth.isAuthenticated) throw new AccessLoadError();
  if (!isCanonicalUserId(userId)) {
    publishAccess({ ...getAccessSnapshot(), status: "error", error: new Error("用户 ID 无效") });
    throw new AccessLoadError();
  }
  if (inflight?.generation === generation && inflight.userId === userId) {
    if (!(force && reason === "authorization-change")) return inflight.promise;
    // A successful write may postdate the active read. Discard that read before reusing its key.
    const previousClient = inflight.queryClient;
    inflight = null;
    round += 1;
    await previousClient.cancelQueries({ predicate: isAccessQuery });
    previousClient.removeQueries({ predicate: isAccessQuery });
    return refreshAccess({ force, reason, queryClient });
  }
  const current = getAccessSnapshot();
  if (
    !force &&
    current.status === "ready" &&
    current.userId === userId &&
    current.sessionGeneration === generation &&
    Date.now() - current.fetchedAt < 30_000
  )
    return current;
  if (!queryClient) throw new AccessLoadError();
  const sequence = ++round;
  const stillCurrent = () =>
    sequence === round &&
    generation === getSessionGeneration() &&
    useAuthStore.getState().isAuthenticated &&
    useAuthStore.getState().user?.userId === userId;
  suspendAccess(userId, generation);
  // promiseRef 打破 TS 对“赋值前使用”的判定：async IIFE 在首个 await
  // 之前没有退出路径，finally 不可能在 promise 赋值前执行。
  const promiseRef: { current: Promise<AccessSnapshot> | null } = { current: null };
  const promise: Promise<AccessSnapshot> = (async () => {
    try {
      const result = await queryClient.fetchQuery({
        queryKey: queryKeys.system.list({
          kind: "accessSnapshot",
          userId,
          sessionGeneration: generation,
        }),
        staleTime: 0,
        retry: false,
        queryFn: async ({ signal }) => {
          const user = validateUser(await authApi.getCurrentUser({ signal }));
          if (!stillCurrent() || signal.aborted) throw new AccessLoadError();
          if (user.userId !== userId) throw new Error("当前用户 ID 不匹配");
          useAuthStore.getState().acceptVerifiedUser(user, generation);
          // getMenuTreeByUser 需要 system:admin 权限，普通用户会 403。
          // 降级为空菜单：menu 策略页面按无授权拒绝，但 authenticated 页面不受影响。
          let menus: MenuResponse[] = [];
          try {
            menus = await systemApi.menu.getMenuTreeByUser(Number(user.userId), { signal });
          } catch (error) {
            if (!isForbidden(error)) throw error;
          }
          if (!stillCurrent() || signal.aborted) throw new AccessLoadError();
          return deriveSnapshot(user, menus);
        },
      });
      if (!stillCurrent()) throw new AccessLoadError();
      const previous = lastReady?.sessionGeneration === generation ? lastReady : null;
      const next: AccessSnapshot = {
        ...result,
        userId,
        sessionGeneration: generation,
        revision:
          getAccessSnapshot().revision + (previous?.fingerprint === result.fingerprint ? 0 : 1),
        status: "ready",
        fetchedAt: Date.now(),
        error: null,
      };
      lastReady = next;
      publishAccess(next, reason);
      return getAccessSnapshot();
    } catch (error) {
      if (stillCurrent())
        publishAccess({
          ...getAccessSnapshot(),
          status: "error",
          error: error instanceof Error ? error : new AccessLoadError(),
        });
      throw new AccessLoadError();
    } finally {
      if (inflight?.promise === promiseRef.current) inflight = null;
    }
  })();
  promiseRef.current = promise;
  inflight = { generation, userId, promise, queryClient };
  return promise;
}
/** Mutations/events are best effort; failure stays visible in the shared error snapshot. */
export function requestAccessRefresh(reason: string): void {
  if (useAuthStore.getState().isAuthenticated)
    void refreshAccess({ force: true, reason }).catch(() => {});
}
api.setPermissionDeniedHandler(() => {
  // Do not loop on a denial of /me or the user menu request itself.
  if (getAccessSnapshot().status === "ready") requestAccessRefresh("permission-denied");
});

// Session cleanup works even while the root is still waiting for its first beforeLoad.
subscribeAccess(() => {
  if (getAccessSnapshot().status !== "idle") return;
  round += 1;
  const activeClient = inflight?.queryClient ?? client;
  inflight = null;
  lastReady = null;
  if (activeClient) {
    void activeClient.cancelQueries({ predicate: isAccessQuery });
    activeClient.removeQueries({ predicate: isAccessQuery });
  }
});
