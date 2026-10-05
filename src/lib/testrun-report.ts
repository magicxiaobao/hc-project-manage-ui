/**
 * 测试报告纯展示工具（P2：p2-testrun-report）。
 *
 * 报告聚合字段（忠实于后端 TestRunReportSummary / TestRunResultCounts）：
 * - rate 为 0～1 小数（passRate / executionCoverage），null 按缺失展示
 * - durationSeconds 为秒数，null 按缺失展示
 * - versionEvidenceState 为 OFFICIAL / SUPERSEDED / STALE_SCOPE / NON_OFFICIAL
 */

/** 证据状态中文文案（展示用；后端枚举原样透出，未知值回退原文） */
export const TEST_RUN_REPORT_EVIDENCE_STATE_LABELS: Record<string, string> = {
  OFFICIAL: '正式',
  SUPERSEDED: '已被取代',
  STALE_SCOPE: '范围已过期',
  NON_OFFICIAL: '非正式',
};

/** 0～1 小数 → 百分比文案；null/NaN → "-" */
export function formatReportRate(rate: number | null | undefined): string {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return '-';
  const clamped = Math.min(1, Math.max(0, rate));
  return `${(clamped * 100).toFixed(1)}%`;
}

/** 秒数 → 中文时长文案（如 3723 → "1时2分3秒"）；null/NaN/负数 → "-" */
export function formatReportDuration(
  seconds: number | null | undefined,
): string {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return '-';
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}时${minutes}分${secs}秒`;
  if (minutes > 0) return `${minutes}分${secs}秒`;
  return `${secs}秒`;
}

/** 报告证据状态 → 中文文案；null → "-"，未知值回退原文 */
export function reportEvidenceStateLabel(state: string | null | undefined): string {
  if (!state) return '-';
  return TEST_RUN_REPORT_EVIDENCE_STATE_LABELS[state] ?? state;
}
