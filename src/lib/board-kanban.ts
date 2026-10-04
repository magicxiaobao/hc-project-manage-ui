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
import type { BoardColumnWithTasks } from "./api/board-types";
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
 * - 非对象元素/缺 id 的列整体丢弃；
 * - tasks 非数组时视为空列（后端无 taskStatus 时即返回空数组）；
 * - 卡片缺 id/status 的丢弃单卡，不污染整列。
 */
export function parseBoardColumnsWithTasks(
  raw: BoardColumnWithTasks[],
): KanbanBoardColumn[] {
  const columns: KanbanBoardColumn[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const id = asNumber(entry.id);
    if (id == null) continue;
    const tasksRaw = Array.isArray(entry.tasks) ? entry.tasks : [];
    const tasks: KanbanBoardCard[] = [];
    for (const taskRaw of tasksRaw) {
      const card = parseCard(taskRaw);
      if (card) tasks.push(card);
    }
    columns.push({
      id,
      columnName: asString(entry.columnName) ?? "",
      type: asString(entry.type),
      color: asString(entry.color),
      wipLimit: asNumber(entry.wipLimit),
      taskStatus: asTaskStatus(entry.taskStatus),
      sortOrder: asNumber(entry.sortOrder),
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
 */
export function moveCardInColumns(
  columns: KanbanBoardColumn[],
  cardId: number,
  toColumnId: number,
): KanbanBoardColumn[] {
  let fromIndex = -1;
  let moving: KanbanBoardCard | null = null;
  for (let index = 0; index < columns.length; index++) {
    const found = columns[index].tasks.find((task) => task.id === cardId);
    if (found) {
      fromIndex = index;
      moving = found;
      break;
    }
  }
  const toIndex = columns.findIndex((column) => column.id === toColumnId);
  if (fromIndex < 0 || moving == null || toIndex < 0 || fromIndex === toIndex) {
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

/** 流转上下文：目标 COMPLETED 填 deliverables，其余填 reason（后端 dispatch 口径） */
export function buildCardTransitionContext(
  to: TaskStatus,
  text: string,
): { reason?: string; deliverables?: string } {
  const trimmed = text.trim();
  if (to === "COMPLETED") return { deliverables: trimmed };
  return { reason: trimmed };
}

/** 校验流转文本非空（与后端 requireText 对应，前端先拦截省一次往返） */
export function validateTransitionText(text: string): string | null {
  return text.trim() ? null : "请填写流转说明";
}
