/**
 * 卡片拖拽流转的流转文本收集弹窗（P3：p3-board-kanban）。
 *
 * 后端 TaskWorkflowService.dispatch 的硬要求：
 * - 目标 PAUSED/CANCELLED：必须提供原因（requireText）；
 * - 目标 COMPLETED：必须提供交付物或说明（deliverables，无则用 reason）；
 * - COMPLETED → IN_PROGRESS（重新打开）：必须提供原因。
 * 不收集这些文本，拖拽后的 updateStatus 必被后端拒绝。
 *
 * 表单 UX 约定：文本域是表单 → useUnsavedChangesGuard dirty check；
 * 必填星号（RequiredMark）；空文本在字段下方 FieldError 提示（编辑即清）。
 * 文本为空时确认按钮禁用并提示，前端先拦截省一次后端往返。
 *
 * 父组件按 open/key 重挂载本弹窗（与 BoardFormDialog 同一模式）。
 */
import { useRef, useState } from "react";
import { Button, Label, Spinner, TextArea, TextField } from "@heroui/react";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import type { TaskStatus } from "@/lib/api/task-types";
import { transitionTextMaxLength, validateTransitionText } from "@/lib/board-kanban";

export function TaskTransitionReasonDialog({
  open,
  taskTitle,
  from,
  to,
  isPending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  taskTitle: string;
  from: TaskStatus;
  to: TaskStatus;
  /** 流转请求在途：禁用输入与关闭 */
  isPending: boolean;
  onCancel: () => void;
  /**
   * r7 F9：返回 Promise<boolean>——请求期间弹窗与文本保留；
   * 成功（true）时弹窗 markClean 后关闭，失败（false）时文本保留在弹窗内
   * 并展示提交错误，可修改后重试。
   */
  onConfirm: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 本地提交中：confirm 异步化后，父组件 transitionBusy 的首次渲染有空隙，
  // 快速双击会重复提交；本地 guard 补上这道缝。
  const [submitting, setSubmitting] = useState(false);
  const busy = isPending || submitting;

  const isDeliverables = to === "COMPLETED";
  const fieldLabel = isDeliverables ? "交付物或完成说明" : "流转原因";
  const fromLabel = statusLabel("task", from);
  const toLabel = statusLabel("task", to);
  // pi r7 F4：后端 TaskTransitionRequest reason @Size(max=500)，
  // deliverables @Size(max=1000)；maxLength 与校验同步，超限挂 FieldError。
  const maxLength = transitionTextMaxLength(to);

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = "";
  const isDirty = text !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const doClose = () => {
    setText("");
    setFieldError(null);
    setSubmitError(null);
    onCancel();
  };

  const close = () => {
    if (busy) return;
    guard(doClose);
  };

  const confirm = async () => {
    if (busy) return;
    const error = validateTransitionText(text, maxLength);
    setFieldError(error);
    if (error) return;
    setSubmitError(null);
    // r7 F9：校验通过不再提前 markClean/卸载；请求落定前弹窗与文本保留，
    // 失败时展示提交错误并允许重试，成功后才授权离开并关闭。
    setSubmitting(true);
    try {
      const ok = await onConfirm(text.trim());
      if (ok) {
        markClean();
        doClose();
      } else {
        setSubmitError("提交失败，文本已保留，可修改后重试（详情见右下角提示）");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {blocker}
      <AppModal
        open={open}
        title={`流转任务：${fromLabel} → ${toLabel}`}
        onClose={close}
        size="md"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-body truncate text-default-600">
            任务：{taskTitle || "（无标题）"}
          </p>
          <div>
            <TextField
              value={text}
              onChange={(value) => {
                setText(value);
                setFieldError(null);
                setSubmitError(null);
              }}
              isDisabled={busy}
            >
              <Label>
                {fieldLabel}
                <RequiredMark />
              </Label>
              <TextArea
                placeholder={
                  isDeliverables
                    ? "例如：已上线 v1.2.0，验收通过"
                    : "例如：需求变更，暂缓开发"
                }
                rows={3}
                maxLength={maxLength}
              />
            </TextField>
            <FieldError message={fieldError} />
            {submitError ? (
              <p role="alert" className="mt-1 text-sm text-danger">
                {submitError}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={busy}>
              取消
            </Button>
            <Button variant="primary" onPress={() => void confirm()} isDisabled={busy}>
              {busy ? <Spinner size="sm" /> : null}
              确认流转
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
