/**
 * 任务详情（P1：p1-task-detail）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 详情：GET /task/v1/findById/{id}
 * - 状态流转：按 TASK_TRANSITIONS_BY_STATUS 渲染目标按钮
 *   （老前端 frontend/src/types/task.ts 的前端镜像，后端 TaskStatusEnum 状态机
 *   权威校验非法流转），执行 POST /task/v1/updateStatus；
 *   暂停/取消/完成需原因，完成可选填交付物（缺省时取原因），
 *   TODO→IN_PROGRESS 且无执行人时需先确认执行人，
 *   COMPLETED→IN_PROGRESS 是重新打开（后端 REOPEN 事件，需管理权限）
 * - 改派：POST /task/v1/assign（reason 必填）
 * - 评论：comment/v1 线程（POST /comment/v1/target/TASK/{id}/find/create）
 *
 * 后端日期说明：estimatedStartDate/estimatedEndDate 为 LocalDate，直接展示
 * 'yyyy-MM-dd' 字符串不做时区换算；actualStartDate/actualEndDate/createdAt/
 * updatedAt 为秒级时间戳；评论 createdAt 同样为秒级时间戳。
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import {
  AppModal,
  EmptyHint,
  PageHeading,
  PriorityMark,
  StatusChip,
} from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseOptionalPositiveInt } from "@/lib/task-create";
import {
  taskNeedsActorReason,
  taskNeedsAssigneeConfirm,
  taskNeedsReason,
  taskNeedsReopenReason,
  taskTransitionLabel,
  taskTransitionTargets,
  toUserMessage,
  useAssignTask,
  useCreateTaskComment,
  useProjectIdByKey,
  useTaskComments,
  useTaskDetail,
  useUpdateTaskStatus,
} from "@/lib/query";
import type { CommentView } from "@/lib/api/requirement-types";
import type {
  TaskAssignPayload,
  TaskResponse,
  TaskStatus,
  TaskTransitionPayload,
} from "@/lib/api/task-types";

const COMMENT_PAGE_SIZE = 50;

/** 后端 actualXxx/createdAt/updatedAt 为秒级时间戳，转本地时间展示 */
function formatEpochSecond(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5 break-words">{value}</dd>
    </div>
  );
}

export function TaskDetailLive({
  taskId,
  projectKey,
}: {
  taskId: number;
  projectKey: string;
}) {
  const detailQuery = useTaskDetail(taskId);
  const task = detailQuery.data ?? null;
  // Codex review 4175265694：路由里的 projectKey 必须解析出项目并与记录的
  // projectId 一致，否则 /p/A/issues/<B 的任务 id> 会在项目 A 的上下文里
  // 展示并允许操作 B 的任务。解析中/解析失败时不误判，只在两侧都明确时校验。
  const routeProjectQuery = useProjectIdByKey(projectKey);

  const commentsQuery = useTaskComments(taskId, 1, COMMENT_PAGE_SIZE);

  const transitionMutation = useUpdateTaskStatus();
  const assignMutation = useAssignTask();
  const commentMutation = useCreateTaskComment(taskId);

  const actorUserId = useAuthStore((state) => state.user?.userId);
  const actorId = actorUserId != null && /^\d+$/.test(actorUserId) ? Number(actorUserId) : null;

  const [transitionTarget, setTransitionTarget] = useState<TaskStatus | null>(null);
  const [reason, setReason] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [assignAssignee, setAssignAssignee] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);

  const statusLabelOf = (value: string) => statusLabel("task", value);

  const openTransition = (toStatus: TaskStatus) => {
    transitionMutation.reset();
    setTransitionTarget(toStatus);
    setReason("");
    setAssigneeInput("");
    setDeliverables("");
    setFormError(null);
  };

  const submitTransition = () => {
    if (transitionTarget == null || task == null) return;
    const fromStatus = task.status;
    const toStatus = transitionTarget;
    const needsReason =
      taskNeedsReason(toStatus) ||
      taskNeedsReopenReason(fromStatus, toStatus) ||
      taskNeedsActorReason(toStatus, task.assigneeId, actorId);

    const payload: TaskTransitionPayload = { taskId, status: toStatus };
    const trimmedReason = reason.trim();
    if (needsReason && !trimmedReason) {
      setFormError("请填写流转原因。");
      return;
    }
    if (trimmedReason) payload.reason = trimmedReason;

    // 开始未分配任务：认领时一并确认执行人
    if (toStatus === "IN_PROGRESS") {
      const current = task.assigneeId;
      if (taskNeedsAssigneeConfirm(fromStatus, toStatus, current)) {
        // Codex review 4175402481：执行人 ID 用严格的十进制正整数解析
        // （Number("9007199254740993") 会四舍五入、"1e3"/"0x10" 也会被接受，
        // 可能把请求发给错误的用户）。
        const parsed = parseOptionalPositiveInt(assigneeInput);
        if (parsed == null) {
          setFormError("请填写执行人 ID（正整数）。");
          return;
        }
        payload.assigneeId = parsed;
      }
    }
    // 完成：交付物可选填（后端 deliverables 缺省时取原因，至少要有原因/说明）
    if (toStatus === "COMPLETED") {
      const trimmedDeliverables = deliverables.trim();
      if (trimmedDeliverables) payload.deliverables = trimmedDeliverables;
    }
    setFormError(null);
    transitionMutation.mutate(payload, {
      onSuccess: () => setTransitionTarget(null),
    });
  };

  const submitAssign = () => {
    // Codex review 4175402481：同上，改派的执行人 ID 也用严格解析。
    const parsed = parseOptionalPositiveInt(assignAssignee);
    if (parsed == null) {
      setAssignError("请填写执行人 ID（正整数）。");
      return;
    }
    const trimmedReason = assignReason.trim();
    if (!trimmedReason) {
      setAssignError("改派原因必填。");
      return;
    }
    setAssignError(null);
    const payload: TaskAssignPayload = { taskId, assigneeId: parsed, reason: trimmedReason };
    assignMutation.mutate(payload, {
      onSuccess: () => {
        setAssignAssignee("");
        setAssignReason("");
      },
    });
  };

  const submitComment = () => {
    const content = draft.trim();
    if (!content || commentMutation.isPending) return;
    commentMutation.mutate(
      { content, parentId: replyTo?.id ?? null },
      {
        onSuccess: () => {
          setDraft("");
          setReplyTo(null);
        },
      },
    );
  };

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载任务详情…
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">任务详情加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (!task) {
    return <EmptyHint>{`没有找到这个任务（id=${taskId}）。`}</EmptyHint>;
  }

  const detail: TaskResponse = task;
  const routeProjectId = routeProjectQuery.data;
  if (
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId !== routeProjectId
  ) {
    return (
      <EmptyHint>{`任务 #${taskId} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
    );
  }
  // Codex review 4175337049：写操作区（状态流转/改派/发表评论）只有在路由项目
  // 解析成功且与记录的 projectId 精确一致时才渲染。解析中 / 解析失败 / key 不
  // 存在时页面仍展示只读详情，但不暴露任何写控件，避免在错误的项目上下文里变异数据。
  const projectContextVerified =
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId === routeProjectId;
  const projectContextNotice = routeProjectQuery.isPending
    ? "正在确认项目归属，操作区稍后可用…"
    : "当前无法确认该记录归属于此项目，操作区已禁用。";
  const targets = taskTransitionTargets(detail.status);
  const comments: CommentView[] = commentsQuery.data?.list ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          to="/p/$projectKey/issues"
          params={{ projectKey }}
          className="type-caption text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回任务列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PageHeading title={detail.title} hint={`任务 #${detail.id} · 真实后端数据（GET /task/v1/findById）。`} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {detail.taskType ? (
            <span className="type-caption rounded-sm border border-border px-2 py-0.5">
              {detail.taskType}
            </span>
          ) : null}
          <PriorityMark priority={detail.priority} />
          <StatusChip kind="task" status={detail.status} />
          {detail.statusLabel ? (
            <span className="type-caption text-default-500">{detail.statusLabel}</span>
          ) : null}
        </div>
      </div>

      <section aria-label="基本信息">
        <h2 className="type-emphasis mb-2">基本信息</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
          <MetaItem label="执行人 ID" value={detail.assigneeId != null ? String(detail.assigneeId) : "-"} />
          <MetaItem label="报告人 ID" value={detail.reporterId != null ? String(detail.reporterId) : "-"} />
          <MetaItem label="故事点" value={detail.storyPoints != null ? `${detail.storyPoints} 点` : "-"} />
          <MetaItem label="进度" value={detail.progress != null ? `${detail.progress}%` : "-"} />
          <MetaItem label="预计开始" value={detail.estimatedStartDate ?? "-"} />
          <MetaItem label="预计结束" value={detail.estimatedEndDate ?? "-"} />
          <MetaItem label="实际开始" value={formatEpochSecond(detail.actualStartDate)} />
          <MetaItem label="实际结束" value={formatEpochSecond(detail.actualEndDate)} />
          <MetaItem label="预估工时" value={detail.estimatedHours != null ? `${detail.estimatedHours} 小时` : "-"} />
          <MetaItem label="实际工时" value={detail.actualHours != null ? `${detail.actualHours} 小时` : "-"} />
          <MetaItem label="所属项目 ID" value={detail.projectId != null ? String(detail.projectId) : "-"} />
          <MetaItem label="所属冲刺 ID" value={detail.sprintId != null ? String(detail.sprintId) : "-"} />
          <MetaItem label="标签" value={detail.tags ?? "-"} />
          <MetaItem label="创建时间" value={formatEpochSecond(detail.createdAt)} />
        </dl>
        {detail.description ? (
          <p className="type-body mt-3 whitespace-pre-wrap rounded-sm border border-border bg-surface p-4">
            {detail.description}
          </p>
        ) : (
          <p className="type-caption mt-3 text-default-500">暂无描述。</p>
        )}
      </section>

      {/* Codex review 4175337049：项目归属未确认前不渲染写操作区。 */}
      {projectContextVerified ? (
        <>
      <section aria-label="状态流转">
        <h2 className="type-emphasis mb-2">状态流转</h2>
        {targets.length === 0 ? (
          <p className="type-caption text-default-500">
            当前状态（{statusLabelOf(detail.status)}）无可用流转。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {targets.map((toStatus) => (
              <Button
                key={toStatus}
                size="sm"
                variant="primary"
                isDisabled={transitionMutation.isPending}
                onPress={() => openTransition(toStatus)}
              >
                {taskTransitionLabel(detail.status, toStatus, statusLabelOf)}
              </Button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="改派">
        <h2 className="type-emphasis mb-2">改派</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitAssign();
          }}
        >
          <div className="w-44">
            <TextField value={assignAssignee} onChange={setAssignAssignee} aria-label="执行人用户 ID">
              <Label>执行人用户 ID</Label>
              <Input placeholder="输入用户 ID" inputMode="numeric" />
            </TextField>
          </div>
          <div className="min-w-48 flex-1">
            <TextField value={assignReason} onChange={setAssignReason} aria-label="改派原因">
              <Label>改派原因（必填）</Label>
              <Input placeholder="为什么改派…" />
            </TextField>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            isDisabled={assignMutation.isPending}
          >
            {assignMutation.isPending ? "改派中…" : "确认改派"}
          </Button>
        </form>
        {(assignError ?? (assignMutation.isError ? toUserMessage(assignMutation.error) : null)) ? (
          <p className="type-body mt-2 text-danger">
            {assignError ?? toUserMessage(assignMutation.error)}
          </p>
        ) : null}
        {assignMutation.isSuccess ? (
          <p className="type-caption mt-2 text-default-500">改派成功（走状态机改派工作流）。</p>
        ) : null}
      </section>
        </>
      ) : (
        <p className="type-body rounded-sm border border-border bg-surface px-3 py-2 text-default-500">
          {projectContextNotice}
        </p>
      )}

      <section aria-label="评论">
        <h2 className="type-emphasis mb-2">评论</h2>
        {commentsQuery.isPending ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载评论…
          </div>
        ) : null}
        {commentsQuery.isError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-body text-danger">评论加载失败：{toUserMessage(commentsQuery.error)}</p>
            <Button size="sm" variant="ghost" onPress={() => void commentsQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {commentsQuery.isSuccess && comments.length === 0 ? (
          <p className="type-caption text-default-500">还没有评论。</p>
        ) : null}
        {comments.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-sm border border-border bg-surface px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="type-emphasis">用户 {comment.creatorId}</span>
                  <span className="type-caption text-default-500">{formatEpochSecond(comment.createdAt)}</span>
                  {comment.parentId != null ? (
                    <span className="type-caption text-default-500">回复 #{comment.parentId}</span>
                  ) : null}
                  <button
                    type="button"
                    className="type-caption ml-auto text-default-500 underline-offset-2 hover:underline"
                    onClick={() => setReplyTo(comment)}
                  >
                    回复
                  </button>
                </div>
                <p className="type-body mt-1 whitespace-pre-wrap">{comment.content}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {projectContextVerified ? (
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitComment();
          }}
        >
          {replyTo ? (
            <p className="type-caption text-default-500">
              正在回复评论 #{replyTo.id}
              <button
                type="button"
                className="ml-2 underline-offset-2 hover:underline"
                onClick={() => setReplyTo(null)}
              >
                取消回复
              </button>
            </p>
          ) : null}
          <TextField value={draft} onChange={setDraft} aria-label="发表评论">
            <Label className="sr-only">评论</Label>
            <TextArea rows={3} placeholder="写下评论…" />
          </TextField>
          {commentMutation.isError ? (
            <p className="type-body text-danger">评论发送失败：{toUserMessage(commentMutation.error)}</p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            variant="primary"
            className="self-end"
            isDisabled={!draft.trim() || commentMutation.isPending}
          >
            {commentMutation.isPending ? "发送中…" : "发送评论"}
          </Button>
        </form>
        ) : (
          <p className="type-caption mt-4 text-default-500">{projectContextNotice}</p>
        )}
      </section>

      <AppModal
        open={transitionTarget != null}
        title={
          transitionTarget != null
            ? `流转到${taskTransitionLabel(detail.status, transitionTarget, statusLabelOf)}`
            : "状态流转"
        }
        size="md"
        onClose={() => setTransitionTarget(null)}
      >
        {transitionTarget != null ? (
          <TaskTransitionForm
            toStatus={transitionTarget}
            reason={reason}
            onReason={setReason}
            reasonRequired={
              taskNeedsReason(transitionTarget) ||
              taskNeedsReopenReason(detail.status, transitionTarget) ||
              taskNeedsActorReason(transitionTarget, detail.assigneeId, actorId)
            }
            assigneeInput={assigneeInput}
            onAssigneeInput={setAssigneeInput}
            // Codex review 4175337103：只有未分配 TODO 开始时执行人输入才会被提交
            //（submitTransition 仅 taskNeedsAssigneeConfirm 时读值）；其余流转隐藏该
            // 字段，避免“填了却被静默忽略”的误导。
            showAssignee={taskNeedsAssigneeConfirm(detail.status, transitionTarget, detail.assigneeId)}
            assigneeRequired={taskNeedsAssigneeConfirm(detail.status, transitionTarget, detail.assigneeId)}
            showDeliverables={transitionTarget === "COMPLETED"}
            deliverables={deliverables}
            onDeliverables={setDeliverables}
            showReopenHint={taskNeedsReopenReason(detail.status, transitionTarget)}
            formError={formError ?? (transitionMutation.isError ? toUserMessage(transitionMutation.error) : null)}
            submitting={transitionMutation.isPending}
            onSubmit={submitTransition}
            onCancel={() => setTransitionTarget(null)}
          />
        ) : null}
      </AppModal>
    </div>
  );
}

function TaskTransitionForm({
  toStatus,
  reason,
  onReason,
  reasonRequired,
  assigneeInput,
  onAssigneeInput,
  showAssignee,
  assigneeRequired,
  showDeliverables,
  deliverables,
  onDeliverables,
  showReopenHint,
  formError,
  submitting,
  onSubmit,
  onCancel,
}: {
  toStatus: TaskStatus;
  reason: string;
  onReason: (value: string) => void;
  reasonRequired: boolean;
  assigneeInput: string;
  onAssigneeInput: (value: string) => void;
  showAssignee: boolean;
  assigneeRequired: boolean;
  showDeliverables: boolean;
  deliverables: string;
  onDeliverables: (value: string) => void;
  showReopenHint: boolean;
  formError: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField value={reason} onChange={onReason} aria-label="流转原因">
        <Label>{reasonRequired ? "流转原因（必填）" : "流转原因（可选）"}</Label>
        <TextArea rows={3} placeholder="为什么流转…" />
      </TextField>
      {showAssignee ? (
        <TextField value={assigneeInput} onChange={onAssigneeInput} aria-label="执行人 ID">
          <Label>{assigneeRequired ? "执行人 ID（必填，无执行人需先认领）" : "执行人 ID（可选）"}</Label>
          <Input placeholder="输入用户 ID（正整数）" inputMode="numeric" />
        </TextField>
      ) : null}
      {showDeliverables ? (
        <TextField value={deliverables} onChange={onDeliverables} aria-label="交付物或完成说明">
          <Label>交付物或完成说明（可选，缺省时取流转原因）</Label>
          <TextArea rows={3} placeholder="交付了什么…" />
        </TextField>
      ) : null}
      {showReopenHint ? (
        <p className="type-caption text-default-500">
          重新打开将经后端 REOPEN 事件处理，通常需要管理权限。
        </p>
      ) : null}
      {toStatus === "CANCELLED" || toStatus === "PAUSED" ? (
        <p className="type-caption text-default-500">暂停/取消需要原因，原因将随流转记录落库。</p>
      ) : null}
      {formError ? <p className="type-body text-danger">{formError}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onCancel} isDisabled={submitting}>
          取消
        </Button>
        <Button type="submit" variant="primary" isDisabled={submitting}>
          {submitting ? "流转中…" : "确认流转"}
        </Button>
      </div>
    </form>
  );
}
