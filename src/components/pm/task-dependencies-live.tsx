import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Checkbox, Spinner } from "@heroui/react";
import { AppModal, OptionSelect, PageHeading } from "@/components/biz";
import {
  toUserMessage,
  isRetryableQueryError,
  useTaskDependencyListAll,
  useTaskDependencyStatistics,
  useDependencyConflicts,
  useProjectAllTasks,
  useInvalidTaskDependency,
  useBatchDeleteTaskDependencies,
  useTaskDependencyWriting,
  useRefreshTaskDependencyDomains,
} from "@/lib/query";
import {
  DEPENDENCY_TYPES,
  dependencyTaskLabel,
  dependencyTypeLabel,
  dependencyStatusLabel,
  dependencyLagLabel,
  filterDependencies,
  paginateDependencies,
  isPositiveSafeId,
} from "@/lib/task-dependencies-live";
import type { TaskDependencyResponse } from "@/lib/api/task-dependency-types";
import { TaskDependencyFormDialog } from "./task-dependency-form-dialog";

export function TaskDependenciesLive({
  projectId,
  projectKey,
}: {
  projectId: number;
  projectKey: string;
}) {
  const list = useTaskDependencyListAll({ projectId });
  const statistics = useTaskDependencyStatistics(projectId);
  const tasks = useProjectAllTasks({ projectId: isPositiveSafeId(projectId) ? projectId : null });
  const [detected, setDetected] = useState(false);
  const conflicts = useDependencyConflicts(projectId, detected);
  const invalid = useInvalidTaskDependency();
  const batchDelete = useBatchDeleteTaskDependencies();
  const writing = useTaskDependencyWriting();
  const refreshDomains = useRefreshTaskDependencyDomains();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<number[]>([]);
  const [formSession, setFormSession] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: "invalid" | "batch";
    rows: readonly TaskDependencyResponse[];
    ids: readonly number[];
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [operationSucceeded, setOperationSucceeded] = useState(false);
  const deleteLock = useRef(false);
  const filtered = useMemo(
    () => filterDependencies(list.data ?? [], type, status),
    [list.data, type, status],
  );
  const pagination = useMemo(
    () => paginateDependencies(filtered, page, pageSize),
    [filtered, page, pageSize],
  );
  const visibleIds = useMemo(
    () => pagination.rows.map((row) => row.id).filter(isPositiveSafeId),
    [pagination.rows],
  );
  const chosen = selected.filter((id) => visibleIds.includes(id));
  const locked = writing || !!confirm || formOpen;
  const deleteBusy = invalid.isPending || batchDelete.isPending || verifying;
  const names = (tasks.data ?? []).filter((task) => task.projectId === projectId);
  useEffect(() => {
    if (list.isSuccess) {
      setPage(pagination.page);
      setSelected((current) => {
        const next = current.filter((id) => visibleIds.includes(id));
        return next.length === current.length ? current : next;
      });
    }
  }, [list.isSuccess, list.dataUpdatedAt, pagination.page, visibleIds]); // 当前可见页之外不得保留选择
  const refetchStatistics = statistics.refetch;
  useEffect(() => {
    if (conflicts.isSuccess && conflicts.dataUpdatedAt) void refetchStatistics();
  }, [conflicts.isSuccess, conflicts.dataUpdatedAt, refetchStatistics]);
  const successful = () => {
    setOperationSucceeded(true);
    setSelected([]);
  };
  const refresh = async () => {
    await Promise.allSettled([
      list.refetch(),
      statistics.refetch(),
      tasks.refetch(),
      ...(detected ? [conflicts.refetch()] : []),
    ]);
  };
  const resetPage = () => {
    setPage(1);
    setSelected([]);
  };
  const openConfirmation = (kind: "invalid" | "batch", rows: TaskDependencyResponse[]) => {
    const ids = [...new Set(rows.map((row) => row.id))].filter(isPositiveSafeId);
    if (!ids.length || writing) return;
    setConfirm({
      kind,
      rows: Object.freeze(rows.filter((row) => ids.includes(row.id))),
      ids: Object.freeze(ids),
    });
    setDeleteError("");
    setNeedsVerification(false);
  };
  const deleteConfirmed = async () => {
    if (!confirm || deleteLock.current || needsVerification) return;
    deleteLock.current = true;
    setDeleteError("");
    try {
      if (confirm.kind === "invalid") await invalid.mutateAsync(confirm.ids[0]);
      else await batchDelete.mutateAsync([...confirm.ids]);
      successful();
      setConfirm(null);
    } catch (error) {
      const uncertain = isRetryableQueryError(error);
      setNeedsVerification(uncertain);
      setDeleteError(
        `${toUserMessage(error)}${uncertain ? "；网络结果不确定，请先刷新核实，再确认操作。" : ""}`,
      );
    } finally {
      deleteLock.current = false;
    }
  };
  const verifyDelete = async () => {
    if (!confirm || deleteLock.current) return;
    deleteLock.current = true;
    setVerifying(true);
    try {
      const result = await list.refetch();
      if (result.isError || !result.data) {
        setDeleteError(`核实失败：${toUserMessage(result.error)}`);
        return;
      }
      const remaining = confirm.rows.filter((row) =>
        result.data.some(
          (item) => item.id === row.id && (confirm.kind === "batch" || item.status === "ACTIVE"),
        ),
      );
      if (!remaining.length) {
        successful();
        setConfirm(null);
        await refreshDomains();
        await refresh();
      } else {
        setConfirm({
          ...confirm,
          rows: Object.freeze(remaining),
          ids: Object.freeze(remaining.map((row) => row.id)),
        });
        setNeedsVerification(false);
        setDeleteError("已刷新核实，以下记录仍可操作。请重新确认。");
      }
    } finally {
      setVerifying(false);
      deleteLock.current = false;
    }
  };
  const readFailed =
    list.isError || statistics.isError || tasks.isError || (detected && conflicts.isError);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading title="任务依赖关系管理" hint="管理项目内任务的直接依赖关系" />
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onPress={() => void refresh()} isDisabled={writing}>
            刷新
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setDetected(true);
              void conflicts.refetch({ cancelRefetch: false });
            }}
            isDisabled={writing || conflicts.isFetching}
          >
            检测冲突
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              setFormSession((value) => value + 1);
              setFormOpen(true);
            }}
            isDisabled={locked}
          >
            新建依赖
          </Button>
        </div>
      </div>
      {operationSucceeded && readFailed ? (
        <div role="alert" className="rounded border border-danger/40 p-3 text-danger">
          操作已成功，刷新失败
          <Button variant="ghost" size="sm" onPress={() => void refresh()}>
            重试读取
          </Button>
        </div>
      ) : null}
      <section aria-label="依赖统计" className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { key: "totalDependencies", label: "总依赖关系" },
            { key: "conflicts", label: "冲突数量" },
            { key: "circularDependencies", label: "循环依赖" },
          ] as const
        ).map(({ key, label }) => (
          <div key={key} className="rounded border border-border bg-surface p-4">
            <p className="type-caption">{label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {statistics.isPending ? "加载中…" : (statistics.data?.[key] ?? "不可用")}
            </p>
            {!statistics.isPending && statistics.data?.[key] == null ? (
              <p className="text-sm text-danger">统计字段不可用，请重试</p>
            ) : null}
          </div>
        ))}
      </section>
      <p className="type-caption">总数含已作废；冲突/循环按有效依赖边计数，不代表独立环数。</p>
      {statistics.isError ||
      (statistics.data && Object.values(statistics.data).some((value) => value == null)) ? (
        <div role="alert" className="text-danger">
          {statistics.isError
            ? `统计加载失败：${toUserMessage(statistics.error)}`
            : "统计响应契约错误：缺失或无效字段"}
          {statistics.data && statistics.isError ? "（上次数据可能已过期）" : ""}
          <Button size="sm" variant="ghost" onPress={() => void statistics.refetch()}>
            重试统计
          </Button>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="依赖列表" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="w-52">
              <span className="type-caption">依赖类型</span>
              <OptionSelect
                label="筛选依赖类型"
                value={type}
                options={[
                  { id: "", label: "全部类型" },
                  ...DEPENDENCY_TYPES.map(({ id, label }) => ({ id, label })),
                ]}
                onChange={(value) => {
                  setType(value);
                  resetPage();
                }}
                isDisabled={locked}
              />
            </div>
            <div className="w-40">
              <span className="type-caption">状态</span>
              <OptionSelect
                label="筛选状态"
                value={status}
                options={[
                  { id: "", label: "全部状态" },
                  { id: "ACTIVE", label: "有效" },
                  { id: "INACTIVE", label: "已作废" },
                ]}
                onChange={(value) => {
                  setStatus(value);
                  resetPage();
                }}
                isDisabled={locked}
              />
            </div>
            <Button
              variant="danger"
              isDisabled={locked || !chosen.length}
              onPress={() =>
                openConfirmation(
                  "batch",
                  pagination.rows.filter((row) => chosen.includes(row.id)),
                )
              }
            >
              批量删除
            </Button>
            <span className="type-caption">已选 {chosen.length} 条</span>
          </div>
          {tasks.isError ? (
            <div role="alert" className="mb-2 text-danger">
              任务名称加载失败：{toUserMessage(tasks.error)}；保留任务编号。
              <Button size="sm" variant="ghost" onPress={() => void tasks.refetch()}>
                重试名称
              </Button>
            </div>
          ) : null}
          {list.isError ? (
            <div role="alert" className="mb-2 text-danger">
              {list.data ? "后台刷新失败，列表为上次数据，可能已过期：" : "依赖加载失败："}
              {toUserMessage(list.error)}
              <Button size="sm" variant="ghost" onPress={() => void list.refetch()}>
                重试列表
              </Button>
            </div>
          ) : null}
          {list.isPending ? (
            <p>
              <Spinner size="sm" /> 正在加载依赖…
            </p>
          ) : list.data ? (
            <>
              {pagination.total === 0 ? (
                <p className="rounded border border-border p-6">
                  {list.data.length === 0 ? "当前项目暂无依赖关系。" : "当前筛选条件下无依赖关系。"}
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-default/5">
                      <tr>
                        <th className="p-3">
                          <Checkbox
                            aria-label="全选当前页"
                            isSelected={
                              visibleIds.length > 0 && chosen.length === visibleIds.length
                            }
                            isIndeterminate={chosen.length > 0 && chosen.length < visibleIds.length}
                            isDisabled={locked}
                            onChange={(value) => setSelected(value ? visibleIds : [])}
                          />
                        </th>
                        {["前置任务", "类型", "后置任务", "延迟（天）", "描述", "状态", "操作"].map(
                          (label) => (
                            <th key={label} className="p-3">
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-border"
                          data-dependency-id={row.id}
                        >
                          <td className="p-3">
                            <Checkbox
                              aria-label={`选择依赖 #${row.id}`}
                              isSelected={chosen.includes(row.id)}
                              isDisabled={locked || !isPositiveSafeId(row.id)}
                              onChange={(value) =>
                                setSelected((current) =>
                                  value
                                    ? [...new Set([...current, row.id])]
                                    : current.filter((id) => id !== row.id),
                                )
                              }
                            />
                          </td>
                          <td className="p-3">
                            <Link
                              to="/p/$projectKey/issues/$taskId"
                              params={{ projectKey, taskId: String(row.predecessorId) }}
                              className="text-accent hover:underline"
                            >
                              {dependencyTaskLabel(row.predecessorId, names)}
                            </Link>
                            <p className="type-caption">依赖 #{row.id}</p>
                          </td>
                          <td className="p-3">{dependencyTypeLabel(row.dependencyType)}</td>
                          <td className="p-3">
                            <Link
                              to="/p/$projectKey/issues/$taskId"
                              params={{ projectKey, taskId: String(row.successorId) }}
                              className="text-accent hover:underline"
                            >
                              {dependencyTaskLabel(row.successorId, names)}
                            </Link>
                          </td>
                          <td className="p-3">{dependencyLagLabel(row.lag)}</td>
                          <td className="max-w-52 whitespace-pre-wrap break-words p-3">
                            {row.description || "—"}
                          </td>
                          <td className="p-3">{dependencyStatusLabel(row.status)}</td>
                          <td className="p-3">
                            <Button
                              size="sm"
                              variant="danger"
                              isDisabled={
                                locked || row.status !== "ACTIVE" || !isPositiveSafeId(row.id)
                              }
                              onPress={() => openConfirmation("invalid", [row])}
                            >
                              删除
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="type-caption">
                  共 {pagination.total} 条 · 第 {pagination.page}/{pagination.totalPages} 页
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={locked || pagination.page === 1}
                  onPress={() => {
                    setPage(pagination.page - 1);
                    setSelected([]);
                  }}
                >
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={locked || pagination.page === pagination.totalPages}
                  onPress={() => {
                    setPage(pagination.page + 1);
                    setSelected([]);
                  }}
                >
                  下一页
                </Button>
                <div className="w-28">
                  <OptionSelect
                    label="每页条数"
                    value={String(pageSize)}
                    options={[10, 20, 50].map((value) => ({
                      id: String(value),
                      label: `${value} 条/页`,
                    }))}
                    onChange={(value) => {
                      if ([10, 20, 50].includes(Number(value))) {
                        setPageSize(Number(value));
                        resetPage();
                      }
                    }}
                    isDisabled={locked}
                  />
                </div>
              </div>
            </>
          ) : null}
        </section>
        <aside aria-label="冲突检测" className="rounded border border-border bg-surface p-4">
          <h2 className="type-emphasis">项目冲突检测</h2>
          <p className="type-caption mb-3">检测整个项目的有效依赖图，与列表筛选无关。</p>
          {!detected ? (
            <p>尚未检测</p>
          ) : (
            <>
              {conflicts.isFetching ? (
                <p>
                  <Spinner size="sm" /> 检测中…
                </p>
              ) : null}
              {conflicts.isError ? (
                <div role="alert" className="text-danger">
                  检测失败{conflicts.data ? "，上次结果可能已过期" : ""}：
                  {toUserMessage(conflicts.error)}
                  <Button size="sm" variant="ghost" onPress={() => void conflicts.refetch()}>
                    重试检测
                  </Button>
                </div>
              ) : null}
              {conflicts.data ? (
                <>
                  {!conflicts.data.length ? (
                    <p>检测完成，未发现循环依赖</p>
                  ) : (
                    <>
                      <p>发现 {conflicts.data.length} 条冲突依赖</p>
                      <ul className="mt-3 space-y-3">
                        {conflicts.data.map((conflict) => (
                          <li
                            key={conflict.dependencyId}
                            className="rounded border border-danger/30 p-3"
                          >
                            <span className="text-sm text-danger">{conflict.type}</span>
                            <h3>{conflict.title}</h3>
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {conflict.description}
                            </p>
                            <p className="type-caption">依赖 #{conflict.dependencyId}</p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : null}
            </>
          )}
        </aside>
      </div>
      {formOpen ? (
        <TaskDependencyFormDialog
          key={formSession}
          projectId={projectId}
          onClose={() => setFormOpen(false)}
          onCreated={successful}
        />
      ) : null}
      <AppModal
        open={!!confirm}
        title={confirm?.kind === "batch" ? "确认批量删除" : "确认删除依赖"}
        onClose={() => {
          if (!deleteLock.current) setConfirm(null);
        }}
        size="md"
        isDismissDisabled={deleteBusy}
      >
        <p>
          {confirm?.kind === "batch"
            ? `确定批量删除选中的 ${confirm.ids.length} 条依赖关系？这些记录将从列表移除。`
            : "删除会作废此依赖，保留记录，并停止作为有效约束。是否继续？"}
        </p>
        <ul className="my-3 space-y-1">
          {confirm?.rows.map((row) => (
            <li key={row.id}>
              #{row.id} {dependencyTaskLabel(row.predecessorId, names)} →{" "}
              {dependencyTaskLabel(row.successorId, names)}
            </li>
          ))}
        </ul>
        {deleteError ? (
          <p role="alert" className="text-danger">
            {deleteError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" isDisabled={deleteBusy} onPress={() => setConfirm(null)}>
            取消
          </Button>
          {needsVerification ? (
            <Button variant="primary" isDisabled={deleteBusy} onPress={() => void verifyDelete()}>
              刷新核实
            </Button>
          ) : (
            <Button variant="danger" isDisabled={deleteBusy} onPress={() => void deleteConfirmed()}>
              {deleteBusy ? <Spinner size="sm" /> : null}确认删除
            </Button>
          )}
        </div>
      </AppModal>
    </div>
  );
}
