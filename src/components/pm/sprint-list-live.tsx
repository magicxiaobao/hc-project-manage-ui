/**
 * 冲刺列表与生命周期管理（P3：p3-sprint-list）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /sprint/v1/project/{projectId}/findByPage（bean.projectId 必传）。
 *   注意与看板不同：后端 getSprintsByProject 的 bean 条件是服务端生效的
 *   （sprintName like、status eq），因此名称/状态筛选直接下推后端，无需
 *   前端本地过滤；分页用后端 total（page/pageSize 服务端分页）。
 * - 筛选：冲刺名称（文本，服务端 like）/ 状态（服务端 eq）
 * - 新建/编辑：SprintFormDialog（POST createSprint/updateSprint）
 * - 行操作（状态机前端拦截，忠实后端 Sprint.canStart/canComplete/canCancel）：
 *   详情（跳 /p/$projectKey/sprints/$sprintId，p3-sprint-detail 接线）、
 *   编辑、
 *   开始（POST start/{id}，二次确认，仅"规划中"显示；后端另要求计划日期齐全
 *     且项目无其它活跃冲刺，不齐时后端报业务码）、
 *   完成（POST complete/{id}，弹窗选择未完成任务去向 BACKLOG|TARGET_SPRINT，
 *     TARGET_SPRINT 必选同项目规划中冲刺；仅"进行中"显示）、
 *   取消（POST cancel/{id}，二次确认，仅"规划中"/"进行中"显示）、
 *   删除（POST invalid/{id}，二次确认；后端 SprintServiceImpl.invalidSprint
 *     是真正的逻辑删，记录不再出现在分页查询中，无 UI 恢复入口）
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 服务端分页
 *
 * 未登录走演示迭代视图（SprintsView）时不使用本组件。
 */
import { useEffect, useState } from "react";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  OptionSelect,
  PageHeading,
  StateChip,
} from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import {
  canCancelSprint,
  canCompleteSprint,
  canStartSprint,
  editFormFromSprint,
  emptySprintFormInput,
  SPRINT_STATUSES,
  sprintCompletionRate,
  sprintDurationText,
  sprintStatusLabel,
  type SprintStatus,
} from "@/lib/sprint-form";
import {
  toUserMessage,
  useCancelSprint,
  useCompleteSprint,
  useInvalidSprint,
  useSprintList,
  useStartSprint,
} from "@/lib/query";
import type { SprintResponse } from "@/lib/api/sprint-types";
import { SprintFormDialog } from "@/components/pm/sprint-form-dialog";
import { SprintCompleteDialog } from "@/components/pm/sprint-complete-dialog";

const PAGE_SIZE = 20;

const STATUS_TONES: Record<SprintStatus, StateTone> = {
  PLANNING: "neutral",
  ACTIVE: "progress",
  COMPLETED: "done",
  CANCELLED: "danger",
};

const STATUS_FILTER_OPTIONS = [{ id: "", label: "全部" }].concat(
  SPRINT_STATUSES.map((status) => ({
    id: status,
    label: sprintStatusLabel(status),
  })),
);

export function SprintListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [nameInput, setNameInput] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  // 编辑快照：打开瞬间捕获记录，弹窗生命周期不依赖实时分页结果。
  // 否则编辑期间他人改状态导致重取后记录脱离当前页，脏表单会被
  // 直接卸载而无"是否放弃修改"提示（沿用 testcase-list-live 的 P2 经验）。
  const [editingSprint, setEditingSprint] = useState<SprintResponse | null>(null);
  const [startTarget, setStartTarget] = useState<SprintResponse | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SprintResponse | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SprintResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SprintResponse | null>(null);

  // 筛选直接下推后端（服务端生效）：名称服务端 like、状态服务端 eq。
  // 筛选用"已确认"的 applied 值（回车/搜索按钮触发），输入框内容未确认前不参与。
  const listQuery = useSprintList({
    projectId,
    page,
    pageSize: PAGE_SIZE,
    bean: {
      ...(appliedName.trim() ? { sprintName: appliedName.trim() } : {}),
      ...(status ? { status } : {}),
    },
  });

  const startMutation = useStartSprint();
  const completeMutation = useCompleteSprint();
  const cancelMutation = useCancelSprint();
  const invalidMutation = useInvalidSprint();

  const applyFilters = () => {
    setAppliedName(nameInput);
    setPage(1);
  };

  const resetFilters = () => {
    setNameInput("");
    setAppliedName("");
    setStatus("");
    setPage(1);
  };

  const items = listQuery.data?.list ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页，
  // 避免出现"第 2 / 1 页"且空列表的误导状态（沿用 board-list-live 的钳制模式）。
  useEffect(() => {
    if (!listQuery.isSuccess || listQuery.isFetching) return;
    if (page > totalPages) setPage(totalPages);
  }, [listQuery.isSuccess, listQuery.isFetching, page, totalPages]);

  const handleStartConfirm = () => {
    if (startTarget === null || startMutation.isPending) return;
    const id = startTarget.id;
    const record = startTarget;
    // 确认框打开后状态可能已变化：提交前按实时列表状态复核，
    // 后端只允许"规划中"开始
    const liveStatus = listQuery.data?.list.find((item) => item.id === id)?.status;
    if (liveStatus && !canStartSprint(liveStatus)) {
      toast.error("冲刺状态已变化，当前不可开始。请刷新列表。");
      setStartTarget(null);
      return;
    }
    setStartTarget(null);
    startMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`冲刺「${record.sprintName}」已开始`);
      },
      onError: (error) => {
        toast.error(`开始失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleCancelConfirm = () => {
    if (cancelTarget === null || cancelMutation.isPending) return;
    const id = cancelTarget.id;
    const record = cancelTarget;
    const liveStatus = listQuery.data?.list.find((item) => item.id === id)?.status;
    if (liveStatus && !canCancelSprint(liveStatus)) {
      toast.error("冲刺状态已变化，当前不可取消。请刷新列表。");
      setCancelTarget(null);
      return;
    }
    setCancelTarget(null);
    cancelMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`冲刺「${record.sprintName}」已取消`);
      },
      onError: (error) => {
        toast.error(`取消失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget === null || invalidMutation.isPending) return;
    const id = deleteTarget.id;
    const record = deleteTarget;
    setDeleteTarget(null);
    invalidMutation.mutate(id, {
      onSuccess: () => {
        // 后端 SprintServiceImpl.invalidSprint 是真正的逻辑删：
        // 记录不再出现在分页查询中，无 UI 恢复入口
        toast.success(`冲刺「${record.sprintName}」已删除`);
      },
      onError: (error) => {
        toast.error(`删除失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="冲刺"
        hint="真实后端数据（POST /sprint/v1/project/{projectId}/findByPage）。名称/状态筛选由后端生效；支持新建/编辑、开始、完成（可选未完成任务去向）、取消、删除。"
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="min-w-48 flex-1">
          <TextField value={nameInput} onChange={setNameInput} aria-label="按冲刺名称搜索">
            <Input placeholder="按冲刺名称搜索，回车确认" />
          </TextField>
        </div>
        <div className="w-36">
          <OptionSelect
            label="状态"
            value={status}
            options={STATUS_FILTER_OPTIONS}
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
          新建冲刺
        </Button>
      </form>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载冲刺…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">冲刺列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && items.length === 0 ? (
        <EmptyHint>没有符合筛选条件的冲刺。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && items.length > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
              <span className="type-body min-w-0 flex-1">
                <span className="block truncate">{item.sprintName}</span>
                <span className="type-caption block truncate text-default-500">
                  {sprintDurationText(item)}
                  {item.totalStoryPoints != null ? ` · 故事点 ${item.completedStoryPoints ?? 0}/${item.totalStoryPoints}（${sprintCompletionRate(item)}%）` : null}
                </span>
              </span>
              <span className="hidden shrink-0 sm:inline">
                <StateChip
                  tone={STATUS_TONES[item.status as SprintStatus] ?? "neutral"}
                >
                  {sprintStatusLabel(item.status, item.statusLabel)}
                </StateChip>
              </span>
              <span className="flex shrink-0 gap-1">
                {/* P3 p3-sprint-detail：冲刺详情（燃尽图 + 冲刺回顾） */}
                <Link
                  to="/p/$projectKey/sprints/$sprintId"
                  params={{ projectKey, sprintId: String(item.id) }}
                  className="type-link inline-flex min-h-8 items-center rounded-sm px-2 py-1 hover:bg-default/10"
                  aria-label={`查看冲刺 ${item.id} 的详情`}
                >
                  详情
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setEditingSprint(item)}
                  aria-label={`编辑冲刺 ${item.id}`}
                >
                  编辑
                </Button>
                {canStartSprint(item.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setStartTarget(item)}
                    isDisabled={startMutation.isPending}
                    aria-label={`开始冲刺 ${item.id}`}
                  >
                    开始
                  </Button>
                ) : null}
                {canCompleteSprint(item.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setCompleteTarget(item)}
                    isDisabled={completeMutation.isPending}
                    aria-label={`完成冲刺 ${item.id}`}
                  >
                    完成
                  </Button>
                ) : null}
                {canCancelSprint(item.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onPress={() => setCancelTarget(item)}
                    isDisabled={cancelMutation.isPending}
                    aria-label={`取消冲刺 ${item.id}`}
                  >
                    取消
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onPress={() => setDeleteTarget(item)}
                  isDisabled={invalidMutation.isPending}
                  aria-label={`删除冲刺 ${item.id}`}
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

      <SprintFormDialog
        key={createOpen ? "create" : "create-closed"}
        open={createOpen}
        projectId={projectId}
        mode="create"
        initial={emptySprintFormInput()}
        onClose={() => setCreateOpen(false)}
      />
      {editingSprint ? (
        <SprintFormDialog
          key={`edit-${editingSprint.id}`}
          open
          projectId={projectId}
          mode="edit"
          sprintId={editingSprint.id}
          initial={editFormFromSprint(editingSprint)}
          onClose={() => setEditingSprint(null)}
        />
      ) : null}
      {completeTarget ? (
        <SprintCompleteDialog
          key={`complete-${completeTarget.id}`}
          open
          projectId={projectId}
          sprint={completeTarget}
          onClose={() => setCompleteTarget(null)}
        />
      ) : null}

      {/* 开始确认：非表单弹窗，无需 dirty check；
          走 POST /sprint/v1/start/{id}；后端守卫：仅"规划中 + 有效 +
          计划日期齐全 + 项目无其它活跃冲刺"，不满足时报业务码 */}
      <AppModal
        open={startTarget !== null}
        title="开始冲刺"
        onClose={() => setStartTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定开始冲刺「{startTarget?.sprintName}」（#{startTarget?.id}）吗？
          开始后冲刺进入"进行中"状态。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setStartTarget(null)}>
            取消
          </Button>
          <Button
            variant="primary"
            onPress={handleStartConfirm}
            isDisabled={startMutation.isPending}
          >
            {startMutation.isPending ? <Spinner size="sm" /> : null}
            开始冲刺
          </Button>
        </div>
      </AppModal>

      {/* 取消确认：非表单弹窗，无需 dirty check；
          走 POST /sprint/v1/cancel/{id}；取消后不可恢复进行中状态 */}
      <AppModal
        open={cancelTarget !== null}
        title="取消冲刺"
        onClose={() => setCancelTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定取消冲刺「{cancelTarget?.sprintName}」（#{cancelTarget?.id}）吗？
          取消后的冲刺无法恢复进行中状态。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setCancelTarget(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            onPress={handleCancelConfirm}
            isDisabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? <Spinner size="sm" /> : null}
            取消冲刺
          </Button>
        </div>
      </AppModal>

      {/* 删除确认：非表单弹窗，无需 dirty check；
          走 POST /sprint/v1/invalid/{id}；后端 SprintServiceImpl.invalidSprint
          是真正的逻辑删（validStatus 置失效），记录不再出现在分页查询中，
          无 UI 恢复入口 */}
      <AppModal
        open={deleteTarget !== null}
        title="删除冲刺"
        onClose={() => setDeleteTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定删除冲刺「{deleteTarget?.sprintName}」（#{deleteTarget?.id}）吗？
          删除后该冲刺将不再出现在列表中，无法恢复。
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
    </div>
  );
}
