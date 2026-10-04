/**
 * 版本新建/编辑弹窗（P2：p2-version-slices）。
 *
 * 登录态纯展示组件：
 * - mode=create：POST /version/v1/createVersion（useCreateVersion）
 * - mode=edit：POST /version/v1/updateVersion（useUpdateVersion；
 *   载荷含 id 的字段级更新，空白的可选字段省略 = 保留原值，后端不支持通过编辑清空）
 * - 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于 AppModal
 *   挂载，X/遮罩/Esc/取消按钮走 guard(doClose)）、必填字段 RequiredMark、
 *   校验返回 {field,message}[] 全量收集、FieldError（role="alert"）挂在对应
 *   输入正下方、编辑时清除该字段错误
 * - 校验口径忠实老前端 VersionForm.vue：name 2～100 必填、versionNumber 1～50
 *   必填、description ≤2000、versionType 必填、plannedEndDate ≥ plannedStartDate
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, OptionSelect, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useCreateVersion, useUpdateVersion } from "@/lib/query";
import {
  editFormFromVersion,
  emptyVersionFormInput,
  validateVersionFormInput,
  buildVersionCreatePayload,
  buildVersionUpdatePayload,
} from "@/lib/version-form";
import type { VersionResponse, VersionType } from "@/lib/api/version-types";
import { VERSION_TYPES } from "@/lib/api/version-types";

const VERSION_TYPE_OPTIONS = VERSION_TYPES.map((versionType) => ({
  id: versionType,
  label: versionType,
}));

const DATE_PLACEHOLDER = "YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss";

export function VersionFormDialog({
  open,
  projectId,
  version,
  onClose,
}: {
  open: boolean;
  projectId: number;
  /** 编辑模式回填的版本；null = 新建模式 */
  version?: VersionResponse | null;
  onClose: () => void;
}) {
  const mode = version != null ? "edit" : "create";
  const createMutation = useCreateVersion();
  const updateMutation = useUpdateVersion();
  const mutation = mode === "create" ? createMutation : updateMutation;

  const [form, setForm] = useState(emptyVersionFormInput());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有，不受后台 refetch 影响）；dirty = 当前值偏离快照
  const initialFormRef = useRef<string | null>(null);
  // 每次打开重置表单并建立快照：在绘制前同步完成，避免首帧闪现旧输入
  // （沿用 defect-transition-dialog 的 useLayoutEffect 语义）
  useLayoutEffect(() => {
    if (open) {
      const snapshot = version != null ? editFormFromVersion(version) : emptyVersionFormInput();
      initialFormRef.current = JSON.stringify(snapshot);
      setForm(snapshot);
      setFieldErrors({});
      setSubmitError("");
    }
    // 只在 open 翻转时重置；version 变化由调用方以 open=false→true 重新打开承载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const isDirty = JSON.stringify(form) !== initialFormRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页（P1 finding）
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
    const errors = validateVersionFormInput(form);
    if (errors.length > 0) {
      const nextFieldErrors: Record<string, string> = {};
      for (const error of errors) nextFieldErrors[error.field] = error.message;
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitError("");
    if (mode === "create") {
      createMutation.mutate(buildVersionCreatePayload(form, projectId), {
        onSuccess: (id) => {
          toast.success(`版本已创建（#${id}）`);
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
      updateMutation.mutate(buildVersionUpdatePayload(version!.id, form), {
        onSuccess: () => {
          toast.success("版本已更新");
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`更新失败：${toUserMessage(error)}`);
        },
      });
    }
  };

  const title = mode === "create" ? "新建版本" : "编辑版本";
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
              <TextField value={form.name} onChange={(next) => set({ name: next })} aria-label="版本名称">
                <Label>
                  版本名称<RequiredMark />
                </Label>
                <Input placeholder="如 用户中心 v2.0" />
              </TextField>
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <TextField value={form.versionNumber} onChange={(next) => set({ versionNumber: next })} aria-label="版本号">
                <Label>
                  版本号<RequiredMark />
                </Label>
                <Input placeholder="如 2.0.0" />
              </TextField>
              <FieldError message={fieldErrors.versionNumber} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>
                版本类型<RequiredMark />
              </Label>
              <OptionSelect
                label="版本类型（必填）"
                value={form.versionType}
                options={VERSION_TYPE_OPTIONS}
                onChange={(next) => set({ versionType: next as VersionType })}
              />
              <FieldError message={fieldErrors.versionType} />
            </div>
            <div>
              <TextField value={form.assigneeId} onChange={(next) => set({ assigneeId: next })} aria-label="负责人用户 ID">
                <Label>负责人用户 ID</Label>
                <Input placeholder="正整数，留空则不修改" inputMode="numeric" />
              </TextField>
              <FieldError message={fieldErrors.assigneeId} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <TextField value={form.plannedStartDate} onChange={(next) => set({ plannedStartDate: next })} aria-label="计划开始日期">
                <Label>计划开始日期</Label>
                <Input placeholder={DATE_PLACEHOLDER} />
              </TextField>
              <FieldError message={fieldErrors.plannedStartDate} />
            </div>
            <div>
              <TextField value={form.plannedEndDate} onChange={(next) => set({ plannedEndDate: next })} aria-label="计划结束日期">
                <Label>计划结束日期</Label>
                <Input placeholder={DATE_PLACEHOLDER} />
              </TextField>
              <FieldError message={fieldErrors.plannedEndDate} />
            </div>
            <div>
              <TextField value={form.plannedReleaseDate} onChange={(next) => set({ plannedReleaseDate: next })} aria-label="计划发布日期">
                <Label>计划发布日期</Label>
                <Input placeholder={DATE_PLACEHOLDER} />
              </TextField>
              <FieldError message={fieldErrors.plannedReleaseDate} />
            </div>
          </div>

          <div>
            <TextField value={form.description} onChange={(next) => set({ description: next })} aria-label="版本描述">
              <Label>版本描述</Label>
              <TextArea rows={3} placeholder="这个版本的目标与范围…" />
            </TextField>
            <FieldError message={fieldErrors.description} />
          </div>

          <TextField value={form.tags} onChange={(next) => set({ tags: next })} aria-label="标签">
            <Label>标签</Label>
            <Input placeholder="逗号分隔" />
          </TextField>

          {mode === "edit" ? (
            <p className="type-caption text-default-500">
              说明：留空的字段将保留原值（后端不支持通过编辑清空）；状态请走详情页「状态流转」——此处不允许直接改。
            </p>
          ) : null}
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
