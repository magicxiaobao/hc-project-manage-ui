/**
 * 测试报告区块（P2：p2-testrun-report）。
 *
 * 只读聚合视图：GET /testRun/v1/{id}/report（run + summary + resultCounts +
 * cases + defects）。默认折叠，按需展开后才发起请求，不随轮详情自动加载。
 *
 * 无表单控件，只读展示（无需 dirty check）。
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint, SeverityChip } from "@/components/biz";
import { toUserMessage, useTestRunReport } from "@/lib/query";
import {
  TEST_EXECUTION_RESULT_LABELS,
  type TestRunCaseDetailResponse,
  type TestRunDefectSummary,
} from "@/lib/api/testRun-types";
import { TestExecutionResultChip } from "@/components/pm/testrun-status-chip";
import {
  formatReportDuration,
  formatReportRate,
  reportEvidenceStateLabel,
} from "@/lib/testrun-report";

function formatInstant(value: string | null | undefined): string {
  if (!value) return "-";
  return value.length >= 16 ? value.slice(0, 16).replace("T", " ") : value;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5">{value}</dd>
    </div>
  );
}

function ResultStat({
  result,
  count,
}: {
  result: keyof typeof TEST_EXECUTION_RESULT_LABELS;
  count: number | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border bg-surface px-3 py-2">
      <TestExecutionResultChip result={result} />
      <span className="type-emphasis text-2xl">{count ?? 0}</span>
      <span className="type-caption text-default-500">
        {TEST_EXECUTION_RESULT_LABELS[result]}
      </span>
    </div>
  );
}

function CaseRow({ runCase }: { runCase: TestRunCaseDetailResponse }) {
  const snapshot = runCase.snapshot;
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
      <span className="type-caption shrink-0 text-default-400">
        #{runCase.runCaseId}
      </span>
      <span className="type-body min-w-0 flex-1 truncate">
        {snapshot?.title?.trim() ? snapshot.title : "（无标题快照）"}
      </span>
      {snapshot?.caseNumber ? (
        <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
          {snapshot.caseNumber}
        </span>
      ) : null}
      {runCase.attempts.length > 0 ? (
        <span className="type-caption shrink-0 text-default-500">
          {runCase.attempts.length} 次执行
        </span>
      ) : (
        <span className="type-caption shrink-0 text-default-500">未执行</span>
      )}
      <TestExecutionResultChip result={runCase.latestAttempt?.result ?? null} />
    </div>
  );
}

function DefectRow({
  defect,
  projectKey,
}: {
  defect: TestRunDefectSummary;
  projectKey: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
      <span className="inline-flex min-w-0 flex-1 items-center gap-1">
        <Link
          to="/p/$projectKey/defects/$defectId"
          params={{ projectKey, defectId: String(defect.defectId) }}
          className="type-body min-w-0 truncate underline-offset-2 hover:underline"
        >
          #{defect.defectId} {defect.title?.trim() ? defect.title : ""}
        </Link>
        {defect.severity?.trim() ? (
          <SeverityChip severity={defect.severity} />
        ) : null}
      </span>
      {defect.liveStatus?.trim() ? (
        <span className="type-caption shrink-0 text-default-500">
          {defect.liveStatus}
        </span>
      ) : null}
    </div>
  );
}

export function TestRunReportSection({
  testRunId,
  projectKey,
}: {
  testRunId: number;
  projectKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const reportQuery = useTestRunReport(testRunId, expanded);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="type-emphasis">测试报告</h3>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "折叠测试报告" : "展开测试报告"}
        >
          {expanded ? "折叠" : "展开"}
        </Button>
      </div>

      {expanded ? (
        <ReportBody query={reportQuery} projectKey={projectKey} />
      ) : (
        <p className="type-caption text-default-500">
          展开后加载本轮聚合报告（通过率、结果分布、用例明细、缺陷汇总）。
        </p>
      )}
    </section>
  );
}

function ReportBody({
  query,
  projectKey,
}: {
  query: ReturnType<typeof useTestRunReport>;
  projectKey: string;
}) {
  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载测试报告…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 py-4">
        <p className="type-body text-danger">
          测试报告加载失败：{toUserMessage(query.error)}
        </p>
        <Button variant="ghost" onPress={() => void query.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const report = query.data;
  if (!report) {
    return <EmptyHint>暂无测试报告。</EmptyHint>;
  }

  const { summary, resultCounts } = report;
  const totalCount =
    (resultCounts.passed ?? 0) +
    (resultCounts.failed ?? 0) +
    (resultCounts.blocked ?? 0) +
    (resultCounts.skipped ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="type-body mb-2 text-default-500">报告概要</h4>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryItem label="通过率" value={formatReportRate(summary.passRate)} />
          <SummaryItem
            label="执行覆盖率"
            value={formatReportRate(summary.executionCoverage)}
          />
          <SummaryItem
            label="用例数（已执行/总数）"
            value={`${summary.executedCaseCount ?? 0}/${summary.runCaseCount ?? 0}`}
          />
          <SummaryItem
            label="总耗时"
            value={formatReportDuration(summary.durationSeconds)}
          />
          <SummaryItem
            label="版本证据状态"
            value={reportEvidenceStateLabel(summary.versionEvidenceState)}
          />
          <SummaryItem label="报告生成时间" value={formatInstant(report.generatedAt)} />
        </dl>
      </div>

      <div>
        <h4 className="type-body mb-2 text-default-500">
          结果分布（共 {totalCount}）
        </h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ResultStat result="PASSED" count={resultCounts.passed} />
          <ResultStat result="FAILED" count={resultCounts.failed} />
          <ResultStat result="BLOCKED" count={resultCounts.blocked} />
          <ResultStat result="SKIPPED" count={resultCounts.skipped} />
        </div>
      </div>

      <div>
        <h4 className="type-body mb-2 text-default-500">
          用例明细（{report.cases.length}）
        </h4>
        {report.cases.length === 0 ? (
          <EmptyHint>报告中暂无用例明细。</EmptyHint>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {report.cases.map((runCase) => (
              <CaseRow key={runCase.runCaseId} runCase={runCase} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="type-body mb-2 text-default-500">
          缺陷汇总（{report.defects.length}）
        </h4>
        {report.defects.length === 0 ? (
          <EmptyHint>报告中暂无关联缺陷。</EmptyHint>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {report.defects.map((defect) => (
              <DefectRow
                key={defect.defectId}
                defect={defect}
                projectKey={projectKey}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
