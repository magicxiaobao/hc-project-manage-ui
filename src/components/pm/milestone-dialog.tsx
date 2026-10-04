/**
 * 里程碑管理弹窗（P3：p3-gantt 里程碑叠加）。
 *
 * 列表 + 新建/编辑表单 + 删除确认，走 /milestone（无 /v1）：
 * - 新建：POST /milestone/create（日期转 Instant ISO；空日期不发）
 * - 更新：POST /milestone/update，字段出现即提交（diffMilestoneFields 只发
 *   变更字段，绝不发 xxxSubmitted；日期清空用显式 null；无变化不发请求）
 * - 删除：POST /milestone/delete/{id}（逻辑删）
 *
 * 表单 UX 约定（用户硬性要求）：里程碑表单自己持有 AppModal 并接
 * useUnsavedChangesGuard（blocker 独立挂载在 AppModal 之外，X/遮罩/Esc/
 * 取消/返回列表/路由跳转全拦截；成功前 markClean()）；必填项 RequiredMark
 * （状态下拉 aria-label 带"（必填）"）；字段级 FieldError（提交时收集全部
 * 错误，编辑即清该字段）。
 * 父组件每次打开重新挂载本组件（open 条件渲染），表单初始值按
 * initialEdit 计算；弹窗内视图切换（列表↔表单）走 guard，不静默丢草稿。
 */
import { useState } from "react";
import { Button, Label, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  diffMilestoneFields,
  instantToDateOnly,
  milestoneStatusLabel,
  milestoneToFormValues,
  sortMilestones,
  validateMilestoneForm,
  type MilestoneFieldError,
  type MilestoneFormValues,
} from "@/lib/gantt-live";
import { MILESTONE_STATUSES } from "@/lib/api/gantt-types";
import type { MilestoneResponse } from "@/lib/api/gantt-types";
import {
  toUserMessage,
  useCreateMilestone,
  useDeleteMilestone,
  useMilestoneList,
  useUpdateMilestone,
} from "@/lib/query";

const EMPTY_FORM: MilestoneFormValues = {
  name: "",
  status: "not_started",
  startDate: "",
  endDate: "",
};

const STATUS_OPTIONS = MILESTONE_STATUSES.map((status) => ({
  id: status,
  label: milestoneStatusLabel(status),
}));

export function MilestoneDialog({
  open,
  projectId,
  initialEdit,
  onClose,
}: {
  open: boolean;
  projectId: number;
  /** 打开即进入编辑态的里程碑；null = 打开时显示列表 */
  initialEdit: MilestoneResponse | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<"list" | "form">(initialEdit ? "form" : "list");
  const [editTarget, setEditTarget] = useState<MilestoneResponse | null>(initialEdit);

  // 表单视图自己持有 AppModal（含 dirty 守卫），避免外层 X 绕过表单确认；
  // 列表视图单独一个 AppModal（含删除确认）。
  if (view === "form") {
    return (
      <MilestoneFormModal
        key={editTarget ? `edit-${editTarget.id}` : "create"}
        open={open}
        projectId={projectId}
        editTarget={editTarget}
        onSaved={() => {
          setEditTarget(null);
          setView("list");
        }}
        onClose={onClose}
      />
    );
  }
  return (
    <MilestoneListModal
      open={open}
      projectId={projectId}
      onClose={onClose}
      onCreate={() => {
        setEditTarget(null);
        setView("form");
      }}
      onEdit={(milestone) => {
        setEditTarget(milestone);
        setView("form");
      }}
    />
  );
}

function MilestoneListModal({
  open,
  projectId,
  onClose,
  onCreate,
  onEdit,
}: {
  open: boolean;
  projectId: number;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (milestone: MilestoneResponse) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<MilestoneResponse | null>(null);
  const listQuery = useMilestoneList({ projectId });
  const milestones = sortMilestones((listQuery.data ?? []) as MilestoneResponse[]);
  const deleteMutation = useDeleteMilestone();

  const handleDeleteConfirm = () => {
    if (!deleteTarget || deleteMutation.isPending) return;
    const target = deleteTarget;
    deleteMutation.mutate(target.id, {
      onSuccess: () => {
        toast.success(`里程碑「${target.name}」已删除`);
        setDeleteTarget(null);
      },
      onError: (error) => {
        toast.error(`删除失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <>
      <AppModal open={open} title="里程碑" onClose={onClose} size="md">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="type-caption text-default-500">
              里程碑叠加在甘特图时间线上（按日期定位菱形标记）。
            </p>
            <Button size="sm" variant="primary" onPress={onCreate}>
              新建里程碑
            </Button>
          </div>
          {listQuery.isPending ? (
            <div className="flex items-center gap-2 py-6 text-sm text-default-500">
              <Spinner size="sm" />
              正在加载里程碑…
            </div>
          ) : listQuery.isError ? (
            <div className="flex flex-col items-start gap-3 py-4">
              <p role="alert" className="text-sm text-danger">
                里程碑加载失败：{toUserMessage(listQuery.error)}
              </p>
              <Button variant="ghost" onPress={() => void listQuery.refetch()}>
                重试
              </Button>
            </div>
          ) : milestones.length === 0 ? (
            <EmptyHint>还没有里程碑。点击右上角新建。</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {milestones.map((milestone) => (
                <li
                  key={milestone.id}
                  className="flex items-center gap-2 rounded-sm border border-border px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="type-body block truncate">{milestone.name}</span>
                    <span className="type-caption block text-default-500">
                      {milestoneStatusLabel(milestone.status)}
                      {dateRangeText(milestone)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => onEdit(milestone)}
                    aria-label={`编辑里程碑 ${milestone.name}`}
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onPress={() => setDeleteTarget(milestone)}
                    aria-label={`删除里程碑 ${milestone.name}`}
                  >
                    删除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AppModal>

      {/* 删除确认：非表单弹窗，无需 dirty check */}
      <AppModal
        open={deleteTarget !== null}
        title="删除里程碑"
        onClose={() => setDeleteTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定删除里程碑「{deleteTarget?.name}」吗？删除后它将不再出现在甘特图上。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onPress={() => setDeleteTarget(null)}
            isDisabled={deleteMutation.isPending}
          >
            取消
          </Button>
          <Button
            variant="danger"
            onPress={handleDeleteConfirm}
            isDisabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Spinner size="sm" /> : null}
            删除
          </Button>
        </div>
      </AppModal>
    </>
  );
}

function dateRangeText(milestone: MilestoneResponse): string {
  const start = instantToDateOnly(milestone.startDate);
  const end = instantToDateOnly(milestone.endDate);
  if (start && end) return ` · ${start} 至 ${end}`;
  if (end) return ` · ${end}`;
  if (start) return ` · ${start}`;
  return "";
}

/**
 * 里程碑新建/编辑表单弹窗（自己持有 AppModal）。
 *
 * dirty = 当前值 vs 初始值；blocker 渲染在 AppModal 之外（AppModal 的
 * onClose 走 guard，不能把 blocker 挂进 AppModal 内部，否则关闭会卸载
 * 正在等待用户作答的路由拦截）；X/遮罩/Esc/取消/返回列表走 guard；
 * 提交期间不允许关闭；成功先 markClean() 再离开。
 */
function MilestoneFormModal({
  open,
  projectId,
  editTarget,
  onSaved,
  onClose,
}: {
  open: boolean;
  projectId: number;
  editTarget: MilestoneResponse | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = editTarget !== null;
  const initial: MilestoneFormValues = isEdit
    ? milestoneToFormValues(editTarget)
    : EMPTY_FORM;

  const [values, setValues] = useState<MilestoneFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const createMutation = useCreateMilestone();
  const updateMutation = useUpdateMilestone();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isDirty =
    values.name !== initial.name ||
    values.status !== initial.status ||
    values.startDate !== initial.startDate ||
    values.endDate !== initial.endDate;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(isDirty);

  const doClose = () => {
    // 成功保存/无修改关闭后才到这里：onSaved 切回列表视图
    onSaved();
  };

  const close = () => {
    if (isPending) return;
    guard(onClose);
  };

  const cancelToList = () => {
    if (isPending) return;
    guard(doClose);
  };

  const setField = <K extends keyof MilestoneFormValues>(
    field: K,
    value: MilestoneFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    // 编辑即清除该字段错误
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSubmitError("");
  };

  const handleSubmit = () => {
    if (isPending) return;
    setSubmitError("");
    // 收集全部错误，不首错即停；错误挂到对应字段下
    const fieldErrors: MilestoneFieldError[] = validateMilestoneForm(values);
    if (fieldErrors.length > 0) {
      const mapped: Record<string, string> = {};
      for (const error of fieldErrors) mapped[error.field] = error.message;
      setErrors(mapped);
      return;
    }
    if (isEdit) {
      const diff = diffMilestoneFields(editTarget.id, values, initial);
      if (!diff) {
        // 无任何变化：直接返回列表，不发请求
        markClean();
        doClose();
        return;
      }
      updateMutation.mutate(diff, {
        onSuccess: () => {
          toast.success(`里程碑「${values.name.trim()}」已更新`);
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`保存失败：${toUserMessage(error)}`);
        },
      });
      return;
    }
    createMutation.mutate(
      {
        projectId,
        name: values.name.trim(),
        status: values.status,
        ...(values.startDate ? { startDate: `${values.startDate}T00:00:00Z` } : {}),
        ...(values.endDate ? { endDate: `${values.endDate}T00:00:00Z` } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`里程碑「${values.name.trim()}」已创建`);
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`创建失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const dateInputClass =
    "type-body h-9 w-full rounded-sm border border-border bg-surface px-2";

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：AppModal 关闭会卸载内部子树，
          正在等待用户作答的路由拦截不能被卸载。 */}
      {blocker}
      <AppModal
        open={open}
        title={isEdit ? "编辑里程碑" : "新建里程碑"}
        onClose={close}
        size="sm"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1 block">
              里程碑名称<RequiredMark />
            </Label>
            <input
              aria-label="里程碑名称"
              className={dateInputClass}
              value={values.name}
              maxLength={100}
              placeholder="请输入里程碑名称"
              disabled={isPending}
              onChange={(event) => setField("name", event.target.value)}
            />
            <FieldError message={errors.name} />
          </div>
          <div>
            <Label className="mb-1 block">
              状态<RequiredMark />
            </Label>
            <OptionSelect
              label="状态（必填）"
              value={values.status}
              options={STATUS_OPTIONS}
              onChange={(value) => setField("status", value)}
              isDisabled={isPending}
            />
            <FieldError message={errors.status} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">开始日期</Label>
              <input
                type="date"
                aria-label="开始日期"
                className={dateInputClass}
                value={values.startDate}
                disabled={isPending}
                onChange={(event) => setField("startDate", event.target.value)}
              />
              <FieldError message={errors.startDate} />
            </div>
            <div>
              <Label className="mb-1 block">结束日期</Label>
              <input
                type="date"
                aria-label="结束日期"
                className={dateInputClass}
                value={values.endDate}
                disabled={isPending}
                onChange={(event) => setField("endDate", event.target.value)}
              />
              <FieldError message={errors.endDate} />
            </div>
          </div>
          {submitError ? (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-between">
            <Button variant="ghost" onPress={cancelToList} isDisabled={isPending}>
              {isEdit ? "返回列表" : "取消"}
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
              {isPending ? <Spinner size="sm" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
