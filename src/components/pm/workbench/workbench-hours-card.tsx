import { Link } from "@tanstack/react-router";
import { adaptWorkbenchHours } from "@/lib/workbench-data";
import type { WorkbenchResult } from "@/lib/query/hooks/useWorkbench";
import { WorkbenchCardFeedback } from "./workbench-card-feedback";
export function WorkbenchHoursCard({ workbench: w }: { workbench: WorkbenchResult }) {
  return (
    <section
      aria-labelledby="workbench-hours"
      className="min-w-0 rounded border border-border bg-surface p-4"
    >
      <h2 id="workbench-hours" className="type-section">
        我的工时
      </h2>
      <WorkbenchCardFeedback query={w.scope} label="工时项目范围" />
      {w.scope.data?.length === 0 ? <p>暂无可统计项目</p> : null}
      {w.scope.isError && w.scope.data !== undefined ? (
        <p>旧项目范围，以下结果无法确认实时完整性。</p>
      ) : null}
      {(
        [
          { label: "今日", start: w.dates.today, query: w.today },
          { label: "本周", start: w.dates.weekStart, query: w.week },
        ] as const
      ).map(({ label, start, query }) => {
        const hours = adaptWorkbenchHours(query.data, w.userId!, start, w.dates.today);
        return (
          <section
            key={label}
            aria-label={`${label}工时`}
            className="mt-4 border-t border-border pt-3"
          >
            <h3 className="type-emphasis">{label}工时</h3>
            <p>
              {start} 至 {w.dates.today}
            </p>
            <WorkbenchCardFeedback query={query} label={`${label}工时`} />
            <p className="my-2 text-2xl">
              {hours.total ?? "—"}
              {hours.total !== null ? " 小时（候选）" : ""}
            </p>
            {hours.total === null ? <p>数据暂未提供，待联调确认</p> : <p>字段口径待联调确认</p>}
            {hours.total === null && hours.rows.length > 0 ? (
              <ul>
                {hours.rows.map((row, index) => (
                  <li key={index}>
                    {row.date}：{row.hours} 小时（可确认行，不代表总量）
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
      <p className="type-caption mt-3">
        浏览器本地日期；服务端时区、小时单位及过滤口径待联调确认。
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link to="/worklogs" className="text-accent underline">
          查看工时
        </Link>
        <Link to="/worklogs/analytics" className="text-accent underline">
          统计分析
        </Link>
      </div>
    </section>
  );
}
