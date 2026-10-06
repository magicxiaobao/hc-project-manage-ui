import type { GanttTaskItem } from "./api/project-stats-types";
import {
  countValue,
  dateDay,
  dayDate,
  taskPlan,
  type ChartCategory,
} from "./project-dashboard-data";

function dimension(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
export function buildLineGeometry(
  data: readonly { date: string; value: number | null }[],
  width = 600,
  height = 180,
) {
  const w = dimension(width),
    h = dimension(height);
  const points = data
    .flatMap((item) => {
      const day = dateDay(item.date),
        value = countValue(item.value);
      return day === null || value === null ? [] : [{ date: item.date, day, value }];
    })
    .sort((a, b) => a.day - b.day);
  if (!points.length) return { points: [], path: "", ticks: [] };
  const first = points[0].day,
    span = points.at(-1)!.day - first;
  const max = Math.max(1, ...points.map((p) => p.value));
  const mapped = points.map((p) => ({
    ...p,
    x: span ? ((p.day - first) / span) * w : w / 2,
    y: h - (p.value / max) * h,
  }));
  // Missing values stay gaps; never connect a line through unconfirmed missing days.
  const missing = new Set(
    data
      .filter((item) => countValue(item.value) === null)
      .map((item) => dateDay(item.date))
      .filter((day) => day !== null),
  );
  const path = mapped
    .map((p, index) => {
      const previous = mapped[index - 1];
      const gap = previous && [...missing].some((day) => day > previous.day && day < p.day);
      return `${index === 0 || gap ? "M" : "L"} ${p.x} ${p.y}`;
    })
    .join(" ");
  return { points: mapped, path, ticks: [0, max] };
}
export function buildPieGeometry(categories: readonly ChartCategory[]) {
  const valid = categories.filter((item) => countValue(item.value) !== null);
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  if (!Number.isFinite(total) || total <= 0) return { total: 0, slices: [] };
  let angle = -Math.PI / 2;
  const slices = valid
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = angle,
        proportion = item.value / total;
      angle += proportion * Math.PI * 2;
      const end = angle,
        fullCircle = proportion === 1;
      const x1 = 100 + 80 * Math.cos(start),
        y1 = 100 + 80 * Math.sin(start);
      const x2 = 100 + 80 * Math.cos(end),
        y2 = 100 + 80 * Math.sin(end);
      return {
        ...item,
        label: item.label.trim() || "未知分类",
        proportion,
        startAngle: start,
        endAngle: end,
        fullCircle,
        path: fullCircle
          ? ""
          : `M 100 100 L ${x1} ${y1} A 80 80 0 ${proportion > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`,
      };
    });
  return { total, slices };
}
export function buildGanttGeometry(tasks: readonly GanttTaskItem[], width = 600) {
  const w = dimension(width);
  const plans = tasks.map(taskPlan);
  const valid = plans.filter((row) => row.reason === null);
  const start = valid.length ? Math.min(...valid.map((row) => row.startDay!)) : null;
  const end = valid.length ? Math.max(...valid.map((row) => row.endDay!)) + 1 : null;
  const span = start !== null && end !== null ? end - start : 0;
  const rows = plans.map((row) => ({
    ...row,
    x: row.reason || !span ? null : ((row.startDay! - start!) / span) * w,
    width: row.reason || !span ? null : ((row.endDay! + 1 - row.startDay!) / span) * w,
  }));
  const ticks =
    start === null || end === null
      ? []
      : [...new Set([start, Math.floor((start + end - 1) / 2), end - 1])].map((day) => ({
          day,
          label: dayDate(day),
          x: ((day - start) / span) * w,
        }));
  return { rows, start, end, ticks };
}
/** Counts share only a count axis. Percentages are independently scaled to 100. */
export function buildCountBars(values: readonly (number | null)[], width = 300) {
  const w = dimension(width);
  const max = Math.max(1, ...values.map((value) => countValue(value) ?? 0));
  return values.map((value) => {
    const count = countValue(value);
    return count === null ? null : (count / max) * w;
  });
}
