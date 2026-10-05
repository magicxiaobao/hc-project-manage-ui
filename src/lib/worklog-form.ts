import type {
  WorkLogCreatePayload,
  WorkLogResponse,
  WorkLogUpdatePayload,
} from "./api/worklog-types";
export type WorkLogDraft = Record<string, string | boolean | null>;
export interface WorkLogError {
  field: string;
  message: string;
}
export const workTypes = ["开发", "测试", "设计", "会议", "学习", "其他"];
export const workLocations = ["办公室", "远程", "客户现场"];
export const validWorkLogId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export function parseWorkLogId(value: unknown): number | null {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value.trim())) return null;
  const id = Number(value);
  return validWorkLogId(id) ? id : null;
}
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function localDateTime(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) return;
  const full =
    value.length === 10 ? `${value}T00:00:00` : value.length === 16 ? `${value}:00` : value;
  const [date, time] = full.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min, s] = time.split(":").map(Number);
  const check = new Date(y, m - 1, d, h, min, s);
  if (
    check.getFullYear() !== y ||
    check.getMonth() !== m - 1 ||
    check.getDate() !== d ||
    h > 23 ||
    min > 59 ||
    s > 59
  )
    return;
  return full;
}
export const editableFields = [
  "workDescription",
  "workType",
  "workDate",
  "startTime",
  "endTime",
  "hoursSpent",
  "remainingHours",
  "progressPercentage",
  "isBillable",
  "billingRate",
  "workLocation",
  "tags",
  "isOvertime",
] as const;
const numericFields = new Set([
  "hoursSpent",
  "remainingHours",
  "progressPercentage",
  "billingRate",
]);
const timeFields = new Set(["startTime", "endTime"]);
export function newWorkLogDraft(now = new Date()): WorkLogDraft {
  return {
    taskId: "",
    workDescription: "",
    hoursSpent: "",
    workDate: localToday(now),
    workType: "开发",
    workLocation: "办公室",
    progressPercentage: "0",
    isBillable: true,
    isOvertime: false,
    startTime: "",
    endTime: "",
    remainingHours: "",
    billingRate: "",
    tags: "",
  };
}
export function workLogSnapshot(record: WorkLogResponse): WorkLogDraft {
  const draft: WorkLogDraft = { taskId: record.taskId == null ? "" : String(record.taskId) };
  for (const field of editableFields)
    draft[field] =
      typeof record[field] === "boolean"
        ? record[field]
        : record[field] == null
          ? ""
          : String(record[field]);
  draft.workDate = record.workDate?.slice(0, 10) ?? "";
  return draft;
}
export function workLogDirty(draft: WorkLogDraft, snapshot: WorkLogDraft) {
  return Object.keys({ ...draft, ...snapshot }).some((key) => draft[key] !== snapshot[key]);
}
export function validateWorkLog(
  draft: WorkLogDraft,
  context: { projectId: number; taskProjectId?: number | null; today?: string; timer?: boolean },
): WorkLogError[] {
  const errors: WorkLogError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  if (!validWorkLogId(context.projectId)) add("projectId", "请选择有效项目");
  if (!parseWorkLogId(draft.taskId)) add("taskId", "请选择有效任务");
  else if (context.taskProjectId !== context.projectId)
    add("taskId", "任务归属未确认或不属于当前项目");
  const description = String(draft.workDescription ?? "").trim();
  if (!description) add("workDescription", "工作描述不能为空");
  else if (description.length > 500) add("workDescription", "工作描述最多 500 字");
  if (!String(draft.workType ?? "").trim()) add("workType", "工作类型不能为空");
  if (context.timer) return errors;
  const hours = String(draft.hoursSpent ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(hours) || !Number.isFinite(Number(hours)) || Number(hours) < 0.01)
    add("hoursSpent", "工时须为至少 0.01 的正数，最多两位小数");
  const date = String(draft.workDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !localDateTime(date))
    add("workDate", "请输入合法工作日期");
  else if (date > (context.today ?? localToday())) add("workDate", "工作日期不能晚于今天");
  for (const field of ["remainingHours", "billingRate", "progressPercentage"]) {
    const value = String(draft[field] ?? "").trim();
    if (!value) continue;
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      number < 0 ||
      (field === "progressPercentage" && (!Number.isInteger(number) || number > 100))
    )
      add(field, field === "progressPercentage" ? "进度须为 0 至 100 的整数" : "请输入有限非负数");
  }
  const start = String(draft.startTime ?? "");
  const end = String(draft.endTime ?? "");
  for (const [field, value] of [
    ["startTime", start],
    ["endTime", end],
  ])
    if (value && !localDateTime(value)) add(field, "请输入合法日期时间");
  if (
    start &&
    end &&
    localDateTime(start) &&
    localDateTime(end) &&
    localDateTime(end)! <= localDateTime(start)!
  ) {
    add("startTime", "结束时间必须晚于开始时间");
    add("endTime", "结束时间必须晚于开始时间");
  }
  return errors;
}
function businessPayload(
  draft: WorkLogDraft,
  snapshot?: WorkLogDraft,
  record?: WorkLogResponse,
): WorkLogCreatePayload {
  const payload: WorkLogCreatePayload = {};
  for (const field of editableFields) {
    if (snapshot && draft[field] === snapshot[field]) continue;
    const value = draft[field];
    if (value == null) continue;
    if (numericFields.has(field)) {
      if (String(value).trim()) Object.assign(payload, { [field]: Number(value) });
    } else if (timeFields.has(field)) {
      if (value) Object.assign(payload, { [field]: localDateTime(String(value)) });
    } else if (field === "workDate")
      payload.workDate =
        record && record.workDate?.slice(0, 10) === value
          ? record.workDate
          : localDateTime(String(value));
    else
      Object.assign(payload, {
        [field]: field === "workDescription" ? String(value).trim() : value,
      });
  }
  return payload;
}
export function createWorkLogPayload(draft: WorkLogDraft, projectId: number): WorkLogCreatePayload {
  return { taskId: parseWorkLogId(draft.taskId)!, projectId, ...businessPayload(draft) };
}
export function updateWorkLogPayload(
  draft: WorkLogDraft,
  snapshot: WorkLogDraft,
  record: WorkLogResponse,
): WorkLogUpdatePayload {
  return { id: record.id, ...businessPayload(draft, snapshot, record) };
}
