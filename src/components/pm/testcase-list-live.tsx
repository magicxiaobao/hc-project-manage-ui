/**
 * 测试用例列表（P2：p2-testcase-list-detail）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /testCase/v1/findByPage（bean.projectId 必传），分页 page/pageSize
 * - 筛选：标题（文本）/ 用例编号 / 类型（七种）/ 优先级（三档）/ 状态
 *   （DRAFT/ACTIVE/REVIEW，忠实老前端 TEST_CASE_STATUS_OPTIONS：默认不查
 *   ARCHIVED，"全部"则不带状态条件）
 * - 新建/编辑：TestCaseFormDialog（POST createTestCase/updateTestCase），
 *   成功后列表缓存已失效
 * - 行操作：编辑（弹窗）、复制（POST duplicateTestCase/{id}，成功后 toast 新 id）、
 *   归档（POST invalid/{id}，确认框确认，成功后 toast）
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 * - 行标题深链到 /p/$projectKey/testcases/$testCaseId
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
import { editFormFromTestCase, emptyTestCaseFormInput } from "@/lib/testcase-form";
import {
  toUserMessage,
  useArchiveTestCase,
  useDuplicateTestCase,
  useTestCaseList,
} from "@/lib/query";
import type { TestCaseQueryRequest } from "@/lib/api/testCase-types";
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUS_LABELS,
  TEST_CASE_TYPES,
} from "@/lib/api/testCase-types";
import { TestCaseFormDialog } from "@/components/pm/testcase-form-dialog";
import {
  TestCasePriorityChip,
  TestCaseStatusChip,
} from "@/components/pm/testcase-status-chip";

const PAGE_SIZE = 20;

const TYPE_FILTER_OPTIONS = TEST_CASE_TYPES.map((type) => ({ id: type, label: type }));
const PRIORITY_FILTER_OPTIONS = TEST_CASE_PRIORITIES.map((priority) => ({
  id: priority,
  label: priority,
}));
const STATUS_FILTER_OPTIONS = (["DRAFT", "ACTIVE", "REVIEW"] as const).map((status) => ({
  id: status,
  label: TEST_CASE_STATUS_LABELS[status],
}));

function toSelectOptions(options: { id: string; label: string }[]) {
  return [{ id: "", label: "全部" }, ...options];
}

export function TestCaseListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [numberInput, setNumberInput] = useState("");
  const [appliedNumber, setAppliedNumber] = useState("");
  const [testType, setTestType] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [archiveId, setArchiveId] = useState<number | null>(null);

  const bean = useMemo<TestCaseQueryRequest>(() => {
    const value: TestCaseQueryRequest = { projectId };
    const title = appliedTitle.trim();
    if (title) value.title = title;
    const caseNumber = appliedNumber.trim();
    if (caseNumber) value.caseNumber = caseNumber;
    if (testType) value.testType = testType as TestCaseQueryRequest["testType"];
    if (priority) value.priority = priority as TestCaseQueryRequest["priority"];
    if (status) value.status = status as TestCaseQueryRequest["status"];
    return value;
  }, [projectId, appliedTitle, appliedNumber, testType, priority, status]);

  const listQuery = useTestCaseList({ page, pageSize: PAGE_SIZE, bean, projectId });
  const duplicateMutation = useDuplicateTestCase();
  const archiveMutation = useArchiveTestCase();

  const applyFilters = () => {
    setAppliedTitle(titleInput);
    setAppliedNumber(numberInput);
    setPage(1);
  };

  const resetFilters = () => {
    setTitleInput("");
    setAppliedTitle("");
    setNumberInput("");
    setAppliedNumber("");
    setTestType("");
    setPriority("");
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

  const handleDuplicate = (id: number) => {
    if (duplicateMutation.isPending) return;
    duplicateMutation.mutate(id, {
      onSuccess: (newId) => {
        toast.success(`测试用例已复制（新用例 #${newId}）`);
      },
      onError: (error) => {
        toast.error(`复制失败：${toUserMessage(error)}`);
      },
    });
  };

  const handleArchive = () => {
    if (archiveId === null || archiveMutation.isPending) return;
    const id = archiveId;
    setArchiveId(null);
    archiveMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`测试用例 #${id} 已归档`);
      },
      onError: (error) => {
        toast.error(`归档失败：${toUserMessage(error)}`);
      },
    });
  };

  const editingCase =
    editId !== null ? listQuery.data?.list.find((item) => item.id === editId) ?? null : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="测试用例"
        hint="真实后端数据（POST /testCase/v1/findByPage）。按标题、编号、类型、优先级、状态筛选。"
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="min-w-48 flex-1">
          <TextField value={titleInput} onChange={setTitleInput} aria-label="按标题搜索">
            <Input placeholder="按标题搜索，回车确认" />
          </TextField>
        </div>
        <div className="w-40">
          <TextField value={numberInput} onChange={setNumberInput} aria-label="按用例编号搜索">
            <Input placeholder="按编号搜索，回车确认" />
          </TextField>
        </div>
        <div className="w-40">
          <OptionSelect
            label="类型"
            value={testType}
            options={toSelectOptions(TYPE_FILTER_OPTIONS)}
            onChange={(next) => { setTestType(next); setPage(1); }}
          />
        </div>
        <div className="w-36">
          <OptionSelect
            label="优先级"
            value={priority}
            options={toSelectOptions(PRIORITY_FILTER_OPTIONS)}
            onChange={(next) => { setPriority(next); setPage(1); }}
          />
        </div>
        <div className="w-36">
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
          新建用例
        </Button>
      </form>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载测试用例…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">测试用例列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的测试用例。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
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
              <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
                {item.testType ?? "-"}
              </span>
              <span className="hidden shrink-0 sm:inline-flex">
                <TestCasePriorityChip priority={item.priority ?? ""} />
              </span>
              <TestCaseStatusChip status={item.status} />
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setEditId(item.id)}
                  aria-label={`编辑用例 ${item.id}`}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => handleDuplicate(item.id)}
                  isDisabled={duplicateMutation.isPending}
                  aria-label={`复制用例 ${item.id}`}
                >
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onPress={() => setArchiveId(item.id)}
                  aria-label={`归档用例 ${item.id}`}
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

      <TestCaseFormDialog
        key={createOpen ? "create" : "create-closed"}
        open={createOpen}
        projectId={projectId}
        mode="create"
        initial={emptyTestCaseFormInput()}
        onClose={() => setCreateOpen(false)}
      />
      {editingCase ? (
        <TestCaseFormDialog
          key={`edit-${editingCase.id}`}
          open
          projectId={projectId}
          mode="edit"
          testCaseId={editingCase.id}
          initial={editFormFromTestCase(editingCase)}
          onClose={() => setEditId(null)}
        />
      ) : null}

      {/* 归档确认框（老前端确认文案："归档后将不再出现在默认列表中，是否继续？"） */}
      <AppModal
        open={archiveId !== null}
        title="确认归档"
        onClose={() => setArchiveId(null)}
        size="sm"
      >
        <p className="type-body">
          {`归档后用例 #${archiveId} 将不再出现在默认列表中，是否继续？`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setArchiveId(null)} isDisabled={archiveMutation.isPending}>
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
