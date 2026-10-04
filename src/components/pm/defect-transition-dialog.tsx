/**
 * 缺陷状态流转弹窗（P2：p2-defect-board 从缺陷详情页抽取为共享组件）。
 *
 * 行为与原缺陷详情页内嵌弹窗完全一致，仅输入改为 props：
 * - 流转目标：target != null 时为预设目标（如详情页按钮/看板拖拽落点）；
 *   target == null 时弹窗内提供目标下拉（选项 = defectTransitionTargets(fromStatus)），
 *   供看板卡片「流转」按钮等无预设目标的入口使用
 * - 原因/执行人规则忠实于后端 transitionDefect：
 *   defectNeedsReason(from, to) 决定原因是否必填（最长 500 字符），
 *   defectNeedsActor(to) 决定 assignee/tester 输入；→VERIFIED 的验证人恒为
 *   当前登录者（后端在 VERIFY 事件上用 operatorId 覆盖 verifierId，但请求仍需
 *   携带 verifierId 以通过 requireVerifier fail-fast）
 * - projectContextVerified=false 时禁止提交（路由项目归属未确认）
 * - 成功后经 useUpdateDefectStatus 的 onSuccess 失效缺陷域+需求域缓存，
 *   看板/列表/详情数据一致
 */
import { useEffect, useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, OptionSelect } from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseOptionalPositiveInt } from "@/lib/task-create";
import {
  defectNeedsActor,
  defectNeedsReason,
  defectTransitionLabel,
  defectTransitionTargets,
  toUserMessage,
  useUpdateDefectStatus,
} from "@/lib/query";
import type { DefectActorField } from "@/lib/query";
import type { DefectStatus, DefectTransitionPayload } from "@/lib/api/defect-types";

const REASON_MAX_LENGTH = 500;

const ACTOR_FIELD_LABELS: Record<DefectActorField, string> = {
  assignee: "处理人用户 ID",
  tester: "测试人用户 ID",
  verifier: "验证人用户 ID",
};

export function DefectTransitionDialog({
  defectId,
  fromStatus,
  target,
  open,
  projectContextVerified,
  onClose,
}: {
  defectId: number;
  fromStatus: string;
  /** 预设流转目标；null = 弹窗内由用户选择目标 */
  target: DefectStatus | null;
  open: boolean;
  /** 路由项目归属确认：false 时禁止提交 */
  projectContextVerified: boolean;
  onClose: () => void;
}) {
  const transitionMutation = useUpdateDefectStatus();

  // →VERIFIED 的验证人恒为当前登录者（后端覆盖），取会话用户 ID
  const sessionUserId = useAuthStore((state) => state.user?.userId);
  const sessionVerifierId = parseOptionalPositiveInt(sessionUserId ?? "");

  const [pickedTarget, setPickedTarget] = useState<DefectStatus | null>(target);
  const [reason, setReason] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // 每次打开重置表单（拖拽到不同列/换卡片重开时不残留上次输入）
  useEffect(() => {
    if (open) {
      transitionMutation.reset();
      setPickedTarget(target);
      setReason("");
      setActorInput("");
      setTransitionError(null);
    }
    // 只在 open 翻转时重置；target 变化由调用方以 open=false→true 重新打开承载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const statusLabelOf = (value: string) => statusLabel("defect", value);
  const targets = defectTransitionTargets(fromStatus);
  const effectiveTarget = target ?? pickedTarget;
  const transitionActor = effectiveTarget != null ? defectNeedsActor(effectiveTarget) : null;
  const transitionReasonRequired =
    effectiveTarget != null && defectNeedsReason(fromStatus, effectiveTarget);

  const submitTransition = () => {
    if (effectiveTarget == null) {
      setTransitionError("请选择流转目标状态。");
      return;
    }
    if (transitionMutation.isPending) return;
    // 弹窗打开后项目归属若变为未确认（如路由项目解析翻转），禁止提交
    if (!projectContextVerified) {
      setTransitionError("项目归属已变化，无法提交。请刷新页面后重试。");
      return;
    }
    const payload: DefectTransitionPayload = { id: defectId, status: effectiveTarget };

    const trimmedReason = reason.trim();
    if (transitionReasonRequired && !trimmedReason) {
      setTransitionError("请填写流转原因。");
      return;
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      setTransitionError(`流转原因不能超过 ${REASON_MAX_LENGTH} 字符。`);
      return;
    }
    if (trimmedReason) payload.reason = trimmedReason;

    if (transitionActor === "verifier") {
      // 验证人恒为当前登录者（后端覆盖），取会话用户 ID；缺失则阻断
      if (sessionVerifierId == null) {
        setTransitionError("无法获取当前登录用户信息，无法执行验证。");
        return;
      }
      payload.verifierId = sessionVerifierId;
    } else if (transitionActor != null) {
      const parsed = parseOptionalPositiveInt(actorInput);
      if (parsed == null) {
        setTransitionError(`请填写${ACTOR_FIELD_LABELS[transitionActor]}（正整数）。`);
        return;
      }
      if (transitionActor === "assignee") payload.assigneeId = parsed;
      else payload.testerId = parsed;
    }

    setTransitionError(null);
    transitionMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(`缺陷已流转到${defectTransitionLabel(fromStatus, effectiveTarget, statusLabelOf)}`);
        onClose();
      },
      onError: (error) => {
        setTransitionError(`流转失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <AppModal
      open={open}
      title={
        effectiveTarget != null
          ? `流转到${defectTransitionLabel(fromStatus, effectiveTarget, statusLabelOf)}`
          : "状态流转"
      }
      size="md"
      onClose={() => {
        if (!transitionMutation.isPending) onClose();
      }}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitTransition();
        }}
      >
        {target == null ? (
          <OptionSelect
            label="流转目标"
            value={pickedTarget ?? ""}
            options={[
              { id: "", label: "请选择" },
              ...targets.map((toStatus) => ({
                id: toStatus,
                label: defectTransitionLabel(fromStatus, toStatus, statusLabelOf),
              })),
            ]}
            onChange={(next) => setPickedTarget(next ? (next as DefectStatus) : null)}
          />
        ) : null}
        {transitionActor === "verifier" ? (
          <p className="type-body text-default-500" aria-label="验证人">
            验证人：当前登录用户
            {sessionVerifierId != null ? `（ID ${sessionVerifierId}）` : "（未获取到登录信息）"}。
            后端将以当前操作者记为验证人。
          </p>
        ) : transitionActor != null ? (
          <TextField value={actorInput} onChange={setActorInput} aria-label={ACTOR_FIELD_LABELS[transitionActor]}>
            <Label>{ACTOR_FIELD_LABELS[transitionActor]}（必填，无对应人员无法完成流转）</Label>
            <Input placeholder="输入用户 ID（正整数）" inputMode="numeric" />
          </TextField>
        ) : null}
        <TextField value={reason} onChange={setReason} aria-label="流转原因">
          <Label>{transitionReasonRequired ? "流转原因（必填，最长 500 字符）" : "流转原因（可选，最长 500 字符）"}</Label>
          <TextArea rows={3} placeholder="为什么流转…" />
        </TextField>
        {transitionError ? <p className="type-body text-danger">{transitionError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onPress={onClose}
            isDisabled={transitionMutation.isPending}
          >
            取消
          </Button>
          <Button type="submit" variant="primary" isDisabled={transitionMutation.isPending}>
            {transitionMutation.isPending ? "流转中…" : "确认流转"}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
