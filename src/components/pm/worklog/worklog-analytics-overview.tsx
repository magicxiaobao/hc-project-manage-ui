import type { WorkLogAnalyticsResponse } from "@/lib/api/worklog-types";
import { analyticsValue } from "@/lib/worklog-analytics-data";
import { AnalyticsMetricCard, type AnalyticsQueryState } from "./worklog-statistics-panel";
import { WorkLogDailyTrend } from "./worklog-analytics-charts";
export function WorkLogAnalyticsOverview({
  range,
  month,
}: {
  range: AnalyticsQueryState;
  month: AnalyticsQueryState;
}) {
  const data = range.data as WorkLogAnalyticsResponse | null | undefined;
  const monthly = month.data as WorkLogAnalyticsResponse | null | undefined;
  return (
    <section className="grid gap-4">
      <p>综合分析按项目集合与日期范围查询；不应用用户或任务 ID 子集筛选。</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsMetricCard
          label="本月总工时"
          value={analyticsValue(monthly?.overview?.totalHours)}
          query={month}
        />
        <AnalyticsMetricCard
          label="所选范围总工时"
          value={analyticsValue(data?.overview?.totalHours)}
          query={range}
        />
        <AnalyticsMetricCard
          label="有效工时"
          value={analyticsValue(data?.overview?.effectiveHours)}
          query={range}
        />
        <AnalyticsMetricCard
          label="记录数"
          value={analyticsValue(data?.overview?.totalRecords)}
          query={range}
          unit="条"
        />
      </div>
      {!range.isLoading && (!range.isError || range.data !== undefined) ? (
        <>
          {!data?.overview ? <p>综合概览数据暂未提供</p> : null}
          <WorkLogDailyTrend source={data?.dailyTrend} />
          <section>
            <h2>综合分析洞察（POST workLog/v1/analytics）</h2>
            {Array.isArray(data?.insights) &&
            data.insights.some((text) => typeof text === "string" && text.trim()) ? (
              <ul>
                {data.insights
                  .filter((text) => typeof text === "string" && text.trim())
                  .map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
              </ul>
            ) : (
              <p>洞察数据暂未提供</p>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
