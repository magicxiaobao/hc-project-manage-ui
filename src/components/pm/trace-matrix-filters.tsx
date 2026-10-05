import { Button } from "@heroui/react";
import { OptionSelect } from "@/components/biz";
import { REQUIREMENT_STATUSES } from "@/lib/api/requirement-types";
import { TASK_STATUSES } from "@/lib/api/task-types";
import { DEFECT_STATUS_LABEL, TEST_CASE_STATUS_LABEL, statusLabel } from "@/lib/pm/domain";
import type { MatrixFilters } from "@/lib/trace-matrix";

const options = (entries: [string, string][]) => [
  { id: "", label: "全部" },
  ...entries.map(([id, label]) => ({ id, label })),
];
const FIELDS = [
  {
    field: "requirementStatus",
    label: "需求状态",
    options: options(REQUIREMENT_STATUSES.map((id) => [id, statusLabel("requirement", id)])),
  },
  {
    field: "taskStatus",
    label: "任务状态",
    options: options(TASK_STATUSES.map((id) => [id, statusLabel("task", id)])),
  },
  {
    field: "testCaseStatus",
    label: "用例状态",
    options: options(Object.entries(TEST_CASE_STATUS_LABEL)),
  },
  {
    field: "defectStatus",
    label: "缺陷状态",
    options: options(Object.entries(DEFECT_STATUS_LABEL)),
  },
] as const;
export function TraceMatrixFilters({
  filters,
  onChange,
  onReset,
}: {
  filters: MatrixFilters;
  onChange: (field: keyof MatrixFilters, value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {FIELDS.map(({ field, label, options }) => (
        <div key={field} className="min-w-0">
          <p className="type-caption mb-1">{label}</p>
          <OptionSelect
            label={label}
            value={filters[field] ?? ""}
            options={options}
            onChange={(value) => onChange(field, value)}
          />
        </div>
      ))}
      <Button variant="ghost" className="self-end" onPress={onReset}>
        重置
      </Button>
    </div>
  );
}
