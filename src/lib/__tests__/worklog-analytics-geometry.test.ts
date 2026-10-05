import { expect, it } from "vitest";
import { buildWorkLogDailyTrend, buildWorkLogHourBars } from "../worklog-analytics-geometry";
import { analyticsValue, type WorkLogHourGroup } from "../worklog-analytics-data";
const groups = (values: unknown[]): WorkLogHourGroup[] =>
  values.map((value, i) => ({
    key: String(i),
    label: "很长的实体名称".repeat(8),
    ...analyticsValue(value),
  }));
it.each(
  [[], [0], [0, 0], [2], [2, 4, null], [Number.MAX_VALUE, null, Infinity]].map((values) => ({
    values,
  })),
)("柱形共享小时轴且所有坐标有限 %j", ({ values }) => {
  for (const [width, height] of [
    [400, 36],
    [0, -1],
    [NaN, Infinity],
    [1, Number.MAX_VALUE],
  ]) {
    const result = buildWorkLogHourBars(groups(values), width, height);
    for (const bar of result.bars)
      for (const v of [bar.x, bar.y, bar.height, bar.width])
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
    expect(Number.isFinite(result.height)).toBe(true);
  }
});
it("小时比例、真实零与未知、原样保留长标签", () => {
  const result = buildWorkLogHourBars(groups([2, 4, 0, null]), 400);
  expect(result.bars.map((b) => b.width)).toEqual([200, 400, 0, null]);
  expect(result.ticks).toEqual([0, 4]);
  expect(result.bars[0].label.length).toBeGreaterThan(16);
});
it("日趋势只使用实际 date/hours，排序、缺失断线、不使用效率或任务数", () => {
  const result = buildWorkLogDailyTrend([
    { date: "2026-10-03", hours: 3, efficiency: 999 },
    { date: "2026-10-01", hours: 1, recordCount: 888 },
    { date: "2026-10-02", hours: null },
    { date: "bad", hours: 2 },
  ]);
  expect(result.points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-03"]);
  expect(result.path.match(/M/g)).toHaveLength(2);
  expect(result.path).not.toContain("L");
  expect(result.rows).toHaveLength(3);
  expect(result.ticks).toEqual([0, 3]);
  expect(result.state).toBe("invalid");
});
it.each(
  [null, [], [{ date: "2026-10-01", hours: null }], [{ date: "2026-10-01", hours: -1 }]].map(
    (source) => ({ source }),
  ),
)("空/全未知不生成虚构点 %j", ({ source }) => {
  const result = buildWorkLogDailyTrend(source, NaN, -1);
  expect(result.points).toEqual([]);
  expect(result.path).toBe("");
});
