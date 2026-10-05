// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
import { queryKeys } from "../keys";
import {
  useWorkLogList,
  useWorkLogDetail,
  useCreateWorkLog,
  useStartWork,
  useUpdateWorkLog,
  useInvalidWorkLog,
  usePauseWork,
  useCompleteWork,
  useApproveWorkLog,
  useRejectWorkLog,
  useBatchImportWorkLogs,
  useExportWorkLogs,
} from "../hooks/useWorkLogs";
import { normalizeWorkLogList } from "@/lib/worklog-io";
const user = {
  userId: "42",
  userName: "当前人",
  roles: [],
  cnName: null,
  extraInfo: {},
  authorities: [],
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
it("无项目/无效 ID/未登录/关闭不请求；手动 refetch 也阻止 bean={}", async () => {
  const api = vi
    .spyOn(workLogApi, "findByPage")
    .mockResolvedValue({ list: [], total: 0, pageNumber: 1, pageSize: 10 });
  const s = setup();
  const h = renderHook(() => useWorkLogList({ projectId: 0 }), s);
  expect(h.result.current.fetchStatus).toBe("idle");
  await act(async () => {
    await h.result.current.refetch();
  });
  expect(api).not.toHaveBeenCalled();
  const bad = renderHook(() => useWorkLogList({ projectId: 7, taskId: 0 }), s);
  expect(bad.result.current.fetchStatus).toBe("idle");
  useAuthStore.setState({ isAuthenticated: false });
  const anonymous = renderHook(() => useWorkLogList({ projectId: 7 }), s);
  expect(anonymous.result.current.fetchStatus).toBe("idle");
  const detail = vi.spyOn(workLogApi, "getById");
  renderHook(() => useWorkLogDetail(9), s);
  expect(detail).not.toHaveBeenCalled();
});
it.each(["all", "user", "task", "project", "sprint"] as const)(
  "%s 端点范围/key/wrapper 一致且不碰撞",
  async (scope) => {
    const methods = {
      all: "findByPage",
      user: "findByUser",
      task: "findByTask",
      project: "findByProject",
      sprint: "findBySprint",
    } as const;
    const api = vi
      .spyOn(workLogApi, methods[scope])
      .mockResolvedValue({ list: [], total: 0, pageNumber: 2, pageSize: 20 });
    const s = setup();
    const params = {
      projectId: 7,
      taskId: 8,
      userId: 42,
      scope,
      scopeId: scope === "all" ? null : scope === "project" ? 7 : 9,
      page: 2,
      pageSize: 20,
    };
    const h = renderHook(() => useWorkLogList(params), s);
    await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    const normalized = normalizeWorkLogList(params);
    expect(api).toHaveBeenCalledWith(
      ...(scope === "all" ? [normalized.request] : [normalized.scopeId, normalized.request]),
    );
    expect(s.client.getQueryData(queryKeys.workLog.list(normalized))).toBeTruthy();
    const keys = ["all", "user", "task", "project", "sprint"].map((scope) =>
      JSON.stringify(queryKeys.workLog.list({ ...normalized, scope })),
    );
    expect(new Set(keys).size).toBe(5);
  },
);
it.each(["createWorkLog", "startWork"] as const)(
  "%s 无效返回不失效，当前身份参数与新详情失效",
  async (method) => {
    const api = vi.spyOn(workLogApi, method).mockResolvedValueOnce(0).mockResolvedValueOnce(11);
    const s = setup();
    const invalidate = vi.spyOn(s.client, "invalidateQueries");
    const h = renderHook(() => (method === "startWork" ? useStartWork() : useCreateWorkLog()), s);
    const input = { projectId: 7, taskId: 8, workDescription: "开始", workType: "开发" };
    await act(async () => {
      await expect(h.result.current.mutateAsync(input)).rejects.toThrow("ID");
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => {
      await h.result.current.mutateAsync(input);
    });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.workLog.detail(11) }),
    );
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.task.all }),
    );
    if (method === "startWork")
      expect(api).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 42 }));
  },
);
it.each(["update", "invalid", "pause", "complete", "approve", "reject"] as const)(
  "%s 失败不失效，成功失效正确的统计链，审批用当前人",
  async (method) => {
    const apiNames = {
      update: "updateWorkLog",
      invalid: "invalidWorkLog",
      pause: "pauseWork",
      complete: "completeWork",
      approve: "approveWorkLog",
      reject: "rejectWorkLog",
    } as const;
    const api = vi
      .spyOn(workLogApi, apiNames[method])
      .mockRejectedValueOnce(new Error("拒绝"))
      .mockResolvedValueOnce("ok");
    const s = setup();
    const invalidate = vi.spyOn(s.client, "invalidateQueries");
    const h = renderHook(
      () => ({
        update: useUpdateWorkLog(7),
        invalid: useInvalidWorkLog(7),
        pause: usePauseWork(7),
        complete: useCompleteWork(7),
        approve: useApproveWorkLog(7),
        reject: useRejectWorkLog(7),
      }),
      s,
    );
    const run = () =>
      method === "update"
        ? h.result.current.update.mutateAsync({ id: 11, workDescription: "编辑" })
        : method === "approve" || method === "reject"
          ? h.result.current[method].mutateAsync({ id: 11, comment: "中文 & + #" })
          : h.result.current[method].mutateAsync(11);
    await act(async () => {
      await expect(run()).rejects.toThrow("拒绝");
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => {
      await run();
    });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.workLog.detail(11) }),
    );
    for (const key of [
      queryKeys.task.all,
      queryKeys.project.detail(7),
      queryKeys.project.dashboard(7),
      queryKeys.project.progress(7),
      queryKeys.project.statistics(),
      queryKeys.dashboard.all,
      queryKeys.dashboardWidget.all,
    ]) {
      if (method === "pause")
        expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: key }));
      else expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: key }));
    }
    if (method === "approve" || method === "reject")
      expect(api).toHaveBeenLastCalledWith(11, { approverId: 42, comment: "中文 & + #" });
  },
);
it("导入守卫不调用空成功 API，导出不失效且捕获快照", async () => {
  const batch = vi.spyOn(workLogApi, "batchImport");
  const exp = vi.spyOn(workLogApi, "exportWorkLogs").mockResolvedValue(null);
  const s = setup();
  const invalidate = vi.spyOn(s.client, "invalidateQueries");
  const h = renderHook(() => ({ batch: useBatchImportWorkLogs(), exp: useExportWorkLogs() }), s);
  await act(async () => {
    await expect(h.result.current.batch.mutateAsync({ items: [] })).rejects.toThrow("暂不可用");
    await h.result.current.exp.mutateAsync({ projectId: 7, userId: 9, page: 5 });
  });
  expect(batch).not.toHaveBeenCalled();
  expect(exp).toHaveBeenCalledWith({ page: 1, pageSize: 10, bean: { projectId: 7, userId: 9 } });
  expect(invalidate).not.toHaveBeenCalled();
});
it("实际缓存失效覆盖所有列表范围/页、目标详情与统计族；无关详情保持有效", async () => {
  vi.spyOn(workLogApi, "completeWork").mockResolvedValue("ok");
  const s = setup();
  const lists = ["all", "user", "task", "project", "sprint"].flatMap((scope) =>
    [1, 2].map((page) =>
      queryKeys.workLog.list({
        scope,
        scopeId: scope === "all" ? null : 9,
        request: { page, pageSize: 10, bean: { projectId: 7 } },
      }),
    ),
  );
  const affected = [
    ...lists,
    queryKeys.workLog.detail(11),
    queryKeys.task.detail(8),
    queryKeys.project.detail(7),
    queryKeys.project.progress(7),
    queryKeys.project.dashboard(7),
    queryKeys.project.statistics(),
    queryKeys.project.dashboardCompare([7, 9]),
    queryKeys.dashboard.detail(3),
    queryKeys.dashboardWidget.detail(4),
  ];
  for (const key of [...affected, queryKeys.workLog.detail(99), queryKeys.project.detail(9)])
    s.client.setQueryData(key, { fixture: true });
  const h = renderHook(() => useCompleteWork(7), s);
  await act(async () => {
    await h.result.current.mutateAsync(11);
  });
  for (const key of affected) expect(s.client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(s.client.getQueryState(queryKeys.workLog.detail(99))?.isInvalidated).toBe(false);
  expect(s.client.getQueryState(queryKeys.project.detail(9))?.isInvalidated).toBe(false);
});
