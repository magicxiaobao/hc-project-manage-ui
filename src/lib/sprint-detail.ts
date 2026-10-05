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
 * - normalizeBurndownData：防御归一（缺失→空数组；三数组按索引 zip，
 *   日期非法则整行丢弃以保持索引对齐；数值非法→0 并钳制非负；长度截齐最短）
 * - buildBurndownGeometry：归一化数据 → SVG 坐标（剩余故事点折线、
 *   理想线=首日剩余→0 的直线、每日工时柱走右轴），不依赖图表库
 * - summarizeBurndown：汇总口径。⚠️ values[0] 是"首日剩余"而非"总量"
 *   （后端 values[i]=max(总量-completedUpTo(day_i),0)），总量/已完成必须由
 *   调用方传入冲刺详情统计（totalStoryPoints/completedStoryPoints），
 *   绝不能拿首日剩余冒充"总故事点"（r16-5）
 */

/** 归一化后的燃尽数据：三数组等长 */
export interface NormalizedBurndownData {
  dates: string[];
  values: number[];
  dailyHours: number[];
}

/** 非法/非有限/负数 → 0；燃尽值语义非负，钳制保证几何计算不越界（r16-4） */
function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * 防御归一燃尽图原始数据。
 * 后端冲刺不存在时返回空 Map（字段缺失）；三数组先按索引 zip 再过滤：
 * 日期非法则整行丢弃（不能只丢日期——否则日期/数值索引错位，r16-3），
 * 数值非法→0 并钳制非负；最后长度截齐最短防止错位。
 */
export function normalizeBurndownData(raw: unknown): NormalizedBurndownData {
  const empty: NormalizedBurndownData = { dates: [], values: [], dailyHours: [] };
  if (typeof raw !== "object" || raw === null) return empty;
  const record = raw as Record<string, unknown>;
  const rawDates = Array.isArray(record.dates) ? record.dates : [];
  const rawValues = Array.isArray(record.values) ? record.values : [];
  const rawHours = Array.isArray(record.dailyHours) ? record.dailyHours : [];
  const length = Math.min(rawDates.length, rawValues.length, rawHours.length);
  const dates: string[] = [];
  const values: number[] = [];
  const dailyHours: number[] = [];
  for (let i = 0; i < length; i++) {
    if (typeof rawDates[i] !== "string") continue;
    dates.push(rawDates[i] as string);
    values.push(toNonNegativeNumber(rawValues[i]));
    dailyHours.push(toNonNegativeNumber(rawHours[i]));
  }
  return { dates, values, dailyHours };
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

/** 燃尽汇总口径 */
export interface BurndownSummary {
  /**
   * 故事点总量：必须取冲刺详情统计（SprintResponse.totalStoryPoints）。
   * 后端 values[0] 是"首日剩余"（总量−首日完成），绝不能标为"总故事点"（r16-5）；
   * 详情未返回总量时为 null，调用方改用首日剩余/区间消耗的诚实口径展示。
   */
  totalPoints: number | null;
  /** 已完成故事点：取冲刺详情统计（SprintResponse.completedStoryPoints），缺失为 null */
  completedPoints: number | null;
  /** 首日剩余故事点（values[0]，后端口径，非总量） */
  firstDayRemaining: number;
  /** 图表窗口内消耗 = 首日剩余 − 末日剩余 */
  windowCompleted: number;
  /** 累计工时（dailyHours 求和） */
  totalHours: number;
}

/**
 * 燃尽汇总。总量/已完成由调用方传入冲刺详情统计；不传时总量相关为 null，
 * 调用方不得用首日剩余冒充。
 */
export function summarizeBurndown(
  data: NormalizedBurndownData,
  totals?: { totalPoints?: number | null; completedPoints?: number | null },
): BurndownSummary {
  const firstDayRemaining = data.values.length > 0 ? data.values[0] : 0;
  const remaining = data.values.length > 0 ? data.values[data.values.length - 1] : 0;
  return {
    totalPoints: totals?.totalPoints ?? null,
    completedPoints: totals?.completedPoints ?? null,
    firstDayRemaining,
    windowCompleted: Math.max(firstDayRemaining - remaining, 0),
    totalHours: round2(data.dailyHours.reduce((sum, hours) => sum + hours, 0)),
  };
}

/**
 * 冲刺回顾编辑器同步状态机（r17-1）。
 *
 * 背景：回顾查询的缓存失效（invalidateQueries）不等待重取完成，保存成功瞬间
 * 查询缓存仍是旧文本；同步 effect 若此时放行，会把已保存的草稿回退到旧缓存
 * （run188-codex-P3-r17-1：toast 弹"已保存"，编辑器却回退到保存前文本，
 * 用户继续编辑再保存会用旧文本覆盖服务端已有的新文本）。
 *
 * 后端实读（SprintServiceImpl:507-517）：getRetrospective 直接返回
 * retrospective_summary 列，updateRetrospective 原样写入，无任何变换，
 * 故服务端回显文本恒等于保存文本，可作为"回显到达"的判断依据之一。
 *
 * 状态机把"保存抑制标记"显式建模：保存成功后记录当时的 dataUpdatedAt，
 * 同步 effect 在查询数据推进（服务端回显到达）前一律跳过。
 */
export interface RetroEditorSyncState {
  /** 编辑器草稿；null 表示尚未从服务端载入 */
  draft: string | null;
  /** 上次载入/保存的基线；dirty = draft 与 savedText 偏离 */
  savedText: string | null;
  /** 已同步为草稿/基线的服务端文本版本 */
  syncedServerText: string | null;
  /** 保存成功后、服务端回显到达前的抑制标记 */
  pendingSave: { text: string; dataUpdatedAt: number } | null;
}

export interface RetroServerSnapshot {
  isSuccess: boolean;
  serverText: string;
  dataUpdatedAt: number;
}

export const initialRetroEditorSyncState: RetroEditorSyncState = {
  draft: null,
  savedText: null,
  syncedServerText: null,
  pendingSave: null,
};

/**
 * 同步 effect 的纯决策（r16-2 的"后台重取新文本时干净草稿重对齐" +
 * r17-1 的"保存抑制"）。
 * - 查询未成功 → 状态不变
 * - 存在保存抑制标记且查询数据未推进（仍是保存前的旧缓存）→ 状态不变，
 *   已保存的草稿不回退
 * - 否则清除标记；draft 为 null 或（草稿不脏且服务端文本有新版本）→
 *   用服务端文本重设草稿与基线；脏草稿一律保留，避免静默覆盖用户输入
 */
export function applyRetroServerSync(
  state: RetroEditorSyncState,
  snapshot: RetroServerSnapshot,
): RetroEditorSyncState {
  if (!snapshot.isSuccess) return state;
  // r17-1：保存成功后查询数据尚未推进（旧缓存）→ 跳过，不回退已保存草稿
  if (state.pendingSave && snapshot.dataUpdatedAt <= state.pendingSave.dataUpdatedAt) {
    return state;
  }
  const isDirty =
    state.draft !== null && state.savedText !== null && state.draft !== state.savedText;
  // r16-2：草稿不脏且服务端有新版本 → 用新文本重设草稿与基线
  if (
    state.draft === null ||
    (!isDirty && snapshot.serverText !== state.syncedServerText)
  ) {
    return {
      draft: snapshot.serverText,
      savedText: snapshot.serverText,
      syncedServerText: snapshot.serverText,
      pendingSave: null,
    };
  }
  return { ...state, pendingSave: null };
}

/**
 * 保存成功时的状态推进（r17-1）：同步版本与保存基线对齐，并立起抑制标记
 * 等待服务端回显。调用方须传入保存发起时捕获的 draft 值（避免闭包读到
 * 保存后用户又改了的 draft）。
 */
export function applyRetroSaveSuccess(
  state: RetroEditorSyncState,
  savedText: string,
  dataUpdatedAt: number,
): RetroEditorSyncState {
  return {
    ...state,
    savedText,
    syncedServerText: savedText,
    pendingSave: { text: savedText, dataUpdatedAt },
  };
}
