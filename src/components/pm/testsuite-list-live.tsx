/**
 * 测试套件列表（P2：p2-testsuite-live）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /testSuite/v1/findByPage（bean.projectId 必传），分页 page/pageSize
 * - 筛选：套件名称（文本）/ 套件类型（六种）/ 状态（八态）
 * - 新建/编辑：TestSuiteFormDialog（POST createTestSuite/updateTestSuite），
 *   成功后列表缓存已失效
 * - 行操作：编辑（弹窗）、启用（POST valid/{id} → 状态置 IN_PROGRESS）、
 *   归档（POST invalid/{id} → 状态置 DEPRECATED，确认框确认，成功后 toast）。
 *   注意：valid/invalid 直接改写 status 枚举字段（不是独立的有效开关）；
 *   后端 findByPage 默认不排除 DEPRECATED，归档记录仍会出现在默认列表中，
 *   可用状态筛选定位（老前端"删除"走的是遗留 /test-suite/* 路径，
 *   testSuite/v1 无此端点，不做）
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 * - 行标题深链到 /p/$projectKey/testsuites/$testSuiteId
 *
 * 未登录走演示测试视图（TestsView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { toast } from "sonner";
import { shouldClampPage } from "@/lib/pagination";
import {
  AppModal,
  EmptyHint,
  OptionSelect,
  PageHeading,
} from "@/components/biz";
import { editFormFromTestSuite, emptyTestSuiteFormInput } from "@/lib/testsuite-form";
import {
  toUserMessage,
  useInvalidTestSuite,
  useTestSuiteList,
  useValidTestSuite,
} from "@/lib/query";
import type { TestSuiteQueryRequest, TestSuiteResponse } from "@/lib/api/testSuite-types";
import {
  TEST_SUITE_STATUS_LABELS,
  TEST_SUITE_TYPES,
} from "@/lib/api/testSuite-types";
import { TestSuiteFormDialog } from "@/components/pm/testsuite-form-dialog";
import {
  TestSuitePriorityChip,
  TestSuiteStatusChip,
} from "@/components/pm/testsuite-status-chip";

const PAGE_SIZE = 20;

const TYPE_FILTER_OPTIONS = TEST_SUITE_TYPES.map((type) => ({ id: type, label: type }));
const STATUS_FILTER_OPTIONS = (Object.keys(TEST_SUITE_STATUS_LABELS) as Array<keyof typeof TEST_SUITE_STATUS_LABELS>).map(
  (status) => ({ id: status, label: TEST_SUITE_STATUS_LABELS[status] }),
);

function toSelectOptions(options: { id: string; label: string }[]) {
  return [{ id: "", label: "全部" }, ...options];
}

export function TestSuiteListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [nameInput, setNameInput] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [suiteType, setSuiteType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  // 编辑快照：打开瞬间捕获记录，弹窗生命周期不依赖实时分页结果。
  // 否则编辑期间他人改动导致重取后记录脱离当前页，脏表单会被
  // 直接卸载而无"是否放弃修改"提示（codex P2 #3）。
  const [editingSuite, setEditingSuite] = useState<TestSuiteResponse | null>(null);
  const [archiveId, setArchiveId] = useState<number | null>(null);

  const bean = useMemo<TestSuiteQueryRequest>(() => {
    const value: TestSuiteQueryRequest = { projectId };
    const suiteName = appliedName.trim();
    if (suiteName) value.suiteName = suiteName;
    if (suiteType) value.suiteType = suiteType as TestSuiteQueryRequest["suiteType"];
    if (status) value.status = status as TestSuiteQueryRequest["status"];
    return value;
  }, [projectId, appliedName, suiteType, status]);

  const listQuery = useTestSuiteList({ page, pageSize: PAGE_SIZE, bean, projectId });
  const validMutation = useValidTestSuite();
  const invalidMutation = useInvalidTestSuite();

  const applyFilters = () => {
    setAppliedName(nameInput);
    setPage(1);
  };

  const resetFilters = () => {
    setNameInput("");
    setAppliedName("");
    setSuiteType("");
    setStatus("");
    setPage(1);
  };

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页重新查询，
  // 避免出现"第 2 / 1 页"且空列表的误导状态。
  // 注意：只在当前页请求完成后钳制——isSuccess 为 true 但 isFetching 仍为 true 时，
  // 返回的是失效缓存（旧 total），此时钳制会把用户错误拉回上一页（Codex round-2 复现）。
  useEffect(() => {
    const clamped = shouldClampPage(listQuery.isSuccess, listQuery.isFetching, page, total, PAGE_SIZE);
    if (clamped !== null) setPage(clamped);
  }, [listQuery.isSuccess, listQuery.isFetching, page, total]);

  const handleValid = (id: number) => {
    if (validMutation.isPending) return;
    validMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`测试套件 #${id} 已启用`);
      },
      onError: (error) => {
        toast.error(`启用失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleInvalid = () => {
    if (archiveId === null || invalidMutation.isPending) return;
    const id = archiveId;
    setArchiveId(null);
    invalidMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`测试套件 #${id} 已归档`);
      },
      onError: (error) => {
        toast.error(`归档失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="测试套件"
        hint="真实后端数据（POST /testSuite/v1/findByPage）。按名称、类型、状态筛选。"
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="min-w-48 flex-1">
          <TextField value={nameInput} onChange={setNameInput} aria-label="按套件名称搜索">
            <Input placeholder="按套件名称搜索，回车确认" />
          </TextField>
        </div>
        <div className="w-40">
          <OptionSelect
            label="类型"
            value={suiteType}
            options={toSelectOptions(TYPE_FILTER_OPTIONS)}
            onChange={(next) => { setSuiteType(next); setPage(1); }}
          />
        </div>
        <div className="w-40">
          <OptionSelect
            label="状态"
            value={status}
            options={toSelectOptions(STATUS_FILTER_OPTIONS)}
            onChange={(next) => { setStatus(next); setPage(1); }}
          />
        </div>
        <Button type="submit" variant="primary">
          搜索
        </Button>
        <Button variant="ghost" onPress={resetFilters}>
          重置
        </Button>
        <Button variant="secondary" onPress={() => setCreateOpen(true)}>
          新建套件
        </Button>
      </form>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载测试套件…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">测试套件列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的测试套件。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
              <Link
                to="/p/$projectKey/testsuites/$testSuiteId"
                params={{ projectKey, testSuiteId: String(item.id) }}
                className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {item.suiteName}
              </Link>
              <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
                {item.suiteType ?? "-"}
              </span>
              <span className="hidden shrink-0 sm:inline-flex">
                <TestSuitePriorityChip priority={item.priority ?? ""} />
              </span>
              <TestSuiteStatusChip status={item.status} />
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setEditingSuite(item)}
                  aria-label={`编辑套件 ${item.id}`}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => handleValid(item.id)}
                  isDisabled={validMutation.isPending}
                  aria-label={`启用套件 ${item.id}`}
                >
                  启用
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onPress={() => setArchiveId(item.id)}
                  isDisabled={invalidMutation.isPending}
                  aria-label={`归档套件 ${item.id}`}
                >
                  归档
                </Button>
              </span>
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
            <Button size="sm" variant="ghost" isDisabled={page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>
              上一页
            </Button>
            <Button size="sm" variant="ghost" isDisabled={page >= totalPages} onPress={() => setPage((current) => current + 1)}>
              下一页
            </Button>
          </div>
        </div>
      ) : null}

      <TestSuiteFormDialog
        key={createOpen ? "create" : "create-closed"}
        open={createOpen}
        projectId={projectId}
        mode="create"
        initial={emptyTestSuiteFormInput()}
        onClose={() => setCreateOpen(false)}
      />
      {editingSuite ? (
        <TestSuiteFormDialog
          key={`edit-${editingSuite.id}`}
          open
          projectId={projectId}
          mode="edit"
          testSuiteId={editingSuite.id}
          initial={editFormFromTestSuite(editingSuite)}
          onClose={() => setEditingSuite(null)}
        />
      ) : null}

      {/* 归档确认框：归档仅把状态置为「已废弃」，记录仍会出现在默认列表中
          （后端 findByPage 默认不排除 DEPRECATED），文案如实描述（codex r6 P2-7） */}
      <AppModal
        open={archiveId !== null}
        title="确认归档"
        onClose={() => setArchiveId(null)}
        size="sm"
      >
        <p className="type-body">
          {`归档后套件 #${archiveId} 的状态将变为「已废弃」，仍会出现在列表中（可按状态筛选查看），是否继续？`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setArchiveId(null)} isDisabled={invalidMutation.isPending}>
            取消
          </Button>
          <Button variant="danger" onPress={handleInvalid} isDisabled={invalidMutation.isPending}>
            {invalidMutation.isPending ? "归档中…" : "确认归档"}
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
