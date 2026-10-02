import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { ColumnId, Person, WorkItem } from "@/lib/pm/domain";
import { byRank, COLUMNS, columnOf } from "@/lib/pm/domain";
import { columnTone } from "@/components/biz/state-tone";
import { IssueCard } from "@/components/biz/issue-card";
import { KanbanColumn } from "@/components/biz/kanban-column";

export function KanbanBoard({
  items,
  catalog,
  cancelledItems = [],
  showCancelled = false,
  people,
  limits,
  onOpen,
  onMove,
  onLimit,
}: {
  items: WorkItem[];
  catalog?: WorkItem[];
  cancelledItems?: WorkItem[];
  showCancelled?: boolean;
  people: Person[];
  limits?: Partial<Record<ColumnId, number>>;
  onOpen: (id: string) => void;
  onMove: (
    id: string,
    column: ColumnId,
    beforeId: string | null,
  ) => { ok: true } | { ok: false; message: string };
  onLimit?: (column: ColumnId, limit: number | null) => void;
}) {
  const [over, setOver] = useState<ColumnId | null>(null);
  const cancelledHeadingId = useId();
  const columnPrefix = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const byId = new Map((catalog ?? items).map((item) => [item.id, item]));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
      <nav aria-label="看板列" className="flex shrink-0 flex-wrap items-center gap-2 xl:hidden">
        {COLUMNS.map((column) => {
          const count = items.filter((item) => columnOf(item.kind, item.status) === column.id).length;
          return <button key={column.id} type="button" aria-controls={`${columnPrefix}-${column.id}`} aria-label={`查看${column.name}列，${count}项`} className="type-body rounded-sm border border-border bg-surface px-3 py-2" onClick={() => {
            const viewport = scroller.current;
            const target = viewport?.querySelector<HTMLElement>(`[data-board-column="${column.id}"]`);
            if (!viewport || !target) return;
            viewport.scrollTo({ left: target.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft });
            target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
          }}>{column.name} · {count}</button>;
        })}
        <span className="type-meta basis-full">左右滚动或选择列查看全部事项</span>
      </nav>
      <div ref={scroller} data-pm-board-scroll className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full gap-3">
          {COLUMNS.map((column) => {
            const cards = items
              .filter((item) => columnOf(item.kind, item.status) === column.id)
              .sort(byRank);
            const drop = (beforeId: string | null) => (event: React.DragEvent) => {
              event.preventDefault();
              setOver(null);
              const id = event.dataTransfer.getData("text/plain");
              if (!id) return;
              const result = onMove(id, column.id, beforeId);
              if (!result.ok) toast(result.message);
            };
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                sectionId={`${columnPrefix}-${column.id}`}
                name={column.name}
                tone={columnTone(column.id)}
                count={cards.length}
                limit={limits?.[column.id]}
                over={over === column.id}
                empty={cards.length === 0}
                onLimit={onLimit ? (limit) => onLimit(column.id, limit) : undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(column.id);
                }}
                onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
                onDrop={drop(null)}
              >
                {cards.map((item) => (
                  <IssueCard
                    key={item.id}
                    item={item}
                    parentKey={byId.get(item.parentId ?? "")?.key}
                    assignee={people.find((person) => person.id === item.assigneeId)}
                    onOpen={onOpen}
                    onDropBefore={(id) => {
                      const result = onMove(id, column.id, item.id);
                      if (!result.ok) toast(result.message);
                    }}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </div>
      {showCancelled ? (
        <section
          aria-labelledby={cancelledHeadingId}
          className="max-h-56 shrink-0 overflow-y-auto rounded-sm bg-line/70 p-3"
        >
          <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={cancelledHeadingId} className="type-overline">
              已取消 / 已拒绝 <span className="type-caption">{cancelledItems.length}</span>
            </h2>
            <p className="type-caption">此区域只读，不支持拖拽；点击事项查看详情</p>
          </header>
          {cancelledItems.length === 0 ? (
            <p className="type-caption py-2">当前筛选下没有已取消或已拒绝的事项</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cancelledItems.map((item) => (
                <IssueCard
                  key={item.id}
                  item={item}
                  assignee={people.find((person) => person.id === item.assigneeId)}
                  onOpen={onOpen}
                  draggable={false}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
