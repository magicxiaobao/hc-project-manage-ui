import { useMemo } from "react";
import { EmptyHint, PageHeading, SeverityChip, SprintStateChip, StatusChip, VersionStatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { columnOf, priorityLabel, REQUIREMENT_STATUS_LABEL, type Person, type ReleaseVersion, type Sprint, type WorkItem, type WorkLog } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

const REQUIREMENT_ORDER = ["DRAFT", "REVIEW", "APPROVED", "IN_DEVELOPMENT", "COMPLETED", "CANCELLED"] as const;
const KIND_ORDER = ["requirement", "task", "defect"] as const;
const KIND_LABEL = { requirement: "需求", task: "任务", defect: "缺陷" } as const;

type Count = { total: number; done: number; open: number };

function emptyCount(): Count {
  return { total: 0, done: 0, open: 0 };
}

function aggregate(projectId: string, items: WorkItem[], people: Person[], sprints: Sprint[], versions: ReleaseVersion[], workLogs: WorkLog[]) {
  const kinds = {
    requirement: emptyCount(),
    task: emptyCount(),
    defect: emptyCount(),
  };
  const requirementStatus: Record<string, number> = {};
  for (const status of REQUIREMENT_ORDER) requirementStatus[status] = 0;
  const byAssignee = new Map<string, { open: number; points: number }>();
  const bySprint = new Map<string, Count>();
  const byVersion = new Map<string, Count>();
  const bySeverity = new Map<string, number>();
  const hoursByUser = new Map<string, number>();
  const urgent: WorkItem[] = [];
  let open = 0;
  let done = 0;
  let liveRequirements = 0;
  let doneRequirements = 0;
  let livePoints = 0;
  let donePoints = 0;
  let epic = 0;
  let story = 0;
  let openDefects = 0;
  let unassignedOpen = 0;
  let unassignedPoints = 0;

  for (const item of items) {
    if (item.projectId !== projectId) continue;
    const column = columnOf(item.kind, item.status);
    const finished = column === "done";
    const active = column !== "done" && column !== "cancelled";
    if (finished) done += 1;
    if (active) open += 1;
    const kind = kinds[item.kind];
    kind.total += 1;
    if (finished) kind.done += 1;

    if (item.kind === "requirement") {
      if (item.status in requirementStatus) requirementStatus[item.status] += 1;
      if (item.requirementType === "Epic") epic += 1;
      if (item.requirementType === "Story") story += 1;
      if (item.status !== "CANCELLED") {
        liveRequirements += 1;
        livePoints += item.storyPoints ?? 0;
        if (item.status === "COMPLETED") {
          doneRequirements += 1;
          donePoints += item.storyPoints ?? 0;
        }
      }
    }
    if (item.kind === "defect" && active) {
      openDefects += 1;
      if (item.severity) bySeverity.set(item.severity, (bySeverity.get(item.severity) ?? 0) + 1);
    }
    if (active) {
      const points = item.storyPoints ?? 0;
      if (item.assigneeId) {
        const row = byAssignee.get(item.assigneeId) ?? { open: 0, points: 0 };
        row.open += 1;
        row.points += points;
        byAssignee.set(item.assigneeId, row);
      } else {
        unassignedOpen += 1;
        unassignedPoints += points;
      }
      if (item.priority === "HIGH") urgent.push(item);
    }
    if (item.sprintId) {
      const row = bySprint.get(item.sprintId) ?? emptyCount();
      row.total += 1;
      if (finished) row.done += 1;
      bySprint.set(item.sprintId, row);
    }
    if (item.versionId) {
      const row = byVersion.get(item.versionId) ?? emptyCount();
      row.total += 1;
      if (active) row.open += 1;
      byVersion.set(item.versionId, row);
    }
  }

  for (const log of workLogs) {
    if (log.projectId !== projectId) continue;
    hoursByUser.set(log.userId, (hoursByUser.get(log.userId) ?? 0) + log.hours);
  }

  const load = people
    .map((person) => {
      const assigned = byAssignee.get(person.id);
      return {
        id: person.id,
        name: person.name,
        open: assigned?.open ?? 0,
        points: assigned?.points ?? 0,
        hours: hoursByUser.get(person.id) ?? 0,
      };
    })
    .filter((row) => row.open > 0 || row.hours > 0)
    .sort((a, b) => b.open - a.open || b.hours - a.hours);
  urgent.sort((a, b) => a.key.localeCompare(b.key));
  const reqMax = Math.max(1, ...REQUIREMENT_ORDER.map((status) => requirementStatus[status] ?? 0));
  const loadMax = Math.max(1, unassignedOpen, ...load.map((row) => row.open));

  return {
    open,
    done,
    rate: liveRequirements ? Math.round((doneRequirements / liveRequirements) * 100) : 0,
    donePoints,
    livePoints,
    epic,
    story,
    openDefects,
    kinds: KIND_ORDER.map((kind) => ({ label: KIND_LABEL[kind], done: kinds[kind].done, total: kinds[kind].total })),
    requirementStatuses: REQUIREMENT_ORDER.map((status) => ({ status, label: REQUIREMENT_STATUS_LABEL[status] ?? status, count: requirementStatus[status] ?? 0 })),
    reqMax,
    load,
    unassigned: { open: unassignedOpen, points: unassignedPoints },
    loadMax,
    sprints: sprints
      .filter((sprint) => sprint.projectId === projectId)
      .map((sprint) => ({ id: sprint.id, name: sprint.name, state: sprint.state, ...(bySprint.get(sprint.id) ?? emptyCount()) })),
    versions: versions
      .filter((version) => version.projectId === projectId)
      .map((version) => ({ ...version, ...(byVersion.get(version.id) ?? emptyCount()) })),
    severities: [...bySeverity.entries()].map(([severity, count]) => ({ severity, count })),
    urgent,
  };
}

export function StatsView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const versions = usePm((state) => state.versions);
  const workLogs = usePm((state) => state.workLogs);
  const goToItem = useGoToItem();
  const summary = useMemo(
    () => (project ? aggregate(project.id, items, people, sprints, versions, workLogs) : null),
    [project, items, people, sprints, versions, workLogs],
  );

  if (!project || !summary) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="统计" hint="按类型、需求状态、负责人和迭代看这个项目。取消的需求不计入完成率。" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="未完成" value={String(summary.open)} />
        <Stat label="已完成" value={String(summary.done)} />
        <Stat label="需求完成" value={`${summary.rate}%`} />
        <Stat label="未关缺陷" value={String(summary.openDefects)} />
      </div>
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">按类型</h2>
        <p className="type-meta mt-1">
          故事点 {summary.donePoints}/{summary.livePoints}
          {` · 史诗 ${summary.epic} · 故事 ${summary.story}`}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {summary.kinds.map((row) => (
            <Meter key={row.label} label={row.label} value={row.done} max={Math.max(1, row.total)} total={row.total} />
          ))}
        </div>
      </section>
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">需求状态</h2>
        <div className="mt-3 flex flex-col gap-2">
          {summary.requirementStatuses.map((row) => (
            <Meter key={row.status} label={row.label} value={row.count} max={summary.reqMax} total={row.count} bare />
          ))}
        </div>
      </section>
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">按负责人</h2>
        <p className="type-meta mt-1">条形是未完成事项。小时是已登记工时。</p>
        {summary.load.length === 0 && summary.unassigned.open === 0 ? <p className="type-meta mt-3">还没有分派事项或工时。</p> : null}
        <div className="mt-3 flex flex-col gap-3">
          {summary.load.map((row) => (
            <div key={row.id}>
              <Meter label={row.name} value={row.open} max={summary.loadMax} total={row.open} bare />
              <p className="type-caption mt-1 pl-[88px]">
                {row.hours > 0 ? `${trimHours(row.hours)} 小时` : "无工时"}
                {` · 未完成 ${row.points} 点`}
              </p>
            </div>
          ))}
          {summary.unassigned.open > 0 ? (
            <div>
              <Meter label="未分配" value={summary.unassigned.open} max={summary.loadMax} total={summary.unassigned.open} bare />
              <p className="type-caption mt-1 pl-[88px]">未完成 {summary.unassigned.points} 点</p>
            </div>
          ) : null}
        </div>
      </section>
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">迭代</h2>
        <div className="mt-3 flex flex-col gap-3">
          {summary.sprints.map((sprint) => (
            <div key={sprint.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="type-emphasis min-w-0 flex-1 truncate">{sprint.name}</span>
                <SprintStateChip state={sprint.state} />
              </div>
              <Meter label="完成" value={sprint.done} max={Math.max(1, sprint.total)} total={sprint.total} />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">版本</h2>
        <div className="mt-3 flex flex-col gap-3">
          {summary.versions.map((version) => (
            <div key={version.id} className="flex flex-wrap items-center gap-2">
              <span className="type-emphasis">{version.versionNumber}</span>
              <span className="type-body min-w-0 flex-1 truncate">{version.name}</span>
              <VersionStatusChip status={version.status} />
              <span className="type-caption">{version.open ? `${version.open} 未完成` : version.total ? "范围已完成" : "没有事项"}</span>
            </div>
          ))}
        </div>
      </section>
      {summary.severities.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="type-section">未关缺陷</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.severities.map((row) => (
              <span key={row.severity} className="flex items-center gap-2">
                <SeverityChip severity={row.severity} />
                <span className="type-caption">{row.count}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <section className="overflow-hidden rounded-sm border border-border bg-surface">
        <h2 className="type-section border-b border-border px-4 py-3">高优先级未完成</h2>
        {summary.urgent.length === 0 ? <p className="type-meta px-4 py-3">没有高优先级的未完成事项。</p> : null}
        {summary.urgent.slice(0, 8).map((item) => (
          <button key={item.id} type="button" className="flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-line" onClick={() => goToItem(item.id)}>
            <span className="flex items-center gap-2">
              <span className="type-link">{item.key}</span>
              <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip kind={item.kind} status={item.status} />
              <span className="type-caption">{priorityLabel(item.priority)}</span>
            </span>
          </button>
        ))}
        {summary.urgent.length > 8 ? <p className="type-caption px-4 py-3">还有 {summary.urgent.length - 8} 条。</p> : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-4 py-3">
      <div className="type-caption">{label}</div>
      <div className="type-section mt-1">{value}</div>
    </div>
  );
}

function Meter({ label, value, max, total, bare = false }: { label: string; value: number; max: number; total: number; bare?: boolean }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_52px] items-center gap-2">
      <span className="type-caption truncate">{label}</span>
      <span className="h-2 overflow-hidden rounded-sm bg-line">
        <span className="block h-full rounded-sm bg-primary" style={{ width: `${width}%` }} />
      </span>
      <span className="type-caption text-right">{bare ? value : `${value}/${total}`}</span>
    </div>
  );
}

function trimHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}