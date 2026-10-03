/**
 * 任务域 react-query hooks（P1：p1-task-list 垂直切片；p1-task-detail 追加详情/流转/改派/评论）。
 *
 * 约定（沿用 useRequirements.ts）：
 * - queryKey 一律走 queryKeys.task.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （任务列表始终按项目过滤，p1-task-list 的 bean.projectId 必传）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../../api/task';
import type { CommentCreatePayload } from '../../api/requirement-types';
import type {
  TaskAssignPayload,
  TaskCreatePayload,
  TaskQueryRequest,
  TaskStatus,
  TaskTransitionPayload,
} from '../../api/task-types';
import { queryKeys } from '../keys';

export interface TaskListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<TaskQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

function normalizeListParams(params: TaskListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/** 任务列表（分页）：走 POST /task/v1/findByPage；筛选=标题/类型/优先级/状态/执行人 */
export function useTaskList(params: TaskListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: queryKeys.task.list(normalized),
    queryFn: () => taskApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/**
 * 任务状态流转拓扑（纯函数，可独立测试）。
 *
 * 忠实于老前端 frontend/src/types/task.ts 的 TASK_TRANSITIONS_BY_STATUS：
 * 该映射是后端 TaskStatusEnum 状态机在前端的镜像（后端拓扑唯一权威；
 * p1-api-task 契约已确认 updateStatus 经状态机统一门面校验非法流转）。
 * - 原因必填：PAUSED / CANCELLED / COMPLETED（TASK_REASON_STATUSES）
 * - COMPLETED → IN_PROGRESS 是重新打开（后端 REOPEN 事件，需管理权限 + 原因）
 * - TODO → IN_PROGRESS 且无执行人时：必须先确认执行人
 * - 他人代执行人「开始」任务（actor ≠ assignee）：需要原因
 */
export const TASK_TRANSITIONS_BY_STATUS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: [],
};

/** 从 from 状态可达的目标状态（未知状态 → 空列表，不渲染流转按钮） */
export function taskTransitionTargets(from: string | null | undefined): TaskStatus[] {
  if (from == null) return [];
  return (TASK_TRANSITIONS_BY_STATUS as Record<string, TaskStatus[]>)[from] ?? [];
}

/** 暂停/取消/完成：原因必填 */
export function taskNeedsReason(to: string): boolean {
  return to === 'PAUSED' || to === 'CANCELLED' || to === 'COMPLETED';
}

/** COMPLETED → IN_PROGRESS 是重新打开：后端 REOPEN 事件，需管理权限 + 原因 */
export function taskNeedsReopenReason(from: string, to: string): boolean {
  return from === 'COMPLETED' && to === 'IN_PROGRESS';
}

/** TODO → IN_PROGRESS 且任务尚无执行人：必须先确认执行人（新任务认领） */
export function taskNeedsAssigneeConfirm(
  from: string,
  to: string,
  assigneeId: number | null | undefined,
): boolean {
  return from === 'TODO' && to === 'IN_PROGRESS' && assigneeId == null;
}

/** 非执行人本人「开始」任务：需要原因（审计代操作） */
export function taskNeedsActorReason(
  to: string,
  assigneeId: number | null | undefined,
  actorId: number | null | undefined,
): boolean {
  return to === 'IN_PROGRESS' && assigneeId != null && actorId != null && actorId !== assigneeId;
}

/**
 * 流转按钮文案（忠实于老前端 getTaskTransitionLabel）：
 * PAUSED→IN_PROGRESS=恢复、TODO→IN_PROGRESS=开始、COMPLETED→IN_PROGRESS=重新打开、
 * →PAUSED=暂停、→COMPLETED=完成、→CANCELLED=取消，其它回退状态中文标签。
 */
export function taskTransitionLabel(from: string, to: TaskStatus, fallback: (status: string) => string): string {
  if (from === 'PAUSED' && to === 'IN_PROGRESS') return '恢复';
  if (from === 'TODO' && to === 'IN_PROGRESS') return '开始';
  if (from === 'COMPLETED' && to === 'IN_PROGRESS') return '重新打开';
  if (to === 'PAUSED') return '暂停';
  if (to === 'COMPLETED') return '完成';
  if (to === 'CANCELLED') return '取消';
  return fallback(to);
}

/** 任务详情：走 GET /task/v1/findById/{id}；id 无效时 disabled */
export function useTaskDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.task.detail(id ?? 0),
    queryFn: () => taskApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/**
 * 变更任务状态：走 POST /task/v1/updateStatus（{ taskId, status, reason?, deliverables?, assigneeId? }）。
 * 成功后失效任务域全部缓存（详情/列表全部变脏）。非法流转由后端状态机拒绝并经 toUserMessage 展示。
 */
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskTransitionPayload) => {
      const { taskId, status, ...context } = data;
      return taskApi.updateTaskStatus(taskId, status, context);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
    },
  });
}

/**
 * 改派任务：走 POST /task/v1/assign（{ taskId, assigneeId, reason }，reason 必填）。
 * 成功后失效任务域全部缓存。
 */
export function useAssignTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskAssignPayload) => taskApi.assignTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
    },
  });
}

/**
 * 创建任务：走 POST /task/v1/createTask（后端返回新建任务 id，创建后状态为待开始）。
 * 成功后失效任务域全部缓存（详情/列表全部变脏），列表下次读取即出现新任务。
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskCreatePayload) => taskApi.createTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
    },
  });
}

/** 任务评论分页：走 POST /comment/v1/target/TASK/{id}/find（请求体仅 { page, pageSize }） */
export function useTaskComments(
  taskId: number | null | undefined,
  page: number = 1,
  pageSize: number = 50,
) {
  const params = { page, pageSize };
  return useQuery({
    queryKey: queryKeys.task.comments(taskId ?? 0, params),
    queryFn: () => taskApi.findComments(taskId as number, params),
    enabled: typeof taskId === 'number' && Number.isFinite(taskId) && taskId > 0,
  });
}

/**
 * 发表任务评论（或回复：传 parentId）：走 POST /comment/v1/target/TASK/{id}/create。
 * 成功后失效该任务的评论缓存（前缀匹配，覆盖所有分页）。
 */
export function useCreateTaskComment(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CommentCreatePayload) => taskApi.createComment(taskId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.task.all, 'comments', taskId],
      });
    },
  });
}
