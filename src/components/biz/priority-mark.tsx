import { ChevronsDown, ChevronsUp, Equal } from "lucide-react";
import type { Priority } from "@/lib/pm/domain";

export function PriorityMark({ priority }: { priority: Priority }) {
  if (priority === "HIGH") return <ChevronsUp className="size-4 text-danger" aria-label="高" />;
  if (priority === "MEDIUM") return <Equal className="size-4 text-warning" aria-label="中" />;
  return <ChevronsDown className="size-4 text-success" aria-label="低" />;
}
