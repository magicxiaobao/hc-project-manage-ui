import type { ProjectDashboardVO, ProjectGanttVO } from "@/lib/api/project-stats-types";
import {
  countText,
  epochSecondsText,
  percentValue,
  projectName,
  type ChartCategory,
} from "@/lib/project-dashboard-data";
import {
  buildCountBars,
  buildGanttGeometry,
  buildLineGeometry,
  buildPieGeometry,
} from "@/lib/project-dashboard-geometry";

const colors = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#dc2626", "#64748b"];
export function ProjectKpiCards({ data }: { data: ProjectDashboardVO }) {
  const cards = [
    ["任务总数", data.totalTasks],
    ["已完成", data.completedTasks],
    ["未完成", data.unfinishedTasks],
    ["已取消", data.cancelledTasks],
    ["缺陷数", data.bugCount],
    ["版本数", data.versionCount],
  ] as const;
  return (
    <section aria-label="项目 KPI">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded border border-border bg-surface p-4">
            <dt className="text-sm text-default-500">{label}</dt>
            <dd className="mt-2 text-xl font-semibold">{countText(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm">
        任务状态明细：进行中 {countText(data.inProgressTasks)} · 待办 {countText(data.pendingTasks)}{" "}
        · 已暂停 {countText(data.pausedTasks)}
      </p>
    </section>
  );
}
function PercentBar({ label, value }: { label: string; value: number | null }) {
  const percent = percentValue(value);
  return (
    <div>
      <p>
        {label}：{percent.text}
      </p>
      <svg
        role="img"
        aria-label={`${label} ${percent.text}`}
        viewBox="0 0 300 14"
        className="mt-1 w-full"
      >
        <rect width="300" height="14" rx="4" fill="#e2e8f0" />
        {percent.width !== null ? (
          <rect width={percent.width * 3} height="14" rx="4" fill="#2563eb" />
        ) : null}
      </svg>
    </div>
  );
}
export function ProjectProgressSummary({ data }: { data: ProjectDashboardVO }) {
  return (
    <section aria-label="项目进度" className="space-y-3 rounded border border-border p-4">
      <h2 className="font-semibold">项目进度</h2>
      <PercentBar label="任务完成率" value={data.progress} />
      <PercentBar label="里程碑完成率" value={data.milestoneProgress} />
    </section>
  );
}
/** G1 未确认前生产页面不传 points；几何能力仅供后续已评审的真实来源接线。 */
export function TaskCompletionTrendSvg({
  points,
}: {
  points?: readonly { date: string; value: number | null }[];
}) {
  if (!points) return <p>任务完成趋势数据暂未提供</p>;
  const geometry = buildLineGeometry(points);
  if (!geometry.points.length) return <p>暂无任务完成趋势数据</p>;
  return (
    <>
      <svg
        role="img"
        aria-label="任务完成趋势（任务数）"
        viewBox="-10 -10 620 200"
        className="w-full"
      >
        <path d={geometry.path} fill="none" stroke="#2563eb" strokeWidth="2" />
        {geometry.points.map((p, index) => (
          <circle key={index} cx={p.x} cy={p.y} r="4" fill="#2563eb" />
        ))}
      </svg>
      <ul>
        {geometry.points.map((p, index) => (
          <li key={index}>
            {p.date}：{p.value} 个任务
          </li>
        ))}
      </ul>
    </>
  );
}
export function DefectDistributionPieSvg({ categories }: { categories: readonly ChartCategory[] }) {
  const geometry = buildPieGeometry(categories);
  if (!geometry.slices.length) return <p>暂无可绘制的缺陷分类数据</p>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        role="img"
        aria-label="缺陷严重程度候选分布"
        viewBox="0 0 200 200"
        className="w-48 max-w-full"
      >
        {geometry.slices.map((slice, index) =>
          slice.fullCircle ? (
            <circle key={index} cx="100" cy="100" r="80" fill={colors[index % colors.length]} />
          ) : (
            <path key={index} d={slice.path} fill={colors[index % colors.length]} />
          ),
        )}
      </svg>
      <ul className="text-sm">
        {categories.map((category, index) => (
          <li key={index}>
            {category.label}：{category.value} 个（
            {geometry.total ? ((category.value / geometry.total) * 100).toFixed(1) : "0.0"}%）
          </li>
        ))}
      </ul>
    </div>
  );
}
export function ProjectProgressGanttSvg({
  data,
  projectId,
}: {
  data: ProjectGanttVO;
  projectId: number;
}) {
  const geometry = buildGanttGeometry(data.tasks ?? []);
  return (
    <div>
      <p className="text-sm">
        {projectName(data.projectName, projectId)} · 项目计划：{epochSecondsText(data.startDate)} 至{" "}
        {epochSecondsText(data.endDate)}
      </p>
      {data.tasks === null ? (
        <p>任务数据未提供</p>
      ) : geometry.rows.length === 0 ? (
        <p>暂无任务</p>
      ) : (
        <>
          {geometry.start === null ? (
            <p>暂无有效计划，任务未排期或日期异常。</p>
          ) : (
            <p className="text-sm">计划起止均包含当天；任务状态仅以文字和颜色表示。</p>
          )}
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {projectName(data.projectName, projectId)}任务计划时间条
              </caption>
              <thead>
                <tr>
                  <th className="p-2">任务 / 状态</th>
                  <th className="p-2">预计日期</th>
                  <th className="min-w-60 p-2">
                    计划时间条
                    {geometry.ticks.length ? (
                      <svg aria-hidden="true" viewBox="0 0 600 24" className="w-full">
                        {geometry.ticks.map((tick, index) => (
                          <text
                            key={tick.day}
                            x={tick.x}
                            y="18"
                            fontSize="14"
                            textAnchor={
                              index === 0
                                ? "start"
                                : index === geometry.ticks.length - 1
                                  ? "end"
                                  : "middle"
                            }
                          >
                            {tick.label}
                          </text>
                        ))}
                      </svg>
                    ) : null}
                  </th>
                </tr>
              </thead>
              <tbody>
                {geometry.rows.map((row, index) => (
                  <tr key={`${row.id}-${index}`}>
                    <td className="p-2">
                      {row.name}
                      <br />
                      {row.status || "状态未知"}
                    </td>
                    <td className="p-2">
                      {row.start ?? "未提供"} 至 {row.end ?? "未提供"}
                      {row.reason ? <p>{row.reason}</p> : null}
                    </td>
                    <td className="p-2">
                      {row.x !== null && row.width !== null ? (
                        <svg
                          role="img"
                          aria-label={`${row.name}：${row.start} 至 ${row.end}，${row.status || "状态未知"}`}
                          viewBox="0 0 600 24"
                          className="w-full"
                        >
                          <rect
                            x={row.x}
                            width={row.width}
                            height="22"
                            rx="3"
                            fill={row.status === "已完成" ? "#059669" : "#2563eb"}
                          />
                        </svg>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
export function ProjectComparisonView({ rows }: { rows: readonly ProjectDashboardVO[] }) {
  if (!rows.length) return <p>暂无项目对比数据</p>;
  const bars = buildCountBars(rows.flatMap((row) => [row.completedTasks, row.bugCount]));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row, index) => (
        <article
          key={row.projectId}
          className="space-y-3 rounded border border-border p-4"
          aria-label={`对比项目 ${projectName(row.projectName, row.projectId!)}`}
        >
          <h3 className="font-semibold">
            {projectName(row.projectName, row.projectId!)}（#{row.projectId}）
          </h3>
          <PercentBar label="项目进度" value={row.progress} />
          <p className="text-sm">
            数量（个）：已完成任务 {countText(row.completedTasks)} · 缺陷 {countText(row.bugCount)}
          </p>
          <svg
            role="img"
            aria-label={`已完成任务 ${countText(row.completedTasks)} 个，缺陷 ${countText(row.bugCount)} 个`}
            viewBox="0 0 300 42"
            className="w-full"
          >
            {bars[index * 2] !== null ? (
              <rect width={bars[index * 2]!} height="16" fill="#2563eb" />
            ) : null}
            {bars[index * 2 + 1] !== null ? (
              <rect y="24" width={bars[index * 2 + 1]!} height="16" fill="#d97706" />
            ) : null}
          </svg>
        </article>
      ))}
    </div>
  );
}
