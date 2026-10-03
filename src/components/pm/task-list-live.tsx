/**
 * 任务列表（P1：p1-task-list）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /task/v1/findByPage（bean.projectId 必传），分页 page/pageSize
 * - 筛选：标题（文本）/ 类型（文本，taskType 为自由字符串）/ 优先级 / 状态 / 执行人（用户 ID 数字）
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 *
 * 任务类型/优先级/状态没有后端选项接口：优先级与状态走前端契约常量
 * （TASK_PRIORITIES/TASK_STATUSES，与后端枚举 JSON identity 一致），
 * 中文标签走 domain 的 statusLabel('task', …)/priorityLabel。
 * 任务详情路由在 p1-task-detail 接入，届时标题将改为可跳转链接。
 *
 * 未登录走演示列表（ListView）时不使用本组件。
 */
import { useMemo, useState } from "react";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { EmptyHint, OptionSelect, PageHeading, PriorityMark, StatusChip } from "@/components/biz";
import { priorityLabel, statusLabel } from "@/lib/pm/domain";
import { toUserMessage, useTaskList } from "@/lib/query";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/api/task-types";
import type { TaskPriority, TaskQueryRequest, TaskStatus } from "@/lib/api/task-types";

const PAGE_SIZE = 20;

const PRIORITY_OPTIONS = [{ id: "", label: "全部" }, ...TASK_PRIORITIES.map((priority) => ({ id: priority, label: priorityLabel(priority) }))];
const STATUS_OPTIONS = [{ id: "", label: "全部" }, ...TASK_STATUSES.map((status) => ({ id: status, label: statusLabel("task", status) }))];

export function TaskListLive({ projectId }: { projectId: number }) {
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [taskTypeInput, setTaskTypeInput] = useState("");
  const [appliedTaskType, setAppliedTaskType] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [appliedAssignee, setAppliedAssignee] = useState("");
  const [page, setPage] = useState(1);

  const bean = useMemo<TaskQueryRequest>(() => {
    const value: TaskQueryRequest = { projectId };
    const title = appliedTitle.trim();
    if (title) value.title = title;
    const taskType = appliedTaskType.trim();
    if (taskType) value.taskType = taskType;
    if (priority) value.priority = priority as TaskPriority;
    if (status) value.status = status as TaskStatus;
    const assignee = appliedAssignee.trim();
    // 执行人筛选：只接受纯数字的用户 ID，非数字输入直接忽略，避免误送后端
    if (/^\d+$/.test(assignee)) value.assigneeId = Number(assignee);
    return value;
  }, [projectId, appliedTitle, appliedTaskType, priority, status, appliedAssignee]);

  const listQuery = useTaskList({ page, pageSize: PAGE_SIZE, bean, projectId });

  const applyFilters = () => {
    setAppliedTitle(titleInput);
    setAppliedTaskType(taskTypeInput);
    setAppliedAssignee(assigneeInput);
    setPage(1);
  };

  const resetFilters = () => {
    setTitleInput("");
    setAppliedTitle("");
    setTaskTypeInput("");
    setAppliedTaskType("");
    setPriority("");
    setStatus("");
    setAssigneeInput("");
    setAppliedAssignee("");
    setPage(1);
  };

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="任务" hint="真实后端数据（POST /task/v1/findByPage）。按标题、类型、优先级、状态、执行人筛选。" />

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
        <div className="w-36">
          <TextField value={taskTypeInput} onChange={setTaskTypeInput} aria-label="任务类型">
            <Input placeholder="任务类型" />
          </TextField>
        </div>
        <div className="w-32">
          <OptionSelect label="优先级" value={priority} options={PRIORITY_OPTIONS} onChange={(next) => { setPriority(next); setPage(1); }} />
        </div>
        <div className="w-36">
          <OptionSelect label="状态" value={status} options={STATUS_OPTIONS} onChange={(next) => { setStatus(next); setPage(1); }} />
        </div>
        <div className="w-36">
          <TextField value={assigneeInput} onChange={setAssigneeInput} aria-label="执行人用户 ID">
            <Input placeholder="执行人用户 ID" inputMode="numeric" />
          </TextField>
        </div>
        <Button type="submit" variant="primary">
          搜索
        </Button>
        <Button variant="ghost" onPress={resetFilters}>
          重置
        </Button>
      </form>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载任务…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">任务列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) === 0 ? (
        <EmptyHint>没有符合筛选条件的任务。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && (listQuery.data?.list.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {listQuery.data!.list.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="type-body min-w-0 flex-1 truncate" title={item.title}>
                {item.title}
              </span>
              {item.taskType ? (
                <span className="type-caption hidden shrink-0 sm:inline">{item.taskType}</span>
              ) : null}
              <span className="hidden shrink-0 sm:inline-flex">
                <PriorityMark priority={item.priority} />
              </span>
              {item.storyPoints != null ? (
                <span className="type-caption hidden shrink-0 sm:inline">{item.storyPoints} 点</span>
              ) : null}
              <StatusChip kind="task" status={item.status} />
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
