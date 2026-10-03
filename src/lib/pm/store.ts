import { create } from "zustand";
import {
  type Board,
  type ColumnId,
  type Comment,
  type FeedEntry,
  type ItemKind,
  type LifecycleRecord,
  type Notice,
  type NoticeKind,
  type Person,
  type Priority,
  type Project,
  type ReleaseEnvironment,
  type ReleaseRecord,
  type ReleaseVersion,
  type Sprint,
  type SprintState,
  type TestCase,
  type TestExecution,
  type TestStep,
  type TestSuite,
  type DependencyStatus,
  type DependencyType,
  type TestResult,
  type TestRun,
  type VersionStatus,
  type WorkItem,
  type WorkLog,
  type WorkLogStatus,
  type TaskDependency,
  columnOf,
  byRank,
  fsBlockers,
  formatDay,
  kindLabel,
  needsReason,
  nextStatuses,
  statusLabel,
  transitionName,
  dependencyReaches,
} from "./domain";
import { seed } from "./seed";
import { readStoredJson, writeStoredJson, type StorageResult } from "./persistence";
import { useAuthStore } from "../api/auth-store";

const STORAGE_KEY = "hc-pm-sample-v1";

/**
 * 后端模式（已登录）下演示数据只读：演示 store 的一切写入动作直接拒绝，
 * 返回 { ok: false } 让调用方按既有约定 toast 提示。已登录时项目列表等
 * 走真实后端，/p/* 等演示路由展示的仍是本地种子数据，写入它们只会静默
 * 篡改演示数据而不会同步到后端。等 Phase 1 接入后端项目详情后，
 * 演示路由将被真实数据替换，此门控随之移除。
 */
const BACKEND_READONLY_MESSAGE = "后端模式下演示数据为只读，项目数据将在 Phase 1 接入后端。";

function backendReadOnly(): boolean {
  try {
    return useAuthStore.getState().isAuthenticated;
  } catch {
    return false;
  }
}

export interface PmData {
  people: Person[];
  projects: Project[];
  sprints: Sprint[];
  versions: ReleaseVersion[];
  items: WorkItem[];
  comments: Comment[];
  feeds: FeedEntry[];
  histories: LifecycleRecord[];
  notices: Notice[];
  testCases: TestCase[];
  testRuns: TestRun[];
  testExecutions: TestExecution[];
  workLogs: WorkLog[];
  dependencies: TaskDependency[];
  boards: Board[];
  suites: TestSuite[];
  environments: ReleaseEnvironment[];
  releases: ReleaseRecord[];
  currentUserId: string;
}

interface PmUi {
  createOpen: boolean;
  navOpen: boolean;
  noticeOpen: boolean;
  ready: boolean;
  persistenceError: string | null;
}

export type PmActionResult = { ok: true } | { ok: false; message: string };
export type PmMoveResult = { ok: true } | { ok: false; message: string; requiresReason?: string };

interface PmActions {
  retryPersistence: () => void;
  setCreateOpen: (open: boolean) => void;
  setNavOpen: (open: boolean) => void;
  setNoticeOpen: (open: boolean) => void;
  markNoticesRead: () => void;
  markNoticeRead: (id: string) => void;
  setCurrentUser: (id: string) => void;
  moveToColumn: (id: string, column: ColumnId, reason?: string, expectedStatus?: string) => PmMoveResult;
  transition: (id: string, to: string, reason?: string) => { ok: true } | { ok: false; message: string };
  updateItem: (id: string, patch: Partial<Pick<WorkItem, "title" | "description" | "priority" | "assigneeId" | "sprintId" | "versionId" | "storyPoints" | "progress" | "planStart" | "planEnd" | "dueDate" | "tags">>) => PmActionResult;
  addComment: (itemId: string, body: string) => PmActionResult;
  createItem: (input: {
    projectId: string;
    kind: ItemKind;
    requirementType?: WorkItem["requirementType"];
    taskType?: string | null;
    defectType?: string | null;
    severity?: string | null;
    title: string;
    description: string;
    priority: Priority;
    assigneeId: string | null;
    sprintId: string | null;
    parentId?: string | null;
  }) => string;
  startSprint: (id: string) => { ok: true } | { ok: false; message: string };
  completeSprint: (id: string) => void;
  transitionVersion: (id: string, to: VersionStatus) => void;
  createVersion: (input: { projectId: string; name: string; versionNumber: string; plannedReleaseDate: string; description: string }) => { ok: true } | { ok: false; message: string };
  createProject: (input: { key: string; name: string; summary: string; leadId: string }) => { ok: true; key: string } | { ok: false; message: string };
  updateSprint: (id: string, patch: Partial<Pick<Sprint, "start" | "end">>) => void;
  updateVersion: (id: string, patch: Partial<Pick<ReleaseVersion, "plannedReleaseDate">>) => void;
  recordExecution: (id: string, result: TestResult) => { ok: true } | { ok: false; message: string };
  createRun: (input: {
    projectId: string;
    name: string;
    runType: string;
    environment: string;
    versionId: string | null;
    caseIds: string[];
    sourceRunId?: string | null;
  }) => { ok: true; id: string } | { ok: false; message: string };
  startRun: (id: string) => { ok: true } | { ok: false; message: string };
  completeRun: (id: string) => { ok: true } | { ok: false; message: string };
  cancelRun: (id: string, reason: string) => { ok: true } | { ok: false; message: string };
  createDefectFromExecution: (id: string) => { ok: true; itemId: string } | { ok: false; message: string };
  addWorkLog: (input: { projectId: string; itemId: string; hours: number; workDate: string; note: string }) => { ok: boolean; message?: string };
  addDependency: (input: {
    projectId: string;
    predecessorId: string;
    successorId: string;
    dependencyType: DependencyType;
    lagDays: number;
    memo: string;
  }) => { ok: true } | { ok: false; message: string };
  setDependencyStatus: (id: string, status: DependencyStatus) => { ok: true } | { ok: false; message: string };
  updateProject: (id: string, patch: Partial<Pick<Project, "name" | "summary" | "memberIds" | "leadId" | "wip">>) => { ok: true } | { ok: false; message: string };
  createSprint: (input: { projectId: string; name: string; goal: string; start: string; end: string }) => { ok: true } | { ok: false; message: string };
  createBoard: (input: { projectId: string; name: string; sprintId: string | null }) => { ok: true } | { ok: false; message: string };
  renameBoard: (id: string, name: string) => { ok: true } | { ok: false; message: string };
  createSuite: (input: { projectId: string; name: string }) => { ok: true } | { ok: false; message: string };
  saveCaseSteps: (id: string, steps: TestStep[]) => void;
  updateCase: (id: string, patch: { precondition?: string; steps?: TestStep[]; status?: TestCase["status"]; suite?: string; requirementId?: string | null }) => { ok: true } | { ok: false; message: string };
  copyCase: (id: string) => { ok: true; id: string } | { ok: false; message: string };
  assignCaseSuite: (id: string, suite: string) => { ok: true } | { ok: false; message: string };
  reviewWorkLog: (id: string, status: Exclude<WorkLogStatus, "PENDING">) => { ok: true } | { ok: false; message: string };
  updateWorkLog: (id: string, patch: { hours: number; workDate: string; note: string }) => { ok: true } | { ok: false; message: string };
  setItemPlans: (updates: { id: string; planStart: string; planEnd: string }[]) => void;
  saveBaseline: (projectId: string) => { ok: true; count: number } | { ok: false; message: string };
  placeItem: (id: string, beforeId: string | null, laneIds: string[]) => void;
  cloneItem: (id: string) => { ok: true; id: string; key: string } | { ok: false; message: string };
  createEnvironment: (input: { projectId: string; name: string; kind: string }) => { ok: true } | { ok: false; message: string };
  setItemVersion: (itemId: string, versionId: string | null) => { ok: true } | { ok: false; message: string };
  createRelease: (input: { projectId: string; versionId: string; environmentId: string | null; title: string; summary: string }) => { ok: true; id: string } | { ok: false; message: string };
  submitRelease: (id: string) => { ok: true } | { ok: false; message: string };
  decideRelease: (id: string, decision: "APPROVED" | "DRAFT", note: string) => { ok: true } | { ok: false; message: string };
  publishRelease: (id: string, waiver: string) => { ok: true } | { ok: false; message: string };
  reset: () => void;
  replaceData: (data: PmData) => void;
}

export type PmState = PmData & PmUi & PmActions;

function nowIso() {
  return new Date().toISOString();
}

function rankBefore(items: { id: string; rank?: number; key: string }[], movingId: string, beforeId: string | null) {
  const others = items.filter((entry) => entry.id !== movingId).sort(byRank);
  const index = beforeId ? others.findIndex((entry) => entry.id === beforeId) : others.length;
  const at = index < 0 ? others.length : index;
  const prev = others[at - 1];
  const next = others[at];
  if (prev?.rank != null && next?.rank != null) return (prev.rank + next.rank) / 2;
  if (prev?.rank != null) return prev.rank + 1;
  if (next?.rank != null) return next.rank - 1;
  return 0;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function cloneSeed(): PmData {
  return structuredClone(seed);
}

const seedItemsById = new Map(seed.items.map((item) => [item.id, item]));
const seedCasesById = new Map(seed.testCases.map((item) => [item.id, item]));
const seedLogsById = new Map(seed.workLogs.map((item) => [item.id, item]));

function personName(data: PmData, id: string | null) {
  if (!id) return "未分配";
  return data.people.find((person) => person.id === id)?.name ?? "未知";
}

function releaseGate(data: PmData, versionId: string) {
  const scope = data.items.filter((item) => item.versionId === versionId);
  const open = (item: WorkItem) => {
    const column = columnOf(item.kind, item.status);
    return column !== "done" && column !== "cancelled";
  };
  const requirementIds = new Set(scope.filter((item) => item.kind === "requirement").map((item) => item.id));
  const caseIds = new Set(data.testCases.filter((entry) => entry.requirementId && requirementIds.has(entry.requirementId)).map((entry) => entry.id));
  const runIds = new Set(data.testRuns.filter((run) => run.versionId === versionId && run.status !== "CANCELLED").map((run) => run.id));
  const failedRows = data.testExecutions.filter((execution) => runIds.has(execution.runId) && caseIds.has(execution.caseId) && (execution.result === "FAILED" || execution.result === "BLOCKED"));
  const openRequirements = scope.filter((item) => item.kind === "requirement" && open(item)).length;
  const openTasks = scope.filter((item) => item.kind === "task" && open(item)).length;
  const openDefects = scope.filter((item) => item.kind === "defect" && open(item)).length;
  return {
    scope,
    openRequirements,
    openTasks,
    openDefects,
    failed: failedRows.length,
    failures: failedRows.map((execution) => {
      const testCase = data.testCases.find((entry) => entry.id === execution.caseId);
      return { key: testCase?.key ?? execution.caseId, title: testCase?.title ?? "", result: execution.result ?? "" };
    }),
    ready: scope.length > 0 && openRequirements === 0 && openTasks === 0 && openDefects === 0 && failedRows.length === 0,
  };
}

export const usePm = create<PmState>((set, get) => ({
  ...seed,
  createOpen: false,
  navOpen: false,
  noticeOpen: false,
  ready: false,
  persistenceError: null,
  retryPersistence: () => {
    if (!get().ready) { bindPmPersistence(); return; }
    const result = persistPm(get());
    set({ persistenceError: result.ok ? null : result.message });
  },
  setCreateOpen: (open) => set({ createOpen: open }),
  setNavOpen: (open) => set({ navOpen: open }),
  setNoticeOpen: (open) => set({ noticeOpen: open }),
  markNoticesRead: () => {
    if (backendReadOnly()) return;
    set({ notices: get().notices.map((notice) => ({ ...notice, read: true })) });
  },
  markNoticeRead: (id) => {
    if (backendReadOnly()) return;
    set({ notices: get().notices.map((notice) => (notice.id === id ? { ...notice, read: true } : notice)) });
  },
  setCurrentUser: (id) => {
    if (backendReadOnly()) return;
    if (!get().people.some((person) => person.id === id)) return;
    set({ currentUserId: id });
  },
  moveToColumn: (id, column, reason, expectedStatus) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const item = get().items.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: "事项不存在" };
    if (expectedStatus !== undefined && item.status !== expectedStatus) {
      return { ok: false, message: "事项状态已变化，请重新选择流转。" };
    }
    if (columnOf(item.kind, item.status) === column) return { ok: true };
    const target = nextStatuses(item).find((status) => columnOf(item.kind, status) === column);
    if (!target) {
      const allowed = nextStatuses(item);
      if (allowed.length === 0) {
        return { ok: false, message: `${item.key} 当前是${statusLabel(item.kind, item.status)}，没有可继续的流转。` };
      }
      const names = allowed.map((status) => transitionName(item.kind, item.status, status)).join("、");
      return {
        ok: false,
        message: `${item.key} 不能直接拖到这一列。当前可执行：${names}。`,
      };
    }
    if (needsReason(target) && !reason?.trim()) {
      return { ok: false, requiresReason: target, message: "这次流转需要填写真实原因。" };
    }
    return get().transition(id, target, reason);
  },
  transition: (id, to, reason) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const item = data.items.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: "事项不存在" };
    if (!nextStatuses(item).includes(to)) {
      return { ok: false, message: `${item.key} 不能从${statusLabel(item.kind, item.status)}流转到${statusLabel(item.kind, to)}。` };
    }
    if (needsReason(to) && !reason?.trim()) {
      return { ok: false, message: "这次流转需要填写原因。" };
    }
    const name = transitionName(item.kind, item.status, to);
    const blockers = fsBlockers(item, to, data.items, data.dependencies);
    if (blockers.length > 0) {
      const names = blockers.map((entry) => `${entry.key} ${entry.title}`).join("、");
      return { ok: false, message: `${item.key} 还不能${name}。完成-开始依赖未满足，前置任务未完成：${names}。` };
    }
    const at = nowIso();
    const actorId = data.currentUserId;
    const history: LifecycleRecord = {
      id: uid("h"),
      itemId: id,
      fromStatus: item.status,
      toStatus: to,
      transitionName: name,
      actorId,
      reason: reason?.trim() || null,
      createdAt: at,
    };
    const feed: FeedEntry = {
      id: uid("f"),
      itemId: id,
      projectId: item.projectId,
      actorId,
      text: `将 ${item.key} 从${statusLabel(item.kind, item.status)}流转为${statusLabel(item.kind, to)}（${name}）。`,
      createdAt: at,
    };
    set({
      items: data.items.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: to,
              progress: to === "COMPLETED" || to === "CLOSED" || to === "RESOLVED" ? 100 : entry.progress,
              updatedAt: at,
            }
          : entry,
      ),
      histories: [history, ...data.histories],
      feeds: [feed, ...data.feeds],
    });
    return { ok: true };
  },
  updateItem: (id, patch) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const item = data.items.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: "事项不存在。" };
    if (patch.versionId !== undefined && patch.versionId !== item.versionId) {
      const locked = (versionId: string | null) => {
        const version = data.versions.find((entry) => entry.id === versionId);
        return version && ["FROZEN", "RELEASED", "DEPRECATED"].includes(version.status);
      };
      if (locked(item.versionId) || locked(patch.versionId)) {
        return { ok: false, message: "版本已冻结、发布或废弃，不能改范围。" };
      }
      if (patch.versionId !== null && !data.versions.some((entry) => entry.id === patch.versionId && entry.projectId === item.projectId)) {
        return { ok: false, message: "版本不属于这个项目。" };
      }
    }
    const at = nowIso();
    const actorId = data.currentUserId;
    const feeds = [...data.feeds];
    if (patch.assigneeId !== undefined && patch.assigneeId !== item.assigneeId) {
      feeds.unshift({
        id: uid("f"),
        itemId: id,
        projectId: item.projectId,
        actorId,
        text: `将 ${item.key} 的负责人改为${personName(data, patch.assigneeId)}。`,
        createdAt: at,
      });
    }
    if (patch.sprintId !== undefined && patch.sprintId !== item.sprintId) {
      const sprint = data.sprints.find((entry) => entry.id === patch.sprintId);
      feeds.unshift({
        id: uid("f"),
        itemId: id,
        projectId: item.projectId,
        actorId,
        text: sprint ? `将 ${item.key} 排入${sprint.name}。` : `将 ${item.key} 移回待办。`,
        createdAt: at,
      });
    }
    if ((patch.planStart !== undefined && patch.planStart !== item.planStart) || (patch.planEnd !== undefined && patch.planEnd !== item.planEnd)) {
      const start = patch.planStart ?? item.planStart;
      const end = patch.planEnd ?? item.planEnd;
      feeds.unshift({
        id: uid("f"),
        itemId: id,
        projectId: item.projectId,
        actorId,
        text: start && end ? `将 ${item.key} 的计划调整为 ${formatDay(start)} 至 ${formatDay(end)}。` : `调整了 ${item.key} 的计划日期。`,
        createdAt: at,
      });
    }
    set({
      feeds,
      items: data.items.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: at } : entry)),
    });
    return { ok: true };
  },
  addComment: (itemId, body) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const text = body.trim();
    if (!text) return { ok: false, message: "评论内容不能为空" };
    const at = nowIso();
    const comment: Comment = { id: uid("c"), itemId, authorId: get().currentUserId, body: text, createdAt: at };
    set({
      comments: [...get().comments, comment],
      items: get().items.map((entry) => (entry.id === itemId ? { ...entry, updatedAt: at } : entry)),
    });
    return { ok: true };
  },
  createItem: (input) => {
    if (backendReadOnly()) return "";
    const data = get();
    const project = data.projects.find((entry) => entry.id === input.projectId);
    if (!project) return "";
    const numbers = data.items
      .filter((entry) => entry.projectId === project.id)
      .map((entry) => Number(entry.key.split("-")[1]))
      .filter((value) => Number.isFinite(value));
    const next = Math.max(0, ...numbers) + 1;
    const at = nowIso();
    const id = uid("it");
    const status = input.kind === "requirement" ? "DRAFT" : input.kind === "task" ? "TODO" : "NEW";
    const created: WorkItem = {
      id,
      key: `${project.key}-${next}`,
      projectId: project.id,
      kind: input.kind,
      requirementType: input.kind === "requirement" ? input.requirementType ?? "Story" : null,
      taskType: input.kind === "task" ? input.taskType ?? "开发任务" : null,
      defectType: input.kind === "defect" ? input.defectType ?? "功能缺陷" : null,
      severity: input.kind === "defect" ? input.severity ?? "NORMAL" : null,
      title: input.title.trim(),
      description: input.description.trim(),
      priority: input.priority,
      status,
      assigneeId: input.assigneeId,
      reporterId: data.currentUserId,
      sprintId: input.sprintId,
      versionId: null,
      parentId: input.parentId ?? null,
      storyPoints: input.kind === "defect" ? null : 1,
      progress: 0,
      estimatedHours: input.kind === "task" ? 4 : null,
      tags: [],
      rank: rankBefore(data.items, id, [...data.items].sort(byRank)[0]?.id ?? null),
      createdAt: at,
      updatedAt: at,
    };
    const feed: FeedEntry = {
      id: uid("f"),
      itemId: id,
      projectId: project.id,
      actorId: data.currentUserId,
      text: `创建了${kindLabel(created)} ${created.key}。`,
      createdAt: at,
    };
    set({
      items: [created, ...data.items],
      feeds: [feed, ...data.feeds],
      createOpen: false,
    });
    return id;
  },
  startSprint: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const sprint = data.sprints.find((entry) => entry.id === id);
    if (!sprint) return { ok: false, message: "迭代不存在" };
    if (sprint.state !== "planned") return { ok: false, message: "只有规划中的迭代可以开始" };
    const active = data.sprints.find((entry) => entry.projectId === sprint.projectId && entry.state === "active");
    if (active) return { ok: false, message: `${active.name} 还在进行，先完成它。` };
    set({
      sprints: data.sprints.map((entry) => (entry.id === id ? { ...entry, state: "active" as SprintState } : entry)),
    });
    return { ok: true };
  },
  completeSprint: (id) => {
    if (backendReadOnly()) return;
    const data = get();
    const sprint = data.sprints.find((entry) => entry.id === id);
    if (!sprint || sprint.state !== "active") return;
    const at = nowIso();
    set({
      sprints: data.sprints.map((entry) => (entry.id === id ? { ...entry, state: "closed" as SprintState } : entry)),
      items: data.items.map((entry) => {
        if (entry.sprintId !== id) return entry;
        const column = entry.status === "COMPLETED" || entry.status === "CLOSED" || entry.status === "RESOLVED" || entry.status === "VERIFIED";
        if (column) return entry;
        return { ...entry, sprintId: null, updatedAt: at };
      }),
    });
  },
  transitionVersion: (id, to) => {
    if (backendReadOnly()) return;
    set({
      versions: get().versions.map((entry) => (entry.id === id ? { ...entry, status: to } : entry)),
    });
  },
  createVersion: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const name = input.name.trim();
    const versionNumber = input.versionNumber.trim();
    if (!name || !versionNumber) return { ok: false, message: "版本号和名称都不能为空。" };
    if (!input.plannedReleaseDate) return { ok: false, message: "请填写计划发布日。" };
    if (get().versions.some((entry) => entry.projectId === input.projectId && entry.versionNumber === versionNumber)) {
      return { ok: false, message: "这个项目里已有相同版本号。" };
    }
    const entry: ReleaseVersion = {
      id: uid("ver"),
      projectId: input.projectId,
      name,
      versionNumber,
      versionType: "常规",
      status: "PLANNING",
      plannedReleaseDate: input.plannedReleaseDate,
      description: input.description.trim(),
    };
    set({ versions: [...get().versions, entry] });
    return { ok: true };
  },
  createProject: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const key = input.key.trim().toUpperCase();
    const name = input.name.trim();
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(key)) return { ok: false, message: "项目键用 2 到 8 位大写字母或数字，并以字母开头。" };
    if (!name) return { ok: false, message: "项目名称不能为空。" };
    if (get().projects.some((entry) => entry.key === key)) return { ok: false, message: "项目键已存在。" };
    if (!get().people.some((person) => person.id === input.leadId)) return { ok: false, message: "请选择负责人。" };
    const project: Project = {
      id: uid("pr"),
      key,
      name,
      summary: input.summary.trim(),
      leadId: input.leadId,
      memberIds: [input.leadId],
    };
    set({ projects: [...get().projects, project] });
    return { ok: true, key };
  },
  updateSprint: (id, patch) => {
    if (backendReadOnly()) return;
    set({
      sprints: get().sprints.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  },
  updateVersion: (id, patch) => {
    if (backendReadOnly()) return;
    set({
      versions: get().versions.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  },
  recordExecution: (id, result) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const execution = data.testExecutions.find((entry) => entry.id === id);
    if (!execution) return { ok: false, message: "执行不存在。" };
    const run = data.testRuns.find((entry) => entry.id === execution.runId);
    if (!run || run.status !== "RUNNING") return { ok: false, message: "只有执行中的运行可以记结果。" };
    set({
      testExecutions: data.testExecutions.map((entry) => (entry.id === id ? { ...entry, result } : entry)),
    });
    return { ok: true };
  },
  createRun: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const name = input.name.trim();
    if (!name) return { ok: false, message: "请填写运行名称。" };
    if (name.length > 40) return { ok: false, message: "运行名称请控制在 40 字以内。" };
    const environment = input.environment.trim();
    if (!environment) return { ok: false, message: "请选择环境。" };
    const caseIds = [...new Set(input.caseIds)];
    if (caseIds.length === 0) return { ok: false, message: "这次运行至少要有一条用例。" };
    const selected = caseIds.map((id) => data.testCases.find((entry) => entry.id === id));
    if (selected.some((entry) => !entry || entry.projectId !== input.projectId)) {
      return { ok: false, message: "有用例不属于当前项目。" };
    }
    if (selected.some((entry) => entry?.status === "ARCHIVED")) {
      return { ok: false, message: "已归档用例不能加入运行。" };
    }
    if (input.versionId && !data.versions.some((entry) => entry.id === input.versionId && entry.projectId === input.projectId)) {
      return { ok: false, message: "版本不属于当前项目。" };
    }
    if (input.runType === "定向复测") {
      const source = data.testRuns.find((entry) => entry.id === input.sourceRunId);
      if (!source || source.projectId !== input.projectId) return { ok: false, message: "来源运行不存在。" };
      if (source.status !== "COMPLETED") return { ok: false, message: "只有已完成的运行可以发起定向复测。" };
      const allowed = new Set(
        data.testExecutions.filter((entry) => entry.runId === source.id && (entry.result === "FAILED" || entry.result === "BLOCKED")).map((entry) => entry.caseId),
      );
      if (caseIds.some((id) => !allowed.has(id))) return { ok: false, message: "定向复测只包含来源运行里失败或阻塞的用例。" };
    }
    const id = uid("tr");
    const run: TestRun = {
      id,
      projectId: input.projectId,
      name,
      runType: input.runType,
      status: "CREATED",
      environment,
      versionId: input.versionId,
      sourceRunId: input.sourceRunId ?? null,
      cancelReason: null,
    };
    const executions: TestExecution[] = caseIds.map((caseId) => ({
      id: uid("ex"),
      runId: id,
      caseId,
      result: null,
      defectId: null,
    }));
    set({
      testRuns: [run, ...data.testRuns],
      testExecutions: [...executions, ...data.testExecutions],
    });
    return { ok: true, id };
  },
  startRun: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const run = get().testRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, message: "运行不存在。" };
    if (run.status !== "CREATED") return { ok: false, message: "只有未开始的运行可以开始。" };
    set({ testRuns: get().testRuns.map((entry) => (entry.id === id ? { ...entry, status: "RUNNING" } : entry)) });
    return { ok: true };
  },
  completeRun: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const run = data.testRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, message: "运行不存在。" };
    if (run.status !== "RUNNING") return { ok: false, message: "只有执行中的运行可以完成。" };
    const rows = data.testExecutions.filter((entry) => entry.runId === id);
    if (rows.length === 0 || rows.some((entry) => !entry.result)) {
      return { ok: false, message: "还有未记结果的用例，不能完成这次运行。" };
    }
    const count = (result: TestResult) => rows.filter((entry) => entry.result === result).length;
    const report = {
      passed: count("PASSED"),
      failed: count("FAILED"),
      blocked: count("BLOCKED"),
      skipped: count("SKIPPED"),
      total: rows.length,
      takenAt: nowIso(),
    };
    set({ testRuns: data.testRuns.map((entry) => (entry.id === id ? { ...entry, status: "COMPLETED" as const, report } : entry)) });
    return { ok: true };
  },
  cancelRun: (id, reason) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const text = reason.trim();
    if (!text) return { ok: false, message: "取消需要填写原因。" };
    const run = get().testRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, message: "运行不存在。" };
    if (run.status === "COMPLETED") return { ok: false, message: "已完成的运行不能取消。" };
    if (run.status === "CANCELLED") return { ok: false, message: "这次运行已经取消。" };
    set({
      testRuns: get().testRuns.map((entry) => (entry.id === id ? { ...entry, status: "CANCELLED", cancelReason: text } : entry)),
    });
    return { ok: true };
  },
  createDefectFromExecution: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const execution = data.testExecutions.find((entry) => entry.id === id);
    if (!execution) return { ok: false, message: "执行不存在。" };
    if (execution.result !== "FAILED" && execution.result !== "BLOCKED") {
      return { ok: false, message: "只有失败或阻塞的执行可以建缺陷。" };
    }
    if (execution.defectId) {
      const linked = data.items.find((entry) => entry.id === execution.defectId);
      return { ok: false, message: linked ? `这条执行已经关联 ${linked.key}。` : "这条执行已经关联缺陷。" };
    }
    const run = data.testRuns.find((entry) => entry.id === execution.runId);
    const testCase = data.testCases.find((entry) => entry.id === execution.caseId);
    const project = data.projects.find((entry) => entry.id === run?.projectId);
    if (!run || !testCase || !project) return { ok: false, message: "运行或用例不存在。" };
    const numbers = data.items
      .filter((entry) => entry.projectId === project.id)
      .map((entry) => Number(entry.key.split("-")[1]))
      .filter((value) => Number.isFinite(value));
    const next = Math.max(0, ...numbers) + 1;
    const at = nowIso();
    const itemId = uid("it");
    const label = execution.result === "FAILED" ? "失败" : "阻塞";
    const created: WorkItem = {
      id: itemId,
      key: `${project.key}-${next}`,
      projectId: project.id,
      kind: "defect",
      requirementType: null,
      taskType: null,
      defectType: "功能缺陷",
      severity: execution.result === "FAILED" ? "MAJOR" : "NORMAL",
      title: `${label}：${testCase.key} ${testCase.title}`,
      description: `来自测试运行「${run.name}」。环境 ${run.environment}。结果 ${label}。`,
      priority: testCase.priority,
      status: "NEW",
      assigneeId: testCase.assigneeId ?? data.currentUserId,
      reporterId: data.currentUserId,
      sprintId: null,
      versionId: run.versionId,
      parentId: testCase.requirementId,
      storyPoints: null,
      progress: 0,
      estimatedHours: null,
      tags: ["测试"],
      rank: rankBefore(data.items, itemId, [...data.items].sort(byRank)[0]?.id ?? null),
      createdAt: at,
      updatedAt: at,
    };
    const feed: FeedEntry = {
      id: uid("f"),
      itemId,
      projectId: project.id,
      actorId: data.currentUserId,
      text: `从测试运行「${run.name}」创建了缺陷 ${created.key}。`,
      createdAt: at,
    };
    set({
      items: [created, ...data.items],
      feeds: [feed, ...data.feeds],
      testExecutions: data.testExecutions.map((entry) => (entry.id === id ? { ...entry, defectId: itemId } : entry)),
    });
    return { ok: true, itemId };
  },
  addWorkLog: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const entry: WorkLog = {
      id: uid("wl"),
      projectId: input.projectId,
      itemId: input.itemId,
      userId: get().currentUserId,
      hours: input.hours,
      workDate: input.workDate,
      note: input.note.trim(),
      status: "PENDING",
    };
    set({ workLogs: [entry, ...get().workLogs] });
    return { ok: true };
  },
  addDependency: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    if (!input.predecessorId || !input.successorId) return { ok: false, message: "请选择前置任务和后置任务。" };
    const predecessor = data.items.find((item) => item.id === input.predecessorId);
    const successor = data.items.find((item) => item.id === input.successorId);
    if (!predecessor || !successor || predecessor.projectId !== input.projectId || successor.projectId !== input.projectId) {
      return { ok: false, message: "前后置任务都必须属于当前项目。" };
    }
    if (predecessor.kind !== "task" || successor.kind !== "task") {
      return { ok: false, message: "依赖只加在任务上。" };
    }
    if (predecessor.id === successor.id) {
      return { ok: false, message: "前置任务和后置任务不能是同一个。" };
    }
    const lagDays = Math.round(input.lagDays);
    if (!Number.isFinite(lagDays) || lagDays < 0 || lagDays > 60) {
      return { ok: false, message: "延迟天数要在 0 到 60 之间。" };
    }
    const samePair = data.dependencies.find((entry) => entry.predecessorId === predecessor.id && entry.successorId === successor.id);
    if (samePair?.status === "ACTIVE") return { ok: false, message: "这对任务已经有一条有效依赖。" };
    if (samePair) return { ok: false, message: "这对任务有一条已作废的依赖，请直接启用。" };
    if (dependencyReaches(data.dependencies, successor.id, predecessor.id)) {
      return { ok: false, message: `加上这条会成环：${successor.key} 已经能走到 ${predecessor.key}。` };
    }
    const entry: TaskDependency = {
      id: uid("dep"),
      projectId: input.projectId,
      predecessorId: predecessor.id,
      successorId: successor.id,
      dependencyType: input.dependencyType,
      lagDays,
      memo: input.memo.trim(),
      status: "ACTIVE",
    };
    set({ dependencies: [entry, ...data.dependencies] });
    return { ok: true };
  },
  setDependencyStatus: (id, status) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const current = data.dependencies.find((entry) => entry.id === id);
    if (!current) return { ok: false, message: "依赖不存在。" };
    if (status === "ACTIVE") {
      const next = data.dependencies.map((entry) => (entry.id === id ? { ...entry, status: "ACTIVE" as const } : entry));
      if (dependencyReaches(next, current.successorId, current.predecessorId)) {
        return { ok: false, message: "启用后会和现有有效依赖形成循环。" };
      }
    }
    set({
      dependencies: data.dependencies.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
    });
    return { ok: true };
  },
  updateProject: (id, patch) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const project = get().projects.find((entry) => entry.id === id);
    if (!project) return { ok: false, message: "项目不存在。" };
    const name = patch.name?.trim() ?? project.name;
    if (!name) return { ok: false, message: "项目名称不能为空。" };
    const memberIds = patch.memberIds ?? project.memberIds;
    const leadId = patch.leadId ?? project.leadId;
    if (!memberIds.includes(leadId)) return { ok: false, message: "负责人必须是项目成员。" };
    set({
      projects: get().projects.map((entry) =>
        entry.id === id ? { ...entry, name, summary: patch.summary?.trim() ?? entry.summary, memberIds, leadId, wip: patch.wip ?? entry.wip } : entry,
      ),
    });
    return { ok: true };
  },
  createSprint: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const name = input.name.trim();
    if (!name) return { ok: false, message: "迭代名称不能为空。" };
    if (!input.start || !input.end || input.end < input.start) return { ok: false, message: "结束日期不能早于开始日期。" };
    const entry: Sprint = {
      id: uid("sp"),
      projectId: input.projectId,
      name,
      goal: input.goal.trim(),
      state: "planned",
      start: input.start,
      end: input.end,
    };
    set({ sprints: [...get().sprints, entry] });
    return { ok: true };
  },
  createBoard: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const name = input.name.trim();
    if (!name) return { ok: false, message: "看板名称不能为空。" };
    const entry: Board = { id: uid("bd"), projectId: input.projectId, name, sprintId: input.sprintId };
    set({ boards: [...get().boards, entry] });
    return { ok: true };
  },
  renameBoard: (id, name) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const next = name.trim();
    if (!next) return { ok: false, message: "看板名称不能为空。" };
    const board = get().boards.find((entry) => entry.id === id);
    if (!board) return { ok: false, message: "看板不存在。" };
    if (next === board.name) return { ok: true };
    set({ boards: get().boards.map((entry) => (entry.id === id ? { ...entry, name: next } : entry)) });
    return { ok: true };
  },
  createSuite: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const name = input.name.trim();
    if (!name) return { ok: false, message: "套件名称不能为空。" };
    if (get().suites.some((entry) => entry.projectId === input.projectId && entry.name === name)) {
      return { ok: false, message: "这个项目已有同名套件。" };
    }
    set({ suites: [...get().suites, { id: uid("ts"), projectId: input.projectId, name }] });
    return { ok: true };
  },
  saveCaseSteps: (id, steps) => {
    if (backendReadOnly()) return;
    set({
      testCases: get().testCases.map((entry) =>
        entry.id === id ? { ...entry, steps: steps.map((step) => ({ action: step.action.trim(), expected: step.expected.trim() })).filter((step) => step.action || step.expected) } : entry,
      ),
    });
  },
  updateCase: (id, patch) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const current = get().testCases.find((entry) => entry.id === id);
    if (!current) return { ok: false, message: "用例不存在。" };
    const steps = patch.steps?.map((step) => ({ action: step.action.trim(), expected: step.expected.trim() })).filter((step) => step.action || step.expected);
    if (patch.suite !== undefined && patch.suite.trim() && !get().suites.some((entry) => entry.projectId === current.projectId && entry.name === patch.suite?.trim())) {
      return { ok: false, message: "套件不存在。" };
    }
    if (patch.requirementId) {
      const requirement = get().items.find((item) => item.id === patch.requirementId);
      if (!requirement || requirement.kind !== "requirement" || requirement.projectId !== current.projectId) {
        return { ok: false, message: "关联需求不属于这个项目。" };
      }
    }
    set({
      testCases: get().testCases.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              precondition: patch.precondition !== undefined ? patch.precondition.trim() : entry.precondition,
              steps: steps ?? entry.steps,
              status: patch.status ?? entry.status,
              suite: patch.suite !== undefined ? patch.suite.trim() : entry.suite,
              requirementId: patch.requirementId !== undefined ? patch.requirementId : entry.requirementId,
            }
          : entry,
      ),
    });
    return { ok: true };
  },
  copyCase: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const current = data.testCases.find((entry) => entry.id === id);
    if (!current) return { ok: false, message: "用例不存在。" };
    const numbers = data.testCases
      .filter((entry) => entry.projectId === current.projectId)
      .map((entry) => Number(entry.key.split("-")[1]))
      .filter((value) => Number.isFinite(value));
    const next = Math.max(0, ...numbers) + 1;
    const created: TestCase = {
      ...current,
      id: uid("tc"),
      key: `TC-${next}`,
      title: `${current.title} 副本`.slice(0, 80),
      status: "DRAFT",
      steps: current.steps?.map((step) => ({ ...step })),
    };
    set({ testCases: [created, ...data.testCases] });
    return { ok: true, id: created.id };
  },
  assignCaseSuite: (id, suite) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const name = suite.trim();
    const current = get().testCases.find((entry) => entry.id === id);
    if (!current) return { ok: false, message: "用例不存在。" };
    if (name && !get().suites.some((entry) => entry.projectId === current.projectId && entry.name === name)) {
      return { ok: false, message: "套件不存在。" };
    }
    set({ testCases: get().testCases.map((entry) => (entry.id === id ? { ...entry, suite: name } : entry)) });
    return { ok: true };
  },
  reviewWorkLog: (id, status) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const log = get().workLogs.find((entry) => entry.id === id);
    if (!log) return { ok: false, message: "工时不存在。" };
    if ((log.status ?? "APPROVED") !== "PENDING") return { ok: false, message: "只有待审批的工时可以处理。" };
    set({ workLogs: get().workLogs.map((entry) => (entry.id === id ? { ...entry, status } : entry)) });
    return { ok: true };
  },
  updateWorkLog: (id, patch) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const log = get().workLogs.find((entry) => entry.id === id);
    if (!log) return { ok: false, message: "工时不存在。" };
    if ((log.status ?? "APPROVED") !== "PENDING") return { ok: false, message: "已通过或已驳回的工时不能改，请另记一条。" };
    if (!Number.isFinite(patch.hours) || patch.hours <= 0 || patch.hours > 24) return { ok: false, message: "工时要在 0 到 24 小时之间。" };
    if (!patch.workDate) return { ok: false, message: "请填写日期。" };
    set({
      workLogs: get().workLogs.map((entry) =>
        entry.id === id ? { ...entry, hours: patch.hours, workDate: patch.workDate, note: patch.note.trim() } : entry,
      ),
    });
    return { ok: true };
  },
  setItemPlans: (updates) => {
    if (backendReadOnly()) return;
    const data = get();
    const at = nowIso();
    let items = data.items;
    const feeds = [...data.feeds];
    for (const update of updates) {
      const item = items.find((entry) => entry.id === update.id);
      if (!item || (item.planStart === update.planStart && item.planEnd === update.planEnd)) continue;
      feeds.unshift({
        id: uid("f"),
        itemId: item.id,
        projectId: item.projectId,
        actorId: data.currentUserId,
        text: `将 ${item.key} 的计划调整为 ${formatDay(update.planStart)} 至 ${formatDay(update.planEnd)}。`,
        createdAt: at,
      });
      items = items.map((entry) => (entry.id === update.id ? { ...entry, planStart: update.planStart, planEnd: update.planEnd, updatedAt: at } : entry));
    }
    if (items !== data.items) set({ items, feeds });
  },
  saveBaseline: (projectId) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    let count = 0;
    const items = data.items.map((item) => {
      if (item.projectId !== projectId) return item;
      const sprint = data.sprints.find((entry) => entry.id === item.sprintId);
      const start = item.planStart ?? sprint?.start;
      const end = item.planEnd ?? sprint?.end;
      if (!start || !end) return item;
      count += 1;
      return { ...item, baselineStart: start, baselineEnd: end };
    });
    if (count === 0) return { ok: false, message: "没有可记下的计划。" };
    set({ items });
    return { ok: true, count };
  },
  placeItem: (id, beforeId, laneIds) => {
    if (backendReadOnly()) return;
    const data = get();
    if (!data.items.some((entry) => entry.id === id)) return;
    const lane = data.items.filter((entry) => laneIds.includes(entry.id) || entry.id === id);
    const rank = rankBefore(lane, id, beforeId);
    set({ items: data.items.map((entry) => (entry.id === id ? { ...entry, rank } : entry)) });
  },
  cloneItem: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const item = data.items.find((entry) => entry.id === id);
    const project = data.projects.find((entry) => entry.id === item?.projectId);
    if (!item || !project) return { ok: false, message: "事项不存在。" };
    const numbers = data.items
      .filter((entry) => entry.projectId === project.id)
      .map((entry) => Number(entry.key.split("-")[1]))
      .filter((value) => Number.isFinite(value));
    const next = Math.max(0, ...numbers) + 1;
    const at = nowIso();
    const copyId = uid("it");
    const version = data.versions.find((entry) => entry.id === item.versionId);
    const versionId =
      version && ["FROZEN", "RELEASED", "DEPRECATED"].includes(version.status)
        ? null
        : item.versionId;
    const status = item.kind === "requirement" ? "DRAFT" : item.kind === "task" ? "TODO" : "NEW";
    const created: WorkItem = {
      ...item,
      id: copyId,
      key: `${project.key}-${next}`,
      title: `${item.title} 副本`,
      versionId,
      status,
      progress: 0,
      reporterId: data.currentUserId,
      rank: rankBefore(data.items, copyId, null),
      createdAt: at,
      updatedAt: at,
    };
    set({
      items: [created, ...data.items],
      feeds: [{ id: uid("f"), itemId: copyId, projectId: project.id, actorId: data.currentUserId, text: `从 ${item.key} 克隆了 ${created.key}。`, createdAt: at }, ...data.feeds],
    });
    return { ok: true, id: copyId, key: created.key };
  },
  createEnvironment: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const name = input.name.trim();
    if (!name) return { ok: false, message: "环境名称不能为空。" };
    const entry: ReleaseEnvironment = { id: uid("env"), projectId: input.projectId, name, kind: input.kind };
    set({ environments: [...get().environments, entry] });
    return { ok: true };
  },
  setItemVersion: (itemId, versionId) => get().updateItem(itemId, { versionId }),
  createRelease: (input) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const title = input.title.trim();
    if (!title) return { ok: false, message: "发布单标题不能为空。" };
    const version = get().versions.find((entry) => entry.id === input.versionId && entry.projectId === input.projectId);
    if (!version) return { ok: false, message: "请选择版本。" };
    const entry: ReleaseRecord = {
      id: uid("rel"),
      projectId: input.projectId,
      versionId: version.id,
      environmentId: input.environmentId,
      title,
      summary: input.summary.trim(),
      status: "DRAFT",
      createdAt: nowIso(),
    };
    set({ releases: [entry, ...get().releases] });
    return { ok: true, id: entry.id };
  },
  submitRelease: (id) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const release = get().releases.find((entry) => entry.id === id);
    if (!release) return { ok: false, message: "发布单不存在。" };
    if (release.status !== "DRAFT") return { ok: false, message: "只有草稿可以提交审批。" };
    set({ releases: get().releases.map((entry) => (entry.id === id ? { ...entry, status: "SUBMITTED" as const, decisionNote: null } : entry)) });
    return { ok: true };
  },
  decideRelease: (id, decision, note) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const release = get().releases.find((entry) => entry.id === id);
    if (!release) return { ok: false, message: "发布单不存在。" };
    if (release.status !== "SUBMITTED") return { ok: false, message: "只有待审批的发布单可以审批。" };
    const text = note.trim();
    if (decision === "DRAFT" && !text) return { ok: false, message: "退回需要填写原因。" };
    set({
      releases: get().releases.map((entry) => (entry.id === id ? { ...entry, status: decision, decisionNote: text || null } : entry)),
    });
    return { ok: true };
  },
  publishRelease: (id, waiver) => {
    if (backendReadOnly()) return { ok: false, message: BACKEND_READONLY_MESSAGE };
    const data = get();
    const release = data.releases.find((entry) => entry.id === id);
    if (!release) return { ok: false, message: "发布单不存在。" };
    if (release.status === "PUBLISHED") return { ok: false, message: "发布单已经发布。" };
    if (release.status !== "APPROVED") return { ok: false, message: "先通过审批，才能发布。" };
    const gate = releaseGate(data, release.versionId);
    const reason = waiver.trim();
    if (!gate.ready && !reason) return { ok: false, message: "门禁未通过。未完成事项或失败用例还在，发布需要填写豁免原因。" };
    const at = nowIso();
    const snapshot = {
      takenAt: at,
      items: gate.scope.map((item) => ({ id: item.id, key: item.key, title: item.title, kind: item.kind, status: item.status })),
      openRequirements: gate.openRequirements,
      openTasks: gate.openTasks,
      openDefects: gate.openDefects,
      failed: gate.failed,
      failures: gate.failures,
      waiver: gate.ready ? null : reason,
    };
    set({
      releases: data.releases.map((entry) => (entry.id === id ? { ...entry, status: "PUBLISHED" as const, snapshot } : entry)),
      notices: [{ id: uid("n"), text: `发布单「${release.title}」已发布。`, itemId: null, kind: "release", read: false, createdAt: at }, ...data.notices],
    });
    return { ok: true };
  },
  reset: () => {
    if (backendReadOnly()) return;
    set({ ...cloneSeed(), createOpen: false });
  },
  replaceData: (data) => {
    if (backendReadOnly()) return;
    set({ ...data });
  },
}));

function mergeById<T extends { id: string }>(saved: T[] | undefined, fresh: T[]) {
  if (!saved) return fresh;
  const ids = new Set(saved.map((entry) => entry.id));
  const missing = fresh.filter((entry) => !ids.has(entry.id));
  return missing.length === 0 ? saved : [...saved, ...missing];
}

function withDefectParents(items: WorkItem[]) {
  if (!items.some((item) => item.kind === "defect" && !item.parentId)) return items;
  return items.map((item) => {
    if (item.parentId || item.kind !== "defect") return item;
    const parentId = seedItemsById.get(item.id)?.parentId;
    return parentId ? { ...item, parentId } : item;
  });
}

function withCaseSteps(cases: TestCase[] | undefined) {
  const list = cases ?? seed.testCases;
  if (!list.some((entry) => !entry.steps?.length)) return list;
  return list.map((entry) => (entry.steps?.length ? entry : { ...entry, steps: seedCasesById.get(entry.id)?.steps ?? [] }));
}

function withNoticeKind(notices: Notice[] | undefined) {
  const list = notices ?? seed.notices;
  return list.map((notice) => (notice.kind ? notice : { ...notice, kind: inferNoticeKind(notice) }));
}

function inferNoticeKind(notice: Notice): NoticeKind {
  if (notice.text.includes("发布")) return "release";
  if (notice.text.includes("Sprint") || notice.text.includes("迭代")) return "sprint";
  if (notice.text.includes("提到") || notice.text.includes("评论")) return "mention";
  return "item";
}

function withLogStatus(logs: WorkLog[] | undefined) {
  const list = logs ?? seed.workLogs;
  if (!list.some((entry) => !entry.status)) return list;
  return list.map((entry) => (entry.status ? entry : { ...entry, status: seedLogsById.get(entry.id)?.status ?? "APPROVED" }));
}

// 只验证领域字段的基本类型，不在读取层复制业务枚举、状态机或关系规则。
// -? 使可选字段也必须出现在映射中：新增领域字段时，类型检查会提示补齐读取边界。
type FieldCheck = (value: unknown) => boolean;
type CollectionName = Exclude<keyof PmData, "currentUserId">;
type RecordChecks = { [K in CollectionName]: { [F in keyof PmData[K][number]]-?: FieldCheck } };
const text: FieldCheck = (value) => typeof value === "string";
const optionalText: FieldCheck = (value) => value === undefined || text(value);
// 历史样板允许这些可空字段缺失；不改变既有兼容行为。
const nullableText: FieldCheck = (value) => value == null || text(value);
const finiteNumber: FieldCheck = (value) => typeof value === "number" && Number.isFinite(value);
const optionalNumber: FieldCheck = (value) => value === undefined || finiteNumber(value);
const optionalWip: FieldCheck = (value) => {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => (key === "todo" || key === "doing" || key === "check" || key === "done") && finiteNumber(entry));
};
const nullableNumber: FieldCheck = (value) => value == null || finiteNumber(value);
const stringList: FieldCheck = (value) => Array.isArray(value) && value.every(text);
const optionalSteps: FieldCheck = (value) => value === undefined || (Array.isArray(value) && value.every((step) =>
  step !== null && typeof step === "object" && !Array.isArray(step) && text(step.action) && text(step.expected),
));
const optionalReport: FieldCheck = (value) => {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return ["passed", "failed", "blocked", "skipped", "total"].every((key) => finiteNumber(report[key])) && text(report.takenAt);
};
const optionalSnapshot: FieldCheck = (value) => {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  const itemsOk = Array.isArray(snapshot.items) && snapshot.items.every((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item) && text(item.id) && text(item.key) && text(item.title) && text(item.kind) && text(item.status),
  );
  const failuresOk = snapshot.failures === undefined || (Array.isArray(snapshot.failures) && snapshot.failures.every((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item) && text(item.key) && text(item.title) && text(item.result),
  ));
  return text(snapshot.takenAt) && itemsOk && finiteNumber(snapshot.openRequirements) && finiteNumber(snapshot.openTasks) && finiteNumber(snapshot.openDefects) && finiteNumber(snapshot.failed) && (snapshot.waiver == null || text(snapshot.waiver)) && failuresOk;
};
const recordChecks = {
  people: { id: text, name: text, role: text },
  projects: { id: text, key: text, name: text, summary: text, leadId: text, memberIds: stringList, wip: optionalWip },
  sprints: { id: text, projectId: text, name: text, goal: text, state: text, start: text, end: text },
  versions: { id: text, projectId: text, name: text, versionNumber: text, versionType: text, status: text, plannedReleaseDate: text, description: text },
  items: {
    id: text, key: text, projectId: text, kind: text, requirementType: nullableText, taskType: nullableText, defectType: nullableText, severity: nullableText,
    title: text, description: text, priority: text, status: text, assigneeId: nullableText, reporterId: text, sprintId: nullableText, versionId: nullableText,
    parentId: nullableText, storyPoints: nullableNumber, progress: finiteNumber, estimatedHours: nullableNumber, tags: stringList,
    createdAt: text, updatedAt: text, planStart: optionalText, planEnd: optionalText, baselineStart: optionalText, baselineEnd: optionalText,
    rank: optionalNumber, dueDate: optionalText,
  },
  comments: { id: text, itemId: text, authorId: text, body: text, createdAt: text },
  feeds: { id: text, itemId: text, projectId: text, actorId: text, text, createdAt: text },
  histories: { id: text, itemId: text, fromStatus: text, toStatus: text, transitionName: text, actorId: text, reason: nullableText, createdAt: text },
  notices: { id: text, text, itemId: nullableText, read: (value: unknown) => typeof value === "boolean", createdAt: text, kind: optionalText },
  testCases: { id: text, key: text, projectId: text, title: text, testType: text, priority: text, status: text, suite: text, requirementId: nullableText, assigneeId: nullableText, precondition: optionalText, steps: optionalSteps },
  testRuns: { id: text, projectId: text, name: text, runType: text, status: text, environment: text, versionId: nullableText, sourceRunId: nullableText, cancelReason: nullableText, report: optionalReport },
  testExecutions: { id: text, runId: text, caseId: text, result: nullableText, defectId: nullableText },
  workLogs: { id: text, projectId: text, itemId: text, userId: text, hours: finiteNumber, workDate: text, note: text, status: optionalText },
  dependencies: { id: text, projectId: text, predecessorId: text, successorId: text, dependencyType: text, lagDays: finiteNumber, memo: text, status: text },
  boards: { id: text, projectId: text, name: text, sprintId: nullableText },
  suites: { id: text, projectId: text, name: text },
  environments: { id: text, projectId: text, name: text, kind: text },
  releases: { id: text, projectId: text, versionId: text, environmentId: nullableText, title: text, summary: text, status: text, createdAt: text, decisionNote: nullableText, snapshot: optionalSnapshot },
} satisfies RecordChecks;

function assertRenderableRecord(collection: string, entry: unknown) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid record");
  if (!Object.hasOwn(recordChecks, collection)) throw new Error("invalid collection");
  const record = entry as Record<string, unknown>;
  const checks = recordChecks[collection as CollectionName];
  for (const [field, check] of Object.entries(checks)) {
    if (!check(record[field])) throw new Error("invalid field");
  }
}

function decodePersistedPm(raw: unknown): PmData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid data");
  const data = raw as Partial<PmData>;
  if (!Array.isArray(data.items) || !Array.isArray(data.projects) || typeof data.currentUserId !== "string") {
    throw new Error("missing required data");
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === "currentUserId") continue;
    if (!Array.isArray(value)) throw new Error("invalid collection");
    value.forEach((entry) => assertRenderableRecord(key, entry));
  }
  return {
    people: data.people ?? seed.people,
    projects: data.projects,
    sprints: data.sprints ?? seed.sprints,
    versions: data.versions ?? seed.versions,
    items: withDefectParents(data.items),
    comments: data.comments ?? seed.comments,
    feeds: data.feeds ?? seed.feeds,
    histories: data.histories ?? seed.histories,
    notices: withNoticeKind(data.notices),
    testCases: withCaseSteps(data.testCases),
    testRuns: mergeById(data.testRuns, seed.testRuns),
    testExecutions: mergeById(data.testExecutions, seed.testExecutions),
    workLogs: withLogStatus(data.workLogs),
    dependencies: data.dependencies ?? seed.dependencies,
    boards: data.boards ?? seed.boards,
    suites: data.suites ?? seed.suites,
    environments: data.environments ?? seed.environments,
    releases: data.releases ?? seed.releases,
    currentUserId: data.currentUserId,
  };
}

export function readPersistedPm(): StorageResult<PmData | null> {
  if (typeof window === "undefined") return { ok: true, value: null };
  return readStoredJson(() => window.localStorage, STORAGE_KEY, decodePersistedPm);
}

export function loadPersistedPm(): StorageResult<PmData | null> {
  const result = readPersistedPm();
  if (result.ok) usePm.setState({ ...(result.value ?? {}), ready: true, persistenceError: null });
  else usePm.setState({ ready: false, persistenceError: result.message });
  return result;
}

function pmData(state: PmState): PmData {
  const data: PmData = {
    people: state.people,
    projects: state.projects,
    sprints: state.sprints,
    versions: state.versions,
    items: state.items,
    comments: state.comments,
    feeds: state.feeds,
    histories: state.histories,
    notices: state.notices,
    testCases: state.testCases,
    testRuns: state.testRuns,
    testExecutions: state.testExecutions,
    workLogs: state.workLogs,
    dependencies: state.dependencies,
    boards: state.boards,
    suites: state.suites,
    environments: state.environments,
    releases: state.releases,
    currentUserId: state.currentUserId,
  };
  return data;
}

export function persistPm(state: PmState): StorageResult<null> {
  if (typeof window === "undefined") return { ok: false, message: "本机保存不可用。" };
  return writeStoredJson(() => window.localStorage, STORAGE_KEY, pmData(state));
}

let unsubscribe: (() => void) | undefined;

export function unbindPmPersistence() {
  unsubscribe?.();
  unsubscribe = undefined;
}

export function bindPmPersistence(): () => void {
  if (unsubscribe || typeof window === "undefined") return unbindPmPersistence;
  // SPA 导航会重新挂载壳层；不能用磁盘旧值丢掉当前页尚未保存的改动。
  if (!usePm.getState().ready && !loadPersistedPm().ok) return unbindPmPersistence;
  unsubscribe = usePm.subscribe((state, previous) => {
    const data = pmData(state);
    const old = pmData(previous);
    if (!(Object.keys(data) as (keyof PmData)[]).some((key) => data[key] !== old[key])) return;
    const saved = persistPm(state);
    usePm.setState({ persistenceError: saved.ok ? null : saved.message });
  });
  return unbindPmPersistence;
}
