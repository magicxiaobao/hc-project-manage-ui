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
 * - 无可豁免门禁时（codex r25 P2-4）：弹窗内明示"暂无可豁免门禁"并禁用提交，
 *   gateType 不回退隐藏默认值；选项随门禁预览变化时清理已失效的 gateType
 *   及对应字段错误；提交前校验值在当前可选项内（失效挂 FieldError 拒绝提交）
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, OptionSelect, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useRevokeReleaseWaiver, useWaiveReleaseGate } from "@/lib/query";
import {
  buildGateOptions,
  buildReleaseWaiverPayload,
  emptyReleaseWaiverInput,
  validateReleaseWaiverInput,
} from "@/lib/release-form";
import type { ReleaseWaiverInput } from "@/lib/release-form";

/**
 * 可豁免门禁选项见 @/lib/release-form 的 buildGateOptions（老前端
 * ReleaseGatePanel.vue:23 口径），弹窗与详情页顶部入口共用。
 */

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
      //（绝不默认 DIRECT_REQUIREMENT_SCOPE，见 emptyReleaseWaiverInput）。
      // 无可豁免门禁时 gateType 留空：绝不回退到隐藏默认值（如已通过的
      // REQUIRED_CASES_PASSED，否则提交必被后端拒绝；codex r25 P2-4），
      // 提交按钮随之禁用并明示"暂无可豁免门禁"。
      const presetAvailable =
        presetGateType != null && options.some((option) => option.id === presetGateType);
      const snapshot: ReleaseWaiverInput = {
        gateType: presetAvailable ? presetGateType! : (options[0]?.id ?? ""),
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

  // 渲染用选项与打开时快照保持同一口径（不可豁免项恒排除）
  const renderOptions = buildGateOptions(
    excludedGateTypes,
    mode === "revoke" ? presetGateType : undefined,
  );
  const renderOptionIdsKey = renderOptions.map((option) => option.id).join(",");

  // 豁免选项随门禁实时预览更新可能被排除：form.gateType 若已不在当前
  // 可选项内则清理并回退首项（同时清除对应字段错误），避免提交失效值
  //（codex r25 P2-4：此前 gateType 只在 open 翻转时重置，选项变化不清理）。
  useLayoutEffect(() => {
    if (!open) return;
    setForm((current) => {
      if (
        current.gateType === "" ||
        renderOptions.some((option) => option.id === current.gateType)
      ) {
        return current;
      }
      return { ...current, gateType: renderOptions[0]?.id ?? "" };
    });
    setFieldErrors((current) => {
      if (current.gateType === undefined) return current;
      const next = { ...current };
      delete next.gateType;
      return next;
    });
    // 选项由 excludedGateTypes/presetGateType/mode 派生；renderOptionIdsKey
    // 聚合其变化，open 翻转与选项变化时重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, renderOptionIdsKey]);

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
    // 提交前校验值在当前可选项内（codex r25 P2-4）：防止选项变化后
    // form.gateType 失效仍提交；失效时挂 FieldError 拒绝提交
    const errors = validateReleaseWaiverInput(form, {
      allowedGateTypes: renderOptions.map((option) => option.id),
    });
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

  // 渲染用选项见组件上部 renderOptions（与打开时快照保持同一口径）

  return (
    <>
      {blocker}
      <AppModal open={open} title={title} onClose={close} size="md">
        {dialog}
        <div className="flex flex-col gap-4">
          {renderOptions.length === 0 ? (
            // 无可豁免门禁：明示并禁用提交，不回退隐藏默认值（codex r25 P2-4）
            <p className="type-body text-default-500">暂无可豁免门禁</p>
          ) : (
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
          )}

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
            <Button
              variant="primary"
              onPress={handleSubmit}
              isDisabled={mutation.isPending || renderOptions.length === 0}
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
