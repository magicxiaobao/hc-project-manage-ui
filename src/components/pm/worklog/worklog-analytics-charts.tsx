import { useId } from "react";
import { buildWorkLogDailyTrend, buildWorkLogHourBars } from "@/lib/worklog-analytics-geometry";
import {
  analyticsValue,
  analyticsValueText,
  type WorkLogHourGroup,
} from "@/lib/worklog-analytics-data";
export function WorkLogHourBars({ groups }: { groups: WorkLogHourGroup[] }) {
  const id = useId();
  const geometry = buildWorkLogHourBars(groups);
  return (
    <div className="max-h-96 overflow-auto">
      <svg
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        viewBox={`0 0 720 ${geometry.height + 36}`}
        className="w-full"
        style={{ minHeight: Math.min(geometry.height + 36, 420) }}
      >
        <title id={`${id}-title`}>按实体分组的工时柱图（全部实体）</title>
        <desc id={`${id}-desc`}>
          共享小时轴；下方数据表提供全部实体和数值。未提供的小时不绘制柱形。
        </desc>
        {geometry.bars.map((bar) => (
          <g key={bar.key} transform={`translate(180, ${bar.y + 4})`}>
            <title>
              {bar.label}：{analyticsValueText(bar)} 小时
            </title>
            <text x="-176" y="18">
              {bar.label.length > 16 ? `${bar.label.slice(0, 16)}…` : bar.label}
            </text>
            {bar.width !== null ? (
              <rect
                x={bar.x}
                y="0"
                width={bar.width}
                height={bar.height}
                fill="currentColor"
                className="text-accent"
              />
            ) : null}
            <text x={geometry.width + 8} y="18">
              {analyticsValueText(bar)}
            </text>
          </g>
        ))}
        <text x="180" y={geometry.height + 24}>
          0 小时
        </text>
        <text x="580" y={geometry.height + 24} textAnchor="end">
          {geometry.ticks[1]} 小时
        </text>
      </svg>
    </div>
  );
}
export function WorkLogDailyTrend({ source }: { source: unknown }) {
  const id = useId();
  const geometry = buildWorkLogDailyTrend(source);
  return (
    <section className="grid gap-2">
      <h2>日工时趋势（POST workLog/v1/analytics）</h2>
      {geometry.state === "invalid" ? (
        <p role="alert">部分日工时趋势响应异常，无法绘制的点已保留为未知。</p>
      ) : null}
      {geometry.points.length ? (
        <svg
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
          viewBox="-45 -20 700 230"
          className="w-full max-w-4xl"
        >
          <title id={`${id}-title`}>日工时趋势</title>
          <desc id={`${id}-desc`}>单位小时，仅使用实际返回的日期与小时，缺失小时保留断线。</desc>
          <path
            d={geometry.path}
            fill="none"
            stroke="currentColor"
            className="text-accent"
            strokeWidth="2"
          />
          {geometry.points.map((point, index) => (
            <circle
              key={`${point.date}-${index}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="currentColor"
            >
              <title>
                {point.date}：{point.value} 小时
              </title>
            </circle>
          ))}
          <text x="-40" y="0">
            {geometry.ticks[1]}
          </text>
          <text x="-40" y="180">
            0
          </text>
          <text x="0" y="210">
            {geometry.points[0].date}
          </text>
          <text x="600" y="210" textAnchor="end">
            {geometry.points.at(-1)!.date}
          </text>
        </svg>
      ) : (
        <p>
          {Array.isArray(source) && source.length === 0 ? "暂无趋势记录" : "日工时趋势数据暂未提供"}
        </p>
      )}
      {geometry.rows.length ? (
        <table className="w-full text-left text-sm">
          <caption>日工时趋势数据表（小时）</caption>
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">工时（小时）</th>
            </tr>
          </thead>
          <tbody>
            {geometry.rows.map((row, index) => (
              <tr key={`${row.date}-${index}`}>
                <th scope="row">{row.date}</th>
                <td>{analyticsValueText(analyticsValue(row.value))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
