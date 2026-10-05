import type { TaskDependencyCreatePayload } from "./api/task-dependency-types";
import type { TaskResponse } from "./api/task-types";
import { DEPENDENCY_TYPES, isPositiveSafeId } from "./task-dependencies-live";

export interface TaskDependencyFormInput {
  predecessorId: string;
  successorId: string;
  dependencyType: string;
  lag: string;
  description: string;
}
export type DependencyFieldErrors = Partial<Record<keyof TaskDependencyFormInput, string>>;
export const emptyTaskDependencyForm = (): TaskDependencyFormInput => ({
  predecessorId: "",
  successorId: "",
  dependencyType: "finish-to-start",
  lag: "0",
  description: "",
});
export function parseDependencyId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return isPositiveSafeId(id) ? id : null;
}
export function validateTaskDependencyForm(
  form: TaskDependencyFormInput,
  projectId: number,
  candidates: readonly Pick<TaskResponse, "id" | "projectId">[],
): DependencyFieldErrors {
  const errors: DependencyFieldErrors = {};
  for (const field of ["predecessorId", "successorId"] as const) {
    const id = parseDependencyId(form[field]);
    if (!form[field])
      errors[field] = field === "predecessorId" ? "请选择前置任务" : "请选择后置任务";
    else if (id == null) errors[field] = "任务 ID 必须为正安全整数";
    else if (
      !isPositiveSafeId(projectId) ||
      !candidates.some((task) => task.id === id && task.projectId === projectId)
    )
      errors[field] = "请选择当前项目中的任务";
  }
  const predecessorId = parseDependencyId(form.predecessorId);
  if (predecessorId != null && predecessorId === parseDependencyId(form.successorId)) {
    errors.predecessorId = "前置与后置任务不能相同";
    errors.successorId = "后置与前置任务不能相同";
  }
  if (!DEPENDENCY_TYPES.some((type) => type.id === form.dependencyType))
    errors.dependencyType = "请选择有效的依赖类型";
  if (!form.lag) errors.lag = "请输入延迟天数";
  else if (
    !/^\d+$/.test(form.lag) ||
    !Number.isSafeInteger(Number(form.lag)) ||
    Number(form.lag) > 2147483647
  )
    errors.lag = "延迟天数须为 0..2147483647 的十进制整数";
  if (form.description.trim().length > 1000) errors.description = "描述不能超过 1000 字符";
  return errors;
}
/** 仅在校验通过后组装，检查与创建共用同一冻结载荷。 */
export function buildTaskDependencyPayload(
  form: TaskDependencyFormInput,
  projectId: number,
): TaskDependencyCreatePayload {
  const description = form.description.trim();
  return {
    predecessorId: Number(form.predecessorId),
    successorId: Number(form.successorId),
    projectId,
    dependencyType: form.dependencyType,
    lag: Number(form.lag),
    ...(description ? { description } : {}),
  };
}
/** 编辑只清本字段及端点共用错误；无关编辑不得清成环提示。 */
export function clearDependencyFieldError(
  errors: DependencyFieldErrors,
  field: keyof TaskDependencyFormInput,
): DependencyFieldErrors {
  const next = { ...errors };
  delete next[field];
  if (field === "predecessorId" || field === "successorId") {
    for (const endpoint of ["predecessorId", "successorId"] as const) {
      if (next[endpoint]?.includes("不能相同") || next[endpoint]?.includes("形成循环"))
        delete next[endpoint];
    }
  }
  return next;
}
