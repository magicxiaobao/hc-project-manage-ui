/**
 * Backlog 未规划任务池与 Sprint 规划（P3：p3-backlog）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 未规划任务池：POST /task/v1/findByPage 全页循环（useProjectAllTasks，
 *   bean 仅 projectId），前端按 sprintId == null 过滤
 *   （filterBacklogTasks；后端 findByPage 无法表达 "sprint_id IS NULL"，
 *   实读 TaskRepository.xml 确认，hint 如实标注此口径）。
 * - 规划：行内"规划到冲刺" → BacklogPlanDialog
 *   （POST /task/v1/updateTask {id, sprintId}）；目标仅列出可挂载冲刺
 *   （规划中/进行中；后端守卫 TaskServiceImpl.validateMountTarget）。
 * - 移回待办：已规划分组内"移回待办"二次确认 → updateTask
 *   {id, sprintId: null}（后端 Schema 注解"清空表示移回待办"）。
 * - 状态：加载 / 错误 / 空 / 分组列表。
 *   错误分两种：首次任务请求失败且无成功数据 → 全页错误态 + 重试，
 *   绝不回退 [] 渲染"成功空态"；曾经成功后后台重取失败 → 横幅 + 重试，
 *   保留已挂载内容，脏表单不卸载。
 * - 弹窗按任务 id key 重挂载，渲染在数据状态分支之外：后台重取失败切错误
 *   横幅时不卸载脏表单（沿用 testcase-list-live 的 P2 经验）。
 */
import { useMemo, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  PageHeading,
  PriorityMark,
  StateChip,
  StatusChip,
} from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import { sprintStatusLabel, type SprintStatus } from "@/lib/sprint-form";
import {
  filterBacklogTasks,
  isTasksFatalError,
  toUserMessage,
  useProjectAllSprints,
  useProjectAllTasks,
  useUpdateTaskSprint,
} from "@/lib/query";
import type { TaskResponse } from "@/lib/api/task-types";
import type { SprintResponse } from "@/lib/api/sprint-types";
import { BacklogPlanDialog } from "@/components/pm/backlog-plan-dialog";

const SPRINT_TONES: Record<SprintStatus, StateTone> = {
  PLANNING: "neutral",
  ACTIVE: "progress",
  COMPLETED: "done",
  CANCELLED: "danger",
};

function sprintToneOf(status: string): StateTone {
  return (SPRINT_TONES as Record<string, StateTone>)[status] ?? "neutral";
}

function storyPointsSum(tasks: TaskResponse[]): number {
  return tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
}

function TaskRow({
  task,
  projectKey,
  action,
}: {
  task: TaskResponse;
  projectKey: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
      <span className="type-caption shrink-0 text-default-400">#{task.id}</span>
      <Link
        to="/p/$projectKey/issues/$taskId"
        params={{ projectKey, taskId: String(task.id) }}
        className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
        title={task.title}
      >
        {task.title}
      </Link>
      {task.taskType ? (
        <span className="type-caption hidden shrink-0 sm:inline">{task.taskType}</span>
      ) : null}
      <span className="hidden shrink-0 sm:inline-flex">
        <PriorityMark priority={task.priority} />
      </span>
      {task.storyPoints != null ? (
        <span className="type-caption hidden shrink-0 sm:inline">{task.storyPoints} 点</span>
      ) : null}
      <span className="hidden shrink-0 sm:inline">
        <StatusChip kind="task" status={task.status} />
      </span>
      <span className="flex shrink-0 gap-1">{action}</span>
    </div>
  );
}

export function BacklogLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const tasksQuery = useProjectAllTasks({ projectId });
  const sprintsQuery = useProjectAllSprints({ projectId });
  const unassignMutation = useUpdateTaskSprint();

  // 规划弹窗目标：打开瞬间捕获记录快照，弹窗生命周期不依赖实时列表；
  // 否则规划期间后台重取导致记录变化，脏表单会被直接卸载而无"是否放弃修改"提示。
  const [planTarget, setPlanTarget] = useState<TaskResponse | null>(null);
  const [unassignTarget, setUnassignTarget] = useState<TaskResponse | null>(null);

  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const backlogTasks = useMemo(() => filterBacklogTasks(allTasks), [allTasks]);
  const plannedTasks = useMemo(() => allTasks.filter((task) => task.sprintId != null), [allTasks]);

  const sprintById = useMemo(() => {
    const map = new Map<number, SprintResponse>();
    for (const sprint of sprintsQuery.data ?? []) map.set(sprint.id, sprint);
    return map;
  }, [sprintsQuery.data]);

  const plannedGroups = useMemo(() => {
    const map = new Map<number, TaskResponse[]>();
    for (const task of plannedTasks) {
      const sprintId = task.sprintId as number;
      const group = map.get(sprintId);
      if (group) group.push(task);
      else map.set(sprintId, [task]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [plannedTasks]);

  const handleUnassignConfirm = () => {
    if (unassignTarget === null || unassignMutation.isPending) return;
    const target = unassignTarget;
    setUnassignTarget(null);
    unassignMutation.mutate(
      { id: target.id, sprintId: null },
      {
        onSuccess: () => {
          toast.success(`任务「${target.title}」已移回待办池`);
        },
        onError: (error) => {
          toast.error(`移回待办失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const isLoading = tasksQuery.isPending || sprintsQuery.isPending;
  // 首次任务请求失败且从未成功（tasksQuery.data === undefined）：绝不能回退 []
  // 渲染"成功空态"（"0 个任务""所有任务都已挂载到冲刺"），走全页错误态 + 重试。
  // 曾经成功过（哪怕返回的是空数组）再后台重取失败时，走下面的横幅错误态。
  // run198-codex-P3-r22-1：不能用 `(data ?? []).length === 0` 判断"从未成功"，
  // React Query 后台重取失败会保留 data=[] 且 isError=true，会误判。
  const tasksFatalError = isTasksFatalError(tasksQuery);
  const loadError = tasksFatalError
    ? null
    : tasksQuery.isError
      ? tasksQuery.error
      : sprintsQuery.isError
        ? sprintsQuery.error
        : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="待办"
        hint="真实后端数据。未规划池 = 未挂载任何冲刺的任务：后端 findByPage 无法直接按「无冲刺」过滤（sprint_id IS NULL 无服务端条件），页面为项目任务全量拉取后前端过滤。规划仅允许挂载到「规划中/进行中」的冲刺（后端 TaskServiceImpl.validateMountTarget 守卫）。计划变动经 POST /task/v1/updateTask 落库。"
      />

      {isLoading && allTasks.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载任务与冲刺…
        </div>
      ) : null}

      {/* 后台重取失败：横幅 + 重试，保留已挂载列表与弹窗，脏表单不卸载 */}
      {loadError ? (
        <div className="flex items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2">
          <p className="type-body flex-1 text-danger">
            数据加载失败（后台刷新）：{toUserMessage(loadError)}。当前展示上次成功的数据。
          </p>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              void tasksQuery.refetch();
              void sprintsQuery.refetch();
            }}
          >
            重试
          </Button>
        </div>
      ) : null}

      {/* 首次任务请求失败（无成功数据）：全页错误态 + 重试入口，
          不渲染列表/空态，避免把"从未成功"展示成"成功空态" */}
      {tasksFatalError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">
            任务加载失败：{toUserMessage(tasksQuery.error)}
          </p>
          <Button variant="ghost" onPress={() => void tasksQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {!tasksFatalError && (!isLoading || allTasks.length > 0) ? (
        <>
          <section aria-label="未规划任务池">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="type-body font-semibold">
                未规划任务池
                <span className="type-caption ml-2 text-default-500">
                  {backlogTasks.length} 个任务 · {storyPointsSum(backlogTasks)} 点
                </span>
              </h2>
            </div>
            {backlogTasks.length === 0 ? (
              <EmptyHint>没有未规划的任务。所有任务都已挂载到冲刺。</EmptyHint>
            ) : (
              <div className="overflow-hidden rounded-sm border border-border bg-surface">
                {backlogTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectKey={projectKey}
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setPlanTarget(task)}
                        isDisabled={unassignMutation.isPending}
                        aria-label={`规划任务 ${task.id} 到冲刺`}
                      >
                        规划到冲刺
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-label="已规划任务">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="type-body font-semibold">
                已规划任务
                <span className="type-caption ml-2 text-default-500">
                  {plannedTasks.length} 个任务 · {storyPointsSum(plannedTasks)} 点
                </span>
              </h2>
            </div>
            {plannedGroups.length === 0 ? (
              <EmptyHint>暂无已规划到冲刺的任务。</EmptyHint>
            ) : (
              <div className="flex flex-col gap-3">
                {plannedGroups.map(([sprintId, group]) => {
                  const sprint = sprintById.get(sprintId);
                  return (
                    <div
                      key={sprintId}
                      className="overflow-hidden rounded-sm border border-border bg-surface"
                    >
                      <div className="flex items-center gap-2 border-b border-border bg-default/5 px-3 py-2">
                        <span className="type-body min-w-0 flex-1 truncate font-medium">
                          {sprint ? sprint.sprintName : `冲刺 #${sprintId}`}
                        </span>
                        {sprint ? (
                          <StateChip tone={sprintToneOf(sprint.status)}>
                            {sprintStatusLabel(sprint.status, sprint.statusLabel)}
                          </StateChip>
                        ) : null}
                        <span className="type-caption shrink-0 text-default-500">
                          {group.length} 个任务 · {storyPointsSum(group)} 点
                        </span>
                      </div>
                      {group.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          projectKey={projectKey}
                          action={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              onPress={() => setUnassignTarget(task)}
                              isDisabled={unassignMutation.isPending}
                              aria-label={`将任务 ${task.id} 移回待办池`}
                            >
                              移回待办
                            </Button>
                          }
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* 规划弹窗：按任务 id key 重挂载，渲染在数据状态分支之外，
          后台重取失败不卸载脏表单；AppModal 的 onClose 走 guard，
          干净时直接关闭，脏时弹"是否放弃修改"。 */}
      {planTarget ? (
        <BacklogPlanDialog
          key={`plan-${planTarget.id}`}
          open
          projectId={projectId}
          task={planTarget}
          onClose={() => setPlanTarget(null)}
        />
      ) : null}

      {/* 移回待办确认：非表单弹窗，无需 dirty check；
          走 POST /task/v1/updateTask {id, sprintId: null}，
          后端"清空表示移回待办"，同事务重算冲刺故事点 */}
      <AppModal
        open={unassignTarget !== null}
        title="移回待办"
        onClose={() => setUnassignTarget(null)}
        size="sm"
      >
        <p className="type-body">
          确定将任务「{unassignTarget?.title}」（#{unassignTarget?.id}）移回待办池吗？
          该任务将不再属于任何冲刺。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setUnassignTarget(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            onPress={handleUnassignConfirm}
            isDisabled={unassignMutation.isPending}
          >
            {unassignMutation.isPending ? <Spinner size="sm" /> : null}
            移回待办
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
