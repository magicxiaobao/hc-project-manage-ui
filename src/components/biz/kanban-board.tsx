import { useState } from "react";
import { toast } from "sonner";
import type { ColumnId, Person, WorkItem } from "@/lib/pm/domain";
import { COLUMNS, columnOf } from "@/lib/pm/domain";
import { columnTone } from "@/components/biz/state-tone";
import { IssueCard } from "@/components/biz/issue-card";
import { KanbanColumn } from "@/components/biz/kanban-column";

export function KanbanBoard({
  items,
  people,
  onOpen,
  onMove,
}: {
  items: WorkItem[];
  people: Person[];
  onOpen: (id: string) => void;
  onMove: (id: string, column: ColumnId) => { ok: true } | { ok: false; message: string };
}) {
  const [over, setOver] = useState<ColumnId | null>(null);
  return (
    <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-4">
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
                if (!id) return;
                const result = onMove(id, column.id);
                if (!result.ok) toast(result.message);
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
  );
}
