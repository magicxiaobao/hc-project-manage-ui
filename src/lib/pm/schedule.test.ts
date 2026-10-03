import assert from "node:assert/strict";
import { test } from "node:test";
import { alignPlans, criticalTaskIds, findScheduleHits, pushPlan, type PlanRange, type ScheduleLink } from "./schedule.ts";

const link = (patch: Partial<ScheduleLink> & Pick<ScheduleLink, "dependencyType">): ScheduleLink => ({
  id: patch.id ?? "d",
  predecessorId: patch.predecessorId ?? "a",
  successorId: patch.successorId ?? "b",
  lagDays: patch.lagDays ?? 0,
  status: patch.status ?? "ACTIVE",
  dependencyType: patch.dependencyType,
});

test("完成-开始允许同一天，滞后一天则后置开始不能早于次日", () => {
  const pred: PlanRange = { start: "2026-09-08", end: "2026-09-19" };
  const same: PlanRange = { start: "2026-09-19", end: "2026-09-26" };
  assert.equal(pushPlan("FS", pred, { start: "2026-09-18", end: "2026-09-25" }, 0).start, "2026-09-19");
  assert.deepEqual(pushPlan("FS", pred, same, 0), same);
  assert.equal(pushPlan("FS", pred, same, 1).start, "2026-09-20");
  assert.equal(pushPlan("FS", pred, same, 1).end, "2026-09-27");
});

test("四种依赖只约束自己的端点", () => {
  const pred: PlanRange = { start: "2026-10-01", end: "2026-10-05" };
  const succ: PlanRange = { start: "2026-10-02", end: "2026-10-03" };
  assert.equal(pushPlan("SS", pred, { start: "2026-09-30", end: "2026-10-02" }, 0).start, "2026-10-01");
  assert.equal(pushPlan("FF", pred, succ, 0).end, "2026-10-05");
  assert.equal(pushPlan("FF", pred, succ, 0).start, "2026-10-02");
  assert.equal(pushPlan("SF", pred, succ, 2).end, "2026-10-03");
});

test("拖动前置会把后置链顺延，作废依赖不参与", () => {
  const plans = {
    a: { start: "2026-10-01", end: "2026-10-03" },
    b: { start: "2026-10-03", end: "2026-10-04" },
    c: { start: "2026-10-04", end: "2026-10-05" },
  };
  const links = [link({ id: "ab", dependencyType: "FS" }), link({ id: "bc", predecessorId: "b", successorId: "c", dependencyType: "FS" }), link({ id: "dead", predecessorId: "a", successorId: "c", dependencyType: "FS", status: "INACTIVE" })];
  const next = alignPlans(plans, links, "a", { start: "2026-10-02", end: "2026-10-06" });
  assert.equal(next.b.start, "2026-10-06");
  assert.equal(next.c.start, "2026-10-07");
  assert.equal(findScheduleHits(links, next).length, 0);
});

test("关键路径只沿紧挨的完成-开始链回溯", () => {
  const plans = {
    a: { start: "2026-10-01", end: "2026-10-03" },
    b: { start: "2026-10-03", end: "2026-10-08" },
    slack: { start: "2026-10-01", end: "2026-10-02" },
  };
  const links = [link({ dependencyType: "FS" }), link({ id: "slack", predecessorId: "slack", successorId: "b", dependencyType: "FS" })];
  const critical = criticalTaskIds(plans, links).sort();
  assert.deepEqual(critical, ["a", "b"]);
});
