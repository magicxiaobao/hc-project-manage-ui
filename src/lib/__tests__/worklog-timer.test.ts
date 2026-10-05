import { it, expect } from "vitest";
import { referenceElapsed, workLogActions } from "../worklog-timer";
it("进行中可暂停/完成，暂停仍可完成，终态与未知无猜测动作", () => {
  expect(workLogActions({ status: "进行中" })).toMatchObject({ pause: true, complete: true });
  expect(workLogActions({ status: "暂停" })).toMatchObject({ pause: false, complete: true });
  for (const status of ["已取消", "未知", null])
    expect(workLogActions({ status })).toEqual({ pause: false, complete: false, edit: false });
});
it("仅合法运行记录参考 tick，非负，暂停与终态不冻结假时间", () => {
  const record = { status: "进行中", startTime: "2026-10-05T10:00:00", endTime: null };
  const now = new Date("2026-10-05T10:01:02").getTime();
  expect(referenceElapsed(record, now)).toBe(62);
  expect(referenceElapsed(record, 0)).toBe(0);
  for (const startTime of [null, "bad", "2026-02-30T00:00:00"])
    expect(referenceElapsed({ ...record, startTime }, now)).toBeNull();
  for (const status of ["暂停", "已完成", "已取消"])
    expect(referenceElapsed({ ...record, status }, now)).toBeNull();
});
