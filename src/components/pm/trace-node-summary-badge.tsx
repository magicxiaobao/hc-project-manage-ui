import { StateChip, StatusChip } from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import type { TraceNodeSummary } from "@/lib/api/trace-types";
import { TestCaseStatusChip } from "./testcase-status-chip";

const KINDS = { REQUIREMENT: "requirement", TASK: "task", DEFECT: "defect" } as const;
const NAMES = { REQUIREMENT: "需求", TASK: "任务", TEST_CASE: "用例", DEFECT: "缺陷" } as const;
export function TraceNodeSummaryBadge({ node }: { node: TraceNodeSummary }) {
  const kind = KINDS[node.objectType as keyof typeof KINDS];
  const name = NAMES[node.objectType as keyof typeof NAMES] ?? node.objectType;
  return (
    <div
      className="flex flex-wrap items-center gap-2 py-1"
      data-node={`${node.objectType}:${node.objectId}`}
    >
      <span className="type-caption">#{node.objectId}</span>
      <span className="type-body break-words">
        {node.displayName?.trim() || `${name} #${node.objectId}`}
      </span>
      {!node.status ? (
        <StateChip tone="neutral">状态未知</StateChip>
      ) : node.objectType === "TEST_CASE" ? (
        <TestCaseStatusChip status={node.status} />
      ) : kind && statusLabel(kind, node.status) !== node.status ? (
        <StatusChip kind={kind} status={node.status} />
      ) : (
        <StateChip tone="neutral">{node.status}</StateChip>
      )}
    </div>
  );
}
