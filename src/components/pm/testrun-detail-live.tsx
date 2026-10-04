/**
 * 测试轮执行工作台（P2：p2-testrun-workspace）。
 *
 * 登录态纯展示组件：GET /testRun/v1/{id}（run + cases，冻结用例快照与
 * attempt 历史）。
 *
 * 轮生命周期（项目归属验证通过后才展示写操作）：
 * - CREATED → 启动（POST /testRun/v1/{id}/start）
 * - RUNNING → 完成（POST /testRun/v1/{id}/complete；仅当全部用例最新
 *   attempt 已完成时可点，老前端 TestRunWorkspace.canCompleteRun 同口径，
 *   后端 validateCompletableHistory 同样校验）
 * - CREATED/RUNNING → 取消（POST /testRun/v1/{id}/cancel，原因必填 1–500）
 * - COMPLETED → 定向复测（预填来源轮 + 失败/阻塞的轮内用例）
 *
 * 逐用例执行（attempt 级，后端初始为每用例一个 NOT_STARTED attempt）：
 * - NOT_STARTED → 开始执行；RUNNING → 完成执行（结果必填，弹窗）
 * - COMPLETED 且 FAILED/BLOCKED → 缺陷闭环（创建/关联缺陷，任意 attempt
 *   可做）；仅最新 attempt 且轮为 RUNNING 时可重试（原因必填）
 *
 * 缺陷摘要（cases.defects）深链到缺陷详情页（/p/$projectKey/defects/$defectId），
 * 严重度复用缺陷域 SeverityChip，不重造类型。
 *
 * 错误/加载/空分支下各弹窗保持挂载（脏表单不因后台重取被卸载）。
 */
import { Fragment, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  PageHeading,
  SeverityChip,
} from "@/components/biz";
import {
  toUserMessage,
  useCancelTestRun,
  useCompleteTestRun,
  useProjectIdByKey,
  useRetryExecution,
  useStartExecution,
  useStartTestRun,
  useTestRunDetail,
} from "@/lib/query";
import type {
  TestExecutionResponse,
  TestRunCaseDetailResponse,
} from "@/lib/api/testRun-types";
import {
  TestExecutionResultChip,
  TestExecutionStatusChip,
  TestRunStatusChip,
  TestRunTypeChip,
} from "@/components/pm/testrun-status-chip";
import { TestExecutionCompleteDialog } from "@/components/pm/testrun-execution-complete-dialog";
import { TestRunReasonDialog } from "@/components/pm/testrun-reason-dialog";
import { TestRunReportSection } from "@/components/pm/testrun-report-section";import { TestRunDefectDialog } from "@/components/pm/testrun-defect-dialog";
import {
  TestRunCreateDialog,
  type TestRunTargetedContext,
} from "@/components/pm/testrun-create-dialog";

function formatInstant(value: string | null | undefined): string {
  if (!value) return "-";
  return value.length >= 16 ? value.slice(0, 16).replace("T", " ") : value;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5">{value}</dd>
    </div>
  );
}

function isFailedOrBlocked(execution: TestExecutionResponse | null | undefined) {
  return (
    execution?.status === "COMPLETED" &&
    (execution.result === "FAILED" || execution.result === "BLOCKED")
  );
}

export function TestRunDetailLive({
  testRunId,
  projectKey,
}: {
  testRunId: number;
  projectKey: string;
}) {
  const navigate = useNavigate();
  const detailQuery = useTestRunDetail(testRunId);
  const routeProjectQuery = useProjectIdByKey(projectKey);
  const routeProjectId =
    typeof routeProjectQuery.data === "number" ? routeProjectQuery.data : null;

  const startRun = useStartTestRun();
  const completeRun = useCompleteTestRun();
  const cancelRun = useCancelTestRun();
  const startExecution = useStartExecution();
  const retryExecution = useRetryExecution();

  // 弹窗状态（顶层持有，不依赖实时详情，脏表单不因后台重取被卸载）
  const [completeTarget, setCompleteTarget] =
    useState<TestExecutionResponse | null>(null);
  const [retryTargetId, setRetryTargetId] = useState<number | null>(null);
  const [defectTargetId, setDefectTargetId] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeRunOpen, setCompleteRunOpen] = useState(false);
  const [targetedContext, setTargetedContext] =
    useState<TestRunTargetedContext | null>(null);

  const detail = detailQuery.data ?? null;
  const run = detail?.run ?? null;
  // 项目归属守卫：路由 projectKey 解析出的项目必须与记录 projectId 一致，
  // 才渲染写操作区；解析中/失败时不误判
  const projectContextVerified =
    detail != null &&
    routeProjectId != null &&
    detail.run.projectId === routeProjectId;

  const failedCaseIds =
    detail?.cases
      .filter((item) => isFailedOrBlocked(item.latestAttempt))
      .map((item) => item.runCaseId) ?? [];

  // 全部用例最新 attempt 已完成 → 轮可完成（老前端 canCompleteRun 同口径）
  const allAttemptsCompleted =
    (detail?.cases.length ?? 0) > 0 &&
    (detail?.cases.every(
      (item) => item.latestAttempt?.status === "COMPLETED",
    ) ??
      false);

  const handleStartRun = () => {
    if (startRun.isPending || run == null) return;
    startRun.mutate(run.id, {
      onSuccess: () => toast.success(`测试轮 #${run.id} 已启动`),
      onError: (error) => toast.error(`启动失败：${toUserMessage(error)}`),
    });
  };

  const handleCompleteRun = () => {
    if (completeRun.isPending || run == null) return;
    setCompleteRunOpen(false);
    completeRun.mutate(run.id, {
      onSuccess: () => toast.success(`测试轮 #${run.id} 已完成`),
      onError: (error) => toast.error(`完成失败：${toUserMessage(error)}`),
    });
  };

  const handleStartExecution = (executionId: number) => {
    if (startExecution.isPending) return;
    startExecution.mutate(executionId, {
      onSuccess: () => toast.success(`执行 #${executionId} 已开始`),
      onError: (error) => toast.error(`开始执行失败：${toUserMessage(error)}`),
    });
  };

  const openTargetedRetest = () => {
    if (run == null || failedCaseIds.length === 0) return;
    setTargetedContext({ sourceRunId: run.id, sourceRunCaseIds: failedCaseIds });
  };

  const renderAttemptActions = (
    runCase: TestRunCaseDetailResponse,
    attempt: TestExecutionResponse,
    isLatest: boolean,
  ) => {
    if (!projectContextVerified) return null;
    const runRunning = run?.status === "RUNNING";
    return (
      <span className="flex shrink-0 gap-1">
        {attempt.status === "NOT_STARTED" ? (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={startExecution.isPending}
            onPress={() => handleStartExecution(attempt.id)}
            aria-label={`开始执行 ${attempt.id}`}
          >
            开始
          </Button>
        ) : null}
        {attempt.status === "RUNNING" ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setCompleteTarget(attempt)}
            aria-label={`完成执行 ${attempt.id}`}
          >
            完成
          </Button>
        ) : null}
        {isFailedOrBlocked(attempt) ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setDefectTargetId(attempt.id)}
            aria-label={`执行 ${attempt.id} 缺陷闭环`}
          >
            缺陷闭环
          </Button>
        ) : null}
        {isLatest && isFailedOrBlocked(attempt) && runRunning ? (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={retryExecution.isPending}
            onPress={() => setRetryTargetId(attempt.id)}
            aria-label={`重试执行 ${attempt.id}`}
          >
            重试
          </Button>
        ) : null}
      </span>
    );
  };

  const renderAttemptRow = (
    runCase: TestRunCaseDetailResponse,
    attempt: TestExecutionResponse,
  ) => {
    const isLatest = runCase.latestAttempt?.id === attempt.id;
    return (
      <div
        key={attempt.id}
        className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
      >
        <span className="type-caption shrink-0 text-default-400">
          #{attempt.id}
          {attempt.attemptNo != null ? `（第 ${attempt.attemptNo} 次）` : null}
          {isLatest ? " · 最新" : null}
        </span>
        <TestExecutionStatusChip status={attempt.status} />
        <TestExecutionResultChip result={attempt.result} />
        <span className="type-caption hidden min-w-0 flex-1 truncate text-default-500 md:inline">
          {attempt.failureMessage?.trim()
            ? `失败说明：${attempt.failureMessage.trim()}`
            : attempt.executionNotes?.trim()
              ? `备注：${attempt.executionNotes.trim()}`
              : "-"}
        </span>
        {renderAttemptActions(runCase, attempt, isLatest)}
      </div>
    );
  };

  const renderCaseCard = (runCase: TestRunCaseDetailResponse) => {
    const snapshot = runCase.snapshot;
    return (
      <div
        key={runCase.runCaseId}
        className="overflow-hidden rounded-sm border border-border bg-surface"
      >
        <div className="flex items-center gap-2 border-b border-border bg-default-50 px-3 py-2">
          <span className="type-caption shrink-0 text-default-400">
            用例 #{runCase.runCaseId}
          </span>
          <span className="type-body min-w-0 flex-1 truncate">
            {snapshot?.title?.trim() ? snapshot.title : "（无标题快照）"}
          </span>
          {snapshot?.caseNumber ? (
            <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
              {snapshot.caseNumber}
            </span>
          ) : null}
          <TestExecutionStatusChip status={runCase.latestAttempt?.status ?? null} />
          <TestExecutionResultChip result={runCase.latestAttempt?.result ?? null} />
        </div>

        {/* 冻结快照内容：建轮时冻结的测试步骤/预期结果，供执行时对照
            （codex r10 P2-4；后端已返回 snapshot.testSteps/expectedResult） */}
        {snapshot?.testSteps?.trim() || snapshot?.expectedResult?.trim() ? (
          <details className="border-b border-border px-3 py-2">
            <summary className="type-caption cursor-pointer text-default-500">
              查看冻结快照（测试步骤 / 预期结果）
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {snapshot?.testSteps?.trim() ? (
                <div>
                  <p className="type-caption text-default-500">测试步骤</p>
                  <p className="type-body mt-0.5 whitespace-pre-wrap">
                    {snapshot.testSteps}
                  </p>
                </div>
              ) : null}
              {snapshot?.expectedResult?.trim() ? (
                <div>
                  <p className="type-caption text-default-500">预期结果</p>
                  <p className="type-body mt-0.5 whitespace-pre-wrap">
                    {snapshot.expectedResult}
                  </p>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        {runCase.attempts.length > 0 ? (
          <div>{runCase.attempts.map((attempt) => renderAttemptRow(runCase, attempt))}</div>
        ) : (
          <p className="type-caption px-3 py-2 text-default-500">暂无执行记录。</p>
        )}

        {runCase.defects.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
            <span className="type-caption text-default-500">关联缺陷：</span>
            {runCase.defects.map((defect) => (
              <span key={defect.defectId} className="inline-flex items-center gap-1">
                <Link
                  to="/p/$projectKey/defects/$defectId"
                  params={{ projectKey, defectId: String(defect.defectId) }}
                  className="type-body underline-offset-2 hover:underline"
                >
                  #{defect.defectId} {defect.title ?? ""}
                </Link>
                {defect.severity?.trim() ? (
                  <SeverityChip severity={defect.severity} />
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  // 各弹窗在所有分支下保持挂载：同一 keyed Fragment 实例位于各分支的
  // 同一 <div> 根下，分支切换时 React 只做 keyed 移动而不 remount；
  // 后台重取失败/加载中不卸载脏表单（codex r10 P2-1）
  const dialogs = (
    <Fragment key="testrun-dialogs">
      <TestExecutionCompleteDialog
        open={completeTarget !== null}
        execution={completeTarget}
        onClose={() => setCompleteTarget(null)}
      />
      <TestRunReasonDialog
        open={retryTargetId !== null}
        title={`重试执行${retryTargetId !== null ? ` #${retryTargetId}` : ""}`}
        hint="将基于该 attempt 创建一次新的执行（旧 attempt 保留为历史）。"
        confirmLabel="确认重试"
        onSubmit={async (reason) => {
          if (retryTargetId === null) return;
          await retryExecution.mutateAsync({
            executionId: retryTargetId,
            data: { reason },
          });
          toast.success(`执行 #${retryTargetId} 已重试（新 attempt 已创建）`);
        }}
        onClose={() => setRetryTargetId(null)}
      />
      <TestRunDefectDialog
        open={defectTargetId !== null}
        executionId={defectTargetId}
        onClose={() => setDefectTargetId(null)}
      />
      <TestRunReasonDialog
        open={cancelOpen}
        title={`取消测试轮${run ? ` #${run.id}` : ""}`}
        hint="取消后该轮无法继续执行，未完成的用例将保持当前状态。"
        confirmLabel="确认取消"
        onSubmit={async (reason) => {
          if (run == null) return;
          await cancelRun.mutateAsync({ id: run.id, data: { reason } });
          toast.success(`测试轮 #${run.id} 已取消`);
        }}
        onClose={() => setCancelOpen(false)}
      />
      <AppModal
        open={completeRunOpen}
        title={`完成测试轮${run ? ` #${run.id}` : ""}`}
        onClose={() => setCompleteRunOpen(false)}
        size="sm"
      >
        <p className="type-body">
          确认完成该测试轮吗？完成后轮状态将变为「已完成」，不可再执行用例。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onPress={() => setCompleteRunOpen(false)}
            isDisabled={completeRun.isPending}
          >
            取消
          </Button>
          <Button
            variant="primary"
            onPress={handleCompleteRun}
            isDisabled={completeRun.isPending}
          >
            {completeRun.isPending ? "提交中…" : "确认完成"}
          </Button>
        </div>
      </AppModal>
      {targetedContext ? (
        <TestRunCreateDialog
          key={`targeted-${targetedContext.sourceRunId}`}
          open
          projectId={routeProjectId ?? 0}
          initialRunType="TARGETED_RETEST"
          targetedContext={targetedContext}
          onCreated={(id) => {
            void navigate({
              to: "/p/$projectKey/tests/$testRunId",
              params: { projectKey, testRunId: String(id) },
            });
          }}
          onClose={() => setTargetedContext(null)}
        />
      ) : null}
    </Fragment>
  );

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-default-500 md:p-6">
        <Spinner size="sm" />
        正在加载测试轮…
        {dialogs}
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        <p className="type-body text-danger">
          测试轮加载失败：{toUserMessage(detailQuery.error)}
        </p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
        {dialogs}
      </div>
    );
  }

  if (!detail || !run) {
    return (
      <div className="p-4 md:p-6">
        <EmptyHint>没有找到这个测试轮。</EmptyHint>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <PageHeading
        title={`测试轮 #${run.id} ${run.runName ?? ""}`}
        hint="真实后端数据（GET /testRun/v1/{id}）：冻结用例快照与 attempt 历史。"
      />

      {projectContextVerified ? null : (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-2">
          <p className="type-body text-warning">
            该测试轮不属于当前项目（{projectKey}），仅展示信息，不可操作。
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {projectContextVerified ? (
          <>
            {run.status === "CREATED" ? (
              <Button
                variant="primary"
                onPress={handleStartRun}
                isDisabled={startRun.isPending}
              >
                {startRun.isPending ? "启动中…" : "启动测试轮"}
              </Button>
            ) : null}
            {run.status === "RUNNING" ? (
              <>
                <Button
                  variant="primary"
                  onPress={() => setCompleteRunOpen(true)}
                  isDisabled={!allAttemptsCompleted}
                >
                  完成测试轮
                </Button>
                {allAttemptsCompleted ? null : (
                  <span className="type-caption self-center text-default-500">
                    全部用例的最新 attempt 完成后才可完成测试轮
                  </span>
                )}
              </>
            ) : null}
            {run.status === "CREATED" || run.status === "RUNNING" ? (
              <Button
                variant="ghost"
                className="text-danger"
                onPress={() => setCancelOpen(true)}
              >
                取消测试轮
              </Button>
            ) : null}
            {run.status === "COMPLETED" && failedCaseIds.length > 0 ? (
              <Button variant="secondary" onPress={openTargetedRetest}>
                定向复测（{failedCaseIds.length} 个失败/阻塞用例）
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          variant="ghost"
          onPress={() =>
            void navigate({ to: "/p/$projectKey/tests", params: { projectKey } })
          }
        >
          返回列表
        </Button>
      </div>

      <section>
        <h3 className="type-emphasis mb-2">基本信息</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="type-caption text-default-500">状态</dt>
            <dd className="mt-0.5">
              <TestRunStatusChip status={run.status} />
            </dd>
          </div>
          <div>
            <dt className="type-caption text-default-500">轮类型</dt>
            <dd className="mt-0.5">
              <TestRunTypeChip runType={run.runType} />
            </dd>
          </div>
          <MetaItem label="环境" value={run.environment?.trim() ? run.environment : "-"} />
          <MetaItem
            label="版本 ID"
            value={run.versionId != null ? String(run.versionId) : "-"}
          />
          <MetaItem
            label="用例数"
            value={run.requiredCaseCount != null ? String(run.requiredCaseCount) : "-"}
          />
          <MetaItem label="创建时间" value={formatInstant(run.createdAt)} />
          <MetaItem label="启动时间" value={formatInstant(run.startedAt)} />
          <MetaItem label="完成时间" value={formatInstant(run.completedAt)} />
          <MetaItem
            label="取消原因"
            value={run.cancellationReason?.trim() ? run.cancellationReason : "-"}
          />
        </dl>
      </section>

      <section>
        <h3 className="type-emphasis mb-2">轮内用例（{detail.cases.length}）</h3>
        {detail.cases.length === 0 ? (
          <EmptyHint>该测试轮暂无用例。</EmptyHint>
        ) : (
          <div className="flex flex-col gap-3">
            {detail.cases.map(renderCaseCard)}
          </div>
        )}
      </section>

      {/* 测试报告：只读聚合视图（P2：p2-testrun-report），默认折叠、展开后才请求 */}
      <TestRunReportSection testRunId={testRunId} projectKey={projectKey} />

      {dialogs}
    </div>
  );
}
