import { useState } from "react";
import { Button } from "@heroui/react";
import { toUserMessage } from "@/lib/query";
import {
  aggregateWorkLogStatistics,
  analyticsValueText,
  type AnalyticsValue,
  type WorkLogDimension,
} from "@/lib/worklog-analytics-data";
import { WorkLogHourBars } from "./worklog-analytics-charts";
import { WorkLogPager } from "./worklog-list-controls";
export interface AnalyticsQueryState {
  data?: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}
export function AnalyticsQueryFeedback({
  query,
  label,
}: {
  query: AnalyticsQueryState;
  label: string;
}) {
  return (
    <>
      {query.isLoading ? <p>{label}正在加载…</p> : null}
      {query.isFetching && query.data !== undefined ? <p>{label}正在刷新…</p> : null}
      {query.isError ? (
        <p role="alert">
          {label}
          {query.data !== undefined ? "旧数据，刷新失败：" : "加载失败："}
          {toUserMessage(query.error)}
          <Button onPress={() => void query.refetch()}>重试{label}</Button>
        </p>
      ) : null}
    </>
  );
}
export function AnalyticsMetricCard({
  label,
  value,
  unit = "小时",
  query,
}: {
  label: string;
  value: AnalyticsValue;
  unit?: string;
  query: AnalyticsQueryState;
}) {
  return (
    <section aria-label={label} className="rounded border border-border p-4">
      <h2>{label}</h2>
      <AnalyticsQueryFeedback query={query} label={label} />
      {!query.isLoading && (!query.isError || query.data !== undefined) ? (
        <p>
          {analyticsValueText(value)} {value.state === "known" ? unit : ""}
        </p>
      ) : null}
    </section>
  );
}
export function WorkLogStatisticsPanel({
  dimension,
  range,
  month,
}: {
  dimension: WorkLogDimension;
  range: AnalyticsQueryState;
  month: AnalyticsQueryState;
}) {
  const [page, setPage] = useState(1);
  const result = aggregateWorkLogStatistics(range.data, dimension);
  const monthly = aggregateWorkLogStatistics(month.data, dimension);
  const pages = Math.max(1, Math.ceil(result.groups.length / 10));
  const currentPage = Math.min(page, pages);
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AnalyticsMetricCard label="本月总工时" value={monthly.total} query={month} />
        <AnalyticsMetricCard label="所选范围总工时" value={result.total} query={range} />
      </div>
      {!range.isLoading && (!range.isError || range.data !== undefined) ? (
        <>
          {result.state === "missing" ? (
            <p>数据暂未提供；部分小时缺失时不展示小计为总工时。</p>
          ) : result.state === "invalid" ? (
            <p role="alert">统计响应异常，无法确认完整总工时。</p>
          ) : result.groups.length === 0 ? (
            <p>该范围暂无工时记录</p>
          ) : null}
          {result.groups.length ? (
            <>
              <h2>全部实体工时（小时）</h2>
              <WorkLogHourBars groups={result.groups} />
              <table className="w-full text-left text-sm">
                <caption>
                  分组工时数据表（共 {result.groups.length} 个实体；全量总工时{" "}
                  {analyticsValueText(result.total)} 小时）
                </caption>
                <thead>
                  <tr>
                    <th scope="col">实体</th>
                    <th scope="col">ID</th>
                    <th scope="col">总工时（小时）</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.slice((currentPage - 1) * 10, currentPage * 10).map((group) => (
                    <tr key={group.key}>
                      <th scope="row">{group.label}</th>
                      <td>{group.key === "unassociated" ? "未关联" : group.key}</td>
                      <td>{analyticsValueText(group)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <WorkLogPager label="实体" page={currentPage} pages={pages} onChange={setPage} />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
