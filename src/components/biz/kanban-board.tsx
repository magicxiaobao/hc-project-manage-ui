import { useState } from "react";
import { toast } from "sonner";
import type { ColumnId, Person, WorkItem } from "@/lib/pm/domain";
import { byRank, COLUMNS, columnOf } from "@/lib/pm/domain";
import { columnTone } from "@/components/biz/state-tone";
import { IssueCard } from "@/components/biz/issue-card";
import { KanbanColumn } from "@/components/biz/kanban-column";

export function KanbanBoard({
  items,
  catalog,
  people,
  limits,
  onOpen,
  onMove,
  onLimit,
}: {
  items: WorkItem[];
  catalog?: WorkItem[];
  people: Person[];
  limits?: Partial<Record<ColumnId, number>>;
  onOpen: (id: string) => void;
  onMove: (id: string, column: ColumnId, beforeId: string | null) => { ok: true } | { ok: false; message: string };
  onLimit?: (column: ColumnId, limit: number | null) => void;
}) {
  const [over, setOver] = useState<ColumnId | null>(null);
  const byId = new Map((catalog ?? items).map((item) => [item.id, item]));
  return (
    <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-4">
      <div className="flex h-full gap-3">
        {COLUMNS.map((column) => {
          const cards = items.filter((item) => columnOf(item.kind, item.status) === column.id).sort(byRank);
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
  );
}