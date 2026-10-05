/**
 * Backlog 任务规划弹窗（P3：p3-backlog 未规划任务池与 Sprint 规划）。
 *
 * 流程：POST /task/v1/updateTask，载荷 { id, sprintId }（见 useUpdateTaskSprint）。
 * 后端实读语义：
 * - 目标冲刺必须同项目、有效、状态为 PLANNING/ACTIVE
 *   （TaskServiceImpl.validateMountTarget）；其它状态后端报业务码，
 *   这里只提供可挂载冲刺（useMountableSprints）供选择。
 * - @JsonAnySetter 拒绝未知字段，载荷只带 id 与 sprintId。
 *
 * 表单 UX 约定（用户硬性要求）：目标冲刺必填 → dirty check
 * （useUnsavedChangesGuard）+ RequiredMark + 字段级 FieldError
 * （提交时未选报"请选择目标冲刺"；选项变化即清除错误）；
 * 提交期间（isPending）不允许关闭；成功后先 markClean() 再关闭。
 * 父组件按任务 id key 重挂载本弹窗。
 */
import { useRef, useState } from "react";
import { Button, Label, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  filterMountableSprints,
  sortMountableSprints,
  toUserMessage,
  useProjectAllSprints,
  useUpdateTaskSprint,
} from "@/lib/query";
import type { TaskResponse } from "@/lib/api/task-types";
import type { SprintResponse } from "@/lib/api/sprint-types";
import { sprintStatusLabel } from "@/lib/sprint-form";

export function BacklogPlanDialog({
  open,
  projectId,
  task,
  onClose,
}: {
  open: boolean;
  projectId: number;
  task: TaskResponse;
  onClose: () => void;
}) {
  const planMutation = useUpdateTaskSprint();
  const isPending = planMutation.isPending;

  const [targetSprintId, setTargetSprintId] = useState("");
  const [targetError, setTargetError] = useState("");
  const [submitError, setSubmitError] = useState("");

  // 可挂载冲刺（同项目、有效、规划中/进行中）；提交前按 id 复核，防止
  // 弹窗打开期间冲刺状态变化导致后端拒绝。
  const allSprintsQuery = useProjectAllSprints({ projectId });
  const mountableTargets = sortMountableSprints(
    filterMountableSprints(allSprintsQuery.data ?? []),
  );

  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = "";
  const isDirty = targetSprintId !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const doClose = () => {
    setTargetSprintId("");
    setTargetError("");
    setSubmitError("");
    onClose();
  };

  const close = () => {
    if (isPending) return;
    guard(doClose);
  };

  const handleSubmit = () => {
    if (isPending) return;
    setSubmitError("");
    if (!targetSprintId) {
      setTargetError("请选择目标冲刺");
      return;
    }
    const targetId = Number(targetSprintId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      setTargetError("目标冲刺选择无效，请重新选择");
      return;
    }
    // 提交前按最新数据复核：目标冲刺若已不在可挂载名单（状态变化/被删），
    // 不发送后端必拒绝的请求，直接提示用户重新选择。
    const target: SprintResponse | undefined = mountableTargets.find((item) => item.id === targetId);
    if (!target) {
      setTargetError("目标冲刺状态已变化，请重新选择");
      return;
    }
    planMutation.mutate(
      { id: task.id, sprintId: targetId },
      {
        onSuccess: () => {
          toast.success(`任务「${task.title}」已规划到冲刺「${target.sprintName}」`);
          // 成功 = 已授权离开：同步置位，避免守卫拦截自己的关闭
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`规划失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const targetOptions = mountableTargets.map((item) => ({
    id: String(item.id),
    label: `#${item.id} ${item.sprintName}（${sprintStatusLabel(item.status, item.statusLabel)}）`,
  }));

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户
          作答的路由拦截，否则那次导航会永远挂起。 */}
      {blocker}
      <AppModal
        open={open}
        title={`规划任务「${task.title}」`}
        onClose={close}
        size="sm"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-caption text-default-500">
            将任务挂载到目标冲刺。仅列出同项目、可挂载的冲刺（规划中/进行中）；
            目标冲刺无效或状态不符时后端会拒绝，错误会如实展示。
          </p>
          {allSprintsQuery.isPending ? (
            <div className="flex items-center gap-2 py-2 text-sm text-default-500">
              <Spinner size="sm" />
              正在加载可挂载的冲刺…
            </div>
          ) : allSprintsQuery.isError ? (
            // 冲刺查询失败：弹窗内错误态 + 重试（保留已选草稿）。
            // targetSprintId 在 state 里，refetch 不清空；不关闭弹窗，
            // dirty 确认守卫不受影响。
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-sm text-danger">
                可挂载冲刺加载失败：{toUserMessage(allSprintsQuery.error)}
              </p>
              <Button
                variant="ghost"
                onPress={() => void allSprintsQuery.refetch()}
              >
                重试
              </Button>
            </div>
          ) : mountableTargets.length === 0 ? (
            <p role="alert" className="text-sm text-warning-600">
              当前项目没有可挂载的冲刺（规划中/进行中），请先新建冲刺。
            </p>
          ) : (
            <div>
              <Label className="mb-1 block">
                目标冲刺<RequiredMark />
              </Label>
              <OptionSelect
                label="目标冲刺（必填）"
                value={targetSprintId}
                options={targetOptions}
                onChange={(value) => {
                  setTargetSprintId(value);
                  setTargetError("");
                  setSubmitError("");
                }}
                isDisabled={isPending}
              />
              <FieldError message={targetError} />
            </div>
          )}
          {submitError ? (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button
              variant="primary"
              onPress={handleSubmit}
              isDisabled={
                isPending ||
                allSprintsQuery.isPending ||
                allSprintsQuery.isError ||
                mountableTargets.length === 0
              }
            >
              {isPending ? <Spinner size="sm" /> : null}
              规划到冲刺
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
