import type { Person, WorkItem } from "@/lib/pm/domain";
import { StatusChip } from "@/components/biz/status-chip";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { PriorityMark } from "@/components/biz/priority-mark";
import { kindLabel } from "@/lib/pm/domain";

export function IssueCard({
  item,
  assignee,
  parentKey,
  onOpen,
  onDropBefore,
  draggable = true,
}: {
  item: WorkItem;
  assignee?: Person | null;
  parentKey?: string;
  onOpen: (id: string) => void;
  onDropBefore?: (id: string) => void;
  draggable?: boolean;
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              event.dataTransfer.setData("text/plain", item.id);
              event.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onDragOver={
        draggable && onDropBefore
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
            }
          : undefined
      }
      onDrop={
        draggable && onDropBefore
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              const id = event.dataTransfer.getData("text/plain");
              if (id && id !== item.id) onDropBefore(id);
            }
          : undefined
      }
      className={`rounded-sm bg-surface px-3 py-2.5 shadow-card ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <button
        data-focus-key={`item-card:${item.id}`}
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(item.id)}
      >
        {parentKey ? <span className="type-caption block truncate">{parentKey}</span> : null}
        <span className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
          <span className="type-key shrink-0">{item.key}</span>
          <StatusChip kind={item.kind} status={item.status} />
        </span>
        <h3 className="type-body mt-2 min-w-0 break-words line-clamp-2 leading-snug" title={item.title}>{item.title}</h3>
        <div className="mt-3 flex items-center">
          <IssueTypeIcon item={item} />
          <span className="type-caption ml-2 min-w-0 break-words">{kindLabel(item)}</span>
          <span className="ml-2">
            <PriorityMark priority={item.priority} />
          </span>
          {item.storyPoints != null ? (
            <span className="type-caption ml-2">{item.storyPoints} 点</span>
          ) : null}
          <span className="ml-auto">
            <PersonAvatar person={assignee} />
          </span>
        </div>
      </button>
    </article>
  );
}
