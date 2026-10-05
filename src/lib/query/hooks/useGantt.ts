/**
 * 甘特图/里程碑域 react-query hooks（P3：p3-gantt）。
 *
 * 约定（沿用 useSprints.ts）：
 * - queryKey 一律走 queryKeys.gantt.* / queryKeys.milestone.*，不手写数组
 * - projectId/taskId 为 null/undefined 时 disabled，不发起请求
 * - 批量更新 POST /task/v1/batchUpdate（{ tasks: Item[] }，wire 字段 snake_case，
 *   不接受状态字段）；同 projectId 的并发写入按键串行（createKeyedSerialQueue，
 *   移植老前端 ganttSaveQueue.ts 模式），防止旧请求后到覆盖新值
 * - 失效：甘特变更 → task 域 + gantt 域；里程碑变更 → milestone 域
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ganttApi, milestoneApi } from '../../api/gantt';
import type { GanttBatchUpdatePayload } from '../../api/gantt-types';
import { createKeyedSerialQueue, nextGanttEventVersion } from '../../gantt-live';
import { toUserMessage } from '../error';
import { queryKeys } from '../keys';

/** projectId/taskId 无效时不发起请求的守卫 */
function enabledId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id);
}

/** 甘特图数据：GET /task/v1/gantt/{projectId}（tasks + links） */
export function useGanttData(params: { projectId?: number | null }) {
  const { projectId } = params;
  const query = useQuery({
    queryKey: [...queryKeys.gantt.all, 'data', projectId ?? 0] as const,
    queryFn: async () => {
      const readVersion = nextGanttEventVersion();
      const response = await ganttApi.getGanttData(projectId as number);
      // 包装元数据，结构共享后仍能识别本次读取；调用方 data 仍是原响应。
      return { response, readVersion };
    },
    enabled: enabledId(projectId),
    // 跨域投影（Codex review 4183634372/4183634379/4183634386）：任务的流转/
    // 新建/改派/依赖等写入散落在任务域各 mutation，逐个补失效既漏不全、也会
    // 打断看板自身的乐观刷新协调。改为进入页面时总是重取，不吃 30s staleTime。
    refetchOnMount: 'always',
  });
  return { ...query, data: query.data?.response, readVersion: query.data?.readVersion ?? 0 };
}

/**
 * 关键路径：GET /task/v1/criticalPath/{projectId}（后端计算）。
 * 计算开销较大，调用方可按 enabled 按需拉取；失败不阻塞主图。
 */
export function useCriticalPath(params: {
  projectId?: number | null;
  enabled?: boolean;
}) {
  const { projectId, enabled = true } = params;
  return useQuery({
    queryKey: [...queryKeys.gantt.all, 'criticalPath', projectId ?? 0] as const,
    queryFn: () => ganttApi.getCriticalPath(projectId as number),
    enabled: enabledId(projectId) && enabled,
  });
}

/** 任务依赖：GET /task/v1/dependencies/{taskId}（前置/后置 TaskVO） */
export function useTaskGanttDependencies(params: {
  taskId?: number | null;
}) {
  const { taskId } = params;
  return useQuery({
    queryKey: [...queryKeys.gantt.all, 'dependencies', taskId ?? 0] as const,
    queryFn: () => ganttApi.getTaskDependencies(taskId as number),
    enabled: enabledId(taskId),
  });
}

/** 项目里程碑列表：GET /milestone/list/{projectId} */
export function useMilestoneList(params: { projectId?: number | null }) {
  const { projectId } = params;
  return useQuery({
    queryKey: [...queryKeys.milestone.all, 'list', projectId ?? 0] as const,
    queryFn: () => milestoneApi.listByProject(projectId as number),
    enabled: enabledId(projectId),
  });
}

/**
 * 甘特图首次加载失败判定（沿用 isTasksFatalError 的 run198 口径）：
 * isError && data === undefined → 从未成功；后台重取失败但有缓存 → 非致命。
 */
export function isGanttFatalError(query: {
  isError: boolean;
  data: unknown;
}): boolean {
  return query.isError && query.data === undefined;
}

// 按 projectId 持有串行队列：同项目拖拽并发时写入顺序 = 拖动顺序
const batchQueues = new Map<number, ReturnType<typeof createKeyedSerialQueue>>();

function queueFor(projectId: number) {
  let queue = batchQueues.get(projectId);
  if (!queue) {
    queue = createKeyedSerialQueue();
    batchQueues.set(projectId, queue);
  }
  return queue;
}

/**
 * 甘特批量更新（拖拽改期/拖进度）：POST /task/v1/batchUpdate。
 * 同一 projectId 的并发调用按键串行执行，避免旧请求后到覆盖新值；
 * 结束后失效 task 域、gantt 域与 board 域（看板卡片展示 estimatedEndDate，
 * 看板缓存是独立的 board 根键，不在 task 域下）。
 */
export function useBatchUpdateGanttTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId: number;
      payload: GanttBatchUpdatePayload;
    }) =>
      queueFor(input.projectId).run(input.projectId, async () => {
        const result = await ganttApi.batchUpdateTasks(input.payload);
        // 必须早于 onSettled 触发的重取，不能在组件回调中才记录边界。
        return { result, version: nextGanttEventVersion() };
      }),
    onError: (error) => {
      // r26-4：失败通知必须跨组件卸载可见。mutate() 第二参数的单次回调
      // 仅在观察者仍有订阅者时执行——面板在请求在途时卸载（如点"查看
      // 详情"/浏览器后退并确认放弃）后它们不会执行；hook 级 onError 由
      // mutationCache 持有，卸载后仍会触发。Toaster 挂在应用 shell 全局，
      // 路由离开后依然可见。调用方不再在单次 onError 里重复 toast。
      toast.error(`保存失败：${toUserMessage(error)}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gantt.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
    },
  });
}

/** 新建里程碑：POST /milestone/create，返回 id */
export function useCreateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      projectId: number;
      name: string;
      status: string;
      startDate?: string;
      endDate?: string;
    }) => milestoneApi.createMilestone(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.milestone.all });
    },
  });
}

/** 更新里程碑：POST /milestone/update（只发变更字段，绝不发 xxxSubmitted） */
export function useUpdateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      id: number;
      name?: string;
      status?: string;
      startDate?: string | null;
      endDate?: string | null;
    }) => milestoneApi.updateMilestone(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.milestone.all });
    },
  });
}

/** 删除里程碑：POST /milestone/delete/{id}（逻辑删） */
export function useDeleteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => milestoneApi.deleteMilestone(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.milestone.all });
    },
  });
}
