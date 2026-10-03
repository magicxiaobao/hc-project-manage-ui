import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import type { ColumnId, Person, WorkItem } from "@/lib/pm/domain";
import { StatusChip } from "@/components/biz/status-chip";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { PriorityMark } from "@/components/biz/priority-mark";
import { columnOf, kindLabel } from "@/lib/pm/domain";

export function IssueCard({
  item,
  assignee,
  parentKey,
  onOpen,
  moves = [],
  onMoveTo,
  commentCount = 0,
  childDone = 0,
  childTotal = 0,
  dragAttributes,
  dragListeners,
}: {
  item: WorkItem;
  assignee?: Person | null;
  parentKey?: string;
  onOpen: (id: string) => void;
  moves?: { id: ColumnId; name: string }[];
  onMoveTo?: (column: ColumnId) => void;
  commentCount?: number;
  childDone?: number;
  childTotal?: number;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const [menu, setMenu] = useState(false);
  const overdue = Boolean(item.dueDate) && item.dueDate! < localDay() && columnOf(item.kind, item.status) !== "done";
  return (
    <article className="relative rounded-sm bg-surface px-3 py-2.5 shadow-card">
      {moves.length > 0 && onMoveTo ? (
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            aria-expanded={menu}
            aria-label={`${item.key} 移动到其他列`}
            className="type-caption rounded-sm border border-border bg-surface px-1.5 py-0.5 transition duration-200 ease-out hover:-translate-y-px hover:border-primary hover:shadow-[0_3px_8px_color-mix(in_srgb,var(--color-scrim)_18%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            onClick={(event) => {
              event.stopPropagation();
              setMenu((open) => !open);
            }}
          >
            移动
          </button>
          {menu ? (
            <div className="absolute right-0 mt-1 min-w-24 rounded-sm border border-border bg-surface p-1 shadow-pop">
              {moves.map((move) => (
                <button
                  key={move.id}
                  type="button"
                  className="type-caption block w-full rounded-sm px-2 py-1 text-left hover:bg-line"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenu(false);
                    onMoveTo(move.id);
                  }}
                >
                  {move.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        data-focus-key={`item-card:${item.id}`}
        type="button"
        className={`w-full text-left ${dragListeners ? "cursor-grab active:cursor-grabbing" : ""}`}
        onClick={() => onOpen(item.id)}
        {...dragAttributes}
        {...dragListeners}
      >
        {parentKey ? <span className="type-caption block truncate">{parentKey}</span> : null}
        <span className="mt-0.5 flex flex-wrap items-center gap-2 pr-10">
          <span className="type-key shrink-0">{item.key}</span>
          <StatusChip kind={item.kind} status={item.status} />
        </span>
        <h3 className="type-body mt-2 min-w-0 break-words line-clamp-2 leading-snug" title={item.title}>
          {item.title}
        </h3>
        <div className="mt-3 flex items-center">
          <IssueTypeIcon item={item} />
          <span className="type-caption ml-2 min-w-0 break-words">{kindLabel(item)}</span>
          <span className="ml-2">
            <PriorityMark priority={item.priority} />
          </span>
          {item.storyPoints != null ? <span className="type-caption ml-2">{item.storyPoints} 点</span> : null}
          <span className="ml-auto">
            <PersonAvatar person={assignee} />
          </span>
        </div>
        {item.dueDate || commentCount > 0 || childTotal > 0 ? (
          <div className="type-caption mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.dueDate ? <span className={overdue ? "text-danger" : undefined}>{item.dueDate.slice(5, 10)} 到期</span> : null}
            {commentCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" aria-hidden="true" />
                {commentCount}
              </span>
            ) : null}
            {childTotal > 0 ? (
              <span>
                子事项 {childDone}/{childTotal}
              </span>
            ) : null}
          </div>
        ) : null}
      </button>
    </article>
  );
}

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
