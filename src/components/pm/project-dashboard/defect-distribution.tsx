import { useDefectStatistics } from "@/lib/query/hooks/useDefects";
import {
  categoryData,
  countText,
  countValue,
  isDashboardPermissionDenied,
} from "@/lib/project-dashboard-data";
import { ProjectStatsError } from "./query-state";
import { DefectDistributionPieSvg } from "./charts";

/** 用户要求在维度未确认时读取候选真实契约；候选严重程度保持后端中文标签。 */
export function DefectDistribution({ projectId }: { projectId: number }) {
  const query = useDefectStatistics(projectId);
  const data = isDashboardPermissionDenied(query.error) ? undefined : query.data;
  const classified = categoryData(data?.severityStats);
  const total = classified.categories.reduce((sum, category) => sum + category.value, 0);
  return (
    <section aria-label="缺陷分布" className="space-y-3 rounded border border-border p-4">
      <h2 className="font-semibold">缺陷分布 · 项目 #{projectId}</h2>
      <p>缺陷分布维度待确认（维度待业务确认）</p>
      <p className="text-sm">
        候选维度：严重程度；包含已关闭的有效缺陷。占比以已返回分类数量合计为分母。
      </p>
      {query.isFetching ? (
        <p role="status">{data ? "正在更新缺陷分布…" : "正在加载缺陷分布…"}</p>
      ) : null}
      {query.isError ? (
        <ProjectStatsError
          area="缺陷分布"
          error={query.error}
          hasData={data !== undefined}
          retry={() => void query.refetch()}
        />
      ) : null}
      {data ? (
        <>
          <p>
            缺陷总数：{countText(data.totalDefects)} · 已返回分类数量：{countText(total)}
          </p>
          {classified.invalid ||
          !data.severityStats ||
          countValue(data.totalDefects) === null ||
          total !== data.totalDefects ? (
            <p role="alert">分类数量缺失或异常，或与缺陷总数不一致；数量及分母口径待联调确认。</p>
          ) : null}
          {data.totalDefects === 0 ? (
            <p>当前项目暂无缺陷</p>
          ) : (
            <DefectDistributionPieSvg categories={classified.categories} />
          )}
        </>
      ) : query.isSuccess ? (
        <p>缺陷统计数据未提供</p>
      ) : null}
    </section>
  );
}
