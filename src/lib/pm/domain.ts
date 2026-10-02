import { findScheduleHits, type PlanRange } from "./schedule";

export type ItemKind = "requirement" | "task" | "defect";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type ColumnId = "todo" | "doing" | "check" | "done";
export type RequirementType = "Epic" | "Story" | "Task";
export type SprintState = "planned" | "active" | "closed";
export type VersionStatus = "PLANNING" | "DEVELOPMENT" | "TESTING" | "FROZEN" | "RELEASED" | "DEPRECATED";

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  summary: string;
  leadId: string;
  memberIds: string[];
  wip?: Partial<Record<ColumnId, number>>;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  state: SprintState;
  start: string;
  end: string;
}

export interface ReleaseVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  versionType: string;
  status: VersionStatus;
  plannedReleaseDate: string;
  description: string;
}

export interface WorkItem {
  id: string;
  key: string;
  projectId: string;
  kind: ItemKind;
  requirementType: RequirementType | null;
  taskType: string | null;
  defectType: string | null;
  severity: string | null;
  title: string;
  description: string;
  priority: Priority;
  status: string;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null;
  versionId: string | null;
  parentId: string | null;
  storyPoints: number | null;
  progress: number;
  estimatedHours: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  planStart?: string;
  planEnd?: string;
  baselineStart?: string;
  baselineEnd?: string;
  rank?: number;
  dueDate?: string;
}

export interface Comment {
  id: string;
  itemId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface FeedEntry {
  id: string;
  itemId: string;
  projectId: string;
  actorId: string;
  text: string;
  createdAt: string;
}

export interface LifecycleRecord {
  id: string;
  itemId: string;
  fromStatus: string;
  toStatus: string;
  transitionName: string;
  actorId: string;
  reason: string | null;
  createdAt: string;
}

export type NoticeKind = "mention" | "item" | "sprint" | "release";

export interface Notice {
  id: string;
  text: string;
  itemId: string | null;
  read: boolean;
  createdAt: string;
  kind: NoticeKind;
}

export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
  mention: "提及",
  item: "事项",
  sprint: "迭代",
  release: "发布",
};

export type TestCaseStatus = "DRAFT" | "ACTIVE" | "REVIEW" | "ARCHIVED";
export type TestRunStatus = "CREATED" | "RUNNING" | "COMPLETED" | "CANCELLED";
export type TestResult = "PASSED" | "FAILED" | "BLOCKED" | "SKIPPED";

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestCase {
  id: string;
  key: string;
  projectId: string;
  title: string;
  testType: string;
  priority: Priority;
  status: TestCaseStatus;
  suite: string;
  requirementId: string | null;
  assigneeId: string | null;
  precondition?: string;
  steps?: TestStep[];
}

export interface TestRunReport {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  takenAt: string;
}

export interface TestRun {
  id: string;
  projectId: string;
  name: string;
  runType: string;
  status: TestRunStatus;
  environment: string;
  versionId: string | null;
  sourceRunId?: string | null;
  cancelReason?: string | null;
  report?: TestRunReport | null;
}

export interface TestExecution {
  id: string;
  runId: string;
  caseId: string;
  result: TestResult | null;
  defectId?: string | null;
}

export type WorkLogStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface WorkLog {
  id: string;
  projectId: string;
  itemId: string;
  userId: string;
  hours: number;
  workDate: string;
  note: string;
  status?: WorkLogStatus;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  sprintId: string | null;
}

export interface TestSuite {
  id: string;
  projectId: string;
  name: string;
}

export interface ReleaseEnvironment {
  id: string;
  projectId: string;
  name: string;
  kind: string;
}

export type ReleaseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PUBLISHED";

export interface ReleaseSnapshotItem {
  id: string;
  key: string;
  title: string;
  kind: ItemKind;
  status: string;
}

export interface ReleaseSnapshot {
  takenAt: string;
  items: ReleaseSnapshotItem[];
  openRequirements: number;
  openTasks: number;
  openDefects: number;
  failed: number;
  waiver: string | null;
  failures?: { key: string; title: string; result: string }[];
}

export interface ReleaseRecord {
  id: string;
  projectId: string;
  versionId: string;
  environmentId: string | null;
  title: string;
  summary: string;
  status: ReleaseStatus;
  createdAt: string;
  decisionNote?: string | null;
  snapshot?: ReleaseSnapshot | null;
}

export const WORK_LOG_STATUS_LABEL: Record<WorkLogStatus, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待审批",
  APPROVED: "已通过",
  PUBLISHED: "已发布",
};

export function workLogStatus(log: WorkLog): WorkLogStatus {
  return log.status ?? "APPROVED";
}

export type DependencyType = "FS" | "SS" | "FF" | "SF";
export type DependencyStatus = "ACTIVE" | "INACTIVE";

export interface TaskDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  lagDays: number;
  memo: string;
  status: DependencyStatus;
}

export const TEST_CASE_STATUS_LABEL: Record<TestCaseStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "生效",
  REVIEW: "评审中",
  ARCHIVED: "已归档",
};

export const TEST_RUN_STATUS_LABEL: Record<TestRunStatus, string> = {
  CREATED: "未开始",
  RUNNING: "执行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const TEST_RESULT_LABEL: Record<TestResult, string> = {
  PASSED: "通过",
  FAILED: "失败",
  BLOCKED: "阻塞",
  SKIPPED: "跳过",
};

export const DEPENDENCY_TYPE_LABEL: Record<DependencyType, string> = {
  FS: "完成-开始",
  SS: "开始-开始",
  FF: "完成-完成",
  SF: "开始-完成",
};

export const DEPENDENCY_STATUS_LABEL: Record<DependencyStatus, string> = {
  ACTIVE: "有效",
  INACTIVE: "已作废",
};

/** 沿有效依赖从 fromId 能否走到 toId。前置指向后置。 */
export function dependencyReaches(dependencies: TaskDependency[], fromId: string, toId: string) {
  const next = new Map<string, string[]>();
  for (const dependency of dependencies) {
    if (dependency.status !== "ACTIVE") continue;
    const list = next.get(dependency.predecessorId) ?? [];
    list.push(dependency.successorId);
    next.set(dependency.predecessorId, list);
  }
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === toId) return true;
    seen.add(current);
    for (const child of next.get(current) ?? []) stack.push(child);
  }
  return false;
}

export function itemPlan(item: WorkItem, sprints: Sprint[]) {
  const sprint = sprints.find((entry) => entry.id === item.sprintId);
  const start = item.planStart ?? sprint?.start;
  const end = item.planEnd ?? sprint?.end;
  if (!start || !end) return null;
  return { start: start.slice(0, 10), end: end.slice(0, 10) };
}

export function scheduleConflicts(dependencies: TaskDependency[], items: WorkItem[], sprints: Sprint[]) {
  const plans: Record<string, PlanRange> = {};
  for (const item of items) {
    const plan = itemPlan(item, sprints);
    if (plan) plans[item.id] = plan;
  }
  return findScheduleHits(dependencies, plans).flatMap((hit) => {
    const dependency = dependencies.find((entry) => entry.id === hit.id);
    const predecessor = items.find((item) => item.id === hit.predecessorId);
    const successor = items.find((item) => item.id === hit.successorId);
    if (!dependency || !predecessor || !successor) return [];
    return [{ dependency, predecessor, successor, ready: hit.ready, actual: hit.actual, from: hit.from, to: hit.to, start: hit.actual }];
  });
}

export function fsScheduleConflicts(dependencies: TaskDependency[], items: WorkItem[], sprints: Sprint[]) {
  return scheduleConflicts(dependencies, items, sprints).filter((conflict) => conflict.dependency.dependencyType === "FS");
}

/** 完成-开始：后置任务开始或继续时，未完成且未取消的前置任务构成阻塞。 */
export function fsBlockers(item: WorkItem, to: string, items: WorkItem[], dependencies: TaskDependency[]) {
  if (item.kind !== "task" || to !== "IN_PROGRESS" || (item.status !== "TODO" && item.status !== "PAUSED")) return [];
  const blockers: WorkItem[] = [];
  for (const dependency of dependencies) {
    if (dependency.status !== "ACTIVE" || dependency.dependencyType !== "FS" || dependency.successorId !== item.id) continue;
    const predecessor = items.find((entry) => entry.id === dependency.predecessorId);
    if (!predecessor || predecessor.status === "COMPLETED" || predecessor.status === "CANCELLED") continue;
    blockers.push(predecessor);
  }
  return blockers;
}

export const COLUMNS: { id: ColumnId; name: string; hint: string }[] = [
  { id: "todo", name: "待办", hint: "草稿、已批准、待开始、新建" },
  { id: "doing", name: "进行中", hint: "开发中、处理中、已暂停" },
  { id: "check", name: "验收", hint: "评审中、待验证、测试中" },
  { id: "done", name: "完成", hint: "已完成、已解决、已关闭" },
];

export const REQUIREMENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  REVIEW: "评审中",
  APPROVED: "已批准",
  IN_DEVELOPMENT: "开发中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "待开始",
  IN_PROGRESS: "进行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const DEFECT_STATUS_LABEL: Record<string, string> = {
  NEW: "新建",
  ASSIGNED: "已分配",
  IN_PROGRESS: "处理中",
  PENDING_VERIFICATION: "待验证",
  TESTING: "测试中",
  RESOLVED: "已解决",
  VERIFIED: "已验证",
  CLOSED: "已关闭",
  REOPEN: "重新打开",
  REJECTED: "已拒绝",
};

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  PLANNING: "规划中",
  DEVELOPMENT: "开发中",
  TESTING: "测试中",
  FROZEN: "已冻结",
  RELEASED: "已发布",
  DEPRECATED: "已废弃",
};

const REQUIREMENT_NEXT: Record<string, string[]> = {
  DRAFT: ["REVIEW", "CANCELLED"],
  REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["IN_DEVELOPMENT", "CANCELLED"],
  IN_DEVELOPMENT: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["DRAFT"],
};

const TASK_NEXT: Record<string, string[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: [],
};

const DEFECT_NEXT: Record<string, string[]> = {
  NEW: ["ASSIGNED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["PENDING_VERIFICATION", "TESTING"],
  PENDING_VERIFICATION: ["RESOLVED", "REJECTED"],
  TESTING: ["RESOLVED", "REJECTED", "IN_PROGRESS"],
  RESOLVED: ["VERIFIED", "CLOSED", "REOPEN"],
  VERIFIED: ["CLOSED", "REOPEN"],
  CLOSED: ["REOPEN"],
  REOPEN: ["IN_PROGRESS"],
  REJECTED: ["REOPEN", "NEW"],
};

const TRANSITION_NAME: Record<string, string> = {
  "requirement:DRAFT>REVIEW": "提交评审",
  "requirement:DRAFT>CANCELLED": "取消",
  "requirement:REVIEW>APPROVED": "批准",
  "requirement:REVIEW>DRAFT": "退回草稿",
  "requirement:APPROVED>IN_DEVELOPMENT": "开始开发",
  "requirement:APPROVED>CANCELLED": "取消",
  "requirement:IN_DEVELOPMENT>COMPLETED": "完成",
  "requirement:IN_DEVELOPMENT>CANCELLED": "取消",
  "requirement:CANCELLED>DRAFT": "恢复",
  "task:TODO>IN_PROGRESS": "开始",
  "task:TODO>CANCELLED": "取消",
  "task:IN_PROGRESS>PAUSED": "暂停",
  "task:IN_PROGRESS>COMPLETED": "完成",
  "task:IN_PROGRESS>CANCELLED": "取消",
  "task:PAUSED>IN_PROGRESS": "继续",
  "task:PAUSED>CANCELLED": "取消",
  "task:COMPLETED>IN_PROGRESS": "重新打开",
  "defect:NEW>ASSIGNED": "分配",
  "defect:NEW>REJECTED": "拒绝",
  "defect:ASSIGNED>IN_PROGRESS": "开始处理",
  "defect:IN_PROGRESS>PENDING_VERIFICATION": "提交验证",
  "defect:IN_PROGRESS>TESTING": "转入测试",
  "defect:PENDING_VERIFICATION>RESOLVED": "验证通过",
  "defect:PENDING_VERIFICATION>REJECTED": "拒绝",
  "defect:TESTING>RESOLVED": "测试通过",
  "defect:TESTING>REJECTED": "拒绝",
  "defect:TESTING>IN_PROGRESS": "退回处理",
  "defect:RESOLVED>VERIFIED": "确认已验证",
  "defect:RESOLVED>CLOSED": "关闭",
  "defect:RESOLVED>REOPEN": "重新打开",
  "defect:VERIFIED>CLOSED": "关闭",
  "defect:VERIFIED>REOPEN": "重新打开",
  "defect:CLOSED>REOPEN": "重新打开",
  "defect:REOPEN>IN_PROGRESS": "继续处理",
  "defect:REJECTED>REOPEN": "重新打开",
  "defect:REJECTED>NEW": "退回新建",
};

const REASON_NEEDED = new Set([
  "CANCELLED",
  "PAUSED",
  "REJECTED",
  "REOPEN",
  "CLOSED",
]);

export function statusLabel(kind: ItemKind, status: string) {
  if (kind === "requirement") return REQUIREMENT_STATUS_LABEL[status] ?? status;
  if (kind === "task") return TASK_STATUS_LABEL[status] ?? status;
  return DEFECT_STATUS_LABEL[status] ?? status;
}

export function nextStatuses(item: Pick<WorkItem, "kind" | "status">) {
  const table = item.kind === "requirement" ? REQUIREMENT_NEXT : item.kind === "task" ? TASK_NEXT : DEFECT_NEXT;
  return table[item.status] ?? [];
}

export function transitionName(kind: ItemKind, from: string, to: string) {
  return TRANSITION_NAME[`${kind}:${from}>${to}`] ?? `流转为${statusLabel(kind, to)}`;
}

export function needsReason(to: string) {
  return REASON_NEEDED.has(to);
}

export function byRank<T extends { rank?: number; key: string }>(a: T, b: T) {
  return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.key.localeCompare(b.key);
}

export function columnOf(kind: ItemKind, status: string): ColumnId | "cancelled" {
  if (kind === "requirement") {
    if (status === "DRAFT" || status === "APPROVED") return "todo";
    if (status === "IN_DEVELOPMENT") return "doing";
    if (status === "REVIEW") return "check";
    if (status === "COMPLETED") return "done";
    return "cancelled";
  }
  if (kind === "task") {
    if (status === "TODO") return "todo";
    if (status === "IN_PROGRESS" || status === "PAUSED") return "doing";
    if (status === "COMPLETED") return "done";
    return "cancelled";
  }
  if (status === "NEW" || status === "ASSIGNED" || status === "REOPEN") return "todo";
  if (status === "IN_PROGRESS") return "doing";
  if (status === "PENDING_VERIFICATION" || status === "TESTING") return "check";
  if (status === "RESOLVED" || status === "VERIFIED" || status === "CLOSED") return "done";
  return "cancelled";
}

export function statusForDrop(item: WorkItem, column: ColumnId): string | null {
  if (columnOf(item.kind, item.status) === column) return null;
  return nextStatuses(item).find((status) => columnOf(item.kind, status) === column) ?? null;
}

export function kindLabel(item: Pick<WorkItem, "kind" | "requirementType" | "taskType">) {
  if (item.kind === "defect") return "缺陷";
  if (item.kind === "task") return item.taskType ?? "任务";
  if (item.requirementType === "Epic") return "史诗";
  if (item.requirementType === "Story") return "故事";
  return "需求任务";
}

export function priorityLabel(priority: Priority) {
  if (priority === "HIGH") return "高";
  if (priority === "MEDIUM") return "中";
  return "低";
}

export function versionEvent(status: VersionStatus): { event: string; label: string; to: VersionStatus }[] {
  if (status === "PLANNING") return [{ event: "START_DEVELOPMENT", label: "开始开发", to: "DEVELOPMENT" }];
  if (status === "DEVELOPMENT") {
    return [
      { event: "START_TESTING", label: "开始测试", to: "TESTING" },
      { event: "RETURN_TO_PLANNING", label: "退回规划", to: "PLANNING" },
    ];
  }
  if (status === "TESTING") {
    return [
      { event: "FREEZE", label: "冻结版本", to: "FROZEN" },
      { event: "RETURN_TO_DEVELOPMENT", label: "退回开发", to: "DEVELOPMENT" },
    ];
  }
  if (status === "FROZEN") {
    return [
      { event: "REOPEN_TESTING", label: "重新测试", to: "TESTING" },
      { event: "DEPRECATE", label: "废弃版本", to: "DEPRECATED" },
    ];
  }
  if (status === "RELEASED") return [{ event: "DEPRECATE", label: "废弃版本", to: "DEPRECATED" }];
  return [];
}

export function formatDay(iso: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return `${Number(dateOnly[2])}月${Number(dateOnly[3])}日`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatRelative(iso: string, now = Date.now()) {
  const delta = now - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "刚刚";
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟前`;
  if (delta < day) return `${Math.floor(delta / hour)} 小时前`;
  if (delta < 7 * day) return `${Math.floor(delta / day)} 天前`;
  return formatDay(iso);
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "还在忙";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
