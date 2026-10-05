import { StateChip } from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import { TEST_CASE_STATUS_LABEL, type TestCaseStatus } from "@/lib/pm/domain";

// 复用 P2 testcase-status-chip 的状态 tone；身份和文案沿用 P3 domain。
const STATUS_TONE: Record<TestCaseStatus, StateTone> = {
  DRAFT: "neutral",
  ACTIVE: "done",
  REVIEW: "review",
  ARCHIVED: "danger",
};

export function TestCaseStatusChip({ status }: { status: string }) {
  const tone = (STATUS_TONE as Record<string, StateTone>)[status] ?? "neutral";
  const label = (TEST_CASE_STATUS_LABEL as Record<string, string>)[status] ?? status;
  return <StateChip tone={tone}>{label}</StateChip>;
}
