/**
 * 冲刺详情纯逻辑回归测试（P3：p3-sprint-detail）。
 *
 * 覆盖：燃尽原始数据的防御归一（后端空 Map/缺失字段/长度不一/非有限数；
 * 实读 SprintServiceImpl.getBurndownChartData:435-473 口径）；
 * SVG 几何映射（折线/理想线/工时柱/双轴刻度/横轴抽稀）的坐标精确断言；
 * 日期标签格式化；燃尽汇总（总故事点/已完成/总工时）。
 */
import { describe, expect, it } from "vitest";
import {
  buildBurndownGeometry,
  formatBurndownDayLabel,
  normalizeBurndownData,
  summarizeBurndown,
} from "../sprint-detail";

describe("normalizeBurndownData", () => {
  it("空 Map（冲刺不存在时后端返回）归一为空数组", () => {
    expect(normalizeBurndownData({})).toEqual({ dates: [], values: [], dailyHours: [] });
  });

  it("null/非对象输入归一为空数组", () => {
    expect(normalizeBurndownData(null)).toEqual({ dates: [], values: [], dailyHours: [] });
    expect(normalizeBurndownData(undefined)).toEqual({ dates: [], values: [], dailyHours: [] });
    expect(normalizeBurndownData("oops")).toEqual({ dates: [], values: [], dailyHours: [] });
  });

  it("三数组长度不一时截齐最短，防止错位", () => {
    const normalized = normalizeBurndownData({
      dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
      values: [10, 6],
      dailyHours: [4, 2, 8, 1],
    });
    expect(normalized).toEqual({
      dates: ["2026-10-01", "2026-10-02"],
      values: [10, 6],
      dailyHours: [4, 2],
    });
  });

  it("非有限数（NaN/Infinity）归 0；dates 非字符串丢弃", () => {
    const normalized = normalizeBurndownData({
      dates: ["2026-10-01", 12345, "2026-10-03"],
      values: [10, NaN, Infinity],
      dailyHours: [4, -Infinity, 8],
    });
    expect(normalized.dates).toEqual(["2026-10-01", "2026-10-03"]);
    // dates 丢弃一项后截齐为 2
    expect(normalized).toEqual({
      dates: ["2026-10-01", "2026-10-03"],
      values: [10, 0],
      dailyHours: [4, 0],
    });
  });

  it("正常数据原样通过", () => {
    const normalized = normalizeBurndownData({
      dates: ["2026-10-01", "2026-10-02"],
      values: [10, 6],
      dailyHours: [4.5, 2],
    });
    expect(normalized).toEqual({
      dates: ["2026-10-01", "2026-10-02"],
      values: [10, 6],
      dailyHours: [4.5, 2],
    });
  });
});

describe("formatBurndownDayLabel", () => {
  it("'YYYY-MM-DD' → 'MM-DD'", () => {
    expect(formatBurndownDayLabel("2026-10-01")).toBe("10-01");
  });
  it("不匹配格式原样返回", () => {
    expect(formatBurndownDayLabel("昨天")).toBe("昨天");
  });
});

describe("buildBurndownGeometry", () => {
  it("空数据返回 null（调用方渲染 EmptyHint）", () => {
    expect(
      buildBurndownGeometry({ dates: [], values: [], dailyHours: [] }),
    ).toBeNull();
  });

  it("三天数据的坐标映射精确", () => {
    const geometry = buildBurndownGeometry(
      {
        dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
        values: [10, 6, 0],
        dailyHours: [4, 2, 8],
      },
      { width: 600, height: 300, padding: { top: 20, right: 40, bottom: 30, left: 40 } },
    );
    expect(geometry).not.toBeNull();
    // innerW=520，innerH=250：x=40/300/560
    // 折线 y：10→20，6→120，0→270
    expect(geometry?.linePoints).toBe("40,20 300,120 560,270");
    // 理想线：首日剩余(10)→0
    expect(geometry?.idealPoints).toBe("40,20 560,270");
    // 数据点：首日 (40,20) 值 10
    expect(geometry?.dots).toHaveLength(3);
    expect(geometry?.dots[0]).toMatchObject({ x: 40, y: 20, value: 10, date: "2026-10-01" });
    // 工时柱：maxHours=8；y(4)=145 高125，y(2)=207.5 高62.5，y(8)=20 高250
    expect(geometry?.bars).toHaveLength(3);
    expect(geometry?.bars[0]).toMatchObject({ y: 145, height: 125, hours: 4 });
    expect(geometry?.bars[1]).toMatchObject({ y: 207.5, height: 62.5, hours: 2 });
    expect(geometry?.bars[2]).toMatchObject({ y: 20, height: 250, hours: 8 });
    // 左轴刻度 0..10（2.5/7.5 保留 1 位小数），右轴刻度 0..8
    expect(geometry?.leftTicks.map((tick) => tick.label)).toEqual(["0", "2.5", "5", "7.5", "10"]);
    expect(geometry?.rightTicks.map((tick) => tick.label)).toEqual(["0", "2", "4", "6", "8"]);
    // 横轴全量标签
    expect(geometry?.xLabels.map((label) => label.label)).toEqual(["10-01", "10-02", "10-03"]);
    expect(geometry?.maxRemaining).toBe(10);
    expect(geometry?.maxHours).toBe(8);
  });

  it("全零数据不除零：折线贴底线，柱高为 0", () => {
    const geometry = buildBurndownGeometry({
      dates: ["2026-10-01", "2026-10-02"],
      values: [0, 0],
      dailyHours: [0, 0],
    });
    expect(geometry).not.toBeNull();
    // 默认宽 640：padding left44 right48 → innerW=548；末点 x=44+548=592
    expect(geometry?.linePoints).toBe("44,292 592,292");
    expect(geometry?.bars.every((bar) => bar.height === 0)).toBe(true);
  });

  it("单点数据不产生 NaN", () => {
    const geometry = buildBurndownGeometry({
      dates: ["2026-10-01"],
      values: [5],
      dailyHours: [3],
    });
    expect(geometry).not.toBeNull();
    expect(geometry?.linePoints).not.toContain("NaN");
    expect(geometry?.bars).toHaveLength(1);
    expect(geometry?.xLabels).toHaveLength(1);
  });

  it("超过 8 天时横轴抽稀且首尾可见", () => {
    const dates = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const geometry = buildBurndownGeometry({
      dates,
      values: dates.map((_, i) => 14 - i),
      dailyHours: dates.map(() => 2),
    });
    expect(geometry).not.toBeNull();
    const labels = geometry?.xLabels.map((label) => label.label) ?? [];
    expect(labels[0]).toBe("10-01");
    expect(labels[labels.length - 1]).toBe("10-14");
    expect(labels.length).toBeLessThan(dates.length);
  });
});

describe("summarizeBurndown", () => {
  it("总故事点=首日剩余；已完成=首日-末日；总工时求和", () => {
    expect(
      summarizeBurndown({
        dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
        values: [10, 6, 4],
        dailyHours: [4.5, 2, 1.5],
      }),
    ).toEqual({ totalPoints: 10, completedPoints: 6, totalHours: 8 });
  });

  it("空数据汇总为 0", () => {
    expect(summarizeBurndown({ dates: [], values: [], dailyHours: [] })).toEqual({
      totalPoints: 0,
      completedPoints: 0,
      totalHours: 0,
    });
  });
});
