import type { ReactNode } from "react";
import type { ColumnId } from "@/lib/pm/domain";
import { toneDotClass, type StateTone } from "@/components/biz/state-tone";
import { cn } from "@/lib/utils";

export function KanbanColumn({
  id,
  name,
  tone = "neutral",
  count,
  over,
  empty,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  id: ColumnId;
  name: string;
  tone?: StateTone;
  count: number;
  over: boolean;
  empty: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("flex h-full w-72 shrink-0 flex-col rounded-sm bg-line/70 px-2 pt-2 md:w-auto md:min-w-56 md:flex-1", over && "ring-2 ring-primary")}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center justify-between px-1 py-1">
        <h2 className="type-overline flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", toneDotClass[tone])} aria-hidden="true" />
          {name}
        </h2>
        <span className="type-caption">{count}</span>
      </header>
      <div data-pm-column={id} className="mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {empty ? <div className="type-caption px-2 py-6 text-center">这一列还没有事项</div> : null}
        {children}
      </div>
    </section>
  );
}
