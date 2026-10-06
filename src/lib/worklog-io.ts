import type { PageRequest } from "./api/types";
import type { WorkLogQueryRequest } from "./api/worklog-types";
import {
  editableFields,
  localDateTime,
  parseWorkLogId,
  validWorkLogId,
  validateWorkLog,
  type WorkLogDraft,
  type WorkLogError,
} from "./worklog-form";
export type WorkLogScope = "all" | "user" | "task" | "project" | "sprint";
export interface WorkLogListParams {
  projectId?: number | null;
  taskId?: number | null;
  userId?: number | null;
  sprintId?: number | null;
  page?: number;
  pageSize?: number;
  scope?: WorkLogScope;
  scopeId?: number | null;
}
export function normalizeWorkLogList(params: WorkLogListParams) {
  const scope = params.scope ?? "all";
  const scopeId = scope === "all" ? null : (params.scopeId ?? null);
  const bean: WorkLogQueryRequest = { projectId: params.projectId ?? 0 };
  if (scope === "all")
    for (const field of ["taskId", "userId", "sprintId"] as const) {
      if (params[field] != null) bean[field] = params[field];
    }
  const request: PageRequest<WorkLogQueryRequest> = {
    page: validWorkLogId(params.page) ? params.page : 1,
    pageSize: validWorkLogId(params.pageSize) ? params.pageSize : 10,
    bean,
  };
  return { scope, scopeId, request };
}
export function validWorkLogScope(params: ReturnType<typeof normalizeWorkLogList>) {
  return (
    validWorkLogId(params.request.bean.projectId) &&
    Object.values(params.request.bean).every(validWorkLogId) &&
    (params.scope === "all" ||
      (validWorkLogId(params.scopeId) &&
        (params.scope !== "project" || params.scopeId === params.request.bean.projectId)))
  );
}
export function workLogExportSnapshot(params: WorkLogListParams): PageRequest<WorkLogQueryRequest> {
  const normalized = normalizeWorkLogList(params);
  if (!validWorkLogScope(normalized)) throw new Error("请选择有效项目与范围");
  const bean = { ...normalized.request.bean };
  if (normalized.scope !== "all")
    Object.assign(bean, { [`${normalized.scope}Id`]: normalized.scopeId });
  return { ...normalized.request, page: 1, bean };
}
export function exportUnavailable(_response: unknown): string {
  return "导出暂不可用";
}
export interface ImportPreview {
  errors: WorkLogError[];
  rows: { draft: WorkLogDraft; errors: WorkLogError[] }[];
}
export function parseWorkLogImport(text: string, projectId: number): ImportPreview {
  const bad = (message: string): ImportPreview => ({
    errors: [{ field: "json", message }],
    rows: [],
  });
  if (!text.trim()) return bad("导入内容不能为空");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return bad("JSON 语法错误");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "items") ||
    !("items" in value) ||
    !Array.isArray(value.items)
  )
    return bad('候选格式须为 {"items": [...]}');
  if (!value.items.length || value.items.length > 100) return bad("前端预览限制为 1 至 100 条");
  return {
    errors: [],
    rows: value.items.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row))
        return { draft: {}, errors: [{ field: "row", message: "每条须为对象" }] };
      const draft: WorkLogDraft = {};
      const errors: WorkLogError[] = [];
      for (const [field, input] of Object.entries(row)) {
        if (!["taskId", "projectId", ...editableFields].includes(field))
          errors.push({ field, message: "禁止携带非创建白名单字段" });
        if (typeof input !== "string" && typeof input !== "number" && typeof input !== "boolean")
          errors.push({ field, message: "字段类型不合法" });
        if (["isBillable", "isOvertime"].includes(field) && typeof input !== "boolean")
          errors.push({ field, message: "须为布尔值" });
        if (
          [
            "taskId",
            "projectId",
            "hoursSpent",
            "remainingHours",
            "progressPercentage",
            "billingRate",
          ].includes(field) &&
          typeof input !== "number"
        )
          errors.push({ field, message: "须为数字" });
        if (
          [...editableFields]
            .filter(
              (f) =>
                ![
                  "hoursSpent",
                  "remainingHours",
                  "progressPercentage",
                  "billingRate",
                  "isBillable",
                  "isOvertime",
                ].includes(f),
            )
            .includes(field as (typeof editableFields)[number]) &&
          typeof input !== "string"
        )
          errors.push({ field, message: "须为字符串" });
        draft[field] = typeof input === "boolean" ? input : String(input ?? "");
      }
      if (parseWorkLogId(row.projectId) !== projectId)
        errors.push({ field: "projectId", message: "行项目须为当前项目" });
      const originalDate = String(draft.workDate ?? "");
      draft.workDate = originalDate.slice(0, 10);
      if (!localDateTime(originalDate))
        errors.push({ field: "workDate", message: "请输入合法工作日期时间" });
      errors.push(...validateWorkLog(draft, { projectId, taskProjectId: projectId }));
      return { draft, errors };
    }),
  };
}
