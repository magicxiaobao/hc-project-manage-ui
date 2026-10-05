import { describe, expect, it } from "vitest";
import {
  dependencyLagLabel,
  dependencyStatusLabel,
  dependencyTaskLabel,
  dependencyTypeLabel,
  filterDependencies,
  normalizeDependencyConflicts,
  normalizeDependencyStatistics,
  paginateDependencies,
} from "../task-dependencies-live";
import type { TaskDependencyResponse } from "../api/task-dependency-types";
const rows: TaskDependencyResponse[] = Array.from({ length: 201 }, (_, i) => ({
  id: i + 1,
  predecessorId: 1,
  successorId: 2,
  projectId: 7,
  dependencyType: i < 200 ? "finish-to-start" : "start-to-start",
  status: i < 200 ? "ACTIVE" : "INACTIVE",
  lag: null,
  createdAt: null,
  updatedAt: null,
}));
describe("任务依赖展示", () => {
  it("四类型、未知原值、状态与未知 lag", () => {
    expect(dependencyTypeLabel("finish-to-start")).toBe("完成-开始（FS）");
    expect(dependencyTypeLabel("start-to-start")).toBe("开始-开始（SS）");
    expect(dependencyTypeLabel("finish-to-finish")).toBe("完成-完成（FF）");
    expect(dependencyTypeLabel("start-to-finish")).toBe("开始-完成（SF）");
    expect(dependencyTypeLabel("CUSTOM")).toBe("CUSTOM");
    expect(dependencyTypeLabel(null)).toBe("—");
    expect(dependencyStatusLabel("ACTIVE")).toBe("有效");
    expect(dependencyStatusLabel("INACTIVE")).toBe("已作废");
    expect(dependencyLagLabel(null)).toBe("—");
    expect(dependencyLagLabel("0")).toBe("—");
    expect(dependencyLagLabel(0)).toBe("0");
  });
  it("全量过滤覆盖第二后端页，再按 ID 降序分页", () => {
    const filtered = filterDependencies(rows, "start-to-start", "INACTIVE");
    expect(paginateDependencies(filtered, 1).total).toBe(1);
    expect(filtered[0].id).toBe(201);
    const page = paginateDependencies(filterDependencies(rows), 2);
    expect(page.total).toBe(201);
    expect(page.totalPages).toBe(11);
    expect(page.rows[0].id).toBe(181);
  });
  it("稳定排序不变更原数组；末页删空夹紧；全删回第 1 页", () => {
    const a = { ...rows[0], description: "a" },
      b = { ...rows[0], description: "b" };
    expect(filterDependencies([a, b]).map((row) => row.description)).toEqual(["a", "b"]);
    expect(rows[0].id).toBe(1);
    expect(paginateDependencies(rows.slice(0, 200), 11).page).toBe(10);
    expect(paginateDependencies([], 11)).toEqual({ rows: [], total: 0, totalPages: 1, page: 1 });
  });
  it("任务名称缺失保留编号", () =>
    expect(dependencyTaskLabel(4, [])).toBe("任务 #4（名称不可用）"));
  it("统计只接受有效后端数值，缺失不伪造 0", () => {
    expect(
      normalizeDependencyStatistics({
        totalDependencies: 5,
        conflicts: 2,
        circularDependencies: 2,
      }),
    ).toEqual({ totalDependencies: 5, conflicts: 2, circularDependencies: 2 });
    expect(
      normalizeDependencyStatistics({
        totalDependencies: 0,
        conflicts: "0",
        circularDependencies: -1,
      }),
    ).toEqual({ totalDependencies: 0, conflicts: null, circularDependencies: null });
    expect(normalizeDependencyStatistics({})).toEqual({
      totalDependencies: null,
      conflicts: null,
      circularDependencies: null,
    });
    expect(() => normalizeDependencyStatistics(null)).toThrow("契约");
  });
  it("冲突归一真实 Map 字段；非法结构不能当空结果", () => {
    const conflicts = [
      { type: "循环依赖", title: "检测到循环依赖", description: "A → B", dependencyId: 12 },
      { type: "循环依赖", title: "检测到循环依赖", description: "B → A", dependencyId: 13 },
    ];
    expect(normalizeDependencyConflicts(conflicts)).toEqual(conflicts);
    expect(normalizeDependencyConflicts([])).toEqual([]);
    for (const invalid of [
      null,
      {},
      [null],
      [{ id: 1, tasks: [] }],
      [{ ...conflicts[0], dependencyId: "12" }],
      [{ ...conflicts[0], description: {} }],
    ])
      expect(() => normalizeDependencyConflicts(invalid)).toThrow("契约");
  });
});
