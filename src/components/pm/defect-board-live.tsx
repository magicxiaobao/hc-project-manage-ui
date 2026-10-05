/**
 * 缺陷看板（P2：p2-defect-board）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：GET /defect/v1/board?projectId=（全量非分页；defectsByStatus 按状态分组，
 *   空状态键缺失，消费端按 Partial 处理）与 GET /defect/v1/statistics?projectId=
 *   （统计卡：总/待处理/处理中/已解决，口径与老前端 DefectBoard.vue 一致）
 * - 列顺序/中文名/颜色一律取后端 columns（DefectBoardColumnCatalog 十态全等），
 *   不在前端硬编码；列计数按实际渲染卡片数（与后端 column.count 应一致）
 * - 卡片拖拽跨列：目标不在 defectTransitionTargets(当前状态) 内时 toast 拒绝
 *   （非法流转）；合法时打开 DefectTransitionDialog（预设目标），原因/执行人
 *   按后端规则必填，提交走 POST /defect/v1/updateStatus
 * - 卡片「流转」按钮打开同一弹窗（目标由弹窗内选择），保障键盘可达
 * - 同列内拖拽不做本地重排：后端看板无排序语义，本地重排会造成客户端与
 *   服务端状态偏离
 * - 流转成功后 useUpdateDefectStatus 的 onSuccess 失效 ['hc','defect'] 全部
 *   缓存（含 board/statistics/list/detail），看板与列表数据一致
 *
 * 未登录时不使用本组件（路由层处理）。
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint, PageHeading, PriorityMark, SeverityChip } from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import {
  defectTransitionTargets,
  toUserMessage,
  useDefectBoard,
  useDefectStatistics,
} from "@/lib/query";
import type {
  DefectBoardColumn,
  DefectResponse,
  DefectStatisticsResponse,
  DefectStatus,
} from "@/lib/api/defect-types";
import { DefectTransitionDialog } from "@/components/pm/defect-transition-dialog";
import { cardDndId, columnDndId, resolveBoardDropTarget } from "@/lib/defect-board";

/**
 * 看板碰撞检测：优先命中指针所在的列容器。
 * 空列/列顶部空白处只有列级 droppable，若只用 closestCorners，高列短卡片场景下
 * 源卡片的角距离可能小于相邻空列，合法跨列拖放会被误判为"同列不动作"吞掉
 * （Codex 本地评审 P2）。列内本就无排序语义，命中列即解析为该列状态；
 * 指针不在任何列内（如列间缝隙）时回退 closestCorners。
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const columnCollision = pointerWithin(args).find((collision) =>
    String(collision.id).startsWith("column:"),
  );
  if (columnCollision) return [columnCollision];
  return closestCorners(args);
};

interface TransitionRequest {
  defectId: number;
  fromStatus: string;
  /** null = 弹窗内由用户选择目标（卡片「流转」按钮入口） */
  target: DefectStatus | null;
  defectProjectId: number | null;
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-4 py-3">
      <div className="type-emphasis text-2xl">{value == null ? "—" : value}</div>
      <div className="type-caption text-default-500">{label}</div>
    </div>
  );
}

function DefectStatisticsCards({ projectId }: { projectId: number }) {
  const statsQuery = useDefectStatistics(projectId);
  const stats: DefectStatisticsResponse | undefined = statsQuery.data;

  return (
    <section aria-label="缺陷统计">
      {statsQuery.isError ? (
        <p className="type-body text-danger">
          缺陷统计加载失败：{toUserMessage(statsQuery.error)}
          <Button size="sm" variant="ghost" className="ml-2" onPress={() => void statsQuery.refetch()}>
            重试
          </Button>
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="总缺陷数" value={stats?.totalDefects ?? null} />
        <StatCard label="待处理缺陷" value={stats?.openDefects ?? null} />
        <StatCard label="处理中缺陷" value={stats?.inProgressDefects ?? null} />
        <StatCard label="已解决缺陷" value={stats?.resolvedDefects ?? null} />
      </div>
      {statsQuery.isPending ? (
        <p className="type-caption mt-1 text-default-500">正在加载统计…</p>
      ) : null}
    </section>
  );
}

function DefectBoardCard({
  defect,
  projectKey,
  onTransition,
}: {
  defect: DefectResponse;
  projectKey: string;
  onTransition: () => void;
}) {
  // 注意：只展开 listeners，不展开 attributes——attributes 含 role="button"/tabIndex，
  // 会让包着详情 <Link> 的 span 变成"可聚焦的假按钮"（键盘 Enter 无效、SR 朗读的
  // 键盘拖拽指令实际不存在，且形成交互元素嵌套）。手柄仅做指针拖拽，键盘入口为
  // 卡片「流转」按钮（弹窗内选目标）。
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDndId(defect.id),
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
    >
      <article
        className="rounded-sm border border-border bg-surface p-2.5"
        aria-label={`缺陷 #${defect.id} ${defect.title}`}
      >
        <div className="flex items-start gap-1.5">
          <span className="type-caption shrink-0 text-default-400">#{defect.id}</span>
          {/* 拖拽手柄：仅标题行可拖，避免与链接/按钮点击冲突（仅指针拖拽） */}
          <span
            {...listeners}
            className="min-w-0 flex-1 cursor-grab touch-none"
          >
            <Link
              to="/p/$projectKey/defects/$defectId"
              params={{ projectKey, defectId: String(defect.id) }}
              className="type-body block truncate underline-offset-2 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {defect.title}
            </Link>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SeverityChip severity={defect.severity} />
          <PriorityMark priority={defect.priority} />
          {defect.assigneeId != null ? (
            <span className="type-caption text-default-500">处理人 {defect.assigneeId}</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex justify-end">
          <Button size="sm" variant="ghost" onPress={onTransition}>
            流转
          </Button>
        </div>
      </article>
    </div>
  );
}

function DefectBoardColumnView({
  column,
  cards,
  projectKey,
  onCardTransition,
}: {
  column: DefectBoardColumn;
  cards: DefectResponse[];
  projectKey: string;
  onCardTransition: (defect: DefectResponse) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDndId(column.status) });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.name}列`}
      data-board-column={column.status}
      className={`flex h-full w-72 max-w-full shrink-0 flex-col rounded-sm bg-line/70 px-2 pt-2 md:w-auto md:min-w-56 md:flex-1 ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-2 px-1 py-1">
        <h2 className="type-overline flex min-w-0 items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: column.color }}
            aria-hidden="true"
          />
          <span className="truncate">{column.name}</span>
        </h2>
        <span className="type-caption">{cards.length}</span>
      </header>
      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {cards.length === 0 ? (
          <div className="type-caption px-2 py-6 text-center">这一列暂无缺陷</div>
        ) : null}
        <SortableContext items={cards.map((card) => cardDndId(card.id))} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <DefectBoardCard
              key={card.id}
              defect={card}
              projectKey={projectKey}
              onTransition={() => onCardTransition(card)}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  );
}

/** 列表/看板视图切换（defects/index 与 defects/board 共用） */
export function DefectViewTabs({
  projectKey,
  active,
}: {
  projectKey: string;
  active: "list" | "board";
}) {
  const tabClass = (isActive: boolean) =>
    `type-body rounded-sm px-3 py-1.5 ${isActive ? "bg-primary text-on-nav" : "text-default-500 hover:underline"}`;
  return (
    <nav aria-label="缺陷视图" className="flex gap-1">
      <Link
        to="/p/$projectKey/defects"
        params={{ projectKey }}
        className={tabClass(active === "list")}
      >
        列表
      </Link>
      <Link
        to="/p/$projectKey/defects/board"
        params={{ projectKey }}
        className={tabClass(active === "board")}
      >
        看板
      </Link>
    </nav>
  );
}

export function DefectBoardLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const boardQuery = useDefectBoard(projectId);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [transition, setTransition] = useState<TransitionRequest | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const board = boardQuery.data;
  const byId = useMemo(() => {
    const map = new Map<number, DefectResponse>();
    if (!board) return map;
    for (const column of board.columns) {
      for (const defect of board.defectsByStatus[column.status] ?? []) {
        map.set(defect.id, defect);
      }
    }
    return map;
  }, [board]);

  const finishDrag = (event: DragEndEvent) => {
    setActiveCardId(null);
    const activeId = String(event.active.id);
    if (!activeId.startsWith("card:")) return;
    const defect = byId.get(Number(activeId.slice("card:".length)));
    if (!defect) return;

    const overId = event.over ? String(event.over.id) : "";
    const targetStatus = resolveBoardDropTarget(overId, (cardId) => byId.get(cardId)?.status);
    if (targetStatus == null) return;
    if (targetStatus === defect.status) return; // 同列内拖拽：后端无排序语义，不动作

    if (!defectTransitionTargets(defect.status).includes(targetStatus)) {
      const labelOf = (status: string) => statusLabel("defect", status);
      toast.error(`非法流转：${labelOf(defect.status)} → ${labelOf(targetStatus)}（后端状态机不允许）`);
      return;
    }
    setTransition({
      defectId: defect.id,
      fromStatus: defect.status,
      target: targetStatus,
      defectProjectId: defect.projectId,
    });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="缺陷看板"
        hint="真实后端数据（GET /defect/v1/board）。拖拽卡片跨列或点「流转」变更状态，非法流转会被拒绝。"
      />

      <DefectStatisticsCards projectId={projectId} />

      {boardQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载看板…
        </div>
      ) : null}

      {boardQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">缺陷看板加载失败：{toUserMessage(boardQuery.error)}</p>
          <Button variant="ghost" onPress={() => void boardQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {boardQuery.isSuccess && (board?.columns.length ?? 0) === 0 ? (
        <EmptyHint>看板没有可用列（后端未返回列配置）。</EmptyHint>
      ) : null}

      {boardQuery.isSuccess && (board?.columns.length ?? 0) > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          onDragStart={(event: DragStartEvent) => {
            const id = String(event.active.id);
            setActiveCardId(id.startsWith("card:") ? Number(id.slice("card:".length)) : null);
          }}
          onDragCancel={() => setActiveCardId(null)}
          onDragEnd={finishDrag}
        >
          <div className="min-h-0 overflow-x-auto">
            <div className="flex h-[60vh] min-h-96 gap-3">
              {board!.columns.map((column) => (
                <DefectBoardColumnView
                  key={column.id}
                  column={column}
                  cards={board!.defectsByStatus[column.status] ?? []}
                  projectKey={projectKey}
                  onCardTransition={(defect) =>
                    setTransition({
                      defectId: defect.id,
                      fromStatus: defect.status,
                      target: null,
                      defectProjectId: defect.projectId,
                    })
                  }
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeCardId != null && byId.get(activeCardId) ? (
              <div className="w-64 rounded-sm border border-border bg-surface p-2.5 opacity-90">
                <span className="type-body block truncate">{byId.get(activeCardId)!.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      {transition != null ? (
        <DefectTransitionDialog
          key={transition.defectId}
          defectId={transition.defectId}
          fromStatus={transition.fromStatus}
          target={transition.target}
          open
          projectContextVerified={transition.defectProjectId === projectId}
          onClose={() => setTransition(null)}
        />
      ) : null}
    </div>
  );
}
