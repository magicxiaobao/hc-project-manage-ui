import type { ReactNode } from "react";
import type { Person, WorkItem } from "@/lib/pm/domain";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { PriorityMark } from "@/components/biz/priority-mark";
import { StatusChip } from "@/components/biz/status-chip";

export function IssueRow({
  item,
  assignee,
  extra,
  onOpen,
  draggable = false,
}: {
  item: WorkItem;
  assignee?: Person | null;
  extra?: ReactNode;
  onOpen: (id: string) => void;
  draggable?: boolean;
}) {
  return (
    <li
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              event.dataTransfer.setData("text/plain", item.id);
              event.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
    >
      <IssueTypeIcon item={item} />
      <button type="button" className="type-link w-16 shrink-0 text-left" onClick={() => onOpen(item.id)}>
        {item.key}
      </button>
      <button type="button" className="type-body min-w-0 flex-1 truncate text-left" onClick={() => onOpen(item.id)}>
        {item.title}
      </button>
      <span className="hidden sm:inline">
        <StatusChip kind={item.kind} status={item.status} />
      </span>
      {extra}
      <PriorityMark priority={item.priority} />
      <PersonAvatar person={assignee} />
    </li>
  );
}
