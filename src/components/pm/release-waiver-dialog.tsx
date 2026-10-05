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
 *   gateType 不回退隐藏默认值；选项随门禁预览变化时清空已失效的 gateType
 *   （绝不自动替换为剩余首项，codex r26 P2-2）并提示用户手动重选，程序化
 *   清空同步 dirty 基线走非置脏路径（pi NOTE）；提交前校验值在当前可选项
 *   内（失效挂 FieldError 拒绝提交）
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
  // 选项变化导致当前门禁失效时，要求用户手动重选（codex r26 P2-2）：
  // 渲染此提示。setForm 清空 gateType 后该状态保持 true，直到用户重选。
  const [gateReselectHint, setGateReselectHint] = useState(false);

  const initialFormRef = useRef<string | null>(null);
  // 打开提交与选项同步同一次提交时跳过后者：open-effect 已按当前选项
  // 选出有效默认值，此时闭包里的 form 还是上一次会话的旧值，不能触发
  // 重选逻辑
  const skipOptionsSyncRef = useRef(false);
  useLayoutEffect(() => {
    if (open) {
      skipOptionsSyncRef.current = true;
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
      setGateReselectHint(false);
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
  // 可选项内则清空 gateType、要求用户手动重选（codex r26 P2-2：绝不自动
  // 替换为剩余首项——自动切换会沿用旧原因提交到新门禁，且提交前资格校验
  // 允许该组合通过；此前 gateType 只在 open 翻转时重置，选项变化不清理）。
  // 程序化清空走非置脏路径：同步 dirty 基线到程序化状态（pi NOTE：基线
  // 不同步时关闭会误弹"是否放弃修改"确认——非用户编辑不应置脏；用户已
  // 输入的原因保留其 dirty 语义），并给出明确重选提示。
  useLayoutEffect(() => {
    if (!open) return;
    // 与 open 翻转同一次提交：open-effect 已按当前选项选出有效默认值，
    // 跳过（此时闭包 form 为上一次会话旧值）
    if (skipOptionsSyncRef.current) {
      skipOptionsSyncRef.current = false;
      return;
    }
    if (
      form.gateType === "" ||
      renderOptions.some((option) => option.id === form.gateType)
    ) {
      return;
    }
    setForm((current) => ({ ...current, gateType: "" }));
    initialFormRef.current = JSON.stringify({ gateType: "", reason: "" });
    setGateReselectHint(true);
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
              {gateReselectHint && form.gateType === "" ? (
                // 选项变化致原选门禁失效：已清空 gateType，要求手动重选
                //（codex r26 P2-2），此处明确提示
                <p className="type-caption mt-1 text-default-500">
                  原选门禁已通过/不再可豁免，请重新选择门禁类型后再提交。
                </p>
              ) : null}
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
