/**
 * 测试轮列表（P2：p2-testrun-workspace）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /testRun/v1/findByPage（bean 至少携带 projectId；后端显式
 *   校验"projectId/versionId 至少一个有效"，此处始终按项目过滤）
 * - 筛选：轮类型（三种）/ 状态（四态）
 * - 建轮：三种入口按钮 → TestRunCreateDialog（类型预设，可在弹窗内切换）；
 *   成功后跳转到该轮的工作台（/p/$projectKey/tests/$testRunId）
 * - 行标题深链到工作台；状态/类型用 chip 展示
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页（含越界页钳制）
 *
 * 未登录走演示测试视图（TestsView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { shouldClampPage } from "@/lib/pagination";
import {
  EmptyHint,
  OptionSelect,
  PageHeading,
} from "@/components/biz";
import { toUserMessage, useTestRunList } from "@/lib/query";
import type {
  TestRunQueryRequest,
  TestRunType,
} from "@/lib/api/testRun-types";
import {
  TEST_RUN_STATUS_LABELS,
  TEST_RUN_TYPE_LABELS,
} from "@/lib/api/testRun-types";
import { TestRunCreateDialog } from "@/components/pm/testrun-create-dialog";
import {
  TestRunStatusChip,
  TestRunTypeChip,
} from "@/components/pm/testrun-status-chip";

const PAGE_SIZE = 20;

const TYPE_FILTER_OPTIONS = [
  { id: "", label: "全部" },
  ...(
    Object.keys(TEST_RUN_TYPE_LABELS) as Array<
      keyof typeof TEST_RUN_TYPE_LABELS
    >
  ).map((type) => ({ id: type, label: TEST_RUN_TYPE_LABELS[type] })),
];
const STATUS_FILTER_OPTIONS = [
  { id: "", label: "全部" },
  ...(
    Object.keys(TEST_RUN_STATUS_LABELS) as Array<
      keyof typeof TEST_RUN_STATUS_LABELS
    >
  ).map((status) => ({ id: status, label: TEST_RUN_STATUS_LABELS[status] })),
];

const CREATE_ENTRIES: Array<{ runType: TestRunType; label: string }> = [
  { runType: "FULL_REGRESSION", label: "全量回归建轮" },
  { runType: "AD_HOC", label: "临时验证建轮" },
  { runType: "TARGETED_RETEST", label: "定向复测建轮" },
];

function formatInstant(value: string | null) {
  if (!value) return "-";
  return value.length >= 16 ? value.slice(0, 16).replace("T", " ") : value;
}

export function TestRunListLive({
  projectId,
  projectKey,
}: {
  projectId: number;
  projectKey: string;
}) {
  const navigate = useNavigate();
  const [runType, setRunType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createType, setCreateType] = useState<TestRunType | null>(null);

  const bean = useMemo<TestRunQueryRequest>(() => {
    const value: TestRunQueryRequest = {};
    if (runType) value.runType = runType as TestRunQueryRequest["runType"];
    if (status) value.status = status as TestRunQueryRequest["status"];
    return value;
  }, [runType, status]);

  const listQuery = useTestRunList({ page, pageSize: PAGE_SIZE, bean, projectId });

  const resetPage = () => setPage(1);

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页
  // 重新查询，避免出现"第 2 / 1 页"且空列表的误导状态（套件列表同模式）。
  useEffect(() => {
    const clamped = shouldClampPage(
      listQuery.isSuccess,
      listQuery.isFetching,
      page,
      total,
      PAGE_SIZE,
    );
    if (clamped !== null) setPage(clamped);
  }, [listQuery.isSuccess, listQuery.isFetching, page, total]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="测试轮"
        hint="真实后端数据（POST /testRun/v1/findByPage）。按轮类型、状态筛选。"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <OptionSelect
            label="轮类型"
            value={runType}
            options={TYPE_FILTER_OPTIONS}
            onChange={(next) => {
              setRunType(next);
              resetPage();
            }}
          />
        </div>
        <div className="w-44">
          <OptionSelect
            label="状态"
            value={status}
            options={STATUS_FILTER_OPTIONS}
            onChange={(next) => {
              setStatus(next);
              resetPage();
            }}
          />
        </div>
        <div className="flex gap-2">
          {CREATE_ENTRIES.map((entry) => (
            <Button
              key={entry.runType}
              variant={entry.runType === "FULL_REGRESSION" ? "primary" : "secondary"}
              onPress={() => setCreateType(entry.runType)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </div>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载测试轮…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">
            测试轮列表加载失败：{toUserMessage(listQuery.error)}
          </p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的测试轮。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
              <Link
                to="/p/$projectKey/tests/$testRunId"
                params={{ projectKey, testRunId: String(item.id) }}
                className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {item.runName ?? `测试轮 #${item.id}`}
              </Link>
              <span className="hidden shrink-0 sm:inline-flex">
                <TestRunTypeChip runType={item.runType} />
              </span>
              <span className="hidden shrink-0 text-default-500 sm:inline">
                用例 {item.requiredCaseCount ?? "-"}
              </span>
              <span className="hidden shrink-0 text-default-500 md:inline">
                {formatInstant(item.createdAt)}
              </span>
              <TestRunStatusChip status={item.status} />
            </div>
          ))}
        </div>
      ) : null}

      {listQuery.isSuccess ? (
        <div className="flex items-center justify-between gap-3">
          <span className="type-meta">
            共 {total} 条 · 第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              isDisabled={page <= 1}
              onPress={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={page >= totalPages}
              onPress={() => setPage((current) => current + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}

      {createType ? (
        <TestRunCreateDialog
          key={`create-${createType}`}
          open
          projectId={projectId}
          initialRunType={createType}
          onCreated={(id) => {
            void navigate({
              to: "/p/$projectKey/tests/$testRunId",
              params: { projectKey, testRunId: String(id) },
            });
          }}
          onClose={() => setCreateType(null)}
        />
      ) : null}
    </div>
  );
}

