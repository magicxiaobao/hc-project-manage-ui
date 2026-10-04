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
import { useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, EmptyHint, PageHeading, useUnsavedChangesGuard } from "@/components/biz";
import {
  toUserMessage,
  useCancelRelease,
  useCopyReleaseAsDraft,
  useDeleteReleaseDraft,
  usePreviewReleaseGates,
  useRejectRelease,
  useReleaseDetail,
  useRollbackReleaseAsDraft,
  useSubmitRelease,
} from "@/lib/query";
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

/** 删除草稿确认弹窗：管理员原因可选（老前端 ReleaseDraftActionPanel 口径） */
function DeleteDraftDialog({
  open,
  releaseId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  releaseId: number;
  onClose: () => void;
  /** 删除成功回调：调用方跳回发布列表（已删除的详情不应再展示） */
  onDeleted: () => void;
}) {
  const deleteMutation = useDeleteReleaseDraft();
  const [adminReason, setAdminReason] = useState("");

  const initialRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (open) {
      initialRef.current = JSON.stringify("");
      setAdminReason("");
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
          <div>
            <TextField
              value={adminReason}
              onChange={setAdminReason}
              aria-label="管理员原因"
              isDisabled={deleteMutation.isPending}
            >
              <Label>管理员原因（选填）</Label>
              <TextArea placeholder="选填：代他人删除时说明原因" />
            </TextField>
          </div>
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

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-2 p-4 md:p-6">
        <Spinner size="sm" />
        <span className="text-sm text-default-500">正在加载发布详情…</span>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 p-4 md:p-6">
        <p className="type-body text-danger">发布详情加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <EmptyHint>未找到该发布。</EmptyHint>
      </div>
    );
  }

  const release: ReleaseResponse = detail.release;
  const status = release.status;
  const isDraft = status === "DRAFT";
  const isPendingApproval = status === "PENDING_APPROVAL";
  const isApproved = status === "APPROVED";
  const isTerminal = TERMINAL_STATUSES.includes(status);

  return (
    <ReleaseDetailContent
      detail={detail}
      release={release}
      projectKey={projectKey}
      status={status}
      isDraft={isDraft}
      isPendingApproval={isPendingApproval}
      isApproved={isApproved}
      isTerminal={isTerminal}
      operating={operating}
      gatesPreviewQuery={gatesPreviewQuery}
      editOpen={editOpen}
      setEditOpen={setEditOpen}
      deleteOpen={deleteOpen}
      setDeleteOpen={setDeleteOpen}
      waiverMode={waiverMode}
      setWaiverMode={setWaiverMode}
      waiverGateType={waiverGateType}
      setWaiverGateType={setWaiverGateType}
      reasonAction={reasonAction}
      setReasonAction={setReasonAction}
      resultMode={resultMode}
      setResultMode={setResultMode}
      handleSubmit={handleSubmit}
      handleClone={handleClone}
      submitPending={submitMutation.isPending}
      cancelPending={cancelMutation.isPending}
      rejectPending={rejectMutation.isPending}
      onCancel={() => setReasonAction("cancel")}
      onReject={() => setReasonAction("reject")}
      onApprove={() => setReasonAction("approve")}
    />
  );
}

/**
 * 详情内容（数据就绪后渲染；拆出子组件避免条件返回后 hooks 顺序漂移）。
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
  operating,
  gatesPreviewQuery,
  editOpen,
  setEditOpen,
  deleteOpen,
  setDeleteOpen,
  waiverMode,
  setWaiverMode,
  waiverGateType,
  setWaiverGateType,
  reasonAction,
  setReasonAction,
  resultMode,
  setResultMode,
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
  operating: boolean;
  gatesPreviewQuery: ReturnType<typeof usePreviewReleaseGates>;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  waiverMode: "waive" | "revoke" | null;
  setWaiverMode: (mode: "waive" | "revoke" | null) => void;
  waiverGateType: string | undefined;
  setWaiverGateType: (gateType: string | undefined) => void;
  reasonAction: ReleaseReasonAction | null;
  setReasonAction: (action: ReleaseReasonAction | null) => void;
  resultMode: ReleaseRecordMode | null;
  setResultMode: (mode: ReleaseRecordMode | null) => void;
  handleSubmit: () => void;
  handleClone: (kind: "copy" | "rollback") => void;
  submitPending: boolean;
  cancelPending: boolean;
  rejectPending: boolean;
  onCancel: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  const navigate = useNavigate();
  const artifact = detail.artifact;
  const approval = detail.approval;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title={`发布 #${release.id}`}
        hint={`真实后端数据（GET /release/v1/findById/${release.id}）。默认展示提交快照；实时门禁仅在草稿预览时显示。`}
      />

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

      {/* 草稿操作 */}
      {isDraft ? (
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
          <Button
            size="sm"
            variant="ghost"
            onPress={() => void gatesPreviewQuery.refetch()}
            isDisabled={gatesPreviewQuery.isFetching || operating}
          >
            {gatesPreviewQuery.isFetching ? "预览中…" : "预览实时门禁"}
          </Button>
          {isDraft ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setWaiverGateType(undefined);
                setWaiverMode("waive");
              }}
              isDisabled={operating}
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

        {detail.gateResults.length === 0 ? (
          <p className="type-caption text-default-500">暂无门禁裁决记录。</p>
        ) : (
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
                {isDraft && !operating ? (
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
                  ) : (
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
                  )
                ) : null}
              </div>
            ))}
          </div>
        )}
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
        {isPendingApproval ? (
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
        {isApproved ? (
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

      {/* 生命周期操作 */}
      {isPendingApproval || isApproved || isTerminal ? (
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

      {/* 弹窗 */}
      {isDraft ? (
        <ReleaseDraftEditDialog
          open={editOpen}
          release={release}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      <DeleteDraftDialog
        open={deleteOpen}
        releaseId={release.id}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          void navigate({
            to: "/p/$projectKey/releases",
            params: { projectKey },
          });
        }}
      />
      {waiverMode != null ? (
        <ReleaseWaiverDialog
          open
          releaseId={release.id}
          mode={waiverMode}
          presetGateType={waiverGateType}
          onClose={() => setWaiverMode(null)}
        />
      ) : null}
      {reasonAction != null ? (
        <ReleaseReasonDialog
          open
          releaseId={release.id}
          action={reasonAction}
          onClose={() => setReasonAction(null)}
        />
      ) : null}
      {resultMode != null ? (
        <ReleaseResultDialog
          open
          releaseId={release.id}
          mode={resultMode}
          onClose={() => setResultMode(null)}
        />
      ) : null}
    </div>
  );
}
