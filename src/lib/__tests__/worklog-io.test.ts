import { it, expect } from "vitest";
import {
  exportUnavailable,
  normalizeWorkLogList,
  parseWorkLogImport,
  validWorkLogScope,
  workLogExportSnapshot,
} from "../worklog-io";
const row = {
  projectId: 7,
  taskId: 8,
  workDescription: "工作",
  hoursSpent: 1,
  workType: "开发",
  workDate: "2020-01-01T00:00:00",
};
it("候选唯一根形状与条数限制", () => {
  for (const text of [
    "",
    "{",
    "[]",
    "{}",
    '{"items": []}',
    JSON.stringify({ items: Array(101).fill(row) }),
  ])
    expect(parseWorkLogImport(text, 7).errors).toHaveLength(1);
  expect(parseWorkLogImport(JSON.stringify({ items: [row] }), 7).rows[0].errors).toEqual([]);
});
it("逐行所有字段错误，禁带身份/工作流及跨项目", () => {
  const p = parseWorkLogImport(
    JSON.stringify({
      items: [
        null,
        { projectId: 8, taskId: 0, userId: 9, hoursSpent: 0 },
        { ...row, approvalStatus: "已审批" },
      ],
    }),
    7,
  );
  expect(p.rows[0].errors[0].field).toBe("row");
  expect(p.rows[1].errors.length).toBeGreaterThan(5);
  expect(p.rows[2].errors[0].field).toBe("approvalStatus");
});
it("归一化只保留有效筛选字段，业务不发空 bean", () => {
  expect(validWorkLogScope(normalizeWorkLogList({}))).toBe(false);
  expect(validWorkLogScope(normalizeWorkLogList({ projectId: 7, taskId: 0 }))).toBe(false);
  expect(normalizeWorkLogList({ projectId: 7, taskId: 8 }).request).toEqual({
    page: 1,
    pageSize: 10,
    bean: { projectId: 7, taskId: 8 },
  });
});
it("导出捕获 applied 快照，维度 ID 映射且只改变 page", () => {
  const applied = { projectId: 7, userId: 9, page: 4, pageSize: 20 };
  const exported = workLogExportSnapshot(applied);
  applied.userId = 10;
  expect(exported).toEqual({ page: 1, pageSize: 20, bean: { projectId: 7, userId: 9 } });
  for (const scope of ["user", "task", "sprint", "project"] as const)
    expect(
      workLogExportSnapshot({ projectId: 7, scope, scopeId: scope === "project" ? 7 : 9 }).bean,
    ).toHaveProperty(`${scope}Id`, scope === "project" ? 7 : 9);
  for (const response of [null, undefined, { url: "/fake" }])
    expect(exportUnavailable(response)).toBe("导出暂不可用");
});
