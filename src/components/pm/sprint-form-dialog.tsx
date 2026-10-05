/**
 * 冲刺新建/编辑弹窗（P3：p3-sprint-list 冲刺列表与生命周期管理）。
 *
 * 字段（对标老前端 SprintList.vue 搜索/表单口径 + scope 要求）：
 * sprintName（必填）/ sprintGoal / plannedStartDate / plannedEndDate /
 * capacity / scrumMasterId / productOwnerId / teamSize。
 * 日期用 HTML date 输入（YYYY-MM-DD），提交时拼成后端 LocalDateTime
 * 'YYYY-MM-DDTHH:mm:ss'。
 *
 * 表单 UX 约定（用户硬性要求）：
 * - dirty check：useUnsavedChangesGuard(open && isDirty)，初始快照在挂载时
 *   捕获；blocker 独立于 AppModal 挂载，dialog 渲染在 AppModal 内；
 *   成功提交先 markClean() 再程序化关闭；提交在途（isPending）不允许关闭；
 * - 必填（红色星号 RequiredMark）：冲刺名称；字段级错误用 FieldError 挂在
 *   对应输入正下方，收集全部错误、编辑即清除；
 * - 日期互斥校验（结束不早于开始）、数字上限（Java Integer）同样挂字段错误。
 *
 * 父组件按 open/记录 key 重挂载本弹窗（与 BoardFormDialog 同一模式），
 * 因此 initialRef 快照只在挂载时捕获一次即可。
 */
import { useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  buildSprintCreatePayload,
  buildSprintUpdatePayload,
  emptySprintFormInput,
  validateSprintFormInput,
  type SprintFormInput,
} from "@/lib/sprint-form";
import type { SprintResponse } from "@/lib/api/sprint-types";
import { toUserMessage, useCreateSprint, useUpdateSprint } from "@/lib/query";

export function SprintFormDialog({
  open,
  projectId,
  mode,
  sprintId,
  initial = emptySprintFormInput(),
  /** 编辑模式时的原记录（r14 F2：用于识别被清空的字段，后端 null-skip 语义） */
  originalSprint,
  onClose,
}: {
  open: boolean;
  projectId: number;
  mode: "create" | "edit";
  /** 编辑模式时的冲刺 id */
  sprintId?: number;
  /** 初始表单值（create 传空表单，edit 传回填值） */
  initial?: SprintFormInput;
  originalSprint?: SprintResponse;
  onClose: () => void;
}) {
  const createSprint = useCreateSprint();
  const updateSprint = useUpdateSprint();
  const isPending = createSprint.isPending || updateSprint.isPending;

  const [form, setForm] = useState<SprintFormInput>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有）；dirty = 当前值偏离快照
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = JSON.stringify(initial);
  const isDirty = JSON.stringify(form) !== initialRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<SprintFormInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    // 编辑该字段时清除其字段级错误；服务端提交错误也在编辑后清除
    setSubmitError("");
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  };

  const doClose = () => {
    setForm(initial);
    setFieldErrors({});
    setSubmitError("");
    onClose();
  };

  const close = () => {
    // 请求进行中不允许关闭：旧请求的成功/失败回调会重置并关闭重新打开的弹窗，
    // 丢失用户正在填写的新草稿。AppModal 的关闭入口（X/遮罩/Escape）都走这里。
    if (isPending) return;
    // 用户主动关闭且表单脏时，先确认是否放弃修改
    guard(doClose);
  };

  const handleSubmit = () => {
    if (isPending) return;
    // 收集全部字段错误（不首错即停），一次更新错误集合
    // 编辑模式传入原记录：识别"清空了后端无法置空的字段"并给字段级错误（r14 F2）
    const errors = validateSprintFormInput(form, mode === "edit" ? originalSprint : undefined);
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    if (mode === "create") {
      createSprint.mutate(buildSprintCreatePayload(form, projectId), {
        onSuccess: (id) => {
          toast.success(`冲刺已创建（#${id}）`);
          // 成功 = 已授权离开：同步置位 cleanRef，避免守卫拦截自己的关闭
          markClean();
          // 成功关闭是程序化动作，直接 doClose（表单已提交，不算"放弃修改"）
          doClose();
        },
        onError: (error) => {
          setSubmitError(`创建失败：${toUserMessage(error)}`);
        },
      });
    } else {
      updateSprint.mutate(buildSprintUpdatePayload(form, sprintId as number, originalSprint), {
        onSuccess: () => {
          toast.success("冲刺已更新");
          markClean();
          doClose();
        },
        onError: (error) => {
          setSubmitError(`更新失败：${toUserMessage(error)}`);
        },
      });
    }
  };

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户
          作答的路由拦截，否则那次导航会永远挂起。 */}
      {blocker}
      <AppModal
        open={open}
        title={mode === "create" ? "新建冲刺" : "编辑冲刺"}
        onClose={close}
        size="md"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={form.sprintName}
              onChange={(value) => set({ sprintName: value })}
              isDisabled={isPending}
            >
              <Label>
                冲刺名称<RequiredMark />
              </Label>
              <Input placeholder="例如：Sprint 12 交付冲刺" maxLength={101} />
            </TextField>
            <FieldError message={fieldErrors.sprintName} />
          </div>
          <div>
            <TextField
              value={form.sprintGoal}
              onChange={(value) => set({ sprintGoal: value })}
              isDisabled={isPending}
            >
              <Label>冲刺目标</Label>
              <TextArea placeholder="本冲刺要达成的目标（可选）" rows={3} maxLength={501} />
            </TextField>
            <FieldError message={fieldErrors.sprintGoal} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <TextField
                value={form.plannedStartDate}
                onChange={(value) => set({ plannedStartDate: value })}
                isDisabled={isPending}
              >
                <Label>计划开始日期</Label>
                <Input type="date" />
              </TextField>
              <FieldError message={fieldErrors.plannedStartDate} />
            </div>
            <div>
              <TextField
                value={form.plannedEndDate}
                onChange={(value) => set({ plannedEndDate: value })}
                isDisabled={isPending}
              >
                <Label>计划结束日期</Label>
                <Input type="date" />
              </TextField>
              <FieldError message={fieldErrors.plannedEndDate} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <TextField
                value={form.capacity}
                onChange={(value) => set({ capacity: value })}
                isDisabled={isPending}
              >
                <Label>容量（人天）</Label>
                <Input inputMode="numeric" placeholder="可选" />
              </TextField>
              <FieldError message={fieldErrors.capacity} />
            </div>
            <div>
              <TextField
                value={form.teamSize}
                onChange={(value) => set({ teamSize: value })}
                isDisabled={isPending}
              >
                <Label>团队规模</Label>
                <Input inputMode="numeric" placeholder="可选" />
              </TextField>
              <FieldError message={fieldErrors.teamSize} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <TextField
                value={form.scrumMasterId}
                onChange={(value) => set({ scrumMasterId: value })}
                isDisabled={isPending}
              >
                <Label>Scrum Master 用户 ID</Label>
                <Input inputMode="numeric" placeholder="可选" />
              </TextField>
              <FieldError message={fieldErrors.scrumMasterId} />
            </div>
            <div>
              <TextField
                value={form.productOwnerId}
                onChange={(value) => set({ productOwnerId: value })}
                isDisabled={isPending}
              >
                <Label>产品负责人用户 ID</Label>
                <Input inputMode="numeric" placeholder="可选" />
              </TextField>
              <FieldError message={fieldErrors.productOwnerId} />
            </div>
          </div>
          {submitError ? (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
              {isPending ? <Spinner size="sm" /> : null}
              {mode === "create" ? "创建" : "保存"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
