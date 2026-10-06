import { isCanonicalUserId } from "./api/auth";
import type { PageResult } from "./api/types";
import type { TaskResponse, TaskStatus } from "./api/task-types";

export const WORKBENCH_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "PAUSED",
] as const satisfies readonly TaskStatus[];
export type WorkbenchStatus = (typeof WORKBENCH_STATUSES)[number];
export const WORKBENCH_STATUS_LABELS: Record<WorkbenchStatus, string> = {
  TODO: "待开始",
  IN_PROGRESS: "进行中",
  PAUSED: "已暂停",
};
export function workbenchUserId(raw: unknown): number | null {
  return isCanonicalUserId(raw) && Number(raw) > 0 ? Number(raw) : null;
}
export function localCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function workbenchDates(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return { today: localCalendarDate(now), weekStart: localCalendarDate(monday) };
}
export function workbenchTaskParams(
  projectId: number,
  assigneeId: number,
  status: WorkbenchStatus,
) {
  // 同 useTaskList 的归一化 wrapper，不增加专用缓存族。
  return { page: 1, pageSize: 10, bean: { assigneeId, status, projectId } };
}
export function validateWorkbenchTasks(
  data: PageResult<TaskResponse>,
  projectId: number,
  assigneeId: number,
  status: WorkbenchStatus,
): PageResult<TaskResponse> {
  if (
    !Array.isArray(data.list) ||
    !Number.isSafeInteger(data.total) ||
    data.total < data.list.length ||
    data.list.length > 10 ||
    data.list.some(
      (item) =>
        item.projectId !== projectId || item.assigneeId !== assigneeId || item.status !== status,
    )
  ) {
    throw new Error("筛选结果异常：项目、执行人或状态与查询条件不符");
  }
  return data;
}
export interface CandidateHours {
  total: number | null;
  rows: { date: string; hours: number }[];
}
function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  return localCalendarDate(date) === value;
}
/** Object 端点的候选展示规则，绝非服务端 schema 承诺。空数组不解释成 0。 */
export function adaptWorkbenchHours(
  data: unknown,
  userId: number,
  startDate: string,
  endDate: string,
): CandidateHours {
  if (!Array.isArray(data) || !data.length) return { total: null, rows: [] };
  const rows: CandidateHours["rows"] = [];
  for (const value of data) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (
      row.userId === userId &&
      validCalendarDate(row.statisticDate) &&
      row.statisticDate >= startDate &&
      row.statisticDate <= endDate &&
      typeof row.totalHours === "number" &&
      Number.isFinite(row.totalHours) &&
      row.totalHours >= 0
    ) {
      rows.push({ date: row.statisticDate, hours: row.totalHours });
    }
  }
  const sum = rows.reduce((total, row) => total + row.hours, 0);
  return { total: rows.length === data.length && Number.isFinite(sum) ? sum : null, rows };
}
export function summarizeWorkbenchTasks(
  groups: { data?: PageResult<TaskResponse>; isError: boolean }[],
) {
  const known = groups.filter((group) => group.data !== undefined);
  const subtotal = known.reduce((sum, group) => sum + group.data!.total, 0);
  return {
    total: groups.length > 0 && known.length === groups.length ? subtotal : null,
    subtotal,
    covered: known.length,
    groups: groups.length,
    stale: groups.some((group) => group.isError),
    shown: known.reduce((sum, group) => sum + group.data!.list.length, 0),
  };
}
