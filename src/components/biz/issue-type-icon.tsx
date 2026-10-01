import { BookOpen, Bug, CheckSquare, Layers } from "lucide-react";
import type { WorkItem } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";

export function IssueTypeIcon({ item, className }: { item: Pick<WorkItem, "kind" | "requirementType" | "taskType">; className?: string }) {
  const common = cn("size-4 shrink-0", className);
  if (item.kind === "defect") return <Bug className={cn(common, "text-defect")} aria-hidden="true" />;
  if (item.kind === "task") return <CheckSquare className={cn(common, "text-task")} aria-hidden="true" />;
  if (item.requirementType === "Epic") return <Layers className={cn(common, "text-epic")} aria-hidden="true" />;
  if (item.requirementType === "Story") return <BookOpen className={cn(common, "text-story")} aria-hidden="true" />;
  return <CheckSquare className={cn(common, "text-task")} aria-hidden="true" />;
}
