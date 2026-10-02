import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { EmptyHint, PageHeading, SprintStateChip, StatusChip, VersionStatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { columnOf, priorityLabel, REQUIREMENT_STATUS_LABEL, type LifecycleRecord, type Person, type ReleaseVersion, type Sprint, type WorkItem, type WorkLog } from "@/lib/pm/domain";
import { severityLabel } from "@/components/biz/severity";
import { usePm } from "@/lib/pm/store";

const REQUIREMENT_ORDER = ["DRAFT", "REVIEW", "APPROVED", "IN_DEVELOPMENT", "COMPLETED", "CANCELLED"] as const;
const KIND_ORDER = ["requirement", "task", "defect"] as const;
const KIND_LABEL = { requirement: "需求", task: "任务", defect: "缺陷" } as const;

type Count = { total: number; done: number; open: number };

const SEVERITY_ORDER = ["BLOCKER", "CRITICAL", "MAJOR", "NORMAL", "MINOR", "TRIVIAL"];

function mondayOf(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

function recentWeeks(items: WorkItem[], histories: LifecycleRecord[], projectId: string) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const current = mondayOf(todayIso);
  const weeks = [0, 1, 2, 3].map((ago) => shiftWeek(current, -ago)).reverse();
  const byId = new Map(items.filter((item) => item.projectId === projectId).map((item) => [item.id, item]));
  const seen = new Map(weeks.map((start) => [start, new Set<string>()]));
  for (const history of histories) {
    const item = byId.get(history.itemId);
    const bucket = seen.get(mondayOf(history.createdAt));
    if (!item || !bucket) continue;
    if (columnOf(item.kind, history.toStatus) !== "done") continue;
    if (columnOf(item.kind, history.fromStatus) === "done") continue;
    bucket.add(item.id);
  }
  return weeks.map((start) => ({ start, label: `${Number(start.slice(5, 7))}/${Number(start.slice(8))}`, count: seen.get(start)?.size ?? 0 }));
}

function shiftWeek(iso: string, weeks: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + weeks * 7));
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

function emptyCount(): Count {
  return { total: 0, done: 0, open: 0 };
}

export function aggregate(projectId: string, items: WorkItem[], people: Person[], sprints: Sprint[], versions: ReleaseVersion[], workLogs: WorkLog[], histories: LifecycleRecord[]) {
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
    severities: SEVERITY_ORDER.filter((severity) => bySeverity.has(severity)).map((severity) => ({ severity, label: severityLabel(severity), count: bySeverity.get(severity) ?? 0 })),
    severityMax: Math.max(1, ...SEVERITY_ORDER.map((severity) => bySeverity.get(severity) ?? 0)),
    weeks: recentWeeks(items, histories, projectId),
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
  const histories = usePm((state) => state.histories);
  const goToItem = useGoToItem();
  const summary = useMemo(
    () => (project ? aggregate(project.id, items, people, sprints, versions, workLogs, histories) : null),
    [project, items, people, sprints, versions, workLogs, histories],
  );

  if (!project || !summary) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="统计" hint="按类型、需求状态、负责人和迭代看这个项目。取消的需求不计入完成率。" />
      <nav aria-label="统计行动入口" className="type-link flex flex-wrap gap-x-4 gap-y-2">
        <Link to="/p/$projectKey/issues" params={{ projectKey }} search={{ query: undefined, kind: "all", mine: false, hideDone: true }}>查看未完成事项</Link>
        <Link to="/p/$projectKey/issues" params={{ projectKey }} search={{ query: undefined, kind: "all", mine: false, hideDone: false }}>查看全部事项</Link>
        <Link to="/p/$projectKey/defects" params={{ projectKey }}>查看缺陷</Link>
        <Link to="/p/$projectKey/sprints" params={{ projectKey }}>查看迭代</Link>
        <Link to="/p/$projectKey/releases" params={{ projectKey }}>查看版本</Link>
      </nav>
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
      <SprintCharts projectId={project.id} items={items} sprints={sprints} histories={histories} versions={versions} />
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
          <div className="mt-3 flex flex-col gap-2">
            {summary.severities.map((row) => (
              <Meter key={row.severity} label={row.label} value={row.count} max={summary.severityMax} total={row.count} bare />
            ))}
          </div>
        </section>
      ) : null}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">近四周完成</h2>
        <p className="type-meta mt-1">按流转到完成的次数算，同一事项一周内只计一次。</p>
        <div className="mt-3 flex flex-col gap-2">
          {summary.weeks.map((week) => (
            <Meter key={week.start} label={week.label} value={week.count} max={Math.max(1, ...summary.weeks.map((entry) => entry.count))} total={week.count} bare />
          ))}
        </div>
      </section>

    </div>
  );
}

function SprintCharts({
  projectId,
  items,
  sprints,
  histories,
  versions,
}: {
  projectId: string;
  items: WorkItem[];
  sprints: Sprint[];
  histories: LifecycleRecord[];
  versions: ReleaseVersion[];
}) {
  const active = sprints.find((sprint) => sprint.projectId === projectId && sprint.state === "active");
  const closed = sprints.filter((sprint) => sprint.projectId === projectId && sprint.state === "closed");
  const burn = active ? burnSeries(active, items, histories) : [];
  const max = Math.max(1, ...burn.map((point) => Math.max(point.remaining, point.ideal)));
  const velocity = closed.map((sprint) => {
    const done = items.filter((item) => item.sprintId === sprint.id && columnOf(item.kind, item.status) === "done");
    return { id: sprint.id, name: sprint.name, points: done.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0) };
  });
  const velocityMax = Math.max(1, ...velocity.map((row) => row.points));
  const versionRows = versions
    .filter((version) => version.projectId === projectId)
    .map((version) => {
      const scope = items.filter((item) => item.versionId === version.id);
      const open = scope.filter((item) => {
        const column = columnOf(item.kind, item.status);
        return column !== "done" && column !== "cancelled";
      });
      return { id: version.id, name: `${version.versionNumber} ${version.name}`, points: open.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0) };
    });
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="type-section">迭代燃尽</h2>
      {!active || burn.length === 0 ? <p className="type-meta mt-2">没有进行中的迭代，或迭代里还没有故事点。</p> : null}
      {burn.length > 0 ? (
        <>
          <svg viewBox="0 0 320 120" className="mt-3 h-32 w-full" role="img" aria-label="迭代燃尽">
            <polyline fill="none" stroke="#8993a4" strokeWidth="2" points={linePoints(burn.map((point) => point.ideal), max)} />
            <polyline fill="none" stroke="#0052cc" strokeWidth="2" points={linePoints(burn.map((point) => point.remaining), max)} />
          </svg>
          <p className="type-caption mt-1">灰线是理想剩余，蓝线是按当前仍在迭代中的事项、以及流转到完成的日期估算的剩余。移出迭代的事项不在图上。</p>
        </>
      ) : null}
      <h2 className="type-section mt-4">速率</h2>
      {velocity.length === 0 ? <p className="type-meta mt-2">还没有已完成的迭代。</p> : null}
      <div className="mt-3 flex flex-col gap-2">
        {velocity.map((row) => (
          <Meter key={row.id} label={row.name} value={row.points} max={velocityMax} total={row.points} bare />
        ))}
      </div>
      <h2 className="type-section mt-4">版本剩余点数</h2>
      <div className="mt-3 flex flex-col gap-2">
        {versionRows.map((row) => (
          <p key={row.id} className="type-body">
            {row.name} · {row.points} 点未完成
          </p>
        ))}
      </div>
    </section>
  );
}

function burnSeries(sprint: Sprint, items: WorkItem[], histories: LifecycleRecord[]) {
  const members = items.filter((item) => item.sprintId === sprint.id && (item.storyPoints ?? 0) > 0);
  if (members.length === 0) return [];
  const start = utcDay(sprint.start);
  const end = utcDay(sprint.end);
  const today = utcDay(new Date().toISOString());
  const last = Math.min(end, today);
  if (last < start) return [];
  const doneAt = new Map<string, number>();
  for (const history of histories) {
    const item = members.find((entry) => entry.id === history.itemId);
    if (!item || columnOf(item.kind, history.toStatus) !== "done") continue;
    const day = utcDay(history.createdAt);
    const previous = doneAt.get(item.id);
    if (previous === undefined || day < previous) doneAt.set(item.id, day);
  }
  const total = members.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
  const points = [];
  for (let day = start; day <= last; day += 1) {
    const remaining = members.reduce((sum, item) => {
      const done = doneAt.get(item.id);
      return done !== undefined && done <= day ? sum : sum + (item.storyPoints ?? 0);
    }, 0);
    const ideal = total * (1 - (day - start) / Math.max(end - start, 1));
    points.push({ remaining, ideal });
  }
  return points;
}

function linePoints(values: number[], max: number) {
  if (values.length === 0) return "";
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 320;
      const y = 112 - (value / max) * 104;
      return `${x},${y}`;
    })
    .join(" ");
}

function utcDay(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
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