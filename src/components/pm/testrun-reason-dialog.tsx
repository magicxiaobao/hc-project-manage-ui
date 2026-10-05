/**
 * 原因输入通用弹窗（P2：p2-testrun-workspace）。
 *
 * 共用场景：
 * - 取消测试轮（POST /testRun/v1/{id}/cancel，reason 必填）
 * - 重试执行 attempt（POST /testExecution/v1/{id}/retry，reason 必填）
 * 后端 requireReason 口径一致：trim 后 1–500 必填（见 src/lib/testrun-form.ts
 * validateReasonField）。
 *
 * 提交走 onSubmit(reason) 的 Promise（调用方传 mutation.mutateAsync 包装）：
 * 成功后弹窗内部先 markClean 再关闭（已授权离开，不算"放弃修改"），失败则
 * 在弹窗内持久展示服务端错误。
 *
 * 表单 UX：dirty check、必填星号、字段级错误、编辑即清；请求进行中禁用关闭。
 */
import { useRef, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { toUserMessage } from "@/lib/query";
import { validateReasonField } from "@/lib/testrun-form";

export function TestRunReasonDialog({
  open,
  title,
  hint,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  /** 原因输入框上方提示文案 */
  hint?: string;
  confirmLabel: string;
  /** 提交动作：resolve=成功，reject=失败（错误走弹窗内持久展示） */
  onSubmit: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = "";
  const isDirty = reason !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    open && isDirty,
  );

  const doClose = () => {
    setReason("");
    setFieldError("");
    setSubmitError("");
    setSubmitting(false);
    onClose();
  };

  const close = () => {
    if (submitting) return;
    guard(doClose);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const issues = validateReasonField(reason);
    if (issues.length > 0) {
      setFieldError(issues[0].message);
      return;
    }
    setFieldError("");
    setSubmitError("");
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      // 成功 = 已授权离开：先 markClean 再关闭，避免卸载等待作答的路由拦截
      markClean();
      doClose();
    } catch (error) {
      setSubmitError(`提交失败：${toUserMessage(error)}`);
      setSubmitting(false);
    }
  };

  return (
    <>
      {blocker}
      <AppModal open={open} title={title} onClose={close} size="md">
        {dialog}
        <div className="flex flex-col gap-4">
          {hint ? <p className="type-body text-default-500">{hint}</p> : null}
          <div>
            <TextField
              isDisabled={submitting}
              value={reason}
              onChange={(next) => {
                setReason(next);
                setFieldError("");
                setSubmitError("");
              }}
              aria-label="原因"
            >
              <Label>
                原因<RequiredMark />
              </Label>
              <TextArea rows={3} placeholder="请输入原因（1–500 个字符）" />
            </TextField>
            <FieldError message={fieldError} />
          </div>
          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={submitting}>
              取消
            </Button>
            <Button variant="danger" onPress={() => void handleSubmit()} isDisabled={submitting}>
              {submitting ? "提交中…" : confirmLabel}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
