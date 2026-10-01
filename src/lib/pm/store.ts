import { create } from "zustand";
import {
  type Board,
  type ColumnId,
  type Comment,
  type FeedEntry,
  type ItemKind,
  type LifecycleRecord,
  type Notice,
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

const STORAGE_KEY = "hc-pm-sample-v1";

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
}

interface PmActions {
  setCreateOpen: (open: boolean) => void;
  setNavOpen: (open: boolean) => void;
  setNoticeOpen: (open: boolean) => void;
  markNoticesRead: () => void;
  markNoticeRead: (id: string) => void;
  setCurrentUser: (id: string) => void;
  moveToColumn: (id: string, column: ColumnId) => { ok: true } | { ok: false; message: string };
  transition: (id: string, to: string, reason?: string) => { ok: true } | { ok: false; message: string };
  updateItem: (id: string, patch: Partial<Pick<WorkItem, "title" | "description" | "priority" | "assigneeId" | "sprintId" | "versionId" | "storyPoints" | "progress" | "planStart" | "planEnd">>) => void;
  addComment: (itemId: string, body: string) => void;
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
  addWorkLog: (input: { projectId: string; itemId: string; hours: number; workDate: string; note: string }) => void;
  addDependency: (input: {
    projectId: string;
    predecessorId: string;
    successorId: string;
    dependencyType: DependencyType;
    lagDays: number;
    memo: string;
  }) => { ok: true } | { ok: false; message: string };
  setDependencyStatus: (id: string, status: DependencyStatus) => { ok: true } | { ok: false; message: string };
  updateProject: (id: string, patch: Partial<Pick<Project, "name" | "summary" | "memberIds">>) => { ok: true } | { ok: false; message: string };
  createSprint: (input: { projectId: string; name: string; goal: string; start: string; end: string }) => { ok: true } | { ok: false; message: string };
  createBoard: (input: { projectId: string; name: string; sprintId: string | null }) => { ok: true } | { ok: false; message: string };
  createSuite: (input: { projectId: string; name: string }) => { ok: true } | { ok: false; message: string };
  saveCaseSteps: (id: string, steps: TestStep[]) => void;
  reviewWorkLog: (id: string, status: Exclude<WorkLogStatus, "PENDING">) => { ok: true } | { ok: false; message: string };
  createEnvironment: (input: { projectId: string; name: string; kind: string }) => { ok: true } | { ok: false; message: string };
  setItemVersion: (itemId: string, versionId: string | null) => { ok: true } | { ok: false; message: string };
  createRelease: (input: { projectId: string; versionId: string; environmentId: string | null; title: string; summary: string }) => { ok: true } | { ok: false; message: string };
  publishRelease: (id: string) => { ok: true } | { ok: false; message: string };
  reset: () => void;
  replaceData: (data: PmData) => void;
}

export type PmState = PmData & PmUi & PmActions;

function nowIso() {
  return new Date().toISOString();
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

export const usePm = create<PmState>((set, get) => ({
  ...seed,
  createOpen: false,
  navOpen: false,
  noticeOpen: false,
  ready: false,
  setCreateOpen: (open) => set({ createOpen: open }),
  setNavOpen: (open) => set({ navOpen: open }),
  setNoticeOpen: (open) => set({ noticeOpen: open }),
  markNoticesRead: () => set({ notices: get().notices.map((notice) => ({ ...notice, read: true })) }),
  markNoticeRead: (id) => set({ notices: get().notices.map((notice) => (notice.id === id ? { ...notice, read: true } : notice)) }),
  setCurrentUser: (id) => {
    if (!get().people.some((person) => person.id === id)) return;
    set({ currentUserId: id });
  },
  moveToColumn: (id, column) => {
    const item = get().items.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: "事项不存在" };
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
    if (needsReason(target)) {
      return get().transition(id, target, "看板拖拽");
    }
    return get().transition(id, target);
  },
  transition: (id, to, reason) => {
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
    const data = get();
    const item = data.items.find((entry) => entry.id === id);
    if (!item) return;
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
  },
  addComment: (itemId, body) => {
    const text = body.trim();
    if (!text) return;
    const at = nowIso();
    const comment: Comment = { id: uid("c"), itemId, authorId: get().currentUserId, body: text, createdAt: at };
    set({
      comments: [...get().comments, comment],
      items: get().items.map((entry) => (entry.id === itemId ? { ...entry, updatedAt: at } : entry)),
    });
  },
  createItem: (input) => {
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
    set({
      versions: get().versions.map((entry) => (entry.id === id ? { ...entry, status: to } : entry)),
    });
  },
  createVersion: (input) => {
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
    set({
      sprints: get().sprints.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  },
  updateVersion: (id, patch) => {
    set({
      versions: get().versions.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  },
  recordExecution: (id, result) => {
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
    const run = get().testRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, message: "运行不存在。" };
    if (run.status !== "CREATED") return { ok: false, message: "只有未开始的运行可以开始。" };
    set({ testRuns: get().testRuns.map((entry) => (entry.id === id ? { ...entry, status: "RUNNING" } : entry)) });
    return { ok: true };
  },
  completeRun: (id) => {
    const data = get();
    const run = data.testRuns.find((entry) => entry.id === id);
    if (!run) return { ok: false, message: "运行不存在。" };
    if (run.status !== "RUNNING") return { ok: false, message: "只有执行中的运行可以完成。" };
    const rows = data.testExecutions.filter((entry) => entry.runId === id);
    if (rows.length === 0 || rows.some((entry) => !entry.result)) {
      return { ok: false, message: "还有未记结果的用例，不能完成这次运行。" };
    }
    set({ testRuns: data.testRuns.map((entry) => (entry.id === id ? { ...entry, status: "COMPLETED" } : entry)) });
    return { ok: true };
  },
  cancelRun: (id, reason) => {
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
    const entry: WorkLog = {
      id: uid("wl"),
      projectId: input.projectId,
      itemId: input.itemId,
      userId: get().currentUserId,
      hours: input.hours,
      workDate: input.workDate,
      note: input.note.trim(),
    };
    set({ workLogs: [entry, ...get().workLogs] });
  },
  addDependency: (input) => {
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
    const project = get().projects.find((entry) => entry.id === id);
    if (!project) return { ok: false, message: "项目不存在。" };
    const name = patch.name?.trim() ?? project.name;
    if (!name) return { ok: false, message: "项目名称不能为空。" };
    set({
      projects: get().projects.map((entry) =>
        entry.id === id
          ? { ...entry, name, summary: patch.summary?.trim() ?? entry.summary, memberIds: patch.memberIds ?? entry.memberIds }
          : entry,
      ),
    });
    return { ok: true };
  },
  createSprint: (input) => {
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
    const name = input.name.trim();
    if (!name) return { ok: false, message: "看板名称不能为空。" };
    const entry: Board = { id: uid("bd"), projectId: input.projectId, name, sprintId: input.sprintId };
    set({ boards: [...get().boards, entry] });
    return { ok: true };
  },
  createSuite: (input) => {
    const name = input.name.trim();
    if (!name) return { ok: false, message: "套件名称不能为空。" };
    if (get().suites.some((entry) => entry.projectId === input.projectId && entry.name === name)) {
      return { ok: false, message: "这个项目已有同名套件。" };
    }
    set({ suites: [...get().suites, { id: uid("ts"), projectId: input.projectId, name }] });
    return { ok: true };
  },
  saveCaseSteps: (id, steps) => {
    set({
      testCases: get().testCases.map((entry) =>
        entry.id === id ? { ...entry, steps: steps.map((step) => ({ action: step.action.trim(), expected: step.expected.trim() })).filter((step) => step.action || step.expected) } : entry,
      ),
    });
  },
  reviewWorkLog: (id, status) => {
    const log = get().workLogs.find((entry) => entry.id === id);
    if (!log) return { ok: false, message: "工时不存在。" };
    if ((log.status ?? "APPROVED") !== "PENDING") return { ok: false, message: "只有待审批的工时可以处理。" };
    set({ workLogs: get().workLogs.map((entry) => (entry.id === id ? { ...entry, status } : entry)) });
    return { ok: true };
  },
  createEnvironment: (input) => {
    const name = input.name.trim();
    if (!name) return { ok: false, message: "环境名称不能为空。" };
    const entry: ReleaseEnvironment = { id: uid("env"), projectId: input.projectId, name, kind: input.kind };
    set({ environments: [...get().environments, entry] });
    return { ok: true };
  },
  setItemVersion: (itemId, versionId) => {
    const data = get();
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) return { ok: false, message: "事项不存在。" };
    const locked = (id: string | null) => {
      const version = data.versions.find((entry) => entry.id === id);
      return version ? version.status === "FROZEN" || version.status === "RELEASED" || version.status === "DEPRECATED" : false;
    };
    if (locked(item.versionId) || locked(versionId)) return { ok: false, message: "版本已冻结、发布或废弃，不能改范围。" };
    if (versionId && !data.versions.some((entry) => entry.id === versionId && entry.projectId === item.projectId)) {
      return { ok: false, message: "版本不属于这个项目。" };
    }
    get().updateItem(itemId, { versionId });
    return { ok: true };
  },
  createRelease: (input) => {
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
    return { ok: true };
  },
  publishRelease: (id) => {
    const data = get();
    const release = data.releases.find((entry) => entry.id === id);
    if (!release) return { ok: false, message: "发布单不存在。" };
    if (release.status === "PUBLISHED") return { ok: false, message: "发布单已经发布。" };
    const at = nowIso();
    set({
      releases: data.releases.map((entry) => (entry.id === id ? { ...entry, status: "PUBLISHED" as const } : entry)),
      notices: [{ id: uid("n"), text: `发布单「${release.title}」已发布。`, itemId: null, read: false, createdAt: at }, ...data.notices],
    });
    return { ok: true };
  },
  reset: () => set({ ...cloneSeed(), createOpen: false }),
  replaceData: (data) => set({ ...data }),
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

function withLogStatus(logs: WorkLog[] | undefined) {
  const list = logs ?? seed.workLogs;
  if (!list.some((entry) => !entry.status)) return list;
  return list.map((entry) => (entry.status ? entry : { ...entry, status: seedLogsById.get(entry.id)?.status ?? "APPROVED" }));
}

export function readPersistedPm(): PmData | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<PmData>;
    if (!data.items || !data.projects || !data.currentUserId) return null;
    return {
      people: data.people ?? seed.people,
      projects: data.projects,
      sprints: data.sprints ?? seed.sprints,
      versions: data.versions ?? seed.versions,
      items: withDefectParents(data.items),
      comments: data.comments ?? seed.comments,
      feeds: data.feeds ?? seed.feeds,
      histories: data.histories ?? seed.histories,
      notices: data.notices ?? seed.notices,
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
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function loadPersistedPm() {
  const data = readPersistedPm();
  if (data) usePm.getState().replaceData(data);
}

export function persistPm(state: PmState) {
  if (typeof window === "undefined") return;
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let listening = false;

export function bindPmPersistence() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const data = readPersistedPm();
  usePm.setState(data ? { ...data, ready: true } : { ready: true });
  usePm.subscribe((state) => persistPm(state));
}
