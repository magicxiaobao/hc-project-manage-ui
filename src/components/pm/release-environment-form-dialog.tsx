/**
 * 发布环境新建/编辑弹窗（P2：p2-release-env）。
 *
 * 登录态纯展示组件：
 * - mode=create：POST /release-environment/v1/create（useCreateReleaseEnvironment）
 * - mode=edit：POST /release-environment/v1/update（useUpdateReleaseEnvironment；
 *   id/name/order 必填；approvalRequired 随状态：ACTIVE 环境必填、INACTIVE
 *   环境必须省略，由 buildEnvironmentUpdatePayload 保证）
 * - 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于 AppModal
 *   挂载，X/遮罩/Esc/取消按钮走 guard(doClose)）、必填字段 RequiredMark、
 *   校验返回 {field,message}[] 全量收集、FieldError（role="alert"）挂在对应
 *   输入正下方、编辑时清除该字段错误
 * - 校验口径忠实后端 ReleaseEnvironmentService + 老前端 ReleaseEnvironmentForm.vue：
 *   name 必填且 ≤100 码点、category 必填（四类，编辑时不可改）、order 必填
 *   非负整数且 ≤2147483647；生产环境需要审批被后端强制为 true
 *   （切换到生产类别时自动勾选并禁用开关，与老前端一致）
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Checkbox, Input, Label, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, OptionSelect, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useCreateReleaseEnvironment, useUpdateReleaseEnvironment } from "@/lib/query";
import {
  buildEnvironmentCreatePayload,
  buildEnvironmentUpdatePayload,
  categoryForcesApproval,
  editFormFromEnvironment,
  emptyEnvironmentFormInput,
  validateEnvironmentFormInput,
} from "@/lib/release-environment-form";
import type { ReleaseEnvironmentResponse } from "@/lib/api/releaseEnvironment-types";
import {
  RELEASE_ENVIRONMENT_CATEGORIES,
  RELEASE_ENVIRONMENT_CATEGORY_LABELS,
} from "@/lib/api/releaseEnvironment-types";

const CATEGORY_OPTIONS = RELEASE_ENVIRONMENT_CATEGORIES.map((category) => ({
  id: category,
  label: RELEASE_ENVIRONMENT_CATEGORY_LABELS[category],
}));

export function ReleaseEnvironmentFormDialog({
  open,
  projectId,
  environment,
  onClose,
}: {
  open: boolean;
  projectId: number;
  /** 编辑模式回填的环境；null = 新建模式 */
  environment?: ReleaseEnvironmentResponse | null;
  onClose: () => void;
}) {
  const mode = environment != null ? "edit" : "create";
  const createMutation = useCreateReleaseEnvironment();
  const updateMutation = useUpdateReleaseEnvironment();
  const mutation = mode === "create" ? createMutation : updateMutation;

  const [form, setForm] = useState(emptyEnvironmentFormInput());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 编辑态下环境类别不可改（后端 update 根本不接受 category）
  const categoryLocked = mode === "edit";
  // 已停用环境的审批开关不可改：后端强制 INACTIVE 更新省略 approvalRequired
  const approvalLocked = mode === "edit" && environment?.status === "INACTIVE";
  // 生产环境后端强制需要审批：开关自动勾选并禁用（沿用老前端语义）
  const approvalForced = categoryForcesApproval(form.category);
  const approvalDisabled = approvalLocked || approvalForced;

  // 打开瞬间的表单快照（ref 持有，不受后台 refetch 影响）；dirty = 当前值偏离快照
  const initialFormRef = useRef<string | null>(null);
  // 每次打开重置表单并建立快照：在绘制前同步完成，避免首帧闪现旧输入
  useLayoutEffect(() => {
    if (open) {
      const snapshot = environment != null ? editFormFromEnvironment(environment) : emptyEnvironmentFormInput();
      initialFormRef.current = JSON.stringify(snapshot);
      setForm(snapshot);
      setFieldErrors({});
      setSubmitError("");
    }
    // 只在 open 翻转时重置；environment 变化由调用方以 open=false→true 重新打开承载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const isDirty = JSON.stringify(form) !== initialFormRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<typeof form>) => {
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

  const setCategory = (next: string) => {
    // 老前端 watch 语义：切到生产类别时自动勾选需要审批
    if (categoryForcesApproval(next)) {
      set({ category: next, approvalRequired: true });
    } else {
      set({ category: next });
    }
  };

  const doClose = () => {
    onClose();
  };

  const close = () => {
    // 请求进行中不允许关闭：旧请求的成功/失败回调会重置并关闭重新打开的弹窗，
    // 丢失用户正在填写的新草稿（沿用 DefectCreateDialog 教训）
    if (mutation.isPending) return;
    // 用户主动关闭且表单脏时，先确认是否放弃修改
    guard(doClose);
  };

  const handleSubmit = () => {
    if (mutation.isPending) return;
    const errors = validateEnvironmentFormInput(form, environment?.status ?? null);
    if (errors.length > 0) {
      const nextFieldErrors: Record<string, string> = {};
      for (const error of errors) nextFieldErrors[error.field] = error.message;
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitError("");
    if (mode === "create") {
      createMutation.mutate(buildEnvironmentCreatePayload(form, projectId), {
        onSuccess: (created) => {
          toast.success(`发布环境已创建（${created.name}）`);
          // 成功 = 已授权离开：同步置位 cleanRef，避免提交成功的程序化关闭
          // 被守卫拦截（沿用 defect-create-dialog 语义）
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`创建失败：${toUserMessage(error)}`);
        },
      });
    } else {
      updateMutation.mutate(buildEnvironmentUpdatePayload(environment!.id, form, environment!.status), {
        onSuccess: () => {
          toast.success("发布环境已更新");
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`更新失败：${toUserMessage(error)}`);
        },
      });
    }
  };

  const title = mode === "create" ? "新建发布环境" : "编辑发布环境";
  const submitLabel = mutation.isPending ? (mode === "create" ? "创建中…" : "保存中…") : mode === "create" ? "创建" : "保存";

  return (
    <>
      {/*
        blocker 必须独立于 AppModal 挂载：弹窗关闭（提交成功）不能卸载一个正在
        等待用户作答的路由拦截，否则那次导航会永远挂起（P2）。
      */}
      {blocker}
      <AppModal open={open} title={title} onClose={close} size="lg">
        {dialog}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                value={form.name}
                onChange={(next) => set({ name: next })}
                aria-label="环境名称"
                isDisabled={mutation.isPending}
              >
                <Label>
                  环境名称<RequiredMark />
                </Label>
                <Input placeholder="如 预发布环境" />
              </TextField>
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <Label>
                环境类别<RequiredMark />
              </Label>
              <OptionSelect
                label="环境类别（必填）"
                value={form.category}
                options={CATEGORY_OPTIONS}
                onChange={setCategory}
                isDisabled={categoryLocked || mutation.isPending}
              />
              <FieldError message={fieldErrors.category} />
              {categoryLocked ? (
                <p className="type-caption mt-1 text-default-500">环境类别创建后不可修改。</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                value={form.order}
                onChange={(next) => set({ order: next })}
                aria-label="排序"
                isDisabled={mutation.isPending}
              >
                <Label>
                  排序<RequiredMark />
                </Label>
                <Input placeholder="非负整数" inputMode="numeric" />
              </TextField>
              <FieldError message={fieldErrors.order} />
            </div>
            <div>
              <Checkbox
                isSelected={form.approvalRequired}
                isDisabled={approvalDisabled || mutation.isPending}
                onChange={(selected) => set({ approvalRequired: selected })}
                aria-label="需要审批"
              >
                需要审批
              </Checkbox>
              {approvalForced ? (
                <p className="type-caption mt-1 text-default-500">生产环境后端强制要求审批。</p>
              ) : null}
              {approvalLocked ? (
                <p className="type-caption mt-1 text-default-500">
                  已停用环境的审批要求不可修改（后端强制省略该字段）。
                </p>
              ) : null}
              <FieldError message={fieldErrors.approvalRequired} />
            </div>
          </div>

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={mutation.isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={mutation.isPending}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
