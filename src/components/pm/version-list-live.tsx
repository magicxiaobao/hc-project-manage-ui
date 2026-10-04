/**
 * 版本列表（P2：p2-version-slices）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /version/v1/findByPage（bean.projectId 必传），分页 page/pageSize
 * - 筛选：版本名称（文本）/ 版本号（文本）/ 版本类型（四档）/ 状态（六态）
 * - 新建/编辑：VersionFormDialog（POST /version/v1/createVersion，
 *   updateVersion），成功后列表缓存已失效
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 * - 行名称深链到 /p/$projectKey/versions/$versionId（p2-version-slices 详情）
 *
 * 未登录走演示版本管理（ReleasesView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { shouldClampPage } from "@/lib/pagination";
import { EmptyHint, OptionSelect, PageHeading, VersionStatusChip } from "@/components/biz";
import { toUserMessage, useVersionList } from "@/lib/query";
import type { VersionQueryRequest } from "@/lib/api/version-types";
import { VERSION_STATUSES, VERSION_STATUS_LABELS, VERSION_TYPES } from "@/lib/api/version-types";
import { VersionFormDialog } from "@/components/pm/version-form-dialog";

const PAGE_SIZE = 20;

function toSelectOptions(options: { id: string; label: string }[]) {
  return [{ id: "", label: "全部" }, ...options];
}

const VERSION_TYPE_FILTER_OPTIONS = VERSION_TYPES.map((versionType) => ({
  id: versionType,
  label: versionType,
}));

const STATUS_FILTER_OPTIONS = VERSION_STATUSES.map((status) => ({
  id: status,
  label: VERSION_STATUS_LABELS[status],
}));

export function VersionListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const navigate = useNavigate();
  const [nameInput, setNameInput] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [numberInput, setNumberInput] = useState("");
  const [appliedNumber, setAppliedNumber] = useState("");
  const [versionType, setVersionType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const bean = useMemo<VersionQueryRequest>(() => {
    const value: VersionQueryRequest = { projectId };
    const name = appliedName.trim();
    if (name) value.name = name;
    const versionNumber = appliedNumber.trim();
    if (versionNumber) value.versionNumber = versionNumber;
    if (versionType) value.versionType = versionType as VersionQueryRequest["versionType"];
    if (status) value.status = status as VersionQueryRequest["status"];
    return value;
  }, [projectId, appliedName, appliedNumber, versionType, status]);

  const listQuery = useVersionList({ page, pageSize: PAGE_SIZE, bean, projectId });

  const applyFilters = () => {
    setAppliedName(nameInput);
    setAppliedNumber(numberInput);
    setPage(1);
  };

  const resetFilters = () => {
    setNameInput("");
    setAppliedName("");
    setNumberInput("");
    setAppliedNumber("");
    setVersionType("");
    setStatus("");
    setPage(1);
  };

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页重新查询，
  // 避免出现"第 2 / 1 页"且空列表的误导状态（沿用 defect-list-live 的钳制语义）。
  useEffect(() => {
    const clamped = shouldClampPage(listQuery.isSuccess, listQuery.isFetching, page, total, PAGE_SIZE);
    if (clamped !== null) setPage(clamped);
  }, [listQuery.isSuccess, listQuery.isFetching, page, total]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="版本"
        hint="真实后端数据（POST /version/v1/findByPage）。按版本名称、版本号、版本类型、状态筛选。"
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          applyFilters();
        }}
      >
        <div className="min-w-40 flex-1">
          <TextField value={nameInput} onChange={setNameInput} aria-label="按版本名称搜索">
            <Input placeholder="按版本名称搜索，回车确认" />
          </TextField>
        </div>
        <div className="min-w-36 flex-1">
          <TextField value={numberInput} onChange={setNumberInput} aria-label="按版本号搜索">
            <Input placeholder="按版本号搜索，回车确认" />
          </TextField>
        </div>
        <div className="w-36">
          <OptionSelect
            label="版本类型"
            value={versionType}
            options={toSelectOptions(VERSION_TYPE_FILTER_OPTIONS)}
            onChange={(next) => { setVersionType(next); setPage(1); }}
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
        <Button
          variant="ghost"
          onPress={() =>
            void navigate({
              to: "/p/$projectKey/release-environments",
              params: { projectKey },
            })
          }
        >
          发布环境
        </Button>
        <Button variant="secondary" onPress={() => setCreateOpen(true)}>
          新建版本
        </Button>
      </form>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载版本…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">版本列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的版本。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="type-caption shrink-0 text-default-400">#{item.id}</span>
              <Link
                to="/p/$projectKey/versions/$versionId"
                params={{ projectKey, versionId: String(item.id) }}
                className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {item.name}
              </Link>
              <span className="type-caption hidden shrink-0 rounded-sm border border-border px-2 py-0.5 sm:inline">
                {item.versionNumber}
              </span>
              <span className="type-caption hidden shrink-0 text-default-500 md:inline">
                {item.versionType}
              </span>
              <span className="shrink-0">
                <VersionStatusChip status={item.status} />
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

      <VersionFormDialog open={createOpen} projectId={projectId} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
