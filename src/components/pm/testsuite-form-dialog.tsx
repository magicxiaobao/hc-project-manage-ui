/**
 * 测试套件新建/编辑弹窗（P2：p2-testsuite-live）。
 *
 * 登录态纯展示组件：
 * - mode='create'：新建弹窗，表单字段按后端 TestSuiteCreateRequest；提交走
 *   POST /testSuite/v1/createTestSuite（useCreateTestSuite），成功后 toast + 关闭，
 *   列表缓存已失效
 * - mode='edit'：编辑弹窗，initial 由调用方从 TestSuiteResponse 回填
 *   （editFormFromTestSuite）；提交走 POST /testSuite/v1/updateTestSuite
 *   （useUpdateTestSuite）。更新为字段级更新，统计字段/审计字段不进表单
 * - 必填（红色星号 RequiredMark）：套件名称/套件类型/状态/优先级；
 *   字段级错误用 FieldError 挂在对应输入正下方，编辑该字段时清除其错误
 * - dirty check：useUnsavedChangesGuard(open && isDirty)；blocker 独立于
 *   AppModal 挂载（沿用 defect-create-dialog 的 P2 经验：提交成功关闭不能卸载
 *   正在等待作答的路由拦截）；请求进行中不允许关闭（回调会重置关闭后重开的弹窗）
 *
 * 未登录走演示测试视图（TestsView）时不使用本组件。
 */
import { useRef, useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  toUserMessage,
  useCreateTestSuite,
  useUpdateTestSuite,
} from "@/lib/query";
import {
  buildTestSuiteCreatePayload,
  buildTestSuiteUpdatePayload,
  validateTestSuiteFormInput,
} from "@/lib/testsuite-form";
import type { TestSuiteFormInput } from "@/lib/testsuite-form";
import {
  TEST_SUITE_PRIORITIES,
  TEST_SUITE_STATUS_LABELS,
  TEST_SUITE_STATUSES,
  TEST_SUITE_TYPES,
} from "@/lib/api/testSuite-types";

const TYPE_OPTIONS = TEST_SUITE_TYPES.map((type) => ({ id: type, label: type }));
const STATUS_OPTIONS = TEST_SUITE_STATUSES.map((status) => ({
  id: status,
  label: TEST_SUITE_STATUS_LABELS[status],
}));
const PRIORITY_OPTIONS = TEST_SUITE_PRIORITIES.map((priority) => ({
  id: priority,
  label: priority,
}));

export function TestSuiteFormDialog({
  open,
  projectId,
  mode,
  testSuiteId,
  initial,
  onClose,
}: {
  open: boolean;
  projectId: number;
  mode: "create" | "edit";
  /** 编辑模式时的套件 id */
  testSuiteId?: number;
  /** 初始表单值（create 时传 emptyTestSuiteFormInput()，edit 时传回填值） */
  initial: TestSuiteFormInput;
  onClose: () => void;
}) {
  const createTestSuite = useCreateTestSuite();
  const updateTestSuite = useUpdateTestSuite();
  const isPending = createTestSuite.isPending || updateTestSuite.isPending;

  const [form, setForm] = useState<TestSuiteFormInput>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有）；dirty = 当前值偏离快照
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = JSON.stringify(initial);
  const isDirty = JSON.stringify(form) !== initialRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页（P1 finding）
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<TestSuiteFormInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    // 编辑该字段时清除其字段级错误；服务端提交错误也在编辑后清除，
    // 避免旧错残留误导（pi NOTE-7）
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
    // 收集全部字段错误，不首错即停；一次更新错误集合
    const errors = validateTestSuiteFormInput(form, {
      // 编辑模式：清空已有耗时按 testCase 同口径显式拒绝（codex r4 P2）
      originalEstimatedTime: mode === "edit" ? initial.estimatedTime : undefined,
      originalActualTime: mode === "edit" ? initial.actualTime : undefined,
    });
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    if (mode === "create") {
      createTestSuite.mutate(buildTestSuiteCreatePayload(form, projectId), {
        onSuccess: (id) => {
          toast.success(`测试套件已创建（#${id}）`);
          // 成功 = 已授权离开：同步置位 cleanRef（defect-create-dialog 同一模式）
          markClean();
          // 成功关闭是程序化动作，直接 doClose（表单已提交，不算"放弃修改"）
          doClose();
        },
        onError: (error) => {
          setSubmitError(`创建失败：${toUserMessage(error)}`);
        },
      });
    } else {
      updateTestSuite.mutate(
        buildTestSuiteUpdatePayload(testSuiteId as number, form),
        {
          onSuccess: () => {
            toast.success("测试套件已更新");
            markClean();
            doClose();
          },
          onError: (error) => {
            setSubmitError(`更新失败：${toUserMessage(error)}`);
          },
        },
      );
    }
  };

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户
          作答的路由拦截，否则那次导航会永远挂起（P2）。 */}
      {blocker}
      <AppModal
        open={open}
        title={mode === "create" ? "新建测试套件" : "编辑测试套件"}
        onClose={close}
        size="lg"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              isDisabled={isPending}
              value={form.suiteName}
              onChange={(next) => set({ suiteName: next })}
              aria-label="套件名称"
            >
              <Label>
                套件名称<RequiredMark />
              </Label>
              <Input placeholder="套件名称（2-100 个字符）" />
            </TextField>
            <FieldError message={fieldErrors.suiteName} />
          </div>

          <div>
            <TextField
              isDisabled={isPending}
              value={form.description}
              onChange={(next) => set({ description: next })}
              aria-label="描述"
            >
              <Label>描述</Label>
              <TextArea rows={3} placeholder="套件描述" />
            </TextField>
            <FieldError message={fieldErrors.description} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label>
                套件类型<RequiredMark />
              </Label>
              <OptionSelect
                isDisabled={isPending}
                label="套件类型（必填）"
                value={form.suiteType}
                options={TYPE_OPTIONS}
                onChange={(next) => set({ suiteType: next })}
              />
              <FieldError message={fieldErrors.suiteType} />
            </div>
            <div>
              <Label>
                状态<RequiredMark />
              </Label>
              <OptionSelect
                isDisabled={isPending}
                label="状态（必填）"
                value={form.status}
                options={STATUS_OPTIONS}
                onChange={(next) => set({ status: next })}
              />
              <FieldError message={fieldErrors.status} />
            </div>
            <div>
              <Label>
                优先级<RequiredMark />
              </Label>
              <OptionSelect
                isDisabled={isPending}
                label="优先级（必填）"
                value={form.priority}
                options={PRIORITY_OPTIONS}
                onChange={(next) => set({ priority: next })}
              />
              <FieldError message={fieldErrors.priority} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                isDisabled={isPending}
                value={form.estimatedTime}
                onChange={(next) => set({ estimatedTime: next })}
                aria-label="预计耗时（分钟）"
              >
                <Label>预计耗时（分钟）</Label>
                <Input
                  placeholder={
                    mode === "edit" && initial.estimatedTime.trim() !== ""
                      ? "正整数（更新契约不支持清空已有值）"
                      : "正整数，留空=未设置"
                  }
                />
              </TextField>
              <FieldError message={fieldErrors.estimatedTime} />
            </div>
            <div>
              <TextField
                isDisabled={isPending}
                value={form.actualTime}
                onChange={(next) => set({ actualTime: next })}
                aria-label="实际耗时（分钟）"
              >
                <Label>实际耗时（分钟）</Label>
                <Input
                  placeholder={
                    mode === "edit" && initial.actualTime.trim() !== ""
                      ? "正整数（更新契约不支持清空已有值）"
                      : "正整数，留空=未设置"
                  }
                />
              </TextField>
              <FieldError message={fieldErrors.actualTime} />
            </div>
          </div>

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
              {isPending ? "提交中…" : mode === "create" ? "创建" : "保存"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
