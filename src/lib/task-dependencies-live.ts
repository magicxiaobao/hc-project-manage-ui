import type { TaskDependencyResponse } from "./api/task-dependency-types";
import type { TaskResponse } from "./api/task-types";

export const DEPENDENCY_TYPES = [
  { id: "finish-to-start", label: "完成-开始（FS）", hint: "前置完成后，后置才能开始" },
  { id: "start-to-start", label: "开始-开始（SS）", hint: "前置开始后，后置才能开始" },
  { id: "finish-to-finish", label: "完成-完成（FF）", hint: "前置完成后，后置才能完成" },
  { id: "start-to-finish", label: "开始-完成（SF）", hint: "前置开始后，后置才能完成" },
] as const;
export function isPositiveSafeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function dependencyTypeLabel(value: string | null | undefined) {
  return DEPENDENCY_TYPES.find((type) => type.id === value)?.label ?? (value || "—");
}
export function dependencyStatusLabel(value: string | null | undefined) {
  return value === "ACTIVE" ? "有效" : value === "INACTIVE" ? "已作废" : value || "—";
}
export function dependencyLagLabel(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : "—";
}
export function dependencyTaskLabel(id: number, tasks: readonly TaskResponse[]) {
  const task = tasks.find((item) => item.id === id);
  return task ? `#${id} ${task.title}` : `任务 #${id}（名称不可用）`;
}
export function filterDependencies(
  rows: readonly TaskDependencyResponse[],
  type = "",
  status = "",
) {
  return rows
    .filter((row) => (!type || row.dependencyType === type) && (!status || row.status === status))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.id - a.row.id || a.index - b.index)
    .map(({ row }) => row);
}
export function paginateDependencies(
  rows: readonly TaskDependencyResponse[],
  page: number,
  pageSize = 20,
) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  return {
    rows: rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    page: clampedPage,
    totalPages,
    total: rows.length,
  };
}
function objectMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("响应契约错误：应返回对象");
  return value as Record<string, unknown>;
}
export function normalizeDependencyStatistics(value: unknown) {
  const source = objectMap(value);
  const count = (key: string): number | null => {
    const item = source[key];
    return typeof item === "number" && Number.isSafeInteger(item) && item >= 0 ? item : null;
  };
  return {
    totalDependencies: count("totalDependencies"),
    conflicts: count("conflicts"),
    circularDependencies: count("circularDependencies"),
  };
}
export function normalizeDependencyConflicts(value: unknown) {
  if (!Array.isArray(value)) throw new Error("响应契约错误：冲突应返回数组");
  return value.map((item) => {
    const row = objectMap(item);
    if (
      typeof row.type !== "string" ||
      typeof row.title !== "string" ||
      typeof row.description !== "string" ||
      !isPositiveSafeId(row.dependencyId)
    ) {
      throw new Error("响应契约错误：冲突字段无法识别");
    }
    return {
      type: row.type,
      title: row.title,
      description: row.description,
      dependencyId: row.dependencyId,
    };
  });
}
