/**
 * 测试用例状态/优先级展示小件（P2：p2-testcase-list-detail）。
 *
 * 不走 StatusChip（ItemKind 只有 requirement/task/defect 三域）：色板忠实于
 * 老前端 TestCaseList.vue 的 statusColor：
 * - DRAFT 灰（neutral）/ ACTIVE 绿（done）/ REVIEW 橙（review）/ ARCHIVED 红（danger）
 * - 优先级：高 danger / 中 review / 低 neutral
 */
import { StateChip } from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUS_LABELS,
} from "@/lib/api/testCase-types";
import type { TestCasePriority, TestCaseStatus } from "@/lib/api/testCase-types";

const STATUS_TONE: Record<TestCaseStatus, StateTone> = {
  DRAFT: "neutral",
  ACTIVE: "done",
  REVIEW: "review",
  ARCHIVED: "danger",
};

export function TestCaseStatusChip({ status }: { status: string }) {
  const tone = (STATUS_TONE as Record<string, StateTone>)[status] ?? "neutral";
  const label = (TEST_CASE_STATUS_LABELS as Record<string, string>)[status] ?? status;
  return <StateChip tone={tone}>{label}</StateChip>;
}

const PRIORITY_TONE: Record<TestCasePriority, StateTone> = {
  高: "danger",
  中: "review",
  低: "neutral",
};

export function TestCasePriorityChip({ priority }: { priority: string }) {
  const tone =
    (PRIORITY_TONE as Record<string, StateTone>)[priority] ?? "neutral";
  const known = (TEST_CASE_PRIORITIES as readonly string[]).includes(priority);
  // 空值回退为 "-"，避免渲染出"优先级 "的残缺文案（pi NOTE-6）
  if (!priority) return <StateChip tone="neutral">-</StateChip>;
  return <StateChip tone={tone}>{known ? priority : `优先级 ${priority}`}</StateChip>;
}
