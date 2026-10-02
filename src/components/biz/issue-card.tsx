import type { Person, WorkItem } from "@/lib/pm/domain";
import { statusLabel } from "@/lib/pm/domain";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { PriorityMark } from "@/components/biz/priority-mark";

export function IssueCard({ item, assignee, onOpen, draggable = true }: { item: WorkItem; assignee?: Person | null; onOpen: (id: string) => void; draggable?: boolean }) {
  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? (event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
      } : undefined}
      className={`rounded-sm bg-surface px-3 py-2.5 shadow-card ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <button type="button" className="w-full text-left" onClick={() => onOpen(item.id)}>
        <h3 className="type-body leading-snug">{item.title}</h3>
        {!draggable ? <p className="type-caption mt-1">{item.key} · {statusLabel(item.kind, item.status)}</p> : null}
        <div className="mt-3 flex items-center">
          <IssueTypeIcon item={item} />
          <span className="ml-2">
            <PriorityMark priority={item.priority} />
          </span>
          <span className="ml-auto">
            <PersonAvatar person={assignee} />
          </span>
        </div>
      </button>
    </article>
  );
}
