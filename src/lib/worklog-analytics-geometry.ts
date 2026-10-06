import { buildCountBars, buildLineGeometry } from "./project-dashboard-geometry";
import { countValue } from "./project-dashboard-data";
import { normalizeWorkLogDailyTrend, type WorkLogHourGroup } from "./worklog-analytics-data";
export function buildWorkLogHourBars(
  groups: readonly WorkLogHourGroup[],
  width = 400,
  rowHeight = 36,
) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h =
    Number.isFinite(rowHeight) && rowHeight > 0
      ? Math.min(rowHeight, Number.MAX_SAFE_INTEGER / Math.max(1, groups.length))
      : 1;
  const widths = buildCountBars(
    groups.map((group) => group.value),
    w,
  );
  const max = groups.reduce((value, group) => Math.max(value, countValue(group.value) ?? 0), 1);
  return {
    bars: groups.map((group, i) => ({
      ...group,
      x: 0,
      y: i * h,
      width: widths[i],
      height: h * 0.6,
    })),
    ticks: [0, max],
    width: w,
    height: Math.max(h, groups.length * h),
  };
}
export function buildWorkLogDailyTrend(source: unknown, width = 600, height = 180) {
  const normalized = normalizeWorkLogDailyTrend(source);
  return { ...normalized, ...buildLineGeometry(normalized.rows, width, height) };
}
