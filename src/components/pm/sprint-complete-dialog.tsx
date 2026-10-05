/**
 * 完成冲刺弹窗（P3：p3-sprint-list 冲刺列表与生命周期管理）。
 *
 * 流程：POST /sprint/v1/complete/{id}，请求体 {disposition, targetSprintId?}。
 * 后端（SprintCompleteRequest.java）规定：disposition 必填
 * （BACKEND 返回"未完成任务去向必填"校验），TARGET_SPRINT 时 targetSprintId
 * 必填且"必须同项目、有效、处于规划中"。
 *
 * 老前端 SprintList.vue 的完成冲刺固定 disposition=BACKLOG（api 层注释明确
 * 标记"待 UI 提供去向选择"，TARGET_SPRINT 分支 UI 从未触发）；此处补齐：
 * - 去向单选：移回待办（BACKLOG）/ 移入目标冲刺（TARGET_SPRINT）
 * - 选 TARGET_SPRINT 时必须从"同项目规划中"的冲刺里选一个目标
 *   （usePlanningSprints，bean status='PLANNING' 服务端过滤；排除当前冲刺；
 *   无可选目标时完成按钮禁用并提示）
 *
 * 表单 UX 约定（用户硬性要求）：去向+目标都是表单字段，套用 dirty check
 * （useUnsavedChangesGuard）、目标必填时 RequiredMark + 字段级 FieldError
 * （提交时未选报"请选择目标冲刺"），选项变化即清除错误。
 *
 * 父组件按记录 key 重挂载本弹窗；提交期间（isPending）不允许关闭；
 * 成功后先 markClean() 再程序化关闭，避免卸载时仍脏的待决导航被取消。
 */
import { useRef, useState } from "react";
import { Button, Label, Radio, RadioGroup, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { toUserMessage, useCompleteSprint, usePlanningSprints } from "@/lib/query";
import type { SprintCompletionDisposition, SprintResponse } from "@/lib/api/sprint-types";

const DISPOSITION_OPTIONS: { id: SprintCompletionDisposition; label: string; hint: string }[] = [
  { id: "BACKLOG", label: "移回待办", hint: "未完成的任务回到项目待办池" },
  { id: "TARGET_SPRINT", label: "移入目标冲刺", hint: "未完成的任务转入另一个规划中的冲刺" },
];

export function SprintCompleteDialog({
  open,
  projectId,
  sprint,
  onClose,
}: {
  open: boolean;
  projectId: number;
  sprint: SprintResponse;
  onClose: () => void;
}) {
  const completeSprint = useCompleteSprint();
  const isPending = completeSprint.isPending;

  const [disposition, setDisposition] = useState<SprintCompletionDisposition>("BACKLOG");
  const [targetSprintId, setTargetSprintId] = useState("");
  const [targetError, setTargetError] = useState("");
  const [submitError, setSubmitError] = useState("");

  // 同项目规划中冲刺（不含当前冲刺）；排除当前后若无可选目标，
  // TARGET_SPRINT 选项不可用且完成按钮禁用
  const planningQuery = usePlanningSprints({ projectId });
  const planningTargets = (planningQuery.data ?? []).filter((item) => item.id !== sprint.id);

  const initialRef = useRef<{ disposition: SprintCompletionDisposition; targetSprintId: string } | null>(null);
  if (initialRef.current === null) {
    initialRef.current = { disposition: "BACKLOG", targetSprintId: "" };
  }
  const isDirty =
    disposition !== initialRef.current.disposition ||
    targetSprintId !== initialRef.current.targetSprintId;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const doClose = () => {
    setDisposition("BACKLOG");
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
    // disposition=TARGET_SPRINT 时目标冲刺必填（后端同样校验，但前端先拦）
    if (disposition === "TARGET_SPRINT") {
      if (!targetSprintId) {
        setTargetError("请选择目标冲刺");
        return;
      }
      const targetId = Number(targetSprintId);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        setTargetError("目标冲刺选择无效，请重新选择");
        return;
      }
    }
    completeSprint.mutate(
      {
        id: sprint.id,
        data: {
          disposition,
          // BACKLOG 时 targetSprintId 省略（后端仅 TARGET_SPRINT 时要求）
          ...(disposition === "TARGET_SPRINT"
            ? { targetSprintId: Number(targetSprintId) }
            : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(`冲刺「${sprint.sprintName}」已完成`);
          // 成功 = 已授权离开：同步置位 cleanRef，避免守卫拦截自己的关闭
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`完成失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const targetOptions = planningTargets.map((item) => ({
    id: String(item.id),
    label: `#${item.id} ${item.sprintName}`,
  }));

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户
          作答的路由拦截，否则那次导航会永远挂起。 */}
      {blocker}
      <AppModal
        open={open}
        title={`完成冲刺「${sprint.sprintName}」`}
        onClose={close}
        size="sm"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <p className="type-caption text-default-500">
            冲刺完成后状态不可逆。未完成的任务按所选去向处理。
          </p>
          <div>
            <Label className="mb-1 block">
              未完成任务去向<RequiredMark />
            </Label>
            <RadioGroup
              aria-label="未完成任务去向（必填）"
              value={disposition}
              onChange={(value) => {
                setDisposition(value as SprintCompletionDisposition);
                setTargetError("");
                setSubmitError("");
              }}
              isDisabled={isPending}
            >
              {DISPOSITION_OPTIONS.map((option) => (
                <Radio key={option.id} value={option.id}>
                  {option.label}
                  <span className="type-caption block text-default-500">{option.hint}</span>
                </Radio>
              ))}
            </RadioGroup>
          </div>
          {disposition === "TARGET_SPRINT" ? (
            <div>
              {planningQuery.isPending ? (
                <div className="flex items-center gap-2 py-2 text-sm text-default-500">
                  <Spinner size="sm" />
                  正在加载规划中的冲刺…
                </div>
              ) : planningQuery.isError ? (
                <p role="alert" className="text-sm text-danger">
                  规划中冲刺加载失败：{toUserMessage(planningQuery.error)}
                </p>
              ) : planningTargets.length === 0 ? (
                <p role="alert" className="text-sm text-warning-600">
                  当前项目没有其它规划中的冲刺，无法选择目标冲刺。请先新建冲刺或改选"移回待办"。
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
            </div>
          ) : null}
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
                (disposition === "TARGET_SPRINT" && planningTargets.length === 0)
              }
            >
              {isPending ? <Spinner size="sm" /> : null}
              完成冲刺
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
