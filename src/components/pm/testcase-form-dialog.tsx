/**
 * 测试用例新建/编辑弹窗（P2：p2-testcase-list-detail）。
 *
 * 登录态纯展示组件：
 * - mode='create'：新建弹窗，表单字段按后端 TestCaseCreateRequest；提交走
 *   POST /testCase/v1/createTestCase（useCreateTestCase），成功后 toast + 关闭，
 *   列表缓存已失效
 * - mode='edit'：编辑弹窗，initial 由调用方从 TestCaseResponse 回填
 *   （editFormFromTestCase）；提交走 POST /testCase/v1/updateTestCase
 *   （useUpdateTestCase）。更新不承载 verifiesRequirementIds（更新接口收到会
 *   静默忽略，见 src/lib/api/testCase-types.ts）
 * - 必填（红色星号 RequiredMark）：标题/用例编号/测试类型/优先级/状态/
 *   测试步骤/期望结果；字段级错误用 FieldError 挂在对应输入正下方，
 *   编辑该字段时清除其错误
 * - dirty check：useUnsavedChangesGuard(open && isDirty)；blocker 独立于
 *   AppModal 挂载（沿用 defect-create-dialog 的 P2 经验：提交成功关闭不能卸载
 *   正在等待作答的路由拦截）；请求进行中不允许关闭（回调会重置关闭后重开的弹窗）
 *
 * 未登录走演示创建流程时不使用本组件。
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
  useCreateTestCase,
  useUpdateTestCase,
} from "@/lib/query";
import {
  buildTestCaseCreatePayload,
  buildTestCaseUpdatePayload,
  validateTestCaseFormInput,
} from "@/lib/testcase-form";
import type { TestCaseFormInput } from "@/lib/testcase-form";
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUS_LABELS,
  TEST_CASE_TYPES,
} from "@/lib/api/testCase-types";

const TYPE_OPTIONS = TEST_CASE_TYPES.map((type) => ({ id: type, label: type }));
const PRIORITY_OPTIONS = TEST_CASE_PRIORITIES.map((priority) => ({
  id: priority,
  label: priority,
}));
const STATUS_OPTIONS = (["DRAFT", "ACTIVE", "REVIEW"] as const).map((status) => ({
  id: status,
  label: TEST_CASE_STATUS_LABELS[status],
}));

export function TestCaseFormDialog({
  open,
  projectId,
  mode,
  testCaseId,
  initial,
  onClose,
}: {
  open: boolean;
  projectId: number;
  mode: "create" | "edit";
  /** 编辑模式时的用例 id */
  testCaseId?: number;
  /** 初始表单值（create 时传 emptyTestCaseFormInput()，edit 时传回填值） */
  initial: TestCaseFormInput;
  onClose: () => void;
}) {
  const createTestCase = useCreateTestCase();
  const updateTestCase = useUpdateTestCase();
  const isPending = createTestCase.isPending || updateTestCase.isPending;

  const [form, setForm] = useState<TestCaseFormInput>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有）；dirty = 当前值偏离快照
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = JSON.stringify(initial);
  const isDirty = JSON.stringify(form) !== initialRef.current;
  // 弹窗打开且脏时才布防：同时拦截浏览器后退/刷新/关标签页（P1 finding）
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && isDirty);

  const set = (patch: Partial<TestCaseFormInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    // 编辑该字段时清除其字段级错误
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
    const errors = validateTestCaseFormInput(form, {
      includeVerifiesRequirementIds: mode === "create",
    });
    if (errors.length > 0) {
      const nextFieldErrors: Record<string, string> = {};
      for (const error of errors) nextFieldErrors[error.field] = error.message;
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitError("");
    if (mode === "create") {
      createTestCase.mutate(buildTestCaseCreatePayload(form, projectId), {
        onSuccess: (id) => {
          toast.success(`测试用例已创建（#${id}）`);
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
      updateTestCase.mutate(
        buildTestCaseUpdatePayload(testCaseId as number, form),
        {
          onSuccess: () => {
            toast.success("测试用例已更新");
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
        title={mode === "create" ? "新建测试用例" : "编辑测试用例"}
        onClose={close}
        size="lg"
      >
        {dialog}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                value={form.title}
                onChange={(next) => set({ title: next })}
                aria-label="标题"
              >
                <Label>
                  标题<RequiredMark />
                </Label>
                <Input placeholder="用例标题" />
              </TextField>
              <FieldError message={fieldErrors.title} />
            </div>
            <div>
              <TextField
                value={form.caseNumber}
                onChange={(next) => set({ caseNumber: next })}
                aria-label="用例编号"
              >
                <Label>
                  用例编号<RequiredMark />
                </Label>
                <Input placeholder="如 TC-001（字母/数字/下划线/连字符）" />
              </TextField>
              <FieldError message={fieldErrors.caseNumber} />
            </div>
          </div>

          <div>
            <TextField
              value={form.description}
              onChange={(next) => set({ description: next })}
              aria-label="描述"
            >
              <Label>描述</Label>
              <TextArea rows={2} placeholder="用例描述" />
            </TextField>
            <FieldError message={fieldErrors.description} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label>
                测试类型<RequiredMark />
              </Label>
              <OptionSelect
                label="测试类型（必填）"
                value={form.testType}
                options={TYPE_OPTIONS}
                onChange={(next) => set({ testType: next })}
              />
              <FieldError message={fieldErrors.testType} />
            </div>
            <div>
              <Label>
                优先级<RequiredMark />
              </Label>
              <OptionSelect
                label="优先级（必填）"
                value={form.priority}
                options={PRIORITY_OPTIONS}
                onChange={(next) => set({ priority: next })}
              />
              <FieldError message={fieldErrors.priority} />
            </div>
            <div>
              <Label>
                状态<RequiredMark />
              </Label>
              <OptionSelect
                label="状态（必填）"
                value={form.status}
                options={STATUS_OPTIONS}
                onChange={(next) => set({ status: next })}
              />
              <FieldError message={fieldErrors.status} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <TextField
                value={form.assigneeId}
                onChange={(next) => set({ assigneeId: next })}
                aria-label="负责人 ID"
              >
                <Label>负责人 ID</Label>
                <Input placeholder="留空=未设置，正整数" />
              </TextField>
              <FieldError message={fieldErrors.assigneeId} />
            </div>
            <div>
              <TextField
                value={form.estimatedDuration}
                onChange={(next) => set({ estimatedDuration: next })}
                aria-label="预计时长（分钟）"
              >
                <Label>预计时长（分钟）</Label>
                <Input placeholder="1-480 的整数，留空=未设置" />
              </TextField>
              <FieldError message={fieldErrors.estimatedDuration} />
            </div>
          </div>

          <div>
            <TextField
              value={form.preconditions}
              onChange={(next) => set({ preconditions: next })}
              aria-label="前置条件"
            >
              <Label>前置条件</Label>
              <TextArea rows={2} placeholder="执行用例前需要满足的条件" />
            </TextField>
          </div>

          <div>
            <TextField
              value={form.testSteps}
              onChange={(next) => set({ testSteps: next })}
              aria-label="测试步骤"
            >
              <Label>
                测试步骤<RequiredMark />
              </Label>
              <TextArea rows={4} placeholder="一步一步说明如何执行" />
            </TextField>
            <FieldError message={fieldErrors.testSteps} />
          </div>

          <div>
            <TextField
              value={form.expectedResult}
              onChange={(next) => set({ expectedResult: next })}
              aria-label="期望结果"
            >
              <Label>
                期望结果<RequiredMark />
              </Label>
              <TextArea rows={3} placeholder="期望的行为/输出" />
            </TextField>
            <FieldError message={fieldErrors.expectedResult} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              value={form.testData}
              onChange={(next) => set({ testData: next })}
              aria-label="测试数据"
            >
              <Label>测试数据</Label>
              <TextArea rows={2} placeholder="执行所需的测试数据" />
            </TextField>
            <TextField
              value={form.environmentRequirements}
              onChange={(next) => set({ environmentRequirements: next })}
              aria-label="环境要求"
            >
              <Label>环境要求</Label>
              <TextArea rows={2} placeholder="如 测试环境 / 预发" />
            </TextField>
          </div>

          <TextField
            value={form.tags}
            onChange={(next) => set({ tags: next })}
            aria-label="标签"
          >
            <Label>标签</Label>
            <Input placeholder="标签" />
          </TextField>

          {mode === "create" ? (
            <div>
              <TextField
                value={form.verifiesRequirementIdsText}
                onChange={(next) => set({ verifiesRequirementIdsText: next })}
                aria-label="验证需求 ID"
              >
                <Label>验证需求 ID</Label>
                <Input placeholder="按 ID 添加验证的需求，逗号分隔，如 12,34" />
              </TextField>
              <FieldError message={fieldErrors.verifiesRequirementIdsText} />
            </div>
          ) : null}

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
