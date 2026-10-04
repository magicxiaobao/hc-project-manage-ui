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
  applyRetroSaveSuccess,
  applyRetroServerSync,
  buildBurndownGeometry,
  formatBurndownDayLabel,
  initialRetroEditorSyncState,
  normalizeBurndownData,
  summarizeBurndown,
  type RetroEditorSyncState,
  type RetroServerSnapshot,
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

  it("非有限数（NaN/Infinity）归 0；dates 非字符串则整行丢弃（索引对齐）", () => {
    const normalized = normalizeBurndownData({
      dates: ["2026-10-01", 12345, "2026-10-03"],
      values: [10, NaN, Infinity],
      dailyHours: [4, -Infinity, 8],
    });
    // 下标 1 的日期非法→整行丢弃："2026-10-03" 仍与 values[2]/hours[2] 配对，
    // 而不是与错位后的 values[1]（旧实现会把 03 配给 NaN→0）
    expect(normalized).toEqual({
      dates: ["2026-10-01", "2026-10-03"],
      values: [10, 0],
      dailyHours: [4, 8],
    });
  });

  it("日期/数值错位回归：null 日期整行丢弃后 D3 仍配对 2/3（r16-3）", () => {
    const normalized = normalizeBurndownData({
      dates: ["2026-10-01", null, "2026-10-03"],
      values: [10, 6, 2],
      dailyHours: [1, 2, 3],
    });
    expect(normalized).toEqual({
      dates: ["2026-10-01", "2026-10-03"],
      values: [10, 2],
      dailyHours: [1, 3],
    });
  });

  it("负值钳制为 0（r16-4）：不产生越界折线与负 SVG 柱高", () => {
    const normalized = normalizeBurndownData({
      dates: ["2026-10-01", "2026-10-02"],
      values: [10, -2],
      dailyHours: [4, -1],
    });
    expect(normalized).toEqual({
      dates: ["2026-10-01", "2026-10-02"],
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
  const data = {
    dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
    values: [10, 6, 4],
    dailyHours: [4.5, 2, 1.5],
  };

  it("总量/已完成取冲刺详情统计；values[0] 只作为首日剩余（r16-5）", () => {
    // 后端 values[0]=总量−首日完成：总量 10、首日完成 4 → values[0]=6；
    // 旧实现会标成"总故事点 6"，正确应为详情统计的 10
    expect(
      summarizeBurndown(
        { ...data, values: [6, 4, 2] },
        { totalPoints: 10, completedPoints: 8 },
      ),
    ).toEqual({
      totalPoints: 10,
      completedPoints: 8,
      firstDayRemaining: 6,
      windowCompleted: 4,
      totalHours: 8,
    });
  });

  it("未传统计时总量为 null（调用方改用首日剩余/区间消耗口径）", () => {
    expect(summarizeBurndown(data)).toEqual({
      totalPoints: null,
      completedPoints: null,
      firstDayRemaining: 10,
      windowCompleted: 6,
      totalHours: 8,
    });
  });

  it("空数据汇总为 0/null", () => {
    expect(summarizeBurndown({ dates: [], values: [], dailyHours: [] })).toEqual({
      totalPoints: null,
      completedPoints: null,
      firstDayRemaining: 0,
      windowCompleted: 0,
      totalHours: 0,
    });
  });
});

describe("回顾编辑器同步状态机（r17-1 回归）", () => {
  const snap = (
    serverText: string,
    dataUpdatedAt: number,
    isSuccess = true,
  ): RetroServerSnapshot => ({ isSuccess, serverText, dataUpdatedAt });

  it("脏草稿 C → 后台返回 B（保留 C）→ 保存 C 成功 → 缓存仍为 B 时 draft 不回退为 B", () => {
    // 1. 初始载入 A：草稿/基线/同步版本对齐
    let s: RetroEditorSyncState = applyRetroServerSync(initialRetroEditorSyncState, snap("A", 100));
    expect(s).toEqual({
      draft: "A",
      savedText: "A",
      syncedServerText: "A",
      pendingSave: null,
    });
    // 2. 用户编辑为 C（脏）
    s = { ...s, draft: "C" };
    // 3. 后台重取返回 B：脏草稿保留，不静默覆盖
    s = applyRetroServerSync(s, snap("B", 200));
    expect(s.draft).toBe("C");
    expect(s.savedText).toBe("A");
    expect(s.syncedServerText).toBe("A");
    // 4. 保存 C 成功：invalidateQueries 不等待重取，查询缓存仍是 B（dataUpdatedAt=200）
    s = applyRetroSaveSuccess(s, "C", 200);
    expect(s.savedText).toBe("C");
    expect(s.syncedServerText).toBe("C");
    expect(s.pendingSave).toEqual({ text: "C", dataUpdatedAt: 200 });
    // 5. 同步 effect 再次执行（脏态消失触发）：缓存仍为旧 B → 不回退
    //    旧实现（无抑制标记）此处会把 draft/savedText 重置为 B
    s = applyRetroServerSync(s, snap("B", 200));
    expect(s.draft).toBe("C");
    expect(s.savedText).toBe("C");
    // 6. 服务端回显到达（查询推进到 C）：放行，草稿保持 C，标记清除
    s = applyRetroServerSync(s, snap("C", 300));
    expect(s.draft).toBe("C");
    expect(s.savedText).toBe("C");
    expect(s.syncedServerText).toBe("C");
    expect(s.pendingSave).toBeNull();
  });

  it("无抑制标记时：干净草稿随后台新文本重对齐（r16-2 行为保持）", () => {
    let s = applyRetroServerSync(initialRetroEditorSyncState, snap("A", 100));
    s = applyRetroServerSync(s, snap("B", 200));
    expect(s).toEqual({
      draft: "B",
      savedText: "B",
      syncedServerText: "B",
      pendingSave: null,
    });
  });

  it("脏草稿在后台返回新文本时始终保留（r16-2 行为保持）", () => {
    let s = applyRetroServerSync(initialRetroEditorSyncState, snap("A", 100));
    s = { ...s, draft: "C" };
    s = applyRetroServerSync(s, snap("B", 200));
    expect(s.draft).toBe("C");
    expect(s.savedText).toBe("A");
  });

  it("查询未成功时状态不变", () => {
    const s = applyRetroServerSync(initialRetroEditorSyncState, snap("A", 100, false));
    expect(s).toBe(initialRetroEditorSyncState);
  });

  it("保存成功后用户继续编辑（变脏），回显到达时不覆盖新草稿", () => {
    let s = applyRetroServerSync(initialRetroEditorSyncState, snap("A", 100));
    s = { ...s, draft: "C" };
    s = applyRetroSaveSuccess(s, "C", 100);
    // 保存后用户又编辑为 D（脏），此时回显到达
    s = { ...s, draft: "D" };
    s = applyRetroServerSync(s, snap("C", 200));
    expect(s.draft).toBe("D");
    expect(s.savedText).toBe("C");
    expect(s.pendingSave).toBeNull();
  });
});
