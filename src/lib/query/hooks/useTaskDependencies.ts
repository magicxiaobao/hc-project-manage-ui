import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { taskDependencyApi } from "../../api/task-dependency";
import type {
  TaskDependencyCreatePayload,
  TaskDependencyResponse,
} from "../../api/task-dependency-types";
import {
  isPositiveSafeId,
  normalizeDependencyConflicts,
  normalizeDependencyStatistics,
} from "../../task-dependencies-live";
import { queryKeys } from "../keys";
import { toUserMessage } from "../error";

const PAGE_SIZE = 200;
export async function fetchAllTaskDependencies(projectId: number) {
  if (!isPositiveSafeId(projectId)) throw new Error("项目 ID 无效");
  const all: TaskDependencyResponse[] = [];
  for (let page = 1; ; page += 1) {
    const result = await taskDependencyApi.findByPage({
      page,
      pageSize: PAGE_SIZE,
      bean: { projectId },
    });
    if (!Array.isArray(result.list)) throw new Error("响应契约错误：依赖列表应返回数组");
    all.push(...result.list);
    if (result.list.length < PAGE_SIZE) return all;
  }
}
export function useTaskDependencyListAll({
  projectId,
  enabled = true,
}: {
  projectId?: number | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.taskDependency.list({
      all: true,
      projectId: projectId ?? null,
      pageSize: PAGE_SIZE,
    }),
    queryFn: () => fetchAllTaskDependencies(projectId as number),
    enabled: enabled && isPositiveSafeId(projectId),
  });
}
export function useTaskDependencyStatistics(projectId?: number | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.taskDependency.statistics(projectId ?? null),
    queryFn: async () =>
      normalizeDependencyStatistics(await taskDependencyApi.getStatistics(projectId as number)),
    enabled: enabled && isPositiveSafeId(projectId),
  });
}
export function useDependencyConflicts(projectId?: number | null, enabled = false) {
  return useQuery({
    queryKey: queryKeys.taskDependency.conflicts(projectId ?? null),
    queryFn: async () =>
      normalizeDependencyConflicts(await taskDependencyApi.detectConflicts(projectId as number)),
    enabled: enabled && isPositiveSafeId(projectId),
  });
}
export function useTaskPredecessors(taskId?: number | null, contextVerified = false) {
  return useQuery({
    queryKey: queryKeys.taskDependency.predecessors(taskId ?? null),
    queryFn: () => taskDependencyApi.getPredecessors(taskId as number),
    enabled: contextVerified && isPositiveSafeId(taskId),
  });
}
export function useTaskSuccessors(taskId?: number | null, contextVerified = false) {
  return useQuery({
    queryKey: queryKeys.taskDependency.successors(taskId ?? null),
    queryFn: () => taskDependencyApi.getSuccessors(taskId as number),
    enabled: contextVerified && isPositiveSafeId(taskId),
  });
}
/** hook 级回调在组件离开后仍执行。读取失败不能把已成功写入变为可重发的失败。 */
export async function invalidateTaskDependencyDomains(client: QueryClient) {
  const results = await Promise.allSettled(
    [queryKeys.taskDependency.all, queryKeys.gantt.all, queryKeys.task.all].map((queryKey) =>
      client.invalidateQueries({ queryKey }, { throwOnError: true }),
    ),
  );
  if (results.some((result) => result.status === "rejected"))
    toast.error("操作已成功，刷新失败，请重试读取");
}
function useDependencyWrite<T, V>(mutationFn: (variables: V) => Promise<T>, message: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.taskDependency.all,
    mutationFn,
    retry: false,
    onSuccess: () => {
      toast.success(message);
      void invalidateTaskDependencyDomains(client);
    },
    onError: (error) => toast.error(toUserMessage(error)),
  });
}
export async function checkDependencyCircular(payload: TaskDependencyCreatePayload) {
  const result = await taskDependencyApi.checkCircularDependency(payload);
  if (typeof result !== "boolean") throw new Error("检查失败：响应契约错误，环检测应返回 boolean");
  return result;
}
export function useCheckCircularDependency() {
  return useMutation({
    mutationKey: queryKeys.taskDependency.all,
    mutationFn: checkDependencyCircular,
    retry: false,
    onError: (error) => toast.error(`检查失败：${toUserMessage(error)}`),
  });
}
export function useCreateTaskDependency() {
  return useDependencyWrite(async (payload: TaskDependencyCreatePayload) => {
    const id = await taskDependencyApi.createTaskDependency(payload);
    if (!isPositiveSafeId(id)) throw new Error("响应契约错误：创建应返回数字 ID，请刷新核实结果");
    return id;
  }, "依赖已创建");
}
export function useInvalidTaskDependency() {
  return useDependencyWrite((id: number) => taskDependencyApi.invalidDependency(id), "依赖已作废");
}
export function useBatchDeleteTaskDependencies() {
  return useDependencyWrite((ids: number[]) => {
    const unique = [...new Set(ids)];
    if (!unique.length || !unique.every(isPositiveSafeId)) throw new Error("请选择有效的依赖 ID");
    return taskDependencyApi.batchDelete(unique);
  }, "依赖已批量删除");
}
export function useTaskDependencyWriting() {
  return useIsMutating({ mutationKey: queryKeys.taskDependency.all }) > 0;
}

/** 网络结果不确定且权威重读确认已删除后，刷新其它受影响视图。 */
export function useRefreshTaskDependencyDomains() {
  const client = useQueryClient();
  return () => invalidateTaskDependencyDomains(client);
}
