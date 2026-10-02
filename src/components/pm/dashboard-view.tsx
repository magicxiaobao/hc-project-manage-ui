import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { EmptyHint, IssueTypeIcon, PageHeading, StatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { aggregate } from "@/components/pm/stats-view";
import { columnOf, workLogStatus } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

export function DashboardView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const sprints = usePm((state) => state.sprints);
  const versions = usePm((state) => state.versions);
  const runs = usePm((state) => state.testRuns);
  const executions = usePm((state) => state.testExecutions);
  const logs = usePm((state) => state.workLogs);
  const people = usePm((state) => state.people);
  const histories = usePm((state) => state.histories);
  const feeds = usePm((state) => state.feeds);
  const currentUserId = usePm((state) => state.currentUserId);
  const goToItem = useGoToItem();
  const projectItems = useMemo(() => items.filter((item) => item.projectId === project?.id), [items, project?.id]);
  const summary = useMemo(
    () => (project ? aggregate(project.id, items, people, sprints, versions, logs, histories) : null),
    [project, items, people, sprints, versions, logs, histories],
  );
  if (!project || !summary) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const active = sprints.find((sprint) => sprint.projectId === project.id && sprint.state === "active");
  const sprintItems = active ? projectItems.filter((item) => item.sprintId === active.id) : [];
  const sprintDone = sprintItems.filter((item) => columnOf(item.kind, item.status) === "done").length;
  const openDefects = projectItems.filter((item) => item.kind === "defect" && columnOf(item.kind, item.status) !== "done" && columnOf(item.kind, item.status) !== "cancelled");
  const mine = projectItems.filter((item) => item.assigneeId === currentUserId && columnOf(item.kind, item.status) !== "done" && columnOf(item.kind, item.status) !== "cancelled");
  const projectRuns = runs.filter((run) => run.projectId === project.id && run.status !== "CANCELLED");
  const failed = executions.filter((execution) => projectRuns.some((run) => run.id === execution.runId) && (execution.result === "FAILED" || execution.result === "BLOCKED"));
  const pending = logs.filter((entry) => entry.projectId === project.id && workLogStatus(entry) === "PENDING").length;
  const testing = versions.filter((version) => version.projectId === project.id && (version.status === "TESTING" || version.status === "DEVELOPMENT"));
  const weekAgo = shiftDay(-6);
  const today = shiftDay(0);
  const soon = shiftDay(7);
  const created = projectItems.filter((item) => item.createdAt.slice(0, 10) >= weekAgo && item.createdAt.slice(0, 10) <= today).length;
  const updated = projectItems.filter((item) => item.updatedAt.slice(0, 10) >= weekAgo && item.updatedAt.slice(0, 10) <= today).length;
  const completed = new Set(
    histories
      .filter((entry) => {
        const item = projectItems.find((candidate) => candidate.id === entry.itemId);
        return item && columnOf(item.kind, entry.toStatus) === "done" && entry.createdAt.slice(0, 10) >= weekAgo && entry.createdAt.slice(0, 10) <= today;
      })
      .map((entry) => entry.itemId),
  ).size;
  const due = projectItems.filter((item) => {
    const column = columnOf(item.kind, item.status);
    return Boolean(item.dueDate && item.dueDate >= today && item.dueDate <= soon && column !== "done" && column !== "cancelled");
  }).length;
  const epics = projectItems.filter((item) => item.requirementType === "Epic");
  const recent = feeds.filter((entry) => entry.projectId === project.id).slice(0, 6);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="仪表盘" hint={`${project.name} · 先处理当前任务，再查看进度汇总。`} />
      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-3">
        <h2 className="type-section">需要处理</h2>
        <div className="flex flex-wrap gap-2">
          {failed.length > 0 ? <Link className="type-link min-h-10 rounded-sm border border-border px-3 py-2" to="/p/$projectKey/tests" params={{ projectKey }}>失败或阻塞 {failed.length} · 去测试</Link> : null}
          {pending > 0 ? <Link className="type-link min-h-10 rounded-sm border border-border px-3 py-2" to="/p/$projectKey/worklogs" params={{ projectKey }}>待审工时 {pending} · 去审批</Link> : null}
          {openDefects.length > 0 ? <Link className="type-link min-h-10 rounded-sm border border-border px-3 py-2" to="/p/$projectKey/defects" params={{ projectKey }}>未关缺陷 {openDefects.length} · 去处理</Link> : null}
          {failed.length === 0 && pending === 0 && openDefects.length === 0 ? <p className="type-caption">当前没有失败或阻塞、待审工时和未关缺陷。</p> : null}
        </div>
      </section>
      <section className="overflow-hidden rounded-sm border border-border bg-surface">
        <h2 className="type-section border-b border-border px-4 py-3">我的未完成</h2>
        {mine.length === 0 ? <p className="type-meta px-4 py-3">没有分给你的未完成事项。</p> : null}
        {mine.slice(0, 8).map((item) => (
          <button key={item.id} type="button" className="flex w-full flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-line" onClick={() => goToItem(item.id)}>
            <IssueTypeIcon item={item} />
            <span className="type-link shrink-0">{item.key}</span>
            <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
            <StatusChip kind={item.kind} status={item.status} />
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="overflow-hidden rounded-sm border border-border bg-surface">
          <h2 className="type-section border-b border-border px-4 py-3">最近动态</h2>
          {recent.length === 0 ? <p className="type-meta px-4 py-3">还没有动态。</p> : null}
          {recent.map((entry) => (
            <button key={entry.id} type="button" className="flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-line" onClick={() => goToItem(entry.itemId)}>
              <span className="type-body">{entry.text}</span>
              <span className="type-caption">{entry.createdAt.slice(0, 10)}</span>
            </button>
          ))}
        </section>
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="type-section">史诗进度</h2>
          {epics.length === 0 ? <p className="type-meta mt-2">没有史诗。</p> : null}
          <div className="mt-3 flex flex-col gap-3">
            {epics.map((epic) => {
              const children = projectItems.filter((item) => item.parentId === epic.id);
              const done = children.filter((item) => columnOf(item.kind, item.status) === "done").length;
              const width = children.length ? (done / children.length) * 100 : 0;
              return (
                <button key={epic.id} type="button" className="text-left" onClick={() => goToItem(epic.id)}>
                  <span className="type-caption">
                    {epic.key} {epic.title}
                  </span>
                  <span className="mt-1 block h-2 overflow-hidden rounded-sm bg-line">
                    <span className="block h-full bg-primary" style={{ width: `${width}%` }} />
                  </span>
                  <span className="type-caption">{children.length ? `${done}/${children.length}` : "没有子事项"}</span>
                </button>
              );
            })}
          </div>
        </section>
      </section>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">进度汇总</summary>
<div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="近 7 天完成" value={String(completed)} />
        <Stat label="近 7 天更新" value={String(updated)} />
        <Stat label="近 7 天新建" value={String(created)} />
        <Stat label="未来 7 天到期" value={String(due)} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={active ? active.name : "没有进行中的迭代"} value={active ? `${sprintDone}/${sprintItems.length}` : "—"} />
        <Stat label="未关缺陷" value={String(openDefects.length)} />
        <Stat label="失败或阻塞" value={String(failed.length)} />
        <Stat label="待审工时" value={String(pending)} />
      </div>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarGroup title="需求状态" rows={summary.requirementStatuses.map((row) => ({ id: row.status, label: row.label, value: row.count }))} />
        <BarGroup title="未关缺陷" rows={summary.severities.map((row) => ({ id: row.severity, label: row.label, value: row.count }))} empty="没有未关缺陷。" />
      </section>
      <BarGroup title="近四周完成" rows={summary.weeks.map((week) => ({ id: week.start, label: week.label, value: week.count }))} />
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">进行中的版本</h2>
        {testing.length === 0 ? <p className="type-meta mt-2">没有开发中或测试中的版本。</p> : null}
        {testing.map((version) => (
          <p key={version.id} className="type-body mt-2">
            {version.versionNumber} {version.name}
          </p>
        ))}
      </section>

</div>
</details>
    </div>
  );
}

function BarGroup({ title, rows, empty = "没有数据。" }: { title: string; rows: { id: string; label: string; value: number }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="type-section">{title}</h2>
      {rows.length === 0 ? <p className="type-meta mt-2">{empty}</p> : null}
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[72px_minmax(0,1fr)_32px] items-center gap-2">
            <span className="type-caption truncate">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-sm bg-line">
              <span className="block h-full rounded-sm bg-primary" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            <span className="type-caption text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
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

function shiftDay(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
