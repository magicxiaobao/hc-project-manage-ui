import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { AppModal } from "@/components/biz/app-modal";
import { FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz/form-guard";
import { OptionSelect } from "@/components/biz/option-select";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  useCreateWorkLog,
  useUpdateWorkLog,
  useWorkLogDetail,
  useTaskDetail,
  toUserMessage,
} from "@/lib/query";
import {
  createWorkLogPayload,
  newWorkLogDraft,
  parseWorkLogId,
  updateWorkLogPayload,
  validateWorkLog,
  workLogDirty,
  workLogSnapshot,
  workTypes,
  workLocations,
  type WorkLogDraft,
  type WorkLogError,
} from "@/lib/worklog-form";
import type { WorkLogResponse } from "@/lib/api/worklog-types";
import { WorkLogTaskPicker, workLogInputClass } from "./worklog-list-controls";
export interface WorkLogLeaveHandle {
  requestLeave: (action: () => void) => void;
}
export type EditWorkLogField = (field: string, value: string | boolean | null) => void;
export const GuardedWorkLogDialog = forwardRef<
  WorkLogLeaveHandle,
  {
    open: boolean;
    title: string;
    initial: WorkLogDraft | null;
    onClose: () => void;
    validate: (draft: WorkLogDraft) => WorkLogError[];
    save?: (draft: WorkLogDraft, snapshot: WorkLogDraft) => Promise<unknown>;
    renderFields: (
      draft: WorkLogDraft,
      edit: EditWorkLogField,
      errors: Record<string, string>,
      pending: boolean,
    ) => ReactNode;
    context?: ReactNode;
    submitLabel?: string;
    submitDisabled?: boolean;
  }
>(function GuardedWorkLogDialog(
  {
    open,
    title,
    initial,
    onClose,
    validate,
    save,
    renderFields,
    context,
    submitLabel = "保存",
    submitDisabled,
  },
  ref,
) {
  const [draft, setDraft] = useState<WorkLogDraft>({});
  const [snapshot, setSnapshot] = useState<WorkLogDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const initialized = useRef(false);
  const body = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      setSnapshot(null);
      setErrors({});
      setServerError("");
      return;
    }
    if (!initialized.current && initial) {
      initialized.current = true;
      setDraft({ ...initial });
      setSnapshot({ ...initial });
      setErrors({});
      setServerError("");
    }
  }, [open, initial]);
  const shouldBlockBusy = useCallback(() => busy.current, []);
  useBlocker({ shouldBlockFn: shouldBlockBusy, enableBeforeUnload: shouldBlockBusy });
  const { guard, markClean, dialog, blocker } = useUnsavedChangesGuard(
    open && !!snapshot && workLogDirty(draft, snapshot) && !pending,
  );
  const leave = (action: () => void) => {
    if (!busy.current) guard(action);
  };
  useImperativeHandle(ref, () => ({ requestLeave: leave }));
  const edit: EditWorkLogField = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (["startTime", "endTime", "workDate"].includes(field)) {
        delete next.startTime;
        delete next.endTime;
        delete next.workDate;
      }
      if (field === "taskId") delete next.projectId;
      return next;
    });
  };
  const submit = async () => {
    // 包括主动关闭和路由 blocker 的待决放弃确认；不得与写入并发。
    if (
      busy.current ||
      !snapshot ||
      submitDisabled ||
      dialog.props.open ||
      document.querySelector('[role="dialog"][aria-label="是否放弃修改？"]')
    )
      return;
    const all = validate(draft);
    setErrors(Object.fromEntries(all.map((e) => [e.field, e.message])));
    if (all.length) {
      const target = body.current?.querySelector<HTMLElement>(`[data-field="${all[0].field}"]`);
      (
        target?.querySelector<HTMLElement>("input,textarea,select,button,[tabindex]") ?? target
      )?.focus();
      return;
    }
    if (!save) return;
    busy.current = true;
    setPending(true);
    setServerError("");
    try {
      await save(draft, snapshot);
      markClean();
      setDraft({});
      setSnapshot(null);
      onClose();
    } catch (error) {
      setServerError(toUserMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <>
      {blocker}
      {dialog}
      <AppModal open={open} title={title} onClose={() => leave(onClose)} isDismissDisabled={pending}>
        <form
          ref={body}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
          aria-busy={pending}
        >
          {context}
          {snapshot ? (
            <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
              {renderFields(draft, edit, errors, pending)}
            </fieldset>
          ) : (
            <p>正在加载详情…</p>
          )}
          {serverError ? <p role="alert">{serverError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" isDisabled={pending} onPress={() => leave(onClose)}>
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              isDisabled={pending || !snapshot || submitDisabled}
            >
              {pending ? "提交中…" : submitLabel}
            </Button>
          </div>
        </form>
      </AppModal>
    </>
  );
});
export function WorkLogField({
  name,
  label,
  labelId,
  required,
  error,
  children,
}: {
  name: string;
  label: string;
  labelId?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div data-field={name}>
      <label
        id={labelId}
        htmlFor={labelId ? undefined : `worklog-${name}`}
        className="mb-1 block text-sm"
      >
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
      <div id={`worklog-${name}-error`}>
        <FieldError message={error} />
      </div>
    </div>
  );
}
export function WorkLogTextField({
  name,
  label,
  required,
  draft,
  edit,
  errors,
  type = "text",
}: {
  name: string;
  label: string;
  required?: boolean;
  draft: WorkLogDraft;
  edit: EditWorkLogField;
  errors: Record<string, string>;
  type?: string;
}) {
  const props = {
    id: `worklog-${name}`,
    name,
    className: workLogInputClass,
    value: String(draft[name] ?? ""),
    "aria-invalid": !!errors[name],
    "aria-describedby": `worklog-${name}-error`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      edit(name, e.target.value),
  };
  return (
    <WorkLogField name={name} label={label} required={required} error={errors[name]}>
      {name === "workDescription" || name === "comment" || name === "json" ? (
        <textarea {...props} rows={4} />
      ) : (
        <input {...props} type={type} />
      )}
    </WorkLogField>
  );
}
export function WorkLogBusinessFields({
  draft,
  edit,
  errors,
  pending,
  projectId,
  timer = false,
  editing = false,
}: {
  draft: WorkLogDraft;
  edit: EditWorkLogField;
  errors: Record<string, string>;
  pending: boolean;
  projectId: number;
  timer?: boolean;
  editing?: boolean;
}) {
  return (
    <>
      <WorkLogField
        name="taskId"
        label="关联任务"
        labelId={editing ? undefined : "worklog-taskId-label"}
        required
        error={errors.taskId}
      >
        {editing ? (
          <input
            id="worklog-taskId"
            className={workLogInputClass}
            value={String(draft.taskId ?? "")}
            disabled
            aria-invalid={!!errors.taskId}
            aria-describedby="worklog-taskId-error"
          />
        ) : (
          <WorkLogTaskPicker
            aria-labelledby="worklog-taskId-label"
            projectId={projectId}
            value={String(draft.taskId ?? "")}
            onChange={(id) => edit("taskId", id)}
            required
            disabled={pending}
          />
        )}
      </WorkLogField>
      <WorkLogTextField
        name="workDescription"
        label="工作描述"
        required
        draft={draft}
        edit={edit}
        errors={errors}
      />
      <WorkLogField
        name="workType"
        label="工作类型"
        labelId="worklog-workType-label"
        required
        error={errors.workType}
      >
        <OptionSelect
          aria-labelledby="worklog-workType-label"
          label="工作类型（必填）"
          value={String(draft.workType ?? "")}
          options={[...new Set([...workTypes, String(draft.workType ?? "")])]
            .filter(Boolean)
            .map((v) => ({ id: v, label: v }))}
          onChange={(v) => edit("workType", v)}
          isDisabled={pending}
        />
      </WorkLogField>
      {!timer ? (
        <>
          <WorkLogTextField
            name="hoursSpent"
            label="已用工时（小时）"
            required
            draft={draft}
            edit={edit}
            errors={errors}
          />
          <WorkLogTextField
            name="workDate"
            label="工作日期"
            required
            type="date"
            draft={draft}
            edit={edit}
            errors={errors}
          />
          {(
            [
              "startTime",
              "endTime",
              "remainingHours",
              "progressPercentage",
              "billingRate",
              "tags",
            ] as const
          ).map((name, i) => (
            <WorkLogTextField
              key={name}
              name={name}
              label={
                ["开始时间", "结束时间", "剩余工时", "进度百分比", "费率", "标签（逗号分隔）"][i]
              }
              type={i < 2 ? "datetime-local" : "text"}
              draft={draft}
              edit={edit}
              errors={errors}
            />
          ))}
          <WorkLogField
            name="workLocation"
            label="地点"
            labelId="worklog-workLocation-label"
            error={errors.workLocation}
          >
            <OptionSelect
              aria-labelledby="worklog-workLocation-label"
              label="地点"
              value={String(draft.workLocation ?? "")}
              options={[...new Set(["", ...workLocations, String(draft.workLocation ?? "")])].map(
                (v) => ({ id: v, label: v || "未设置" }),
              )}
              onChange={(v) => edit("workLocation", v)}
              isDisabled={pending}
            />
          </WorkLogField>
          {["isBillable", "isOvertime"].map((name, i) => (
            <WorkLogField
              key={name}
              name={name}
              label={i === 0 ? "计费" : "加班"}
              error={errors[name]}
            >
              <select
                id={`worklog-${name}`}
                className={workLogInputClass}
                value={draft[name] == null ? "" : String(draft[name])}
                onChange={(e) =>
                  edit(name, e.target.value === "" ? null : e.target.value === "true")
                }
              >
                <option value="">未设置</option>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </WorkLogField>
          ))}
        </>
      ) : null}
    </>
  );
}
export const WorkLogFormDialog = forwardRef<
  WorkLogLeaveHandle,
  {
    open: boolean;
    id?: number;
    projectId: number;
    onClose: () => void;
    onSaved?: (id: number) => void;
  }
>(function WorkLogFormDialog({ open, id, projectId, onClose, onSaved }, ref) {
  const detail = useWorkLogDetail(id, open);
  const create = useCreateWorkLog();
  const update = useUpdateWorkLog(projectId);
  const [record, setRecord] = useState<WorkLogResponse | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const auth = useAuthStore((s) => s.isAuthenticated);
  const task = useTaskDetail(auth && open ? taskId : null);
  useEffect(() => {
    if (!open) {
      setRecord(null);
      setTaskId(null);
    } else if (id && !detail.isFetching && detail.isSuccess && detail.data?.id === id && !record) {
      setRecord(detail.data);
      setTaskId(detail.data.taskId);
    }
  }, [open, id, detail.data, detail.isFetching, detail.isSuccess, record]);
  return (
    <GuardedWorkLogDialog
      ref={ref}
      open={open}
      title={id ? "编辑工时" : "登记工时"}
      initial={id ? (record ? workLogSnapshot(record) : null) : newWorkLogDraft()}
      onClose={onClose}
      context={
        <>
          {id && record ? (
            <p>
              项目 {record.projectId ?? "—"} · 冲刺 {record.sprintId ?? "—"} · 提交人{" "}
              {record.userId ?? "—"} · 状态 {record.status ?? "—"} · 审批{" "}
              {record.approvalStatus ?? "—"} · 审批人 {record.approverId ?? "—"} · 审批时间{" "}
              {record.approvalTime ?? "—"} · 审批意见 {record.approvalComment ?? "—"}
            </p>
          ) : null}
          <p>可选数字与时间留空保留原值。工作日期按本地今天校验。</p>
          {taskId && task.data?.id === taskId && task.data.projectId === projectId ? (
            <p>任务归属已确认</p>
          ) : taskId ? (
            <p>正在确认任务归属…</p>
          ) : null}
          {detail.isError && id ? (
            <p role="alert">
              {record ? "详情刷新失败：" : "详情读取失败："}
              {toUserMessage(detail.error)}
              <Button onPress={() => void detail.refetch()}>重试详情</Button>
            </p>
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
        })
      }
      save={async (draft, snapshot) => {
        const savedId =
          id && record
            ? (await update.mutateAsync(updateWorkLogPayload(draft, snapshot, record)), id)
            : await create.mutateAsync(createWorkLogPayload(draft, projectId));
        onSaved?.(savedId);
      }}
      renderFields={(draft, edit, errors, pending) => (
        <WorkLogBusinessFields
          projectId={projectId}
          draft={draft}
          edit={(field, value) => {
            edit(field, value);
            if (field === "taskId") setTaskId(parseWorkLogId(value));
          }}
          errors={errors}
          pending={pending}
          editing={!!id}
        />
      )}
    />
  );
});
