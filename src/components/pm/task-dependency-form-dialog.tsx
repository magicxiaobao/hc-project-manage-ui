import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import {
  AppModal,
  OptionSelect,
  RequiredMark,
  FieldError,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  toUserMessage,
  useProjectAllTasks,
  useCheckCircularDependency,
  useCreateTaskDependency,
} from "@/lib/query";
import { DEPENDENCY_TYPES, isPositiveSafeId } from "@/lib/task-dependencies-live";
import {
  buildTaskDependencyPayload,
  clearDependencyFieldError,
  emptyTaskDependencyForm,
  validateTaskDependencyForm,
  type DependencyFieldErrors,
  type TaskDependencyFormInput,
} from "@/lib/task-dependency-form";

/** 父级按打开会话 key 重挂载；候选刷新不重置草稿。 */
export function TaskDependencyFormDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const candidatesQuery = useProjectAllTasks({
    projectId: isPositiveSafeId(projectId) ? projectId : null,
  });
  const candidates = (candidatesQuery.data ?? []).filter(
    (task) => isPositiveSafeId(task.id) && task.projectId === projectId,
  );
  const check = useCheckCircularDependency();
  const create = useCreateTaskDependency();
  const [form, setForm] = useState(emptyTaskDependencyForm);
  const snapshot = useRef(JSON.stringify(form));
  const [errors, setErrors] = useState<DependencyFieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [phase, setPhase] = useState<"idle" | "checking" | "creating">("idle");
  const locked = useRef(false);
  const mounted = useRef(true);
  const fieldsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = phase !== "idle";
  const { guard, dialog, blocker, markClean, cancelConfirm } = useUnsavedChangesGuard(
    JSON.stringify(form) !== snapshot.current,
  );
  const edit = (field: keyof TaskDependencyFormInput, value: string) => {
    if (locked.current) return;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearDependencyFieldError(current, field));
    setSubmitError("");
  };
  const close = () => {
    if (!locked.current) guard(onClose);
  };
  const submit = async () => {
    if (
      locked.current ||
      candidatesQuery.isPending ||
      candidatesQuery.isError ||
      !candidatesQuery.data
    )
      return;
    locked.current = true;
    const nextErrors = validateTaskDependencyForm(form, projectId, candidates);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length) {
      locked.current = false;
      const first = Object.keys(nextErrors)[0];
      fieldsRef.current
        ?.querySelector<HTMLElement>(
          `[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] button`,
        )
        ?.focus();
      return;
    }
    const payload = Object.freeze(buildTaskDependencyPayload(form, projectId));
    let checking = true;
    try {
      setPhase("checking");
      const circular = await check.mutateAsync(payload);
      // 用户已确认离开时，不再启动新的创建；已发出的写入由 hook 负责反馈与失效。
      if (!mounted.current) return;
      if (circular) {
        setErrors({ successorId: "该依赖会形成循环，无法创建" });
        setSubmitError("环检测发现循环，请调整前置或后置任务。");
        return;
      }
      checking = false;
      setPhase("creating");
      await create.mutateAsync(payload);
      if (!mounted.current) return;
      markClean();
      cancelConfirm();
      onCreated();
      onClose();
    } catch (error) {
      if (mounted.current)
        setSubmitError(`${checking ? "检查失败" : "创建失败"}：${toUserMessage(error)}`);
    } finally {
      locked.current = false;
      if (mounted.current) setPhase("idle");
    }
  };
  const options = candidates.map((task) => ({
    id: String(task.id),
    label: `#${task.id} ${task.title}`,
  }));
  return (
    <>
      {blocker}
      {dialog}
      <AppModal open title="新建任务依赖" onClose={close} size="md" isDismissDisabled={busy}>
        <div ref={fieldsRef} className="flex flex-col gap-4">
          {(["predecessorId", "successorId"] as const).map((field) => (
            <div key={field} data-field={field}>
              <Label className="mb-1 block">
                {field === "predecessorId" ? "前置任务" : "后置任务"}
                <RequiredMark />
              </Label>
              <OptionSelect
                label={field === "predecessorId" ? "前置任务" : "后置任务"}
                value={form[field]}
                options={[
                  { id: "", label: "请选择" },
                  ...options.filter(
                    (option) =>
                      option.id !==
                      form[field === "predecessorId" ? "successorId" : "predecessorId"],
                  ),
                ]}
                onChange={(value) => edit(field, value)}
                isDisabled={busy || candidatesQuery.isPending || candidatesQuery.isError}
              />
              <FieldError message={errors[field]} />
            </div>
          ))}
          {candidatesQuery.isPending ? <p>正在加载候选任务…</p> : null}
          {candidatesQuery.isError ? (
            <div role="alert" className="text-danger">
              候选任务加载失败：{toUserMessage(candidatesQuery.error)}
              <Button size="sm" variant="ghost" onPress={() => void candidatesQuery.refetch()}>
                重试候选任务
              </Button>
            </div>
          ) : null}
          <div data-field="dependencyType">
            <Label className="mb-1 block">
              依赖类型
              <RequiredMark />
            </Label>
            <OptionSelect
              label="依赖类型"
              value={form.dependencyType}
              options={[{ id: "", label: "请选择" }, ...DEPENDENCY_TYPES]}
              onChange={(value) => edit("dependencyType", value)}
              isDisabled={busy}
            />
            <FieldError message={errors.dependencyType} />
          </div>
          <div data-field="lag">
            <TextField value={form.lag} onChange={(value) => edit("lag", value)} isDisabled={busy}>
              <Label>
                延迟天数
                <RequiredMark />
              </Label>
              <Input inputMode="numeric" />
            </TextField>
            <FieldError message={errors.lag} />
            <p className="type-caption">单位：天，0 表示无延迟</p>
          </div>
          <div data-field="description">
            <TextField
              value={form.description}
              onChange={(value) => edit("description", value)}
              isDisabled={busy}
            >
              <Label>描述</Label>
              <TextArea rows={3} />
            </TextField>
            <FieldError message={errors.description} />
            <p className="type-caption">{form.description.trim().length}/1000 字符</p>
          </div>
          {submitError ? (
            <p role="alert" className="text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={busy}>
              取消
            </Button>
            <Button
              variant="primary"
              onPress={() => void submit()}
              isDisabled={busy || candidatesQuery.isPending || candidatesQuery.isError}
            >
              {busy ? <Spinner size="sm" /> : null}
              {phase === "checking" ? "检查中…" : phase === "creating" ? "创建中…" : "创建"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
