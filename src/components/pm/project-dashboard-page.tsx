import { useState } from "react";
import { Button } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  useProjectDashboard,
  useProjectDashboardCompare,
  useProjectProgress,
  useProjectStatistics,
} from "@/lib/query/hooks/useProjectStats";
import { isAuthExpiredError } from "@/lib/query/error";
import { queryKeys } from "@/lib/query/keys";
import {
  alignComparison,
  countText,
  isDashboardPermissionDenied,
  normalizeCompareIds,
  parseProjectId,
  projectName,
} from "@/lib/project-dashboard-data";
import {
  ProjectComparisonView,
  ProjectKpiCards,
  ProjectProgressGanttSvg,
  ProjectProgressSummary,
  TaskCompletionTrendSvg,
} from "./project-dashboard/charts";
import { DefectDistribution } from "./project-dashboard/defect-distribution";
import { ProjectStatsError } from "./project-dashboard/query-state";
import { StatisticsProjectSelector, type SelectedProject } from "./project-dashboard/selector";

export function ProjectDashboardPage({ projectId: rawId }: { projectId: string }) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const account = useAuthStore((s) => s.user?.userId ?? "anonymous");
  const projectId = parseProjectId(rawId);
  if (projectId === null)
    return (
      <p role="alert" className="p-6">
        项目 ID 无效
      </p>
    );
  if (!authenticated) return <p className="p-6">请登录后查看项目仪表盘。</p>;
  // Route and identity changes discard selection snapshots. Query session clearing stays in __root/auth-store.
  return <ProjectDashboardLive key={`${account}:${projectId}`} projectId={projectId} />;
}
function ProjectDashboardLive({ projectId }: { projectId: number }) {
  const client = useQueryClient();
  const dashboard = useProjectDashboard(projectId),
    progress = useProjectProgress(projectId),
    statistics = useProjectStatistics();
  const [selected, setSelected] = useState<SelectedProject[]>([
    { id: projectId, name: projectName(null, projectId) },
  ]);
  const compareIds = selected.map((item) => item.id);
  const normalized = normalizeCompareIds(compareIds);
  const compare = useProjectDashboardCompare(compareIds);
  const core = [dashboard, progress, ...(normalized.enabled ? [compare] : [])];
  const refresh = () => {
    void dashboard.refetch();
    void progress.refetch();
    void statistics.refetch();
    if (normalized.enabled) void compare.refetch();
    void client.refetchQueries({
      queryKey: queryKeys.defect.statistics(projectId),
      exact: true,
      type: "active",
    });
  };
  if (core.some((query) => isAuthExpiredError(query.error)) || isAuthExpiredError(statistics.error))
    return (
      <p role="alert" className="p-6">
        登录已失效，请重新登录。
      </p>
    );
  if (isDashboardPermissionDenied(dashboard.error))
    return (
      <div className="p-6">
        <ProjectStatsError area="项目仪表盘" error={dashboard.error} retry={refresh} />
      </div>
    );
  const failed = core.find(
    (query) =>
      query.isError && query.data === undefined && !isDashboardPermissionDenied(query.error),
  );
  if (failed)
    return (
      <div className="p-6" aria-label="项目仪表盘加载失败">
        <ProjectStatsError area="项目仪表盘" error={failed.error} retry={refresh} />
      </div>
    );
  if (dashboard.isPending)
    return (
      <div role="status" aria-label="项目仪表盘加载中" className="space-y-3 p-6">
        <p>正在加载项目仪表盘…</p>
        <div className="h-24 animate-pulse rounded bg-default-100" />
        <div className="h-40 animate-pulse rounded bg-default-100" />
      </div>
    );
  if (dashboard.data == null)
    return (
      <div className="p-6">
        <p>项目不存在或仪表盘数据未提供</p>
        {dashboard.isError ? (
          <ProjectStatsError area="项目仪表盘" error={dashboard.error} hasData retry={refresh} />
        ) : (
          <Button variant="ghost" onPress={refresh}>
            重试项目仪表盘
          </Button>
        )}
      </div>
    );
  const data = dashboard.data;
  const aligned = alignComparison(compareIds, compare.data);
  const progressData = isDashboardPermissionDenied(progress.error) ? undefined : progress.data;
  const compareData = isDashboardPermissionDenied(compare.error) ? undefined : compare.data;
  const statsData = isDashboardPermissionDenied(statistics.error) ? undefined : statistics.data;
  const selectedWithNames = selected.map((item) =>
    item.id === projectId ? { ...item, name: projectName(data.projectName, projectId) } : item,
  );
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            项目仪表盘 · {projectName(data.projectName, projectId)}
          </h1>
          <p className="text-sm">主项目 #{projectId}</p>
        </div>
        <Button variant="secondary" onPress={refresh}>
          刷新统计
        </Button>
      </div>
      {core.some((query) => query.isFetching) ? <p role="status">正在更新项目统计…</p> : null}
      {dashboard.isError ? (
        <ProjectStatsError
          area="项目仪表盘"
          error={dashboard.error}
          hasData
          retry={() => void dashboard.refetch()}
        />
      ) : null}
      <ProjectKpiCards data={data} />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <ProjectProgressSummary data={data} />
        <section aria-label="任务计划" className="space-y-3 rounded border border-border p-4">
          <h2 className="font-semibold">任务计划 · 项目 #{projectId}</h2>
          {progress.isError ? (
            <ProjectStatsError
              area="任务计划"
              error={progress.error}
              hasData={progressData !== undefined}
              retry={() => void progress.refetch()}
            />
          ) : null}
          {progressData ? (
            <ProjectProgressGanttSvg data={progressData} projectId={projectId} />
          ) : progress.isPending ? (
            <p role="status">正在加载任务计划…</p>
          ) : progressData !== undefined || !progress.isError ? (
            <p>项目计划数据未提供</p>
          ) : null}
        </section>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="任务完成趋势" className="space-y-3 rounded border border-border p-4">
          <h2 className="font-semibold">任务完成趋势 · 项目 #{projectId}</h2>
          <TaskCompletionTrendSvg />
        </section>
        <DefectDistribution projectId={projectId} />
      </div>
      <section aria-label="项目对比" className="space-y-4 rounded border border-border p-4">
        <h2 className="font-semibold">项目对比</h2>
        {statistics.isError ? (
          <ProjectStatsError
            area="统计概览"
            error={statistics.error}
            hasData={statsData !== undefined}
            retry={() => void statistics.refetch()}
          />
        ) : null}
        {statistics.isFetching ? <p role="status">正在更新统计概览…</p> : null}
        {statsData ? (
          <p className="text-sm">
            授权范围项目概览：总数 {countText(statsData.totalCount)} · 进行中{" "}
            {countText(statsData.runningCount)} · 已完成 {countText(statsData.completedCount)} ·
            暂停 {countText(statsData.pausedCount)} · 归档 {countText(statsData.archivedCount)}
            （归档与状态可能重叠）
          </p>
        ) : null}
        <StatisticsProjectSelector selected={selectedWithNames} onChange={setSelected} />
        {compare.isFetching && normalized.enabled ? <p role="status">正在更新项目对比…</p> : null}
        {compare.isError && normalized.enabled ? (
          <ProjectStatsError
            area="项目对比"
            error={compare.error}
            hasData={compareData !== undefined}
            retry={() => void compare.refetch()}
          />
        ) : null}
        {!selected.length ? (
          <p>请选择项目进行对比</p>
        ) : normalized.error ? null : compareData !== undefined ? (
          aligned.error ? (
            <p role="alert">{aligned.error}</p>
          ) : (
            <ProjectComparisonView rows={aligned.rows} />
          )
        ) : compare.isSuccess ? (
          <p>暂无项目对比数据</p>
        ) : null}
      </section>
    </div>
  );
}
