/**
 * 版本状态流转弹窗（P2：p2-version-slices）。
 *
 * 行为（忠实于后端 VersionController /transition）：
 * - 流转事件：event != null 时为预设事件（详情页按钮）；event == null 时弹窗内
 *   提供事件下拉（选项 = versionTransitionEvents(fromStatus)），供其它入口使用
 * - 请求体 { event, expectedStatus, reason? }：expectedStatus 必须传调用方读到
 *   的当前状态（乐观并发，后端 CAS 比对 status，冲突抛 VersionConcurrentConflict），
 *   目标状态由服务端按事件解析，前端不计算、不硬编码目标
 * - 原因必填规则忠实于后端 VersionEvent.requiresReason：
 *   RETURN_TO_PLANNING / RETURN_TO_DEVELOPMENT / REOPEN_TESTING / DEPRECATE
 *   必填（后端 strip 后为空同样拒绝）；非必填事件下原因落入审计日志
 * - projectContextVerified=false 时禁止提交（路由项目归属未确认）
 * - 成功后经 useTransitionVersion 的 onSuccess 失效版本域缓存，列表/详情数据一致
 */
import { useLayoutEffect, useState } from "react";
import { Button, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, OptionSelect } from "@/components/biz";
import {
  toUserMessage,
  useTransitionVersion,
  versionEventRequiresReason,
  versionTransitionEvents,
} from "@/lib/query";
import type { VersionEvent, VersionStatus, VersionTransitionPayload } from "@/lib/api/version-types";
import { VERSION_EVENT_LABELS, VERSION_STATUS_LABELS } from "@/lib/api/version-types";

const REASON_MAX_LENGTH = 500;

export function VersionTransitionDialog({
  versionId,
  fromStatus,
  event,
  open,
  projectContextVerified,
  onClose,
}: {
  versionId: number;
  fromStatus: VersionStatus;
  /** 预设流转事件；null = 弹窗内由用户选择事件 */
  event: VersionEvent | null;
  open: boolean;
  /** 路由项目归属确认：false 时禁止提交 */
  projectContextVerified: boolean;
  onClose: () => void;
}) {
  const transitionMutation = useTransitionVersion();

  const [pickedEvent, setPickedEvent] = useState<VersionEvent | null>(event);
  const [reason, setReason] = useState("");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // 每次打开重置表单：用 useLayoutEffect 在绘制前同步清空，避免重开首帧
  // 闪现旧输入（沿用 defect-transition-dialog 语义）
  useLayoutEffect(() => {
    if (open) {
      transitionMutation.reset();
      setPickedEvent(event);
      setReason("");
      setTransitionError(null);
    }
    // 只在 open 翻转时重置；event 变化由调用方以 open=false→true 重新打开承载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const events = versionTransitionEvents(fromStatus);
  const effectiveEvent = event ?? pickedEvent;
  const reasonRequired = effectiveEvent != null && versionEventRequiresReason(effectiveEvent);

  const submitTransition = () => {
    if (effectiveEvent == null) {
      setTransitionError("请选择流转事件。");
      return;
    }
    if (transitionMutation.isPending) return;
    // 弹窗打开后项目归属若变为未确认（如路由项目解析翻转），禁止提交
    if (!projectContextVerified) {
      setTransitionError("项目归属已变化，无法提交。请刷新页面后重试。");
      return;
    }
    const payload: VersionTransitionPayload = {
      event: effectiveEvent,
      expectedStatus: fromStatus,
    };

    const trimmedReason = reason.trim();
    if (reasonRequired && !trimmedReason) {
      setTransitionError("请填写流转原因（后端要求必填）。");
      return;
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      setTransitionError(`流转原因不能超过 ${REASON_MAX_LENGTH} 字符。`);
      return;
    }
    if (trimmedReason) payload.reason = trimmedReason;

    setTransitionError(null);
    transitionMutation.mutate(
      { versionId, data: payload },
      {
        onSuccess: () => {
          toast.success(`版本已${VERSION_EVENT_LABELS[effectiveEvent]}`);
          onClose();
        },
        onError: (error) => {
          setTransitionError(`流转失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  return (
    <AppModal
      open={open}
      title={effectiveEvent != null ? VERSION_EVENT_LABELS[effectiveEvent] : "状态流转"}
      size="md"
      onClose={() => {
        if (!transitionMutation.isPending) onClose();
      }}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          submitTransition();
        }}
      >
        <p className="type-body text-default-500">
          当前状态：<span className="type-emphasis">{VERSION_STATUS_LABELS[fromStatus]}</span>。
          目标状态由服务端按事件解析；expectedStatus 取当前读到的状态（乐观并发，
          远端已变更时会失败，请刷新后重试）。
        </p>
        {event == null ? (
          <OptionSelect
            label="流转事件"
            value={pickedEvent ?? ""}
            options={[
              { id: "", label: "请选择" },
              ...events.map((candidate) => ({
                id: candidate,
                label: VERSION_EVENT_LABELS[candidate],
              })),
            ]}
            onChange={(next) => {
              setPickedEvent(next ? (next as VersionEvent) : null);
              setTransitionError(null);
            }}
          />
        ) : null}
        <TextField value={reason} onChange={setReason} aria-label="流转原因">
          <Label>{reasonRequired ? `流转原因（必填，最长 ${REASON_MAX_LENGTH} 字符）` : `流转原因（可选，最长 ${REASON_MAX_LENGTH} 字符）`}</Label>
          <TextArea rows={3} placeholder="为什么流转…" />
        </TextField>
        {transitionError ? <p className="type-body text-danger">{transitionError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={onClose} isDisabled={transitionMutation.isPending}>
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
