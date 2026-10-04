/**
 * 任务看板（P3：p3-board-kanban）。
 *
 * 路由 /p/$projectKey/boards/$boardId，对标老前端 views/board/TaskBoard.vue。
 *
 * 数据：GET /boardColumn/v1/board/{boardId}/columnsWithTasks（列+卡片），
 * 解析见 src/lib/board-kanban.ts（后端拼装证据见 BoardColumnServiceImpl）。
 *
 * 能力：
 * - 列新增/编辑（BoardColumnFormDialog：taskStatus 映射/wipLimit/color）/
 *   删除（POST delete/{id}，物理删除；确认框说明后果）；
 * - 列拖拽排序（POST reorder {ids}，乐观更新+失败回滚）；
 * - 卡片跨列拖拽 → POST task/v1/updateStatus {taskId, status: 目标列.taskStatus}
 *   走后端状态机；前端先按 TASK_TRANSITIONS_BY_STATUS 拦截非法流转，
 *   PAUSED/CANCELLED/COMPLETED/重开 需收集流转文本（后端 requireText 硬要求），
 *   失败时乐观更新经 refetch 回滚；
 * - 同列拖拽不动作（后端无列内排序语义）；
 * - WIP 上限只做展示（列头 count/limit，超限标红，不拦截）。
 *
 * 与老前端差异（有意简化，见 impl report）：
 * - TODO→IN_PROGRESS 不做执行人确认/代操作原因（老前端 collectTransitionContext），
 *   assigneeId 不下发，后端 start 接受 null；
 * - 无离线缓存/撤销拖拽（老前端的拖拽快照+撤销仅本地体验增强）。
 */
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  StateChip,
} from "@/components/biz";
import { itemStatusTone } from "@/components/biz/state-tone";
import { statusLabel } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/api/task-types";
import {
  buildCardTransitionContext,
  cardTransitionNeedsText,
  moveCardInColumns,
  type KanbanBoardCard,
  type KanbanBoardColumn,
} from "@/lib/board-kanban";
import { editFormFromColumn } from "@/lib/board-column-form";
import {
  invalidateBoardDomain,
  normalizeBoardColumnsParams,
  queryKeys,
  toUserMessage,
  useBoardColumnsWithTasks,
  useBoardDetail,
  useDeleteBoardColumn,
  useReorderBoardColumns,
  useUpdateTaskStatus,
  taskTransitionTargets,
} from "@/lib/query";
import { useQueryClient } from "@tanstack/react-query";
import { BoardColumnFormDialog } from "@/components/pm/board-column-form-dialog";
import { TaskTransitionReasonDialog } from "@/components/pm/task-transition-reason-dialog";

const columnDragId = (id: number) => `column:${id}`;
const cardDragId = (id: number) => `card:${id}`;

function parseDragId(raw: string, prefix: "column" | "card"): number | null {
  if (!raw.startsWith(`${prefix}:`)) return null;
  const id = Number(raw.slice(prefix.length + 1));
  return Number.isInteger(id) && id > 0 ? id : null;
}

type FormDialogState =
  | { mode: "create" }
  | { mode: "edit"; columnId: number; column: KanbanBoardColumn };

interface PendingCardMove {
  card: KanbanBoardCard;
  fromColumnId: number;
  toColumnId: number;
  toStatus: TaskStatus;
}

export function TaskBoardLive({
  boardId,
  projectKey,
}: {
  boardId: number;
  projectKey: string;
}) {
  const queryClient = useQueryClient();
  const boardDetail = useBoardDetail(boardId);
  const columnsQuery = useBoardColumnsWithTasks(boardId);
  const reorderColumns = useReorderBoardColumns();
  const deleteColumn = useDeleteBoardColumn();
  const updateStatus = useUpdateTaskStatus();

  const columns = useMemo(() => columnsQuery.data ?? [], [columnsQuery.data]);

  const [activeColumn, setActiveColumn] = useState<KanbanBoardColumn | null>(null);
  const [activeCard, setActiveCard] = useState<KanbanBoardCard | null>(null);
  const [formDialog, setFormDialog] = useState<FormDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KanbanBoardColumn | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingCardMove | null>(null);
  // 在途流转的卡片 id：禁用重复拖拽
  const [movingCardIds, setMovingCardIds] = useState<ReadonlySet<number>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
  );

  const columnsKey = queryKeys.board.list(normalizeBoardColumnsParams(boardId));

  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const cardColumnOf = (cardId: number) =>
    columns.find((column) => column.tasks.some((task) => task.id === cardId)) ?? null;

  function handleDragStart(event: DragStartEvent) {
    const kind = event.active.data.current?.kind;
    if (kind === "column") {
      const id = parseDragId(String(event.active.id), "column");
      setActiveColumn(id != null ? (columnById.get(id) ?? null) : null);
    } else if (kind === "card") {
      const id = parseDragId(String(event.active.id), "card");
      const column = id != null ? cardColumnOf(id) : null;
      setActiveCard(
        id != null ? (column?.tasks.find((task) => task.id === id) ?? null) : null,
      );
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveCard(null);
    const kind = event.active.data.current?.kind;
    if (kind === "column") handleColumnDrop(event);
    else if (kind === "card") handleCardDrop(event);
  }

  /** 列拖拽排序：位置变化才发 POST reorder（乐观更新，失败 refetch 回滚） */
  function handleColumnDrop(event: DragEndEvent) {
    const fromId = parseDragId(String(event.active.id), "column");
    if (fromId == null || !event.over) return;
    // 列拖拽落在卡片上时忽略（closestCorners 可能返回卡片）
    const toId = parseDragId(String(event.over.id), "column");
    if (toId == null || toId === fromId) return;
    const fromIndex = columns.findIndex((column) => column.id === fromId);
    const toIndex = columns.findIndex((column) => column.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const next = arrayMove(columns, fromIndex, toIndex);
    const nextIds = next.map((column) => column.id);
    void queryClient.cancelQueries({ queryKey: columnsKey });
    queryClient.setQueryData(columnsKey, next);
    reorderColumns.mutate(nextIds, {
      onError: (error) => {
        toast.error(`列排序失败：${toUserMessage(error)}，已恢复原顺序`);
        invalidateBoardDomain(queryClient);
      },
    });
  }

  /**
   * 卡片跨列拖拽：
   * - 同列 → 不动作（后端无列内排序语义）；
   * - 目标列未映射任务状态 → 拦截并提示；
   * - 状态机拓扑不允许 → 前端拦截并提示；
   * - 需流转文本（暂停/取消/完成/重开）→ 弹收集弹窗；
   * - 否则直接乐观更新 + updateStatus。
   */
  function handleCardDrop(event: DragEndEvent) {
    const cardId = parseDragId(String(event.active.id), "card");
    if (cardId == null || !event.over) return;
    if (movingCardIds.has(cardId)) return;
    const fromColumn = cardColumnOf(cardId);
    if (!fromColumn) return;
    const overId = String(event.over.id);
    let toColumn: KanbanBoardColumn | null = null;
    const overCardId = parseDragId(overId, "card");
    if (overCardId != null) {
      toColumn = cardColumnOf(overCardId);
    } else {
      const overColumnId = parseDragId(overId, "column");
      toColumn = overColumnId != null ? (columnById.get(overColumnId) ?? null) : null;
    }
    if (!toColumn) return;
    // 同列拖拽不动作
    if (toColumn.id === fromColumn.id) return;
    const card = fromColumn.tasks.find((task) => task.id === cardId);
    if (!card) return;
    const toStatus = toColumn.taskStatus;
    if (toStatus == null) {
      toast.error(`「${toColumn.columnName}」未映射任务状态，无法流转`);
      return;
    }
    if (toStatus === card.status) return;
    if (!taskTransitionTargets(card.status).includes(toStatus)) {
      toast.error(
        `非法流转：${statusLabel("task", card.status)} → ${statusLabel("task", toStatus)}，任务状态机不允许`,
      );
      return;
    }
    if (cardTransitionNeedsText(card.status, toStatus)) {
      setPendingMove({
        card,
        fromColumnId: fromColumn.id,
        toColumnId: toColumn.id,
        toStatus,
      });
      return;
    }
    executeCardMove(card, toColumn.id, toStatus, {});
  }

  /**
   * 执行卡片流转：乐观把卡片搬到目标列末尾 → POST task/v1/updateStatus；
   * 失败时 toast + 失效看板域缓存（refetch 回滚乐观更新）。
   */
  function executeCardMove(
    card: KanbanBoardCard,
    toColumnId: number,
    toStatus: TaskStatus,
    context: { reason?: string; deliverables?: string },
  ) {
    setMovingCardIds((current) => new Set(current).add(card.id));
    void queryClient.cancelQueries({ queryKey: columnsKey });
    queryClient.setQueryData(columnsKey, (old: KanbanBoardColumn[] | undefined) =>
      old ? moveCardInColumns(old, card.id, toColumnId) : old,
    );
    updateStatus.mutate(
      { taskId: card.id, status: toStatus, ...context },
      {
        onSuccess: () => {
          toast.success(
            `任务「${card.title || `#${card.id}`}」已流转为${statusLabel("task", toStatus)}`,
          );
          invalidateBoardDomain(queryClient);
        },
        onError: (error) => {
          toast.error(`流转失败：${toUserMessage(error)}，已回滚`);
          // 回滚：乐观更新失效，重新拉取后端权威数据
          invalidateBoardDomain(queryClient);
        },
        onSettled: () => {
          setMovingCardIds((current) => {
            const next = new Set(current);
            next.delete(card.id);
            return next;
          });
        },
      },
    );
  }

  const confirmDeleteColumn = () => {
    const target = deleteTarget;
    if (!target || deleteColumn.isPending) return;
    deleteColumn.mutate(target.id, {
      onSuccess: () => {
        toast.success(`看板列「${target.columnName}」已删除`);
        setDeleteTarget(null);
      },
      onError: (error) => {
        toast.error(`删除失败：${toUserMessage(error)}`);
      },
    });
  };

  if (boardDetail.isPending || columnsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载看板…
      </div>
    );
  }

  if (boardDetail.isError || columnsQuery.isError) {
    const error = boardDetail.error ?? columnsQuery.error;
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">看板加载失败：{toUserMessage(error)}</p>
        <Button
          variant="ghost"
          onPress={() => {
            void boardDetail.refetch();
            void columnsQuery.refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  }

  const boardName = boardDetail.data?.boardName ?? `看板 #${boardId}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Link
          to="/p/$projectKey/boards"
          params={{ projectKey }}
          className="type-link"
        >
          ← 看板列表
        </Link>
        <h1 className="type-title min-w-0 flex-1 truncate">{boardName}</h1>
        <Button
          variant="primary"
          size="sm"
          onPress={() => setFormDialog({ mode: "create" })}
        >
          新建列
        </Button>
      </div>
      {columns.length === 0 ? (
        <div className="px-4">
          <EmptyHint>
            这个看板还没有列。先新建一列并映射任务状态，任务卡片才会出现。
          </EmptyHint>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveColumn(null);
            setActiveCard(null);
          }}
        >
          <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-4">
            <SortableContext
              items={columns.map((column) => columnDragId(column.id))}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full items-stretch gap-3">
                {columns.map((column) => (
                  <SortableBoardColumn
                    key={column.id}
                    column={column}
                    disabled={movingCardIds}
                    onEdit={() =>
                      setFormDialog({ mode: "edit", columnId: column.id, column })
                    }
                    onDelete={() => setDeleteTarget(column)}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
          <DragOverlay>
            {activeColumn ? (
              <div className="w-72 opacity-90">
                <ColumnShell column={activeColumn} preview />
              </div>
            ) : activeCard ? (
              <div className="w-64 opacity-90">
                <CardView card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {formDialog ? (
        <BoardColumnFormDialog
          key={formDialog.mode === "edit" ? `edit-${formDialog.columnId}` : "create"}
          open
          boardId={boardId}
          mode={formDialog.mode}
          columnId={formDialog.mode === "edit" ? formDialog.columnId : undefined}
          initial={
            formDialog.mode === "edit" ? editFormFromColumn(formDialog.column) : undefined
          }
          onClose={() => setFormDialog(null)}
        />
      ) : null}

      <AppModal
        open={deleteTarget != null}
        title="删除看板列"
        onClose={() => {
          if (!deleteColumn.isPending) setDeleteTarget(null);
        }}
        size="sm"
      >
        <p className="type-body">
          确定删除列「{deleteTarget?.columnName}」（#{deleteTarget?.id}）吗？
          删除是物理删除；该列原有的卡片将不再显示在看板上（任务本身不受影响，
          新建映射同名状态的列可恢复显示）。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onPress={() => setDeleteTarget(null)}
            isDisabled={deleteColumn.isPending}
          >
            取消
          </Button>
          <Button
            variant="danger"
            onPress={confirmDeleteColumn}
            isDisabled={deleteColumn.isPending}
          >
            {deleteColumn.isPending ? <Spinner size="sm" /> : null}
            确认删除
          </Button>
        </div>
      </AppModal>

      {pendingMove ? (
        <TaskTransitionReasonDialog
          key={`move-${pendingMove.card.id}-${pendingMove.toColumnId}`}
          open
          taskTitle={pendingMove.card.title}
          from={pendingMove.card.status}
          to={pendingMove.toStatus}
          isPending={updateStatus.isPending}
          onCancel={() => {
            if (!updateStatus.isPending) setPendingMove(null);
          }}
          onConfirm={(text) => {
            const move = pendingMove;
            setPendingMove(null);
            executeCardMove(
              move.card,
              move.toColumnId,
              move.toStatus,
              buildCardTransitionContext(move.toStatus, text),
            );
          }}
        />
      ) : null}
    </div>
  );
}

function SortableBoardColumn({
  column,
  disabled,
  onEdit,
  onDelete,
}: {
  column: KanbanBoardColumn;
  /** 在途流转中的卡片 id 集合（其卡片禁用拖拽） */
  disabled: ReadonlySet<number>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: columnDragId(column.id),
    data: { kind: "column", columnId: column.id },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
      {...attributes}
    >
      <ColumnShell
        column={column}
        dragListeners={listeners}
        disabled={disabled}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

function ColumnShell({
  column,
  preview = false,
  dragListeners,
  disabled,
  onEdit,
  onDelete,
}: {
  column: KanbanBoardColumn;
  preview?: boolean;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  disabled?: ReadonlySet<number>;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const wipLimit = column.wipLimit != null && column.wipLimit > 0 ? column.wipLimit : null;
  const count = column.tasks.length;
  const overLimit = wipLimit != null && count > wipLimit;
  return (
    <section
      aria-label={`看板列：${column.columnName}`}
      className="flex h-full max-h-full w-72 max-w-full shrink-0 flex-col rounded-sm bg-line/70 px-2 pt-2 md:w-80"
    >
      <header className="flex items-center gap-1.5 px-1 py-1">
        {/* 列拖拽手柄：只有手柄可拖列，避免与卡片拖拽/按钮点击冲突 */}
        {dragListeners && !preview ? (
          <button
            type="button"
            aria-label={`拖拽排序列「${column.columnName}」`}
            className="cursor-grab touch-none text-default-400 hover:text-default-600"
            {...dragListeners}
          >
            ⋮⋮
          </button>
        ) : null}
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: column.color ?? "#6B7280" }}
        />
        <h2 className="type-overline min-w-0 flex-1 truncate">{column.columnName}</h2>
        {column.taskStatus ? (
          <span className="type-caption shrink-0 text-default-400">
            {statusLabel("task", column.taskStatus)}
          </span>
        ) : (
          <span className="type-caption shrink-0 text-default-400">未映射</span>
        )}
        <span
          className={cn(
            "type-caption shrink-0",
            overLimit ? "font-semibold text-danger" : "text-default-500",
          )}
          title={wipLimit != null ? `WIP 上限 ${wipLimit}（仅展示，不拦截）` : undefined}
        >
          {wipLimit != null ? `${count}/${wipLimit}` : count}
        </span>
        {!preview && onEdit && onDelete ? (
          <span className="flex shrink-0 gap-1">
            <button type="button" className="type-link" onClick={onEdit}>
              编辑
            </button>
            <button type="button" className="type-link text-danger" onClick={onDelete}>
              删除
            </button>
          </span>
        ) : null}
      </header>
      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {column.tasks.length === 0 ? (
          <div className="type-caption px-2 py-6 text-center text-default-400">
            {column.taskStatus ? "这一列还没有任务" : "未映射任务状态，不显示卡片"}
          </div>
        ) : (
          <SortableContext
            items={column.tasks.map((task) => cardDragId(task.id))}
            strategy={verticalListSortingStrategy}
          >
            {column.tasks.map((task) => (
              <SortableCard
                key={task.id}
                card={task}
                disabled={disabled?.has(task.id) ?? false}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </section>
  );
}

function SortableCard({
  card,
  disabled,
}: {
  card: KanbanBoardCard;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cardDragId(card.id),
    data: { kind: "card", cardId: card.id },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <CardView card={card} />
    </div>
  );
}

function CardView({ card }: { card: KanbanBoardCard }) {
  return (
    <article className="cursor-grab touch-none rounded-sm border border-border bg-surface p-2">
      <p className="type-body line-clamp-2">{card.title || `任务 #${card.id}`}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StateChip tone={itemStatusTone("task", card.status)}>
          {statusLabel("task", card.status)}
        </StateChip>
        {card.priority ? (
          <span className="type-caption text-default-500">{card.priority}</span>
        ) : null}
        {card.storyPoints != null ? (
          <span className="type-caption text-default-500">{card.storyPoints} 点</span>
        ) : null}
        {card.estimatedEndDate ? (
          <span className="type-caption text-default-500">
            截止 {card.estimatedEndDate.slice(0, 10)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
