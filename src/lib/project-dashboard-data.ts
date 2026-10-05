import type { GanttTaskItem, ProjectDashboardVO } from "./api/project-stats-types";
import { ApiBusinessError, HttpResponseError } from "./api/client";

export function validProjectId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function parseProjectId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return validProjectId(id) ? id : null;
}
export function normalizeCompareIds(ids: readonly number[]) {
  const normalized = [...new Set(ids)].sort((a, b) => a - b);
  const error = ids.some((id) => !validProjectId(id))
    ? "项目 ID 无效，请选择有效项目。"
    : normalized.length > 50
      ? "最多选择 50 个对比项目。"
      : null;
  return { ids: normalized, error, enabled: !error && normalized.length > 0 };
}
export function projectName(name: unknown, id: number) {
  return typeof name === "string" && name.trim() ? name.trim() : `项目 #${id}`;
}
export function countValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export function countText(value: unknown) {
  const count = countValue(value);
  return count === null ? "—（未知或异常）" : String(count);
}
export function percentValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return { text: "—（未知或异常）", width: null };
  return {
    text: `${value}%${value < 0 || value > 100 ? "（异常值）" : ""}`,
    width: Math.min(100, Math.max(0, value)),
  };
}
export function isDashboardPermissionDenied(error: unknown) {
  return (
    (error instanceof ApiBusinessError && (error.httpStatus === 403 || error.code === 10105)) ||
    (error instanceof HttpResponseError && error.httpStatus === 403)
  );
}
export function alignComparison(
  ids: readonly number[],
  rows: ProjectDashboardVO[] | null | undefined,
) {
  if (rows == null || rows.length === 0) return { rows: [], error: null };
  const expected = new Set(ids);
  const byId = new Map<number, ProjectDashboardVO>();
  for (const row of rows) {
    if (
      !row ||
      !validProjectId(row.projectId) ||
      !expected.has(row.projectId) ||
      byId.has(row.projectId)
    ) {
      return { rows: [], error: "对比响应异常：项目 ID 重复、无效或不属于请求集合。" };
    }
    byId.set(row.projectId, row);
  }
  if (byId.size !== expected.size) return { rows: [], error: "对比响应异常：缺少所选项目。" };
  return { rows: ids.map((id) => byId.get(id)!), error: null };
}

const DAY_MS = 86_400_000;
/** LocalDate 用 UTC 日序号校验/计算，不受本地时区、DST 影响。 */
export function dateDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.getTime() / DAY_MS;
}
export function dayDate(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
/** ProjectGanttVO 项目边界的 Long 已在后端确认是 epoch seconds。 */
export function epochSecondsText(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "未提供";
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? `${date.toISOString()}（UTC）` : "日期异常";
}
export function taskPlan(task: GanttTaskItem) {
  const start = dateDay(task.start),
    end = dateDay(task.end);
  const reason =
    !task.start || !task.end
      ? "未排期：缺少预计开始或结束日期"
      : start === null || end === null
        ? "日期无效"
        : end < start
          ? "结束日期早于开始日期"
          : null;
  return {
    ...task,
    name: task.name?.trim() || `任务 #${task.id ?? "未知"}`,
    startDay: start,
    endDay: end,
    reason,
  };
}
export interface ChartCategory {
  label: string;
  value: number;
}
/** 只处理同一个真实分类 Map；不从 KPI 或状态合计推导额外分类。 */
export function categoryData(source: Record<string, number> | null | undefined) {
  const categories: ChartCategory[] = [];
  let invalid = false;
  for (const [label, value] of Object.entries(source ?? {})) {
    const count = countValue(value);
    if (count === null) {
      invalid = true;
      continue;
    }
    categories.push({ label: label.trim() || "未知分类", value: count });
  }
  return { categories, invalid };
}
