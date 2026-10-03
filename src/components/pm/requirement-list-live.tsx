/**
 * 需求列表（P1：p1-requirement-list）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /requirement/v1/findByPage（bean.projectId 必传），分页 page/pageSize
 * - 筛选：标题（文本）/ 类型 / 优先级 / 状态；选项走 types/priorities/statuses
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 *
 * 未登录走演示需求树（RequirementsView）时不使用本组件。
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { EmptyHint, OptionSelect, PageHeading, PriorityMark, StatusChip } from "@/components/biz";
import { toUserMessage, useRequirementList, useRequirementOptions } from "@/lib/query";
import type { RequirementOption, RequirementQueryRequest } from "@/lib/api/requirement-types";

const PAGE_SIZE = 20;

function toSelectOptions(options: RequirementOption[] | undefined) {
  return [
    { id: "", label: "全部" },
    ...(options ?? []).map((option) => ({ id: option.value, label: option.label })),
  ];
}

export function RequirementListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [requirementType, setRequirementType] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const optionsQuery = useRequirementOptions();
  const options = optionsQuery.data;

  const bean = useMemo<RequirementQueryRequest>(() => {
    const value: RequirementQueryRequest = { projectId };
    const title = appliedTitle.trim();
    if (title) value.title = title;
    if (requirementType) value.requirementType = requirementType as RequirementQueryRequest["requirementType"];
    if (priority) value.priority = priority as RequirementQueryRequest["priority"];
    if (status) value.status = status as RequirementQueryRequest["status"];
    return value;
  }, [projectId, appliedTitle, requirementType, priority, status]);

  const listQuery = useRequirementList({ page, pageSize: PAGE_SIZE, bean, projectId });

  const typeLabelOf = useMemo(() => {
    const map = new Map((options?.types ?? []).map((option) => [option.value, option.label] as const));
    return (value: string) => map.get(value) ?? value;
  }, [options]);

  const applyFilters = () => {
    setAppliedTitle(titleInput);
    setPage(1);
  };

  const resetFilters = () => {
    setTitleInput("");
    setAppliedTitle("");
    setRequirementType("");
    setPriority("");
    setStatus("");
    setPage(1);
  };

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="需求" hint="真实后端数据（POST /requirement/v1/findByPage）。按标题、类型、优先级、状态筛选。" />

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
          <OptionSelect label="类型" value={requirementType} options={toSelectOptions(options?.types)} onChange={(next) => { setRequirementType(next); setPage(1); }} />
        </div>
        <div className="w-36">
          <OptionSelect label="优先级" value={priority} options={toSelectOptions(options?.priorities)} onChange={(next) => { setPriority(next); setPage(1); }} />
        </div>
        <div className="w-40">
          <OptionSelect label="状态" value={status} options={toSelectOptions(options?.statuses)} onChange={(next) => { setStatus(next); setPage(1); }} />
        </div>
        <Button type="submit" variant="primary">
          搜索
        </Button>
        <Button variant="ghost" onPress={resetFilters}>
          重置
        </Button>
      </form>

      {optionsQuery.isError ? (
        <p className="type-body text-danger">筛选选项加载失败：{toUserMessage(optionsQuery.error)}（筛选仍可按已选项使用）</p>
      ) : null}

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载需求…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">需求列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的需求。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <Link
                to="/p/$projectKey/requirements/$requirementId"
                params={{ projectKey, requirementId: String(item.id) }}
                className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {item.title}
              </Link>
              <span className="type-caption hidden shrink-0 sm:inline">{typeLabelOf(item.requirementType)}</span>
              <span className="hidden shrink-0 sm:inline-flex">
                <PriorityMark priority={item.priority} />
              </span>
              {item.storyPoints != null ? (
                <span className="type-caption hidden shrink-0 sm:inline">{item.storyPoints} 点</span>
              ) : null}
              <StatusChip kind="requirement" status={item.status} />
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
    </div>
  );
}
