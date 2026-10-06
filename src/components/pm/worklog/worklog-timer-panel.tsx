import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  useCompleteWork,
  usePauseWork,
  useStartWork,
  useTaskDetail,
  useWorkLogDetail,
  toUserMessage,
} from "@/lib/query";
import { newWorkLogDraft, parseWorkLogId, validateWorkLog } from "@/lib/worklog-form";
import { referenceElapsed, workLogActions } from "@/lib/worklog-timer";
import {
  GuardedWorkLogDialog,
  WorkLogBusinessFields,
  WorkLogField,
  type WorkLogLeaveHandle,
} from "./worklog-form-dialog";
export const WorkLogStartDialog = forwardRef<
  WorkLogLeaveHandle,
  { open: boolean; projectId: number; onClose: () => void; onStarted: (id: number) => void }
>(function WorkLogStartDialog({ open, projectId, onClose, onStarted }, ref) {
  const user = useAuthStore((s) => s.user);
  const auth = useAuthStore((s) => s.isAuthenticated);
  const userId = parseWorkLogId(user?.userId);
  const start = useStartWork();
  const [taskId, setTaskId] = useState<number | null>(null);
  const task = useTaskDetail(auth && open ? taskId : null);
  useEffect(() => {
    if (!open) setTaskId(null);
  }, [open]);
  return (
    <GuardedWorkLogDialog
      ref={ref}
      open={open}
      title="开始计时"
      initial={{ taskId: "", workDescription: "", workType: newWorkLogDraft().workType }}
      onClose={onClose}
      submitLabel="开始计时"
      submitDisabled={!userId}
      context={
        <>
          <WorkLogField
            name="userId"
            label="当前计时人"
            error={!userId ? "当前登录身份无效，请重新登录" : undefined}
          >
            <p>{userId ?? "—"}</p>
          </WorkLogField>
          <p>开始计时会新建独立记录。既有登记记录暂不可开始计时。</p>
          {taskId && task.data?.id === taskId && task.data.projectId === projectId ? (
            <p>任务归属已确认</p>
          ) : taskId ? (
            <p>正在确认任务归属…</p>
          ) : null}
          {task.isError ? (
            <p role="alert">
              任务归属读取失败：{toUserMessage(task.error)}
              <Button onPress={() => void task.refetch()}>重试任务归属</Button>
            </p>
          ) : null}
        </>
      }
      validate={(draft) =>
        validateWorkLog(draft, {
          projectId,
          taskProjectId:
            task.data?.id === parseWorkLogId(draft.taskId) ? task.data.projectId : undefined,
          timer: true,
        })
      }
      save={async (draft) => {
        const id = await start.mutateAsync({
          taskId: parseWorkLogId(draft.taskId)!,
          workDescription: String(draft.workDescription).trim(),
          workType: String(draft.workType),
        });
        onStarted(id);
      }}
      renderFields={(draft, edit, errors, pending) => (
        <WorkLogBusinessFields
          timer
          projectId={projectId}
          draft={draft}
          errors={errors}
          pending={pending}
          edit={(field, value) => {
            edit(field, value);
            if (field === "taskId") setTaskId(parseWorkLogId(value));
          }}
        />
      )}
    />
  );
});
export function WorkLogTimerPanel({
  id,
  projectId,
  disabled,
  onBusy,
}: {
  id: number | null;
  projectId: number;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const detail = useWorkLogDetail(id);
  const pause = usePauseWork(projectId);
  const complete = useCompleteWork(projectId);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const shouldBlockBusy = useCallback(() => busy.current, []);
  useBlocker({ shouldBlockFn: shouldBlockBusy, enableBeforeUnload: shouldBlockBusy });
  const record = detail.data?.projectId === projectId ? detail.data : undefined;
  const ticking = !!record && referenceElapsed(record, now) !== null;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [id, ticking]);
  useEffect(() => {
    setError("");
  }, [id]);
  const act = async (action: "pause" | "complete") => {
    if (busy.current || disabled || !id || !record) return;
    busy.current = true;
    setPending(true);
    onBusy(true);
    setError("");
    try {
      await (action === "pause" ? pause : complete).mutateAsync(id);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      busy.current = false;
      setPending(false);
      onBusy(false);
    }
  };
  if (!id) return null;
  const actions = record ? workLogActions(record) : null;
  const elapsed = record ? referenceElapsed(record, now) : null;
  return (
    <section className="rounded border border-border p-4" aria-label="工时详情与计时">
      <h2>工时记录 #{id}</h2>
      {detail.isLoading ? <p>正在加载详情…</p> : null}
      {detail.isError ? (
        <p role="alert">
          {record ? "详情刷新失败：" : "详情加载失败："}
          {toUserMessage(detail.error)}
          <Button isDisabled={pending} onPress={() => void detail.refetch()}>
            重试详情
          </Button>
        </p>
      ) : null}
      {record ? (
        <>
          <p>
            {record.workDescription ?? "—"} · {record.status ?? "—"} · 已用工时{" "}
            {record.hoursSpent ?? "—"}
          </p>
          {elapsed !== null ? <p>参考计时：{elapsed} 秒（按本地时间解释，不作为结算值）</p> : null}
          <p>完成工时按开始至结束计算，包含暂停时段。</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {(
              [
                "projectId",
                "sprintId",
                "taskId",
                "userId",
                "workDate",
                "startTime",
                "endTime",
                "remainingHours",
                "progressPercentage",
                "tags",
                "approverId",
                "approvalComment",
                "approvalTime",
                "billingRate",
              ] as const
            ).map((field, i) => (
              <div key={field}>
                <dt>
                  {
                    [
                      "项目 ID",
                      "冲刺 ID",
                      "任务 ID",
                      "提交人 ID",
                      "工作日期",
                      "开始时间",
                      "结束时间",
                      "剩余估算",
                      "进度",
                      "标签",
                      "审批人 ID",
                      "审批意见",
                      "审批时间",
                      "费率",
                    ][i]
                  }
                </dt>
                <dd>{record[field] ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {actions?.pause ? (
            <Button isDisabled={disabled || pending} onPress={() => void act("pause")}>
              暂停
            </Button>
          ) : null}
          {actions?.complete ? (
            <Button isDisabled={disabled || pending} onPress={() => void act("complete")}>
              完成
            </Button>
          ) : null}
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
