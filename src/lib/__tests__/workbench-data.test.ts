import { expect, it } from "vitest";
import {
  adaptWorkbenchHours,
  localCalendarDate,
  workbenchDates,
  WORKBENCH_STATUSES,
  workbenchUserId,
  summarizeWorkbenchTasks,
  validateWorkbenchTasks,
} from "../workbench-data";
import type { TaskResponse } from "../api/task-types";
it("非终态含暂停；身份必须是正安全整数", () => {
  expect(WORKBENCH_STATUSES).toEqual(["TODO", "IN_PROGRESS", "PAUSED"]);
  expect(workbenchUserId("42")).toBe(42);
  for (const raw of [null, "0", "01", "-1", "9007199254740992", 42])
    expect(workbenchUserId(raw)).toBeNull();
});
it.each([
  [new Date(2026, 9, 5), "2026-10-05", "2026-10-05"],
  [new Date(2026, 9, 11, 23, 59), "2026-10-11", "2026-10-05"],
  [new Date(2026, 9, 12), "2026-10-12", "2026-10-12"],
  [new Date(2026, 0, 1), "2026-01-01", "2025-12-29"],
])("本地日期/周边界 %s", (date, today, weekStart) => {
  expect(localCalendarDate(date)).toBe(today);
  expect(workbenchDates(date)).toEqual({ today, weekStart });
});
const row = { userId: 42, statisticDate: "2026-10-06", totalHours: 2 };
const adapt = (value: unknown) => adaptWorkbenchHours(value, 42, "2026-10-05", "2026-10-06");
it("完整候选数值合计；明确 0 保留", () => {
  expect(adapt([row, { ...row, statisticDate: "2026-10-05", totalHours: 0 }]).total).toBe(2);
  expect(adapt([{ ...row, totalHours: 0 }]).total).toBe(0);
});
it.each([
  null,
  undefined,
  [],
  {},
  [0],
  [{ hours: 5 }],
  [{ ...row, totalHours: "2" }],
  [{ ...row, totalHours: -1 }],
  [{ ...row, totalHours: NaN }],
  [{ ...row, totalHours: Infinity }],
  [{ ...row, userId: 43 }],
  [{ ...row, statisticDate: "2026-10-07" }],
  [{ ...row, statisticDate: "2026-02-30" }],
  [{ ...row, statisticDate: null }],
])("未知/异常候选不伪造零 %j", (value) => {
  expect(adapt(value).total).toBeNull();
});
it("部分缺失可保留确认行，不能把小计当总量", () => {
  expect(adapt([row, { ...row, totalHours: null }])).toEqual({
    total: null,
    rows: [{ date: "2026-10-06", hours: 2 }],
  });
});
it("任一筛选不匹配拒绝，分页 total 独立于预览条数", () => {
  const task = { id: 1, projectId: 7, assigneeId: 42, status: "TODO" } as TaskResponse;
  const page = { list: [task], total: 20, pageNumber: 1, pageSize: 10 };
  expect(validateWorkbenchTasks(page, 7, 42, "TODO")).toBe(page);
  for (const change of [{ assigneeId: 43 }, { projectId: 8 }, { status: "COMPLETED" }]) {
    expect(() =>
      validateWorkbenchTasks(
        { ...page, list: [{ ...task, ...change } as TaskResponse] },
        7,
        42,
        "TODO",
      ),
    ).toThrow("筛选结果异常");
  }
  expect(
    summarizeWorkbenchTasks([{ data: page, isError: false }, { isError: true }]),
  ).toMatchObject({ total: null, subtotal: 20, shown: 1, covered: 1 });
  expect(
    summarizeWorkbenchTasks([
      { data: page, isError: false },
      { data: page, isError: true },
    ]),
  ).toMatchObject({ total: 40, stale: true, shown: 2 });
});
