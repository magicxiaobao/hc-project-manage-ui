/**
 * P3 甘特图纯逻辑（p3-gantt）：后端响应的防御归一、几何映射、批量更新载荷
 * 构建、按键串行队列、里程碑表单校验与 Instant 转换。
 *
 * 无 React 依赖，可单测（src/lib/__tests__/gantt-live.test.ts）。
 *
 * 后端契约（实读 hc-project-manage 只读仓库）：
 * - GET /task/v1/gantt/{projectId} → { data: [{id, text, start_date, end_date,
 *   progress, priority, status, parent(0L=根), validStatus, readonly}], links:
 *   [{id, source, target, type:"0"=完成-开始}] }（TaskServiceImpl.getGanttData）
 * - GET /task/v1/criticalPath/{projectId} → { criticalPath: Long[],
 *   totalDuration, criticalTasks, projectId, calculatedAt }（后端计算，老前端
 *   本地算已废弃）
 * - GET /task/v1/dependencies/{taskId} → { predecessors: TaskVO[],
 *   successors: TaskVO[] }
 * - POST /task/v1/batchUpdate → { tasks: Item[] }；Item{id, text?, start_date?,
 *   end_date?, progress?}，wire 字段 snake_case（@JsonProperty），整批原子
 *   更新标题/计划起止日/进度（0–100），不接受状态字段
 * - 里程碑（无 /v1）：create 载荷 {projectId, name, status, startDate, endDate}
 *   （日期 Instant，需 ISO-8601）；update 字段出现即提交（只发变更字段，
 *   绝不发 xxxSubmitted）；delete/{id} 为逻辑删（@TableLogic）
 */
import type {
  GanttBatchUpdateItem,
  MilestoneResponse,
  MilestoneStatus,
} from "./api/gantt-types";
import { MILESTONE_STATUSES } from "./api/gantt-types";

/** 甘特图任务（归一后；日期 'YYYY-MM-DD' 或 null） */
export interface GanttTask {
  id: number;
  text: string;
  startDate: string | null;
  endDate: string | null;
  /** 0–100；null = 未设置 */
  progress: number | null;
  status?: string | null;
  priority?: string | null;
  /** 父任务 id；0 = 根 */
  parent: number;
  /** 0 = 有效；非 0 = 失效（依赖上下文，只读） */
  validStatus: number;
  readonly: boolean;
}

/** 甘特图依赖连线（归一后） */
export interface GanttLink {
  id: number;
  source: number;
  target: number;
  /** "0" = 完成-开始（后端当前只产生这一种） */
  type: string;
}

export interface NormalizedGanttData {
  tasks: GanttTask[];
  links: GanttLink[];
  /** 畸形条目丢弃计数（防御归一） */
  invalidCount: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 严格校验 'YYYY-MM-DD'（格式 + 真实日期，如拒绝 2026-02-30） */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return isValidDateOnly(value) ? value : null;
}

function normalizeTask(raw: unknown): GanttTask | null {
  const item = asRecord(raw);
  if (!item || !isFiniteNumber(item.id)) return null;
  const text = typeof item.text === "string" && item.text.trim() !== "" ? item.text : `任务 #${item.id}`;
  const validStatus = isFiniteNumber(item.validStatus) ? item.validStatus : 0;
  return {
    id: item.id,
    text,
    startDate: normalizeDate(item.start_date),
    endDate: normalizeDate(item.end_date),
    progress: isFiniteNumber(item.progress)
      ? Math.min(Math.max(Math.round(item.progress), 0), 100)
      : null,
    status: typeof item.status === "string" ? item.status : null,
    priority: typeof item.priority === "string" ? item.priority : null,
    parent: isFiniteNumber(item.parent) ? item.parent : 0,
    validStatus,
    readonly: typeof item.readonly === "boolean" ? item.readonly : validStatus !== 0,
  };
}

function normalizeLink(raw: unknown): GanttLink | null {
  const item = asRecord(raw);
  if (
    !item ||
    !isFiniteNumber(item.id) ||
    !isFiniteNumber(item.source) ||
    !isFiniteNumber(item.target)
  ) {
    return null;
  }
  return {
    id: item.id,
    source: item.source,
    target: item.target,
    type: typeof item.type === "string" ? item.type : "0",
  };
}

/**
 * GET /task/v1/gantt/{projectId} 响应防御归一：只认 data/links 键，
 * 畸形条目丢弃并计数；日期非法直接归 null（不让非法日期进几何计算）。
 */
export function normalizeGanttData(raw: unknown): NormalizedGanttData {
  const root = asRecord(raw);
  const tasks: GanttTask[] = [];
  const links: GanttLink[] = [];
  let invalidCount = 0;
  const data = root?.data;
  const linkList = root?.links;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const task = normalizeTask(entry);
      if (task) tasks.push(task);
      else invalidCount += 1;
    }
  }
  if (Array.isArray(linkList)) {
    for (const entry of linkList) {
      const link = normalizeLink(entry);
      if (link) links.push(link);
      else invalidCount += 1;
    }
  }
  return { tasks, links, invalidCount };
}

/** 关键路径摘要（归一后） */
export interface CriticalPathSummary {
  criticalIds: number[];
  totalDuration: number;
}

/**
 * GET /task/v1/criticalPath/{projectId} 响应防御归一：
 * 只取 criticalPath（id 数组）与 totalDuration。
 */
export function normalizeCriticalPath(raw: unknown): CriticalPathSummary {
  const root = asRecord(raw);
  const path = root?.criticalPath;
  const criticalIds: number[] = Array.isArray(path)
    ? path.filter(isFiniteNumber)
    : [];
  const totalDuration = isFiniteNumber(root?.totalDuration)
    ? root.totalDuration
    : 0;
  return { criticalIds, totalDuration };
}

/** 任务依赖引用（列表展示用） */
export interface TaskDepRef {
  id: number;
  title: string;
}

export interface TaskDependenciesSummary {
  predecessors: TaskDepRef[];
  successors: TaskDepRef[];
}

function normalizeDepRef(raw: unknown): TaskDepRef | null {
  const item = asRecord(raw);
  if (!item || !isFiniteNumber(item.id)) return null;
  return {
    id: item.id,
    title:
      typeof item.title === "string" && item.title.trim() !== ""
        ? item.title
        : `任务 #${item.id}`,
  };
}

/**
 * GET /task/v1/dependencies/{taskId} 响应防御归一：
 * { predecessors: TaskVO[], successors: TaskVO[] }。
 */
export function normalizeTaskDependencies(raw: unknown): TaskDependenciesSummary {
  const root = asRecord(raw);
  const pick = (value: unknown): TaskDepRef[] => {
    if (!Array.isArray(value)) return [];
    const refs: TaskDepRef[] = [];
    for (const entry of value) {
      const ref = normalizeDepRef(entry);
      if (ref) refs.push(ref);
    }
    return refs;
  };
  return {
    predecessors: pick(root?.predecessors),
    successors: pick(root?.successors),
  };
}

/** 甘特图行（树形扁平化） */
export interface GanttRow {
  task: GanttTask;
  start: string;
  end: string;
  depth: number;
  /** 有可见子任务 → 汇总条（起止取子任务跨度，子任务无日期时用自身） */
  summary: boolean;
  parentId: number | null;
}

/**
 * 任务树扁平化为行：parent=0 为根；子任务按开始日期排序（无日期沉底）；
 * 父行起止优先用任务自身日期，否则取子任务跨度；无日期任务不进图表
 * （由调用方另行展示"未排期"）。
 */
export function buildGanttRows(tasks: GanttTask[]): GanttRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<number, GanttTask[]>();
  const roots: GanttTask[] = [];
  for (const task of tasks) {
    if (task.parent !== 0 && byId.has(task.parent)) {
      const list = children.get(task.parent) ?? [];
      list.push(task);
      children.set(task.parent, list);
    } else {
      roots.push(task);
    }
  }
  const byStart = (a: GanttTask, b: GanttTask) =>
    (a.startDate ?? "9999-99-99").localeCompare(b.startDate ?? "9999-99-99") ||
    a.id - b.id;
  for (const list of children.values()) list.sort(byStart);
  roots.sort(byStart);

  const spanOf = (
    task: GanttTask,
    visiting: Set<number>,
  ): { start: string; end: string } | null => {
    if (visiting.has(task.id)) return null; // 防环
    visiting.add(task.id);
    let start = task.startDate;
    let end = task.endDate;
    // 自身有完整计划日期 → 优先用自身日期渲染，不再被子任务跨度覆盖
    // （按 estimated 日期渲染 / 自身日期优先口径）
    if (!(start && end)) {
      for (const child of children.get(task.id) ?? []) {
        const sub = spanOf(child, visiting);
        if (!sub) continue;
        if (!start || sub.start < start) start = sub.start;
        if (!end || sub.end > end) end = sub.end;
      }
    }
    visiting.delete(task.id);
    return start && end ? { start, end } : null;
  };

  const rows: GanttRow[] = [];
  const emitted = new Set<number>();
  const emit = (task: GanttTask, depth: number, parentId: number | null) => {
    if (emitted.has(task.id)) return;
    const range = spanOf(task, new Set());
    if (!range) return;
    emitted.add(task.id);
    const kids = children.get(task.id) ?? [];
    rows.push({
      task,
      start: range.start,
      end: range.end,
      depth,
      summary: kids.length > 0,
      parentId,
    });
    for (const child of kids) emit(child, depth + 1, task.id);
  };
  for (const root of roots) emit(root, 0, null);
  return rows;
}

/** 未排期的任务（无 start/end，图表画不出来，调用方另行提示） */
export function findUnscheduledTasks(tasks: GanttTask[]): GanttTask[] {
  return tasks.filter((task) => !task.startDate || !task.endDate);
}

/**
 * 终态进度锁定（后端 Task.isProgressLocked() 口径）：COMPLETED / CANCELLED
 * 任务的 progress 变更会 400 且整批原子回滚，前端直接锁住进度入口
 * （拖柄、面板进度输入），只允许改期。
 * wire 的 status 为 TaskStatusEnum 的 @JsonValue（"COMPLETED"/"CANCELLED"）。
 */
export function isProgressLocked(status: string | null | undefined): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

// ---------------------------------------------------------------- 日期几何

/** 'YYYY-MM-DD' → 自纪元起天数（UTC，避免时区漂移） */
export function dayNumber(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** 自纪元起天数 → 'YYYY-MM-DD' */
export function isoFromDay(day: number): string {
  const date = new Date(day * 86_400_000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${dayOfMonth}`;
}

/** 今天（本地日期，按 UTC 天数口径） */
export function todayNumber(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000;
}

export type GanttScale = "day" | "week" | "month";

export function tickLabel(day: number, scale: GanttScale): string {
  const date = new Date(day * 86_400_000);
  if (scale === "month") return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function chartWidth(span: number, scale: GanttScale): number {
  if (scale === "day") return Math.max(span * 28, 720);
  if (scale === "week") return Math.max(Math.ceil(span / 7) * 96, 720);
  return Math.max(Math.ceil(span / 30) * 120, 720);
}

export function ticksFor(origin: number, finish: number, scale: GanttScale): number[] {
  const ticks: number[] = [];
  if (scale === "month") {
    let cursor = origin;
    let guard = 0;
    while (cursor <= finish && guard++ < 1200) {
      ticks.push(cursor);
      const date = new Date(cursor * 86_400_000);
      const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 86_400_000;
      cursor = next <= cursor ? cursor + 28 : next;
    }
    return ticks;
  }
  const step = scale === "day" ? 1 : 7;
  for (let day = origin; day <= finish; day += step) ticks.push(day);
  return ticks;
}

export function weekendDays(origin: number, finish: number): number[] {
  const days: number[] = [];
  for (let day = origin; day <= finish; day += 1) {
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday === 0 || weekday === 6) days.push(day);
  }
  return days;
}

/** 天数 → 百分比横坐标（end 含当日：条宽覆盖 end 当天） */
export function xPercent(day: number, origin: number, span: number): number {
  return ((day - origin) / span) * 100;
}

// ------------------------------------------------------- 批量更新载荷构建

/** 拖拽草稿：id → 本次改动的字段（相对原始值的差量） */
export type TaskDraft = Partial<
  Pick<GanttTask, "startDate" | "endDate" | "progress">
>;

/**
 * 由拖拽草稿构建 POST /task/v1/batchUpdate 的 tasks 数组：
 * - 只输出相对原始值真正变化的字段（无变化的任务不进数组）
 * - wire 字段名 snake_case（后端 @JsonProperty；camelCase 会 400）
 * - 进度钳制到 0–100 整数；日期必须 start ≤ end（调用方拖拽时已钳制，
 *   这里再做一次防御：反转则交换）
 * - text/status 绝不发送（batchUpdate 不接受状态字段）
 */
export function buildBatchUpdateItems(
  draft: Record<number, TaskDraft>,
  originals: Map<number, GanttTask>,
): GanttBatchUpdateItem[] {
  const items: GanttBatchUpdateItem[] = [];
  for (const [idKey, change] of Object.entries(draft)) {
    const id = Number(idKey);
    const original = originals.get(id);
    if (!original || original.readonly) continue;
    const item: GanttBatchUpdateItem = { id };
    let changed = false;
    const start = change.startDate !== undefined ? change.startDate : original.startDate;
    const end = change.endDate !== undefined ? change.endDate : original.endDate;
    if (start !== original.startDate || end !== original.endDate) {
      if (start && end && isValidDateOnly(start) && isValidDateOnly(end)) {
        // 防御：起止反转则交换，保证 start ≤ end
        item.start_date = start <= end ? start : end;
        item.end_date = start <= end ? end : start;
        changed = true;
      }
    }
    if (change.progress !== undefined && change.progress !== null) {
      const progress = Math.min(Math.max(Math.round(change.progress), 0), 100);
      if (original.progress !== progress) {
        item.progress = progress;
        changed = true;
      }
    }
    if (changed) items.push(item);
  }
  return items;
}

/**
 * r25-1：已提交值叠加到权威基线。
 *
 * 拖拽提交成功后、权威重取到达前，旧缓存仍是提交前的值。窗口内再次拖拽
 * 时 buildBatchUpdateItems 必须相对"已提交值"判定 changed，否则按陈旧
 * 缓存比较会漏掉回滚类改动、或按旧几何基线提交覆盖已保存的新日期。
 * 草稿（draft）本身保持应用直到权威数据到达（组件侧 effect），这里只
 * 解决 diff 基线问题：返回 originals 叠加 committed 的新 Map。
 */
export function overlayCommittedBaseline(
  originals: Map<number, GanttTask>,
  committed: Record<number, TaskDraft>,
): Map<number, GanttTask> {
  const entries = Object.entries(committed);
  if (entries.length === 0) return originals;
  const merged = new Map(originals);
  for (const [idKey, change] of entries) {
    const id = Number(idKey);
    const original = merged.get(id);
    if (original) merged.set(id, { ...original, ...change });
  }
  return merged;
}

/** 客户端读取发起与写入成功共用单调序号，避免毫秒碰撞与过期响应误确认。 */
let ganttEventVersion = 0;
export function nextGanttEventVersion(): number {
  return ++ganttEventVersion;
}

/** 权威数据中的发送字段已全部落地（任务消失也无需继续遮蔽）。 */
export function batchValuesConfirmed(
  batch: CommittedBatch,
  authoritative: Map<number, GanttTask>,
): boolean {
  for (const item of batch.items) {
    const task = authoritative.get(item.id);
    if (!task) continue;
    if (item.start_date !== undefined && task.startDate !== item.start_date) {
      return false;
    }
    if (item.end_date !== undefined && task.endDate !== item.end_date) {
      return false;
    }
    if (item.progress !== undefined && task.progress !== item.progress) {
      return false;
    }
  }
  return true;
}

/** 一次成功提交：保留发送值、草稿快照及提交前的有效基线。 */
export interface CommittedBatch {
  /** POST 成功时的客户端序号；不是 dataUpdatedAt 或服务端版本。 */
  version: number;
  items: GanttBatchUpdateItem[];
  snapshot: Record<number, TaskDraft>;
  baseline?: Record<number, TaskDraft>;
}

/**
 * 值确认，或成功之后发起的读取证明发送字段已被其他权威值覆盖。
 * 过期读取即使晚到也不能按“值已变化”释放后提交批次；每个任务至少有
 * 一个发送字段偏离提交前值才算推进（也允许其他字段被并发恢复原值）。
 */
function batchAuthorityAdvanced(
  batch: CommittedBatch,
  authoritative: Map<number, GanttTask>,
  readVersion: number,
): boolean {
  if (readVersion <= batch.version || !batch.baseline) return false;
  return batch.items.every((item) => {
    const task = authoritative.get(item.id);
    if (!task) return true;
    const before = batch.baseline?.[item.id];
    if (!before) return false;
    return (
      (item.start_date !== undefined && task.startDate !== before.startDate) ||
      (item.end_date !== undefined && task.endDate !== before.endDate) ||
      (item.progress !== undefined && task.progress !== before.progress)
    );
  });
}

/** r29-1：权威完全回落到提交前基线，批次已不可能再被确认，释放以解除 draft 永久遮蔽。 */
function batchAuthorityRevertedToBaseline(
  batch: CommittedBatch,
  authoritative: Map<number, GanttTask>,
  readVersion: number,
): boolean {
  if (readVersion <= batch.version || !batch.baseline) return false;
  return batch.items.every((item) => {
    const task = authoritative.get(item.id);
    if (!task) return true;
    const before = batch.baseline?.[item.id];
    if (!before) return false;
    return (
      (item.start_date === undefined || task.startDate === before.startDate) &&
      (item.end_date === undefined || task.endDate === before.endDate) &&
      (item.progress === undefined || task.progress === before.progress)
    );
  });
}

export function partitionConfirmedBatches(
  log: CommittedBatch[],
  authoritative: Map<number, GanttTask>,
  readVersion = 0,
): { confirmed: CommittedBatch[]; remaining: CommittedBatch[] } {
  const confirmed: CommittedBatch[] = [];
  const remaining: CommittedBatch[] = [];
  for (const batch of log) {
    if (
      batchValuesConfirmed(batch, authoritative) ||
      batchAuthorityAdvanced(batch, authoritative, readVersion) ||
      batchAuthorityRevertedToBaseline(batch, authoritative, readVersion)
    ) {
      confirmed.push(batch);
    } else {
      remaining.push(batch);
    }
  }
  return { confirmed, remaining };
}

/**
 * r27-1：剔除"已无可释放条目"的死批次（纯逻辑）。
 * 某批快照的每个条目在当前 draft 中都不存在、或值已不同时，该批永远无法
 * 再释放任何条目（释放只删除仍等于快照的条目）——留着只会让日志无限增长
 * （如 A=11 被 B=12 覆盖后，A 批的值确认永远通不过）。
 * 未来同值的新拖拽会产生自己的新批次负责释放，裁剪不影响正确性。
 */
export function pruneDeadBatches(
  log: CommittedBatch[],
  draft: Record<number, TaskDraft>,
): CommittedBatch[] {
  return log.filter((batch) =>
    Object.entries(batch.snapshot).some(([idKey, change]) => {
      const existing = draft[Number(idKey)];
      return existing !== undefined && isSameTaskDraft(existing, change);
    }),
  );
}

/**
 * r26-2：TaskDraft 浅相等。释放已确认批次时，只从 draft 中移除"仍等于
 * 该批快照"的条目——窗口内新增的未提交拖拽（值已不同）必须保留，
 * 不能随确认批次一起被清掉。
 */
export function isSameTaskDraft(a: TaskDraft, b: TaskDraft): boolean {
  return (
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.progress === b.progress
  );
}

/**
 * r27-2：剔除草稿中"无提交日志支撑的无差量条目"（纯逻辑）。
 * 调用方在 buildBatchUpdateItems 为空（整份 draft 相对基线无差量）时调用：
 * 其中不在任何未确认批次快照中的条目，是历史无差量写入留下的污染——它们
 * 永远不会被确认释放，会永久遮蔽权威数据。r26-1 要求保留的"已提交未释放"
 * 的值必在快照中，不受影响。函数内对每条目再做一次差量防御：有差量但暂无
 * 日志支撑的条目（如正在拖动的值）必须保留。
 */
export function dropUnsupportedDraftEntries(
  draft: Record<number, TaskDraft>,
  log: CommittedBatch[],
  baseline: Map<number, GanttTask>,
): Record<number, TaskDraft> {
  const supported = new Set<number>();
  for (const batch of log) {
    for (const idKey of Object.keys(batch.snapshot)) {
      supported.add(Number(idKey));
    }
  }
  let next = draft;
  for (const idKey of Object.keys(draft)) {
    const id = Number(idKey);
    if (supported.has(id)) continue;
    const entry = draft[id];
    if (entry === undefined) continue;
    if (buildBatchUpdateItems({ [id]: entry }, baseline).length === 0) {
      if (next === draft) next = { ...draft };
      delete next[id];
    }
  }
  return next;
}

/**
 * 失败或取消只回滚本次字段：仍等于本次快照的字段从剩余成功日志恢复，
 * 没有日志支撑则删除并露出权威值。已释放值不复活，后来的修改不覆盖。
 */
export function restoreDraftAfterFailure(
  snapshot: Record<number, TaskDraft>,
  currentDraft: Record<number, TaskDraft>,
  failedItems: GanttBatchUpdateItem[],
  log: CommittedBatch[],
): Record<number, TaskDraft> {
  const committed: Record<number, TaskDraft> = {};
  for (const batch of log) Object.assign(committed, batch.snapshot);
  const restored = { ...currentDraft };
  for (const item of failedItems) {
    const current = restored[item.id];
    const failed = snapshot[item.id];
    if (!current || !failed) continue;
    const next = { ...current };
    const fields: (keyof TaskDraft)[] = [];
    if (item.start_date !== undefined) fields.push("startDate");
    if (item.end_date !== undefined) fields.push("endDate");
    if (item.progress !== undefined) fields.push("progress");
    for (const field of fields) {
      if (current[field] !== failed[field]) continue;
      const saved = committed[item.id];
      // 删除无支撑字段，使渲染露出最新权威值。
      delete next[field];
      if (saved?.[field] !== undefined) Object.assign(next, { [field]: saved[field] });
    }
    if (Object.keys(next).length === 0) delete restored[item.id];
    else restored[item.id] = next;
  }
  return restored;
}

/**
 * r25-3：甘特条宽钳制——保留至少 1.5% 的最小视觉宽度，但右端不得超过
 * 100%。长时间轴末端任务（如 100 天范围末日单日任务：起点 99%、自然
 * 宽度 1%）按旧逻辑会被拉到 100.5% 越界，与依赖连线端点（100%）错位。
 */
export function clampBarWidth(naturalWidth: number, left: number): number {
  return Math.min(Math.max(naturalWidth, 1.5), Math.max(100 - left, 0));
}

/**
 * r25-4：选中任务面板的条件关闭。
 * 旧面板的保存成功回调是闭包旧值，不能无条件关闭——若期间已选中新任务，
 * 必须保留新面板（否则新面板的未保存修改被静默丢弃，还绕过 dirty 守卫）。
 */
export function closeSelectedIfCurrent(
  current: number | null,
  taskId: number,
): number | null {
  return current === taskId ? null : current;
}

// ------------------------------------------------------------- 按键串行队列

/**
 * 按键串行执行异步任务：同一键的任务等上一个结束（无论成败）再开始，
 * 不同键互不等待。
 *
 * 甘特每次拖动都会发一次完整 batchUpdate；同一项目并发时旧请求可能后到
 * 服务端覆盖新值。按键（projectId）串行后，服务端写入顺序等于拖动顺序。
 * （移植自老前端 frontend/src/views/task/ganttSaveQueue.ts）
 */
export interface KeyedSerialQueue {
  run<T>(key: number, task: () => Promise<T>): Promise<T>;
  pending(): number;
}

export function createKeyedSerialQueue(): KeyedSerialQueue {
  const tails = new Map<number, Promise<unknown>>();
  let pendingCount = 0;
  return {
    run<T>(key: number, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      pendingCount++;
      // 前一次失败已由它自己的调用方处理，这里只等它结束；
      // 计数在任务体内扣减，保证调用方 await 返回时 pending 已不含自身
      const current = previous.catch(() => undefined).then(async () => {
        try {
          return await task();
        } finally {
          pendingCount--;
        }
      });
      const tail = current.catch(() => undefined);
      tails.set(key, tail);
      // 队尾结束且没有新任务排进来时释放，避免长期持有已完成的 Promise
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return current;
    },
    pending(): number {
      return pendingCount;
    },
  };
}

// ---------------------------------------------------------------- 里程碑

/** 里程碑状态中文标签（wire 值为小写 key，与 MILESTONE_STATUSES 一一对应） */
export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  on_hold: "已暂停",
  canceled: "已取消",
};

export function milestoneStatusLabel(status: string): string {
  return (
    (MILESTONE_STATUS_LABELS as Record<string, string>)[status] ?? status
  );
}

/**
 * 日期转 Instant：'YYYY-MM-DD' → 'YYYY-MM-DDT00:00:00Z'。
 * 后端 MilestoneCreateRequest/MilestoneUpdateRequest 的 startDate/endDate
 * 为 java.time.Instant，纯日期字符串 Jackson 无法反序列化，必须带时间。
 */
export function dateOnlyToInstant(dateOnly: string): string {
  return `${dateOnly}T00:00:00Z`;
}

/** Instant/ISO 字符串 → 'YYYY-MM-DD'（非法/空 → ""） */
export function instantToDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const dateOnly = value.slice(0, 10);
  return isValidDateOnly(dateOnly) ? dateOnly : "";
}

export interface MilestoneFormValues {
  name: string;
  status: string;
  /** 'YYYY-MM-DD' 或 ""（空） */
  startDate: string;
  /** 'YYYY-MM-DD' 或 ""（空） */
  endDate: string;
}

export interface MilestoneFieldError {
  field: "name" | "status" | "startDate" | "endDate";
  message: string;
}

/**
 * 里程碑表单校验：收集全部错误（不首错即停），调用方按 field 挂到字段下。
 */
export function validateMilestoneForm(
  values: MilestoneFormValues,
): MilestoneFieldError[] {
  const errors: MilestoneFieldError[] = [];
  if (!values.name.trim()) {
    errors.push({ field: "name", message: "里程碑名称不能为空" });
  }
  if (!(MILESTONE_STATUSES as readonly string[]).includes(values.status)) {
    errors.push({ field: "status", message: "请选择有效的里程碑状态" });
  }
  if (values.startDate && !isValidDateOnly(values.startDate)) {
    errors.push({ field: "startDate", message: "开始日期格式无效（YYYY-MM-DD）" });
  }
  if (values.endDate && !isValidDateOnly(values.endDate)) {
    errors.push({ field: "endDate", message: "结束日期格式无效（YYYY-MM-DD）" });
  }
  if (
    isValidDateOnly(values.startDate) &&
    isValidDateOnly(values.endDate) &&
    values.startDate > values.endDate
  ) {
    errors.push({ field: "endDate", message: "结束日期不能早于开始日期" });
  }
  return errors;
}

/** 里程碑更新差量载荷（字段出现即提交；日期清空用显式 null） */
export interface MilestoneUpdateDiff {
  id: number;
  name?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * 计算里程碑更新差量：只返回相对初始值变化的字段；
 * 无任何变化返回 null（调用方直接关闭，不发请求）。
 * 日期：变更且有值 → Instant；变更且被清空 → 显式 null（后端按 null 落库）。
 */
export function diffMilestoneFields(
  id: number,
  values: MilestoneFormValues,
  initial: MilestoneFormValues,
): MilestoneUpdateDiff | null {
  const diff: MilestoneUpdateDiff = { id };
  let changed = false;
  const name = values.name.trim();
  if (name !== initial.name.trim()) {
    diff.name = name;
    changed = true;
  }
  if (values.status !== initial.status) {
    diff.status = values.status;
    changed = true;
  }
  if (values.startDate !== initial.startDate) {
    diff.startDate = values.startDate ? dateOnlyToInstant(values.startDate) : null;
    changed = true;
  }
  if (values.endDate !== initial.endDate) {
    diff.endDate = values.endDate ? dateOnlyToInstant(values.endDate) : null;
    changed = true;
  }
  return changed ? diff : null;
}

/** 里程碑创建载荷（日期有值才带；空日期不发，后端保持 null） */
export function buildMilestoneCreatePayload(
  projectId: number,
  values: MilestoneFormValues,
): {
  projectId: number;
  name: string;
  status: string;
  startDate?: string;
  endDate?: string;
} {
  const payload: {
    projectId: number;
    name: string;
    status: string;
    startDate?: string;
    endDate?: string;
  } = {
    projectId,
    name: values.name.trim(),
    status: values.status,
  };
  if (values.startDate) payload.startDate = dateOnlyToInstant(values.startDate);
  if (values.endDate) payload.endDate = dateOnlyToInstant(values.endDate);
  return payload;
}

/** MilestoneResponse → 表单初始值 */
export function milestoneToFormValues(
  milestone: Pick<MilestoneResponse, "name" | "status" | "startDate" | "endDate">,
): MilestoneFormValues {
  return {
    name: milestone.name ?? "",
    status: milestone.status ?? "not_started",
    startDate: instantToDateOnly(milestone.startDate),
    endDate: instantToDateOnly(milestone.endDate),
  };
}

/** 里程碑排序：按结束日期（无则开始日期），无日期沉底（保持元素类型） */
export function sortMilestones<T extends Pick<MilestoneResponse, "startDate" | "endDate">>(
  milestones: T[],
): T[] {
  const key = (item: T) =>
    instantToDateOnly(item.endDate) || instantToDateOnly(item.startDate) || "9999-99-99";
  return [...milestones].sort((a, b) => key(a).localeCompare(key(b)));
}
