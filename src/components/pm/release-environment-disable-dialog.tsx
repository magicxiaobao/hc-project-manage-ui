/**
 * 发布环境停用确认弹窗（P2：p2-release-env）。
 *
 * 行为（忠实于后端 ReleaseEnvironmentController POST /release-environment/v1/{id}/disable）：
 * - 请求体 { reason } 必填：strip 后为空或超过 500 码点时后端直接抛
 *   ReleaseEnvironmentInvalid，前端前置拦截（Unicode 码点计数，与后端
 *   codePointCount 口径一致）
 * - 仅 ACTIVE 环境可停用；调用方在渲染层隐藏已停用行的停用入口
 * - 存在在途发布时后端拒绝，错误走弹窗内持久错误（草稿保留、弹窗不卸载）
 *
 * 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于 AppModal
 * 挂载，X/遮罩/Esc/取消按钮走 guard(onClose)）、必填字段 RequiredMark、
 * 字段级错误用 FieldError（role="alert"）挂在对应输入正下方、编辑即清；
 * 请求失败保留整体错误。成功提交前 markClean() 再程序化关闭。
 */
import { useLayoutEffect, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useDisableReleaseEnvironment } from "@/lib/query";
import { RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH, validateDisableReason } from "@/lib/release-environment-form";
import type { ReleaseEnvironmentResponse } from "@/lib/api/releaseEnvironment-types";

export function ReleaseEnvironmentDisableDialog({
  open,
  environment,
  onClose,
}: {
  open: boolean;
  /** 待停用的环境；null 时弹窗不渲染内容（调用方保证 open 时非空） */
  environment: ReleaseEnvironmentResponse | null;
  onClose: () => void;
}) {
  const disableMutation = useDisableReleaseEnvironment();

  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 每次打开重置：用 useLayoutEffect 在绘制前同步清空，避免重开首帧闪现旧输入
  useLayoutEffect(() => {
    if (open) {
      disableMutation.reset();
      setReason("");
      setReasonError(null);
      setSubmitError(null);
    }
    // 只在 open 翻转时重置；environment 变化由调用方以 open=false→true 重新打开承载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  // dirty = 原因已填写：拦截 X/遮罩/Esc/取消/路由/后退/刷新关闭
  const isDirty = reason !== "";
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const close = () => {
    if (disableMutation.isPending) return;
    guard(onClose);
  };

  const handleSubmit = () => {
    if (disableMutation.isPending || environment == null) return;
    const error = validateDisableReason(reason);
    setReasonError(error);
    if (error != null) return;
    setSubmitError(null);
    disableMutation.mutate(
      { environmentId: environment.id, data: { reason: reason.trim() } },
      {
        onSuccess: () => {
          toast.success(`发布环境「${environment.name}」已停用`);
          markClean();
          onClose();
        },
        onError: (submitFailure) => {
          // 失败保留弹窗与草稿：如在途发布占用等后端拒绝，用户可改原因重试或取消
          setSubmitError(`停用失败：${toUserMessage(submitFailure)}`);
        },
      },
    );
  };

  return (
    <>
      {/*
        blocker 必须独立于 AppModal 挂载：弹窗关闭（提交成功）不能卸载一个正在
        等待用户作答的路由拦截，否则那次导航会永远挂起（P2）。
      */}
      {blocker}
      <AppModal open={open} title="停用发布环境" size="md" onClose={close}>
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-body text-default-500">
            确认停用环境
            <span className="type-emphasis">「{environment?.name ?? ""}」</span>
            ？停用后状态变为已停用，不可再用于新的发布。
          </p>
          <div>
            <TextField
              value={reason}
              onChange={(next) => {
                setReason(next);
                setReasonError(null);
              }}
              aria-label="停用原因"
              isDisabled={disableMutation.isPending}
            >
              <Label>
                停用原因<RequiredMark />（最长 {RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH} 字符）
              </Label>
              <TextArea rows={3} placeholder="为什么停用这个环境…" />
            </TextField>
            <FieldError message={reasonError} />
          </div>
          {submitError ? (
            <p role="alert" className="type-body text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={disableMutation.isPending}>
              取消
            </Button>
            <Button variant="danger" onPress={handleSubmit} isDisabled={disableMutation.isPending}>
              {disableMutation.isPending ? "停用中…" : "确认停用"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
