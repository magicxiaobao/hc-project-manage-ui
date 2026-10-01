import type { WorkItem } from "@/lib/pm/domain";
import { kindLabel } from "@/lib/pm/domain";
import { severityLabel } from "@/components/biz/severity";

export function IssueMeta({ item }: { item: WorkItem }) {
  return (
    <span className="type-caption">
      {kindLabel(item)}
      {item.storyPoints ? ` · ${item.storyPoints} 点` : ""}
      {item.kind === "defect" && item.severity ? ` · ${severityLabel(item.severity)}` : ""}
    </span>
  );
}
