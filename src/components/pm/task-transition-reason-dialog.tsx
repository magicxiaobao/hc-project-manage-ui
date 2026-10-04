/**
 * 卡片拖拽流转的流转文本收集弹窗（P3：p3-board-kanban）。
 *
 * 后端 TaskWorkflowService.dispatch 的硬要求：
 * - 目标 PAUSED/CANCELLED：必须提供原因（requireText）；
 * - 目标 COMPLETED：必须提供交付物或说明（deliverables，无则用 reason）；
 * - COMPLETED → IN_PROGRESS（重新打开）：必须提供原因。
 * 不收集这些文本，拖拽后的 updateStatus 必被后端拒绝。
 *
 * r8 P1-1：TODO→IN_PROGRESS"开始"未分配任务时，后端 START 守卫要求
 * assigneeId 非空（TaskTransitionContext Javadoc；effectiveAssigneeId 为 null
 * → assigneeActive=false → TaskGuardEvaluator 报 ASSIGNEE_INACTIVE）。
 * 此时弹窗额外收集执行人（showAssignee），复用任务详情页的
 * taskNeedsAssigneeConfirm 模式；执行人必填，流转文本可选（textRequired）。
 *
 * 表单 UX 约定：文本域是表单 → useUnsavedChangesGuard dirty check；
 * 必填星号（RequiredMark）；空文本在字段下方 FieldError 提示（编辑即清）。
 * 文本为空时确认按钮禁用并提示，前端先拦截省一次后端往返。
 *
 * r9 P1-1：动态代操作守卫——showAssignee 收集到的执行人 ≠ 当前操作人
 * （actorId）时，原因必填（后端 TaskGuardEvaluator.operationalActor：
 * 代理操作需管理权限 + 非空原因，否则 MISSING_REASON；任务详情页
 * task-detail-live:161 同款守卫）。
 * r9 P1-2：onConfirm 返回三态——区分"提交失败"与"提交成功但刷新失败"；
 * 后者禁用重复提交，只提供"重试刷新"，成功后关闭弹窗并清错误。
 *
 * 父组件按 open/key 重挂载本弹窗（与 BoardFormDialog 同一模式）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import { parseOptionalPositiveInt } from "@/lib/task-create";
import type { TaskStatus } from "@/lib/api/task-types";
import { taskNeedsActorReason } from "@/lib/query";
import { transitionTextMaxLength } from "@/lib/board-kanban";

/**
 * r9 P1-2：流转提交的三态结果——调用方必须区分"提交失败"与
 * "提交成功但看板权威刷新失败"：
 * - success：提交成功（含权威刷新），弹窗可关闭；
 * - submitFailed：POST 未成功，文本保留在弹窗内，可修改后重试提交；
 * - refreshFailed：POST 已成功、仅刷新失败——禁止重复提交，只允许重试刷新。
 */
export type TransitionConfirmResult =
  | { kind: "success" }
  | { kind: "submitFailed"; message?: string }
  | { kind: "refreshFailed" };

export function TaskTransitionReasonDialog({
  open,
  taskTitle,
  from,
  to,
  isPending,
  showAssignee = false,
  textRequired = true,
  actorId = null,
  cardAssigneeId = null,
  onCancel,
  onConfirm,
  onRetryRefresh,
  refreshSucceededSignal,
}: {
  open: boolean;
  taskTitle: string;
  from: TaskStatus;
  to: TaskStatus;
  /** 流转请求在途：禁用输入与关闭 */
  isPending: boolean;
  /**
   * r8 P1-1：是否收集执行人（TODO→IN_PROGRESS 开始未分配任务）。
   * 为 true 时执行人必填，onConfirm 第二个参数回传解析后的执行人 ID。
   */
  showAssignee?: boolean;
  /**
   * r8 P1-1：流转文本是否必填。纯"开始+收集执行人"场景下文本可选，
   * 仍受长度上限约束。
   */
  textRequired?: boolean;
  /**
   * r9 P1-1：当前登录用户 id（数字）。showAssignee 收集到的执行人 ≠ actorId
   * 时原因动态变为必填（代操作审计），与任务详情页 taskNeedsActorReason 同口径。
   * 传 null 表示未知，此时不做动态判定。
   */
  actorId?: number | null;
  /**
   * r9 P1-1：卡片当前执行人 id（未收集执行人场景下动态守卫的比对基准；
   * showAssignee 收集到执行人时优先用收集值）。
   */
  cardAssigneeId?: number | null;
  onCancel: () => void;
  /**
   * r7 F9：请求期间弹窗与文本保留；r9 P1-2 起返回三态结果：
   * - success → 弹窗 markClean 后关闭；
   * - submitFailed → 文本保留并展示提交错误，可修改后重试；
   * - refreshFailed → 展示"已提交、刷新失败"，禁用重复提交，只提供重试刷新。
   * r8 P1-1：第二个参数为收集到的执行人 ID（未收集时为 null）。
   */
  onConfirm: (text: string, assigneeId: number | null) => Promise<TransitionConfirmResult>;
  /**
   * r9 P1-2：仅刷新重试（不重发 POST）。refreshFailed 状态下弹窗渲染
   * "重试刷新"按钮调用它；返回 true 表示权威刷新成功。
   */
  onRetryRefresh?: () => Promise<boolean>;
  /**
   * r11 P1-2：父组件每次确认权威刷新成功即递增（各入口统一经
   * unlockAwaitingCards：协调器自身、顶部横幅重试、toast 重试、
   * 重连自动刷新、列 CRUD 失效刷新）。refreshFailed 态下收到变化 →
   * 失败态已过时（看板已恢复、卡片已解锁），markClean 后关闭；
   * 继续锁死弹窗、要求用户再经弹窗取一次 GET 成功才能退出是 bug。
   */
  refreshSucceededSignal?: number;
}) {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // r9 P1-2："提交成功但刷新失败"状态——禁用重复提交，只允许重试刷新。
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // 本地提交中：confirm 异步化后，父组件 transitionBusy 的首次渲染有空隙，
  // 快速双击会重复提交；本地 guard 补上这道缝。
  const [submitting, setSubmitting] = useState(false);
  // r9 P1-2：重试刷新中
  const [refreshing, setRefreshing] = useState(false);
  const busy = isPending || submitting;
  // 刷新失败态：输入锁定（提交已完成，改文本无意义），只保留取消与重试刷新
  const inputLocked = busy || refreshFailed || refreshing;

  const isDeliverables = to === "COMPLETED";
  const fieldLabel = isDeliverables ? "交付物或完成说明" : "流转原因";
  const fromLabel = statusLabel("task", from);
  const toLabel = statusLabel("task", to);
  // pi r7 F4：后端 TaskTransitionRequest reason @Size(max=500)，
  // deliverables @Size(max=1000)；maxLength 与校验同步，超限挂 FieldError。
  const maxLength = transitionTextMaxLength(to);

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = "";
  const isDirty = text !== initialRef.current || assigneeInput !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  // r9 P1-1：动态代操作守卫——用"弹窗收集到的执行人（若有），否则卡片当前
  // 执行人"为基准判定：执行人 ≠ 当前操作人时原因必填。后端 operationalActor
  // 要求代理操作有管理权限 + 非空原因，否则 MISSING_REASON。
  const parsedAssigneeId = showAssignee ? parseOptionalPositiveInt(assigneeInput) : null;
  const effectiveAssigneeId = parsedAssigneeId ?? cardAssigneeId ?? null;
  const actorReasonRequired = taskNeedsActorReason(to, effectiveAssigneeId, actorId);
  const reasonRequired = textRequired || actorReasonRequired;

  const doClose = useCallback(() => {
    setText("");
    setFieldError(null);
    setAssigneeInput("");
    setAssigneeError(null);
    setSubmitError(null);
    setRefreshFailed(false);
    setRefreshError(null);
    onCancel();
  }, [onCancel]);

  // r11 P1-2：父组件权威成功信号——refreshFailed 态下收到递增，说明失败态
  // 已过时（看板已恢复、卡片已解锁），markClean 后关闭。选关闭而非仅恢复
  // 关闭能力：提交早已成功，重开输入会诱发重复 POST；失败警告文本也已过时，
  // 继续展示是误导。ref 守卫保证同一信号只处理一次。
  const refreshSignalRef = useRef(refreshSucceededSignal ?? 0);
  useEffect(() => {
    const current = refreshSucceededSignal ?? 0;
    if (current === refreshSignalRef.current) return;
    refreshSignalRef.current = current;
    if (refreshFailed) {
      markClean();
      doClose();
    }
  }, [refreshSucceededSignal, refreshFailed, markClean, doClose]);

  const close = () => {
    // r10 P1-1：refreshFailed 时卡片仍锁定（父组件 keepLocked），此时关闭
    // 弹窗会丢掉唯一的重试入口（弹窗内的"重试刷新"按钮；toast 会自动消失），
    // 因此禁用取消直到重试完成（成功后 retryRefresh 会自行 markClean 关闭）
    if (busy || refreshFailed) return;
    guard(doClose);
  };

  const confirm = async () => {
    if (busy || refreshFailed) return;
    // r8 P1-1：执行人必填（正整数严格解析）；流转文本按 reasonRequired 决定
    // 是否必填（r9 P1-1：动态代操作守卫并入），长度上限始终约束。
    let assigneeId: number | null = null;
    if (showAssignee) {
      assigneeId = parsedAssigneeId;
      if (assigneeId == null) {
        setAssigneeError("请填写执行人 ID（正整数）：开始未分配的任务必须指定执行人");
        return;
      }
      setAssigneeError(null);
    }
    const trimmed = text.trim();
    if (reasonRequired && !trimmed) {
      setFieldError(
        actorReasonRequired
          ? "请填写流转原因：执行人不是本人时，代操作需要原因进行审计"
          : "请填写流转说明",
      );
      return;
    }
    if (trimmed.length > maxLength) {
      setFieldError(`流转说明不能超过 ${maxLength} 个字符`);
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    // r7 F9：校验通过不再提前 markClean/卸载；请求落定前弹窗与文本保留，
    // 失败时展示提交错误并允许重试，成功后才授权离开并关闭。
    // r9 P1-2：按三态结果分别处理——refreshFailed 时禁用重复提交，
    // 只展示重试刷新入口。
    setSubmitting(true);
    try {
      const result = await onConfirm(trimmed, assigneeId);
      if (result.kind === "success") {
        markClean();
        doClose();
      } else if (result.kind === "refreshFailed") {
        setRefreshFailed(true);
        setRefreshError(null);
      } else {
        setSubmitError(
          result.message
            ? `提交失败：${result.message}。文本已保留，可修改后重试`
            : "提交失败，文本已保留，可修改后重试（详情见右下角提示）",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** r9 P1-2：仅重试看板权威刷新（不重发 POST）；成功后关闭弹窗并清错误 */
  const retryRefresh = async () => {
    if (refreshing || !onRetryRefresh) return;
    setRefreshing(true);
    try {
      if (await onRetryRefresh()) {
        markClean();
        doClose();
      } else {
        setRefreshError("看板刷新仍未成功，可继续重试");
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {blocker}
      <AppModal
        open={open}
        title={`流转任务：${fromLabel} → ${toLabel}`}
        onClose={close}
        size="md"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-body truncate text-default-600">
            任务：{taskTitle || "（无标题）"}
          </p>
          {showAssignee ? (
            <div>
              <TextField
                value={assigneeInput}
                onChange={(value) => {
                  setAssigneeInput(value);
                  setAssigneeError(null);
                  setSubmitError(null);
                  // r10 P2-5：执行人变更可能解除"执行人不是本人→原因必填"
                  // 的动态守卫（必填星号消失），同步清除残留的原因字段错误，
                  // 否则"执行人不是本人时……需要原因"会一直显示
                  setFieldError(null);
                }}
                isDisabled={inputLocked}
                aria-label="执行人 ID"
              >
                <Label>
                  执行人 ID
                  <RequiredMark />
                </Label>
                <Input placeholder="输入用户 ID（正整数）" inputMode="numeric" />
              </TextField>
              <FieldError message={assigneeError} />
            </div>
          ) : null}
          <div>
            <TextField
              value={text}
              onChange={(value) => {
                setText(value);
                setFieldError(null);
                setSubmitError(null);
              }}
              isDisabled={inputLocked}
            >
              <Label>
                {fieldLabel}
                {reasonRequired ? <RequiredMark /> : null}
              </Label>
              <TextArea
                placeholder={
                  isDeliverables
                    ? "例如：已上线 v1.2.0，验收通过"
                    : "例如：需求变更，暂缓开发"
                }
                rows={3}
                maxLength={maxLength}
              />
            </TextField>
            <FieldError message={fieldError} />
            {actorReasonRequired && !textRequired ? (
              <p className="type-caption mt-1 text-default-500">
                执行人不是本人：代操作审计要求流转原因必填
              </p>
            ) : null}
            {refreshFailed ? (
              <p role="alert" className="mt-1 text-sm text-warning">
                流转请求已成功提交，但看板数据刷新失败。请勿重复提交，点击「重试刷新」仅重新拉取看板数据。
              </p>
            ) : null}
            {refreshError ? (
              <p role="alert" className="mt-1 text-sm text-danger">
                {refreshError}
              </p>
            ) : null}
            {submitError ? (
              <p role="alert" className="mt-1 text-sm text-danger">
                {submitError}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            {/* r10 P1-1：refreshFailed 时禁用取消（见 close 的注释），只保留重试刷新入口 */}
            <Button variant="ghost" onPress={close} isDisabled={busy || refreshing || refreshFailed}>
              取消
            </Button>
            {refreshFailed ? (
              <Button
                variant="primary"
                onPress={() => void retryRefresh()}
                isDisabled={refreshing || !onRetryRefresh}
              >
                {refreshing ? <Spinner size="sm" /> : null}
                重试刷新
              </Button>
            ) : (
              <Button
                variant="primary"
                onPress={() => void confirm()}
                isDisabled={busy}
              >
                {busy ? <Spinner size="sm" /> : null}
                确认流转
              </Button>
            )}
          </div>
        </div>
      </AppModal>
    </>
  );
}
