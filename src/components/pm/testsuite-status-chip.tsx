/**
 * 测试套件状态/优先级展示小件（P2：p2-testsuite-live）。
 *
 * 八态色板（状态中文见 TEST_SUITE_STATUS_LABELS）：
 * - DRAFT 草稿：neutral / ACTIVE 生效：done / IN_PROGRESS 进行中：progress /
 *   EXECUTING 执行中：progress / PAUSED 已暂停：review / COMPLETED 已完成：done /
 *   DEPRECATED 已废弃：revert / CLOSED 已关闭：neutral
 * - 优先级：高 danger / 中 review / 低 neutral（与用例域一致）
 */
import { StateChip } from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import {
  TEST_SUITE_PRIORITIES,
  TEST_SUITE_STATUS_LABELS,
} from "@/lib/api/testSuite-types";
import type { TestSuitePriority, TestSuiteStatus } from "@/lib/api/testSuite-types";

const STATUS_TONE: Record<TestSuiteStatus, StateTone> = {
  DRAFT: "neutral",
  ACTIVE: "done",
  IN_PROGRESS: "progress",
  EXECUTING: "progress",
  PAUSED: "review",
  COMPLETED: "done",
  DEPRECATED: "revert",
  CLOSED: "neutral",
};

export function TestSuiteStatusChip({ status }: { status: string }) {
  const tone = (STATUS_TONE as Record<string, StateTone>)[status] ?? "neutral";
  const label = (TEST_SUITE_STATUS_LABELS as Record<string, string>)[status] ?? status;
  return <StateChip tone={tone}>{label}</StateChip>;
}

const PRIORITY_TONE: Record<TestSuitePriority, StateTone> = {
  高: "danger",
  中: "review",
  低: "neutral",
};

export function TestSuitePriorityChip({ priority }: { priority: string }) {
  const tone = (PRIORITY_TONE as Record<string, StateTone>)[priority] ?? "neutral";
  const known = (TEST_SUITE_PRIORITIES as readonly string[]).includes(priority);
  if (!priority) return <StateChip tone="neutral">-</StateChip>;
  return <StateChip tone={tone}>{known ? priority : `优先级 ${priority}`}</StateChip>;
}
