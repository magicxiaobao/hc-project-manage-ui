/**
 * 发布门禁豁免/撤销豁免弹窗（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件：
 * - mode=waive：POST /release/v1/{id}/waiveGate（useWaiveReleaseGate）
 * - mode=revoke：POST /release/v1/{id}/revokeWaiver（useRevokeReleaseWaiver）
 * - 请求体 { gateType, reason }（需 project:admin）；reason 必填
 * - 门禁下拉排除不可豁免项：DIRECT_REQUIREMENT_SCOPE 恒排除（后端直接拒绝），
 *   已通过门禁由调用方经 excludedGateTypes 传入排除（老前端
 *   ReleaseGatePanel.vue:23 口径；codex r24 P2-5）
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

/**
 * 可豁免门禁选项（老前端 ReleaseGatePanel.vue:23 口径）：
 * - 恒排除 DIRECT_REQUIREMENT_SCOPE（后端 waiveGate 直接抛 ReleaseGateBlocked）
 * - 排除调用方传入的已通过门禁（后端同样拒绝豁免已通过门禁）
 * - revoke 模式下若预设门禁被排除（防御性），仍保留该预设以免下拉显示空值
 */
function buildGateOptions(
  excludedGateTypes: readonly string[],
  presetGateType?: string,
): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = RELEASE_GATE_TYPES.filter(
    (gateType) => gateType !== 'DIRECT_REQUIREMENT_SCOPE' && !excludedGateTypes.includes(gateType),
  ).map((gateType) => ({
    id: gateType,
    label: RELEASE_GATE_TYPE_LABELS[gateType],
  }));
  if (
    presetGateType != null &&
    !options.some((option) => option.id === presetGateType) &&
    (RELEASE_GATE_TYPES as readonly string[]).includes(presetGateType)
  ) {
    options.unshift({
      id: presetGateType,
      label: RELEASE_GATE_TYPE_LABELS[presetGateType as keyof typeof RELEASE_GATE_TYPE_LABELS] ?? presetGateType,
    });
  }
  return options;
}

export function ReleaseWaiverDialog({
  open,
  releaseId,
  mode,
  presetGateType,
  excludedGateTypes = [],
  onClose,
}: {
  open: boolean;
  releaseId: number;
  /** waive = 豁免门禁；revoke = 撤销豁免 */
  mode: "waive" | "revoke";
  /** 打开时预选的门禁类型（行级"豁免/撤销豁免"入口传入；顶部入口不传） */
  presetGateType?: string;
  /**
   * 需从选项中排除的已通过门禁（后端拒绝豁免已通过门禁；
   * DIRECT_REQUIREMENT_SCOPE 恒排除）。调用方按详情 gateResults /
   * 实时预览结果传入。
   */
  excludedGateTypes?: string[];
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
      const options = buildGateOptions(excludedGateTypes, mode === "revoke" ? presetGateType : undefined);
      // 行级入口预选该行门禁（若仍可豁免）；否则默认首个可豁免项
      //（绝不默认 DIRECT_REQUIREMENT_SCOPE，见 emptyReleaseWaiverInput）
      const presetAvailable =
        presetGateType != null && options.some((option) => option.id === presetGateType);
      const snapshot: ReleaseWaiverInput = {
        gateType: presetAvailable ? presetGateType! : (options[0]?.id ?? emptyReleaseWaiverInput().gateType),
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

  // 渲染用选项与打开时快照保持同一口径（不可豁免项恒排除）
  const renderOptions = buildGateOptions(excludedGateTypes, mode === "revoke" ? presetGateType : undefined);

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
              options={renderOptions}
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
