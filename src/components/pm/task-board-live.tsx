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
 * - TODO→IN_PROGRESS"开始"未分配任务时收集执行人（r8 P1-1；后端 START 守卫
 *   要求 assigneeId 非空，null 会被 TaskGuardEvaluator 判 ASSIGNEE_INACTIVE），
 *   代操作原因审计（actor≠assignee 必填原因）暂不做；
 * - 无离线缓存/撤销拖拽（老前端的拖拽快照+撤销仅本地体验增强）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  confirmAuthoritativeRefresh,
  decideBoardUnlock,
  moveCardInColumns,
  restoreColumnOrder,
  type KanbanBoardCard,
  type KanbanBoardColumn,
} from "@/lib/board-kanban";
import { editFormFromColumn } from "@/lib/board-column-form";
import {
  invalidateOtherBoardColumns,
  normalizeBoardColumnsParams,
  queryKeys,
  taskNeedsActorReason,
  taskNeedsAssigneeConfirm,
  toUserMessage,
  useBoardColumnsWithTasks,
  useBoardDetail,
  useDeleteBoardColumn,
  useReorderBoardColumns,
  useUpdateTaskStatus,
  taskTransitionTargets,
} from "@/lib/query";
import { useAuthStore } from "@/lib/api/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { BoardColumnFormDialog } from "@/components/pm/board-column-form-dialog";
import {
  TaskTransitionReasonDialog,
  type TransitionConfirmResult,
} from "@/components/pm/task-transition-reason-dialog";

const columnDragId = (id: number) => `column:${id}`;
/**
 * 卡片拖拽实例 id 含所属列 id（r7 F5 真问题修复）。
 * 后端按列 taskStatus 聚合卡片（getBoardColumnsWithTasks），同一任务状态可被
 * 多列映射，同一张卡片会同时出现在多列中；旧的 `card:${taskId}` 在多列下重复，
 * cardColumnOf 取首个命中列，导致拖第二列卡片时被识别成第一列。
 */
const cardDragId = (columnId: number, cardId: number) => `card:${columnId}:${cardId}`;

function parseDragId(raw: string, prefix: "column"): number | null {
  if (!raw.startsWith(`${prefix}:`)) return null;
  const id = Number(raw.slice(prefix.length + 1));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 解析卡片拖拽 id → { columnId, cardId }；形状不对返回 null */
function parseCardDragId(raw: string): { columnId: number; cardId: number } | null {
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== "card") return null;
  const columnId = Number(parts[1]);
  const cardId = Number(parts[2]);
  if (!Number.isInteger(columnId) || columnId <= 0) return null;
  if (!Number.isInteger(cardId) || cardId <= 0) return null;
  return { columnId, cardId };
}

type FormDialogState =
  | { mode: "create" }
  | { mode: "edit"; columnId: number; column: KanbanBoardColumn };

interface PendingCardMove {
  card: KanbanBoardCard;
  fromColumnId: number;
  toColumnId: number;
  toStatus: TaskStatus;
  /** r8 P1-1：目标为"开始"且任务未分配——弹窗需额外收集执行人 */
  needsAssignee: boolean;
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

  // r7 F4：lastGood 模式——任一查询曾成功即保留已挂载的子树（列表/弹窗/脏表单）；
  // 后台刷新失败时只在顶部展示错误横幅；仅从未成功过才切换错误页。
  const lastGoodBoardName = useRef<string | null>(null);
  if (boardDetail.data?.boardName) lastGoodBoardName.current = boardDetail.data.boardName;
  const lastGoodColumns = useRef<KanbanBoardColumn[]>([]);
  const everColumnsLoaded = useRef(false);
  if (columnsQuery.data !== undefined) {
    lastGoodColumns.current = columnsQuery.data;
    everColumnsLoaded.current = true;
  }
  const columns = columnsQuery.data ?? lastGoodColumns.current;

  const [activeColumn, setActiveColumn] = useState<KanbanBoardColumn | null>(null);
  const [activeCard, setActiveCard] = useState<KanbanBoardCard | null>(null);
  const [formDialog, setFormDialog] = useState<FormDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KanbanBoardColumn | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingCardMove | null>(null);
  // 在途流转的卡片 id：禁用重复拖拽
  const [movingCardIds, setMovingCardIds] = useState<ReadonlySet<number>>(new Set());
  // 卡片流转提交在途（含权威刷新等待）：原因弹窗禁用关闭/提交
  const [transitionBusy, setTransitionBusy] = useState(false);
  // r7 F7：列排序请求串行化——连续拖拽的意图追加到链尾，保证最终生效的是
  // 最后一次排序；排序在途时禁用列拖拽。
  const reorderChain = useRef(Promise.resolve());
  const reorderQueued = useRef(0);
  const [reorderBusy, setReorderBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
  );

  const columnsKey = queryKeys.board.list(normalizeBoardColumnsParams(boardId));

  // r9 P1-1：当前登录用户 id（数字），用于代操作审计的动态原因守卫
  //（与任务详情页 task-detail-live:110-111 同口径）。
  const actorUserId = useAuthStore((state) => state.user?.userId);
  const actorId =
    actorUserId != null && /^\d+$/.test(actorUserId) ? Number(actorUserId) : null;

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
      // r7 F5：源列优先从拖拽实例自带的 columnId 取（同状态多列下 card id 重复，
      // cardColumnOf 只取首个命中列）；实例数据缺失时回退到 cardColumnOf。
      const parsed = parseCardDragId(String(event.active.id));
      const column =
        parsed != null
          ? (columnById.get(parsed.columnId) ?? cardColumnOf(parsed.cardId))
          : null;
      setActiveCard(
        parsed != null ? (column?.tasks.find((task) => task.id === parsed.cardId) ?? null) : null,
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

  /** 列拖拽排序：位置变化才发 POST reorder（乐观更新 + 串行提交，失败回滚） */
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
    // r8 R4：乐观更新前先取快照，失败时操作级恢复用
    const previous = queryClient.getQueryData<KanbanBoardColumn[]>(columnsKey);
    // r9 P2-4：乐观写入推进代次、标记为非权威——协调器不得把本地写入的
    // dataUpdatedAt 误判为权威成功
    markOptimisticWrite();
    queryClient.setQueryData(columnsKey, next);
    enqueueColumnReorder(nextIds, previous);
  }

  /**
   * r7 F7：列排序请求串行化。连续拖拽 A、B 时两次请求按发起顺序依次执行，
   * 最终生效的是最后一次意图；前一次失败不阻塞后续，且失败只回滚自己
   * （失效缓存从服务器重载），不吞掉后一次的意图。
   *
   * r8 R4：失败时先恢复操作前快照（操作级恢复），再等待权威重载并按实际
   * 结果报告——不再重载完成前宣称"已从服务器重新加载"。
   */
  function enqueueColumnReorder(
    nextIds: number[],
    previous: KanbanBoardColumn[] | undefined,
  ) {
    reorderQueued.current += 1;
    setReorderBusy(true);
    reorderChain.current = reorderChain.current
      .catch(() => undefined)
      .then(() => reorderColumns.mutateAsync(nextIds))
      .then(
        () => undefined,
        async (error: unknown) => {
          // 后端 reorder 存在 Integer→Long 反序列化缺陷（见 P3 后端备忘），
          // 失败是可达的。
          // r9 P2-5：操作级恢复——只按快照恢复列顺序，各列卡片（其它在途/
          // 已成功的流转结果）原样保留；整板快照覆盖会抹掉并发操作的成果。
          if (previous !== undefined) {
            markOptimisticWrite();
            queryClient.setQueryData<KanbanBoardColumn[] | undefined>(
              columnsKey,
              (current) => (current ? restoreColumnOrder(current, previous) : previous),
            );
          }
          const reloaded = await authoritativeBoardRefresh();
          toast.error(
            reloaded
              ? `列排序失败：${toUserMessage(error)}，已从服务器重新加载顺序`
              : `列排序失败：${toUserMessage(error)}，顺序回滚刷新未完成，请手动刷新页面`,
          );
        },
      )
      .finally(() => {
        reorderQueued.current -= 1;
        if (reorderQueued.current <= 0) {
          reorderQueued.current = 0;
          setReorderBusy(false);
        }
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
    // r7 F5：拖拽实例 id 含源列 id，同状态多列下不再靠 card id 猜源列
    const parsed = parseCardDragId(String(event.active.id));
    if (parsed == null || !event.over) return;
    const cardId = parsed.cardId;
    if (movingCardIds.has(cardId)) return;
    const fromColumn = columnById.get(parsed.columnId) ?? cardColumnOf(cardId);
    if (!fromColumn) return;
    const overId = String(event.over.id);
    let toColumn: KanbanBoardColumn | null = null;
    const overCard = parseCardDragId(overId);
    if (overCard != null) {
      toColumn = columnById.get(overCard.columnId) ?? cardColumnOf(overCard.cardId);
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
        needsAssignee: taskNeedsAssigneeConfirm(card.status, toStatus, card.assigneeId),
      });
      return;
    }
    // r8 P1-1："开始"未分配任务必须收集执行人（后端 START 守卫要求
    // assigneeId 非空），即使不需要流转文本也要弹收集弹窗。
    if (taskNeedsAssigneeConfirm(card.status, toStatus, card.assigneeId)) {
      setPendingMove({
        card,
        fromColumnId: fromColumn.id,
        toColumnId: toColumn.id,
        toStatus,
        needsAssignee: true,
      });
      return;
    }
    // r9 P1-1：已分配任务的"开始"若执行人不是本人 → 走弹窗强制收集原因
    //（后端 TaskGuardEvaluator.operationalActor：代理操作需管理权限 +
    // 非空原因，否则 MISSING_REASON；与任务详情页同口径）。
    if (taskNeedsActorReason(toStatus, card.assigneeId, actorId)) {
      setPendingMove({
        card,
        fromColumnId: fromColumn.id,
        toColumnId: toColumn.id,
        toStatus,
        needsAssignee: false,
      });
      return;
    }
    void executeCardMove(card, fromColumn.id, toColumn.id, toStatus, {});
  }

  /**
   * r8 R2/R3 + r9 P2-4 + r10 P2-3：看板权威刷新协调器。
   * - refetchQueries 必须传 throwOnError:true：默认吞错误会导致刷新失败
   *   静默通过，catch 永不进入（r8 R2 死代码根因）；
   * - 成功判定走 confirmAuthoritativeRefresh（纯函数，可单测）：
   *   代次未被推进 + 查询确为 success + dataUpdateCount 严格大于刷新开始前
   *   的快照。r10 P2-3 起用成功计数代替墙钟 dataUpdatedAt——同一毫秒/
   *   时钟精度受限/时钟回拨时真实 GET 成功也可能不满足严格递增；
   *   被 cancelQueries 取消（并发卡片流转/列排序调了同查询键
   *   cancelQueries）的 refetch 不产生 success dispatch，一律不计
   *   作权威成功（r8 R3）；
   * - r9 P2-4 ①：所有乐观 setQueryData 都经 markOptimisticWrite 推进代次、
   *   标记为非权威——本地写入的 dataUpdatedAt 不能再冒充权威凭据；
   * - r9 P2-4 ②：每次权威成功记录代次（lastAuthoritySeq）并自动解锁所有
   *   等待刷新的卡片——被取代的代次不再锁死后续成功操作，按最新成功代次
   *   判定新鲜度。
   *
   * @returns 本次刷新是否确认为权威成功
   */
  const boardRefreshSeq = useRef(0);
  const lastAuthoritySeq = useRef(0);
  /** POST 已成功、权威刷新尚未确认的卡片 id：任一次权威成功即自动解锁 */
  const awaitingRefresh = useRef<Set<number>>(new Set());
  /** 乐观写入标记：每次本地 setQueryData 前调用，推进代次使其非权威化 */
  function markOptimisticWrite() {
    boardRefreshSeq.current += 1;
  }
  /**
   * r10 P1-2：权威成功后的统一清理——把 awaitingRefresh 里的卡片从
   * movingCardIds 解锁。协调器内（authoritativeBoardRefresh）与协调器外
   * （顶部横幅重试/重连自动刷新/列 CRUD 失效刷新，见下方 effect）共用。
   *
   * r11 P1-2：任一次权威成功都递增 refreshSucceededSignal，同步给原因弹窗——
   * 弹窗的 refreshFailed 是内部状态，POST 成功+刷新失败后，若权威成功来自
   * toast 重试/自动重连等其它入口，弹窗收不到通知会一直锁死关闭。
   * 信号只在权威成功确认后递增；弹窗收到后 markClean 关闭（见 dialog 注释）。
   */
  const [refreshSucceededSignal, setRefreshSucceededSignal] = useState(0);
  function unlockAwaitingCards() {
    setRefreshSucceededSignal((n) => n + 1);
    const awaiting = awaitingRefresh.current;
    if (awaiting.size === 0) return;
    const ids = [...awaiting];
    awaiting.clear();
    setMovingCardIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }
  // r11 P1-1：暂停中拉取的快照（代次 + 成功计数）；r12 P1-1 起声明前移——
  // authoritativeBoardRefresh 取号后需要同步快照代次
  const unlockFetchStartSeq = useRef<number | null>(null);
  const unlockFetchStartCount = useRef(0);
  async function authoritativeBoardRefresh(): Promise<boolean> {
    const seq = ++boardRefreshSeq.current;
    // r12 P1-1：请求被取代时同步 effect 快照的代次——若有暂停中的拉取快照
    // （代次 S），本次重试把代次推到 S+1 并取代旧请求（cancelRefetch 默认
    // true 会取消旧的 paused fetch 另起新拉取；refetchQueries 在 paused 时
    // 直接 resolve，本次调用不等网络恢复），快照代次必须跟进到 S+1；
    // 否则重连成功后 effect 仍用旧代次 S 判定（currentSeq=S+1≠S）拒绝解锁，
    // awaitingRefresh/refreshSucceededSignal 永久锁死，卡片与弹窗关闭锁
    // 无法恢复。注意：markOptimisticWrite 的推进刻意不同步——乐观写入介入
    // 的拉取仍要被守卫拒绝（r11 P1-1 的保守语义不回退）。
    if (unlockFetchStartSeq.current != null) {
      unlockFetchStartSeq.current = seq;
    }
    // r10 P2-3：用 dataUpdateCount（success dispatch 计数器）代替墙钟
    // dataUpdatedAt——同一毫秒/时钟精度受限/时钟回拨时真实 GET 成功也可能
    // 不满足严格递增；计数器与墙钟无关
    const updateCountBefore =
      queryClient.getQueryState(columnsKey)?.dataUpdateCount ?? 0;
    try {
      // throwOnError 走第二个 options 参数（RefetchOptions），filters 里没有该字段
      await queryClient.refetchQueries(
        { queryKey: columnsKey, type: "active" },
        { throwOnError: true },
      );
    } catch {
      return false;
    }
    const state = queryClient.getQueryState(columnsKey);
    const confirmed = confirmAuthoritativeRefresh({
      status: state?.status === "success" ? "success" : state?.status === "error" ? "error" : "pending",
      dataUpdateCount: state?.dataUpdateCount ?? 0,
      updateCountBefore,
      seq,
      currentSeq: boardRefreshSeq.current,
    });
    if (!confirmed) return false;
    lastAuthoritySeq.current = seq;
    // r9 P2-4 ②：本次权威成功——所有等待中的卡片数据已新鲜，自动解锁
    unlockAwaitingCards();
    return true;
  }

  /**
   * r10 P1-2：协调器之外的权威 GET 成功也要统一解锁。
   * 顶部横幅重试已改走 authoritativeBoardRefresh；重连自动刷新
   * （refetchOnReconnect:'always'）与列 CRUD 失效刷新（invalidateBoardDomain）
   * 由 React Query 自行触发，不经过协调器。这里观察 columnsKey 的真实拉取：
   * - 本地乐观 setQueryData 从不翻转 isFetching，且每次乐观写入都先经
   *   markOptimisticWrite 推进代次；
   * 因此"观察到拉取开始 → 拉取结束且 success → dataUpdateCount 推进 →
   * 期间代次未变"即为一次非乐观的权威 GET 成功，可安全解锁等待中的卡片。
   *
   * r11 P1-1：暂停中的 GET 不能误判为权威成功——
   * - 拉取开始时同时记录代次与成功计数（unlockFetchStartCount），结束时要求
   *   status 为 success 且计数严格大于拉取开始前（真实 success dispatch）。
   *   旧逻辑只记代次、用"上次已处理计数"比较：乐观写入推进计数后，
   *   GET 因网络失败进入 paused（isFetching=false、缓存仍 success、
   *   代次未变）也会触发解锁（探针：countBefore=2、countAfter=2、
   *   fetchStatus=paused、unlocked=true）；
   * - fetchStatus=paused 不是完成：不做判定，也不丢掉本次拉取快照，
   *   等恢复后继续用同一快照判定；
   * - 期间有乐观写入（代次推进）→ 守卫失败，不解锁（保守）。
   */
  useEffect(() => {
    // 拉取开始：只在没有在途快照时记录代次与计数（r12 P1-1：被取代的刷新
    // 由 authoritativeBoardRefresh 同步快照代次，这里不再重捕）
    if (columnsQuery.isFetching) {
      if (unlockFetchStartSeq.current == null) {
        unlockFetchStartSeq.current = boardRefreshSeq.current;
        unlockFetchStartCount.current =
          queryClient.getQueryState(columnsKey)?.dataUpdateCount ?? 0;
      }
      return;
    }
    // r11 P1-1 + r12 P1-1：结束判定走纯函数 decideBoardUnlock（可单测）——
    // paused 不是完成（保留快照）；success + 计数严格推进 + 期间代次未变
    // 才解锁；其余情况快照使命结束（不再观察这次拉取）
    const decision = decideBoardUnlock({
      isFetching: columnsQuery.isFetching,
      fetchStatus: columnsQuery.fetchStatus,
      status: columnsQuery.status,
      dataUpdateCount: queryClient.getQueryState(columnsKey)?.dataUpdateCount ?? 0,
      snapshot:
        unlockFetchStartSeq.current == null
          ? null
          : {
              startSeq: unlockFetchStartSeq.current,
              countAtStart: unlockFetchStartCount.current,
            },
      currentSeq: boardRefreshSeq.current,
    });
    if (decision === "keep-snapshot") return;
    unlockFetchStartSeq.current = null;
    if (decision === "unlock") {
      unlockAwaitingCards();
    }
  }, [
    columnsQuery.isFetching,
    columnsQuery.fetchStatus,
    columnsQuery.status,
    columnsQuery.dataUpdatedAt,
    columnsKey,
    queryClient,
  ]);

  /**
   * 执行卡片流转：乐观把卡片搬到目标列末尾 → POST task/v1/updateStatus；
   * 成功后等待权威刷新落定再解锁；失败时操作级恢复并按实际重载结果报告。
   *
   * r7 F3：此前用 updateStatus.mutate 的局部回调做失效/提示/解锁，连续调用
   * 同一 mutation 时先前 observer 被移除会导致回调丢失（卡片卡在
   * movingCardIds 且无 refetch）。现改用 mutateAsync + 每卡片独立的
   * try/catch/finally，每张卡的失效与解锁互不干扰。
   *
   * r7 F10：此前 onSettled 随即解锁但 invalidate 不等 refetch，乐观更新保留的
   * 旧 card.status 会误拦截下一次流转。现等待权威刷新完成后再解锁；刷新失败
   * 时卡片保持锁定并提供重试，不以旧状态继续流转。
   *
   * r8 R2：权威刷新走 authoritativeBoardRefresh（throwOnError:true），
   * 刷新失败不再静默解锁。
   * r8 R4 + r9 P2-5：失败路径只撤销本操作的乐观移动（卡片级恢复），再等待
   * 权威重载并按实际结果报告——不再整板快照覆盖其它在途/已成功的操作。
   * r8 R5 + r9 P2-6：POST 成功后立即失效其它看板缓存（与当前看板权威刷新
   * 解耦）；重试成功后补做。
   * r8 R6：乐观移动传入实际 fromColumnId（同状态多列下卡片 id 重复）。
   * r8 P1-1："开始"未分配任务时 context 携带收集到的 assigneeId。
   * r9 P1-2：返回三态——区分"提交失败"与"提交成功但刷新失败"，后者禁止
   * 弹窗重复提交，只允许重试刷新。
   * r9 P2-4：刷新被取代/取消时不直接锁死——若其后已有更新代次的权威成功
   * 落定（lastAuthoritySeq），或之后任一次权威成功，卡片自动解锁。
   *
   * @returns 三态结果；原因弹窗据此决定关闭 / 保留文本重试提交 / 禁止重提交只重试刷新。
   */
  async function executeCardMove(
    card: KanbanBoardCard,
    fromColumnId: number,
    toColumnId: number,
    toStatus: TaskStatus,
    context: { reason?: string; deliverables?: string; assigneeId?: number },
  ): Promise<TransitionConfirmResult> {
    setTransitionBusy(true);
    setMovingCardIds((current) => new Set(current).add(card.id));
    const unlockCard = () => {
      setMovingCardIds((current) => {
        const next = new Set(current);
        next.delete(card.id);
        return next;
      });
    };
    // 刷新失败时保持锁定（由重试或后续任意权威成功解锁），其余路径解锁
    let keepLocked = false;
    try {
      await queryClient.cancelQueries({ queryKey: columnsKey });
      // r9 P2-4：乐观写入推进代次、标记为非权威
      markOptimisticWrite();
      queryClient.setQueryData<KanbanBoardColumn[] | undefined>(
        columnsKey,
        (old) => (old ? moveCardInColumns(old, card.id, fromColumnId, toColumnId) : old),
      );
      await updateStatus.mutateAsync({ taskId: card.id, status: toStatus, ...context });
      toast.success(
        `任务「${card.title || `#${card.id}`}」已流转为${statusLabel("task", toStatus)}`,
      );
      // r9 P2-6：其它看板按任务状态聚合且有 30 秒新鲜期——POST 成功即失效，
      // 与当前看板权威刷新解耦（刷新失败/被取代不再跳过）。
      invalidateOtherBoardColumns(queryClient, boardId);
      const seqBefore = boardRefreshSeq.current;
      awaitingRefresh.current.add(card.id);
      const refreshed = await authoritativeBoardRefresh();
      // r9 P2-4 ②：本次刷新被取代/取消时，若其后已有更新代次的权威成功落定，
      // 数据同样新鲜，不锁死。
      const fresh = refreshed || lastAuthoritySeq.current > seqBefore;
      awaitingRefresh.current.delete(card.id);
      if (fresh) {
        return { kind: "success" };
      }
      keepLocked = true;
      // 后续任一次权威成功会自动解锁（authoritativeBoardRefresh 内处理）
      awaitingRefresh.current.add(card.id);
      toast.error("流转已成功，但看板刷新失败", {
        action: {
          label: "重试",
          onClick: () => void retryBoardRefresh(card.id),
        },
      });
      return { kind: "refreshFailed" };
    } catch (error) {
      // r9 P2-5：卡片级恢复——只把本卡移回源列，不碰其它列/卡片；
      // 再等待权威重载确认，按实际结果报告（重载成功即以权威 GET 为准）。
      markOptimisticWrite();
      queryClient.setQueryData<KanbanBoardColumn[] | undefined>(
        columnsKey,
        (old) => (old ? moveCardInColumns(old, card.id, toColumnId, fromColumnId) : old),
      );
      const reloaded = await authoritativeBoardRefresh();
      if (reloaded) {
        toast.error(`流转失败：${toUserMessage(error)}，已回滚`);
      } else {
        toast.error(
          `流转失败：${toUserMessage(error)}，回滚刷新未完成，请手动刷新页面`,
        );
      }
      return { kind: "submitFailed", message: toUserMessage(error) };
    } finally {
      setTransitionBusy(false);
      if (!keepLocked) unlockCard();
    }
  }

  /**
   * 看板权威刷新重试：成功后解锁卡片并补做其它看板失效（r9 P2-6），
   * 否则继续保持锁定并可再试。
   */
  async function retryBoardRefresh(cardId: number): Promise<boolean> {
    if (await authoritativeBoardRefresh()) {
      // r9 P2-6：重试成功补做其它看板失效（POST 早已成功）
      invalidateOtherBoardColumns(queryClient, boardId);
      return true;
    }
    toast.error("看板刷新仍未成功", {
      action: { label: "重试", onClick: () => void retryBoardRefresh(cardId) },
    });
    return false;
  }

  /**
   * r10 P1-2：顶部错误横幅的重试走权威刷新协调器（而不是裸
   * columnsQuery.refetch()）——协调器在权威成功后统一清理
   * awaitingRefresh/movingCardIds，否则重试成功后错误横幅消失、
   * 卡片却仍被锁定。看板详情仍单独 refetch（与列查询无关）。
   */
  async function retryTopBannerRefresh(): Promise<void> {
    void boardDetail.refetch();
    const ok = await authoritativeBoardRefresh();
    if (!ok) {
      toast.error("看板刷新失败，请稍后重试");
    }
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

  // r8 R1 + r7 F4 + r10 P1-1：loading/错误分支一律受"页面子树是否已展示"约束。
  // r10 P1-1：r9 修复 3 把 loading 闸门改成只看列数据到达（columnsEverArrived），
  // 但"子树已展示"这个概念丢了——列查询首次失败→页面展示（允许新建列）→
  // 填写草稿→点重试→无数据查询重新 pending→loading 闸门命中→卸载整棵子树，
  // BoardColumnFormDialog 的草稿丢失且 dirty guard 无法拦截（条件卸载不是路由
  // 导航）。因此另行记录子树是否已展示过（按看板 id）：首次加载等列数据，
  // 子树一旦展示，后台重试的重新 pending 不再卸载它（只保留顶部错误横幅）。
  // 仅从未展示过才切换 loading/错误页。
  // r9 P2-3 保持：boardDetail 先成功不再放宽 loading 闸门——列数据未到前
  // 一律保持骨架，避免先闪出"这个看板还没有列"的空态。
  const everLoaded = everColumnsLoaded.current || lastGoodBoardName.current != null;
  const subtreeBoardId = useRef<number | null>(null);
  const boardSubtreeShown = useRef(false);
  if (subtreeBoardId.current !== boardId) {
    subtreeBoardId.current = boardId;
    boardSubtreeShown.current = false;
  }
  if ((boardDetail.isPending || columnsQuery.isPending) && !boardSubtreeShown.current) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载看板…
      </div>
    );
  }

  const loadFailed = boardDetail.isError || columnsQuery.isError;
  const refetchFailed = boardDetail.isRefetchError || columnsQuery.isRefetchError;
  if ((loadFailed || refetchFailed) && !everLoaded) {
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
  const showRefreshBanner = (loadFailed || refetchFailed) && everLoaded;

  // r10 P1-1：走到这里说明本轮渲染了主子树（列表/弹窗/脏表单）——后续
  // 任何查询的重新 pending（重试/重连）都不再卸载它
  boardSubtreeShown.current = true;

  const boardName =
    boardDetail.data?.boardName ?? lastGoodBoardName.current ?? `看板 #${boardId}`;

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
      {showRefreshBanner ? (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2">
          <p className="type-body flex-1 text-danger">
            看板刷新失败：{toUserMessage(boardDetail.error ?? columnsQuery.error)}
            。显示的是上次成功的数据。
          </p>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => void retryTopBannerRefresh()}
          >
            重试
          </Button>
        </div>
      ) : null}
      {columns.length === 0 ? (
        <div className="px-4">
          <EmptyHint>
            这个看板还没有列。先新建一列并映射任务状态，任务卡片才会出现。
            （后端当前版本不保存列的状态映射与颜色，卡片聚合能力受后端阻塞。）
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
                    sortDisabled={reorderBusy}
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
          isPending={transitionBusy}
          // r8 P1-1："开始"未分配任务时收集执行人；此时流转文本可选
          showAssignee={pendingMove.needsAssignee}
          textRequired={cardTransitionNeedsText(pendingMove.card.status, pendingMove.toStatus)}
          // r9 P1-1：动态代操作守卫所需：当前操作人与卡片当前执行人
          actorId={actorId}
          cardAssigneeId={pendingMove.card.assigneeId}
          onCancel={() => {
            // r7 F9：请求在途时不允许关闭，弹窗与文本保留到成功/失败落定
            if (!transitionBusy) setPendingMove(null);
          }}
          // r9 P1-2：仅重试看板权威刷新（不重发 POST）；成功后弹窗自行关闭
          onRetryRefresh={() => retryBoardRefresh(pendingMove.card.id)}
          // r11 P1-2：各入口的权威成功同步到弹窗——refreshFailed 态下收到
          // 递增即 markClean 关闭（toast 重试/自动重连成功不再锁死弹窗）
          refreshSucceededSignal={refreshSucceededSignal}
          onConfirm={async (text, assigneeId) => {
            const move = pendingMove;
            // r7 F9：请求期间保留弹窗与文本；成功才由弹窗 markClean 后关闭，
            // 失败时文本保留在弹窗内，可修改后重试。
            // r8 P1-1：文本为空且非必填时不下发 reason/deliverables 空串；
            // 收集到的执行人随 context 下发（后端 START 守卫要求非空）。
            const context: {
              reason?: string;
              deliverables?: string;
              assigneeId?: number;
            } = text ? buildCardTransitionContext(move.toStatus, text) : {};
            if (assigneeId != null) context.assigneeId = assigneeId;
            return executeCardMove(
              move.card,
              move.fromColumnId,
              move.toColumnId,
              move.toStatus,
              context,
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
  sortDisabled,
  onEdit,
  onDelete,
}: {
  column: KanbanBoardColumn;
  /** 在途流转中的卡片 id 集合（其卡片禁用拖拽） */
  disabled: ReadonlySet<number>;
  /** 列排序请求在途：禁用列拖拽（r7 F7，避免并发排序互相覆盖） */
  sortDisabled?: boolean;
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
    disabled: sortDisabled,
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
        dragDisabled={sortDisabled}
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
  dragDisabled,
  disabled,
  onEdit,
  onDelete,
}: {
  column: KanbanBoardColumn;
  preview?: boolean;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragDisabled?: boolean;
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
            className="cursor-grab touch-none text-default-400 hover:text-default-600 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={dragDisabled}
            title={dragDisabled ? "排序请求进行中，稍候再拖" : undefined}
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
            items={column.tasks.map((task) => cardDragId(column.id, task.id))}
            strategy={verticalListSortingStrategy}
          >
            {column.tasks.map((task) => (
              <SortableCard
                key={task.id}
                card={task}
                columnId={column.id}
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
  columnId,
  disabled,
}: {
  card: KanbanBoardCard;
  /** 所属列 id：拖拽实例 id 含列 id（r7 F5，同状态多列下卡片 id 重复） */
  columnId: number;
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
    id: cardDragId(columnId, card.id),
    data: { kind: "card", cardId: card.id, columnId },
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
