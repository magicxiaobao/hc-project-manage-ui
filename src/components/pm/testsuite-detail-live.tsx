/**
 * 测试套件详情 + 套件-用例管理（P2：p2-testsuite-live）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 详情：GET /testSuite/v1/findById/{id}
 * - 展示：基本信息 / 描述 / 用例统计（totalCases/passedCases/failedCases/
 *   skippedCases + 通过率 passRate，后端在 TestSuiteResponse 上直接返回）
 * - 编辑：TestSuiteFormDialog（POST /testSuite/v1/updateTestSuite）
 * - 归档：POST /testSuite/v1/invalid/{id}（确认框确认；成功后 toast 并返回列表）
 * - 套件-用例管理（TestSuiteTestCaseManager 等价）：
 *   - 已关联用例：POST /testCase/v1/findByPage（bean.testSuiteId = 本套件）
 *   - 添加用例：候选 = 本项目未归属本套件的用例，逐条
 *     POST /testCase/v1/updateTestCase {id, testSuiteId} 关联
 *   - ⚠️ 解除关联后端不支持：TestCaseUpdateRequest.testSuiteId 经
 *     BaseTestCaseUpdater 的 `Optional.ofNullable(...).ifPresent` 应用，
 *     null 被跳过无法置空；且后端无 add/remove 专用端点（老前端
 *     addTestCaseToSuite/removeTestCaseFromSuite 是 plannedOnlyError 存根，
 *     从不发请求）。因此只提供添加入口，不提供移除按钮
 * - 项目归属守卫：路由 projectKey 解析出的项目必须与记录 projectId 一致，
 *   否则跨项目深链会在错误的项目上下文里展示并允许操作其它项目的套件
 *   （TaskDetailLive 的 Codex review 4175265694 模式）
 *
 * 未登录走演示测试视图（TestsView）时不使用本组件。
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  PageHeading,
} from "@/components/biz";
import { editFormFromTestSuite } from "@/lib/testsuite-form";
import type { TestSuiteResponse } from "@/lib/api/testSuite-types";
import {
  queryKeys,
  toUserMessage,
  useInvalidTestSuite,
  useProjectIdByKey,
  useTestCaseList,
  useTestSuiteDetail,
  useUpdateTestCase,
} from "@/lib/query";
import { TestSuiteFormDialog } from "@/components/pm/testsuite-form-dialog";
import {
  TestSuitePriorityChip,
  TestSuiteStatusChip,
} from "@/components/pm/testsuite-status-chip";
import { TestCaseStatusChip } from "@/components/pm/testcase-status-chip";

/** 后端 createdAt/updatedAt 为秒级时间戳，转本地时间展示 */
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-4 py-3">
      <p className="type-caption text-default-500">{label}</p>
      <p className="type-emphasis mt-1 text-xl">{value}</p>
    </div>
  );
}

const LINKED_PAGE_SIZE = 10;
const CANDIDATE_PAGE_SIZE = 20;

export function TestSuiteDetailLive({
  testSuiteId,
  projectKey,
}: {
  testSuiteId: number;
  projectKey: string;
}) {
  const detailQuery = useTestSuiteDetail(testSuiteId);
  const detail = detailQuery.data ?? null;
  const routeProjectQuery = useProjectIdByKey(projectKey);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invalidMutation = useInvalidTestSuite();
  const linkMutation = useUpdateTestCase();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [linkedPage, setLinkedPage] = useState(1);
  // 编辑快照：打开瞬间捕获记录，弹窗生命周期不依赖实时详情。
  // 否则弹窗打开后记录被他人改动导致重取变化，脏表单会被
  // 直接卸载而无"是否放弃修改"提示（codex P2 #3）。
  const [editSnapshot, setEditSnapshot] = useState<{
    detail: TestSuiteResponse;
    projectId: number;
  } | null>(null);

  // 项目归属守卫（codex P2 #1）：路由 projectKey 解析出的项目必须与
  // 记录 projectId 一致，才渲染写操作区；解析中/失败时不误判。
  const routeProjectId =
    typeof routeProjectQuery.data === "number" ? routeProjectQuery.data : null;
  const projectContextVerified =
    detail != null && routeProjectId != null && detail.projectId === routeProjectId;
  // 实时详情存在时以其 projectId 为准（codex 本地评审 finding 3）：
  // 不可用打开时的旧快照覆盖"归属明确为空"，只有实时详情缺失时才回退快照。
  const liveProjectId = detail ? detail.projectId : editSnapshot?.projectId;

  // 已关联用例：bean.testSuiteId = 本套件；projectId 传路由解析出的项目
  // （与套件归属项目一致时才有意义，归属未验证时 disabled）
  const linkedQuery = useTestCaseList({
    page: linkedPage,
    pageSize: LINKED_PAGE_SIZE,
    bean: { testSuiteId },
    projectId: projectContextVerified ? routeProjectId : null,
  });
  // 添加候选：本项目全部用例，前端过滤掉已归属本套件的
  const candidateQuery = useTestCaseList({
    page: 1,
    pageSize: CANDIDATE_PAGE_SIZE,
    bean: {},
    projectId: addCaseOpen && projectContextVerified ? routeProjectId : null,
  });
  const candidates = (candidateQuery.data?.list ?? []).filter(
    (item) => item.testSuiteId !== testSuiteId,
  );

  const openEdit = () => {
    if (!detail || !projectContextVerified) return;
    setEditSnapshot({ detail, projectId: detail.projectId });
    setEditOpen(true);
  };

  const handleArchive = () => {
    if (invalidMutation.isPending) return;
    setArchiveOpen(false);
    invalidMutation.mutate(testSuiteId, {
      onSuccess: () => {
        toast.success(`测试套件 #${testSuiteId} 已归档`);
        void navigate({ to: "/p/$projectKey/testsuites", params: { projectKey } });
      },
      onError: (error) => {
        toast.error(`归档失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleLinkCase = (caseId: number) => {
    if (linkMutation.isPending) return;
    linkMutation.mutate(
      { id: caseId, testSuiteId },
      {
        onSuccess: () => {
          toast.success(`用例 #${caseId} 已加入套件`);
          // 套件统计（totalCases/…）由后端在套件记录上维护，需失效套件域
          void queryClient.invalidateQueries({ queryKey: queryKeys.testSuite.all });
        },
        onError: (error) => {
          toast.error(`添加失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-default-500 md:p-6">
        <Spinner size="sm" />
        正在加载测试套件…
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        <p className="type-body text-danger">测试套件加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4 md:p-6">
        <EmptyHint>没有找到这个测试套件。</EmptyHint>
      </div>
    );
  }

  const passRate =
    detail.passRate != null ? `${(detail.passRate * 100).toFixed(1)}%` : "-";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <PageHeading
        title={`测试套件 #${detail.id} ${detail.suiteName}`}
        hint="真实后端数据（GET /testSuite/v1/findById/{id}）。"
      />

      {projectContextVerified ? null : (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-2">
          <p className="type-body text-warning">
            该套件不属于当前项目（{projectKey}），仅展示基本信息，不可编辑。
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {projectContextVerified ? (
          <>
            <Button variant="secondary" onPress={openEdit}>
              编辑
            </Button>
            <Button
              variant="ghost"
              className="text-danger"
              onPress={() => setArchiveOpen(true)}
              isDisabled={invalidMutation.isPending}
            >
              归档
            </Button>
          </>
        ) : null}
        <Button
          variant="ghost"
          onPress={() => void navigate({ to: "/p/$projectKey/testsuites", params: { projectKey } })}
        >
          返回列表
        </Button>
      </div>

      <section>
        <h3 className="type-emphasis mb-2">基本信息</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetaItem label="套件类型" value={detail.suiteType ?? "-"} />
          <div>
            <dt className="type-caption text-default-500">状态</dt>
            <dd className="mt-0.5">
              <TestSuiteStatusChip status={detail.status} />
            </dd>
          </div>
          <div>
            <dt className="type-caption text-default-500">优先级</dt>
            <dd className="mt-0.5">
              <TestSuitePriorityChip priority={detail.priority ?? ""} />
            </dd>
          </div>
          <MetaItem
            label="预计耗时（分钟）"
            value={detail.estimatedTime != null ? String(detail.estimatedTime) : "-"}
          />
          <MetaItem
            label="实际耗时（分钟）"
            value={detail.actualTime != null ? String(detail.actualTime) : "-"}
          />
          <MetaItem label="创建人" value={detail.createdBy != null ? String(detail.createdBy) : "-"} />
          <MetaItem label="创建时间" value={formatEpochSecond(detail.createdAt)} />
          <MetaItem label="更新时间" value={formatEpochSecond(detail.updatedAt)} />
        </dl>
        <div className="mt-3">
          <h4 className="type-caption mb-1 text-default-500">描述</h4>
          {detail.description ? (
            <p className="type-body whitespace-pre-wrap rounded-sm border border-border bg-surface p-4">
              {detail.description}
            </p>
          ) : (
            <p className="type-caption text-default-500">暂无描述。</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="type-emphasis mb-2">用例统计</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="总用例" value={detail.totalCases != null ? String(detail.totalCases) : "-"} />
          <StatCard label="通过" value={detail.passedCases != null ? String(detail.passedCases) : "-"} />
          <StatCard label="失败" value={detail.failedCases != null ? String(detail.failedCases) : "-"} />
          <StatCard label="跳过" value={detail.skippedCases != null ? String(detail.skippedCases) : "-"} />
          <StatCard label="通过率" value={passRate} />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="type-emphasis">关联用例</h3>
          {projectContextVerified ? (
            <Button size="sm" variant="secondary" onPress={() => setAddCaseOpen(true)}>
              添加用例
            </Button>
          ) : null}
        </div>
        {linkedQuery.isPending ? (
          <div className="flex items-center gap-2 py-4 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载关联用例…
          </div>
        ) : null}
        {linkedQuery.isError ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="type-body text-danger">
              关联用例加载失败：{toUserMessage(linkedQuery.error)}
            </p>
            <Button variant="ghost" onPress={() => void linkedQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {linkedQuery.isSuccess && (linkedQuery.data?.list.length ?? 0) === 0 ? (
          <EmptyHint>该套件暂未关联测试用例。</EmptyHint>
        ) : null}
        {linkedQuery.isSuccess && (linkedQuery.data?.list.length ?? 0) > 0 ? (
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {linkedQuery.data!.list.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
              >
                <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
                <Link
                  to="/p/$projectKey/testcases/$testCaseId"
                  params={{ projectKey, testCaseId: String(item.id) }}
                  className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                >
                  {item.title}
                </Link>
                <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
                  {item.caseNumber ?? "-"}
                </span>
                <TestCaseStatusChip status={item.status} />
              </div>
            ))}
          </div>
        ) : null}
        {linkedQuery.isSuccess && (linkedQuery.data?.total ?? 0) > LINKED_PAGE_SIZE ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="type-meta">
              共 {linkedQuery.data!.total} 条 · 第 {linkedPage} /{" "}
              {Math.max(1, Math.ceil(linkedQuery.data!.total / LINKED_PAGE_SIZE))} 页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                isDisabled={linkedPage <= 1}
                onPress={() => setLinkedPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={linkedPage >= Math.ceil(linkedQuery.data!.total / LINKED_PAGE_SIZE)}
                onPress={() => setLinkedPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* 编辑弹窗：快照驱动，生命周期不依赖实时详情/归属查询（codex P2 #3） */}
      {editSnapshot ? (
        <TestSuiteFormDialog
          key={`edit-${editSnapshot.detail.id}`}
          open={editOpen}
          projectId={liveProjectId ?? editSnapshot.projectId}
          mode="edit"
          testSuiteId={editSnapshot.detail.id}
          initial={editFormFromTestSuite(editSnapshot.detail)}
          onClose={() => {
            setEditOpen(false);
            setEditSnapshot(null);
          }}
        />
      ) : null}

      {/* 归档确认框 */}
      <AppModal
        open={archiveOpen}
        title="确认归档"
        onClose={() => setArchiveOpen(false)}
        size="sm"
      >
        <p className="type-body">
          {`归档后套件 #${testSuiteId} 将不再出现在默认列表中，是否继续？`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setArchiveOpen(false)} isDisabled={invalidMutation.isPending}>
            取消
          </Button>
          <Button variant="danger" onPress={handleArchive} isDisabled={invalidMutation.isPending}>
            {invalidMutation.isPending ? "归档中…" : "确认归档"}
          </Button>
        </div>
      </AppModal>

      {/* 添加用例弹窗：候选=本项目未归属本套件的用例。
          ⚠️ 解除关联后端不支持（null 被跳过，无专用端点），故只提供添加。 */}
      <AppModal
        open={addCaseOpen}
        title="添加用例到套件"
        onClose={() => setAddCaseOpen(false)}
        size="lg"
      >
        {candidateQuery.isPending ? (
          <div className="flex items-center gap-2 py-8 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载候选用例…
          </div>
        ) : null}
        {candidateQuery.isError ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p className="type-body text-danger">
              候选用例加载失败：{toUserMessage(candidateQuery.error)}
            </p>
            <Button variant="ghost" onPress={() => void candidateQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {candidateQuery.isSuccess && candidates.length === 0 ? (
          <EmptyHint>本项目没有可添加的用例（全部已归属本套件）。</EmptyHint>
        ) : null}
        {candidateQuery.isSuccess && candidates.length > 0 ? (
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {candidates.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
              >
                <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
                <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
                <TestCaseStatusChip status={item.status} />
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => handleLinkCase(item.id)}
                  isDisabled={linkMutation.isPending}
                  aria-label={`添加用例 ${item.id} 到套件`}
                >
                  添加
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onPress={() => setAddCaseOpen(false)}>
            关闭
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
