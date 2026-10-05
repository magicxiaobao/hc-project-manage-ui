import { describe, expect, it } from "vitest";
import { ApiBusinessError, HttpResponseError } from "../api/client";
import {
  alignComparison,
  categoryData,
  countText,
  dateDay,
  dayDate,
  epochSecondsText,
  isDashboardPermissionDenied,
  normalizeCompareIds,
  parseProjectId,
  percentValue,
  projectName,
  taskPlan,
} from "../project-dashboard-data";
import type { ProjectDashboardVO } from "../api/project-stats-types";
const row = (id: number) => ({ projectId: id }) as ProjectDashboardVO;
describe("项目统计数据归一", () => {
  it("0 保留，null/负数/非有限数不伪装为 0", () => {
    expect(countText(0)).toBe("0");
    for (const value of [null, undefined, -1, NaN, Infinity])
      expect(countText(value)).toContain("未知或异常");
    expect(percentValue(0)).toEqual({ text: "0%", width: 0 });
    expect(percentValue(null).width).toBeNull();
    expect(percentValue(-2)).toEqual({ text: "-2%（异常值）", width: 0 });
    expect(percentValue(105)).toEqual({ text: "105%（异常值）", width: 100 });
  });
  it.each(["0", "-1", "1.5", "1e2", " 2 ", "NaN", "9007199254740992", ""])("非法 ID %s", (value) =>
    expect(parseProjectId(value)).toBeNull(),
  );
  it("正安全整数、同集合排序、去重和 50/51 边界", () => {
    expect(parseProjectId("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(normalizeCompareIds([3, 1, 3]).ids).toEqual([1, 3]);
    expect(normalizeCompareIds([]).enabled).toBe(false);
    expect(normalizeCompareIds([NaN]).error).toContain("无效");
    expect(normalizeCompareIds(Array.from({ length: 50 }, (_, i) => i + 1)).enabled).toBe(true);
    expect(normalizeCompareIds(Array.from({ length: 51 }, (_, i) => i + 1)).error).toContain("50");
    expect(projectName(null, 1)).toBe("项目 #1");
    expect(projectName("  ", 2)).toBe("项目 #2");
    expect(projectName(" 名称 ", 2)).toBe("名称");
  });
  it("compare 按 ID 对齐，空成功清旧；重复、缺项、非请求集合均拒绝", () => {
    expect(alignComparison([2, 1], [row(1), row(2)]).rows.map((item) => item.projectId)).toEqual([
      2, 1,
    ]);
    expect(alignComparison([1], []).rows).toEqual([]);
    expect(alignComparison([1], null).rows).toEqual([]);
    for (const result of [[row(1), row(1)], [row(2)], [row(1), row(3)]])
      expect(alignComparison([1, 2], result).error).toBeTruthy();
  });
  it("日历验证和 UTC 秒时间，与浏览器日期解析宽松规则隔离", () => {
    expect(dayDate(dateDay("2024-02-29")!)).toBe("2024-02-29");
    for (const date of [
      "2025-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-01",
      "2026-1-01",
      "0000-01-01",
      null,
    ])
      expect(dateDay(date)).toBeNull();
    expect(dateDay("2026-01-01")! - dateDay("2025-12-31")!).toBe(1);
    expect(epochSecondsText(0)).toContain("1970-01-01");
    expect(epochSecondsText(1791158400)).toContain("2026-10-05");
    expect(epochSecondsText(Infinity)).toBe("未提供");
  });
  it("缺日期、倒置和非法日期保留原因，不编造计划", () => {
    const task = {
      id: 1,
      name: null,
      start: "2026-10-05",
      end: "2026-10-05",
      type: "任务",
      status: null,
    };
    expect(taskPlan(task).reason).toBeNull();
    expect(taskPlan({ ...task, start: null }).reason).toContain("未排期");
    expect(taskPlan({ ...task, end: "2026-10-04" }).reason).toContain("早于");
    expect(taskPlan({ ...task, end: "2026-02-30" }).reason).toBe("日期无效");
  });
  it("真实分类标签保留，缺失标签和非法计数明确处理", () => {
    expect(categoryData({ 主要: 3, "": 0, 严重: -1 })).toEqual({
      categories: [
        { label: "主要", value: 3 },
        { label: "未知分类", value: 0 },
      ],
      invalid: true,
    });
  });
  it("仅真实 HTTP 403 或已确认 10105 判定权限，基础设施失败不误分类", () => {
    expect(isDashboardPermissionDenied(new HttpResponseError("拒绝", 403))).toBe(true);
    expect(
      isDashboardPermissionDenied(
        new ApiBusinessError({ code: 10105, msg: "权限不足", result: null }),
      ),
    ).toBe(true);
    expect(
      isDashboardPermissionDenied(
        new ApiBusinessError({ code: 0, msg: "权限检查失败", result: null }, 500),
      ),
    ).toBe(false);
  });
});
