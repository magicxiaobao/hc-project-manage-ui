/**
 * 缺陷列表（P2：p2-defect-list-create）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /defect/v1/findByPage（bean.projectId 必传），分页 page/pageSize
 * - 筛选：标题（文本）/ 状态（statusOptions 驱动十态）/ 严重度六档 / 优先级三档
 * - 新建：DefectCreateDialog（POST /defect/v1/createDefect），成功后列表缓存已失效
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 * - 行标题深链到 /p/$projectKey/defects/$defectId（p2-defect-detail-flow）
 *
 * 未登录走演示看板（BoardView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { shouldClampPage } from "@/lib/pagination";
import { EmptyHint, OptionSelect, PageHeading, PriorityMark, SeverityChip, StatusChip } from "@/components/biz";
import { severityLabel } from "@/components/biz/severity";
import { priorityLabel } from "@/lib/pm/domain";
import { toUserMessage, useDefectList, useDefectStatusOptions } from "@/lib/query";
import type { DefectQueryRequest } from "@/lib/api/defect-types";
import { DEFECT_PRIORITIES, DEFECT_SEVERITIES } from "@/lib/api/defect-types";
import { DefectCreateDialog } from "@/components/pm/defect-create-dialog";

const PAGE_SIZE = 20;

function toSelectOptions(options: { value: string; label: string }[] | undefined) {
  return [
    { id: "", label: "全部" },
    ...(options ?? []).map((option) => ({ id: option.value, label: option.label })),
  ];
}

const SEVERITY_FILTER_OPTIONS = DEFECT_SEVERITIES.map((severity) => ({
  value: severity,
  label: severityLabel(severity),
}));

const PRIORITY_FILTER_OPTIONS = DEFECT_PRIORITIES.map((priority) => ({
  value: priority,
  label: priorityLabel(priority),
}));

export function DefectListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const statusOptionsQuery = useDefectStatusOptions();

  const bean = useMemo<DefectQueryRequest>(() => {
    const value: DefectQueryRequest = { projectId };
    const title = appliedTitle.trim();
    if (title) value.title = title;
    if (status) value.status = status as DefectQueryRequest["status"];
    if (severity) value.severity = severity as DefectQueryRequest["severity"];
    if (priority) value.priority = priority as DefectQueryRequest["priority"];
    return value;
  }, [projectId, appliedTitle, status, severity, priority]);

  const listQuery = useDefectList({ page, pageSize: PAGE_SIZE, bean, projectId });

  const applyFilters = () => {
    setAppliedTitle(titleInput);
    setPage(1);
  };

  const resetFilters = () => {
    setTitleInput("");
    setAppliedTitle("");
    setStatus("");
    setSeverity("");
    setPriority("");
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="缺陷"
        hint="真实后端数据（POST /defect/v1/findByPage）。按标题、状态、严重度、优先级筛选。"
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
          <OptionSelect
            label="状态"
            value={status}
            options={toSelectOptions(statusOptionsQuery.data)}
            onChange={(next) => { setStatus(next); setPage(1); }}
          />
        </div>
        <div className="w-36">
          <OptionSelect
            label="严重度"
            value={severity}
            options={toSelectOptions(SEVERITY_FILTER_OPTIONS)}
            onChange={(next) => { setSeverity(next); setPage(1); }}
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
        <Button type="submit" variant="primary">
          搜索
        </Button>
        <Button variant="ghost" onPress={resetFilters}>
          重置
        </Button>
        <Button variant="secondary" onPress={() => setCreateOpen(true)}>
          新建缺陷
        </Button>
      </form>

      {statusOptionsQuery.isError ? (
        <p className="type-body text-danger">状态选项加载失败：{toUserMessage(statusOptionsQuery.error)}（状态筛选暂不可用）</p>
      ) : null}

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载缺陷…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">缺陷列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的缺陷。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
              <Link
                to="/p/$projectKey/defects/$defectId"
                params={{ projectKey, defectId: String(item.id) }}
                className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {item.title}
              </Link>
              <span className="hidden shrink-0 sm:inline-flex">
                <SeverityChip severity={item.severity} />
              </span>
              <span className="hidden shrink-0 sm:inline-flex">
                <PriorityMark priority={item.priority} />
              </span>
              <StatusChip kind="defect" status={item.status} />
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

      <DefectCreateDialog open={createOpen} projectId={projectId} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
