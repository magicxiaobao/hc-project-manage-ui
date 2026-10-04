/**
 * 完成执行 attempt 弹窗（P2：p2-testrun-workspace）。
 *
 * 忠实后端 TestExecutionCommandServiceImpl 的完成校验三段规则：
 * - result 必填（PASSED/FAILED/BLOCKED/SKIPPED）
 * - FAILED/BLOCKED → failureMessage 必填
 * - PASSED → failureMessage 必须为空（后端直接拒绝，前端拦截）
 * - SKIPPED → executionNotes 必填
 * - overrideReason 条件契约：本人完成（executedBy == 当前用户）时隐藏且不发送；
 *   管理员覆盖（他人执行、由当前用户完成）时必填；最多 500（UTF-16 码元）
 *
 * 表单 UX：dirty check、必填星号、字段级错误挂输入下、编辑即清；
 * 请求进行中禁用全部输入与关闭入口。
 */
import { useRef, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  toUserMessage,
  useCompleteExecution,
} from "@/lib/query";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  buildCompleteExecutionPayload,
  emptyExecutionCompleteInput,
  validateExecutionCompleteInput,
} from "@/lib/testrun-form";
import type { ExecutionCompleteInput } from "@/lib/testrun-form";
import {
  TEST_EXECUTION_RESULT_LABELS,
  TEST_EXECUTION_RESULTS,
} from "@/lib/api/testRun-types";
import type { TestExecutionResponse } from "@/lib/api/testRun-types";

const RESULT_OPTIONS = TEST_EXECUTION_RESULTS.map((result) => ({
  id: result,
  label: TEST_EXECUTION_RESULT_LABELS[result],
}));

export function TestExecutionCompleteDialog({
  open,
  execution,
  onClose,
}: {
  open: boolean;
  /** 目标 attempt（RUNNING）；null 时不渲染表单 */
  execution: TestExecutionResponse | null;
  onClose: () => void;
}) {
  const completeExecution = useCompleteExecution();
  const isPending = completeExecution.isPending;

  // 覆盖原因条件契约（codex r10 P2-3）：后端 adminOverride = actorId != executedBy。
  // 本人完成 → 字段隐藏且不发送（后端直接拒绝该字段）；他人执行由当前用户完成
  // （管理员覆盖）→ 必填 + 必填星号 + 字段级错误。executedBy 未知时按覆盖处理。
  // userId 为规范十进制字符串（hydrate 时校验），executedBy 为 number，
  // 用 String() 归一化后比较。
  const currentUserId = useAuthStore((s) => s.user?.userId ?? null);
  const isSelfCompletion =
    execution != null &&
    execution.executedBy != null &&
    currentUserId != null &&
    String(execution.executedBy) === currentUserId;

  const [form, setForm] = useState<ExecutionCompleteInput>(
    emptyExecutionCompleteInput,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) {
    initialRef.current = JSON.stringify(emptyExecutionCompleteInput());
  }
  const isDirty = JSON.stringify(form) !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    open && isDirty,
  );

  const set = (patch: Partial<ExecutionCompleteInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSubmitError("");
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
    setForm(emptyExecutionCompleteInput());
    setFieldErrors({});
    setSubmitError("");
    onClose();
  };

  const close = () => {
    if (isPending) return;
    guard(doClose);
  };

  const handleSubmit = () => {
    if (isPending || !execution) return;
    const errors = validateExecutionCompleteInput(form, {
      requireOverrideReason: !isSelfCompletion,
    });
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    completeExecution.mutate(
      {
        executionId: execution.id,
        data: buildCompleteExecutionPayload(form, {
          includeOverrideReason: !isSelfCompletion,
        }),
      },
      {
        onSuccess: () => {
          toast.success(`执行 #${execution.id} 已完成（${TEST_EXECUTION_RESULT_LABELS[form.result as keyof typeof TEST_EXECUTION_RESULT_LABELS]}）`);
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`完成失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const showFailureMessage = form.result === "FAILED" || form.result === "BLOCKED";
  const showExecutionNotes = form.result === "SKIPPED" || showFailureMessage;

  return (
    <>
      {blocker}
      <AppModal
        open={open}
        title={`完成执行${execution ? ` #${execution.id}` : ""}`}
        onClose={close}
        size="lg"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <Label>
              执行结果<RequiredMark />
            </Label>
            <OptionSelect
              isDisabled={isPending}
              label="执行结果（必填）"
              value={form.result}
              options={RESULT_OPTIONS}
              onChange={(next) => {
                const result = next as ExecutionCompleteInput["result"];
                // 切离 失败/阻塞 时清空失败说明：其输入与 FieldError 仅在
                // 失败/阻塞下渲染，残留值+残留错误会导致"看不见的错误拦截提交"
                //（codex r10 P2-2）；set 会同步清除该字段的错误
                set(
                  result === "FAILED" || result === "BLOCKED"
                    ? { result }
                    : { result, failureMessage: "" },
                );
              }}
            />
            <FieldError message={fieldErrors.result} />
          </div>

          <div>
            <TextField
              isDisabled={isPending}
              value={form.actualResult}
              onChange={(next) => set({ actualResult: next })}
              aria-label="实际结果"
            >
              <Label>实际结果</Label>
              <TextArea rows={2} placeholder="实际观察到的结果（可选）" />
            </TextField>
            <FieldError message={fieldErrors.actualResult} />
          </div>

          {showFailureMessage ? (
            <div>
              <TextField
                isDisabled={isPending}
                value={form.failureMessage}
                onChange={(next) => set({ failureMessage: next })}
                aria-label="失败说明"
              >
                <Label>
                  失败说明<RequiredMark />
                </Label>
                <TextArea rows={3} placeholder="失败/阻塞的原因说明（必填）" />
              </TextField>
              <FieldError message={fieldErrors.failureMessage} />
            </div>
          ) : null}

          {showExecutionNotes ? (
            <div>
              <TextField
                isDisabled={isPending}
                value={form.executionNotes}
                onChange={(next) => set({ executionNotes: next })}
                aria-label="执行备注"
              >
                <Label>
                  执行备注{form.result === "SKIPPED" ? <RequiredMark /> : null}
                </Label>
                <TextArea
                  rows={2}
                  placeholder={
                    form.result === "SKIPPED"
                      ? "跳过原因（必填）"
                      : "补充备注（可选）"
                  }
                />
              </TextField>
              <FieldError message={fieldErrors.executionNotes} />
            </div>
          ) : null}

          {/* 覆盖原因：本人完成时隐藏（且不发送）；管理员覆盖时必填 */}
          {isSelfCompletion ? null : (
            <div>
              <TextField
                isDisabled={isPending}
                value={form.overrideReason}
                onChange={(next) => set({ overrideReason: next })}
                aria-label="覆盖原因（必填）"
              >
                <Label>
                  覆盖原因<RequiredMark />
                </Label>
                <TextArea
                  rows={2}
                  placeholder="该执行由他人开始，由你完成时必填（最多 500 个字符）"
                />
              </TextField>
              <FieldError message={fieldErrors.overrideReason} />
            </div>
          )}

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
              {isPending ? "提交中…" : "完成执行"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
