import { useId, useState } from "react";
import type { ColumnId, Person, WorkItem } from "@/lib/pm/domain";
import { COLUMNS, columnOf } from "@/lib/pm/domain";
import { columnTone } from "@/components/biz/state-tone";
import { IssueCard } from "@/components/biz/issue-card";
import { KanbanColumn } from "@/components/biz/kanban-column";

export function KanbanBoard({
  items,
  cancelledItems = [],
  showCancelled = false,
  people,
  onOpen,
  onMove,
}: {
  items: WorkItem[];
  cancelledItems?: WorkItem[];
  showCancelled?: boolean;
  people: Person[];
  onOpen: (id: string) => void;
  onMove: (id: string, column: ColumnId) => void;
}) {
  const [over, setOver] = useState<ColumnId | null>(null);
  const cancelledHeadingId = useId();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full gap-3">
          {COLUMNS.map((column) => {
            const cards = items.filter((item) => columnOf(item.kind, item.status) === column.id);
            return (
              <KanbanColumn
                key={column.id}
                name={column.name}
                tone={columnTone(column.id)}
                count={cards.length}
                over={over === column.id}
                empty={cards.length === 0}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(column.id);
                }}
                onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(null);
                  const id = event.dataTransfer.getData("text/plain");
                  const item = items.find((entry) => entry.id === id);
                  if (!item || columnOf(item.kind, item.status) === "cancelled") return;
                  onMove(id, column.id);
                }}
              >
                {cards.map((item) => (
                  <IssueCard key={item.id} item={item} assignee={people.find((person) => person.id === item.assigneeId)} onOpen={onOpen} />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </div>
      {showCancelled ? (
        <section aria-labelledby={cancelledHeadingId} className="max-h-56 shrink-0 overflow-y-auto rounded-sm bg-line/70 p-3">
          <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={cancelledHeadingId} className="type-overline">已取消 / 已拒绝 <span className="type-caption">{cancelledItems.length}</span></h2>
            <p className="type-caption">此区域只读，不支持拖拽；点击事项查看详情</p>
          </header>
          {cancelledItems.length === 0 ? (
            <p className="type-caption py-2">当前筛选下没有已取消或已拒绝的事项</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cancelledItems.map((item) => (
                <IssueCard key={item.id} item={item} assignee={people.find((person) => person.id === item.assigneeId)} onOpen={onOpen} draggable={false} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
