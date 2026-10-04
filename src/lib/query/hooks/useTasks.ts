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
  TaskResponse,
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
 * Codex review 4175337096：需求追溯图/影响范围/矩阵里嵌了任务关联与状态，任务变更后
 * 需求域缓存也要失效，否则 30 秒 stale 窗口内会展示旧图。
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
    },
  });
}

/**
 * 改派任务：走 POST /task/v1/assign（{ taskId, assigneeId, reason }，reason 必填）。
 * 成功后失效任务域全部缓存。Codex review 4175337096：同上，需求追溯里含执行人，
 * 一并失效需求域。
 */
export function useAssignTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskAssignPayload) => taskApi.assignTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
    },
  });
}

/**
 * 创建任务：走 POST /task/v1/createTask（后端返回新建任务 id，创建后状态为待开始）。
 * 成功后失效任务域全部缓存（详情/列表全部变脏），列表下次读取即出现新任务。
 * Codex review 4175337096：新建并关联需求后，需求追溯图要看到新任务，一并失效需求域。
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskCreatePayload) => taskApi.createTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
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

/**
 * 项目全部任务（全页循环，供 Backlog / 甘特等需要全量口径的页面使用）：
 * 走 POST /task/v1/findByPage（pageSize=500 单页上限；循环拉取直到某页不足一页，
 * 避免 total 超单页时静默漏数，r5 的 F2 教训）。
 *
 * 注意：bean 仅含 projectId，不下发 sprintId 过滤——后端 TaskRepository.xml
 * findByPage 的 sprintId 条件是 `<if test="query.sprintId != null">AND sprint_id = …</if>`，
 * 传 null 等价于不过滤，无法直接表达 "sprint_id IS NULL"（实读确认）。
 * 因此"未规划任务池（Backlog）"在前端按 task.sprintId == null 过滤，
 * 见 filterBacklogTasks；页面 hint 如实标注此口径。
 */
const ALL_TASKS_FETCH_PAGE_SIZE = 500;

/**
 * 拉取项目全部任务（分页循环，供测试与 hook 共用）。
 * 不下发 sprintId 过滤：后端 findByPage 的 sprintId 条件是
 * `<if test="query.sprintId != null">AND sprint_id = …</if>`，
 * 传 null 等价于不过滤，无法表达 "sprint_id IS NULL"（实读确认）。
 */
export async function fetchAllProjectTasks(projectId: number): Promise<TaskResponse[]> {
  const all: TaskResponse[] = [];
  let page = 1;
  for (;;) {
    const pageResult = await taskApi.findByPage({
      page,
      pageSize: ALL_TASKS_FETCH_PAGE_SIZE,
      bean: { projectId },
    });
    all.push(...pageResult.list);
    if (pageResult.list.length < ALL_TASKS_FETCH_PAGE_SIZE) break;
    page += 1;
  }
  return all;
}

export function useProjectAllTasks(params: { projectId?: number | null }) {
  const { projectId } = params;
  return useQuery({
    queryKey: queryKeys.task.list({
      allTasks: true,
      pageSize: ALL_TASKS_FETCH_PAGE_SIZE,
      projectId: projectId ?? 0,
    }),
    queryFn: () => fetchAllProjectTasks(projectId as number),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/**
 * 未规划任务（Backlog 池）：sprintId == null 的任务。纯函数，可独立测试。
 * 口径说明：后端 findByPage 无法表达 "sprint_id IS NULL"，故用全量拉取 +
 * 前端过滤代替；valid/invalid 的有效性过滤已在后端查询统一生效
 * （valid_status=0），这里不再二次过滤。
 */
export function filterBacklogTasks(tasks: TaskResponse[]): TaskResponse[] {
  return tasks.filter((task) => task.sprintId == null);
}

/**
 * 任务挂载/移出冲刺（Backlog 规划的核心写操作）：
 * 走 POST /task/v1/updateTask，载荷仅 { id, sprintId }。
 * - 后端 TaskUpdateRequest：@JsonSetter("sprintId") 把"键出现"即视为已提交
 *   （sprintIdSubmitted=true，含显式 null）；@JsonAnySetter 拒绝未知字段，
 *   因此载荷绝不能混入其它键（如 assigneeId 会触发改派工作流）。
 * - sprintId 显式 null = 清空（Schema 注解"清空表示移回待办"），
 *   对应 SQL `sprint_id = #{changes.sprintId,jdbcType=BIGINT}`。
 * - 赋值时后端守卫（TaskServiceImpl.validateMountTarget）：目标冲刺必须
 *   同项目、有效、状态为 PLANNING/ACTIVE，否则报业务码，
 *   调用方经 toUserMessage 展示（页面侧如实报错，不预判拦截）。
 * - 成功后失效任务域 + 冲刺域 + 看板域：后端同一事务内经
 *   SprintStoryPointsRecomputer 重算源/目标冲刺故事点；看板卡片查询
 *   （queryKeys.board.list({ columnsWithTasks: boardId })，后端按看板 sprintId
 *   筛选任务）也会因任务的 sprintId 变化而过期——看板域必须整体失效
 *   （影响的看板不唯一，无法从 mutation 参数精确到单个 boardId）。
 */
export function useUpdateTaskSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; sprintId: number | null }) =>
      taskApi.updateTask({ id: data.id, sprintId: data.sprintId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprint.all });
      // 任务移入/移出冲刺后看板卡片查询过期：后端按看板 sprintId 筛选任务，
      // 必须失效看板域，否则 30 秒新鲜期内看板仍显示旧卡片。
      void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
    },
  });
}
