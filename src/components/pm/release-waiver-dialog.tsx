/**
 * 发布门禁豁免/撤销豁免弹窗（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件：
 * - mode=waive：POST /release/v1/{id}/waiveGate（useWaiveReleaseGate）
 * - mode=revoke：POST /release/v1/{id}/revokeWaiver（useRevokeReleaseWaiver）
 * - 请求体 { gateType, reason }（需 project:admin）；reason 必填
 * - 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于 AppModal
 *   挂载，X/遮罩/Esc/取消按钮走 guard(doClose)；成功提交前 markClean()）、
 *   必填字段 RequiredMark、校验全量收集、FieldError 挂在对应输入正下方、
 *   编辑时清除该字段错误；在途禁用全部可编辑控件
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, OptionSelect, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useRevokeReleaseWaiver, useWaiveReleaseGate } from "@/lib/query";
import {
  buildReleaseWaiverPayload,
  emptyReleaseWaiverInput,
  validateReleaseWaiverInput,
} from "@/lib/release-form";
import type { ReleaseWaiverInput } from "@/lib/release-form";
import { RELEASE_GATE_TYPES, RELEASE_GATE_TYPE_LABELS } from "@/lib/api/release-types";

const GATE_OPTIONS = RELEASE_GATE_TYPES.map((gateType) => ({
  id: gateType,
  label: RELEASE_GATE_TYPE_LABELS[gateType],
}));

export function ReleaseWaiverDialog({
  open,
  releaseId,
  mode,
  presetGateType,
  onClose,
}: {
  open: boolean;
  releaseId: number;
  /** waive = 豁免门禁；revoke = 撤销豁免 */
  mode: "waive" | "revoke";
  /** 打开撤销时预选的门禁类型；豁免模式下不传（默认首项） */
  presetGateType?: string;
  onClose: () => void;
}) {
  const waiveMutation = useWaiveReleaseGate();
  const revokeMutation = useRevokeReleaseWaiver();
  const mutation = mode === "waive" ? waiveMutation : revokeMutation;

  const [form, setForm] = useState<ReleaseWaiverInput>(emptyReleaseWaiverInput());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const initialFormRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (open) {
      const snapshot: ReleaseWaiverInput = {
        gateType:
          mode === "revoke" && presetGateType ? presetGateType : RELEASE_GATE_TYPES[0],
        reason: "",
      };
      initialFormRef.current = JSON.stringify(snapshot);
      setForm(snapshot);
      setFieldErrors({});
      setSubmitError("");
    }
    // 只在 open 翻转时重置；调用方以 open=false→true 重新打开承载 mode/preset 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = JSON.stringify(form) !== initialFormRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<ReleaseWaiverInput>) => {
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
    if (mutation.isPending) return;
    guard(doClose);
  };

  const handleSubmit = () => {
    if (mutation.isPending) return;
    const errors = validateReleaseWaiverInput(form);
    if (errors.length > 0) {
      const nextFieldErrors: Record<string, string> = {};
      for (const error of errors) nextFieldErrors[error.field] = error.message;
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitError("");
    const payload = buildReleaseWaiverPayload(form);
    mutation.mutate(
      { releaseId, gateType: payload.gateType, reason: payload.reason },
      {
        onSuccess: () => {
          toast.success(mode === "waive" ? "门禁已豁免" : "门禁豁免已撤销");
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`提交失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const title = mode === "waive" ? "豁免门禁" : "撤销门禁豁免";
  const submitLabel = mutation.isPending
    ? mode === "waive"
      ? "豁免中…"
      : "撤销中…"
    : mode === "waive"
      ? "确认豁免"
      : "确认撤销";

  return (
    <>
      {blocker}
      <AppModal open={open} title={title} onClose={close} size="md">
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <Label>
              门禁类型<RequiredMark />
            </Label>
            <OptionSelect
              label="门禁类型（必填）"
              value={form.gateType}
              options={GATE_OPTIONS}
              onChange={(next) => set({ gateType: next })}
              isDisabled={mutation.isPending}
            />
            <FieldError message={fieldErrors.gateType} />
          </div>

          <div>
            <TextField
              value={form.reason}
              onChange={(next) => set({ reason: next })}
              aria-label={mode === "waive" ? "豁免原因" : "撤销原因"}
              isDisabled={mutation.isPending}
            >
              <Label>
                {mode === "waive" ? "豁免原因" : "撤销原因"}
                <RequiredMark />
              </Label>
              <TextArea placeholder={mode === "waive" ? "说明豁免该门禁的理由" : "说明撤销豁免的理由"} />
            </TextField>
            <FieldError message={fieldErrors.reason} />
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
