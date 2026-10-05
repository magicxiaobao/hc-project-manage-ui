/**
 * 任务看板纯逻辑（P3：p3-board-kanban）。
 *
 * - 解析 GET /boardColumn/v1/board/{boardId}/columnsWithTasks 的返回
 *   （后端返回 List<Map<String,Object>>，api 层类型化为 Record<string,unknown>[]）；
 *   后端拼装证据见 BoardColumnServiceImpl.getBoardColumnsWithTasks：
 *   列字段 { id, columnName, type, color, wipLimit, taskStatus, sortOrder }，
 *   卡片字段 { id, title, description, priority, storyPoints, status,
 *   estimatedEndDate, assigneeId }。taskStatus 是任务状态机枚举名
 *   （TaskStatusEnum.ofValue 解析；无 taskStatus 的列 tasks 为空数组）。
 * - 卡片跨列移动的纯变换（乐观更新用），以及流转上下文构造
 *   （原因/交付物口径忠实于后端 TaskWorkflowService.dispatch：
 *   PAUSED/CANCELLED 必须 reason、COMPLETED 必须 deliverables 或 reason、
 *   COMPLETED→IN_PROGRESS 重新打开必须 reason；拓扑复用 useTasks 的
 *   TASK_TRANSITIONS_BY_STATUS/taskNeedsReason/taskNeedsReopenReason）。
 */
import type { TaskStatus } from "./api/task-types";
import { taskNeedsReason, taskNeedsReopenReason } from "./query/hooks/useTasks";

/** 看板卡片：columnsWithTasks 中 tasks 数组的元素（前端类型化解释） */
export interface KanbanBoardCard {
  id: number;
  title: string;
  description: string | null;
  priority: string | null;
  storyPoints: number | null;
  /** 卡片自身的任务状态（后端 task.getStatus()，枚举名） */
  status: TaskStatus;
  estimatedEndDate: string | null;
  assigneeId: number | null;
}

/** 看板列 + 卡片：columnsWithTasks 的元素 */
export interface KanbanBoardColumn {
  id: number;
  columnName: string;
  /** 后端列类型字段 "type"（BoardColumn.getType()）；与看板列查询的 columnType 同名不同域 */
  type: string | null;
  color: string | null;
  wipLimit: number | null;
  /** 映射的任务状态机状态（枚举名）；null 表示该列不聚合任务 */
  taskStatus: TaskStatus | null;
  sortOrder: number | null;
  tasks: KanbanBoardCard[];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const TASK_STATUS_SET = new Set<string>([
  "TODO",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);

function asTaskStatus(value: unknown): TaskStatus | null {
  return typeof value === "string" && TASK_STATUS_SET.has(value)
    ? (value as TaskStatus)
    : null;
}

function parseCard(raw: unknown): KanbanBoardCard | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = asNumber(record.id);
  const status = asTaskStatus(record.status);
  // id 与 status 是拖拽流转的关键字段，缺任其一则整张卡片丢弃（避免误操作）
  if (id == null || status == null) return null;
  return {
    id,
    title: asString(record.title) ?? "",
    description: asString(record.description),
    priority: asString(record.priority),
    storyPoints: asNumber(record.storyPoints),
    status,
    estimatedEndDate: asString(record.estimatedEndDate),
    assigneeId: asNumber(record.assigneeId),
  };
}

/**
 * 解析列+卡片数据：防御性解释后端返回的 List<Map>。
 * - raw 非数组时兜底返回空数组（后端异常形状不抛错，调用方展示空态）；
 * - 非对象元素/缺 id 的列整体丢弃；
 * - tasks 非数组时视为空列（后端无 taskStatus 时即返回空数组）；
 * - 卡片缺 id/status 的丢弃单卡，不污染整列。
 *
 * 本函数在 react-query 的 queryFn 返回前执行（见 useBoardColumns），
 * 因此缓存里存的即是规范形状 KanbanBoardColumn[]，组件层乐观更新可直接
 * 按此形状操作，无需再做类型断言。
 */
export function parseBoardColumnsWithTasks(raw: unknown): KanbanBoardColumn[] {
  if (!Array.isArray(raw)) return [];
  const columns: KanbanBoardColumn[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = asNumber(record.id);
    if (id == null) continue;
    const tasksRaw = Array.isArray(record.tasks) ? record.tasks : [];
    const tasks: KanbanBoardCard[] = [];
    for (const taskRaw of tasksRaw) {
      const card = parseCard(taskRaw);
      if (card) tasks.push(card);
    }
    columns.push({
      id,
      columnName: asString(record.columnName) ?? "",
      type: asString(record.type),
      color: asString(record.color),
      wipLimit: asNumber(record.wipLimit),
      taskStatus: asTaskStatus(record.taskStatus),
      sortOrder: asNumber(record.sortOrder),
      tasks,
    });
  }
  return columns;
}

/**
 * 卡片跨列移动的纯变换：从源列移除、追加到目标列末尾。
 * - 同列移动：后端无列内排序语义，直接返回原数组（调用方据此判定不发请求）；
 * - 卡片或目标列不存在：返回原数组（调用方无动作）；
 * - 不改变卡片 status（status 由后端 updateStatus 成功后的 refetch 更新，
 *   避免乐观值与后端状态机权威不一致）。
 *
 * r8 R6：fromColumnId 由调用方传入实际源列——后端按列 taskStatus 聚合卡片，
 * 同一任务状态可被多列映射，同一张卡片会同时出现在多列中；按 cardId 遍历
 * 取首个命中列会从错误的列移除（两列同映射 TODO 均含任务 101 时，从第二列
 * 拖到第三列会把第一列的卡片删掉、第二列保留）。
 */
export function moveCardInColumns(
  columns: KanbanBoardColumn[],
  cardId: number,
  fromColumnId: number,
  toColumnId: number,
): KanbanBoardColumn[] {
  const fromIndex = columns.findIndex((column) => column.id === fromColumnId);
  const toIndex = columns.findIndex((column) => column.id === toColumnId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return columns;
  }
  const moving = columns[fromIndex].tasks.find((task) => task.id === cardId);
  if (moving == null) {
    return columns;
  }
  const movingCard = moving;
  return columns.map((column, index) => {
    if (index === fromIndex) {
      return { ...column, tasks: column.tasks.filter((task) => task.id !== movingCard.id) };
    }
    if (index === toIndex) {
      return { ...column, tasks: [...column.tasks, movingCard] };
    }
    return column;
  });
}

/**
 * 卡片拖拽是否需要收集流转文本：
 * - 目标为 PAUSED/CANCELLED/COMPLETED：后端 requireText（原因必填）；
 * - COMPLETED→IN_PROGRESS：后端 reopen 必须原因；
 * 其它（TODO→IN_PROGRESS、IN_PROGRESS→PAUSED 以外合法流转等）不需要。
 */
export function cardTransitionNeedsText(from: TaskStatus, to: TaskStatus): boolean {
  return taskNeedsReason(to) || taskNeedsReopenReason(from, to);
}

/**
 * r9 P2-4 + r10 P2-3：看板权威刷新成功判定（纯函数，协调器用）。
 *
 * r10-3：旧条件 `dataUpdatedAt > updatedAtBefore` 依赖墙钟严格递增——
 * React Query 用 Date.now() 写 dataUpdatedAt，同一毫秒/时钟精度受限/
 * 时钟回拨时，真实 GET 成功也可能不满足，导致误报"刷新失败"并保留锁定
 * （缓存已是权威数据，仍返回 false）。
 * 新条件改用 dataUpdateCount：每次 success dispatch 递增的整数计数器
 * （真实拉取与 setQueryData 都会递增），与墙钟无关。配合代次守卫即可
 * 区分"真实 GET 成功"与"本地乐观写入"（调用方每次乐观 setQueryData
 * 都先经 markOptimisticWrite 推进代次）：
 * - 代次未被推进（currentSeq === seq）：期间无新的权威刷新、也无乐观写入；
 * - 查询状态确为 success；
 * - dataUpdateCount 严格大于刷新开始前的快照（updateCountBefore）：
 *   刷新开始前已存在的乐观写入计数不能再被计作权威凭据；被 cancel 取消的
 *   refetch 不产生 success dispatch（不更新 dataUpdatedAt 也不递增计数），
 *   自然判 false（r8 R3）。
 */
export function confirmAuthoritativeRefresh(args: {
  status: "success" | "error" | "pending";
  dataUpdateCount: number;
  /** 本次刷新开始前该查询的 dataUpdateCount 快照 */
  updateCountBefore: number;
  /** 本次刷新取号 */
  seq: number;
  /** 判定时刻的最新代次 */
  currentSeq: number;
}): boolean {
  return (
    args.currentSeq === args.seq &&
    args.status === "success" &&
    args.dataUpdateCount > args.updateCountBefore
  );
}

/** r12 P1-1：看板解锁 effect 的判定结果 */
export type BoardUnlockDecision = "unlock" | "keep-snapshot" | "settle";

/**
 * r11 P1-1 + r12 P1-1：看板解锁 effect 的判定核心（纯函数，可单测）。
 * 输入对应 effect 在一次渲染中观察到的查询状态；snapshot 为 effect 保留的
 * 拉取快照（代次 + 成功计数），null 表示当前没有在观察的拉取。
 *
 * - 仍在拉取（isFetching）：保留快照继续观察 → "keep-snapshot"；
 * - fetchStatus=paused：暂停不是完成——不做判定、不丢快照，等恢复后继续
 *   用同一快照判定（r11 P1-1：暂停中的 GET 不能误判为权威成功）；
 * - 拉取结束且有快照：status=success 且成功计数严格大于拉取开始前，且期间
 *   代次未被推进（无乐观写入、无更新的权威刷新）→ "unlock"；
 *   否则快照使命结束 → "settle"（不清锁，只是不再观察这次拉取）；
 * - 无快照：无事可做 → "settle"。
 *
 * r12 P1-1：被取代的刷新（另一入口重试把代次推到 S+1 并取消/替换了暂停中
 * 的请求）必须由协调器把快照代次同步跟进到 S+1；否则这里的 currentSeq ===
 * startSeq 恒不成立，重连成功后永远判 "settle"，awaitingRefresh 与
 * refreshSucceededSignal 永久锁死。注意 markOptimisticWrite 的推进刻意
 * 不同步快照——乐观写入介入的拉取仍要被守卫拒绝。
 */
export function decideBoardUnlock(args: {
  isFetching: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
  status: "success" | "error" | "pending";
  dataUpdateCount: number;
  snapshot: { startSeq: number; countAtStart: number } | null;
  currentSeq: number;
}): BoardUnlockDecision {
  if (args.isFetching) return "keep-snapshot";
  if (args.fetchStatus === "paused") return "keep-snapshot";
  if (args.snapshot == null) return "settle";
  const fresh =
    args.status === "success" &&
    args.dataUpdateCount > args.snapshot.countAtStart &&
    args.currentSeq === args.snapshot.startSeq;
  return fresh ? "unlock" : "settle";
}

/**
 * r9 P2-5 + r10 P2-4：列排序失败的操作级恢复——只按快照恢复列顺序，各列的
 * 卡片（其它在途/已成功的流转结果）原样保留，不做整板快照覆盖。
 * 快照中没有的新列追加到末尾。
 *
 * r10-4：仅恢复快照中"当前仍存在"的列——排序在途被删除的列不再用
 * `?? column` 复活（否则幽灵列会连同快照里的旧卡片一起回来，后续刷新
 * 再失败便持续展示；卡片已移动到其他列时还会出现旧副本）。
 * 所有列对象一律取当前值（卡片以当前为准）。
 */
export function restoreColumnOrder(
  current: KanbanBoardColumn[],
  snapshot: KanbanBoardColumn[],
): KanbanBoardColumn[] {
  const currentById = new Map(current.map((column) => [column.id, column]));
  const snapshotIds = new Set(snapshot.map((column) => column.id));
  return [
    ...snapshot
      .map((column) => currentById.get(column.id))
      .filter((column): column is KanbanBoardColumn => column !== undefined),
    ...current.filter((column) => !snapshotIds.has(column.id)),
  ];
}

/** 流转上下文：目标 COMPLETED 填 deliverables，其余填 reason（后端 dispatch 口径） */
export function buildCardTransitionContext(
  to: TaskStatus,
  text: string,
): { reason?: string; deliverables?: string } {
  const trimmed = text.trim();
  if (to === "COMPLETED") return { deliverables: trimmed };
  return { reason: trimmed };
}

/** 校验流转文本非空且不超后端上限（与后端 requireText/@Size 对应，前端先拦截省一次往返） */
export function validateTransitionText(text: string, maxLength: number): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "请填写流转说明";
  if (trimmed.length > maxLength) return `流转说明不能超过 ${maxLength} 个字符`;
  return null;
}

/** 流转文本后端上限：目标 COMPLETED 走 deliverables（1000），其余走 reason（500） */
export function transitionTextMaxLength(to: TaskStatus): number {
  return to === "COMPLETED" ? 1000 : 500;
}
