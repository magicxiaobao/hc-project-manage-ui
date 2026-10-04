/**
 * 测试轮状态/类型展示小件（P2：p2-testrun-workspace）。
 *
 * 状态四态（中文见 TEST_RUN_STATUS_LABELS）：
 * - CREATED 已创建：neutral / RUNNING 执行中：progress /
 *   COMPLETED 已完成：done / CANCELLED 已取消：revert
 * - 执行状态四态：NOT_STARTED 未开始：neutral / RUNNING 执行中：progress /
 *   COMPLETED 已完成：done / CANCELLED 已取消：revert
 * - 执行结果四态：PASSED 通过：done / FAILED 失败：danger /
 *   BLOCKED 阻塞：review / SKIPPED 跳过：neutral
 * - 测试轮类型三态：中文见 TEST_RUN_TYPE_LABELS，统一 neutral 底色
 */
import { StateChip } from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import {
  TEST_EXECUTION_RESULT_LABELS,
  TEST_EXECUTION_STATUS_LABELS,
  TEST_RUN_STATUS_LABELS,
  TEST_RUN_TYPE_LABELS,
} from "@/lib/api/testRun-types";

const RUN_STATUS_TONE: Record<string, StateTone> = {
  CREATED: "neutral",
  RUNNING: "progress",
  COMPLETED: "done",
  CANCELLED: "revert",
};

export function TestRunStatusChip({ status }: { status: string | null }) {
  const tone: StateTone =
    (status && RUN_STATUS_TONE[status]) || "neutral";
  const label = (status && TEST_RUN_STATUS_LABELS[status as keyof typeof TEST_RUN_STATUS_LABELS]) ?? status ?? "-";
  return <StateChip tone={tone}>{label}</StateChip>;
}

const EXECUTION_STATUS_TONE: Record<string, StateTone> = {
  NOT_STARTED: "neutral",
  RUNNING: "progress",
  COMPLETED: "done",
  CANCELLED: "revert",
};

export function TestExecutionStatusChip({ status }: { status: string | null }) {
  const tone: StateTone =
    (status && EXECUTION_STATUS_TONE[status]) || "neutral";
  const label =
    (status && TEST_EXECUTION_STATUS_LABELS[status as keyof typeof TEST_EXECUTION_STATUS_LABELS]) ??
    status ??
    "-";
  return <StateChip tone={tone}>{label}</StateChip>;
}

const EXECUTION_RESULT_TONE: Record<string, StateTone> = {
  PASSED: "done",
  FAILED: "danger",
  BLOCKED: "review",
  SKIPPED: "neutral",
};

export function TestExecutionResultChip({ result }: { result: string | null }) {
  const tone: StateTone =
    (result && EXECUTION_RESULT_TONE[result]) || "neutral";
  const label =
    (result && TEST_EXECUTION_RESULT_LABELS[result as keyof typeof TEST_EXECUTION_RESULT_LABELS]) ??
    result ??
    "-";
  return <StateChip tone={tone}>{label}</StateChip>;
}

export function TestRunTypeChip({ runType }: { runType: string | null }) {
  const label =
    (runType && TEST_RUN_TYPE_LABELS[runType as keyof typeof TEST_RUN_TYPE_LABELS]) ??
    runType ??
    "-";
  return <StateChip tone="neutral">{label}</StateChip>;
}
