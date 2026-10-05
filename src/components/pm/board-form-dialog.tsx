/**
 * 看板新建/编辑弹窗（P3：p3-board-manage）。
 *
 * 表单 UX 约定（用户硬性要求）：
 * - dirty check：useUnsavedChangesGuard(open && isDirty)；blocker 独立于
 *   AppModal 挂载，dialog（确认框）渲染在 AppModal 内；成功提交先 markClean()
 *   再程序化关闭；提交在途（isPending）时不允许关闭；
 * - 必填（红色星号 RequiredMark）：看板名称；字段级错误用 FieldError 挂在对应
 *   输入正下方，收集全部错误、编辑即清除；
 * - 下拉类控件（OptionSelect）的 label 带"（必填）"口径——本表单看板类型为
 *   可选项，不带必填标记；无"不指定"选项（后端 update 无置空语义，避免误导）。
 * - 看板公开性 / WIP 开关：复选框，初始值与后端实体默认值对齐
 *   （isPublic=true、wipEnabled=false）。
 *
 * 父组件按 open/记录 key 重挂载本弹窗（与 TestCaseFormDialog 同一模式），
 * 因此 initialRef 快照只在挂载时捕获一次即可。
 */
import { useRef, useState } from "react";
import { Button, Checkbox, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  BOARD_TYPES,
  buildBoardCreatePayload,
  buildBoardUpdatePayload,
  emptyBoardFormInput,
  validateBoardFormInput,
  type BoardFormInput,
} from "@/lib/board-form";
import { toUserMessage, useCreateBoard, useUpdateBoard } from "@/lib/query";

// 注意：不提供"不指定"选项。后端 update 按 Optional.ofNullable().ifPresent
// 跳过 null/缺失字段，无置空语义；编辑时选"不指定"只会静默保留旧值，
// 与用户预期不一致。新建时未选择则省略，后端走默认值"Kanban看板"。
const BOARD_TYPE_OPTIONS = BOARD_TYPES.map((type) => ({ id: type, label: type }));

export function BoardFormDialog({
  open,
  projectId,
  mode,
  boardId,
  initial = emptyBoardFormInput(),
  onClose,
}: {
  open: boolean;
  projectId: number;
  mode: "create" | "edit";
  /** 编辑模式时的看板 id */
  boardId?: number;
  /** 初始表单值（create 传空表单，edit 传回填值） */
  initial?: BoardFormInput;
  onClose: () => void;
}) {
  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const isPending = createBoard.isPending || updateBoard.isPending;

  const [form, setForm] = useState<BoardFormInput>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有）；dirty = 当前值偏离快照
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = JSON.stringify(initial);
  const isDirty = JSON.stringify(form) !== initialRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<BoardFormInput>) => {
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
    const errors = validateBoardFormInput(form);
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    if (mode === "create") {
      createBoard.mutate(buildBoardCreatePayload(form, projectId), {
        onSuccess: (id) => {
          toast.success(`看板已创建（#${id}）`);
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
      updateBoard.mutate(buildBoardUpdatePayload(form, boardId as number), {
        onSuccess: () => {
          toast.success("看板已更新");
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
        title={mode === "create" ? "新建看板" : "编辑看板"}
        onClose={close}
        size="md"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={form.boardName}
              onChange={(value) => set({ boardName: value })}
              isDisabled={isPending}
            >
              <Label>
                看板名称<RequiredMark />
              </Label>
              <Input placeholder="例如：Sprint 12 交付看板" maxLength={101} />
            </TextField>
            <FieldError message={fieldErrors.boardName} />
          </div>
          <div>
            <TextField
              value={form.description}
              onChange={(value) => set({ description: value })}
              isDisabled={isPending}
            >
              <Label>描述</Label>
              <TextArea placeholder="看板的用途说明（可选）" rows={3} maxLength={501} />
            </TextField>
            <FieldError message={fieldErrors.description} />
          </div>
          <div>
            <Label className="mb-1 block">看板类型</Label>
            <OptionSelect
              label="看板类型"
              value={form.boardType}
              options={BOARD_TYPE_OPTIONS}
              onChange={(value) => set({ boardType: value })}
              isDisabled={isPending}
            />
            <FieldError message={fieldErrors.boardType} />
          </div>
          {/* 设为默认不属于表单：后端 create/update 不清除项目内其它默认看板，
              只有 setDefaultBoard 会；表单里直接勾选会产生多个默认看板。
              改走行操作的"设为默认"。 */}
          <Checkbox
            isSelected={form.isPublic}
            onChange={(selected) => set({ isPublic: selected })}
            isDisabled={isPending}
          >
            <span className="type-body">公开看板（项目成员可见）</span>
          </Checkbox>
          <Checkbox
            isSelected={form.wipEnabled}
            onChange={(selected) => set({ wipEnabled: selected })}
            isDisabled={isPending}
          >
            <span className="type-body">启用 WIP 在制品限制</span>
          </Checkbox>
          {/* Codex review 4183634413：后端未消费看板级 wipEnabled，老前端也只按列
              wipLimit 展示；按开关隐藏会让存量看板（默认 false）的列上限全部消失 */}
          <p className="type-caption -mt-2 text-default-500">
            目前仅保存设置；列的 WIP 显示由各列的上限决定。
          </p>
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
              isDisabled={isPending}
            >
              {isPending ? <Spinner size="sm" /> : null}
              {mode === "create" ? "创建" : "保存"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
