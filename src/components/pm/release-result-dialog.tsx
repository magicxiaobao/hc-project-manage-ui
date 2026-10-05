/**
 * 发布结果记录弹窗（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件：
 * - mode=released：POST /release/v1/{id}/recordReleased（useRecordReleased）；
 *   构建号/制品位置/文件哈希必填非空白；文件大小可选、非空须为非负整数
 *   （Java Long 口径）；结果说明可选
 * - mode=failed：POST /release/v1/{id}/recordFailed（useRecordFailed）；
 *   结果说明必填；「附带制品证据」开关打开时三件套必填（文件大小可选≥0），
 *   关闭时四个证据字段一律不发送（联合类型无证据分支；半套后端直接拒绝）
 * - 口径忠实老前端 ReleaseArtifactPanel.vue resultPayload
 * - 表单 UX 约定：dirty check（useUnsavedChangesGuard；blocker 独立于 AppModal
 *   挂载，X/遮罩/Esc/取消按钮走 guard(doClose)；成功提交前 markClean()）、
 *   必填字段 RequiredMark、校验全量收集、FieldError 挂在对应输入正下方、
 *   编辑时清除该字段错误；在途禁用全部可编辑控件
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Button, Checkbox, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { toUserMessage, useRecordFailed, useRecordReleased } from "@/lib/query";
import {
  buildReleaseFailurePayload,
  buildReleaseSuccessPayload,
  emptyReleaseRecordResultInput,
  validateReleaseRecordResultInput,
} from "@/lib/release-form";
import type { ReleaseRecordResultInput } from "@/lib/release-form";

export type ReleaseRecordMode = "released" | "failed";

export function ReleaseResultDialog({
  open,
  releaseId,
  mode,
  onClose,
}: {
  open: boolean;
  releaseId: number;
  /** released = 记录发布成功；failed = 记录发布失败 */
  mode: ReleaseRecordMode;
  onClose: () => void;
}) {
  const releasedMutation = useRecordReleased();
  const failedMutation = useRecordFailed();
  const mutation = mode === "released" ? releasedMutation : failedMutation;

  const [form, setForm] = useState<ReleaseRecordResultInput>(emptyReleaseRecordResultInput());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const initialFormRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (open) {
      const snapshot = emptyReleaseRecordResultInput();
      initialFormRef.current = JSON.stringify(snapshot);
      setForm(snapshot);
      setFieldErrors({});
      setSubmitError("");
    }
  }, [open]);

  const isDirty = JSON.stringify(form) !== initialFormRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<ReleaseRecordResultInput>) => {
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
    const errors = validateReleaseRecordResultInput(form, mode);
    if (errors.length > 0) {
      const nextFieldErrors: Record<string, string> = {};
      for (const error of errors) nextFieldErrors[error.field] = error.message;
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitError("");
    if (mode === "released") {
      releasedMutation.mutate(
        { releaseId, data: buildReleaseSuccessPayload(form) },
        {
          onSuccess: () => {
            toast.success("发布成功已记录");
            markClean();
            doClose();
          },
          onError: (error) => {
            setSubmitError(`提交失败：${toUserMessage(error)}`);
          },
        },
      );
    } else {
      failedMutation.mutate(
        { releaseId, data: buildReleaseFailurePayload(form) },
        {
          onSuccess: () => {
            toast.success("发布失败已记录");
            markClean();
            doClose();
          },
          onError: (error) => {
            setSubmitError(`提交失败：${toUserMessage(error)}`);
          },
        },
      );
    }
  };

  const title = mode === "released" ? `记录发布成功（#${releaseId}）` : `记录发布失败（#${releaseId}）`;
  const submitLabel = mutation.isPending ? "提交中…" : "提交";
  const showEvidence = mode === "released" || form.includeEvidence;
  const pending = mutation.isPending;

  return (
    <>
      {blocker}
      <AppModal open={open} title={title} onClose={close} size="lg">
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={form.resultNotes}
              onChange={(next) => set({ resultNotes: next })}
              aria-label="结果说明"
              isDisabled={pending}
            >
              <Label>
                结果说明{mode === "failed" ? <RequiredMark /> : null}
              </Label>
              <TextArea placeholder={mode === "failed" ? "请填写失败原因/结果说明（必填）" : "选填：备注"} />
            </TextField>
            <FieldError message={fieldErrors.resultNotes} />
          </div>

          {mode === "failed" ? (
            <div>
              <Checkbox
                isSelected={form.includeEvidence}
                isDisabled={pending}
                onChange={(selected) => set({ includeEvidence: selected })}
                aria-label="附带制品证据"
              >
                附带制品证据
              </Checkbox>
              <p className="type-caption mt-1 text-default-500">
                勾选后需同时填写构建号、制品位置和文件哈希；不勾选则仅记录结果说明。
              </p>
            </div>
          ) : null}

          {showEvidence ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <TextField
                    value={form.buildNumber}
                    onChange={(next) => set({ buildNumber: next })}
                    aria-label="构建号"
                    isDisabled={pending}
                  >
                    <Label>
                      构建号<RequiredMark />
                    </Label>
                    <Input placeholder="如 2026.10.05-001" />
                  </TextField>
                  <FieldError message={fieldErrors.buildNumber} />
                </div>
                <div>
                  <TextField
                    value={form.fileHash}
                    onChange={(next) => set({ fileHash: next })}
                    aria-label="文件哈希"
                    isDisabled={pending}
                  >
                    <Label>
                      文件哈希<RequiredMark />
                    </Label>
                    <Input placeholder="如 sha256:…" />
                  </TextField>
                  <FieldError message={fieldErrors.fileHash} />
                </div>
              </div>

              <div>
                <TextField
                  value={form.artifactLocation}
                  onChange={(next) => set({ artifactLocation: next })}
                  aria-label="制品位置"
                  isDisabled={pending}
                >
                  <Label>
                    制品位置<RequiredMark />
                  </Label>
                  <Input placeholder="制品包的可访问位置（URL/路径）" />
                </TextField>
                <FieldError message={fieldErrors.artifactLocation} />
              </div>

              <div>
                <TextField
                  value={form.fileSize}
                  onChange={(next) => set({ fileSize: next })}
                  aria-label="文件大小（字节）"
                  isDisabled={pending}
                >
                  <Label>文件大小（字节）</Label>
                  <Input placeholder="选填：非负整数" inputMode="numeric" />
                </TextField>
                <FieldError message={fieldErrors.fileSize} />
              </div>
            </>
          ) : null}

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={pending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={pending}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
