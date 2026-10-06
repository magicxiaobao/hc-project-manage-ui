import { describe, it, expect } from "vitest";
import {
  createWorkLogPayload,
  localDateTime,
  newWorkLogDraft,
  parseWorkLogId,
  updateWorkLogPayload,
  validateWorkLog,
  workLogDirty,
  workLogSnapshot,
  type WorkLogDraft,
} from "../worklog-form";
import type { WorkLogResponse } from "../api/worklog-types";
const context = { projectId: 7, taskProjectId: 7, today: "2026-10-05" };
const good = (): WorkLogDraft => ({
  ...newWorkLogDraft(new Date(2026, 9, 5)),
  taskId: "9",
  workDescription: "工作",
  hoursSpent: "0.01",
});
describe("工时表单边界", () => {
  it("ID 只接受字符串或数字，true 不得转换为项目 1", () => {
    for (const value of [true, false, null, undefined, [1], { valueOf: () => 1 }])
      expect(parseWorkLogId(value)).toBeNull();
    expect(parseWorkLogId("1")).toBe(1);
    expect(parseWorkLogId(1)).toBe(1);
  });
  it("null 布尔快照重选未设置保持 clean，更新省略空值", () => {
    const record = { id: 12, isBillable: null, isOvertime: null } as WorkLogResponse;
    const snapshot = workLogSnapshot(record);
    const draft = { ...snapshot, isBillable: null, isOvertime: null };
    expect(workLogDirty(draft, snapshot)).toBe(false);
    expect(updateWorkLogPayload(draft, snapshot, record)).toEqual({ id: 12 });
    expect(
      updateWorkLogPayload({ ...draft, isBillable: true, isOvertime: false }, snapshot, record),
    ).toEqual({ id: 12, isBillable: true, isOvertime: false });
  });
  it("一次收集全部必填错误，改回快照 clean", () => {
    const d = good();
    expect(validateWorkLog({}, context).map((e) => e.field)).toEqual([
      "taskId",
      "workDescription",
      "workType",
      "hoursSpent",
      "workDate",
    ]);
    expect(workLogDirty({ ...d, tags: "x" }, d)).toBe(true);
    expect(workLogDirty(d, { ...d })).toBe(false);
  });
  it.each(["0", "-1", "NaN", "Infinity", "0.001", "1.234"])("拒绝工时 %s", (hoursSpent) =>
    expect(
      validateWorkLog({ ...good(), hoursSpent }, context).some((e) => e.field === "hoursSpent"),
    ).toBe(true),
  );
  it.each(["0", "-1", "1.5", "9007199254740992"])("拒绝任务 %s", (taskId) =>
    expect(validateWorkLog({ ...good(), taskId }, context).some((e) => e.field === "taskId")).toBe(
      true,
    ),
  );
  it("拒绝跨项目、未来/非法日期、描述边界和可选错误", () => {
    expect(validateWorkLog(good(), { ...context, taskProjectId: 8 })[0].field).toBe("taskId");
    const errors = validateWorkLog(
      {
        ...good(),
        workDescription: "x".repeat(501),
        workDate: "2026-10-06",
        remainingHours: "-1",
        billingRate: "Infinity",
        progressPercentage: "100.1",
        startTime: "2026-10-05T10:00",
        endTime: "2026-10-05T09:00",
      },
      context,
    );
    expect(errors).toHaveLength(7);
    expect(localDateTime("2026-02-30")).toBeUndefined();
    expect(validateWorkLog({ ...good(), workDescription: " ".repeat(10) }, context)[0].field).toBe(
      "workDescription",
    );
  });
  it("日期补秒，不转换 UTC", () => {
    expect(localDateTime("2026-10-05")).toBe("2026-10-05T00:00:00");
    expect(localDateTime("2026-10-05T12:34")).toBe("2026-10-05T12:34:00");
    expect(localDateTime("2026-10-05T25:00")).toBeUndefined();
  });
  it("白名单保留 false/0/空文本，编辑稀疏且保持日期时分秒", () => {
    const payload = createWorkLogPayload(
      { ...good(), userId: "99", status: "已审批", billingRate: "", tags: "a,b" },
      7,
    );
    expect(payload).not.toHaveProperty("userId");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("billingRate");
    expect(payload).toMatchObject({
      isOvertime: false,
      progressPercentage: 0,
      tags: "a,b",
      workDate: "2026-10-05T00:00:00",
    });
    const record = { ...payload, id: 12, workDate: "2026-10-05T14:12:23" } as WorkLogResponse;
    const snapshot = workLogSnapshot(record);
    expect(
      updateWorkLogPayload(
        { ...snapshot, tags: "", remainingHours: "", isBillable: false },
        snapshot,
        record,
      ),
    ).toEqual({ id: 12, tags: "", isBillable: false });
  });
  it("计时不要求登记工时/date", () =>
    expect(
      validateWorkLog(
        { taskId: "9", workDescription: "工作", workType: "开发" },
        { ...context, timer: true },
      ),
    ).toEqual([]));
});
