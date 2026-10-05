import { EmptyHint, StateChip } from "@/components/biz";
import type { RequirementMatrixRow, TraceNodeSummary } from "@/lib/api/trace-types";
import { matrixColumnNodes, type MatrixFilters } from "@/lib/trace-matrix";
import { TraceNodeSummaryBadge } from "./trace-node-summary-badge";

function SummaryCell({ nodes, status }: { nodes: TraceNodeSummary[]; status?: string }) {
  const visible = matrixColumnNodes(nodes, status);
  return visible.length ? (
    visible.map((node) => (
      <TraceNodeSummaryBadge key={`${node.objectType}:${node.objectId}`} node={node} />
    ))
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <StateChip tone="neutral">未覆盖</StateChip>
      {status ? <span className="type-caption">当前状态筛选下</span> : null}
    </div>
  );
}

export function TraceMatrixTable({
  rows,
  filters = {},
}: {
  rows: RequirementMatrixRow[];
  filters?: MatrixFilters;
}) {
  if (!rows.length)
    return (
      <EmptyHint>
        {Object.values(filters).some(Boolean) ? "没有符合条件的需求" : "暂无需求矩阵数据"}
      </EmptyHint>
    );
  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
      <table className="w-full min-w-[760px] table-fixed" aria-label="需求追溯矩阵">
        <thead>
          <tr>
            {["需求", "任务", "用例", "缺陷"].map((label) => (
              <th
                key={label}
                scope="col"
                className="type-section border-b border-border px-3 py-3 text-left"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.requirement.objectId}>
              <td className="border-b border-border px-3 py-3 align-top">
                <TraceNodeSummaryBadge node={row.requirement} />
              </td>
              <td className="border-b border-border px-3 py-3 align-top">
                <SummaryCell nodes={row.taskSummaries} status={filters.taskStatus} />
              </td>
              <td className="border-b border-border px-3 py-3 align-top">
                <SummaryCell nodes={row.testCaseSummaries} status={filters.testCaseStatus} />
              </td>
              <td className="border-b border-border px-3 py-3 align-top">
                <SummaryCell nodes={row.defectSummaries} status={filters.defectStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
