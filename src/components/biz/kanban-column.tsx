import type { ReactNode } from "react";
import type { ColumnId } from "@/lib/pm/domain";
import { toneDotClass, type StateTone } from "@/components/biz/state-tone";
import { cn } from "@/lib/utils";

export function KanbanColumn({
  id,
  sectionId,
  name,
  tone = "neutral",
  count,
  limit,
  over,
  empty,
  onDragOver,
  onDragLeave,
  onDrop,
  onLimit,
  children,
}: {
  id: ColumnId;
  sectionId?: string;
  name: string;
  tone?: StateTone;
  count: number;
  limit?: number;
  over: boolean;
  empty: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onLimit?: (limit: number | null) => void;
  children: ReactNode;
}) {
  const overLimit = limit != null && limit > 0 && count > limit;
  return (
    <section
      id={sectionId}
      data-board-column={id}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-sm bg-line/70 px-2 pt-2 md:w-auto md:min-w-56 md:flex-1",
        over && "ring-2 ring-primary",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center justify-between gap-2 px-1 py-1">
        <h2 tabIndex={-1} className="type-overline flex min-w-0 items-center gap-1.5">
          <span className={cn("size-2 rounded-full", toneDotClass[tone])} aria-hidden="true" />
          <span className="truncate">{name}</span>
        </h2>
        <span className="flex items-center gap-1">
          <span className={cn("type-caption", overLimit && "text-danger")}>
            {limit ? `${count}/${limit}` : count}
          </span>
          {onLimit ? (
            <input
              aria-label={`${name}上限`}
              inputMode="numeric"
              placeholder="上限"
              defaultValue={limit ?? ""}
              key={limit ?? "none"}
              className="type-caption w-10 rounded-sm border border-transparent bg-transparent text-right outline-none focus:border-border"
              onBlur={(event) => {
                const raw = event.target.value.trim();
                const next = raw === "" ? null : Number(raw);
                if (next != null && (!Number.isFinite(next) || next < 0)) return;
                onLimit(next);
              }}
            />
          ) : null}
        </span>
      </header>
      <div
        data-pm-column={id}
        className="mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2"
      >
        {empty ? <div className="type-caption px-2 py-6 text-center">这一列还没有事项</div> : null}
        {children}
      </div>
    </section>
  );
}
