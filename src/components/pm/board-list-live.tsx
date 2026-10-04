/**
 * 看板列表管理（P3：p3-board-manage）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /board/v1/project/{projectId}/findByPage（bean.projectId 必传）。
 *   注意：后端 findByPage/getBoardsByProject 只按 projectId 过滤，bean 中的
 *   boardName/boardType/status 条件被完全忽略——前端用 useBoardListAll 循环分页
 *   拉取项目真实全量看板（直到某页不足一页，不再假装"500 就是全量"），再做
 *   本地筛选（名称包含/类型/状态）+ 本地分页，避免"筛选不生效"与 total>500
 *   时的静默漏数。
 * - 筛选：看板名称（文本）/ 看板类型（老前端五类）/ 状态（活跃/归档/暂停/维护中）
 * - 新建/编辑：BoardFormDialog（POST createBoard/updateBoard），成功后列表缓存已失效
 * - 行操作：编辑（弹窗）、设为默认（POST setDefault/{id}，仅非默认显示）、
 *   复制（POST copy/{id}?newBoardName=，弹窗输入新名称；后端 copyBoard 是 TODO
 *   空壳返回 null，前端校验返回 id 有效才算成功）、
 *   归档（POST archive/{id}，确认框确认，仅"活跃"显示）、
 *   激活（POST activate/{id}，仅"归档"显示）、
 *   删除（POST invalid/{id}，二次确认；后端 Board.invalid() 只是把状态置为
 *   "归档"（与 archive 同一状态），非物理删除，记录仍在列表中、可随时激活恢复）
 * - 冲刺看板：工具栏"冲刺看板"按钮 → GET /board/v1/sprint/{sprintId}，无则
 *   POST sprint/{sprintId}/create?boardName=；后端 createSprintBoard 是 TODO
 *   空壳返回 null，前端诚实提示"后端未实现"而非假装成功
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 *
 * 未登录走演示看板视图（BoardView）时不使用本组件。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  FieldError,
  OptionSelect,
  PageHeading,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  BOARD_TYPES,
  MAX_BOARD_NAME_LENGTH,
  editFormFromBoard,
  emptyBoardFormInput,
} from "@/lib/board-form";
import { boardApi } from "@/lib/api/board";
import {
  queryKeys,
  toUserMessage,
  useActivateBoard,
  useArchiveBoard,
  useBoardListAll,
  useCopyBoard,
  useInvalidBoard,
  useSetDefaultBoard,
} from "@/lib/query";
import type { BoardResponse } from "@/lib/api/board-types";
import { BoardFormDialog } from "@/components/pm/board-form-dialog";

const PAGE_SIZE = 20;

const BOARD_STATUSES = ["活跃", "归档", "暂停", "维护中"] as const;

const BOARD_TYPE_FILTER_OPTIONS = BOARD_TYPES.map((type) => ({ id: type, label: type }));
const STATUS_FILTER_OPTIONS = BOARD_STATUSES.map((status) => ({ id: status, label: status }));

function toSelectOptions(options: { id: string; label: string }[]) {
  return [{ id: "", label: "全部" }, ...options];
}

export function BoardListLive({ projectId }: { projectId: number; projectKey: string }) {
  const [nameInput, setNameInput] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [boardType, setBoardType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  // 编辑快照：打开瞬间捕获记录，弹窗生命周期不依赖实时分页结果。
  // 否则编辑期间他人归档/改状态导致重取后记录脱离当前页，脏表单会被
  // 直接卸载而无"是否放弃修改"提示（沿用 testcase-list-live 的 P2 经验）。
  const [editingBoard, setEditingBoard] = useState<BoardResponse | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BoardResponse | null>(null);
  const [copyTarget, setCopyTarget] = useState<BoardResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardResponse | null>(null);
  const [sprintBoardOpen, setSprintBoardOpen] = useState(false);

  // 后端忽略 bean 里的 boardName/boardType/status 条件（只按 projectId 过滤），
  // 且单次请求 pageSize 上限可能截断（total>500 时静默漏数）：用 useBoardListAll
  // 循环拉取所有页拿到真实全量，筛选用下面的本地过滤实现——避免"筛选不生效"与漏数。
  const listQuery = useBoardListAll({ projectId });

  // 本地筛选：名称包含匹配（前后空格已 trim）、类型精确、状态精确。
  // 注意筛选用"已确认"的 applied 值（回车/搜索按钮触发），输入框内容未确认前不参与。
  const filteredBoards = useMemo(() => {
    const source = listQuery.data ?? [];
    const keyword = appliedName.trim();
    return source.filter((item) => {
      if (keyword && !(item.boardName ?? "").includes(keyword)) return false;
      if (boardType && item.boardType !== boardType) return false;
      if (status && item.status !== status) return false;
      return true;
    });
  }, [listQuery.data, appliedName, boardType, status]);

  const copyMutation = useCopyBoard();
  const archiveMutation = useArchiveBoard();
  const activateMutation = useActivateBoard();
  const setDefaultMutation = useSetDefaultBoard();
  const invalidMutation = useInvalidBoard();

  const applyFilters = () => {
    setAppliedName(nameInput);
    setPage(1);
  };

  const resetFilters = () => {
    setNameInput("");
    setAppliedName("");
    setBoardType("");
    setStatus("");
    setPage(1);
  };

  const total = filteredBoards.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 本地分页：当前页的数据切片
  const pageItems = useMemo(
    () => filteredBoards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredBoards, page],
  );

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页重新查询，
  // 避免出现"第 2 / 1 页"且空列表的误导状态。
  // 注意：只在当前页请求完成后钳制——isSuccess 为 true 但 isFetching 仍为 true 时，
  // 返回的是失效缓存（旧 total），此时钳制会把用户错误拉回上一页。
  useEffect(() => {
    if (!listQuery.isSuccess || listQuery.isFetching) return;
    if (page > totalPages) setPage(totalPages);
  }, [listQuery.isSuccess, listQuery.isFetching, page, totalPages]);

  const handleCopyConfirm = (newBoardName: string, markClean: () => void) => {
    if (copyTarget === null || copyMutation.isPending) return;
    const id = copyTarget.id;
    copyMutation.mutate(
      { id, newBoardName },
      {
        onSuccess: (newId) => {
          // 后端 copyBoard 是 TODO 空壳，Controller 包成功响应但 result 为 null：
          // 必须校验返回 id 有效才算成功，否则诚实报错，不提示"已复制"。
          if (typeof newId === "number" && Number.isFinite(newId) && newId > 0) {
            // r5-4：成功关闭前先 markClean——否则弹窗卸载时若仍脏且有待决导航，
            // RouteBlocker 的卸载清理会 reset() 取消用户正在确认的离开
            markClean();
            toast.success(`看板已复制（新看板 #${newId}）`);
            setCopyTarget(null);
          } else {
            toast.error("复制失败：后端尚未实现看板复制（接口返回空）。请联系后端开发补齐。");
          }
        },
        onError: (error) => {
          toast.error(`复制失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget === null || invalidMutation.isPending) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    invalidMutation.mutate(id, {
      onSuccess: () => {
        // 后端只是置归档状态（Board.invalid()），非物理删除：文案诚实，不说"无法恢复"
        toast.success(`看板 #${id} 已删除（置为归档，可随时激活恢复）`);
      },
      onError: (error) => {
        toast.error(`删除失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleArchiveConfirm = () => {
    if (archiveTarget === null || archiveMutation.isPending) return;
    const id = archiveTarget.id;
    // 确认框打开后状态可能已变化：提交前按实时列表状态复核，
    // 老前端只允许"活跃"归档
    const liveStatus = listQuery.data?.find((item) => item.id === id)?.status;
    if (liveStatus && liveStatus !== "活跃") {
      toast.error("看板状态已变化，当前不可归档。请刷新列表。");
      setArchiveTarget(null);
      return;
    }
    setArchiveTarget(null);
    archiveMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`看板 #${id} 已归档`);
      },
      onError: (error) => {
        toast.error(`归档失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleActivate = (id: number) => {
    if (activateMutation.isPending) return;
    activateMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`看板 #${id} 已激活`);
      },
      onError: (error) => {
        toast.error(`激活失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleSetDefault = (id: number) => {
    if (setDefaultMutation.isPending) return;
    setDefaultMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`看板 #${id} 已设为默认`);
      },
      onError: (error) => {
        toast.error(`设置失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="看板"
        hint="真实后端数据（POST /board/v1/project/{projectId}/findByPage）。筛选为前端本地过滤（后端接口仅按项目过滤）；支持新建/编辑、设为默认、复制、归档/激活、删除。"
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="min-w-48 flex-1">
          <TextField value={nameInput} onChange={setNameInput} aria-label="按看板名称搜索">
            <Input placeholder="按看板名称搜索，回车确认" />
          </TextField>
        </div>
        <div className="w-40">
          <OptionSelect
            label="类型"
            value={boardType}
            options={toSelectOptions(BOARD_TYPE_FILTER_OPTIONS)}
            onChange={(next) => {
              setBoardType(next);
              setPage(1);
            }}
          />
        </div>
        <div className="w-36">
          <OptionSelect
            label="状态"
            value={status}
            options={toSelectOptions(STATUS_FILTER_OPTIONS)}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
          />
        </div>
        <Button type="submit" variant="primary">
          搜索
        </Button>
        <Button variant="ghost" onPress={resetFilters}>
          重置
        </Button>
        <Button variant="secondary" onPress={() => setCreateOpen(true)}>
          新建看板
        </Button>
        <Button variant="ghost" onPress={() => setSprintBoardOpen(true)}>
          冲刺看板
        </Button>
      </form>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载看板…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">看板列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && filteredBoards.length === 0 ? (
        <EmptyHint>没有符合筛选条件的看板。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && pageItems.length > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {pageItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
              <span className="type-body min-w-0 flex-1 truncate">
                {item.boardName}
                {item.isDefault ? (
                  <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-600">
                    默认
                  </span>
                ) : null}
              </span>
              <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
                {item.boardType ?? "-"}
              </span>
              <span
                className={`type-caption hidden shrink-0 sm:inline ${
                  item.status === "归档" ? "text-default-400" : "text-default-500"
                }`}
              >
                {item.status ?? "-"}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setEditingBoard(item)}
                  aria-label={`编辑看板 ${item.id}`}
                >
                  编辑
                </Button>
                {!item.isDefault ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => handleSetDefault(item.id)}
                    isDisabled={setDefaultMutation.isPending}
                    aria-label={`设看板 ${item.id} 为默认`}
                  >
                    设为默认
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setCopyTarget(item)}
                  isDisabled={copyMutation.isPending}
                  aria-label={`复制看板 ${item.id}`}
                >
                  复制
                </Button>
                {item.status === "活跃" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onPress={() => setArchiveTarget(item)}
                    aria-label={`归档看板 ${item.id}`}
                  >
                    归档
                  </Button>
                ) : null}
                {item.status === "归档" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => handleActivate(item.id)}
                    isDisabled={activateMutation.isPending}
                    aria-label={`激活看板 ${item.id}`}
                  >
                    激活
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onPress={() => setDeleteTarget(item)}
                  isDisabled={invalidMutation.isPending}
                  aria-label={`删除看板 ${item.id}`}
                >
                  删除
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {listQuery.isSuccess ? (
        <div className="flex items-center justify-between gap-3">
          <span className="type-meta">
            共 {total} 条 · 第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              isDisabled={page <= 1}
              onPress={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={page >= totalPages}
              onPress={() => setPage((current) => current + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}

      <BoardFormDialog
        key={createOpen ? "create" : "create-closed"}
        open={createOpen}
        projectId={projectId}
        mode="create"
        initial={emptyBoardFormInput()}
        onClose={() => setCreateOpen(false)}
      />
      {editingBoard ? (
        <BoardFormDialog
          key={`edit-${editingBoard.id}`}
          open
          projectId={projectId}
          mode="edit"
          boardId={editingBoard.id}
          initial={editFormFromBoard(editingBoard)}
          onClose={() => setEditingBoard(null)}
        />
      ) : null}

      {/* 归档确认：非表单弹窗，无需 dirty check */}
      <AppModal
        open={archiveTarget !== null}
        title="归档看板"
        onClose={() => setArchiveTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定归档看板「{archiveTarget?.boardName}」（#{archiveTarget?.id}）吗？归档后的看板将不再显示在活跃列表中，可随时激活恢复。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setArchiveTarget(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            onPress={handleArchiveConfirm}
            isDisabled={archiveMutation.isPending}
          >
            {archiveMutation.isPending ? <Spinner size="sm" /> : null}
            归档
          </Button>
        </div>
      </AppModal>

      {copyTarget ? (
        <CopyBoardDialog
          key={`copy-${copyTarget.id}`}
          boardName={copyTarget.boardName}
          isPending={copyMutation.isPending}
          onClose={() => setCopyTarget(null)}
          onConfirm={handleCopyConfirm}
        />
      ) : null}

      {/* 删除确认：非表单弹窗，无需 dirty check；
          走 POST /board/v1/invalid/{id}；后端 Board.invalid() 只是置归档状态
          （与 archive 同一状态），记录仍在列表中、可随时激活恢复 */}
      <AppModal
        open={deleteTarget !== null}
        title="删除看板"
        onClose={() => setDeleteTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定删除看板「{deleteTarget?.boardName}」（#{deleteTarget?.id}）吗？
          删除后看板置为归档状态，仍保留在列表中，可随时激活恢复。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            onPress={handleDeleteConfirm}
            isDisabled={invalidMutation.isPending}
          >
            {invalidMutation.isPending ? <Spinner size="sm" /> : null}
            删除
          </Button>
        </div>
      </AppModal>

      {sprintBoardOpen ? (
        <SprintBoardDialog onClose={() => setSprintBoardOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * 复制看板：输入新看板名称的小表单弹窗。
 * 单字段表单同样套用表单 UX 约定：dirty check（有输入未确认即关闭先确认
 * "是否放弃修改？"）、必填星号、字段级错误。
 *
 * dirty 判定：与打开瞬间的初始值快照比较。注意初始值 `${boardName}（副本）`
 * 非空，不能用"输入非空即脏"，否则打开弹窗即被判定为脏、点取消直接弹确认。
 * 另注意：请求发出前不清脏——失败后弹窗保留，若已清脏则守卫离线，后续修改
 * 会直接放行；成功时父组件的 onSuccess 先调本组件传出的 markClean() 再卸载
 * 弹窗（程序化关闭）：此时若仍脏且有待决导航，RouteBlocker 的卸载清理会
 * proceed() 放行而非 reset() 取消用户正在确认的离开（form-guard.tsx:95）。
 */
function CopyBoardDialog({
  boardName,
  isPending,
  onClose,
  onConfirm,
}: {
  boardName: string;
  isPending: boolean;
  onClose: () => void;
  /** 第二个参数是本组件的 markClean：成功关闭前先清脏，避免卸载时仍脏的待决导航被取消 */
  onConfirm: (newBoardName: string, markClean: () => void) => void;
}) {
  const [name, setName] = useState(`${boardName}（副本）`);
  const [error, setError] = useState("");
  // 打开瞬间的初始值快照；dirty = 当前值偏离快照
  const initialRef = useRef(`${boardName}（副本）`);
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    name !== initialRef.current,
  );

  const doClose = () => {
    onClose();
  };

  const close = () => {
    if (isPending) return;
    guard(doClose);
  };

  const handleConfirm = () => {
    if (isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请填写新看板名称");
      return;
    }
    if (trimmed.length > 100) {
      setError("看板名称不能超过 100 个字符");
      return;
    }
    // 不在请求前 markClean：失败后弹窗保留，若已清脏则守卫离线、后续修改直接放行。
    // 成功路径由父组件的 onSuccess 先调 markClean() 再卸载弹窗。
    onConfirm(trimmed, markClean);
  };

  return (
    <>
      {blocker}
      <AppModal open title="复制看板" onClose={close} size="sm">
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={name}
              onChange={(value) => {
                setName(value);
                setError("");
              }}
              isDisabled={isPending}
            >
              <Label>
                新看板名称<RequiredMark />
              </Label>
              <Input placeholder="请输入新看板名称" maxLength={101} />
            </TextField>
            <FieldError message={error} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button
              variant="primary"
              onPress={handleConfirm}
              isDisabled={isPending}
            >
              {isPending ? <Spinner size="sm" /> : null}
              复制
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}

/**
 * 冲刺看板（P3：p3-board-manage scope 接线）。
 *
 * 流程：GET /board/v1/sprint/{sprintId} → 已有则直接提示看板信息；
 * 无（后端返回 null）则 POST /board/v1/sprint/{sprintId}/create?boardName= 创建。
 *
 * 后端现状（实读 BoardServiceImpl:181-186）：createSprintBoard 是 TODO 空壳，
 * 直接返回 null（Controller 包成功响应）。前端做 null 防护：创建返回的 id
 * 无效时诚实提示"后端未实现"，不假装创建成功。
 *
 * 表单 UX 约定：dirty 按初始快照比较判定；失败时弹窗保留、守卫继续布防；
 * 成功是程序化关闭，直接卸载。
 */
function SprintBoardDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sprintIdInput, setSprintIdInput] = useState("");
  const [boardName, setBoardName] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const initialRef = useRef({ sprintIdInput: "", boardName: "" });
  const isDirty =
    sprintIdInput !== initialRef.current.sprintIdInput ||
    boardName !== initialRef.current.boardName;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(isDirty);

  const close = () => {
    if (isPending) return;
    guard(onClose);
  };

  const handleConfirm = async () => {
    if (isPending) return;
    // 字段级校验：收集全部错误（不首错即停），逐个挂到对应输入下方。
    // 名称上限与复制弹窗/board-form.ts 保持一致：MAX_BOARD_NAME_LENGTH（100）。
    const errors: { field: "sprintId" | "boardName"; message: string }[] = [];
    const sprintId = Number(sprintIdInput.trim());
    if (!Number.isInteger(sprintId) || sprintId <= 0) {
      errors.push({ field: "sprintId", message: "请填写有效的冲刺 ID（正整数）" });
    }
    const trimmedName = boardName.trim();
    if (trimmedName.length > MAX_BOARD_NAME_LENGTH) {
      errors.push({
        field: "boardName",
        message: `看板名称不能超过 ${MAX_BOARD_NAME_LENGTH} 个字符`,
      });
    }
    setFieldError(errors.find((error) => error.field === "sprintId")?.message ?? "");
    setNameError(errors.find((error) => error.field === "boardName")?.message ?? "");
    if (errors.length > 0) return;
    setSubmitError("");
    setIsPending(true);
    try {
      const existing = await boardApi.getSprintBoard(sprintId);
      if (existing) {
        // r5-4：成功关闭前先 markClean——否则弹窗卸载时若仍脏且有待决导航，
        // RouteBlocker 的卸载清理会 reset() 取消用户正在确认的离开
        markClean();
        toast.success(`冲刺 ${sprintId} 已有看板「${existing.boardName}」（#${existing.id}）`);
        onClose();
        return;
      }
      const finalName = trimmedName || `Sprint ${sprintId} 冲刺看板`;
      const newId = await boardApi.createSprintBoard(sprintId, finalName);
      if (typeof newId === "number" && Number.isFinite(newId) && newId > 0) {
        markClean();
        toast.success(`已为冲刺 ${sprintId} 创建看板（#${newId}）`);
        void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
        onClose();
      } else {
        // 后端空壳返回 null：诚实提示后端未实现，不假装成功；弹窗保留可重试/取消
        setSubmitError(
          "创建失败：后端尚未实现冲刺看板创建（接口返回空）。请联系后端开发补齐。",
        );
      }
    } catch (error) {
      setSubmitError(`操作失败：${toUserMessage(error)}`);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      {blocker}
      <AppModal open title="冲刺看板" onClose={close} size="sm">
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-caption text-default-500">
            先按冲刺 ID 查询已有看板；没有则创建（名称可留空自动生成）。
          </p>
          <div>
            <TextField
              value={sprintIdInput}
              onChange={(value) => {
                setSprintIdInput(value);
                setFieldError("");
                setSubmitError("");
              }}
              isDisabled={isPending}
              inputMode="numeric"
            >
              <Label>
                冲刺 ID<RequiredMark />
              </Label>
              <Input placeholder="例如：12" />
            </TextField>
            <FieldError message={fieldError} />
          </div>
          <div>
            <TextField
              value={boardName}
              onChange={(value) => {
                setBoardName(value);
                setNameError("");
                setSubmitError("");
              }}
              isDisabled={isPending}
            >
              <Label>看板名称（无看板需新建时使用）</Label>
              <Input placeholder="留空则自动生成" maxLength={101} />
            </TextField>
            <FieldError message={nameError} />
          </div>
          {submitError ? (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={() => void handleConfirm()} isDisabled={isPending}>
              {isPending ? <Spinner size="sm" /> : null}
              查询 / 创建
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
