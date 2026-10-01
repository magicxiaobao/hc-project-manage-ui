import { Bug, BookOpen, CheckSquare, ChevronsDown, ChevronsUp, Equal, Layers } from "lucide-react";
import type { ItemKind, Person, Priority, WorkItem } from "@/lib/pm/domain";
import { columnOf, kindLabel, priorityLabel, statusLabel } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";

export function Avatar({ person, className }: { person?: Person | null; className?: string }) {
  const label = person ? person.name.slice(-2) : "—";
  return (
    <span
      title={person?.name ?? "未分配"}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary-ink",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function TypeIcon({ item, className }: { item: Pick<WorkItem, "kind" | "requirementType" | "taskType">; className?: string }) {
  const common = cn("size-4 shrink-0", className);
  if (item.kind === "defect") return <Bug className={cn(common, "text-[#e44d42]")} aria-hidden="true" />;
  if (item.kind === "task") return <CheckSquare className={cn(common, "text-[#4fade6]")} aria-hidden="true" />;
  if (item.requirementType === "Epic") return <Layers className={cn(common, "text-[#904ee2]")} aria-hidden="true" />;
  if (item.requirementType === "Story") return <BookOpen className={cn(common, "text-[#65ba43]")} aria-hidden="true" />;
  return <CheckSquare className={cn(common, "text-[#4fade6]")} aria-hidden="true" />;
}

export function PriorityMark({ priority }: { priority: Priority }) {
  if (priority === "HIGH") return <ChevronsUp className="size-4 text-[#e9494a]" aria-label="高" />;
  if (priority === "MEDIUM") return <Equal className="size-4 text-[#e97f33]" aria-label="中" />;
  return <ChevronsDown className="size-4 text-[#2d8738]" aria-label="低" />;
}

export function StatusPill({ kind, status }: { kind: ItemKind; status: string }) {
  const column = columnOf(kind, status);
  const tone =
    column === "doing"
      ? "bg-primary-soft text-primary-ink"
      : column === "check"
        ? "bg-warning-soft text-warning"
        : column === "done"
          ? "bg-success-soft text-success"
          : column === "cancelled"
            ? "bg-line text-faint"
            : "bg-line text-muted";
  return <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium", tone)}>{statusLabel(kind, status)}</span>;
}

export function MetaLine({ item }: { item: WorkItem }) {
  return (
    <span className="text-xs text-faint">
      {kindLabel(item)}
      {item.storyPoints ? ` · ${item.storyPoints} 点` : ""}
      {item.kind === "defect" && item.severity ? ` · ${severityLabel(item.severity)}` : ""}
    </span>
  );
}

export function severityLabel(severity: string) {
  const map: Record<string, string> = {
    BLOCKER: "阻塞",
    CRITICAL: "致命",
    MAJOR: "严重",
    NORMAL: "一般",
    MINOR: "轻微",
    TRIVIAL: "建议",
  };
  return map[severity] ?? severity;
}

export function priorityText(priority: Priority) {
  return priorityLabel(priority);
}
