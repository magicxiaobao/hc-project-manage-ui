/**
 * 测试报告纯展示工具（P2：p2-testrun-report）测试。
 *
 * 运行：pnpm vitest run src/lib/__tests__/testrun-report.test.ts（已接入 pnpm run test:lib）
 */
import { describe, expect, it } from 'vitest';
import {
  formatReportDuration,
  formatReportRate,
  reportEvidenceStateLabel,
} from '../testrun-report';

describe('formatReportRate', () => {
  it('0～1 小数转百分比（保留一位小数）', () => {
    expect(formatReportRate(0.75)).toBe('75.0%');
    expect(formatReportRate(0)).toBe('0.0%');
    expect(formatReportRate(1)).toBe('100.0%');
  });
  it('越界值钳制到 0～100%', () => {
    expect(formatReportRate(1.2)).toBe('100.0%');
    expect(formatReportRate(-0.1)).toBe('0.0%');
  });
  it('null/undefined/NaN → "-"', () => {
    expect(formatReportRate(null)).toBe('-');
    expect(formatReportRate(undefined)).toBe('-');
    expect(formatReportRate(Number.NaN)).toBe('-');
  });
});

describe('formatReportDuration', () => {
  it('时/分/秒组合', () => {
    expect(formatReportDuration(3723)).toBe('1时2分3秒');
  });
  it('不足一小时只显示分/秒', () => {
    expect(formatReportDuration(90)).toBe('1分30秒');
  });
  it('不足一分钟只显示秒', () => {
    expect(formatReportDuration(45)).toBe('45秒');
  });
  it('零秒', () => {
    expect(formatReportDuration(0)).toBe('0秒');
  });
  it('null/undefined/NaN/负数 → "-"', () => {
    expect(formatReportDuration(null)).toBe('-');
    expect(formatReportDuration(undefined)).toBe('-');
    expect(formatReportDuration(Number.NaN)).toBe('-');
    expect(formatReportDuration(-5)).toBe('-');
  });
});

describe('reportEvidenceStateLabel', () => {
  it('四态中文文案', () => {
    expect(reportEvidenceStateLabel('OFFICIAL')).toBe('正式');
    expect(reportEvidenceStateLabel('SUPERSEDED')).toBe('已被取代');
    expect(reportEvidenceStateLabel('STALE_SCOPE')).toBe('范围已过期');
    expect(reportEvidenceStateLabel('NON_OFFICIAL')).toBe('非正式');
  });
  it('null/undefined → "-"；未知值回退原文', () => {
    expect(reportEvidenceStateLabel(null)).toBe('-');
    expect(reportEvidenceStateLabel(undefined)).toBe('-');
    expect(reportEvidenceStateLabel('SOME_FUTURE_STATE')).toBe(
      'SOME_FUTURE_STATE',
    );
  });
});
