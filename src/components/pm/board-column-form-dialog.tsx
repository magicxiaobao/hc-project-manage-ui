/**
 * 看板列新建/编辑弹窗（P3：p3-board-kanban）。
 *
 * 表单 UX 约定（用户硬性要求）：
 * - dirty check：useUnsavedChangesGuard(open && isDirty)；blocker 独立于
 *   AppModal 挂载，dialog（确认框）渲染在 AppModal 内；成功提交先 markClean()
 *   再程序化关闭；提交在途（isPending）时不允许关闭；
 * - 必填（红色星号 RequiredMark）：列名称；字段级错误用 FieldError 挂在对应
 *   输入正下方，收集全部错误、编辑即清除；
 * - 映射任务状态为可选下拉（空=不映射该列任务，后端 taskStatus=null 时
 *   columnsWithTasks 该列 tasks 为空）；WIP 上限/颜色可选。
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
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { statusLabel } from "@/lib/pm/domain";
import {
  buildBoardColumnCreatePayload,
  buildBoardColumnUpdatePayload,
  emptyBoardColumnFormInput,
  validateBoardColumnFormInput,
  type BoardColumnFormInput,
} from "@/lib/board-column-form";
import { TASK_STATUSES } from "@/lib/api/task-types";
import {
  toUserMessage,
  useCreateBoardColumn,
  useUpdateBoardColumn,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const TASK_STATUS_OPTIONS = [
  { id: "", label: "不映射任务状态" },
  ...TASK_STATUSES.map((status) => ({
    id: status,
    label: `${statusLabel("task", status)}（${status}）`,
  })),
];

/** 常用列颜色（后端 color 为自由十六进制串，前端只做选项约束） */
const COLOR_PRESETS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#6B7280"];

export function BoardColumnFormDialog({
  open,
  boardId,
  mode,
  columnId,
  initial = emptyBoardColumnFormInput(),
  onClose,
}: {
  open: boolean;
  boardId: number;
  mode: "create" | "edit";
  /** 编辑模式时的看板列 id */
  columnId?: number;
  /** 初始表单值（create 传空表单，edit 传回填值） */
  initial?: BoardColumnFormInput;
  onClose: () => void;
}) {
  const createColumn = useCreateBoardColumn();
  const updateColumn = useUpdateBoardColumn();
  const isPending = createColumn.isPending || updateColumn.isPending;

  const [form, setForm] = useState<BoardColumnFormInput>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有）；dirty = 当前值偏离快照
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = JSON.stringify(initial);
  const isDirty = JSON.stringify(form) !== initialRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<BoardColumnFormInput>) => {
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
    const errors = validateBoardColumnFormInput(form);
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    if (mode === "create") {
      createColumn.mutate(buildBoardColumnCreatePayload(form, boardId), {
        onSuccess: (id) => {
          toast.success(`看板列已创建（#${id}）`);
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
      updateColumn.mutate(buildBoardColumnUpdatePayload(form, columnId as number), {
        onSuccess: () => {
          toast.success("看板列已更新");
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
        title={mode === "create" ? "新建看板列" : "编辑看板列"}
        onClose={close}
        size="md"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={form.columnName}
              onChange={(value) => set({ columnName: value })}
              isDisabled={isPending}
            >
              <Label>
                列名称<RequiredMark />
              </Label>
              <Input placeholder="例如：待开发" maxLength={101} />
            </TextField>
            <FieldError message={fieldErrors.columnName} />
          </div>
          <div>
            <Label className="mb-1 block">映射任务状态</Label>
            <OptionSelect
              label="映射任务状态"
              value={form.taskStatus}
              options={TASK_STATUS_OPTIONS}
              onChange={(value) => set({ taskStatus: value })}
              isDisabled={isPending}
            />
            <FieldError message={fieldErrors.taskStatus} />
            <p className="type-caption mt-1 text-default-500">
              列按此状态聚合任务（后端 columnsWithTasks 按 taskStatus 查任务）。
              不映射的列不显示任何卡片。
              <span className="text-warning">
                后端当前版本暂不支持保存该映射，列暂不聚合卡片。
              </span>
            </p>
          </div>
          <div>
            <TextField
              value={form.description}
              onChange={(value) => set({ description: value })}
              isDisabled={isPending}
            >
              <Label>描述</Label>
              <TextArea placeholder="列的说明（可选）" rows={2} maxLength={501} />
            </TextField>
            <FieldError message={fieldErrors.description} />
            <p className="type-caption mt-1 text-default-500">
              <span className="text-warning">
                后端当前版本暂不支持保存列描述。
              </span>
            </p>
          </div>
          <div>
            <TextField
              value={form.wipLimit}
              onChange={(value) => set({ wipLimit: value })}
              isDisabled={isPending}
            >
              <Label>WIP 上限</Label>
              <Input placeholder="不填表示不限制" inputMode="numeric" />
            </TextField>
            <FieldError message={fieldErrors.wipLimit} />
            <p className="type-caption mt-1 text-default-500">
              仅展示用途：列头显示「当前数/上限」，超限标红，不拦截拖拽。
            </p>
          </div>
          <div>
            <TextField
              value={form.color}
              onChange={(value) => set({ color: value })}
              isDisabled={isPending}
            >
              <Label>列颜色</Label>
              <Input placeholder="#3B82F6（可选）" maxLength={7} />
            </TextField>
            <FieldError message={fieldErrors.color} />
            <p className="type-caption mt-1 text-default-500">
              <span className="text-warning">
                后端当前版本暂不支持保存列颜色，列头暂显示默认色。
              </span>
            </p>
            <div className="mt-2 flex items-center gap-2" role="group" aria-label="常用颜色">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`选择颜色 ${preset}`}
                  aria-pressed={form.color.trim().toUpperCase() === preset}
                  disabled={isPending}
                  onClick={() => set({ color: preset })}
                  className={cn(
                    "size-6 rounded-full border",
                    form.color.trim().toUpperCase() === preset
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border",
                  )}
                  style={{ backgroundColor: preset }}
                />
              ))}
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
