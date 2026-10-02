import type { Person, WorkItem } from "@/lib/pm/domain";
import { statusLabel } from "@/lib/pm/domain";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { PriorityMark } from "@/components/biz/priority-mark";

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
        <span className="mt-0.5 flex items-baseline gap-2">
          <span className="type-link shrink-0">{item.key}</span>
          <h3 className="type-body min-w-0 flex-1 truncate leading-snug">{item.title}</h3>
        </span>
        {!draggable ? (
          <p className="type-caption mt-1">{statusLabel(item.kind, item.status)}</p>
        ) : null}
        <div className="mt-3 flex items-center">
          <IssueTypeIcon item={item} />
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
