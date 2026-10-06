import type { WorkLogAnalyticsRequest } from "./api/worklog-types";
import { countValue, dateDay, validProjectId } from "./project-dashboard-data";
export type WorkLogDimension = "projects" | "users" | "tasks";
export type WorkLogAnalyticsView = WorkLogDimension | "analytics";
export interface WorkLogAnalyticsDraft {
  startDate: string;
  endDate: string;
  projectIds: number[];
  view: WorkLogAnalyticsView;
  userIds: string;
  taskIds: string;
}
export type AnalyticsField = keyof WorkLogAnalyticsDraft;
export interface AnalyticsFieldError {
  field: AnalyticsField;
  message: string;
}
export function workLogMonthRange(now = new Date()) {
  const year = now.getFullYear(),
    month = now.getMonth();
  const prefix = `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
  return {
    startDate: `${prefix}-01`,
    endDate: `${prefix}-${new Date(year, month + 1, 0).getDate()}`,
  };
}
export function defaultWorkLogAnalyticsDraft(now = new Date()): WorkLogAnalyticsDraft {
  return { ...workLogMonthRange(now), projectIds: [], view: "projects", userIds: "", taskIds: "" };
}
export function parseAnalyticsIds(input: string): number[] | null {
  if (!input.trim()) return [];
  const parts = input.split(",").map((part) => part.trim());
  if (parts.some((part) => !/^\d+$/.test(part) || !validProjectId(Number(part)))) return null;
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}
export function validateWorkLogAnalyticsDraft(draft: WorkLogAnalyticsDraft): AnalyticsFieldError[] {
  const errors: AnalyticsFieldError[] = [];
  for (const field of ["startDate", "endDate"] as const) {
    if (!draft[field])
      errors.push({ field, message: `${field === "startDate" ? "开始" : "结束"}日期不能为空` });
    else if (dateDay(draft[field]) === null)
      errors.push({ field, message: "请输入有效的 YYYY-MM-DD 日期" });
  }
  const start = dateDay(draft.startDate),
    end = dateDay(draft.endDate);
  if (start !== null && end !== null && end < start)
    errors.push({ field: "endDate", message: "结束日期不能早于开始日期" });
  if (!draft.projectIds.length) errors.push({ field: "projectIds", message: "请至少选择一个项目" });
  else if (draft.projectIds.some((id) => !validProjectId(id)))
    errors.push({ field: "projectIds", message: "项目 ID 须为正安全整数" });
  const field = draft.view === "users" ? "userIds" : draft.view === "tasks" ? "taskIds" : null;
  if (field && parseAnalyticsIds(draft[field]) === null)
    errors.push({ field, message: "ID 须为逗号分隔的正安全整数，不得包含空项" });
  return errors;
}
/** 只包含该 POST 路径实际消费的字段；非法 ID 保留给 hook 门禁拒绝。 */
export function normalizeWorkLogAnalytics(
  view: WorkLogAnalyticsView,
  params: WorkLogAnalyticsRequest,
): WorkLogAnalyticsRequest {
  const ids = (values: number[] | null | undefined) =>
    [...new Set(values ?? [])].sort((a, b) => a - b);
  const result: WorkLogAnalyticsRequest = {
    startDate: params.startDate,
    endDate: params.endDate,
    projectIds: ids(params.projectIds),
  };
  if (view === "users" && params.userIds?.length) result.userIds = ids(params.userIds);
  if (view === "tasks" && params.taskIds?.length) result.taskIds = ids(params.taskIds);
  return result;
}
export function workLogAnalyticsSnapshot(draft: WorkLogAnalyticsDraft) {
  return normalizeWorkLogAnalytics(draft.view, {
    startDate: draft.startDate,
    endDate: draft.endDate,
    projectIds: [...draft.projectIds],
    userIds: parseAnalyticsIds(draft.userIds),
    taskIds: parseAnalyticsIds(draft.taskIds),
  });
}
export function validWorkLogAnalyticsSnapshot(params: WorkLogAnalyticsRequest | null): boolean {
  if (!params) return false;
  const start = dateDay(params.startDate),
    end = dateDay(params.endDate);
  return (
    start !== null &&
    end !== null &&
    end >= start &&
    !!params.projectIds?.length &&
    [params.projectIds, params.userIds ?? [], params.taskIds ?? []].every((ids) =>
      ids.every(validProjectId),
    )
  );
}
export function analyticsDraftIdentity(draft: WorkLogAnalyticsDraft) {
  const textIds = (value: string) => parseAnalyticsIds(value) ?? { invalid: value };
  return JSON.stringify({
    ...draft,
    projectIds: [...new Set(draft.projectIds)].sort((a, b) => a - b),
    userIds: textIds(draft.userIds),
    taskIds: textIds(draft.taskIds),
  });
}
export type AnalyticsValue = { value: number | null; state: "known" | "missing" | "invalid" };
export function analyticsValue(value: unknown): AnalyticsValue {
  const count = countValue(value);
  return { value: count, state: count !== null ? "known" : value == null ? "missing" : "invalid" };
}
function addValues(left: AnalyticsValue, right: AnalyticsValue): AnalyticsValue {
  if (left.state === "invalid" || right.state === "invalid") return analyticsValue(NaN);
  if (left.state === "missing" || right.state === "missing") return analyticsValue(null);
  return analyticsValue(left.value! + right.value!);
}
export function analyticsValueText(value: AnalyticsValue) {
  return value.state === "known"
    ? String(value.value)
    : value.state === "missing"
      ? "—（未提供）"
      : "—（响应异常）";
}
export interface WorkLogHourGroup extends AnalyticsValue {
  key: string;
  label: string;
}
/** 输入为完整统计响应；不累计平均值、比例或 completedTasks。 */
export function aggregateWorkLogStatistics(source: unknown, dimension: WorkLogDimension) {
  if (!Array.isArray(source))
    return {
      groups: [] as WorkLogHourGroup[],
      total: analyticsValue(source == null ? null : NaN),
      state: source == null ? ("missing" as const) : ("invalid" as const),
    };
  const byId = new Map<string, WorkLogHourGroup>();
  let total = analyticsValue(0);
  const singular = { projects: "project", users: "user", tasks: "task" }[dimension];
  const noun = { projects: "项目", users: "用户", tasks: "任务" }[dimension];
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      total = analyticsValue(NaN);
      continue;
    }
    const id: unknown = item[`${singular}Id`];
    const validId = id === null || validProjectId(id);
    const key = id === null ? "unassociated" : validId ? String(id) : `invalid:${byId.size}`;
    const name =
      dimension === "users"
        ? item.userCnName || item.userName
        : dimension === "tasks"
          ? item.taskTitle
          : item.projectName;
    const label =
      id === null
        ? `未关联${noun}`
        : !validId
          ? `${noun} ID 异常`
          : `${typeof name === "string" && name.trim() ? name.trim() : `${noun} #${id}`}${dimension === "tasks" && typeof item.projectName === "string" && item.projectName.trim() ? ` · ${item.projectName.trim()}` : ""}`;
    const hours = validId ? analyticsValue(item.totalHours) : analyticsValue(NaN);
    total = addValues(total, hours);
    const previous = byId.get(key);
    byId.set(key, {
      key,
      label: previous?.label ?? label,
      ...(previous ? addValues(previous, hours) : hours),
    });
  }
  const groups = [...byId.values()].sort((a, b) => {
    if (a.value !== null && b.value !== null && a.value !== b.value) return b.value - a.value;
    if ((a.value === null) !== (b.value === null)) return a.value === null ? 1 : -1;
    return a.key.localeCompare(b.key, "en", { numeric: true });
  });
  // 卡片与表格/柱图使用同一组全量实体值，避免不同加法顺序导致浮点尾差。
  // 行级缺失或异常（包括无法归组的异常行）始终保留，不能被分组小计覆盖。
  if (total.state === "known") total = groups.reduce(addValues, analyticsValue(0));
  return { groups, total, state: total.state };
}
export function normalizeWorkLogDailyTrend(source: unknown) {
  if (!Array.isArray(source))
    return {
      rows: [] as { date: string; value: number | null }[],
      state: source == null ? "missing" : "invalid",
    };
  let invalid = false;
  const rows = source
    .flatMap((row) => {
      if (!row || dateDay(row.date) === null) {
        invalid = true;
        return [];
      }
      const hours = analyticsValue(row.hours);
      if (hours.state === "invalid") invalid = true;
      return [{ date: row.date as string, value: hours.value }];
    })
    .sort((a, b) => dateDay(a.date)! - dateDay(b.date)!);
  return { rows, state: invalid ? "invalid" : "known" };
}
