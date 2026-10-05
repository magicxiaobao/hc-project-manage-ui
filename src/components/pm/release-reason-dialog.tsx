/**
 * 发布审批/驳回/取消原因弹窗（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件：
 * - approve：POST /release/v1/{id}/approve（useApproveRelease）
 * - reject：POST /release/v1/{id}/reject（useRejectRelease）
 * - cancel：POST /release/v1/{id}/cancel（useCancelRelease）
 * - 请求体均为 { reason }（需 project:admin）；reason 必填
 * - approve 默认原因「审批通过」（老前端 ReleaseApprovalPanel 口径）
 * - 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于 AppModal
 *   挂载，X/遮罩/Esc/取消按钮走 guard(doClose)；成功提交前 markClean()）、
 *   必填字段 RequiredMark、FieldError 挂在输入正下方、编辑时清除错误；
 *   在途禁用全部可编辑控件
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useApproveRelease, useCancelRelease, useRejectRelease } from "@/lib/query";
import { validateReleaseReasonInput } from "@/lib/release-form";

export type ReleaseReasonAction = "approve" | "reject" | "cancel";

const ACTION_META: Record<ReleaseReasonAction, { title: string; submit: string; pending: string; toast: string }> = {
  approve: { title: "审批通过", submit: "确认审批通过", pending: "审批中…", toast: "发布已审批通过" },
  reject: { title: "驳回发布", submit: "确认驳回", pending: "驳回中…", toast: "发布已驳回" },
  cancel: { title: "取消发布", submit: "确认取消", pending: "取消中…", toast: "发布已取消" },
};

export function ReleaseReasonDialog({
  open,
  releaseId,
  action,
  onClose,
}: {
  open: boolean;
  releaseId: number;
  action: ReleaseReasonAction;
  onClose: () => void;
}) {
  const approveMutation = useApproveRelease();
  const rejectMutation = useRejectRelease();
  const cancelMutation = useCancelRelease();
  const mutation =
    action === "approve" ? approveMutation : action === "reject" ? rejectMutation : cancelMutation;

  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const initialRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (open) {
      // 老前端 ReleaseApprovalPanel：审批通过默认原因「审批通过」
      const snapshot = action === "approve" ? "审批通过" : "";
      initialRef.current = JSON.stringify(snapshot);
      setReason(snapshot);
      setReasonError("");
      setSubmitError("");
    }
    // 只在 open 翻转时重置；调用方以 open=false→true 重新打开承载 action 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = JSON.stringify(reason) !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const onReasonChange = (next: string) => {
    setReason(next);
    if (reasonError) setReasonError("");
  };

  const doClose = () => {
    onClose();
  };

  const close = () => {
    if (mutation.isPending) return;
    guard(doClose);
  };

  const handleSubmit = () => {
    if (mutation.isPending) return;
    const errors = validateReleaseReasonInput(reason);
    if (errors.length > 0) {
      setReasonError(errors[0].message);
      return;
    }
    setReasonError("");
    setSubmitError("");
    mutation.mutate(
      { releaseId, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(ACTION_META[action].toast);
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`提交失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const meta = ACTION_META[action];
  const submitLabel = mutation.isPending ? meta.pending : meta.submit;

  return (
    <>
      {blocker}
      <AppModal open={open} title={`${meta.title}（#${releaseId}）`} onClose={close} size="md">
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={reason}
              onChange={onReasonChange}
              aria-label="原因"
              isDisabled={mutation.isPending}
            >
              <Label>
                原因<RequiredMark />
              </Label>
              <TextArea placeholder="请填写原因（必填）" />
            </TextField>
            <FieldError message={reasonError} />
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
