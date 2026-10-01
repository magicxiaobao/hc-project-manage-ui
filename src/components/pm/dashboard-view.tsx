import { useMemo } from "react";
import { EmptyHint, IssueTypeIcon, PageHeading, StatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
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
  const currentUserId = usePm((state) => state.currentUserId);
  const goToItem = useGoToItem();
  const projectItems = useMemo(() => items.filter((item) => item.projectId === project?.id), [items, project?.id]);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const active = sprints.find((sprint) => sprint.projectId === project.id && sprint.state === "active");
  const sprintItems = active ? projectItems.filter((item) => item.sprintId === active.id) : [];
  const sprintDone = sprintItems.filter((item) => columnOf(item.kind, item.status) === "done").length;
  const openDefects = projectItems.filter((item) => item.kind === "defect" && columnOf(item.kind, item.status) !== "done" && columnOf(item.kind, item.status) !== "cancelled");
  const mine = projectItems.filter((item) => item.assigneeId === currentUserId && columnOf(item.kind, item.status) !== "done" && columnOf(item.kind, item.status) !== "cancelled");
  const projectRuns = runs.filter((run) => run.projectId === project.id && run.status !== "CANCELLED");
  const failed = executions.filter((execution) => projectRuns.some((run) => run.id === execution.runId) && (execution.result === "FAILED" || execution.result === "BLOCKED"));
  const pending = logs.filter((entry) => entry.projectId === project.id && workLogStatus(entry) === "PENDING").length;
  const testing = versions.filter((version) => version.projectId === project.id && (version.status === "TESTING" || version.status === "DEVELOPMENT"));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="仪表盘" hint={`${project.name} 的进度。数字随事项、测试和工时变化。`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={active ? active.name : "没有进行中的迭代"} value={active ? `${sprintDone}/${sprintItems.length}` : "—"} />
        <Stat label="未关缺陷" value={String(openDefects.length)} />
        <Stat label="失败或阻塞" value={String(failed.length)} />
        <Stat label="待审工时" value={String(pending)} />
      </div>
      <section className="overflow-hidden rounded-sm border border-border bg-surface">
        <h2 className="type-section border-b border-border px-4 py-3">我的未完成</h2>
        {mine.length === 0 ? <p className="type-meta px-4 py-3">没有分给你的未完成事项。</p> : null}
        {mine.slice(0, 8).map((item) => (
          <button key={item.id} type="button" className="flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-line" onClick={() => goToItem(item.id)}>
            <IssueTypeIcon item={item} />
            <span className="type-link shrink-0">{item.key}</span>
            <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
            <StatusChip kind={item.kind} status={item.status} />
          </button>
        ))}
      </section>
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
