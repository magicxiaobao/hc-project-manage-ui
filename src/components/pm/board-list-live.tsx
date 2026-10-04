/**
 * 看板列表管理（P3：p3-board-manage）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /board/v1/project/{projectId}/findByPage（bean.projectId 必传），
 *   分页 page/pageSize
 * - 筛选：看板名称（文本）/ 看板类型（老前端五类）/ 状态（活跃/归档/暂停/维护中）
 * - 新建/编辑：BoardFormDialog（POST createBoard/updateBoard），成功后列表缓存已失效
 * - 行操作：编辑（弹窗）、设为默认（POST setDefault/{id}，仅非默认显示）、
 *   复制（POST copy/{id}?newBoardName=，弹窗输入新名称，成功后 toast 新 id）、
 *   归档（POST archive/{id}，确认框确认，仅"活跃"显示）、
 *   激活（POST activate/{id}，仅"归档"显示）
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 *
 * 未登录走演示看板视图（BoardView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
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
import { BOARD_TYPES, editFormFromBoard, emptyBoardFormInput } from "@/lib/board-form";
import {
  toUserMessage,
  useActivateBoard,
  useArchiveBoard,
  useBoardList,
  useCopyBoard,
  useSetDefaultBoard,
} from "@/lib/query";
import type { BoardQueryRequest, BoardResponse } from "@/lib/api/board-types";
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

  const bean = useMemo<BoardQueryRequest>(() => {
    const value: BoardQueryRequest = { projectId };
    const boardName = appliedName.trim();
    if (boardName) value.boardName = boardName;
    if (boardType) value.boardType = boardType;
    if (status) value.status = status;
    return value;
  }, [projectId, appliedName, boardType, status]);

  const listQuery = useBoardList({ page, pageSize: PAGE_SIZE, bean, projectId });
  const copyMutation = useCopyBoard();
  const archiveMutation = useArchiveBoard();
  const activateMutation = useActivateBoard();
  const setDefaultMutation = useSetDefaultBoard();

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

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页重新查询，
  // 避免出现"第 2 / 1 页"且空列表的误导状态。
  // 注意：只在当前页请求完成后钳制——isSuccess 为 true 但 isFetching 仍为 true 时，
  // 返回的是失效缓存（旧 total），此时钳制会把用户错误拉回上一页。
  useEffect(() => {
    if (!listQuery.isSuccess || listQuery.isFetching) return;
    if (page > totalPages) setPage(totalPages);
  }, [listQuery.isSuccess, listQuery.isFetching, page, totalPages]);

  const handleCopyConfirm = (newBoardName: string) => {
    if (copyTarget === null || copyMutation.isPending) return;
    const id = copyTarget.id;
    copyMutation.mutate(
      { id, newBoardName },
      {
        onSuccess: (newId) => {
          toast.success(`看板已复制（新看板 #${newId}）`);
          setCopyTarget(null);
        },
        onError: (error) => {
          toast.error(`复制失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const handleArchiveConfirm = () => {
    if (archiveTarget === null || archiveMutation.isPending) return;
    const id = archiveTarget.id;
    // 确认框打开后状态可能已变化：提交前按实时列表状态复核，
    // 老前端只允许"活跃"归档
    const liveStatus = listQuery.data?.list.find((item) => item.id === id)?.status;
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
        hint="真实后端数据（POST /board/v1/project/{projectId}/findByPage）。按名称、类型、状态筛选；支持新建/编辑、设为默认、复制、归档/激活。"
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

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的看板。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
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
          确定归档看板「{archiveTarget?.boardName}」（#{archiveTarget?.id}）吗？归档后它将不再出现在默认列表中，可随时激活恢复。
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
    </div>
  );
}

/**
 * 复制看板：输入新看板名称的小表单弹窗。
 * 单字段表单同样套用表单 UX 约定：dirty check（有输入未确认即关闭先确认
 * "是否放弃修改？"）、必填星号、字段级错误。
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
  onConfirm: (newBoardName: string) => void;
}) {
  const [name, setName] = useState(`${boardName}（副本）`);
  const [error, setError] = useState("");
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(name.trim() !== "");

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
    markClean();
    onConfirm(trimmed);
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
