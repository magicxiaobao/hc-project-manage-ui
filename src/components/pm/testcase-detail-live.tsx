/**
 * 测试用例详情（P2：p2-testcase-list-detail）。
 *
 * 老前端 TestCaseDetail.vue 是硬编码 stub（"测试用例详情页面"静态文案），
 * 本页为真实实现。登录态纯展示组件，不再引用 usePm 演示 store：
 * - 详情：GET /testCase/v1/findById/{id}
 * - 展示：基本信息 / 前置条件 / 测试步骤 / 期望结果 / 实际结果 /
 *   执行统计（executionCount/passCount/failCount/skipCount + 通过率）
 * - 编辑：TestCaseFormDialog（POST /testCase/v1/updateTestCase）
 * - 复制：POST /testCase/v1/duplicateTestCase/{id}（成功后 toast 新 id，
 *   并跳转到新用例详情）
 * - 归档：POST /testCase/v1/invalid/{id}（确认框确认；成功后 toast 并返回列表）
 *
 * 评论线程不在此页接线：老前端用例页面未接 comment/v1，为 P2 明确排除项。
 *
 * 后端日期说明：lastExecutedAt 为 LocalDateTime（'YYYY-MM-DDTHH:mm:ss' 字符串，
 * 不做时区换算）；createdAt/updatedAt 为秒级时间戳。
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  PageHeading,
} from "@/components/biz";
import { editFormFromTestCase } from "@/lib/testcase-form";
import { canArchiveTestCase, checkEditSubmitVeto } from "@/lib/testcase-form";
import type { TestCaseFormInput } from "@/lib/testcase-form";
import type { TestCaseResponse } from "@/lib/api/testCase-types";
import {
  toUserMessage,
  useArchiveTestCase,
  useDuplicateTestCase,
  useProjectIdByKey,
  useTestCaseDetail,
} from "@/lib/query";
import { TestCaseFormDialog } from "@/components/pm/testcase-form-dialog";
import {
  TestCasePriorityChip,
  TestCaseStatusChip,
} from "@/components/pm/testcase-status-chip";

/** 后端 createdAt/updatedAt 为秒级时间戳，转本地时间展示 */
function formatEpochSecond(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

/** 后端 LocalDateTime 'YYYY-MM-DDTHH:mm:ss'，直接展示不做时区换算 */
function formatLocalDateTime(value: string | null | undefined): string {
  if (value == null || value === "") return "-";
  return value.replace("T", " ");
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (value == null || value === "") {
    return <p className="type-caption text-default-500">暂无{label}。</p>;
  }
  return (
    <div>
      <h3 className="type-emphasis mb-1">{label}</h3>
      <p className="type-body whitespace-pre-wrap rounded-sm border border-border bg-surface p-4">
        {value}
      </p>
    </div>
  );
}

export function TestCaseDetailLive({
  testCaseId,
  projectKey,
}: {
  testCaseId: number;
  projectKey: string;
}) {
  const detailQuery = useTestCaseDetail(testCaseId);
  const detail = detailQuery.data ?? null;
  // TaskDetailLive 的同类守卫（Codex review 4175265694）：路由里的 projectKey
  // 必须解析出项目并与记录的 projectId 一致，否则跨项目链接会在错误的项目
  // 上下文里展示并允许操作其它项目的用例。解析中/解析失败时不误判。
  const routeProjectQuery = useProjectIdByKey(projectKey);
  const navigate = useNavigate();

  const duplicateMutation = useDuplicateTestCase();
  const archiveMutation = useArchiveTestCase();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // 编辑快照：打开瞬间捕获记录，弹窗生命周期不依赖实时详情/归属查询。
  // 否则弹窗打开后归属翻转（查询重取失败/项目被删/记录被移到其它项目），
  // 挂载条件或前面的归属不符提前返回会直接卸载脏表单而不走 dirty check
  //（codex P2 #1）。快照里的 projectId 在打开时已确认有效。
  const [editSnapshot, setEditSnapshot] = useState<{
    detail: TestCaseResponse;
    projectId: number;
  } | null>(null);

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载测试用例详情…
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">测试用例详情加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (!detail) {
    return <EmptyHint>{`没有找到这个测试用例（id=${testCaseId}）。`}</EmptyHint>;
  }

  const routeProjectId = routeProjectQuery.data;
  // 写操作区（编辑/复制/归档）只有在路由项目解析成功且与记录的
  // projectId 精确一致时才渲染。解析中/解析失败（无可用数据）时只读展示。
  // 注意：routeProjectQuery 的 data 与 queryKey 中的 projectKey 绑定，
  // 后台重取失败时保留的旧 data 仍属于同一 projectKey，归属判定依然有效；
  // 三个提交函数入口会再次检查 projectContextVerified（复制/归档在 handler
  // 入口查，编辑经 TestCaseFormDialog 的 submitVeto 查），弹窗打开后归属
  // 翻转也无法提交（后端项目权限校验仍为最终兜底）。
  const projectContextVerified =
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId === routeProjectId;
  // ARCHIVED 记录：后端普通更新/复制/归档入口一律拒绝（TestCaseServiceImpl
  // validateOrdinaryStatusChange / duplicate / archiveTestCases），深链访问
  // 时不渲染写操作区（codex P2 #4，pi NOTE-4）
  const canWrite = projectContextVerified && detail.status !== "ARCHIVED";
  // 归档入口只允许 DRAFT/ACTIVE（后端 archiveTestCases 抛
  // "只有草稿或生效测试用例可以归档"，codex P2 #4）
  const canArchive = canWrite && canArchiveTestCase(detail.status);

  // 打开编辑：只在写操作区可用时捕获快照（codex P2 #1）
  const openEdit = () => {
    if (!canWrite || detail.projectId == null) return;
    setEditSnapshot({ detail, projectId: detail.projectId });
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditSnapshot(null);
  };
  // 弹窗打开后的提交复核（codex P2 #2/#3）：归属翻转 → 弹窗内持久错误；
  // 实时状态变化（他人改状态/归档）→ 状态字段错误。草稿保留，不卸载。
  const editSubmitVeto = (form: TestCaseFormInput) =>
    checkEditSubmitVeto({
      projectContextVerified,
      liveStatus: detail.status,
      formStatus: form.status,
    });
  const editDialog = editSnapshot ? (
    // 编辑弹窗只在打开时挂载：表单快照在挂载瞬间捕获（dirty check 基线），
    // 列表页同 key 模式（TestCaseListLive）。挂载后不再依赖实时详情/归属，
    // 归属翻转或状态变化只影响提交复核，不卸载脏表单。
    <TestCaseFormDialog
      key={`detail-edit-${editSnapshot.detail.id}`}
      open={editOpen}
      projectId={editSnapshot.projectId}
      mode="edit"
      testCaseId={editSnapshot.detail.id}
      editStatus={editSnapshot.detail.status}
      submitVeto={editSubmitVeto}
      initial={editFormFromTestCase(editSnapshot.detail)}
      onClose={closeEdit}
    />
  ) : null;

  if (
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId !== routeProjectId
  ) {
    // 归属不符时整页只读，但已打开的编辑弹窗必须保留（快照挂载），
    // 否则脏表单会被直接卸载而不走 dirty check（codex P2 #1）。
    return (
      <>
        <EmptyHint>{`测试用例 #${testCaseId} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
        {editDialog}
      </>
    );
  }
  const projectContextNotice = routeProjectQuery.isPending
    ? "正在确认项目归属，操作区稍后可用…"
    : detail.status === "ARCHIVED"
      ? "该用例已归档，不可编辑、复制或归档。"
      : "当前无法确认该记录归属于此项目，操作区已禁用。";

  const executionCount = detail.executionCount ?? 0;
  const passCount = detail.passCount ?? 0;
  const failCount = detail.failCount ?? 0;
  const skipCount = detail.skipCount ?? 0;
  const passRate =
    executionCount > 0 ? `${Math.round((passCount / executionCount) * 100)}%` : "-";

  const handleDuplicate = () => {
    if (duplicateMutation.isPending) return;
    if (!projectContextVerified) {
      toast.error("项目归属已变化，无法提交。请刷新页面后重试。");
      return;
    }
    duplicateMutation.mutate(detail.id, {
      onSuccess: (newId) => {
        toast.success(`测试用例已复制（新用例 #${newId}）`);
        void navigate({
          to: "/p/$projectKey/testcases/$testCaseId",
          params: { projectKey, testCaseId: String(newId) },
        });
      },
      onError: (error) => {
        toast.error(`复制失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleArchive = () => {
    if (archiveMutation.isPending) return;
    if (!projectContextVerified) {
      toast.error("项目归属已变化，无法提交。请刷新页面后重试。");
      return;
    }
    // 确认框打开后状态可能已变化（如变为 REVIEW）：提交前按实时状态复核，
    // 后端只允许 DRAFT/ACTIVE 归档（codex P2 #2）
    if (!canArchiveTestCase(detail.status)) {
      toast.error("用例状态已变化，当前不可归档。请刷新页面。");
      setArchiveOpen(false);
      return;
    }
    const id = detail.id;
    setArchiveOpen(false);
    archiveMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`测试用例 #${id} 已归档`);
        void navigate({
          to: "/p/$projectKey/testcases",
          params: { projectKey },
        });
      },
      onError: (error) => {
        toast.error(`归档失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          to="/p/$projectKey/testcases"
          params={{ projectKey }}
          className="type-caption text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回测试用例列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PageHeading
            title={detail.title}
            hint={`测试用例 #${detail.id} · 真实后端数据（GET /testCase/v1/findById）。`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {detail.caseNumber ? (
            <span className="type-caption rounded-sm border border-border px-2 py-0.5">
              {detail.caseNumber}
            </span>
          ) : null}
          {detail.testType ? (
            <span className="type-caption rounded-sm border border-border px-2 py-0.5">
              {detail.testType}
            </span>
          ) : null}
          <TestCasePriorityChip priority={detail.priority ?? ""} />
          <TestCaseStatusChip status={detail.status} />
        </div>
      </div>

      <section aria-label="基本信息">
        <h2 className="type-emphasis mb-2">基本信息</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
          <MetaItem label="用例编号" value={detail.caseNumber ?? "-"} />
          <MetaItem label="测试类型" value={detail.testType ?? "-"} />
          <MetaItem label="优先级" value={detail.priority ?? "-"} />
          <MetaItem label="所属套件 ID" value={detail.testSuiteId != null ? String(detail.testSuiteId) : "-"} />
          <MetaItem label="负责人 ID" value={detail.assigneeId != null ? String(detail.assigneeId) : "-"} />
          <MetaItem label="创建人 ID" value={detail.creatorId != null ? String(detail.creatorId) : "-"} />
          <MetaItem
            label="预计时长"
            value={detail.estimatedDuration != null ? `${detail.estimatedDuration} 分钟` : "-"}
          />
          <MetaItem label="标签" value={detail.tags ?? "-"} />
          <MetaItem label="所属项目 ID" value={detail.projectId != null ? String(detail.projectId) : "-"} />
          <MetaItem label="上次执行时间" value={formatLocalDateTime(detail.lastExecutedAt)} />
          <MetaItem label="创建时间" value={formatEpochSecond(detail.createdAt)} />
          <MetaItem label="更新时间" value={formatEpochSecond(detail.updatedAt)} />
        </dl>
      </section>

      <section aria-label="用例内容" className="flex flex-col gap-4">
        <TextBlock label="描述" value={detail.description} />
        <TextBlock label="前置条件" value={detail.preconditions} />
        <TextBlock label="测试步骤" value={detail.testSteps} />
        <TextBlock label="期望结果" value={detail.expectedResult} />
        <TextBlock label="实际结果" value={detail.actualResult} />
        <TextBlock label="测试数据" value={detail.testData} />
        <TextBlock label="环境要求" value={detail.environmentRequirements} />
      </section>

      <section aria-label="执行统计">
        <h2 className="type-emphasis mb-2">执行统计</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-5">
          <MetaItem label="执行次数" value={String(executionCount)} />
          <MetaItem label="通过" value={String(passCount)} />
          <MetaItem label="失败" value={String(failCount)} />
          <MetaItem label="跳过" value={String(skipCount)} />
          <MetaItem label="通过率" value={passRate} />
        </dl>
      </section>

      {canWrite ? (
        <section aria-label="操作">
          <h2 className="type-emphasis mb-2">操作</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onPress={openEdit}>
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={handleDuplicate}
              isDisabled={duplicateMutation.isPending}
            >
              {duplicateMutation.isPending ? "复制中…" : "复制"}
            </Button>
            {canArchive ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onPress={() => setArchiveOpen(true)}
              >
                归档
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="type-caption text-default-500">{projectContextNotice}</p>
      )}

      {editDialog}

      {/* 归档确认框（老前端确认文案："归档后将不再出现在默认列表中，是否继续？"） */}
      <AppModal
        open={archiveOpen}
        title="确认归档"
        onClose={() => setArchiveOpen(false)}
        size="sm"
      >
        <p className="type-body">
          {`归档后用例 #${detail.id} 将不再出现在默认列表中，是否继续？`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setArchiveOpen(false)} isDisabled={archiveMutation.isPending}>
            取消
          </Button>
          <Button variant="danger" onPress={handleArchive} isDisabled={archiveMutation.isPending}>
            {archiveMutation.isPending ? "归档中…" : "确认归档"}
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
