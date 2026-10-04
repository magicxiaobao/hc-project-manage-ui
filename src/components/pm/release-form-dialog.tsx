/**
 * 发布草稿新建/编辑弹窗（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件：
 * - ReleaseDraftCreateDialog：POST /release/v1/create（useCreateReleaseDraft）；
 *   环境下拉仅展示项目 ACTIVE 环境（老前端 ReleaseDraft.vue
 *   activeEnvironments 口径）；空白可选字段省略发送；idempotencyKey 由载荷
 *   构建函数每次新建（crypto.randomUUID）
 * - ReleaseDraftEditDialog：POST /release/v1/updateDraft
 *   （useUpdateReleaseDraft；整包覆盖：空白文本字段省略 key，后端写 null，
 *   forceUpdate 按开关送，adminReason 空白省略）
 * - 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于
 *   AppModal 挂载，X/遮罩/Esc/取消按钮走 guard(doClose)；成功提交前
 *   markClean()）、必填字段 RequiredMark、校验返回 {field,message}[] 全量
 *   收集、FieldError（role="alert"）挂在对应输入正下方、编辑时清除该字段错误
 * - 在途禁用全部可编辑控件（r22 教训：请求回调 markClean()+doClose() 不可
 *   静默丢弃在途修改）
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Checkbox, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, OptionSelect, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useCreateReleaseDraft, useReleaseEnvironmentList, useUpdateReleaseDraft } from "@/lib/query";
import {
  buildReleaseCreatePayload,
  buildReleaseDraftUpdatePayload,
  editDraftFormFromRelease,
  emptyReleaseDraftCreateInput,
  emptyReleaseDraftEditInput,
  validateReleaseDraftCreateInput,
} from "@/lib/release-form";
import type {
  ReleaseDraftCreateInput,
  ReleaseDraftEditInput,
} from "@/lib/release-form";
import type { ReleaseResponse } from "@/lib/api/release-types";

/**
 * 弹窗表单通用脚手架（沿用 release-environment-form-dialog 模式）：
 * - open 翻转时在绘制前重置表单并建立快照（ref 持有，不受后台 refetch 影响）
 * - isDirty = 当前值偏离快照；open && isDirty 时布防
 * - blocker 独立于 AppModal 挂载；dialog 渲染在 AppModal 内
 * - close：请求进行中不允许关闭；脏时走 guard(doClose)
 */
function useDraftDialogShell<Form extends object>({
  open,
  initial,
  isPending,
  onClose,
}: {
  open: boolean;
  initial: () => Form;
  isPending: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Form>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const initialFormRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (open) {
      const snapshot = initial();
      initialFormRef.current = JSON.stringify(snapshot);
      setForm(snapshot);
      setFieldErrors({});
      setSubmitError("");
    }
    // 只在 open 翻转时重置；依赖变化由调用方以 open=false→true 重新打开承载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = JSON.stringify(form) !== initialFormRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  };

  const doClose = () => {
    onClose();
  };

  const close = () => {
    // 请求进行中不允许关闭：旧请求的成功/失败回调会重置并关闭重新打开的弹窗，
    // 丢失用户正在填写的新草稿（沿用 DefectCreateDialog 教训）
    if (isPending) return;
    // 用户主动关闭且表单脏时，先确认是否放弃修改
    guard(doClose);
  };

  return {
    form,
    set,
    fieldErrors,
    setFieldErrors,
    submitError,
    setSubmitError,
    guard,
    dialog,
    blocker,
    markClean,
    doClose,
    close,
    isDirty,
  };
}

function MultilineField({
  label,
  value,
  onChange,
  disabled,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <TextField value={value} onChange={onChange} aria-label={label} isDisabled={disabled}>
        <Label>{label}</Label>
        <TextArea placeholder={placeholder} />
      </TextField>
      <FieldError message={error} />
    </div>
  );
}

export function ReleaseDraftCreateDialog({
  open,
  projectId,
  versionId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: number;
  /** 所属版本 id：草稿归属的版本（老前端 ReleaseDraft.vue 路由版本一致） */
  versionId: number;
  onClose: () => void;
  /** 创建成功回调：返回新建的发布响应（调用方用于跳转详情） */
  onCreated?: (release: ReleaseResponse) => void;
}) {
  const createMutation = useCreateReleaseDraft();
  const envQuery = useReleaseEnvironmentList({ projectId });
  const activeEnvironments = (envQuery.data ?? []).filter(
    (environment) => environment.status === "ACTIVE",
  );

  const shell = useDraftDialogShell<ReleaseDraftCreateInput>({
    open,
    initial: emptyReleaseDraftCreateInput,
    isPending: createMutation.isPending,
    onClose,
  });
  const { form, set, fieldErrors, setFieldErrors, submitError, setSubmitError } = shell;

  const environmentOptions = activeEnvironments.map((environment) => ({
    id: String(environment.id),
    label: environment.name,
  }));

  const handleSubmit = () => {
    if (createMutation.isPending) return;
    const errors = validateReleaseDraftCreateInput(
      form,
      activeEnvironments.map((environment) => environment.id),
    );
    if (errors.length > 0) {
      const nextFieldErrors: Record<string, string> = {};
      for (const error of errors) nextFieldErrors[error.field] = error.message;
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitError("");
    createMutation.mutate(buildReleaseCreatePayload(form, versionId), {
      onSuccess: (created) => {
        toast.success(`发布草稿已创建（#${created.id}）`);
        // 成功 = 已授权离开：同步置位 cleanRef，避免提交成功的程序化关闭
        // 被守卫拦截（沿用 defect-create-dialog 语义）
        shell.markClean();
        shell.doClose();
        onCreated?.(created);
      },
      onError: (error) => {
        setSubmitError(`创建失败：${toUserMessage(error)}`);
      },
    });
  };

  const submitLabel = createMutation.isPending ? "创建中…" : "创建草稿";

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：弹窗关闭（提交成功）不能卸载一个正在
          等待用户作答的路由拦截，否则那次导航会永远挂起（P2）。 */}
      {shell.blocker}
      <AppModal open={open} title="新建发布草稿" onClose={shell.close} size="lg">
        {shell.dialog}
        <div className="flex flex-col gap-4">
          <div>
            <Label>
              发布环境<RequiredMark />
            </Label>
            <OptionSelect
              label="发布环境（必填）"
              value={form.environmentId}
              options={environmentOptions}
              onChange={(next) => set({ environmentId: next })}
              isDisabled={createMutation.isPending || envQuery.isPending}
            />
            <FieldError message={fieldErrors.environmentId} />
            {envQuery.isError ? (
              <p className="type-caption mt-1 text-danger">
                环境列表加载失败，请关闭后重试。
              </p>
            ) : null}
            {envQuery.isSuccess && activeEnvironments.length === 0 ? (
              <p className="type-caption mt-1 text-default-500">
                项目暂无可用（ACTIVE）环境，请先创建并启用发布环境。
              </p>
            ) : null}
          </div>

          <MultilineField
            label="发布说明"
            value={form.releaseNotes}
            onChange={(next) => set({ releaseNotes: next })}
            disabled={createMutation.isPending}
            error={fieldErrors.releaseNotes}
            placeholder="本次发布包含的内容概述"
          />
          <MultilineField
            label="变更记录"
            value={form.changelog}
            onChange={(next) => set({ changelog: next })}
            disabled={createMutation.isPending}
            error={fieldErrors.changelog}
            placeholder="功能新增/缺陷修复/优化清单"
          />
          <MultilineField
            label="回滚方案"
            value={form.rollbackPlan}
            onChange={(next) => set({ rollbackPlan: next })}
            disabled={createMutation.isPending}
            error={fieldErrors.rollbackPlan}
            placeholder="发布失败时的回滚步骤"
          />
          <MultilineField
            label="已知问题"
            value={form.knownIssues}
            onChange={(next) => set({ knownIssues: next })}
            disabled={createMutation.isPending}
            error={fieldErrors.knownIssues}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                value={form.compatibility}
                onChange={(next) => set({ compatibility: next })}
                aria-label="兼容性"
                isDisabled={createMutation.isPending}
              >
                <Label>兼容性</Label>
                <Input placeholder="如 需数据库迁移" />
              </TextField>
              <FieldError message={fieldErrors.compatibility} />
            </div>
            <div>
              <TextField
                value={form.dependencies}
                onChange={(next) => set({ dependencies: next })}
                aria-label="依赖"
                isDisabled={createMutation.isPending}
              >
                <Label>依赖</Label>
                <Input placeholder="如 依赖上游服务版本" />
              </TextField>
              <FieldError message={fieldErrors.dependencies} />
            </div>
          </div>

          <div>
            <Checkbox
              isSelected={form.forceUpdate}
              isDisabled={createMutation.isPending}
              onChange={(selected) => set({ forceUpdate: selected })}
              aria-label="强制更新"
            >
              强制更新
            </Checkbox>
          </div>

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={shell.close} isDisabled={createMutation.isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={createMutation.isPending}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}

export function ReleaseDraftEditDialog({
  open,
  release,
  onClose,
}: {
  open: boolean;
  /** 正在编辑的发布（仅草稿态可编辑；调用方保证） */
  release: ReleaseResponse;
  onClose: () => void;
}) {
  const updateMutation = useUpdateReleaseDraft();

  const shell = useDraftDialogShell<ReleaseDraftEditInput>({
    open,
    initial: () =>
      release.id > 0 ? editDraftFormFromRelease(release) : emptyReleaseDraftEditInput(),
    isPending: updateMutation.isPending,
    onClose,
  });
  const { form, set, fieldErrors, setFieldErrors, submitError, setSubmitError } = shell;

  const handleSubmit = () => {
    if (updateMutation.isPending) return;
    // 整包覆盖：各字段均可选，无必填校验
    setFieldErrors({});
    setSubmitError("");
    updateMutation.mutate(buildReleaseDraftUpdatePayload(release.id, form), {
      onSuccess: () => {
        toast.success("发布草稿已更新");
        shell.markClean();
        shell.doClose();
      },
      onError: (error) => {
        setSubmitError(`更新失败：${toUserMessage(error)}`);
      },
    });
  };

  const submitLabel = updateMutation.isPending ? "保存中…" : "保存草稿";

  return (
    <>
      {shell.blocker}
      <AppModal open={open} title={`编辑发布草稿（#${release.id}）`} onClose={shell.close} size="lg">
        {shell.dialog}
        <div className="flex flex-col gap-4">
          <p className="type-caption text-default-500">
            整包覆盖语义：留空的文本字段会被清空（后端写 null）；强制更新开关按当前值保存。
          </p>

          <MultilineField
            label="发布说明"
            value={form.releaseNotes}
            onChange={(next) => set({ releaseNotes: next })}
            disabled={updateMutation.isPending}
            error={fieldErrors.releaseNotes}
          />
          <MultilineField
            label="变更记录"
            value={form.changelog}
            onChange={(next) => set({ changelog: next })}
            disabled={updateMutation.isPending}
            error={fieldErrors.changelog}
          />
          <MultilineField
            label="回滚方案"
            value={form.rollbackPlan}
            onChange={(next) => set({ rollbackPlan: next })}
            disabled={updateMutation.isPending}
            error={fieldErrors.rollbackPlan}
          />
          <MultilineField
            label="已知问题"
            value={form.knownIssues}
            onChange={(next) => set({ knownIssues: next })}
            disabled={updateMutation.isPending}
            error={fieldErrors.knownIssues}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                value={form.compatibility}
                onChange={(next) => set({ compatibility: next })}
                aria-label="兼容性"
                isDisabled={updateMutation.isPending}
              >
                <Label>兼容性</Label>
                <Input placeholder="如 需数据库迁移" />
              </TextField>
              <FieldError message={fieldErrors.compatibility} />
            </div>
            <div>
              <TextField
                value={form.dependencies}
                onChange={(next) => set({ dependencies: next })}
                aria-label="依赖"
                isDisabled={updateMutation.isPending}
              >
                <Label>依赖</Label>
                <Input placeholder="如 依赖上游服务版本" />
              </TextField>
              <FieldError message={fieldErrors.dependencies} />
            </div>
          </div>

          <div>
            <Checkbox
              isSelected={form.forceUpdate}
              isDisabled={updateMutation.isPending}
              onChange={(selected) => set({ forceUpdate: selected })}
              aria-label="强制更新"
            >
              强制更新
            </Checkbox>
          </div>

          <MultilineField
            label="管理员原因（代他人修改时填写）"
            value={form.adminReason}
            onChange={(next) => set({ adminReason: next })}
            disabled={updateMutation.isPending}
            error={fieldErrors.adminReason}
            placeholder="选填：代他人修改草稿时说明原因"
          />

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={shell.close} isDisabled={updateMutation.isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={updateMutation.isPending}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
