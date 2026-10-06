import { describe, expect, it } from "vitest";
import {
  buildCountBars,
  buildGanttGeometry,
  buildLineGeometry,
  buildPieGeometry,
} from "../project-dashboard-geometry";
import { percentValue } from "../project-dashboard-data";
import type { GanttTaskItem } from "../api/project-stats-types";
const task = (start: string | null, end: string | null): GanttTaskItem => ({
  id: 1,
  name: "任务",
  start,
  end,
  status: "待办",
  type: "任务",
});
const finite = (value: unknown) => expect(JSON.stringify(value)).not.toMatch(/NaN|Infinity/);
describe("轻量 SVG 几何", () => {
  it("折线空、单点、全零、乱序保持日期和值关联；缺值断线", () => {
    expect(buildLineGeometry([]).path).toBe("");
    const single = buildLineGeometry([{ date: "2026-10-05", value: 0 }]);
    expect(single.points[0]).toMatchObject({ x: 300, y: 180, value: 0 });
    const line = buildLineGeometry([
      { date: "2026-10-07", value: 4 },
      { date: "2026-10-05", value: 2 },
      { date: "2026-10-06", value: null },
      { date: "invalid", value: 10 },
    ]);
    expect(line.points.map((p) => [p.date, p.value])).toEqual([
      ["2026-10-05", 2],
      ["2026-10-07", 4],
    ]);
    expect(line.path.match(/M/g)).toHaveLength(2);
    finite(
      buildLineGeometry(
        [
          { date: "2026-10-05", value: 0 },
          { date: "2026-10-06", value: 0 },
        ],
        0,
        NaN,
      ),
    );
  });
  it("饼图空/零/单类整圆/多类比例和总角度；非法值不进入", () => {
    expect(buildPieGeometry([]).slices).toEqual([]);
    expect(buildPieGeometry([{ label: "空", value: 0 }]).slices).toEqual([]);
    expect(buildPieGeometry([{ label: "严重", value: 4 }]).slices[0].fullCircle).toBe(true);
    const pie = buildPieGeometry([
      { label: "", value: 1 },
      { label: "主要", value: 3 },
      { label: "非法", value: Infinity },
      { label: "负值", value: -2 },
    ]);
    expect(pie.total).toBe(4);
    expect(pie.slices[0].proportion).toBe(0.25);
    expect(pie.slices[0].label).toBe("未知分类");
    expect(
      pie.slices.reduce((sum, slice) => sum + slice.endAngle - slice.startAngle, 0),
    ).toBeCloseTo(Math.PI * 2);
    finite(pie);
  });
  it("甘特无任务和全未排期不构造时间域", () => {
    expect(buildGanttGeometry([])).toMatchObject({ rows: [], start: null, end: null });
    expect(buildGanttGeometry([task(null, null)]).rows[0]).toMatchObject({ x: null, width: null });
  });
  it("甘特同日有一日宽度；跨月跨年闰日，包含结束日", () => {
    const single = buildGanttGeometry([task("2026-10-05", "2026-10-05")]);
    expect(single.rows[0].width).toBe(600);
    expect(single.end! - single.start!).toBe(1);
    const month = buildGanttGeometry([task("2024-02-28", "2024-03-01")]);
    expect(month.end! - month.start!).toBe(3);
    const year = buildGanttGeometry([
      task("2025-12-31", "2026-01-01"),
      task("2026-01-02", "2026-01-02"),
    ]);
    expect(year.rows[0].width).toBe(400);
    expect(year.rows[1].x).toBe(400);
    expect(year.ticks.map((tick) => tick.label)).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });
  it("无效/倒置日期保留文字但不绘条，窄尺寸和退化域无非有限坐标", () => {
    const gantt = buildGanttGeometry(
      [
        task("2026-02-30", "2026-03-01"),
        task("2026-10-06", "2026-10-05"),
        task("2026-10-05", "2026-10-05"),
      ],
      0,
    );
    expect(gantt.rows.map((row) => row.width)).toEqual([null, null, 1]);
    finite(gantt);
  });
  it("数量轴和百分比独立；0 与未知不同", () => {
    expect(buildCountBars([2, 4, 0, null, -1, Infinity], 300)).toEqual([
      150,
      300,
      0,
      null,
      null,
      null,
    ]);
    expect(percentValue(2).width).toBe(2);
    finite(buildCountBars([0, null], NaN));
  });
});
