import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { workLogApi } from "../../api/worklog";
import { useAuthStore } from "../../api/auth-store";
import type {
  StartWorkParams,
  WorkLogCreatePayload,
  WorkLogUpdatePayload,
  WorkLogApprovalParams,
} from "../../api/worklog-types";
import { parseWorkLogId, validWorkLogId } from "../../worklog-form";
import {
  normalizeWorkLogList,
  validWorkLogScope,
  workLogExportSnapshot,
  type WorkLogListParams,
} from "../../worklog-io";
import { queryKeys } from "../keys";
export function useWorkLogList(params: WorkLogListParams = {}, open = true) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const normalized = normalizeWorkLogList(params);
  return useQuery({
    queryKey: queryKeys.workLog.list(normalized),
    enabled: authenticated && open && validWorkLogScope(normalized),
    queryFn: () => {
      const { scope, scopeId, request } = normalized;
      if (!useAuthStore.getState().isAuthenticated) throw new Error("请登录后查看工时管理");
      if (!validWorkLogScope(normalized)) throw new Error("请选择有效项目与范围");
      switch (scope) {
        case "user":
          return workLogApi.findByUser(scopeId!, request);
        case "task":
          return workLogApi.findByTask(scopeId!, request);
        case "project":
          return workLogApi.findByProject(scopeId!, request);
        case "sprint":
          return workLogApi.findBySprint(scopeId!, request);
        default:
          return workLogApi.findByPage(request);
      }
    },
  });
}
export function useWorkLogDetail(id?: number | null, open = true) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.workLog.detail(id ?? 0),
    enabled: authenticated && open && validWorkLogId(id),
    staleTime: 0,
    queryFn: () => {
      if (!useAuthStore.getState().isAuthenticated) throw new Error("请登录后查看工时管理");
      requireId(id);
      return workLogApi.getById(id!);
    },
  });
}
function requireId(id: unknown): asserts id is number {
  if (!validWorkLogId(id)) throw new Error("记录 ID 无效");
}
export function currentWorkLogUserId() {
  const state = useAuthStore.getState();
  const id = parseWorkLogId(state.user?.userId);
  if (!state.isAuthenticated || !id) throw new Error("当前登录身份无效，请重新登录");
  return id;
}
export function invalidateWorkLogMutation(
  client: QueryClient,
  id: number,
  projectId?: number | null,
  recalculate = false,
) {
  void client.invalidateQueries({
    queryKey: queryKeys.workLog.all,
    predicate: (q) => ["list", "analytics", "statisticsGroup"].includes(String(q.queryKey[2])),
  });
  void client.invalidateQueries({ queryKey: queryKeys.workLog.detail(id) });
  if (!recalculate) return;
  void client.invalidateQueries({ queryKey: queryKeys.task.all });
  if (validWorkLogId(projectId))
    for (const key of [
      queryKeys.project.detail(projectId),
      queryKeys.project.dashboard(projectId),
      queryKeys.project.progress(projectId),
    ])
      void client.invalidateQueries({ queryKey: key });
  else void client.invalidateQueries({ queryKey: queryKeys.project.all });
  void client.invalidateQueries({ queryKey: queryKeys.project.statistics() });
  void client.invalidateQueries({
    queryKey: queryKeys.project.all,
    predicate: (q) => q.queryKey[2] === "dashboardCompare",
  });
  void client.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  void client.invalidateQueries({ queryKey: queryKeys.dashboardWidget.all });
}
function useNewWorkLog<T>(fn: (data: T) => Promise<number>) {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (data: T) => {
      currentWorkLogUserId();
      const id = await fn(data);
      if (!validWorkLogId(id)) throw new Error("创建响应异常：未返回有效工时记录 ID");
      return id;
    },
    onSuccess: (id) => invalidateWorkLogMutation(client, id),
  });
}
export function useCreateWorkLog() {
  return useNewWorkLog((data: WorkLogCreatePayload) => workLogApi.createWorkLog(data));
}
export function useStartWork() {
  return useNewWorkLog((data: Omit<StartWorkParams, "userId">) =>
    workLogApi.startWork({
      taskId: data.taskId,
      workDescription: data.workDescription,
      workType: data.workType,
      userId: currentWorkLogUserId(),
    }),
  );
}
function useWorkLogMutation<T>(
  fn: (data: T) => Promise<string>,
  getId: (data: T) => number,
  projectId?: number | null,
  recalculate = true,
) {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (data: T) => {
      currentWorkLogUserId();
      requireId(getId(data));
      return fn(data);
    },
    onSuccess: (_response, data) =>
      invalidateWorkLogMutation(client, getId(data), projectId, recalculate),
  });
}
export const useUpdateWorkLog = (projectId?: number | null) =>
  useWorkLogMutation(
    (data: WorkLogUpdatePayload) => workLogApi.updateWorkLog(data),
    (data) => data.id,
    projectId,
  );
export const useInvalidWorkLog = (projectId?: number | null) =>
  useWorkLogMutation(workLogApi.invalidWorkLog, (id) => id, projectId);
export const usePauseWork = (projectId?: number | null) =>
  useWorkLogMutation(workLogApi.pauseWork, (id) => id, projectId, false);
export const useCompleteWork = (projectId?: number | null) =>
  useWorkLogMutation(workLogApi.completeWork, (id) => id, projectId);
export interface WorkLogApprovalInput {
  id: number;
  comment?: string;
}
export const useApproveWorkLog = (projectId?: number | null) =>
  useWorkLogMutation(
    (data: WorkLogApprovalInput) =>
      workLogApi.approveWorkLog(data.id, {
        approverId: currentWorkLogUserId(),
        comment: data.comment,
      } satisfies WorkLogApprovalParams),
    (data) => data.id,
    projectId,
  );
export const useRejectWorkLog = (projectId?: number | null) =>
  useWorkLogMutation(
    (data: WorkLogApprovalInput) =>
      workLogApi.rejectWorkLog(data.id, {
        approverId: currentWorkLogUserId(),
        comment: data.comment,
      }),
    (data) => data.id,
    projectId,
  );
/** POST workLog/v1/batchImport 尚不可用：业务入口保持禁用，避免 service 空成功污染缓存。 */
export function useBatchImportWorkLogs() {
  return useMutation({
    retry: false,
    mutationFn: async (_payload: unknown): Promise<string> => {
      throw new Error("批量导入暂不可用");
    },
  });
}
export function useExportWorkLogs() {
  return useMutation({
    retry: false,
    mutationFn: (params: WorkLogListParams) => {
      currentWorkLogUserId();
      return workLogApi.exportWorkLogs(workLogExportSnapshot(params));
    },
  });
}
