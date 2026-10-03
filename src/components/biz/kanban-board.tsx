import { useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import type { ColumnId, ItemKind, Person, WorkItem } from "@/lib/pm/domain";
import { COLUMNS, byRank, columnOf, nextStatuses } from "@/lib/pm/domain";
import { columnTone } from "@/components/biz/state-tone";
import { IssueCard } from "@/components/biz/issue-card";
import { KanbanColumn } from "@/components/biz/kanban-column";

const COLUMN_IDS = new Set<string>(COLUMNS.map((column) => column.id));

export function KanbanBoard({
  items,
  catalog,
  comments = [],
  cancelledItems = [],
  showCancelled = false,
  people,
  limits,
  lockedKind,
  onOpen,
  onMove,
  onLimit,
  onCreate,
}: {
  items: WorkItem[];
  catalog?: WorkItem[];
  comments?: { itemId: string }[];
  cancelledItems?: WorkItem[];
  showCancelled?: boolean;
  people: Person[];
  limits?: Partial<Record<ColumnId, number>>;
  lockedKind?: ItemKind;
  onOpen: (id: string) => void;
  onMove: (
    id: string,
    column: ColumnId,
    beforeId: string | null,
  ) => { ok: true } | { ok: false; message: string };
  onLimit?: (column: ColumnId, limit: number | null) => void;
  onCreate?: (column: "todo" | "doing", kind: ItemKind, title: string) => void;
}) {
  const [over, setOver] = useState<ColumnId | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const cancelledHeadingId = useId();
  const columnPrefix = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const lookup = catalog ?? items;
  const byId = new Map(lookup.map((item) => [item.id, item]));
  const commentCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) counts.set(comment.itemId, (counts.get(comment.itemId) ?? 0) + 1);
    return counts;
  }, [comments]);
  const childStats = useMemo(() => {
    const stats = new Map<string, { done: number; total: number }>();
    for (const item of lookup) {
      if (!item.parentId) continue;
      const current = stats.get(item.parentId) ?? { done: 0, total: 0 };
      current.total += 1;
      if (columnOf(item.kind, item.status) === "done") current.done += 1;
      stats.set(item.parentId, current);
    }
    return stats;
  }, [lookup]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));
  const cardsByColumn = (column: ColumnId) => items.filter((item) => columnOf(item.kind, item.status) === column).sort(byRank);

  function columnOfId(id: string): ColumnId | null {
    if (COLUMN_IDS.has(id)) return id as ColumnId;
    const item = items.find((entry) => entry.id === id);
    if (!item) return null;
    const column = columnOf(item.kind, item.status);
    return column === "cancelled" ? null : column;
  }

  function finishDrag(event: DragEndEvent) {
    setActiveId(null);
    setOver(null);
    const active = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || overId === active) return;
    const from = columnOfId(active);
    const to = columnOfId(overId);
    if (!from || !to) return;
    let beforeId: string | null = COLUMN_IDS.has(overId) ? null : overId;
    if (from === to && beforeId) {
      const cards = cardsByColumn(from);
      const activeIndex = cards.findIndex((item) => item.id === active);
      const overIndex = cards.findIndex((item) => item.id === beforeId);
      if (activeIndex >= 0 && overIndex >= 0 && activeIndex < overIndex) {
        beforeId = cards[overIndex + 1]?.id ?? null;
      }
    }
    const result = onMove(active, to, beforeId);
    if (!result.ok) toast(result.message);
  }

  const activeItem = activeId ? items.find((item) => item.id === activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragOver={(event: DragOverEvent) => setOver(event.over ? columnOfId(String(event.over.id)) : null)}
      onDragCancel={() => {
        setActiveId(null);
        setOver(null);
      }}
      onDragEnd={finishDrag}
    >
      <div className="pm-kanban-board flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
        <nav aria-label="看板列" className="flex shrink-0 flex-wrap items-center gap-2 xl:hidden">
          {COLUMNS.map((column) => {
            const count = cardsByColumn(column.id).length;
            return (
              <button
                key={column.id}
                type="button"
                aria-controls={`${columnPrefix}-${column.id}`}
                aria-label={`查看${column.name}列，${count}项`}
                className="type-body rounded-sm border border-border bg-surface px-3 py-2"
                onClick={() => {
                  const viewport = scroller.current;
                  const target = viewport?.querySelector<HTMLElement>(`[data-board-column="${column.id}"]`);
                  if (!viewport || !target) return;
                  viewport.scrollTo({ left: target.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft });
                  target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
                }}
              >
                {column.name} · {count}
              </button>
            );
          })}
          <span className="type-meta basis-full">左右滚动或选择列查看全部事项</span>
        </nav>
        <div ref={scroller} data-pm-board-scroll className="min-h-0 flex-1 overflow-x-auto">
          <div className="flex h-full gap-3">
            {COLUMNS.map((column) => {
              const cards = cardsByColumn(column.id);
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
                  footer={
                    onCreate && (column.id === "todo" || (column.id === "doing" && lockedKind !== "defect" && lockedKind !== "requirement")) ? (
                      <ColumnComposer
                        column={column.id}
                        lockedKind={lockedKind}
                        onCreate={onCreate}
                      />
                    ) : null
                  }
                >
                  <SortableContext items={cards.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    {cards.map((item) => (
                      <SortableIssueCard
                        key={item.id}
                        item={item}
                        parentKey={byId.get(item.parentId ?? "")?.key}
                        assignee={people.find((person) => person.id === item.assigneeId)}
                        commentCount={commentCount.get(item.id) ?? 0}
                        childDone={childStats.get(item.id)?.done ?? 0}
                        childTotal={childStats.get(item.id)?.total ?? 0}
                        onOpen={onOpen}
                        onMoveTo={(target) => {
                          const result = onMove(item.id, target, null);
                          if (!result.ok) toast(result.message);
                        }}
                      />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>
        </div>
        {showCancelled ? (
          <section aria-labelledby={cancelledHeadingId} className="max-h-56 shrink-0 overflow-y-auto rounded-sm bg-line/70 p-3">
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
                    commentCount={commentCount.get(item.id) ?? 0}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="w-64 opacity-90">
            <IssueCard item={activeItem} assignee={people.find((person) => person.id === activeItem.assigneeId)} onOpen={() => undefined} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableIssueCard({
  item,
  onMoveTo,
  ...props
}: {
  item: WorkItem;
  parentKey?: string;
  assignee?: Person | null;
  commentCount: number;
  childDone: number;
  childTotal: number;
  onOpen: (id: string) => void;
  onMoveTo: (column: ColumnId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const current = columnOf(item.kind, item.status);
  const moves = [...new Set(nextStatuses(item).map((status) => columnOf(item.kind, status)))]
    .filter((column): column is ColumnId => column !== "cancelled" && column !== current)
    .map((id) => ({ id, name: COLUMNS.find((column) => column.id === id)?.name ?? id }));
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.45 : undefined }}>
      <IssueCard item={item} moves={moves} onMoveTo={onMoveTo} dragAttributes={attributes} dragListeners={listeners} {...props} />
    </div>
  );
}

function ColumnComposer({
  column,
  lockedKind,
  onCreate,
}: {
  column: "todo" | "doing";
  lockedKind?: ItemKind;
  onCreate: (column: "todo" | "doing", kind: ItemKind, title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>(lockedKind ?? (column === "doing" ? "task" : "task"));
  const kinds: ItemKind[] = column === "doing" ? ["task"] : lockedKind ? [lockedKind] : ["requirement", "task", "defect"];
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const next = title.trim();
        if (!next) return;
        onCreate(column, lockedKind ?? kind, next);
        setTitle("");
      }}
    >
      <input
        aria-label={`在${column === "todo" ? "待办" : "进行中"}添加`}
        value={title}
        placeholder={column === "doing" ? "添加任务" : "添加事项"}
        className="type-caption h-8 w-full rounded-sm border border-border bg-surface px-2"
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className="flex items-center gap-1">
        {kinds.length > 1 ? (
          <select aria-label="新建类型" className="type-caption h-7 rounded-sm border border-border bg-surface px-1" value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}>
            <option value="requirement">需求</option>
            <option value="task">任务</option>
            <option value="defect">缺陷</option>
          </select>
        ) : (
          <span className="type-caption">{column === "doing" ? "直接进入进行中" : kinds[0] === "defect" ? "缺陷" : kinds[0] === "requirement" ? "需求" : "任务"}</span>
        )}
        <button type="submit" className="type-link ml-auto">
          添加
        </button>
      </div>
    </form>
  );
}
