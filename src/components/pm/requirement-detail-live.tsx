/**
 * 需求详情（P1：p1-requirement-detail）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 详情：GET /requirement/v1/findById/{id}
 * - 流转按钮：按 GET /requirement/v1/status/allowed/{id}/{status} 渲染，
 *   执行 POST /requirement/v1/status/transition；目标态附加字段要求忠实于后端
 *   RequirementWorkflowServiceImpl（IN_DEVELOPMENT 需负责人+实际开始日期，
 *   COMPLETED 需实际结束日期），见 transitionFieldRequirements
 * - 流转历史：GET /requirement/v1/status/history/{id}
 * - 评论：comment/v1 线程（POST /comment/v1/target/REQUIREMENT/{id}/find/create）
 *
 * 后端日期说明：需求上的 estimatedXxx/actualXxx 日期字段为 LocalDate，直接展示 'yyyy-MM-dd'
 * 字符串，不做时区换算；评论 createdAt 为秒级时间戳。
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
import {
  toUserMessage,
  transitionFieldRequirements,
  useAllowedTransitions,
  useCreateRequirementComment,
  useProjectIdByKey,
  useRequirementComments,
  useRequirementDetail,
  useRequirementOptions,
  useTransitionHistory,
  useTransitionRequirement,
} from "@/lib/query";
import type {
  CommentView,
  RequirementResponse,
  RequirementTransitionPayload,
} from "@/lib/api/requirement-types";
import { parseOptionalPositiveInt } from "@/lib/task-create";

const COMMENT_PAGE_SIZE = 50;

/** 后端评论 createdAt 为秒级时间戳，转本地时间展示 */
function formatEpochSecond(value: number | null): string {
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

export function RequirementDetailLive({
  requirementId,
  projectKey,
}: {
  requirementId: number;
  projectKey: string;
}) {
  const detailQuery = useRequirementDetail(requirementId);
  const optionsQuery = useRequirementOptions();
  const requirement = detailQuery.data ?? null;
  // Codex review 4175265694：路由里的 projectKey 必须解析出项目并与记录的
  // projectId 一致，否则跨项目 URL 会在错误的项目上下文里展示并允许操作。
  // 解析中/解析失败时不误判，只在两侧都明确时校验。
  const routeProjectQuery = useProjectIdByKey(projectKey);

  const allowedQuery = useAllowedTransitions(requirementId, requirement?.status);
  const historyQuery = useTransitionHistory(requirementId);
  const commentsQuery = useRequirementComments(requirementId, 1, COMMENT_PAGE_SIZE);

  const transitionMutation = useTransitionRequirement();
  const commentMutation = useCreateRequirementComment(requirementId);

  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);

  const statusLabelOf = (value: string | null | undefined) =>
    optionsQuery.data?.statuses.find((option) => option.value === value)?.label ?? value ?? "-";
  const typeLabelOf = (value: string) =>
    optionsQuery.data?.types.find((option) => option.value === value)?.label ?? value;

  const openTransition = (toStatus: string) => {
    transitionMutation.reset();
    setTransitionTarget(toStatus);
    setReason("");
    setAssigneeInput("");
    setDateInput("");
    setFormError(null);
  };

  const submitTransition = () => {
    if (transitionTarget == null) return;
    const fields = transitionFieldRequirements(transitionTarget);
    const payload: RequirementTransitionPayload = {
      requirementId,
      toStatus: transitionTarget,
    };
    const trimmedReason = reason.trim();
    if (trimmedReason) payload.reason = trimmedReason;
    if (fields.requireAssignee) {
      // Codex review 4175402481：负责人 ID 用严格的十进制正整数解析
      // （Number("9007199254740993") 会四舍五入、"1e3"/"0x10" 也会被接受，
      // 可能把请求发给错误的用户）。
      const parsed = parseOptionalPositiveInt(assigneeInput);
      if (parsed == null) {
        setFormError("请填写负责人 ID（正整数）。");
        return;
      }
      payload.assigneeId = parsed;
    }
    if (fields.requireDate && fields.dateField) {
      if (!dateInput) {
        setFormError(`请选择${fields.dateLabel ?? "日期"}。`);
        return;
      }
      payload[fields.dateField] = dateInput;
    }
    setFormError(null);
    transitionMutation.mutate(payload, {
      onSuccess: () => setTransitionTarget(null),
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
        正在加载需求详情…
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">需求详情加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (!requirement) {
    return <EmptyHint>{`没有找到这个需求（id=${requirementId}）。`}</EmptyHint>;
  }

  const allowed: string[] = allowedQuery.data ?? [];
  const comments: CommentView[] = commentsQuery.data?.list ?? [];
  const detail: RequirementResponse = requirement;
  const routeProjectId = routeProjectQuery.data;
  if (
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId !== routeProjectId
  ) {
    return (
      <EmptyHint>{`需求 #${requirementId} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
    );
  }
  // Codex review 4175337049：写操作区（状态流转/发表评论）只有在路由项目
  // 解析成功且与记录的 projectId 精确一致时才渲染。解析中 / 解析失败 / key 不
  // 存在时页面仍展示只读详情，但不暴露任何写控件，避免在错误的项目上下文里变异数据。
  const projectContextVerified =
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId === routeProjectId;
  const projectContextNotice = routeProjectQuery.isPending
    ? "正在确认项目归属，操作区稍后可用…"
    : "当前无法确认该记录归属于此项目，操作区已禁用。";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          to="/p/$projectKey/requirements"
          params={{ projectKey }}
          className="type-caption text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回需求列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PageHeading title={detail.title} hint={`需求 #${detail.id} · 真实后端数据（GET /requirement/v1/findById）。`} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="type-caption rounded-sm border border-border px-2 py-0.5">
            {typeLabelOf(detail.requirementType)}
          </span>
          <PriorityMark priority={detail.priority} />
          <StatusChip kind="requirement" status={detail.status} />
        </div>
      </div>

      <section aria-label="基本信息">
        <h2 className="type-emphasis mb-2">基本信息</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
          <MetaItem label="故事点" value={detail.storyPoints != null ? `${detail.storyPoints} 点` : "-"} />
          <MetaItem label="负责人 ID" value={detail.assigneeId != null ? String(detail.assigneeId) : "-"} />
          <MetaItem label="预计开始" value={detail.estimatedStartDate ?? "-"} />
          <MetaItem label="预计结束" value={detail.estimatedEndDate ?? "-"} />
          <MetaItem label="实际开始" value={detail.actualStartDate ?? "-"} />
          <MetaItem label="实际结束" value={detail.actualEndDate ?? "-"} />
          <MetaItem label="所属项目 ID" value={detail.projectId != null ? String(detail.projectId) : "-"} />
          <MetaItem label="父需求 ID" value={detail.parentId != null ? String(detail.parentId) : "-"} />
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
      <section aria-label="状态流转">
        <h2 className="type-emphasis mb-2">状态流转</h2>
        {allowedQuery.isPending ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载可用流转…
          </div>
        ) : null}
        {allowedQuery.isError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-body text-danger">可用流转加载失败：{toUserMessage(allowedQuery.error)}</p>
            <Button size="sm" variant="ghost" onPress={() => void allowedQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {allowedQuery.isSuccess && allowed.length === 0 ? (
          <p className="type-caption text-default-500">当前状态（{statusLabelOf(detail.status)}）无可用流转。</p>
        ) : null}
        {allowed.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allowed.map((toStatus) => (
              <Button
                key={toStatus}
                size="sm"
                variant="primary"
                isDisabled={transitionMutation.isPending}
                onPress={() => openTransition(toStatus)}
              >
                流转到{statusLabelOf(toStatus)}
              </Button>
            ))}
          </div>
        ) : null}
      </section>
      ) : (
        <p className="type-body rounded-sm border border-border bg-surface px-3 py-2 text-default-500">
          {projectContextNotice}
        </p>
      )}

      <section aria-label="流转历史">
        <h2 className="type-emphasis mb-2">流转历史</h2>
        {historyQuery.isPending ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载流转历史…
          </div>
        ) : null}
        {historyQuery.isError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-body text-danger">流转历史加载失败：{toUserMessage(historyQuery.error)}</p>
            <Button size="sm" variant="ghost" onPress={() => void historyQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {historyQuery.isSuccess && (historyQuery.data?.transitions.length ?? 0) === 0 ? (
          <p className="type-caption text-default-500">暂无流转记录。</p>
        ) : null}
        {historyQuery.isSuccess && (historyQuery.data?.transitions.length ?? 0) > 0 ? (
          <ul className="flex flex-col gap-2">
            {historyQuery.data!.transitions.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm border border-border bg-surface px-3 py-2"
              >
                <span className="type-body">
                  {statusLabelOf(record.fromStatus)} → {statusLabelOf(record.toStatus)}
                </span>
                {record.transitionReason ? (
                  <span className="type-caption min-w-0 flex-1 text-default-500">{record.transitionReason}</span>
                ) : null}
                <span className="type-caption ml-auto text-default-500">
                  {record.transitionTime}
                  {record.operatorId != null ? ` · 操作人 ${record.operatorId}` : ""}
                  {record.isAutoTransition ? " · 自动" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
        title={transitionTarget != null ? `流转到${statusLabelOf(transitionTarget)}` : "状态流转"}
        size="md"
        onClose={() => setTransitionTarget(null)}
      >
        {transitionTarget != null ? (
          <TransitionForm
            toStatus={transitionTarget}
            statusLabel={statusLabelOf(transitionTarget)}
            reason={reason}
            onReason={setReason}
            assigneeInput={assigneeInput}
            onAssigneeInput={setAssigneeInput}
            dateInput={dateInput}
            onDateInput={setDateInput}
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

function TransitionForm({
  toStatus,
  statusLabel,
  reason,
  onReason,
  assigneeInput,
  onAssigneeInput,
  dateInput,
  onDateInput,
  formError,
  submitting,
  onSubmit,
  onCancel,
}: {
  toStatus: string;
  statusLabel: string;
  reason: string;
  onReason: (value: string) => void;
  assigneeInput: string;
  onAssigneeInput: (value: string) => void;
  dateInput: string;
  onDateInput: (value: string) => void;
  formError: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const fields = transitionFieldRequirements(toStatus);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField value={reason} onChange={onReason} aria-label="流转原因">
        <Label>流转原因（可选）</Label>
        <TextArea rows={3} placeholder={`为什么流转到${statusLabel}…`} />
      </TextField>
      {fields.requireAssignee ? (
        <TextField value={assigneeInput} onChange={onAssigneeInput} aria-label="负责人 ID">
          <Label>负责人 ID（必填）</Label>
          <Input placeholder="输入用户 ID（正整数）" inputMode="numeric" />
        </TextField>
      ) : null}
      {fields.requireDate && fields.dateField && fields.dateLabel ? (
        <TextField value={dateInput} onChange={onDateInput} aria-label={fields.dateLabel}>
          <Label>{fields.dateLabel}（必填）</Label>
          <Input type="date" />
        </TextField>
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
