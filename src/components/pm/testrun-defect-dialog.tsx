/**
 * 执行缺陷闭环弹窗（P2：p2-testrun-workspace）。
 *
 * 忠实老前端 ExecutionDefectDialog 的双模式：
 * - 创建缺陷：POST /testExecution/v1/{executionId}/defects（仅失败/阻塞的
 *   attempt；项目与报告人由服务端可信事实填充）。字段：标题（必填，1–200
 *   码点）/ 描述 / 缺陷类型 / 严重度 / 优先级 / 复现步骤 / 期望结果 / 实际结果。
 *   成功后失效测试轮域与缺陷域缓存（与缺陷域联动）
 * - 关联已有缺陷：POST /testExecution/v1/{executionId}/defect-links，
 *   请求体 { defectId }（正整数必填）。后端幂等返回
 *   LINKED / ALREADY_LINKED，文案如实区分。
 *
 * 缺陷类型选项复用老前端 DEFECT_TYPE_OPTIONS（功能缺陷/性能缺陷/安全缺陷/
 * 界面缺陷/其他）；严重度/优先级复用缺陷域 DEFECT_SEVERITIES/DEFECT_PRIORITIES
 * 与 severityLabel，不重造类型。
 *
 * 表单 UX：dirty check、必填星号、字段级错误、编辑即清；请求进行中禁用关闭。
 */
import { useRef, useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  severityLabel,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  toUserMessage,
  useCreateDefectFromExecution,
  useLinkExistingDefect,
} from "@/lib/query";
import {
  buildCreateExecutionDefectPayload,
  buildLinkExistingDefectPayload,
  emptyExecutionDefectInput,
  validateExecutionDefectInput,
} from "@/lib/testrun-form";
import type { ExecutionDefectInput } from "@/lib/testrun-form";
import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
} from "@/lib/api/defect-types";
import type { DefectPriority, DefectSeverity } from "@/lib/api/defect-types";

/** 老前端 DEFECT_TYPE_OPTIONS（frontend/src/types/defect.ts） */
const DEFECT_TYPE_OPTIONS = [
  "功能缺陷",
  "性能缺陷",
  "安全缺陷",
  "界面缺陷",
  "其他",
].map((value) => ({ id: value, label: value }));

const SEVERITY_OPTIONS = DEFECT_SEVERITIES.map((severity) => ({
  id: severity,
  label: severityLabel(severity),
}));

/** 老前端 DEFECT_PRIORITY_LABEL_MAP（frontend/src/types/defect.ts） */
const PRIORITY_LABELS: Record<DefectPriority, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};
const PRIORITY_OPTIONS = DEFECT_PRIORITIES.map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
}));

export function TestRunDefectDialog({
  open,
  executionId,
  onClose,
}: {
  open: boolean;
  /** 目标 attempt（失败/阻塞）；null 时不渲染表单 */
  executionId: number | null;
  onClose: () => void;
}) {
  const createDefect = useCreateDefectFromExecution();
  const linkDefect = useLinkExistingDefect();
  const isPending = createDefect.isPending || linkDefect.isPending;

  const [form, setForm] = useState<ExecutionDefectInput>(emptyExecutionDefectInput);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) {
    initialRef.current = JSON.stringify(emptyExecutionDefectInput());
  }
  const isDirty = JSON.stringify(form) !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    open && isDirty,
  );

  const set = (patch: Partial<ExecutionDefectInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSubmitError("");
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
    setForm(emptyExecutionDefectInput());
    setFieldErrors({});
    setSubmitError("");
    onClose();
  };

  const close = () => {
    if (isPending) return;
    guard(doClose);
  };

  const handleSubmit = () => {
    if (isPending || executionId === null) return;
    const errors = validateExecutionDefectInput(form);
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    const finish = () => {
      markClean();
      doClose();
    };
    const fail = (error: unknown) => {
      setSubmitError(`提交失败：${toUserMessage(error)}`);
    };
    if (form.mode === "link") {
      linkDefect.mutate(
        {
          executionId,
          data: buildLinkExistingDefectPayload(form),
        },
        {
          onSuccess: (response) => {
            toast.success(
              response.operation === "ALREADY_LINKED"
                ? `缺陷 #${response.defect.id} 已关联（之前已关联）`
                : `缺陷 #${response.defect.id} 已关联`,
            );
            finish();
          },
          onError: fail,
        },
      );
    } else {
      createDefect.mutate(
        {
          executionId,
          data: buildCreateExecutionDefectPayload(form),
        },
        {
          onSuccess: (response) => {
            toast.success(
              response.operation === "CREATED"
                ? `缺陷 #${response.defect.id} 已创建并关联`
                : `缺陷 #${response.defect.id} 已关联（${response.operation}）`,
            );
            finish();
          },
          onError: fail,
        },
      );
    }
  };

  return (
    <>
      {blocker}
      <AppModal
        open={open}
        title={`执行缺陷闭环${executionId !== null ? `（执行 #${executionId}）` : ""}`}
        onClose={close}
        size="lg"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="缺陷闭环方式" className="flex gap-2">
            <Button
              size="sm"
              variant={form.mode === "create" ? "primary" : "ghost"}
              isDisabled={isPending}
              onPress={() => set({ mode: "create" })}
            >
              创建缺陷
            </Button>
            <Button
              size="sm"
              variant={form.mode === "link" ? "primary" : "ghost"}
              isDisabled={isPending}
              onPress={() => set({ mode: "link" })}
            >
              关联已有缺陷
            </Button>
          </div>

          {form.mode === "link" ? (
            <div>
              <TextField
                isDisabled={isPending}
                value={form.defectId}
                onChange={(next) => set({ defectId: next })}
                aria-label="缺陷 ID"
              >
                <Label>
                  缺陷 ID<RequiredMark />
                </Label>
                <Input inputMode="numeric" placeholder="正整数" />
              </TextField>
              <FieldError message={fieldErrors.defectId} />
            </div>
          ) : (
            <>
              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.title}
                  onChange={(next) => set({ title: next })}
                  aria-label="缺陷标题"
                >
                  <Label>
                    缺陷标题<RequiredMark />
                  </Label>
                  <Input placeholder="标题（1–200 个字符）" />
                </TextField>
                <FieldError message={fieldErrors.title} />
              </div>

              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.description}
                  onChange={(next) => set({ description: next })}
                  aria-label="描述"
                >
                  <Label>描述</Label>
                  <TextArea rows={3} placeholder="缺陷描述（可选）" />
                </TextField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label>缺陷类型</Label>
                  <OptionSelect
                    isDisabled={isPending}
                    label="缺陷类型"
                    value={form.defectType}
                    options={DEFECT_TYPE_OPTIONS}
                    onChange={(next) => set({ defectType: next })}
                  />
                </div>
                <div>
                  <Label>严重度</Label>
                  <OptionSelect
                    isDisabled={isPending}
                    label="严重度"
                    value={form.severity}
                    options={SEVERITY_OPTIONS}
                    onChange={(next) => set({ severity: next as DefectSeverity })}
                  />
                </div>
                <div>
                  <Label>优先级</Label>
                  <OptionSelect
                    isDisabled={isPending}
                    label="优先级"
                    value={form.priority}
                    options={PRIORITY_OPTIONS}
                    onChange={(next) => set({ priority: next as DefectPriority })}
                  />
                </div>
              </div>

              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.reproductionSteps}
                  onChange={(next) => set({ reproductionSteps: next })}
                  aria-label="复现步骤"
                >
                  <Label>复现步骤</Label>
                  <TextArea rows={3} placeholder="复现步骤（可选）" />
                </TextField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <TextField
                    isDisabled={isPending}
                    value={form.expectedResult}
                    onChange={(next) => set({ expectedResult: next })}
                    aria-label="期望结果"
                  >
                    <Label>期望结果</Label>
                    <TextArea rows={2} placeholder="期望结果（可选）" />
                  </TextField>
                </div>
                <div>
                  <TextField
                    isDisabled={isPending}
                    value={form.actualResult}
                    onChange={(next) => set({ actualResult: next })}
                    aria-label="实际结果"
                  >
                    <Label>实际结果</Label>
                    <TextArea rows={2} placeholder="实际结果（可选）" />
                  </TextField>
                </div>
              </div>
            </>
          )}

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
              {isPending ? "提交中…" : form.mode === "link" ? "关联缺陷" : "创建缺陷"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
