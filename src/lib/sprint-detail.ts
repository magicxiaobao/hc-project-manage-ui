/**
 * 冲刺详情纯逻辑（P3：p3-sprint-detail 燃尽图）。
 *
 * 后端实读（SprintServiceImpl.getBurndownChartData:435-473）：
 * - 返回 {dates, values, dailyHours} 的 Map：dates 为 LocalDate.toString()
 *  （'YYYY-MM-DD'）数组；values 为剩余故事点 List<Integer>（Math.max(...,0)
 *   保底非负）；dailyHours 为每日工时 List<Double>（缺工时记 0.0）
 * - 冲刺不存在时直接返回 Collections.emptyMap()：数组字段缺失，
 *   前端必须防御归一，不能假设字段存在
 * - ⚠️ GET sprint/v1/burndown/{sprintId} 与 statistics/{sprintId} 是
 *   Controller TODO 空壳（返回 Map.of()），P3 明确排除，不建模
 *
 * - normalizeBurndownData：防御归一（缺失→空数组；长度截齐最短；
 *   非有限数→0；dates 非字符串丢弃）
 * - buildBurndownGeometry：归一化数据 → SVG 坐标（剩余故事点折线、
 *   理想线=首日剩余→0 的直线、每日工时柱走右轴），不依赖图表库
 */

/** 归一化后的燃尽数据：三数组等长 */
export interface NormalizedBurndownData {
  dates: string[];
  values: number[];
  dailyHours: number[];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asFiniteNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0));
}

/**
 * 防御归一燃尽图原始数据。
 * 后端冲刺不存在时返回空 Map（字段缺失）；三数组长度理论一致，
 * 仍截齐最短防止错位。
 */
export function normalizeBurndownData(raw: unknown): NormalizedBurndownData {
  const empty: NormalizedBurndownData = { dates: [], values: [], dailyHours: [] };
  if (typeof raw !== "object" || raw === null) return empty;
  const record = raw as Record<string, unknown>;
  const dates = asStringArray(record.dates);
  const values = asFiniteNumberArray(record.values);
  const dailyHours = asFiniteNumberArray(record.dailyHours);
  const length = Math.min(dates.length, values.length, dailyHours.length);
  return {
    dates: dates.slice(0, length),
    values: values.slice(0, length),
    dailyHours: dailyHours.slice(0, length),
  };
}

/** 'YYYY-MM-DD' → 'MM-DD'；不匹配时原样返回 */
export function formatBurndownDayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  return `${match[2]}-${match[3]}`;
}

export interface BurndownGeometryOptions {
  width?: number;
  height?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
}

export interface BurndownBar {
  x: number;
  y: number;
  width: number;
  height: number;
  hours: number;
  date: string;
}

export interface BurndownAxisTick {
  value: number;
  y: number;
  label: string;
}

export interface BurndownXLabel {
  x: number;
  label: string;
}

export interface BurndownDot {
  x: number;
  y: number;
  value: number;
  date: string;
}

export interface BurndownGeometry {
  width: number;
  height: number;
  /** 剩余故事点折线 polyline points 属性 */
  linePoints: string;
  /** 剩余故事点数据点（圆点标记用） */
  dots: BurndownDot[];
  /** 理想线（首日剩余→0）polyline points 属性 */
  idealPoints: string;
  /** 每日工时柱（右轴） */
  bars: BurndownBar[];
  /** 左轴刻度（剩余故事点） */
  leftTicks: BurndownAxisTick[];
  /** 右轴刻度（工时） */
  rightTicks: BurndownAxisTick[];
  /** 横轴日期标签 */
  xLabels: BurndownXLabel[];
  maxRemaining: number;
  maxHours: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** 刻度文案：整数原样，小数保留 1 位 */
function formatTickLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * 燃尽数据 → SVG 几何。空数据返回 null（调用方渲染 EmptyHint）。
 * 双轴：左轴=剩余故事点（折线+理想线），右轴=每日工时（柱）。
 */
export function buildBurndownGeometry(
  data: NormalizedBurndownData,
  options: BurndownGeometryOptions = {},
): BurndownGeometry | null {
  const { dates, values, dailyHours } = data;
  const count = dates.length;
  if (count === 0) return null;

  const width = options.width ?? 640;
  const height = options.height ?? 320;
  const padding = options.padding ?? { top: 16, right: 48, bottom: 28, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const baseY = padding.top + innerHeight;

  const maxRemaining = Math.max(0, ...values);
  const maxHours = Math.max(0, ...dailyHours);

  const xAt = (index: number): number =>
    count === 1 ? padding.left + innerWidth / 2 : padding.left + (index * innerWidth) / (count - 1);
  // max<=0 时贴底线，避免除零
  const yFor = (value: number, max: number): number =>
    max <= 0 ? baseY : padding.top + innerHeight * (1 - value / max);

  const linePoints = values
    .map((value, index) => `${round2(xAt(index))},${round2(yFor(value, maxRemaining))}`)
    .join(" ");
  const dots: BurndownDot[] = values.map((value, index) => ({
    x: round2(xAt(index)),
    y: round2(yFor(value, maxRemaining)),
    value,
    date: dates[index],
  }));
  const idealPoints =
    `${round2(xAt(0))},${round2(yFor(values[0], maxRemaining))} ` +
    `${round2(xAt(count - 1))},${round2(yFor(0, maxRemaining))}`;

  const step = count === 1 ? innerWidth : innerWidth / (count - 1);
  const barWidth = Math.max(2, Math.min(28, step * 0.45));
  const bars: BurndownBar[] = dailyHours.map((hours, index) => {
    const y = yFor(hours, maxHours);
    return {
      x: round2(xAt(index) - barWidth / 2),
      y: round2(y),
      width: round2(barWidth),
      height: round2(baseY - y),
      hours,
      date: dates[index],
    };
  });

  const buildTicks = (max: number): BurndownAxisTick[] =>
    [0, 1, 2, 3, 4].map((stepIndex) => {
      const value = (max * stepIndex) / 4;
      return {
        value,
        y: round2(yFor(value, max)),
        label: formatTickLabel(round2(value)),
      };
    });

  // 横轴标签：超过 8 天时抽稀，保证首尾可见
  const labelEvery = count <= 8 ? 1 : Math.ceil(count / 8);
  const xLabels: BurndownXLabel[] = dates
    .map((date, index) => ({ index, label: formatBurndownDayLabel(date) }))
    .filter(({ index }) => index % labelEvery === 0 || index === count - 1)
    .map(({ index, label }) => ({ x: round2(xAt(index)), label }));

  return {
    width,
    height,
    linePoints,
    dots,
    idealPoints,
    bars,
    leftTicks: buildTicks(maxRemaining),
    rightTicks: buildTicks(maxHours),
    xLabels,
    maxRemaining,
    maxHours,
  };
}

/** 燃尽汇总：总故事点（首日剩余）、已完成、总工时 */
export function summarizeBurndown(data: NormalizedBurndownData): {
  totalPoints: number;
  completedPoints: number;
  totalHours: number;
} {
  const totalPoints = data.values.length > 0 ? data.values[0] : 0;
  const remaining = data.values.length > 0 ? data.values[data.values.length - 1] : 0;
  return {
    totalPoints,
    completedPoints: Math.max(totalPoints - remaining, 0),
    totalHours: round2(data.dailyHours.reduce((sum, hours) => sum + hours, 0)),
  };
}
