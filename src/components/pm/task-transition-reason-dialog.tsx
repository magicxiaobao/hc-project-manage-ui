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
import { validateTransitionText } from "@/lib/board-kanban";

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
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isDeliverables = to === "COMPLETED";
  const fieldLabel = isDeliverables ? "交付物或完成说明" : "流转原因";
  const fromLabel = statusLabel("task", from);
  const toLabel = statusLabel("task", to);

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = "";
  const isDirty = text !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const doClose = () => {
    setText("");
    setFieldError(null);
    onCancel();
  };

  const close = () => {
    if (isPending) return;
    guard(doClose);
  };

  const confirm = () => {
    if (isPending) return;
    const error = validateTransitionText(text);
    setFieldError(error);
    if (error) return;
    // 成功提交 = 已授权离开：避免守卫拦截父组件关闭本弹窗
    markClean();
    onConfirm(text.trim());
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
              }}
              isDisabled={isPending}
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
                maxLength={1000}
              />
            </TextField>
            <FieldError message={fieldError} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={confirm} isDisabled={isPending}>
              {isPending ? <Spinner size="sm" /> : null}
              确认流转
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
