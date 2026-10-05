/**
 * 发布详情（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：GET /release/v1/findById/{id}（useReleaseDetail），返回 release +
 *   范围快照/门禁/审批/产物证据
 * - 草稿态（DRAFT）：编辑草稿（ReleaseDraftEditDialog，整包覆盖）/ 提交审批
 *   （无请求体）/ 删除草稿（可选管理员原因）
 * - 门禁面板：详情 gateResults 只读渲染（门禁类型/通过/豁免/豁免原因/时间）+
 *   「预览实时门禁」按需 GET previewGates + 豁免/撤销豁免弹窗
 *   （ReleaseWaiverDialog，仅草稿态可操作，老前端 draftActionsEnabled 口径）
 * - 审批面板：审批记录只读；待审批态可审批通过/驳回（原因必填）
 * - 结果记录：已批准态可记录发布成功/失败（ReleaseResultDialog，制品证据
 *   口径忠实 ReleaseArtifactPanel）
 * - 生命周期：待审批/已批准可取消（原因必填）；终态（已驳回/发布失败/
 *   已取消/已发布）可复制为草稿；已发布可额外创建回滚草稿
 *   （老前端 ReleaseLifecycleActionPanel 口径）
 * - 操作按钮在任意变更请求进行中时禁用（r22 教训）
 *
 * 未登录时不使用本组件（路由层渲染登录提示）。
 */
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, EmptyHint, FieldError, PageHeading, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import {
  toUserMessage,
  useCancelRelease,
  useCopyReleaseAsDraft,
  useDeleteReleaseDraft,
  usePreviewReleaseGates,
  useProjectIdByKey,
  useRejectRelease,
  useReleaseDetail,
  useRollbackReleaseAsDraft,
  useSubmitRelease,
} from "@/lib/query";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  RELEASE_GATE_TYPE_LABELS,
  RELEASE_STATUS_LABELS,
  RELEASE_TYPE_LABELS,
} from "@/lib/api/release-types";
import type {
  ReleaseDetailResponse,
  ReleaseResponse,
  ReleaseStatus,
} from "@/lib/api/release-types";
import { ReleaseDraftEditDialog } from "@/components/pm/release-form-dialog";
import { ReleaseWaiverDialog } from "@/components/pm/release-waiver-dialog";
import { buildGateOptions } from "@/lib/release-form";
import { ReleaseReasonDialog } from "@/components/pm/release-reason-dialog";
import type { ReleaseReasonAction } from "@/components/pm/release-reason-dialog";
import { ReleaseResultDialog } from "@/components/pm/release-result-dialog";
import type { ReleaseRecordMode } from "@/components/pm/release-result-dialog";

const TERMINAL_STATUSES: ReleaseStatus[] = ["REJECTED", "FAILED", "CANCELLED", "RELEASED"];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="type-caption text-default-500">{label}</span>
      <span className="type-body whitespace-pre-wrap break-words">{value || "—"}</span>
    </div>
  );
}

function StatusChip({ status }: { status: ReleaseStatus }) {
  const terminal = status === "RELEASED";
  const failed = status === "FAILED" || status === "REJECTED" || status === "CANCELLED";
  return (
    <span
      className={`type-caption shrink-0 rounded-sm border border-border px-2 py-0.5 ${
        terminal ? "text-success" : failed ? "text-danger" : "text-default-500"
      }`}
    >
      {RELEASE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * 删除草稿确认弹窗。
 *
 * 管理员原因条件契约（codex r24 P2-7；仿 testrun overrideReason r10-3 先例）：
 * 后端 deleteDraft 规定非 owner 且 adminReason 为空直接拒绝
 * （ReleaseDraftService.java:292）——本人删除时字段隐藏且不发送；
 * 代他人删除时必填 + 必填星号 + 字段级错误。owner 未知时按代他人处理。
 */
function DeleteDraftDialog({
  open,
  releaseId,
  draftOwnerId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  releaseId: number;
  draftOwnerId: number | null;
  onClose: () => void;
  /** 删除成功回调：调用方跳回发布列表（已删除的详情不应再展示） */
  onDeleted: () => void;
}) {
  const deleteMutation = useDeleteReleaseDraft();
  const [adminReason, setAdminReason] = useState("");
  const [adminReasonError, setAdminReasonError] = useState("");

  const currentUserId = useAuthStore((s) => s.user?.userId ?? null);
  const isSelfDelete =
    currentUserId != null &&
    draftOwnerId != null &&
    String(draftOwnerId) === currentUserId;

  const initialRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (open) {
      initialRef.current = JSON.stringify("");
      setAdminReason("");
      setAdminReasonError("");
    }
  }, [open ]);

  const isDirty = JSON.stringify(adminReason) !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const doClose = () => {
    onClose();
  };

  const close = () => {
    if (deleteMutation.isPending) return;
    guard(doClose);
  };

  const handleConfirm = () => {
    if (deleteMutation.isPending) return;
    const trimmed = adminReason.trim();
    if (!isSelfDelete && trimmed === "") {
      setAdminReasonError("代他人删除时必须填写管理员原因");
      return;
    }
    setAdminReasonError("");
    deleteMutation.mutate(
      { releaseId, adminReason: trimmed ? trimmed : undefined },
      {
        onSuccess: () => {
          toast.success("发布草稿已删除");
          markClean();
          doClose();
          onDeleted();
        },
        onError: (error) => {
          toast.error(`删除失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  return (
    <>
      {blocker}
      <AppModal open={open} title={`删除发布草稿（#${releaseId}）`} onClose={close} size="md">
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-body text-danger">删除后不可恢复，确认删除该发布草稿？</p>
          {isSelfDelete ? null : (
            <div>
              <TextField
                value={adminReason}
                onChange={(next) => {
                  setAdminReason(next);
                  setAdminReasonError("");
                }}
                aria-label="管理员原因（必填）"
                isDisabled={deleteMutation.isPending}
              >
                <Label>
                  管理员原因<RequiredMark />
                </Label>
                <TextArea placeholder="代他人删除时说明原因" />
              </TextField>
              <FieldError message={adminReasonError} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={deleteMutation.isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleConfirm} isDisabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}

export function ReleaseDetailLive({
  releaseId,
  projectKey,
}: {
  releaseId: number;
  projectKey: string;
}) {
  const navigate = useNavigate();
  const detailQuery = useReleaseDetail(releaseId);
  const gatesPreviewQuery = usePreviewReleaseGates(releaseId);

  const submitMutation = useSubmitRelease();
  const rejectMutation = useRejectRelease();
  const cancelMutation = useCancelRelease();
  const copyMutation = useCopyReleaseAsDraft();
  const rollbackMutation = useRollbackReleaseAsDraft();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [waiverMode, setWaiverMode] = useState<"waive" | "revoke" | null>(null);
  const [waiverGateType, setWaiverGateType] = useState<string | undefined>(undefined);
  const [reasonAction, setReasonAction] = useState<ReleaseReasonAction | null>(null);
  const [resultMode, setResultMode] = useState<ReleaseRecordMode | null>(null);

  // 任意变更请求进行中时禁用操作按钮（r22 教训：静默丢弃在途修改）
  const operating =
    submitMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    copyMutation.isPending ||
    rollbackMutation.isPending;

  const handleSubmit = () => {
    submitMutation.mutate(releaseId, {
      onSuccess: () => {
        toast.success("已提交审批");
      },
      onError: (error) => {
        toast.error(`提交失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleClone = (kind: "copy" | "rollback") => {
    const mutation = kind === "copy" ? copyMutation : rollbackMutation;
    mutation.mutate(
      { releaseId, data: { idempotencyKey: crypto.randomUUID() } },
      {
        onSuccess: (created) => {
          toast.success(kind === "copy" ? `已复制为草稿（#${created.id}）` : `回滚草稿已创建（#${created.id}）`);
          void navigate({
            to: "/p/$projectKey/releases/$releaseId",
            params: { projectKey, releaseId: String(created.id) },
          });
        },
        onError: (error) => {
          toast.error(`创建失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const detail = detailQuery.data ?? null;

  // 路由项目归属守卫（仿 version-detail-live r20-1 先例；codex r24 P1-3；
  // r25 P2-2 裁定与 version-detail-live:153-162 对齐）：
  // 路由里的 projectKey 必须解析出项目并与记录的 projectId 精确一致。
  // 归属不符时直接返回 EmptyHint，不在错误项目上下文展示它项目详情；
  // 解析中/解析失败时不误判：只读展示，写操作区隐藏并挂 projectContextNotice。
  const routeProjectQuery = useProjectIdByKey(projectKey);
  const routeProjectId = routeProjectQuery.data;
  const projectContextVerified =
    typeof routeProjectId === "number" &&
    detail != null &&
    detail.release.projectId === routeProjectId;
  const projectMismatch =
    typeof routeProjectId === "number" &&
    detail != null &&
    detail.release.projectId !== routeProjectId;

  // 项目归属解析中/失败时的操作区提示（仿 version-detail-live:165-167；
  // codex r25 P2-3）：此前 routeProjectQuery 失败/进行中只会让 canWrite 静默
  // 翻 false、写操作区无声消失，既无提示也无重试入口。这里给出明确文案：
  // 解析中 → 操作区稍后可用；失败 → 操作区已禁用 + 重试项目解析入口。
  const projectContextNotice =
    detail != null && !projectContextVerified && !projectMismatch
      ? routeProjectQuery.isPending
        ? "正在确认项目归属，操作区稍后可用"
        : "当前无法确认归属，操作区已禁用"
      : null;
  const projectContextNoticeRetry =
    projectContextNotice != null && !routeProjectQuery.isPending;
  const retryProjectContext = () => {
    void routeProjectQuery.refetch();
  };

  // 已通过门禁（提交快照 + 实时预览）从豁免下拉排除（codex r24 P2-5；
  // DIRECT_REQUIREMENT_SCOPE 由弹窗恒排除）
  const excludedGateTypes = useMemo(() => {
    const excluded = new Set<string>();
    for (const gate of detail?.gateResults ?? []) {
      if (gate.passed) excluded.add(gate.gateType);
    }
    for (const decision of gatesPreviewQuery.data ?? []) {
      if (decision.passed) excluded.add(decision.gateType);
    }
    return [...excluded];
  }, [detail, gatesPreviewQuery.data]);

  // 顶部"豁免门禁"入口（waive、无预设）当前可豁免的门禁数：全部非 DIRECT
  // 门禁已通过时为 0，此时禁用入口（codex r25 P2-4；弹窗内另有兜底）。
  const waivableGateCount = buildGateOptions(excludedGateTypes).length;

  // 弹窗 keyed 实例在早返回之外声明：pending/error/not-found/成功四个分支
  // 共用同一 keyed Fragment 实例（codex r25 P1-1；仿 testrun-detail-live
  // r10-1 <Fragment key="testrun-dialogs">）：分支切换时 React 按 key 复用
  // 而不 remount；后台重取失败（isError 但保留缓存 data）时错误分支只在
  // 顶部加横幅、不卸载子树，编辑/豁免/原因/结果弹窗的脏草稿得以保留。
  // 各分支根统一为同一 <div> 容器且子节点顺序一致（横幅/消息 → 内容 → 弹窗），
  // 弹窗始终处于稳定父节点与位置——此前无 key 外层 Fragment 在 success↔
  // isError(有缓存) 切换时按索引 reconcile 会卸载重建全部弹窗。
  // detail 为 null 时弹窗没有可打开的入口（按钮依赖详情数据），渲染 null。
  const editDialog = detail ? (
    <ReleaseDraftEditDialog
      key={`edit-${releaseId}`}
      open={editOpen}
      release={detail.release}
      onClose={() => setEditOpen(false)}
    />
  ) : null;
  const deleteDialog = detail ? (
    <DeleteDraftDialog
      key={`delete-${releaseId}`}
      open={deleteOpen}
      releaseId={releaseId}
      draftOwnerId={detail.release.draftOwnerId}
      onClose={() => setDeleteOpen(false)}
      onDeleted={() => {
        void navigate({
          to: "/p/$projectKey/releases",
          params: { projectKey },
        });
      }}
    />
  ) : null;
  const waiverDialog = (
    <ReleaseWaiverDialog
      key={`waiver-${releaseId}`}
      open={waiverMode != null}
      releaseId={releaseId}
      mode={waiverMode ?? "waive"}
      presetGateType={waiverGateType}
      excludedGateTypes={excludedGateTypes}
      onClose={() => setWaiverMode(null)}
    />
  );
  const reasonDialog = (
    <ReleaseReasonDialog
      key={`reason-${releaseId}`}
      open={reasonAction != null}
      releaseId={releaseId}
      action={reasonAction ?? "approve"}
      onClose={() => setReasonAction(null)}
    />
  );
  const resultDialog = (
    <ReleaseResultDialog
      key={`result-${releaseId}`}
      open={resultMode != null}
      releaseId={releaseId}
      mode={resultMode ?? "released"}
      onClose={() => setResultMode(null)}
    />
  );
  const dialogs = (
    <Fragment key="release-dialogs">
      {editDialog}
      {deleteDialog}
      {waiverDialog}
      {reasonDialog}
      {resultDialog}
    </Fragment>
  );

  const release: ReleaseResponse | null = detail?.release ?? null;
  const status = release?.status;
  const isDraft = status === "DRAFT";
  const isPendingApproval = status === "PENDING_APPROVAL";
  const isApproved = status === "APPROVED";
  const isTerminal = status != null && TERMINAL_STATUSES.includes(status);

  const detailContent =
    detail && release && status ? (
      <ReleaseDetailContent
        detail={detail}
        release={release}
        projectKey={projectKey}
        status={status}
        isDraft={isDraft}
        isPendingApproval={isPendingApproval}
        isApproved={isApproved}
        isTerminal={isTerminal}
        canWrite={projectContextVerified}
        projectContextNotice={projectContextNotice}
        projectContextNoticeRetry={projectContextNoticeRetry}
        onRetryProjectContext={retryProjectContext}
        operating={operating}
        gatesPreviewQuery={gatesPreviewQuery}
        setEditOpen={setEditOpen}
        setDeleteOpen={setDeleteOpen}
        setWaiverMode={setWaiverMode}
        setWaiverGateType={setWaiverGateType}
        setResultMode={setResultMode}
        waivableGateCount={waivableGateCount}
        handleSubmit={handleSubmit}
        handleClone={handleClone}
        submitPending={submitMutation.isPending}
        cancelPending={cancelMutation.isPending}
        rejectPending={rejectMutation.isPending}
        onCancel={() => setReasonAction("cancel")}
        onReject={() => setReasonAction("reject")}
        onApprove={() => setReasonAction("approve")}
      />
    ) : null;

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-default-500">正在加载发布详情…</span>
        </div>
        {dialogs}
      </div>
    );
  }

  // 错项目上下文：按 version-detail-live:153-162 先例直接返回 EmptyHint，
  // 不在错误项目上下文展示它项目详情（codex r25 P2-2 裁定；此前只读展示
  // 完整详情的口径与修复说明/版本先例不一致）。
  if (projectMismatch) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
        <div className="px-4 py-8">
          <EmptyHint>{`发布 #${releaseId} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
        </div>
        {dialogs}
      </div>
    );
  }

  // 各分支根统一为同一 <div> 容器且子节点顺序一致（横幅/消息 → 内容 → 弹窗），
  // 弹窗为 keyed Fragment 实例，分支切换时只做 keyed 移动不 remount
  //（codex r25 P1-1）。
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      {detailQuery.isError && detailContent ? (
        // 后台重取失败但有缓存数据：顶部横幅提示，不卸载子树（弹窗草稿保留）
        <div
          role="alert"
          className="rounded-sm border border-danger/40 bg-danger/5 px-4 py-3"
        >
          <p className="type-body text-danger">
            发布详情刷新失败：{toUserMessage(detailQuery.error)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onPress={() => void detailQuery.refetch()}
          >
            重试
          </Button>
        </div>
      ) : null}
      {detailQuery.isError && !detailContent ? (
        <p className="type-body text-danger">
          发布详情加载失败：{toUserMessage(detailQuery.error)}
        </p>
      ) : null}
      {detailQuery.isError && !detailContent ? (
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      ) : null}
      {detailContent}
      {!detailQuery.isError && !detailContent ? (
        <EmptyHint>未找到该发布。</EmptyHint>
      ) : null}
      {dialogs}
    </div>
  );
}

/**
 * 详情内容（数据就绪后渲染；拆出子组件避免条件返回后 hooks 顺序漂移）。
 *
 * 写操作区（草稿操作/门禁操作/审批/结果记录/生命周期）只有在路由项目
 * 解析成功且与记录的 projectId 精确一致时才渲染（canWrite；仿
 * version-detail-live r20-1 先例）。解析中/解析失败时只读展示，并在顶部
 * 挂 projectContextNotice（解析中文案/失败文案 + 失败时重试入口；仿
 * version-detail-live:165-167；codex r25 P2-3）。归属不符由上层直接返回
 * EmptyHint，不渲染本组件（codex r25 P2-2 裁定，与 version-detail-live
 * :153-162 一致）。
 */
function ReleaseDetailContent({
  detail,
  release,
  projectKey,
  status,
  isDraft,
  isPendingApproval,
  isApproved,
  isTerminal,
  canWrite,
  projectContextNotice,
  projectContextNoticeRetry,
  onRetryProjectContext,
  operating,
  gatesPreviewQuery,
  setEditOpen,
  setDeleteOpen,
  setWaiverMode,
  setWaiverGateType,
  setResultMode,
  waivableGateCount,
  handleSubmit,
  handleClone,
  submitPending,
  cancelPending,
  rejectPending,
  onCancel,
  onReject,
  onApprove,
}: {
  detail: ReleaseDetailResponse;
  release: ReleaseResponse;
  projectKey: string;
  status: ReleaseStatus;
  isDraft: boolean;
  isPendingApproval: boolean;
  isApproved: boolean;
  isTerminal: boolean;
  /** 路由 projectKey 解析出的项目与记录 projectId 精确一致（写操作总开关） */
  canWrite: boolean;
  /** 路由项目归属解析中/失败时的顶部提示文案（null = 无需提示） */
  projectContextNotice: string | null;
  /** projectContextNotice 为失败文案时是否展示"重试确认项目归属"入口 */
  projectContextNoticeRetry: boolean;
  /** 重试路由项目归属解析（routeProjectQuery.refetch） */
  onRetryProjectContext: () => void;
  operating: boolean;
  gatesPreviewQuery: ReturnType<typeof usePreviewReleaseGates>;
  setEditOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
  setWaiverMode: (mode: "waive" | "revoke" | null) => void;
  setWaiverGateType: (gateType: string | undefined) => void;
  setResultMode: (mode: ReleaseRecordMode | null) => void;
  /** 顶部"豁免门禁"入口（waive、无预设）当前可豁免的门禁数；为 0 时禁用入口 */
  waivableGateCount: number;
  handleSubmit: () => void;
  handleClone: (kind: "copy" | "rollback") => void;
  submitPending: boolean;
  cancelPending: boolean;
  rejectPending: boolean;
  onCancel: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  const artifact = detail.artifact;
  const approval = detail.approval;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title={`发布 #${release.id}`}
        hint={`真实后端数据（GET /release/v1/findById/${release.id}）。默认展示提交快照；实时门禁仅在草稿预览时显示。`}
      />

      {projectContextNotice ? (
        <div
          role="status"
          className="rounded-sm border border-border bg-surface px-4 py-3"
        >
          <p className="type-body text-default-500">{projectContextNotice}</p>
          {projectContextNoticeRetry ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onPress={onRetryProjectContext}
            >
              重试确认项目归属
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/p/$projectKey/releases"
          params={{ projectKey }}
          className="type-body text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回发布列表
        </Link>
        <span className="flex-1" />
        <StatusChip status={status} />
        <span className="type-caption text-default-500">
          {RELEASE_TYPE_LABELS[release.releaseType] ?? release.releaseType} · 序号 {release.sequenceNo}
        </span>
      </div>

      {/* 基本信息 */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-body mb-3 font-medium">发布基本信息</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="发布说明" value={release.releaseNotes ?? ""} />
          <Field label="变更记录" value={release.changelog ?? ""} />
          <Field label="回滚方案" value={release.rollbackPlan ?? ""} />
          <Field label="已知问题" value={release.knownIssues ?? ""} />
          <Field label="兼容性" value={release.compatibility ?? ""} />
          <Field label="依赖" value={release.dependencies ?? ""} />
          <Field label="强制更新" value={release.forceUpdate ? "是" : "否"} />
          <Field label="环境 ID" value={String(release.environmentId)} />
        </div>
      </section>

      {/* 范围快照摘要 */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-body mb-3 font-medium">范围快照</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="快照节点" value={String(detail.scopeNodes.length)} />
          <Field label="快照关系" value={String(detail.scopeRelations.length)} />
          <Field label="测试证据" value={String(detail.testAttempts.length)} />
          <Field label="缺陷证据" value={String(detail.defects.length)} />
        </div>
        {release.testEvidenceState ? (
          <p className="type-caption mt-2 text-default-500">
            测试证据状态：{release.testEvidenceState}
            {release.requiredCaseCount != null ? ` · 必测 ${release.requiredCaseCount} / 已执行 ${release.executedCaseCount ?? 0} / 通过 ${release.passedCaseCount ?? 0}` : null}
          </p>
        ) : null}
      </section>

      {/* 草稿操作（仅路由项目归属校验通过时可写） */}
      {isDraft && canWrite ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="type-body mb-3 font-medium">草稿操作</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onPress={() => setEditOpen(true)} isDisabled={operating}>
              编辑草稿
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={operating}>
              {submitPending ? "提交中…" : "提交审批"}
            </Button>
            <Button variant="ghost" onPress={() => setDeleteOpen(true)} isDisabled={operating}>
              删除草稿
            </Button>
          </div>
        </section>
      ) : null}

      {/* 门禁面板 */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="type-body font-medium">门禁</h2>
          <span className="flex-1" />
          {isDraft && canWrite ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => void gatesPreviewQuery.refetch()}
              isDisabled={gatesPreviewQuery.isFetching || operating}
            >
              {gatesPreviewQuery.isFetching ? "预览中…" : "预览实时门禁"}
            </Button>
          ) : null}
          {isDraft && canWrite ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setWaiverGateType(undefined);
                setWaiverMode("waive");
              }}
              // 无可豁免门禁时禁用入口（codex r25 P2-4；行级入口按行门禁状态
              // 单独渲染，不受此影响）
              isDisabled={operating || waivableGateCount === 0}
            >
              豁免门禁
            </Button>
          ) : null}
        </div>

        {gatesPreviewQuery.data ? (
          <div className="mb-3 rounded-sm border border-border p-3">
            <p className="type-caption mb-2 text-default-500">实时门禁预览（仅预览，不替代提交快照）</p>
            <div className="flex flex-col gap-1">
              {gatesPreviewQuery.data.map((decision) => (
                <div key={decision.gateType} className="type-caption flex items-center gap-2">
                  <span className="min-w-32">{RELEASE_GATE_TYPE_LABELS[decision.gateType] ?? decision.gateType}</span>
                  <span className={decision.passed ? "text-success" : "text-danger"}>
                    {decision.passed ? "通过" : "未通过"}
                  </span>
                  {decision.waived ? <span className="text-default-500">（已豁免）</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {gatesPreviewQuery.isError ? (
          <p className="type-caption mb-2 text-danger">
            门禁预览失败：{toUserMessage(gatesPreviewQuery.error)}
          </p>
        ) : null}

        {detail.gateResults.length === 0 && detail.waivers.length === 0 ? (
          <p className="type-caption text-default-500">暂无门禁裁决记录。</p>
        ) : null}

        {detail.gateResults.length > 0 ? (
          <div className="overflow-hidden rounded-sm border border-border">
            {detail.gateResults.map((gate) => (
              <div
                key={gate.gateType}
                className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
              >
                <span className="type-body min-w-32">
                  {RELEASE_GATE_TYPE_LABELS[gate.gateType] ?? gate.gateType}
                </span>
                <span className={`type-caption ${gate.passed ? "text-success" : "text-danger"}`}>
                  {gate.passed ? "通过" : "未通过"}
                </span>
                {gate.waived ? (
                  <span className="type-caption text-default-500">
                    已豁免{gate.waiverReason ? `：${gate.waiverReason}` : ""}
                  </span>
                ) : null}
                <span className="flex-1" />
                {isDraft && canWrite && !operating ? (
                  gate.waived ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setWaiverGateType(gate.gateType);
                        setWaiverMode("revoke");
                      }}
                    >
                      撤销豁免
                    </Button>
                  ) : !gate.passed && gate.gateType !== "DIRECT_REQUIREMENT_SCOPE" ? (
                    // 已通过门禁与 DIRECT_REQUIREMENT_SCOPE 后端拒绝豁免
                    //（ReleaseSubmissionService.waiveGate），不提供入口
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setWaiverGateType(gate.gateType);
                        setWaiverMode("waive");
                      }}
                    >
                      豁免
                    </Button>
                  ) : null
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* 已有豁免（codex r24 P2-2 / pi P1-1）：后端草稿详情的 gateResults
            恒为空，持久化豁免走独立的 waivers 字段；这里渲染已有豁免并在
            草稿态提供撤销入口（revokeWaiver 仅 DRAFT 可调） */}
        {detail.waivers.length > 0 ? (
          <div className="mt-3">
            <p className="type-caption mb-2 text-default-500">
              已豁免门禁{isDraft ? "（草稿态可撤销）" : ""}
            </p>
            <div className="overflow-hidden rounded-sm border border-border">
              {detail.waivers.map((waiver) => (
                <div
                  key={waiver.gateType}
                  className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <span className="type-body min-w-32">
                    {RELEASE_GATE_TYPE_LABELS[waiver.gateType] ?? waiver.gateType}
                  </span>
                  <span className="type-caption text-default-500">
                    已豁免{waiver.reason ? `：${waiver.reason}` : ""}
                  </span>
                  <span className="flex-1" />
                  {isDraft && canWrite && !operating ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setWaiverGateType(waiver.gateType);
                        setWaiverMode("revoke");
                      }}
                    >
                      撤销豁免
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* 审批面板 */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-body mb-3 font-medium">审批</h2>
        {approval ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="审批决策" value={RELEASE_STATUS_LABELS[approval.decision] ?? approval.decision} />
            <Field label="审批人 ID" value={String(approval.approverId)} />
            <Field label="审批原因" value={approval.reason} />
            <Field label="审批时间" value={approval.decidedAt} />
          </div>
        ) : (
          <p className="type-caption mb-3 text-default-500">暂无审批记录。</p>
        )}
        {isPendingApproval && canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onPress={onApprove} isDisabled={operating}>
              审批通过
            </Button>
            <Button variant="ghost" onPress={onReject} isDisabled={operating}>
              {rejectPending ? "驳回中…" : "驳回"}
            </Button>
          </div>
        ) : null}
      </section>

      {/* 结果记录面板（仅已批准态可操作） */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-body mb-3 font-medium">人工制品证据</h2>
        {artifact ? (
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="构建号" value={artifact.buildNumber ?? ""} />
            <Field label="制品位置" value={artifact.artifactLocation ?? ""} />
            <Field label="文件大小" value={artifact.fileSize != null ? String(artifact.fileSize) : ""} />
            <Field label="文件哈希" value={artifact.fileHash ?? ""} />
            <Field label="结果说明" value={artifact.resultNotes ?? ""} />
            <Field label="记录人 ID" value={String(artifact.recordedBy)} />
          </div>
        ) : (
          <p className="type-caption mb-3 text-default-500">暂无制品证据记录。</p>
        )}
        {isApproved && canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onPress={() => setResultMode("released")} isDisabled={operating}>
              记录发布成功
            </Button>
            <Button variant="ghost" onPress={() => setResultMode("failed")} isDisabled={operating}>
              记录发布失败
            </Button>
          </div>
        ) : null}
      </section>

      {/* 生命周期操作（仅路由项目归属校验通过时可写） */}
      {(isPendingApproval || isApproved || isTerminal) && canWrite ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="type-body mb-3 font-medium">发布操作</h2>
          <div className="flex flex-wrap gap-2">
            {isPendingApproval ? (
              <>
                <Button variant="ghost" onPress={onReject} isDisabled={operating}>
                  {rejectPending ? "驳回中…" : "驳回发布"}
                </Button>
                <Button variant="ghost" onPress={onCancel} isDisabled={operating}>
                  {cancelPending ? "取消中…" : "取消发布"}
                </Button>
              </>
            ) : null}
            {isApproved ? (
              <Button variant="ghost" onPress={onCancel} isDisabled={operating}>
                {cancelPending ? "取消中…" : "取消发布"}
              </Button>
            ) : null}
            {isTerminal ? (
              <>
                <Button variant="ghost" onPress={() => handleClone("copy")} isDisabled={operating}>
                  复制为草稿
                </Button>
                {status === "RELEASED" ? (
                  <Button variant="ghost" onPress={() => handleClone("rollback")} isDisabled={operating}>
                    创建回滚草稿
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
